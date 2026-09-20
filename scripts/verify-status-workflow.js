/**
 * Automated verification for the AccuLedger Invoice + Quote status workflow.
 *
 * Run with the repo's Electron binary in plain-node mode (better-sqlite3 is
 * built for Electron's ABI):
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/verify-status-workflow.js
 *
 * The script exercises the REAL models against the REAL database. It creates a
 * dedicated test customer + documents and deletes every record it creates in a
 * `finally` block. The caller should still snapshot the DB file first.
 */

const path = require('path');

// dbmgr enables better-sqlite3 verbose SQL logging in dev (options.verbose =
// console.log). Silence it while the models load, then restore logging.
const realLog = console.log.bind(console);
console.log = () => {};
// Verify against a SCRATCH COPY of the company file — loading the model
// layer runs createTable() + the migration runner, which would otherwise
// rewrite the live bookkeeping database. Must come before any model require.
require('./lib/testDb.js').useScratchCopy({ label: 'verify-status-workflow' });

const models = require('../src/backend/models/index.js');
const dbmgr = require('../src/backend/models/dbmgr.js');
console.log = realLog;
const db = dbmgr.raw;
const { getInvoiceFinancials } = require('../src/backend/services/invoiceFinancials');

const { Invoices, Quotes, Payments } = models;

// ── tiny test harness ────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  [PASS] ${label}`);
  } else {
    failed++;
    failures.push(`${label}\n      expected: ${e}\n      actual:   ${a}`);
    console.log(`  [FAIL] ${label}\n      expected: ${e}\n      actual:   ${a}`);
  }
}

const fin = (invoiceId) => getInvoiceFinancials(Number(invoiceId));

// ── test fixtures ────────────────────────────────────────────────────────────
const created = { invoices: [], payments: [], quotes: [], customerId: null };

function makeCustomer() {
  const res = db.prepare(`
    INSERT INTO customers (title, first_name, last_name, mobile_number, display_name, email, status, entered_by, date_entered)
    VALUES ('', 'ZZStatusTest', 'Workflow', '', 'ZZ Status Workflow Test', 'zz-status-test@example.invalid', 'Active', 'test', datetime('now'))
  `).run();
  created.customerId = Number(res.lastInsertRowid);
  return created.customerId;
}

function createInvoice(lines, { vat = 0, number = null, status = null } = {}) {
  const res = Invoices.insertInvoice(
    created.customerId, 'zz-status-test@example.invalid', false, 'Test Address', '',
    '2026-01-01', '2026-01-31', '', '', number, 'test', vat, status, lines
  );
  if (!res || res.success === false) throw new Error('insertInvoice failed: ' + JSON.stringify(res));
  const id = Number(res.invoiceId);
  created.invoices.push(id);
  return id;
}

function payInvoice(invoiceId, amount) {
  const res = Payments.createWithAllocations(
    { customerId: created.customerId, amount, paymentMethod: 'Test', date: '2026-01-15', memo: 'test', reference: 'TEST', depositTo: null },
    [{ invoiceId, amount }]
  );
  if (!res || res.success === false) throw new Error('createWithAllocations failed: ' + JSON.stringify(res));
  created.payments.push(Number(res.id));
  return Number(res.id);
}

function createQuote(lines, { vat = 0 } = {}) {
  const res = Quotes.insertQuote(
    'Pending', created.customerId, 'zz-status-test@example.invalid', false, 'Test Address',
    '2026-01-01', '2026-01-31', '', '', null, 'test', vat, lines
  );
  if (!res || res.success === false) throw new Error('insertQuote failed: ' + JSON.stringify(res));
  const id = Number(res.quoteId);
  created.quotes.push(id);
  return id;
}

const line = (amount) => [{ product: 1, description: 'Test line', quantity: 1, rate: amount, amount }];

