/**
 * verify-check-payee-name.js — the printed Check payee name resolves correctly.
 *
 * ONE shared rule everywhere: person (First+Last) → Company → Display Name.
 * Proves it on the frontend helper, the backend helper, and end-to-end for a
 * company-only VENDOR check (BillPayments.payBill → transactions.payee_name),
 * plus the refund path and the Write-Check payee list wiring.
 *
 * Run: $env:ELECTRON_RUN_AS_NODE="1"; & electron.exe scripts\verify-check-payee-name.js
 */
/* eslint-disable no-console */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-check-payee' });
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const realLog = console.log.bind(console);
console.log = () => {};
const models = require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr')).raw;
const BillPayments = require(path.join(ROOT, 'src', 'backend', 'models', 'billPayments'));
const COA = require(path.join(ROOT, 'src', 'backend', 'models', 'chartOfAccounts'));
console.log = realLog;
const backend = require(path.join(ROOT, 'src', 'backend', 'services', 'contactIdentity'));

// Frontend helper (ESM → CJS).
function loadFrontendGetCustomerName() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'src', 'utils', 'contactIdentity.js'), 'utf8');
  const cjs = `${src.replace(/export const /g, 'const ')}\nmodule.exports = { getCustomerName };`;
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', cjs)(mod, mod.exports);
  return mod.exports.getCustomerName;
}
const feName = loadFrontendGetCustomerName();

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`); }
};

console.log('\n=== the 5 cases (frontend + backend agree) ===');
const CASES = [
  ['1 person', { first_name: 'John', last_name: 'Smith', company_name: 'Smith Hardware' }, 'John Smith'],
  ['2 first only', { first_name: 'John', last_name: '', company_name: 'Smith Hardware' }, 'John'],
  ['3 last only', { first_name: '', last_name: 'Smith', company_name: 'Smith Hardware' }, 'Smith'],
  ['4 company only (ABCI)', { first_name: '', last_name: '', company_name: 'ABCI', display_name: 'ABCI' }, 'ABCI'],
  ['5 display fallback', { first_name: '', last_name: '', company_name: '', display_name: 'Cedar Meadow Farm' }, 'Cedar Meadow Farm'],
  ['15 whitespace first', { first_name: '   ', last_name: '', company_name: 'ABC Transport' }, 'ABC Transport'],
  ['16 "-" placeholder ignored', { first_name: '-', last_name: '-', company_name: 'ABCI' }, 'ABCI'],
  ['null safe', { first_name: null, last_name: undefined, company_name: 'ABCI' }, 'ABCI'],
];
for (const [label, row, expected] of CASES) {
  check(`frontend ${label}`, feName(row) === expected, { got: feName(row), expected });
  check(`backend  ${label}`, backend.getCustomerName(row) === expected, { got: backend.getCustomerName(row), expected });
}
check('no "- -" / "- Company" ever produced', !/^-/.test(feName({ first_name: '-', last_name: '-', company_name: 'X' })) && !feName({ first_name: '-', last_name: '-' }).includes('-'));

console.log('\n=== END-TO-END: company-only VENDOR check gets payee_name = Company ===');
{
  const bankId = (() => {
    const b = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type)='bank' AND status='Active' ORDER BY id LIMIT 1").get();
    if (b) return Number(b.id);
    return Number(db.prepare("INSERT INTO chart_of_accounts (name,type,subType,number,normalBalance,openingBalance,status,isSystem,entered_by) VALUES ('Test Bank','Bank','Checking','ZZB1','Debit',0,'Active',0,'t')").run().lastInsertRowid);
  })();

  // Company-only vendor (no first/last, no display name).
  const vcol = new Set(db.prepare("PRAGMA table_info('suppliers')").all().map(c => c.name));
  const supVals = { title: '', name: 'ABCI', display_name: '', company_name: 'ABCI', first_name: '', last_name: '', email: 'a@b.com', mobile_number: '', phone_number: '' };
  const supCols = Object.keys(supVals).filter(c => vcol.has(c));
  const vendRes = db.prepare(
    `INSERT INTO suppliers (${supCols.join(',')}) VALUES (${supCols.map(() => '?').join(',')})`
  ).run(...supCols.map(c => supVals[c]));
  const vendorId = Number(vendRes.lastInsertRowid);
  const vendorRow = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(vendorId);
  check('vendor row is company-only (no personal name)', !vendRowHasPerson(vendorRow), vendorRow);
  function vendRowHasPerson(v) { return String(v.first_name || '').trim() !== '' || String(v.last_name || '').trim() !== ''; }

  // A bill for that vendor.
  const ecol = new Set(db.prepare("PRAGMA table_info('expenses')").all().map(c => c.name));
  const expVals = { payee: vendorId, payment_account: 'Accounts Payable', payment_date: '2026-04-01', category: 'bill', approval_status: 'Unpaid', ref_no: 'BILL-ABCI' };
  const expCols = Object.keys(expVals).filter(c => ecol.has(c));
  const billRes = db.prepare(
    `INSERT INTO expenses (${expCols.join(',')}) VALUES (${expCols.map(() => '?').join(',')})`
  ).run(...expCols.map(c => expVals[c]));
  const expenseId = Number(billRes.lastInsertRowid);
  db.prepare("INSERT INTO expense_lines (expense_id, category, description, amount) VALUES (?, 'Inventory', 'test', 100)").run(expenseId);

  const res = BillPayments.payBill({ expenseId, amount: 100, bankAccount: bankId, checkNumber: null, enteredBy: 'test' });
  check('payBill succeeded', res && res.success !== false, res);
  const checkId = res && (res.checkId || res.transactionId || res.id);
  const tx = checkId ? db.prepare('SELECT type, payee_name, reference FROM transactions WHERE id = ?').get(checkId)
    : db.prepare("SELECT type, payee_name, reference FROM transactions WHERE type='Check' AND LOWER(payee_name)='abci' ORDER BY id DESC LIMIT 1").get();
  check('a Check row was created for the vendor', !!tx && String(tx.type).toLowerCase() === 'check', tx);
  check('TEST 13: company-only vendor check payee_name = "ABCI"', tx && tx.payee_name === 'ABCI', tx && tx.payee_name);
}

console.log('\n=== static wiring (ONE shared resolver, no duplicate formula) ===');
{
  const cp = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'src', 'components', 'accountant', 'CheckPrinting.js'), 'utf8');
  check('Write-Check payee list uses the shared getCustomerName', /import \{ getCustomerName \} from '\.\.\/\.\.\/utils\/contactIdentity'/.test(cp) && /getCustomerName\(v\)/.test(cp) && /getCustomerName\(c\)/.test(cp));
  check('Write-Check payee list no longer prefers display_name over person/company', !/name: v\.display_name \|\|/.test(cp) && !/name: c\.display_name \|\|/.test(cp));
  check('Write-Check payee options always have a non-blank label', /`Vendor #\$\{v\.id\}`/.test(cp) && /`Customer #\$\{c\.id\}`/.test(cp));

  const bp = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'models', 'billPayments.js'), 'utf8');
  check('vendor check payee uses the shared backend resolver', /ContactIdentity\.getCustomerName/.test(bp) && /company_name FROM suppliers/.test(bp));
  check('vendor list query falls back to company_name', /NULLIF\(TRIM\(s\.company_name\), ''\)/.test(bp));

  const cr = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'models', 'customerRefunds.js'), 'utf8');
  check('TEST 12: refund check payee uses the shared resolver too', /Contacts\.getCustomerName\(cust\)/.test(cr));

  check('backend + frontend share the SAME rule (already proven above)', feName({ first_name: '', last_name: '', company_name: 'ABCI' }) === backend.getCustomerName({ first_name: '', last_name: '', company_name: 'ABCI' }));
}

console.log('\n=== alignment untouched (this is a name fix, not a layout change) ===');
{
  const cp = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'src', 'components', 'accountant', 'CheckPrinting.js'), 'utf8');
  check('vertical/horizontal calibration variables intact', /--check-offset-y: \$\{Number\(alignYIn/.test(cp) && /--check-offset-x: \$\{Number\(alignXIn/.test(cp));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
