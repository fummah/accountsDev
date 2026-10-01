/**
 * verify-bank-statements.js ??? the improved Bank Statements module.
 *
 * Proves:
 *   ??? the model stores bank_account_id / balances / statuses and computes
 *     transaction / matched / unmatched counts,
 *   ??? importing a statement creates NO journal entry (source data only),
 *   ??? reprocess is idempotent (no duplicate lines),
 *   ??? duplicate detection by file hash and by bank account + period,
 *   ??? match / unmatch / categorize work and never delete accounting records,
 *   ??? reconciled statements are protected from deletion,
 *   ??? the whole bridge (preload method + IPC handler) is wired.
 *
 * Runs on a SCRATCH COPY.
 */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-bank-statements' });

const path = require('path');
const fs = require('fs');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
const BE = path.join(ROOT, 'src', 'backend');
const FE = path.join(ROOT, 'src', 'frontend', 'src');

let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  -> ${d}` : ''}`); } };
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

// ?????? Stub electron (capture bridge + handlers) ?????????????????????????????????????????????????????????????????????????????????????????????
const bridge = {};
const invoked = [];
const handlers = new Map();
const electronStub = {
  contextBridge: { exposeInMainWorld: (n, a) => { bridge[n] = a; } },
  ipcRenderer: { invoke: (ch) => { invoked.push(ch); return Promise.resolve({}); }, on() {}, send() {}, removeAllListeners() {}, sendSync() {} },
  ipcMain: { handle: (ch, fn) => { handlers.set(ch, fn); } },
  webUtils: { getPathForFile: () => '' },
  shell: { openExternal() {} },
};
const origLoad = Module._load;
Module._load = function (request) { if (request === 'electron') return electronStub; return origLoad.apply(this, arguments); };

require(path.join(BE, 'preload.js'));
require(path.join(BE, 'handlers', 'bankStatementHandlers.js'))();

const db = require(path.join(BE, 'models', 'dbmgr.js')).raw;
const ParsedStatements = require(path.join(BE, 'models', 'parsedStatements.js'));

const journalCount = () => db.prepare('SELECT COUNT(*) AS c FROM journal_entries').get().c;

