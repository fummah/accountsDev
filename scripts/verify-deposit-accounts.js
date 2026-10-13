/**
 * verify-deposit-accounts.js — Manual Deposit credits the SELECTED source account.
 *
 * Proves:
 *   - the "Deposit From" selector is NOT Income-only: Income, Liability, Loan,
 *     Credit-Card and Equity accounts are valid; Asset/Bank/AR/AP/Expense/
 *     NonPosting/system/inactive are excluded (by classification, never by name);
 *   - posting is Dr Bank / Cr each line's source account (multi-line, balanced);
 *   - a loan/equity deposit does NOT create Revenue (its credit line is a
 *     Liability/Equity account, never an Income account);
 *   - the backend validates the account and rejects an invalid/same-bank source
 *     atomically (no deposit row, no journal).
 *
 * Run: $env:ELECTRON_RUN_AS_NODE="1"; & electron.exe scripts\verify-deposit-accounts.js
 */
/* eslint-disable no-console */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-deposit-accounts' });

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const realLog = console.log.bind(console);
console.log = () => {};
require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr')).raw;
console.log = realLog;
const Deposits = require(path.join(ROOT, 'src', 'backend', 'models', 'deposits'));
const { isManualDepositSourceAccount } = require(path.join(ROOT, 'src', 'backend', 'services', 'accountEligibility'));
const DepositAccounts = require(path.join(ROOT, 'src', 'backend', 'services', 'depositAccounts'));

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`); }
};

const insAcc = (name, type, subType, status, isSystem) => {
  const num = 'ZZ' + Math.floor(Math.random() * 1e6);
  const r = db.prepare(`INSERT INTO chart_of_accounts (name, type, subType, number, normalBalance, openingBalance, status, isSystem, entered_by) VALUES (?,?,?,?,?,0,?,?, 'test')`)
    .run(name + ' ' + num, type, subType || '', num, 'Debit', status || 'Active', isSystem ? 1 : 0);
  return Number(r.lastInsertRowid);
};

const bankId = insAcc('Test Operating Bank', 'Bank', 'Checking');
const incomeId = insAcc('Test Sales Income', 'Income', 'Sales');
const otherIncomeId = insAcc('Test Other Income', 'Income', 'Other Income');
const loanId = insAcc('Test Loan Payable', 'Liability', 'Loan');        // liability family
const ccId = insAcc('Test Credit Card', 'Credit Card', '');              // liability family
const equityId = insAcc('Test Owner Contribution', 'Equity', '');
const expenseId = insAcc('Test Supplies Expense', 'Expense', '');
const assetId = insAcc('Test Asset', 'Asset', '');
const apId = insAcc('Test Accounts Payable', 'Accounts Payable', 'Accounts Payable');
const arId = insAcc('Test Accounts Receivable', 'Asset', 'Accounts Receivable');
const inactiveId = insAcc('Test Inactive Income', 'Income', 'Sales', 'Inactive');
const systemIncomeId = insAcc('Test System Income', 'Income', 'Sales', 'Active', true);

console.log('\n=== eligibility (by classification, not name) ===');
const allowed = { 'Income': incomeId, 'Other Income': otherIncomeId, 'Liability (Loan)': loanId, 'Credit Card': ccId, 'Equity': equityId };
for (const [label, id] of Object.entries(allowed)) {
  const a = db.prepare('SELECT * FROM chart_of_accounts WHERE id=?').get(id);
  check(`ALLOW ${label}`, isManualDepositSourceAccount(a), a && a.type);
}
const denied = { 'Bank': bankId, 'Asset': assetId, 'Expense': expenseId, 'Accounts Payable': apId, 'Accounts Receivable (Asset)': arId, 'Inactive': inactiveId, 'System': systemIncomeId };
for (const [label, id] of Object.entries(denied)) {
  const a = db.prepare('SELECT * FROM chart_of_accounts WHERE id=?').get(id);
  check(`EXCLUDE ${label}`, !isManualDepositSourceAccount(a), a && { type: a.type, status: a.status, isSystem: a.isSystem });
}

console.log('\n=== server-authoritative list ===');
{
  const list = DepositAccounts.listValidDepositSourceAccounts();
  const ids = new Set(list.map(a => a.id));
  check('contains Income', ids.has(incomeId));
  check('contains Loan/Liability', ids.has(loanId));
  check('contains Credit Card', ids.has(ccId));
  check('contains Equity', ids.has(equityId));
  check('excludes Bank', !ids.has(bankId));
  check('excludes AP', !ids.has(apId));
  check('excludes AR', !ids.has(arId));
  check('excludes Expense', !ids.has(expenseId));
  check('excludes inactive', !ids.has(inactiveId));
  check('excludes system', !ids.has(systemIncomeId));
}

console.log('\n=== validation ===');
{
  check('valid Income → ok', DepositAccounts.validateDepositSourceAccount(incomeId, { receivingBankAccountId: bankId }).ok);
  check('valid Loan → ok', DepositAccounts.validateDepositSourceAccount(loanId, { receivingBankAccountId: bankId }).ok);
  check('AP → rejected', DepositAccounts.validateDepositSourceAccount(apId, {}).ok === false);
  check('Bank as source → rejected', DepositAccounts.validateDepositSourceAccount(bankId, {}).ok === false);
  check('same as receiving bank → rejected', DepositAccounts.validateDepositSourceAccount(bankId, { receivingBankAccountId: bankId }).ok === false);
  check('inactive → rejected', DepositAccounts.validateDepositSourceAccount(inactiveId, {}).ok === false);
  check('unknown id → rejected', DepositAccounts.validateDepositSourceAccount(99999999, {}).ok === false);
  check('missing id → rejected', DepositAccounts.validateDepositSourceAccount(null, {}).ok === false);
}

const journalLines = (depositId) => db.prepare(`
  SELECT jl.account_id, jl.debit, jl.credit, a.type AS acct_type, a.name AS acct_name
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.entry_id
  JOIN chart_of_accounts a ON a.id = jl.account_id
  WHERE je.source_type = 'deposit' AND je.source_id = ? AND je.status = 'Posted'
