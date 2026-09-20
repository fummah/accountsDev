/**
 * Verifies the Write Check "vendor has open bills" backend logic.
 * Runs against a SCRATCH COPY of the live DB (never the real file).
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/verify-open-bills.js
 */
const path = require('path');
const Module = require('module');

// stub electron so requiring handlers/models doesn't need a renderer
const electronStub = { ipcMain: { handle: () => {} }, app: { isPackaged: true } };
const originalLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return electronStub;
  return originalLoad.apply(this, arguments);
};

require('./lib/testDb.js').useScratchCopy({ label: 'verify-open-bills' });

const dbmgr = require('../src/backend/models/dbmgr.js');
const Expenses = require('../src/backend/models/expenses.js');
require('../src/backend/models/index.js');
const db = dbmgr.raw;

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`); }
};

const created = { suppliers: [], expenses: [] };

function addSupplier(name) {
  const info = db.prepare('PRAGMA table_info(suppliers)').all();
  const cols = new Set(info.map(c => c.name));
  const values = {
    title: '', first_name: name, last_name: '', display_name: name,
    email: '', phone_number: '', mobile_number: '', company_name: '',
  };
  const useCols = Object.keys(values).filter(c => cols.has(c));
  const stmt = db.prepare(`INSERT INTO suppliers (${useCols.join(',')}) VALUES (${useCols.map(() => '?').join(',')})`);
  const id = stmt.run(...useCols.map(c => values[c])).lastInsertRowid;
  created.suppliers.push(Number(id));
  return Number(id);
}

function addBill(payeeId, category, amount, paidAmount, status) {
  const id = db.prepare(
    "INSERT INTO expenses (payee, payment_account, payment_date, category, approval_status, paid_amount, due_date, ref_no, memo) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run(payeeId, 'Accounts Payable', '2026-08-01', category, status, paidAmount, '2026-08-31', `BILL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, 'test').lastInsertRowid;
  db.prepare("INSERT INTO expense_lines (expense_id, category, description, amount) VALUES (?,?,?,?)").run(id, 'General', 'line', amount);
  created.expenses.push(Number(id));
  return Number(id);
}

const bal = (bills) => bills.reduce((s, b) => s + (Number(b.amount) - Number(b.paid_amount)), 0);

console.log('\nVendor A — no open bills');
{
  const id = addSupplier('VerifyA');
  const bills = Expenses.getOpenBills(id);
  check('returns empty array', Array.isArray(bills) && bills.length === 0, bills);
}

console.log('\nVendor B — 1 bill $500 unpaid');
{
  const id = addSupplier('VerifyB');
  addBill(id, 'bill', 500, 0, 'Unpaid');
  const bills = Expenses.getOpenBills(id);
  check('one open bill', bills.length === 1, bills.length);
  check('balance due is 500', bal(bills), 500);
}

console.log('\nVendor C — $1000 bill, $400 paid -> balance $600 (not $1000)');
{
  const id = addSupplier('VerifyC');
  addBill(id, 'bill', 1000, 400, 'Partially Paid');
  const bills = Expenses.getOpenBills(id);
  check('one open bill', bills.length === 1, bills.length);
  check('balance due is 600 (not 1000)', bal(bills), 600);
}

console.log('\nVendor D — all bills settled -> excluded');
{
  const id = addSupplier('VerifyD');
  addBill(id, 'bill', 1000, 1000, 'Unpaid'); // paid_amount == amount -> balance 0
  const bills = Expenses.getOpenBills(id);
  check('settled bill excluded by balance filter', bills.length === 0, bills);
}

console.log('\nVendor E — paid/void/cancelled statuses excluded');
{
  const id = addSupplier('VerifyE');
  addBill(id, 'bill', 300, 0, 'Paid');
  addBill(id, 'bill', 300, 0, 'Cancelled');
  addBill(id, 'bill', 300, 0, 'Void');
  const bills = Expenses.getOpenBills(id);
  check('no open bills for paid/cancelled/void', bills.length === 0, bills);
}

console.log('\nNon-vendor category (customer) not returned for a vendor');
{
  const id = addSupplier('VerifyF');
  addBill(id, 'customer', 500, 0, 'Unpaid'); // wrong category
  const bills = Expenses.getOpenBills(id);
  check('customer-category expense excluded', bills.length === 0, bills);
}

console.log('\nMissing payee id');
{
  check('null -> []', Array.isArray(Expenses.getOpenBills(null)) && Expenses.getOpenBills(null).length === 0);
  check('undefined -> []', Array.isArray(Expenses.getOpenBills(undefined)) && Expenses.getOpenBills(undefined).length === 0);
}

// cleanup scratch rows
try {
  for (const id of created.expenses) db.prepare('DELETE FROM expense_lines WHERE expense_id = ?').run(id);
  for (const id of created.expenses) db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  for (const id of created.suppliers) db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
} catch (e) { console.log('  [warn] cleanup:', e.message); }

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