(async () => {
  // A real Bank account to link to.
  const bank = db.prepare("INSERT INTO chart_of_accounts (name, type, subType, number, normalBalance, status, isSystem) VALUES ('ZZ Test Bank','Bank','Bank','1099','Debit','Active',0)").run();
  const bankAccountId = Number(bank.lastInsertRowid);
  const exp = db.prepare("INSERT INTO chart_of_accounts (name, type, subType, number, normalBalance, status, isSystem) VALUES ('ZZ Bank Fees','Expense','Bank Fees','6999','Debit','Active',0)").run();
  const expenseAccountId = Number(exp.lastInsertRowid);

  console.log('\n=== import is SOURCE data (no journal) ===');
  const jBefore = journalCount();
  const st = ParsedStatements.createStatement({
    bankName: 'ZZ Bank', periodStart: '2026-09-01', periodEnd: '2026-09-30', currency: 'ZAR',
    bankAccountId, openingBalance: 45200, closingBalance: 52840, sourceFile: 'ZZ_Sep.pdf', fileHash: 'hash-zz-1',
  });
  const stmtId = Number(st.id);
  const rows = [
    { date: '2026-09-05', description: 'ACME CLIENT EFT', amount: 5000, type: 'credit', reference: 'REF92834', runningBalance: 50200 },
    { date: '2026-09-06', description: 'BANK FEE', amount: -120, type: 'debit', reference: 'FEE1', runningBalance: 50080 },
    { date: '2026-09-07', description: 'SUPPLIER PAYMENT', amount: -1000, type: 'debit', reference: 'PMT9', runningBalance: 49080 },
  ];
  const ins = ParsedStatements.insertTransactions(stmtId, rows);
  check('statement created and lines inserted', ins.success && ins.inserted === 3, JSON.stringify(ins));
  check('importing a statement creates NO journal entry', journalCount() === jBefore, `${jBefore} ??? ${journalCount()}`);

  console.log('\n=== counts / balances ===');
  const detail = ParsedStatements.getStatementWithTransactions(stmtId);
  check('transaction count correct', detail.transactionCount === 3);
  check('money in correct (5000)', near(detail.moneyIn, 5000));
  check('money out correct (1120)', near(detail.moneyOut, 1120));
  check('unmatched count = all lines initially', detail.unmatched === 3);
  check('bank account linked by id', Number(detail.bank_account_id) === bankAccountId);
  check('opening/closing balances stored', near(detail.opening_balance, 45200) && near(detail.closing_balance, 52840));
  check('bank account name resolved from the account', !!detail.bank_account_name);

  console.log('\n=== reprocess idempotency ===');
  const ins2 = ParsedStatements.insertTransactions(stmtId, rows);
  check('re-inserting the same lines is a no-op', ins2.inserted === 0 && ins2.skipped === 3, JSON.stringify(ins2));
  check('line count unchanged after reprocess', ParsedStatements.getStatementWithTransactions(stmtId).transactionCount === 3);

  console.log('\n=== duplicate statement detection ===');
  check('duplicate by file hash detected', ParsedStatements.findDuplicate({ fileHash: 'hash-zz-1' }).duplicate === true);
  check('duplicate by bank account + period detected', ParsedStatements.findDuplicate({ bankAccountId, periodStart: '2026-09-01', periodEnd: '2026-09-30' }).duplicate === true);
  check('a different period is NOT a duplicate', ParsedStatements.findDuplicate({ bankAccountId, periodStart: '2026-08-01', periodEnd: '2026-08-31' }).duplicate === false);

  console.log('\n=== match / unmatch / categorize ===');
  const lines = detail.transactions;
  const feeLine = lines.find((l) => l.description === 'BANK FEE');
  const payLine = lines.find((l) => l.description === 'SUPPLIER PAYMENT');
  ParsedStatements.categorizeLine(feeLine.id, expenseAccountId);
  check('categorize sets the account and clears unmatched', ParsedStatements.getStatementWithTransactions(stmtId).unmatched === 2);
  ParsedStatements.matchLine(payLine.id, { matchedType: 'transaction', matchedId: 4242 });
  const afterMatch = ParsedStatements.getStatementWithTransactions(stmtId);
  const pay = afterMatch.transactions.find((l) => l.id === payLine.id);
  check('match stores matched_type + matched_id', pay.matched === 1 && pay.matched_type === 'transaction' && Number(pay.matched_id) === 4242);
  check('matched count reflects the link', afterMatch.matched === 1);
  ParsedStatements.unmatchLine(payLine.id);
  check('unmatch removes the relationship only (line still exists)', (() => {
    const a = ParsedStatements.getStatementWithTransactions(stmtId);
    const p = a.transactions.find((l) => l.id === payLine.id);
    return p && p.matched === 0 && p.matched_id == null && a.transactions.length === 3;
  })());

  console.log('\n=== summary ===');
  const sum = ParsedStatements.getSummary();
  check('summary totals are company-wide and numeric', sum.totalStatements >= 1 && sum.importedTransactions >= 3 && sum.unmatchedTransactions >= 1);
  check('summary reports reconciled count', typeof sum.reconciledStatements === 'number');

  console.log('\n=== delete protection ===');
  ParsedStatements.setReconciliation(stmtId, { reconciliationId: 777, status: 'Reconciled' });
  const delRecon = ParsedStatements.deleteStatement(stmtId);
  check('deleting a reconciled statement is blocked', delRecon.success === false && delRecon.protected === true, JSON.stringify(delRecon));
  ParsedStatements.setReconciliation(stmtId, { reconciliationId: null, status: 'Not Reconciled' });
  const delOk = ParsedStatements.deleteStatement(stmtId);
  check('deleting an unreconciled statement removes source data', delOk.success === true);
  check('the statement is gone', ParsedStatements.getStatementWithTransactions(stmtId) === null);

  console.log('\n=== bridge connection (renderer ??? preload ??? IPC ??? service) ===');
  const api = bridge.electronAPI || {};
  const required = [
    ['getBankStatementsSummary', 'bank-statements-summary'],
    ['checkBankStatementDuplicate', 'bank-statement-duplicate-check'],
    ['linkBankStatementAccount', 'bank-statement-link-account'],
    ['setBankStatementStatus', 'bank-statement-set-status'],
    ['matchBankStatementLine', 'bank-statement-match-line'],
    ['unmatchBankStatementLine', 'bank-statement-unmatch-line'],
    ['categorizeBankStatementLine', 'bank-statement-categorize-line'],
    ['setBankStatementReconciliation', 'bank-statement-set-reconciliation'],
    ['deleteBankStatement', 'bank-statement-delete'],
    ['listParsedStatements', 'list-parsed-statements'],
    ['getParsedStatement', 'get-parsed-statement'],
  ];
  for (const [method, channel] of required) {
    invoked.length = 0;
    const exposed = typeof api[method] === 'function';
    if (exposed) { try { api[method](1, {}); } catch { /* args irrelevant */ } }
    check(`${method} ??? ${channel}`, exposed && invoked.includes(channel) && handlers.has(channel),
      `exposed=${exposed} invoked=${invoked.includes(channel)} handler=${handlers.has(channel)}`);
  }

  console.log('\n=== page wiring ===');
  const page = fs.readFileSync(path.join(FE, 'components', 'bankStatements', 'pages', 'Statements.js'), 'utf8');
  check('page uses the summary + list APIs', /getBankStatementsSummary/.test(page) && /listParsedStatements/.test(page));
  check('page links accounts by id', /linkBankStatementAccount/.test(page));
  check('page matches lines to existing transactions', /matchBankStatementLine/.test(page) && /getUnreconciledTransactions/.test(page));
  check('page starts reconciliation via the existing route', /\/main\/banking\/reconcile\?/.test(page));
  check('page opens the General Ledger for the bank account', /general-ledger\?accountId=/.test(page));
  check('page has a wide detail drawer', /width=\{Math\.min\(Math\.max\(1000/.test(page));
  check('page has loading + error + empty states', /Skeleton active/.test(page) && /Unable to load bank statements\./.test(page) && /No bank statements imported yet\./.test(page));
  const recon = fs.readFileSync(path.join(FE, 'components', 'banking', 'BankReconciliation.js'), 'utf8');
  check('reconcile page prefills from the statement deep link (closing + end)', /params\.get\('closing'\)/.test(recon) && /params\.get\('end'\)/.test(recon));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e && e.stack ? e.stack : e); process.exit(1); });