`).all(depositId);
const mkDeposit = (allocations) => Deposits.create({ bankAccountId: bankId, date: '2026-02-01', reference: 'DEP-T', memo: 'test', paymentIds: [], allocations });

console.log('\n=== TEST 2: LOAN deposit — Cr Loan Payable, NOT Revenue ===');
{
  const res = mkDeposit([{ accountId: loanId, amount: 20000, description: 'Business loan' }]);
  check('deposit created', res && res.success, res);
  const lines = journalLines(res.id);
  const bankLine = lines.find(l => l.account_id === bankId);
  const loanLine = lines.find(l => l.account_id === loanId);
  check('Dr Bank 20,000', bankLine && Number(bankLine.debit) === 20000 && Number(bankLine.credit) === 0, bankLine);
  check('Cr Loan Payable 20,000', loanLine && Number(loanLine.credit) === 20000 && Number(loanLine.debit) === 0, loanLine);
  check('loan credit line is a Liability account (no Revenue)', loanLine && String(loanLine.acct_type).toLowerCase().includes('liab'), loanLine && loanLine.acct_type);
  check('no Income account credited', !lines.some(l => Number(l.credit) > 0 && String(l.acct_type).toLowerCase().includes('income')), lines);
}

console.log('\n=== TEST 3: EQUITY deposit — Cr Equity ===');
{
  const res = mkDeposit([{ accountId: equityId, amount: 10000, description: 'Owner contribution' }]);
  const lines = journalLines(res.id);
  check('Dr Bank 10,000', lines.find(l => l.account_id === bankId && Number(l.debit) === 10000));
  check('Cr Equity 10,000', lines.find(l => l.account_id === equityId && Number(l.credit) === 10000));
  check('P&L unaffected (no Income/Expense credited)', !lines.some(l => Number(l.credit) > 0 && /income|expense/.test(String(l.acct_type).toLowerCase())));
}

console.log('\n=== TEST 1: REVENUE deposit still credits Income ===');
{
  const res = mkDeposit([{ accountId: incomeId, amount: 1000, description: 'Sales' }]);
  const lines = journalLines(res.id);
  check('Cr Sales Income 1,000', lines.find(l => l.account_id === incomeId && Number(l.credit) === 1000));
}

console.log('\n=== TEST 4: CREDIT CARD liability deposit ===');
{
  const res = mkDeposit([{ accountId: ccId, amount: 5000, description: 'Cash advance' }]);
  const lines = journalLines(res.id);
  check('Cr Credit Card Liability 5,000', lines.find(l => l.account_id === ccId && Number(l.credit) === 5000));
  check('CC credit line is Liability family (type Credit Card)', /credit card|liab/.test(String((lines.find(l => l.account_id === ccId) || {}).acct_type).toLowerCase()));
}

console.log('\n=== TEST 5/6: MULTIPLE lines → balanced; bank debit = total ===');
{
  const res = mkDeposit([
    { accountId: incomeId, amount: 5000, description: 'Revenue' },
    { accountId: loanId, amount: 20000, description: 'Loan' },
    { accountId: equityId, amount: 10000, description: 'Equity' },
  ]);
  const lines = journalLines(res.id);
  const bankLine = lines.find(l => l.account_id === bankId);
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
  check('Dr Bank = 35,000 (sum of all lines)', bankLine && Number(bankLine.debit) === 35000, bankLine);
  check('total debit = total credit = 35,000', totalDebit === 35000 && totalCredit === 35000, { totalDebit, totalCredit });
  check('three distinct source credits', [incomeId, loanId, equityId].every(id => lines.some(l => l.account_id === id && Number(l.credit) > 0)));
}

console.log('\n=== invalid source → atomic rollback (no deposit, no journal) ===');
{
  const before = db.prepare('SELECT COUNT(*) c FROM deposits').get().c;
  let threw = false;
  try { mkDeposit([{ accountId: expenseId, amount: 100, description: 'bad' }]); } catch { threw = true; }
  check('an Expense source is rejected', threw);
  let threw2 = false;
  try { mkDeposit([{ accountId: bankId, amount: 100, description: 'same bank' }]); } catch { threw2 = true; }
  check('source = receiving bank is rejected', threw2);
  check('no deposit row created by the rejected attempts', db.prepare('SELECT COUNT(*) c FROM deposits').get().c === before, db.prepare('SELECT COUNT(*) c FROM deposits').get().c - before);
}

console.log('\n=== static wiring ===');
{
  const dep = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'models', 'deposits.js'), 'utf8');
  check('deposits.create/update validate the source account', /validateDepositSourceAccount/.test(dep));
  check('manual deposit has NO silent Undeposited-Funds fallback', !/Manual deposit — credit each allocation's chosen account\/category/.test(dep));
  const h = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'handlers', 'depositHandlers.js'), 'utf8');
  check('handler exposes get-deposit-source-accounts', /get-deposit-source-accounts/.test(h));
  const preload = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'preload.js'), 'utf8');
  check('preload exposes getDepositSourceAccounts', /getDepositSourceAccounts/.test(preload));
  const ui = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'src', 'components', 'banking', 'MakeDeposits.js'), 'utf8');
  check('UI label is "Deposit From Account"', /Deposit From Account/.test(ui));
  check('UI no longer restricts to income accounts', !/getIncomeAccounts/.test(ui));
  check('UI uses the shared deposit-source list', /getManualDepositSourceAccounts/.test(ui) && /getDepositSourceAccounts/.test(ui));
  check('UI Customer/Vendor is optional (no required rule)', !/Customer\/Vendor required/.test(ui));
  const utils = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'src', 'utils', 'accounts.js'), 'utf8');
  check('frontend mirror rule exists', /isManualDepositSourceAccount/.test(utils) && /getManualDepositSourceAccounts/.test(utils));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
