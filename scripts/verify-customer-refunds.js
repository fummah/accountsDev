/**
 * verify-customer-refunds.js
 *
 * Customer Refund workflow: refunds are NEW transactions linked to the original
 * payment (never a status toggle, never erasing/editing the payment). Payment
 * refunds un-wind settlement (Dr AR / Cr Bank); over-refund is prevented;
 * reversal restores everything.
 *
 * Runs on a SCRATCH COPY; frontend checks read the source.
 */
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const Module = require('module');
const electronStub = { ipcMain: { handle: () => {} }, app: { isPackaged: true } };
const originalLoad = Module._load;
Module._load = function (request) { if (request === 'electron') return electronStub; return originalLoad.apply(this, arguments); };

require('./lib/testDb.js').useScratchCopy({ label: 'verify-customer-refunds' });
const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const Payments = require(path.join(ROOT, 'src', 'backend', 'models', 'payments.js'));
const CustomerRefunds = require(path.join(ROOT, 'src', 'backend', 'models', 'customerRefunds.js'));
const CreditNotes = require(path.join(ROOT, 'src', 'backend', 'models', 'creditNotes.js'));
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js')).raw;

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};
const read = (rel) => fs.readFileSync(path.join(FE, rel), 'utf8');
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

console.log('\n=== Fixtures ===');
const customer = db.prepare('SELECT id FROM customers ORDER BY id LIMIT 1').get();
const bank = db.prepare("SELECT id, name FROM chart_of_accounts WHERE LOWER(type)='bank' AND status='Active' ORDER BY id LIMIT 1").get();
const expenseAcc = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type)='expense' AND status='Active' ORDER BY id LIMIT 1").get();
check('fixtures: customer + bank account', !!(customer && bank), JSON.stringify({ customer: customer?.id, bank: bank?.id }));

const makeInvoice = (amount, ref) => {
  const inv = db.prepare("INSERT INTO invoices (customer, number, status, start_date, last_date, vat) VALUES (?,?,?,?,?,0)")
    .run(customer.id, ref, 'Open', '2026-06-01', '2026-06-30');
  const id = inv.lastInsertRowid;
  db.prepare("INSERT INTO invoice_lines (invoice_id, product, description, quantity, rate, amount) VALUES (?,?,?,?,?,?)")
    .run(id, 0, 'Widget', 1, amount, amount);
  return id;
};
const makePayment = (amount, allocations) => {
  const res = Payments.createWithAllocations(
    { customerId: customer.id, amount, paymentMethod: 'Bank Transfer', date: '2026-06-10', reference: 'PAY-TEST' },
    allocations || []
  );
  return res.id;
};
const bankCreditTotal = () => r2(db.prepare("SELECT COALESCE(SUM(jl.credit),0) AS c FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_id WHERE jl.account_id = ? AND je.status = 'Posted'").get(bank.id).c);
const invoiceBalance = (invoiceId) => Payments.recomputeInvoice(invoiceId)?.balance;

