/**
 * verify-check-split-accounts.js
 *
 * Write Check has TWO account selectors with DIFFERENT rules:
 *   • Bank Account (Pay From)  → Bank accounts ONLY
 *   • Split Lines (paid FOR)   → Expense / Asset / Liability / Loan / Equity /
 *                                Credit Card … but NOT Bank
 *
 * It verifies the filter (pure utils) and that the posting service accepts the
 * selected accounts (DR split account / CR bank). Runs on a SCRATCH COPY.
 */
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const Module = require('module');
const electronStub = { ipcMain: { handle: () => {} }, app: { isPackaged: true } };
const originalLoad = Module._load;
Module._load = function (request) { if (request === 'electron') return electronStub; return originalLoad.apply(this, arguments); };

require('./lib/testDb.js').useScratchCopy({ label: 'verify-check-split-accounts' });
const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const JournalEntries = require(path.join(ROOT, 'src', 'backend', 'models', 'journalEntries.js'));
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js')).raw;

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

// Load the pure frontend account utils (ESM, no imports).
const loadPure = (rel, names) => {
  let code = fs.readFileSync(path.join(FE, rel), 'utf8');
  code = code.replace(/^\s*export\s+/gm, '');
  // eslint-disable-next-line no-new-func
  return new Function(`${code}\n;return { ${names.join(', ')} };`)();
};
const { isBankAccount, getBankAccounts, isBillLineAccount } = loadPure('utils/accounts.js', ['isBankAccount', 'getBankAccounts', 'isBillLineAccount']);

console.log('\n=== Write Check account selectors ===');

// ── the two filters on a representative Chart of Accounts ─────────────────
const coa = [
  { id: 1, accountName: 'Business Checking', accountType: 'Bank' },
  { id: 2, accountName: 'Farm Checking', accountType: 'Bank' },
  { id: 3, accountName: 'Fuel Expense', accountType: 'Expense' },
  { id: 4, accountName: 'Repairs & Maintenance', accountType: 'Expense' },
  { id: 5, accountName: 'Truck Loan', accountType: 'Liability', accountSubType: 'Long Term Liability' },
  { id: 6, accountName: 'Equipment Finance', accountType: 'Loan' },
  { id: 7, accountName: 'Visa', accountType: 'Credit Card' },
  { id: 8, accountName: 'Sales Income', accountType: 'Income' },
  { id: 9, accountName: 'Accounts Payable', accountType: 'Accounts Payable' },
  { id: 10, accountName: 'Accounts Receivable', accountType: 'Accounts Receivable' },
  { id: 11, accountName: 'Owner Equity', accountType: 'Equity' },
  { id: 12, accountName: 'Petty Cash', accountType: 'Cash' },
  { id: 13, accountName: 'Memorandum', accountType: 'Non-Posting' },
];
const bankIds = getBankAccounts(coa).map(a => a.id).sort((a, b) => a - b);
const split = coa.filter(a => isBillLineAccount(a) && !isBankAccount(a));
const splitIds = split.map(a => a.id);

check('Bank selector: only Bank accounts', JSON.stringify(bankIds) === JSON.stringify([1, 2]), JSON.stringify(bankIds));
check('Split: NO Bank accounts', !splitIds.includes(1) && !splitIds.includes(2), JSON.stringify(splitIds));
check('Split: Expense accounts included', splitIds.includes(3) && splitIds.includes(4));
check('Split: Liability (long-term) included', splitIds.includes(5));
check('Split: Loan included', splitIds.includes(6));
check('Split: Credit Card included', splitIds.includes(7));
check('Split: Equity included', splitIds.includes(11));
check('Split: Cash/Asset included', splitIds.includes(12));
check('Split: Income excluded', !splitIds.includes(8));
check('Split: Accounts Payable excluded', !splitIds.includes(9));
check('Split: Accounts Receivable excluded', !splitIds.includes(10));
check('Split: Non-Posting excluded', !splitIds.includes(13));
check('Split is classified by type/subtype, not by name',
  !split.some(a => /bank/i.test(a.accountName)) && isBankAccount({ accountName: 'Bank Fees', accountType: 'Expense' }) === false);

