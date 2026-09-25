/**
 * verify-credit-card-split-total.js
 *
 * The Credit Card Charge total is ALWAYS the SUM of its expense split lines.
 * There is no standalone Amount field, and the backend derives/verifies the
 * total from the lines instead of trusting a client-supplied amount.
 *
 * Covers the pure money math, the frontend form wiring, the backend
 * derive/verify service, and the balanced journal posting. Runs on a SCRATCH
 * COPY of the database.
 */
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const Module = require('module');
const electronStub = { ipcMain: { handle: () => {} }, app: { isPackaged: true } };
const originalLoad = Module._load;
Module._load = function (request) { if (request === 'electron') return electronStub; return originalLoad.apply(this, arguments); };

require('./lib/testDb.js').useScratchCopy({ label: 'verify-credit-card-split-total' });
const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const JournalEntries = require(path.join(ROOT, 'src', 'backend', 'models', 'journalEntries.js'));
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js')).raw;
const chargeSplits = require(path.join(ROOT, 'src', 'backend', 'services', 'chargeSplits.js'));

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

// Load a pure ESM frontend module (no imports) by stripping `export `.
const loadPure = (rel, names) => {
  let code = fs.readFileSync(path.join(FE, rel), 'utf8');
  code = code.replace(/^\s*export\s+/gm, '');
  // eslint-disable-next-line no-new-func
  return new Function(`${code}\n;return { ${names.join(', ')} };`)();
};

// ── 1. Money math (integer cents) ─────────────────────────────────────────
console.log('\n=== Money helper ===');
const money = loadPure('utils/money.js', ['sumMoney', 'toCents', 'round2', 'moneyEquals']);
check('sumMoney(100,50) = 150', money.sumMoney([100, 50]) === 150, String(money.sumMoney([100, 50])));
check('sumMoney(0.1,0.2) = 0.3 (no float drift)', money.sumMoney([0.1, 0.2]) === 0.3, String(money.sumMoney([0.1, 0.2])));
check('sumMoney(0.1 x 3) = 0.3', money.sumMoney([0.1, 0.1, 0.1]) === 0.3, String(money.sumMoney([0.1, 0.1, 0.1])));
check('blank/empty rows contribute 0 (100 + 0 = 100)', money.sumMoney([100, 0]) === 100);
check('sumMoney([]) = 0', money.sumMoney([]) === 0);
check('moneyEquals(150, 150.00)', money.moneyEquals(150, 150.0) === true);
check('moneyEquals(150, 150.01) is false', money.moneyEquals(150, 150.01) === false);