if (customer && bank) {
  // ── TEST 4 — partial refund preserves the original payment ────────────────
  console.log('\n=== TEST 4: partial payment refund ===');
  const bill = makeInvoice(500, 'INV-P500');
  const pay = makePayment(500, [{ invoiceId: bill, amount: 500 }]);
  const before = CustomerRefunds.getRefundable(pay);
  check('refundable = payment amount', r2(before.refundable) === 500 && r2(before.refunded) === 0, JSON.stringify(before));
  const bankBefore = bankCreditTotal();
  const ref1 = CustomerRefunds.createRefund({ paymentId: pay, customerId: customer.id, amount: 200, date: '2026-06-15', bankAccountId: bank.id, method: 'Bank Transfer', reason: 'Returned Goods' });
  check('refund succeeds', ref1.success === true, JSON.stringify(ref1));
  check('refund numbered REF-#####', /^REF-\d{5}$/.test(ref1.refund_number || ''), ref1.refund_number);
  check('ORIGINAL payment amount is unchanged', r2(db.prepare('SELECT amount FROM payments WHERE id = ?').get(pay).amount) === 500);
  const after1 = CustomerRefunds.getRefundable(pay);
  check('refunded = 200, refundable = 300', r2(after1.refunded) === 200 && r2(after1.refundable) === 300, JSON.stringify(after1));
  check('refund record is separate and linked to the payment',
    !!db.prepare('SELECT 1 FROM customer_refunds WHERE id = ? AND payment_id = ?').get(ref1.id, pay));
  check('bank decreases by the refund amount', r2(bankCreditTotal() - bankBefore) === 200, String(r2(bankCreditTotal() - bankBefore)));

  // ── TEST 7 — refunding an applied payment reopens the invoice ────────────
  console.log('\n=== TEST 7: refund reopens the invoice ===');
  check('invoice balance reopened to 200', r2(invoiceBalance(bill)) === 200, String(invoiceBalance(bill)));
  check('invoice is no longer Paid', Payments.recomputeInvoice(bill)?.status !== 'Paid', Payments.recomputeInvoice(bill)?.status);

  // ── TEST 5 — second partial refund completes it ──────────────────────────
  console.log('\n=== TEST 5: second refund completes it ===');
  const ref2 = CustomerRefunds.createRefund({ paymentId: pay, customerId: customer.id, amount: 300, date: '2026-06-16', bankAccountId: bank.id });
  check('second refund succeeds', ref2.success === true, JSON.stringify(ref2));
  check('refundable now 0', r2(CustomerRefunds.getRefundable(pay).refundable) === 0);
  check('two separate refund records exist', CustomerRefunds.getByPayment(pay).length === 2);

  // ── TEST 6 — over-refund prevented ───────────────────────────────────────
  console.log('\n=== TEST 6: over-refund prevented ===');
  const over = CustomerRefunds.createRefund({ paymentId: pay, customerId: customer.id, amount: 50, date: '2026-06-17', bankAccountId: bank.id });
  check('refund beyond refundable is rejected', over.success === false && /refundable|exceeds/i.test(over.error || ''), JSON.stringify(over));

  // ── TEST 8 — unapplied refund leaves the invoice alone ───────────────────
  console.log('\n=== TEST 8: refund of unapplied funds ===');
  const inv8 = makeInvoice(300, 'INV-U300');
  const pay8 = makePayment(500, [{ invoiceId: inv8, amount: 300 }]); // 300 applied, 200 unapplied
  const balBefore = r2(invoiceBalance(inv8));
  const ref8 = CustomerRefunds.createRefund({ paymentId: pay8, customerId: customer.id, amount: 200, date: '2026-06-18', bankAccountId: bank.id });
  check('unapplied refund succeeds', ref8.success === true, JSON.stringify(ref8));
  check('invoice balance unchanged (refund came from unapplied)', r2(invoiceBalance(inv8)) === balBefore, `${balBefore} -> ${invoiceBalance(inv8)}`);
  const preview = CustomerRefunds.previewRefund(pay8, 1);
  check('unapplied credit reduced to 0', r2(preview?.fromUnapplied) === 0 && r2(CustomerRefunds.getRefundable(pay8).refunded) === 200, JSON.stringify(preview));

  // ── TEST 24/26 — customer balance reconciles ─────────────────────────────
  console.log('\n=== TEST 26: customer balance ===');
  const bal = Payments.getCustomerBalance(customer.id);
  check('balance exposes refundedTotal + netPaidTotal', 'refundedTotal' in bal && 'netPaidTotal' in bal, JSON.stringify(bal));
  check('netPaidTotal = paidTotal - refundedTotal', r2(bal.netPaidTotal) === r2(bal.paidTotal - bal.refundedTotal), JSON.stringify({ paid: bal.paidTotal, ref: bal.refundedTotal, net: bal.netPaidTotal }));

  // ── TEST 23 — reversal restores the refundable + bank ────────────────────
  console.log('\n=== TEST 23: refund reversal ===');
  const bankBeforeRev = bankCreditTotal();
  const rev = CustomerRefunds.reverseRefund(ref1.id);
  check('refund reverses', rev.success === true, JSON.stringify(rev));
  check('bank effect reversed', r2(bankCreditTotal() - bankBeforeRev) === -200, String(r2(bankCreditTotal() - bankBeforeRev)));
  check('refundable restored for the reversed refund (500 - 300 active = 200)', r2(CustomerRefunds.getRefundable(pay).refundable) === 200, String(CustomerRefunds.getRefundable(pay).refundable));
  check('refund history remains (status Reversed)', db.prepare('SELECT status FROM customer_refunds WHERE id = ?').get(ref1.id).status === 'Reversed');

  // ── TEST 9 — cross-customer rejected ─────────────────────────────────────
  console.log('\n=== cross-customer / bad account ===');
  const otherCust = db.prepare('SELECT id FROM customers ORDER BY id LIMIT 1 OFFSET 1').get();
  if (otherCust) {
    const cross = CustomerRefunds.createRefund({ paymentId: pay, customerId: otherCust.id, amount: 10, date: '2026-06-19', bankAccountId: bank.id });
    check('refund against the wrong customer is rejected', cross.success === false, JSON.stringify(cross));
  }
  const noBank = CustomerRefunds.createRefund({ paymentId: pay, customerId: customer.id, amount: 10, date: '2026-06-19' });
  check('a bank/cash account is required', noBank.success === false && /account/i.test(noBank.error || ''), JSON.stringify(noBank));

  // ── TEST 12/18/19 — invoice credit memo (+ optional refund) ──────────────
  console.log('\n=== TEST 12/18: invoice credit memo ===');
  if (expenseAcc) {
    const inv12 = makeInvoice(400, 'INV-C400');
    const cn = CustomerRefunds.createInvoiceRefund({ invoiceId: inv12, customerId: customer.id, amount: 150, reason: 'Returned Goods', refundCash: false });
    check('credit memo created (no cash)', cn.success === true && cn.creditNoteId, JSON.stringify(cn));
    check('credit note stored', !!db.prepare('SELECT 1 FROM credit_notes WHERE id = ?').get(cn.creditNoteId));
    check('no refund created when refundCash is false', !cn.refund);

    const cn2 = CustomerRefunds.createInvoiceRefund({ invoiceId: inv12, customerId: customer.id, amount: 100, reason: 'Goodwill', refundCash: true, bankAccountId: bank.id, method: 'Cash' });
    check('credit + cash refund created', cn2.success === true && cn2.refund && cn2.refund.success, JSON.stringify(cn2));
    check('linked refund carries the credit note id', db.prepare('SELECT credit_note_id FROM customer_refunds WHERE id = ?').get(cn2.refund.id).credit_note_id === cn2.creditNoteId);
  }
}