// ── cleanup ──────────────────────────────────────────────────────────────────
function cleanup() {
  try {
    for (const id of created.payments) {
      try { db.prepare('DELETE FROM payment_allocations WHERE paymentId = ?').run(id); } catch { /* ignore */ }
      try { db.prepare('DELETE FROM payments WHERE id = ?').run(id); } catch { /* ignore */ }
    }
    for (const id of created.invoices) {
      try { db.prepare('DELETE FROM invoice_lines WHERE invoice_id = ?').run(id); } catch { /* ignore */ }
      try { db.prepare('DELETE FROM invoices WHERE id = ?').run(id); } catch { /* ignore */ }
      try {
        const entries = db.prepare("SELECT id FROM journal_entries WHERE source_type = 'invoice' AND source_id = ?").all(id);
        for (const e of entries) {
          try { db.prepare('DELETE FROM journal_lines WHERE entry_id = ?').run(e.id); } catch { /* ignore */ }
          try { db.prepare('DELETE FROM journal_entries WHERE id = ?').run(e.id); } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }
    for (const id of created.quotes) {
      try { db.prepare('DELETE FROM quote_lines WHERE quote_id = ?').run(id); } catch { /* ignore */ }
      try { db.prepare('DELETE FROM quotes WHERE id = ?').run(id); } catch { /* ignore */ }
    }
    if (created.customerId) {
      try { db.prepare('DELETE FROM customers WHERE id = ?').run(created.customerId); } catch { /* ignore */ }
    }
  } catch (e) {
    console.error('[cleanup] error:', e.message);
  }
}

// ── tests ────────────────────────────────────────────────────────────────────
function testInvoiceLifecycle() {
  console.log('\n== Invoice lifecycle (PART A) ==');
  const id = createInvoice(line(100));

  let f = fin(id);
  check('new $100 invoice → status Open', f.status, 'Open');
  check('new $100 invoice → balance 100', f.balance, 100);
  check('new $100 invoice → paidToDate 0', f.paidToDate, 0);
  check('new $100 invoice never lands on Pending', f.status === 'Pending', false);

  const p40 = payInvoice(id, 40);
  f = fin(id);
  check('pay $40 → status Partially Paid', f.status, 'Partially Paid');
  check('pay $40 → paidToDate 40', f.paidToDate, 40);
  check('pay $40 → balance 60', f.balance, 60);

  const p60 = payInvoice(id, 60);
  f = fin(id);
  check('pay $60 more → status Paid', f.status, 'Paid');
  check('pay $60 more → balance 0', f.balance, 0);
  check('fully paid invoice has a paidDate', !!f.paidDate, true);

  Payments.delete(p60);
  created.payments = created.payments.filter(x => x !== p60);
  f = fin(id);
  check('reverse $60 → status Partially Paid (moves backwards)', f.status, 'Partially Paid');
  check('reverse $60 → balance 60', f.balance, 60);

  Payments.delete(p40);
  created.payments = created.payments.filter(x => x !== p40);
  f = fin(id);
  check('remove remaining $40 → status Open', f.status, 'Open');
  check('remove remaining $40 → balance 100', f.balance, 100);
  check('remove remaining $40 → never stays Paid', f.status === 'Paid', false);
}

async function testNoManualStatus() {
  console.log('\n== Status cannot be set by hand (PART E) ==');

  // Create with an injected financial status → must be ignored.
  const id = createInvoice(line(100), { status: 'Paid' });
  check('insert with status "Paid" → Open', fin(id).status, 'Open');

  // Update with an injected financial status → must be ignored.
  const res = await Invoices.updateInvoice({
    id, customer: created.customerId, customer_email: 'zz-status-test@example.invalid',
    islater: false, billing_address: 'Test Address', terms: '', start_date: '2026-01-01',
    last_date: '2026-01-31', number: '', vat: 0, message: '', statement_message: '',
    status: 'PAID', lines: line(100),
  });
  check('update with status "PAID" → still Open', fin(id).status, 'Open');
  check('update reports derived status, not the injected one', res.financials.status, 'Open');

  // Lowercase / arbitrary financial values too.
  await Invoices.updateInvoice({
    id, customer: created.customerId, customer_email: '', islater: false, billing_address: '',
    terms: '', start_date: '2026-01-01', last_date: '2026-01-31', number: '', vat: 0,
    message: '', statement_message: '', status: 'pending', lines: line(100),
  });
  check('update with status "pending" → still Open', fin(id).status, 'Open');
}

async function testPaidInvoiceEdits() {
  console.log('\n== Editing an invoice that already has payments (PART A) ==');

  // $75 invoice, fully paid → Paid.
  const id = createInvoice(line(75));
  payInvoice(id, 75);
  check('$75 invoice paid in full → Paid', fin(id).status, 'Paid');

  // Raise the total to $150 → paid is preserved, so Partially Paid.
  await Invoices.updateInvoice({
    id, customer: created.customerId, customer_email: '', islater: false, billing_address: '',
    terms: '', start_date: '2026-01-01', last_date: '2026-01-31', number: '', vat: 0,
    message: '', statement_message: '', lines: line(150),
  });
  let f = fin(id);
  check('raise total $75 → $150 → Partially Paid', f.status, 'Partially Paid');
  check('raise total → payment untouched ($75)', f.paidToDate, 75);
  check('raise total → balance 75', f.balance, 75);

  // Lower the total to $100 with $100 paid → Paid.
  const id2 = createInvoice(line(200));
  payInvoice(id2, 100);
  check('$200 invoice with $100 paid → Partially Paid', fin(id2).status, 'Partially Paid');
  await Invoices.updateInvoice({
    id: id2, customer: created.customerId, customer_email: '', islater: false, billing_address: '',
    terms: '', start_date: '2026-01-01', last_date: '2026-01-31', number: '', vat: 0,
    message: '', statement_message: '', lines: line(100),
  });
  f = fin(id2);
  check('reduce total $200 → $100 with $100 paid → Paid', f.status, 'Paid');
  check('reduce total → payment preserved ($100)', f.paidToDate, 100);

  // Overpayment: total reduced below what was paid → credit, never rewritten.
  const id3 = createInvoice(line(200));
  payInvoice(id3, 200);
  check('$200 invoice paid $200 → Paid', fin(id3).status, 'Paid');
  await Invoices.updateInvoice({
    id: id3, customer: created.customerId, customer_email: '', islater: false, billing_address: '',
    terms: '', start_date: '2026-01-01', last_date: '2026-01-31', number: '', vat: 0,
    message: '', statement_message: '', lines: line(120),
  });
  f = fin(id3);
  check('reduce total below paid → Paid with overpayment', f.status, 'Paid');
  check('reduce total below paid → payment preserved ($200)', f.paidToDate, 200);
  check('reduce total below paid → overpayment 80', f.overpayment, 80);
}

async function testQuoteLifecycle() {
  console.log('\n== Quote lifecycle (PART B / PART C) ==');

  // 1. New quote → active (Pending).
  const q1 = createQuote(line(100));
  check('new quote → status Pending', Quotes.getSingleQuote(q1).status, 'Pending');

  // 2. Manual status writes are ignored.
  await Quotes.updateQuote({ id: q1, customer: created.customerId, customer_email: '', islater: false, billing_address: '', start_date: '2026-01-01', last_date: '2026-01-31', number: '', vat: 0, message: '', statement_message: '', status: 'Converted', quoteLines: line(100) });
  check('updateQuote with status "Converted" → still Pending', Quotes.getSingleQuote(q1).status, 'Pending');

  // 3. Accept → Accepted.
  let r = Quotes.acceptQuote(q1);
  check('acceptQuote → success', r.success, true);
  check('acceptQuote → status Accepted', r.status, 'Accepted');
  check('acceptQuote → persisted Accepted', Quotes.getSingleQuote(q1).status, 'Accepted');

  // 4. Accepting twice is idempotent.
  r = Quotes.acceptQuote(q1);
  check('acceptQuote twice → alreadyAccepted', !!r.alreadyAccepted, true);

  // 5. Accepted → Converted creates an invoice with automatic status.
  r = Quotes.convertQuoteToInvoice(q1);
  check('convert accepted quote → success', r.success, true);
  check('convert → quote status Converted', r.quoteStatus, 'Converted');
  check('convert → new invoice status Open', r.invoiceStatus, 'Open');
  check('convert → invoice id returned', Number.isFinite(Number(r.invoiceId)), true);
  if (r.invoiceId) created.invoices.push(Number(r.invoiceId));
  check('convert → quote persisted Converted', Quotes.getSingleQuote(q1).status, 'Converted');
  check('convert → quote links the invoice', Number(Quotes.getSingleQuote(q1).linkedInvoiceId), Number(r.invoiceId));

  // 6. Duplicate conversion is blocked (backend + friendly flag).
  r = Quotes.convertQuoteToInvoice(q1);
  check('convert twice → blocked', r.success, false);
  check('convert twice → alreadyConverted flag', !!r.alreadyConverted, true);

  // 7. Accept after convert is blocked.
  r = Quotes.acceptQuote(q1);
  check('accept a converted quote → blocked', r.success, false);
  check('accept a converted quote → invalidTransition', !!r.invalidTransition, true);

  // 8. Declined quote cannot be converted.
  const q2 = createQuote(line(50));
  r = Quotes.declineQuote(q2);
  check('declineQuote → status Declined', r.status, 'Declined');
  r = Quotes.convertQuoteToInvoice(q2);
  check('convert a declined quote → blocked', r.success, false);
  check('convert a declined quote → invalidTransition', !!r.invalidTransition, true);

  // 9. Declining an accepted quote is blocked.
  const q3 = createQuote(line(50));
  Quotes.acceptQuote(q3);
  r = Quotes.declineQuote(q3);
  check('decline an accepted quote → blocked', r.success, false);
  check('decline an accepted quote → invalidTransition', !!r.invalidTransition, true);

  // 10. Direct conversion from Pending is preserved.
  const q4 = createQuote(line(50));
  r = Quotes.convertQuoteToInvoice(q4);
  check('convert directly from Pending → success', r.success, true);
  check('convert from Pending → quote Converted', r.quoteStatus, 'Converted');
  if (r.invoiceId) created.invoices.push(Number(r.invoiceId));

  // 11. Conversion result invoice has an automatic (never manual) status.
  if (r.invoiceId) {
    const convFin = fin(r.invoiceId);
    check('converted invoice → Open (positive balance)', convFin.status, 'Open');
    check('converted invoice → balance 50', convFin.balance, 50);
  }
}

// ── run ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('AccuLedger status workflow verification');
  try {
    makeCustomer();
    testInvoiceLifecycle();
    await testNoManualStatus();
    await testPaidInvoiceEdits();
    await testQuoteLifecycle();
  } catch (e) {
    failed++;
    failures.push('UNCAUGHT: ' + (e && e.stack ? e.stack : e));
    console.error('\nUNCAUGHT ERROR:', e);
  } finally {
    cleanup();
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  }
  console.log('='.repeat(60));
  process.exit(failed === 0 ? 0 : 1);
}

main();