// ── posting accepts the split accounts (DR split / CR bank) ───────────────
const bank = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type)='bank' AND status='Active' ORDER BY id LIMIT 1").get();
const exp = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type)='expense' AND status='Active' ORDER BY id LIMIT 1").get();
const liab = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('loan','liability') AND status='Active' ORDER BY id LIMIT 1").get();
check('fixtures: a bank, an expense and a liability/loan account exist', !!(bank && exp && liab), JSON.stringify({ bank, exp, liab }));

const linesFor = (id) => db.prepare(`
  SELECT jl.account_id, jl.debit, jl.credit
  FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_id
  WHERE je.source_type = 'transaction' AND je.source_id = ?`).all(id);
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9;

if (bank && exp && liab) {
  // Expense cheque
  JournalEntries.postTransaction({ id: 990001, date: '2026-06-01', amount: 100, accountId: bank.id, description: 'check exp', reference: 'T1', splitLines: [{ accountId: exp.id, account: '', amount: 100 }] });
  let ls = linesFor(990001);
  check('expense cheque posts DR Expense 100', ls.some(l => Number(l.account_id) === Number(exp.id) && near(l.debit, 100) && near(l.credit, 0)), JSON.stringify(ls));
  check('expense cheque posts CR Bank 100', ls.some(l => Number(l.account_id) === Number(bank.id) && near(l.credit, 100) && near(l.debit, 0)), JSON.stringify(ls));
  check('expense cheque is balanced', near(ls.reduce((s, l) => s + Number(l.debit), 0), ls.reduce((s, l) => s + Number(l.credit), 0)));

  // Loan / liability cheque
  JournalEntries.postTransaction({ id: 990002, date: '2026-06-02', amount: 300, accountId: bank.id, description: 'check loan', reference: 'T2', splitLines: [{ accountId: liab.id, account: '', amount: 300 }] });
  ls = linesFor(990002);
  check('loan cheque posts DR Loan/Liability 300', ls.some(l => Number(l.account_id) === Number(liab.id) && near(l.debit, 300)), JSON.stringify(ls));
  check('loan cheque posts CR Bank 300', ls.some(l => Number(l.account_id) === Number(bank.id) && near(l.credit, 300)), JSON.stringify(ls));

  // Multiple split lines of different types on ONE cheque
  JournalEntries.postTransaction({ id: 990003, date: '2026-06-03', amount: 400, accountId: bank.id, description: 'check mixed', reference: 'T3', splitLines: [{ accountId: exp.id, account: '', amount: 100 }, { accountId: liab.id, account: '', amount: 300 }] });
  ls = linesFor(990003);
  check('mixed cheque: DR Expense 100', ls.some(l => Number(l.account_id) === Number(exp.id) && near(l.debit, 100)));
  check('mixed cheque: DR Loan/Liability 300', ls.some(l => Number(l.account_id) === Number(liab.id) && near(l.debit, 300)));
  check('mixed cheque: CR Bank 400 (the sum)', ls.some(l => Number(l.account_id) === Number(bank.id) && near(l.credit, 400)), JSON.stringify(ls));
}

// ── source wiring: separate filters for the two selectors ─────────────────
const ui = fs.readFileSync(path.join(FE, 'components', 'accountant', 'CheckPrinting.js'), 'utf8');
check('imports the shared eligibility + bank helpers',
  /isBillLineAccount/.test(ui) && /isBankAccount/.test(ui) && /getBankAccounts/.test(ui));
check('defines a split-accounts filter = bill-line AND NOT bank',
  /splitAccounts = useMemo\([\s\S]{0,160}isBillLineAccount\(a\) && !isBankAccount\(a\)/.test(ui));
check('Bank Account selector still uses bankAccounts', /<AccountSelect accounts=\{bankAccounts\} placeholder="Select bank account"/.test(ui));
check('Split selector uses splitAccounts', /accounts=\{splitAccounts\}/.test(ui));
check('the component no longer fetches Bank-only accounts',
  !/getChartOfAccounts\(\s*\{\s*type:\s*'Bank'\s*\}\s*\)/.test(ui));
check('it fetches ALL accounts (twice: initial load + reload)', (ui.match(/getChartOfAccounts\(\)/g) || []).length >= 2);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