// ── 2. Frontend form wiring ───────────────────────────────────────────────
console.log('\n=== Add/Edit Credit Card Charge form ===');
const ui = fs.readFileSync(path.join(FE, 'components', 'expenses', 'CreditCardCharges.js'), 'utf8');
check('standalone Amount input is GONE (no name="amount")', !/name="amount"/.test(ui));
check('the splitLines.length <= 1 conditional is GONE', !/splitLines\.length\s*<=\s*1/.test(ui));
check('no leftover values.amount usage', !/values\.amount/.test(ui));
check('imports the shared money helper', /import\s*\{\s*sumMoney\s*\}\s*from\s*'\.\.\/\.\.\/utils\/money'/.test(ui));
check('splitTotal is summed with sumMoney', /splitTotal\s*=\s*useMemo\(\(\)\s*=>\s*sumMoney\(/.test(ui));
check('a meaningful-line predicate exists', /isMeaningfulSplitLine\s*=/.test(ui));
check('save payload sets amount from the derived total', /amount:\s*totalAmount/.test(ui));
check('form still renders the split Total readout', /Total:\s*\{cSym\}\s*\{splitTotal\.toFixed\(2\)\}/.test(ui));
check('AttachmentManager is still present (Attach Receipt)', /<AttachmentManager/.test(ui));
check('Vendor / Payee field is unchanged', /name="vendor"[\s\S]{0,120}required:\s*true/.test(ui));

// ── 3. Backend derive/verify service ──────────────────────────────────────
console.log('\n=== Backend split-total service ===');
const { deriveSplitTotal, sumSplitLines, parseStoredSplits } = chargeSplits;
check('derive 200 + 50 = 250', deriveSplitTotal([{ account: 'Fuel', amount: 200 }, { account: 'Office', amount: 50 }]) === 250);
check('derive 100 + 50 + 25 = 175', deriveSplitTotal([{ account: 'A', amount: 100 }, { account: 'B', amount: 50 }, { account: 'C', amount: 25 }]) === 175);
check('blank convenience row is ignored (100 + 0 = 100)',
  deriveSplitTotal([{ account: 'Fuel', amount: 100 }, { account: '', amount: 0 }]) === 100);
check('no meaningful lines -> null', deriveSplitTotal([{ account: '', amount: 0 }]) === null);
check('empty list -> null', deriveSplitTotal([]) === null);
check('account with zero amount is not meaningful', deriveSplitTotal([{ account: 'Fuel', amount: 0 }]) === null);
check('account_id alone counts as an account', deriveSplitTotal([{ account_id: 7, amount: 40 }]) === 40);
check('sumSplitLines uses cents (0.1 + 0.2 = 0.3)', sumSplitLines([{ amount: 0.1 }, { amount: 0.2 }]) === 0.3);

// stored categories round-trip (edit path)
const stored = JSON.stringify([{ account: 'Fuel', account_id: 1, amount: 200 }, { account: 'Office', account_id: 2, amount: 50 }]);
check('parseStoredSplits reads the JSON categories column', parseStoredSplits(stored).length === 2);
check('derive from stored categories = 250', deriveSplitTotal(parseStoredSplits(stored)) === 250);
check('legacy comma names carry no amounts -> null', deriveSplitTotal(parseStoredSplits('Fuel, Office')) === null);

// ── 4. Handler wiring ─────────────────────────────────────────────────────
console.log('\n=== Handler wiring (backend source of truth) ===');
const handlers = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'handlers', 'transactionHandlers.js'), 'utf8');
check('handler imports the split service', /require\('\.\.\/services\/chargeSplits'\)/.test(handlers));
check('insert derives the amount from split lines', /deriveSplitTotal\(tx\.splitLines\)/.test(handlers));
check('insert overwrites the client amount with the derived total', /tx\s*=\s*\{\s*\.\.\.tx,\s*amount:\s*derivedAmount\s*\}/.test(handlers));
check('update derives the amount from split lines', /deriveSplitTotal\(nextSplitLines\)/.test(handlers));
check('update falls back to stored categories', /parseStoredSplits\(existing\?\.categories\)/.test(handlers));
check('update overwrites the client amount with the derived total', /data\s*=\s*\{\s*\.\.\.data,\s*amount:\s*derivedAmount\s*\}/.test(handlers));

// ── 5. Journal posting stays balanced and split-driven ────────────────────
console.log('\n=== Journal posting ===');
const card = db.prepare("SELECT id, name FROM chart_of_accounts WHERE LOWER(type) = 'credit card' AND status = 'Active' ORDER BY id LIMIT 1").get()
  || db.prepare("SELECT id, name FROM chart_of_accounts WHERE LOWER(type) = 'bank' AND status = 'Active' ORDER BY id LIMIT 1").get();
const expRows = db.prepare("SELECT id, name FROM chart_of_accounts WHERE LOWER(type) = 'expense' AND status = 'Active' ORDER BY id LIMIT 2").all();
check('fixtures: a card account and two expense accounts exist', !!(card && expRows.length >= 2),
  JSON.stringify({ card, exp: expRows.map(e => e.id) }));

const linesFor = (id) => db.prepare(`
  SELECT jl.account_id, jl.debit, jl.credit
  FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_id
  WHERE je.source_type = 'transaction' AND je.source_id = ?`).all(id);
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9;
const debitSum = (ls) => ls.reduce((s, l) => s + Number(l.debit || 0), 0);
const creditSum = (ls) => ls.reduce((s, l) => s + Number(l.credit || 0), 0);

