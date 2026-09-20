// Verifies computePaidDate against a COPY of the live DB.
// Run: $env:ELECTRON_RUN_AS_NODE="1"; & electron.exe scripts\verify-paid-date.js
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const os = require('os');

const liveDb = path.join(__dirname, '..', 'src', 'backend', 'db', 'accounts.db');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paiddate-'));
const tmpDb = path.join(tmpDir, 'accounts_copy.db');
fs.copyFileSync(liveDb, tmpDb);

const Database = require('better-sqlite3');
const real = new Database(tmpDb);

const dbmgrPath = require.resolve(path.join(__dirname, '..', 'src', 'backend', 'models', 'dbmgr.js'));
const stub = {
  raw: real,
  prepare: (sql) => real.prepare(sql),
  all: (sql, params) => (params === undefined ? real.prepare(sql).all() : real.prepare(sql).all(...[].concat(params))),
  get: (sql, params) => (params === undefined ? real.prepare(sql).get() : real.prepare(sql).get(...[].concat(params))),
  run: (sql, params) => (params === undefined ? real.prepare(sql).run() : real.prepare(sql).run(...[].concat(params))),
  exec: (sql) => real.exec(sql),
  transaction: (fn) => real.transaction(fn),
};
require.cache[dbmgrPath] = { id: dbmgrPath, filename: dbmgrPath, loaded: true, exports: stub };

const svc = require(path.join(__dirname, '..', 'src', 'backend', 'services', 'invoiceFinancials.js'));

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  PASS  ${label} = ${JSON.stringify(actual)}`); }
  else { fail++; console.log(`  FAIL  ${label} = ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`); }
};

const custRow = real.prepare('SELECT id FROM customers LIMIT 1').get();
const prodRow = real.prepare('SELECT id FROM products LIMIT 1').get();
const custId = custRow.id;
const prodId = prodRow ? prodRow.id : 0;

function makeInvoice(lines, vat, status, createdDate, dueDate) {
  const id = real.prepare('INSERT INTO invoices (customer, start_date, last_date, number, vat, status) VALUES (?,?,?,?,?,?)')
    .run(custId, createdDate, dueDate, `PD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, vat, status).lastInsertRowid;
  const ins = real.prepare('INSERT INTO invoice_lines (invoice_id, product, description, quantity, rate, amount) VALUES (?,?,?,?,?,?)');
  for (const l of lines) ins.run(id, prodId, l.description || 'Item', l.quantity || 1, l.rate || 0, l.amount || 0);
  return id;
}
function addPayment(invId, amount, date) {
  const p = real.prepare("INSERT INTO payments (invoiceId, customerId, amount, paymentMethod, date, createdAt, status) VALUES (?,?,?,?,?,datetime('now'),'Pending Deposit')")
    .run(invId, custId, amount, 'cash', date).lastInsertRowid;
  real.prepare('INSERT INTO payment_allocations (paymentId, invoiceId, amount) VALUES (?,?,?)').run(p, invId, amount);
  return p;
}

console.log('\nTEST 36 — paid date is the final payment date, not creation/due/today');
{
  const id = makeInvoice([{ description: 'A', rate: 300, amount: 300 }], 0, 'Partially Paid', '2026-08-01', '2026-08-15');
  addPayment(id, 100, '2026-08-10');
  addPayment(id, 200, '2026-08-31');
  const f = svc.getInvoiceFinancials(id);
  check('status', f.status, 'Paid');
  check('balance', f.balance, 0);
  check('paidDate', f.paidDate, '2026-08-31');
}

console.log('\nOutstanding invoice has no paid date');
{
  const id = makeInvoice([{ description: 'A', rate: 300, amount: 300 }], 0, 'Pending', '2026-08-01', '2026-09-30');
  addPayment(id, 100, '2026-08-10');
  const f = svc.getInvoiceFinancials(id);
  check('status', f.status, 'Partially Paid');
  check('balance', f.balance, 200);
  check('paidDate null', f.paidDate, null);
}

console.log('\nSingle payment fully settles on its own date');
{
  const id = makeInvoice([{ description: 'A', rate: 300, amount: 300 }], 0, 'Pending', '2026-08-01', '2026-08-15');
  addPayment(id, 300, '2026-08-31');
  const f = svc.getInvoiceFinancials(id);
  check('paidDate', f.paidDate, '2026-08-31');
}

console.log("\nCumulative crossing uses the crossing payment's date");
{
  const id = makeInvoice([{ description: 'A', rate: 100, amount: 100 }], 0, 'Pending', '2026-08-01', '2026-08-15');
  addPayment(id, 40, '2026-07-01');
  addPayment(id, 40, '2026-08-05');
  addPayment(id, 20, '2026-08-20');
  const f = svc.getInvoiceFinancials(id);
  check('paidDate', f.paidDate, '2026-08-20');
}

console.log('\nVAT included in total for crossing');
{
  const id = makeInvoice([{ description: 'A', rate: 100, amount: 100 }], 15, 'Pending', '2026-08-01', '2026-08-15');
  addPayment(id, 100, '2026-08-10');
  let f = svc.getInvoiceFinancials(id);
  check('not yet paid (100 < 115)', f.status === 'Paid', false);
  addPayment(id, 15, '2026-08-25');
  f = svc.getInvoiceFinancials(id);
  check('paid total', f.invoiceTotal, 115);
  check('paidDate', f.paidDate, '2026-08-25');
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
try { real.close(); } catch (_) {}
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
process.exit(fail === 0 ? 0 : 1);