// ── Frontend wiring ────────────────────────────────────────────────────────
console.log('\n=== Frontend wiring ===');
const hist = read('components/customers/payments/CustomerPaymentHistory.js');
check('Payments tab has a Refund action', /Refund<\/Button>/.test(hist) && /openRefundForPayment/.test(hist));
check('payment rows show Refunded + Status', /title: 'Refunded'/.test(hist) && /refundStatusOf/.test(hist));
check('Refund chooser offers payment + invoice', /Refund Selected Payment/.test(hist) && /Refund \/ Credit an Invoice/.test(hist));
check('summary cards include Refunded + Net Payments', /Refunded/.test(hist) && /Net Payments/.test(hist));
check('Refund Payment modal exists with allocation preview', /RefundPaymentModal/.test(hist) && /customerRefundPreview/.test(read('components/customers/payments/RefundPaymentModal.js')));
check('Refund Invoice modal exists (credit memo + optional cash)', /RefundInvoiceModal/.test(hist) && /invoiceRefundCreate/.test(read('components/customers/payments/RefundInvoiceModal.js')));
check('Payment detail shows refund history', /Refund History/.test(read('components/customers/payments/PaymentDetailsModal.js')) && /customerRefundsByPayment/.test(read('components/customers/payments/PaymentDetailsModal.js')));
check('Transaction list includes Refunds', /docType: 'Refund'/.test(read('components/customers/CustomerDetails.js')));

console.log('\n=== IPC / preload ===');
const handlers = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'handlers', 'customerHandlers.js'), 'utf8');
check('refund IPC handlers registered',
  /customer-refund-create/.test(handlers) && /customer-refund-reverse/.test(handlers) && /invoice-refund-create/.test(handlers) && /customer-refundable/.test(handlers));
const preload = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'preload.js'), 'utf8');
check('preload exposes refund APIs',
  /customerRefundCreate/.test(preload) && /customerRefundable/.test(preload) && /invoiceRefundCreate/.test(preload));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