if (card && expRows.length >= 2) {
  const [e1, e2] = expRows;

  // TEST 1 — single line
  JournalEntries.postTransaction({
    id: 991001, date: '2026-06-01', amount: 100, accountId: card.id, description: 'single', reference: 'CC1',
    splitLines: [{ accountId: e1.id, account: e1.name, amount: 100 }],
  });
  let ls = linesFor(991001);
  check('TEST 1 single line: DR expense 100', ls.some(l => Number(l.account_id) === Number(e1.id) && near(l.debit, 100)), JSON.stringify(ls));
  check('TEST 1 single line: CR card 100', ls.some(l => Number(l.account_id) === Number(card.id) && near(l.credit, 100)));
  check('TEST 1 single line: balanced', near(debitSum(ls), creditSum(ls)));

  // TEST 2 — two lines
  JournalEntries.postTransaction({
    id: 991002, date: '2026-06-02', amount: 150, accountId: card.id, description: 'two', reference: 'CC2',
    splitLines: [{ accountId: e1.id, account: e1.name, amount: 100 }, { accountId: e2.id, account: e2.name, amount: 50 }],
  });
  ls = linesFor(991002);
  check('TEST 2 two lines: CR card 150 (the sum)', ls.some(l => Number(l.account_id) === Number(card.id) && near(l.credit, 150)), JSON.stringify(ls));
  check('TEST 2 two lines: balanced', near(debitSum(ls), creditSum(ls)));

  // TEST 3 — three lines
  JournalEntries.postTransaction({
    id: 991003, date: '2026-06-03', amount: 175, accountId: card.id, description: 'three', reference: 'CC3',
    splitLines: [{ accountId: e1.id, account: e1.name, amount: 100 }, { accountId: e2.id, account: e2.name, amount: 50 }, { accountId: e1.id, account: e1.name, amount: 25 }],
  });
  ls = linesFor(991003);
  check('TEST 3 three lines: CR card 175', ls.some(l => Number(l.account_id) === Number(card.id) && near(l.credit, 175)));
  check('TEST 3 three lines: balanced', near(debitSum(ls), creditSum(ls)));

  // TEST 8 — malformed request: top-level amount lies; journal follows the lines
  JournalEntries.postTransaction({
    id: 991008, date: '2026-06-08', amount: 900, accountId: card.id, description: 'malformed', reference: 'CC8',
    splitLines: [{ accountId: e1.id, account: e1.name, amount: 100 }, { accountId: e2.id, account: e2.name, amount: 50 }],
  });
  ls = linesFor(991008);
  check('TEST 8 malformed: posts CR card 150, NOT the supplied 900', ls.some(l => Number(l.account_id) === Number(card.id) && near(l.credit, 150)) && !ls.some(l => near(l.credit, 900)), JSON.stringify(ls));
  check('TEST 8 malformed: balanced', near(debitSum(ls), creditSum(ls)));
  check('TEST 8 handler would derive 150 from the lines (not 900)', deriveSplitTotal([{ account: e1.name, amount: 100 }, { account: e2.name, amount: 50 }]) === 150);

  // TEST 5 — delete a line: remaining 100
  const remaining = [{ account: e1.name, account_id: e1.id, amount: 100 }];
  check('TEST 5 after deleting the 50 line: total = 100', deriveSplitTotal(remaining) === 100);
  JournalEntries.postTransaction({ id: 991005, date: '2026-06-05', amount: 100, accountId: card.id, description: 'after delete', reference: 'CC5', splitLines: remaining });
  ls = linesFor(991005);
  check('TEST 5 after delete: CR card 100', ls.some(l => Number(l.account_id) === Number(card.id) && near(l.credit, 100)));
  check('TEST 5 after delete: balanced', near(debitSum(ls), creditSum(ls)));

  // TEST 4 / EDIT — change amount 100 -> 125
  check('TEST 4 edit amount 100 -> 125: total = 125', deriveSplitTotal([{ account: e1.name, amount: 125 }]) === 125);
  // TEST 7 — reopen: stored categories round-trip
  check('TEST 7 reopen: stored lines still total 150', deriveSplitTotal(parseStoredSplits(JSON.stringify([{ account: e1.name, account_id: e1.id, amount: 100 }, { account: e2.name, account_id: e2.id, amount: 50 }]))) === 150);

  // TEST 9 — explicit journal expectation
  JournalEntries.postTransaction({
    id: 991009, date: '2026-06-09', amount: 250, accountId: card.id, description: 'journal', reference: 'CC9',
    splitLines: [{ accountId: e1.id, account: e1.name, amount: 200 }, { accountId: e2.id, account: e2.name, amount: 50 }],
  });
  ls = linesFor(991009);
  check('TEST 9 journal: Dr Fuel 200', ls.some(l => Number(l.account_id) === Number(e1.id) && near(l.debit, 200)));
  check('TEST 9 journal: Dr Office 50', ls.some(l => Number(l.account_id) === Number(e2.id) && near(l.debit, 50)));
  check('TEST 9 journal: Cr Credit Card 250', ls.some(l => Number(l.account_id) === Number(card.id) && near(l.credit, 250)));
  check('TEST 9 journal: debits = credits', near(debitSum(ls), creditSum(ls)));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
