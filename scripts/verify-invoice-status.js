// Verifies the invoice financial-status service against a COPY of the live DB.
// Run with:  $env:ELECTRON_RUN_AS_NODE="1"; & electron.exe scripts\verify-invoice-status.js
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const os = require('os');

const liveDb = path.join(__dirname, '..', 'src', 'backend', 'db', 'accounts.db');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'invstatus-'));
const tmpDb = path.join(tmpDir, 'accounts_copy.db');
fs.copyFileSync(liveDb, tmpDb);

const Database = require('better-sqlite3');
const real = new Database(tmpDb);

// Seed require.cache with a dbmgr stub pointing at the COPY, so the real service
// module is exercised without ever touching the live database.
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

// ── Build an isolated test invoice in the copy ──────────────────────────────
const now = new Date().toISOString().slice(0, 10);
const existingCust = real.prepare('SELECT id FROM customers LIMIT 1').get();
if (!existingCust) { console.error('No customer row found in copy; cannot run test'); process.exit(1); }
const custId = existingCust.id;
const prodRow = real.prepare('SELECT id FROM products LIMIT 1').get();
const prodId = prodRow ? prodRow.id : 0;

function makeInvoice(lines, paid, status) {
  const invId = real.prepare(
    "INSERT INTO invoices (customer, start_date, last_date, number, vat, status) VALUES (?,?,?,?,?,?)"
  ).run(custId, now, now, `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, 0, status).lastInsertRowid;
  const ins = real.prepare('INSERT INTO invoice_lines (invoice_id, product, description, quantity, rate, amount) VALUES (?,?,?,?,?,?)');
  for (const l of lines) ins.run(invId, prodId, l.description || 'Item', l.quantity || 1, l.rate || 0, l.amount || 0);
  if (paid > 0) {
    const payId = real.prepare("INSERT INTO payments (invoiceId, customerId, amount, paymentMethod, date, createdAt, status) VALUES (?,?,?,?,?,datetime('now'),'Pending Deposit')")
      .run(invId, custId, paid, 'cash', now).lastInsertRowid;
    real.prepare('INSERT INTO payment_allocations (paymentId, invoiceId, amount) VALUES (?,?,?)').run(payId, invId, paid);
  }
  return invId;
}

console.log('\nTEST 1 — fully paid invoice, then increase total');
{
  const id = makeInvoice([{ description: 'Eggs', quantity: 25, rate: 3, amount: 75 }], 75, 'Paid');
  const f1 = svc.recalcInvoiceFinancials(id);
  check('initial status', f1.status, 'Paid');
  check('initial balance', f1.balance, 0);
  // Simulate an edit that adds another $75 line (edits rewrite lines).
  real.prepare('INSERT INTO invoice_lines (invoice_id, product, description, quantity, rate, amount) VALUES (?,?,?,?,?,?)').run(id, prodId, 'Milk', 1, 75, 75);
  const f2 = svc.recalcInvoiceFinancials(id);
  check('new total', f2.invoiceTotal, 150);
  check('paid to date unchanged', f2.paidToDate, 75);
  check('new balance', f2.balance, 75);
  check('new status', f2.status, 'Partially Paid');
  const pay = real.prepare('SELECT amount FROM payments WHERE invoiceId = ?').get(id);
  check('payment amount unchanged', Number(pay.amount), 75);
  const stored = real.prepare('SELECT status, balance FROM invoices WHERE id = ?').get(id);
  check('persisted status', stored.status, 'Partially Paid');
  check('persisted balance', Number(stored.balance), 75);
}

console.log('\nTEST 2 — add second payment reaches Paid');
{
  const id = makeInvoice([{ description: 'A', quantity: 1, rate: 100, amount: 100 }], 40, 'Partially Paid');
  const f1 = svc.recalcInvoiceFinancials(id);
  check('status before', f1.status, 'Partially Paid');
  const payId = real.prepare("INSERT INTO payments (invoiceId, customerId, amount, paymentMethod, date, createdAt, status) VALUES (?,?,?,?,?,datetime('now'),'Pending Deposit')")
    .run(id, custId, 60, 'cash', now).lastInsertRowid;
  real.prepare('INSERT INTO payment_allocations (paymentId, invoiceId, amount) VALUES (?,?,?)').run(payId, id, 60);
  const f2 = svc.recalcInvoiceFinancials(id);
  check('paid', f2.paidToDate, 100);
  check('balance', f2.balance, 0);
  check('status', f2.status, 'Paid');
}

console.log('\nTEST 3 — overpayment is represented, payment preserved');
{
  const id = makeInvoice([{ description: 'A', quantity: 1, rate: 150, amount: 150 }], 150, 'Paid');
  real.prepare('INSERT INTO invoice_lines (invoice_id, product, description, quantity, rate, amount) VALUES (?,?,?,?,?,?)').run(id, prodId, 'B', 0, 0, 0);
  // reduce total: delete all lines, re-add one 100 line
  real.prepare('DELETE FROM invoice_lines WHERE invoice_id = ?').run(id);
  real.prepare('INSERT INTO invoice_lines (invoice_id, product, description, quantity, rate, amount) VALUES (?,?,?,?,?,?)').run(id, prodId, 'A', 1, 100, 100);
  const f = svc.recalcInvoiceFinancials(id);
  check('total', f.invoiceTotal, 100);
  check('paid', f.paidToDate, 150);
  check('stored balance clamped', f.balance, 0);
  check('overpayment exposed', f.overpayment, 50);
  check('status', f.status, 'Paid');
  const pay = real.prepare('SELECT amount FROM payments WHERE invoiceId = ?').get(id);
  check('payment preserved', Number(pay.amount), 150);
}

console.log('\nTEST 4 — zero payment invoice must not remain Paid');
{
  const id = makeInvoice([{ description: 'A', quantity: 1, rate: 100, amount: 100 }], 0, 'Paid');
  const f = svc.recalcInvoiceFinancials(id);
  // Invoice status is fully automatic: unpaid + balance outstanding ⇒ OPEN.
  check('status corrected', f.status, 'Open');
  check('paid', f.paidToDate, 0);
  check('balance', f.balance, 100);
}

console.log('\nTEST 5 — document states preserved');
{
  check('Void preserved', svc.deriveInvoiceStatus({ currentStatus: 'Void', invoiceTotal: 100, paidToDate: 50 }), 'Void');
  check('Draft preserved', svc.deriveInvoiceStatus({ currentStatus: 'Draft', invoiceTotal: 100, paidToDate: 0 }), 'Draft');
  check('Cancelled preserved', svc.deriveInvoiceStatus({ currentStatus: 'Cancelled', invoiceTotal: 100, paidToDate: 50 }), 'Cancelled');
  // Legacy "Sent" is no longer a stored state — an unpaid invoice derives OPEN.
  check('legacy Sent maps to Open (unpaid)', svc.deriveInvoiceStatus({ currentStatus: 'Sent', invoiceTotal: 100, paidToDate: 0 }), 'Open');
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
try { real.close(); } catch (_) {}
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
process.exit(fail === 0 ? 0 : 1);
