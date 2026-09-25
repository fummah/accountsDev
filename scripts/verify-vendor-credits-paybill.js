/**
 * verify-vendor-credits-paybill.js
 *
 * Pay Bill + Vendor Credits: same-vendor credits apply against a bill; only the
 * cash remainder creates a check and hits Bank; credits reduce AP without
 * touching Bank; no $0 check; no double posting; concurrency-safe.
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

require('./lib/testDb.js').useScratchCopy({ label: 'verify-vendor-credits-paybill' });
const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const BillPayments = require(path.join(ROOT, 'src', 'backend', 'models', 'billPayments.js'));
const VendorCredits = require(path.join(ROOT, 'src', 'backend', 'models', 'vendorCredits.js'));
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js')).raw;

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};
const read = (rel) => fs.readFileSync(path.join(FE, rel), 'utf8');
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

console.log('\n=== Fixtures ===');
const vendor = db.prepare('SELECT id FROM suppliers ORDER BY id LIMIT 1').get();
const vendor2 = db.prepare('SELECT id FROM suppliers ORDER BY id LIMIT 1 OFFSET 1').get();
const bank = db.prepare("SELECT id, name FROM chart_of_accounts WHERE LOWER(type)='bank' AND status='Active' ORDER BY id LIMIT 1").get();
check('fixtures: 2 vendors + a bank account', !!(vendor && vendor2 && bank), JSON.stringify({ vendor: vendor?.id, vendor2: vendor2?.id, bank: bank?.id }));

const makeBill = (vendorId, amount, ref) => {
  const exp = db.prepare("INSERT INTO expenses (payee, payment_account, payment_date, payment_method, ref_no, category, entered_by, approval_status, due_date, memo, terms) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run(vendorId, 'Accounts Payable', '2026-06-01', 'bill', ref, 'bill', 'system', 'Unpaid', '2026-06-01', 'test', 30);
  const id = exp.lastInsertRowid;
  db.prepare("INSERT INTO expense_lines (expense_id, category, description, amount, line_type) VALUES (?,?,?,?,?)").run(id, 'General', 'service', amount, 'account');
  return id;
};
const makeCredit = (vendorId, amount, ref) => {
  const res = VendorCredits.createCredit({ supplier_id: vendorId, date: '2026-06-01', amount, reference: ref, memo: 'test credit' });
  return res.id;
};
const creditRemaining = (id) => r2(db.prepare('SELECT remaining_amount FROM vendor_credits WHERE id = ?').get(id).remaining_amount);
const txAmount = (id) => r2(db.prepare('SELECT amount FROM transactions WHERE id = ?').get(id)?.amount);

if (vendor && vendor2 && bank) {
  // ── TEST 4 — partial credit + check ──────────────────────────────────────
  console.log('\n=== TEST 4: partial credit + check ===');
  const bill1 = makeBill(vendor.id, 1000, 'B-1000');
  const credit1 = makeCredit(vendor.id, 200, 'VC-200');
  const res1 = BillPayments.settleBillsWithCredits({ bills: [{ expenseId: bill1 }], credits: [{ creditId: credit1, amount: 200 }], paymentDate: '2026-06-05', bankAccount: bank.id });
  check('settlement succeeds', res1.success === true, JSON.stringify(res1));
  check('one check created for the cash remainder only', res1.checks?.length === 1 && txAmount(res1.checks[0].id) === 800, JSON.stringify(res1.checks));
  check('credit fully consumed (remaining 0)', creditRemaining(credit1) === 0, String(creditRemaining(credit1)));
  const pos1 = BillPayments.computeBillPosition(bill1);
  check('bill fully settled → Paid', pos1.remaining === 0 && pos1.status === 'Paid', JSON.stringify(pos1));

  // ── TEST 5 — full credit, no check ───────────────────────────────────────
  console.log('\n=== TEST 5: credit fully covers the bill (no $0 check) ===');
  const bill2 = makeBill(vendor.id, 250, 'B-250');
  const credit2 = makeCredit(vendor.id, 250, 'VC-250');
  const beforeTx = db.prepare('SELECT COUNT(*) AS c FROM transactions').get().c;
  const res2 = BillPayments.settleBillsWithCredits({ bills: [{ expenseId: bill2 }], credits: [{ creditId: credit2, amount: 250 }], paymentDate: '2026-06-05', bankAccount: null });
  check('settles without a bank account', res2.success === true, JSON.stringify(res2));
  check('NO check / bank transaction created', (res2.checks || []).length === 0 && db.prepare('SELECT COUNT(*) AS c FROM transactions').get().c === beforeTx);
  check('bill Paid', BillPayments.computeBillPosition(bill2).status === 'Paid');

  // ── TEST 6 — credit greater than bill ────────────────────────────────────
  console.log('\n=== TEST 6: credit greater than bill ===');
  const bill3 = makeBill(vendor.id, 250, 'B-250b');
  const credit3 = makeCredit(vendor.id, 400, 'VC-400');
  const res3 = BillPayments.settleBillsWithCredits({ bills: [{ expenseId: bill3 }], credits: [{ creditId: credit3, amount: 400 }], paymentDate: '2026-06-05' });
  check('applies only the bill amount', res3.success === true && r2(res3.creditsApplied) === 250, JSON.stringify(res3.creditsApplied));
  check('unused credit remains available (150)', creditRemaining(credit3) === 150, String(creditRemaining(credit3)));
  check('no check created', (res3.checks || []).length === 0);
  check('bill Paid', BillPayments.computeBillPosition(bill3).status === 'Paid');

  // ── TEST 7 — partial credit use ──────────────────────────────────────────
  console.log('\n=== TEST 7: partial credit use ===');
  const bill4 = makeBill(vendor.id, 1000, 'B-1000b');
  const credit4 = makeCredit(vendor.id, 500, 'VC-500');
  const res4 = BillPayments.settleBillsWithCredits({ bills: [{ expenseId: bill4 }], credits: [{ creditId: credit4, amount: 200 }], paymentDate: '2026-06-05', bankAccount: bank.id });
  check('credit remaining = 300', creditRemaining(credit4) === 300, String(creditRemaining(credit4)));
  check('check = 800', res4.checks?.length === 1 && txAmount(res4.checks[0].id) === 800, JSON.stringify(res4.checks));

  // ── TEST 8 — multiple credits ────────────────────────────────────────────
  console.log('\n=== TEST 8: multiple credits ===');
  const bill5 = makeBill(vendor.id, 500, 'B-500');
  const ca = makeCredit(vendor.id, 100, 'VC-A');
  const cb = makeCredit(vendor.id, 150, 'VC-B');
  const res5 = BillPayments.settleBillsWithCredits({ bills: [{ expenseId: bill5 }], credits: [{ creditId: ca, amount: 100 }, { creditId: cb, amount: 150 }], paymentDate: '2026-06-05', bankAccount: bank.id });
  check('credits total 250 applied', r2(res5.creditsApplied) === 250, String(res5.creditsApplied));
  check('bank payment = 250', res5.checks?.length === 1 && txAmount(res5.checks[0].id) === 250, JSON.stringify(res5.checks));

  // ── TEST 9 — cross-vendor credit rejected ────────────────────────────────
  console.log('\n=== TEST 9: cross-vendor credit rejected ===');
  const bill6 = makeBill(vendor.id, 300, 'B-300');
  const otherCredit = makeCredit(vendor2.id, 300, 'VC-OTHER');
  const cross = BillPayments.settleBillsWithCredits({ bills: [{ expenseId: bill6 }], credits: [{ creditId: otherCredit, amount: 300 }], paymentDate: '2026-06-05' });
  check('backend rejects a credit from another vendor', cross.success === false && /vendor/i.test(cross.error || ''), JSON.stringify(cross));

  // ── TEST 10/11 — voided / fully applied not usable ───────────────────────
  console.log('\n=== TEST 10/11: voided / exhausted credits rejected ===');
  const voided = makeCredit(vendor.id, 100, 'VC-VOID');
  db.prepare("UPDATE vendor_credits SET status='Voided', remaining_amount=0 WHERE id=?").run(voided);
  const vres = BillPayments.settleBillsWithCredits({ bills: [{ expenseId: bill6 }], credits: [{ creditId: voided, amount: 50 }], paymentDate: '2026-06-05' });
  check('voided credit rejected', vres.success === false, JSON.stringify(vres));

  // ── TEST 23 — over-application prevented (concurrency) ───────────────────
  console.log('\n=== TEST 23: over-application prevented ===');
  const small = makeCredit(vendor.id, 100, 'VC-SMALL');
  const over = BillPayments.settleBillsWithCredits({ bills: [{ expenseId: bill6 }], credits: [{ creditId: small, amount: 400 }], paymentDate: '2026-06-05' });
  check('applying more than available is rejected', over.success === false && /available/i.test(over.error || ''), JSON.stringify(over));

  // ── TEST 24/25 — accounting: credit does not touch bank; AP reduced once ─
  console.log('\n=== TEST 24/25: AP reduced by credit + cash only ===');
  const bill7 = makeBill(vendor.id, 1000, 'B-1000c');
  const credit7 = makeCredit(vendor.id, 200, 'VC-200b');
  const bankLinesBefore = db.prepare("SELECT COALESCE(SUM(credit),0) AS c FROM journal_lines WHERE account_id = ?").get(bank.id).c;
  const res7 = BillPayments.settleBillsWithCredits({ bills: [{ expenseId: bill7 }], credits: [{ creditId: credit7, amount: 200 }], paymentDate: '2026-06-05', bankAccount: bank.id });
  const bankLinesAfter = db.prepare("SELECT COALESCE(SUM(credit),0) AS c FROM journal_lines WHERE account_id = ?").get(bank.id).c;
  check('bank credited by the CASH portion only (800)', r2(bankLinesAfter - bankLinesBefore) === 800, String(r2(bankLinesAfter - bankLinesBefore)));
  const creditApps = VendorCredits.getBillApplications(bill7);
  check('bill shows the applied vendor credit (traceability)', creditApps.length === 1 && r2(creditApps[0].amount) === 200, JSON.stringify(creditApps));
  const creditApps2 = VendorCredits.getApplications(credit7);
  check('credit shows the bill it was applied to (traceability)', creditApps2.length === 1 && Number(creditApps2[0].expense_id) === bill7, JSON.stringify(creditApps2));
}

// ── Frontend wiring ────────────────────────────────────────────────────────
console.log('\n=== Frontend wiring ===');
const pay = read('components/vendors/bills/PayBills.js');
check('Pay Bill has a Vendor Credits selector', /Vendor Credits/.test(pay) && /vendorCreditsAvailable/.test(pay));
check('credits are loaded by vendorId (payee)', /loadCredits\(vIds\[0\]\)/.test(pay) && /Number\(b\.payee\)/.test(pay));
check('supports multiple credits + remove', /mode="multiple"/.test(pay) && /DeleteOutlined/.test(pay));
check('dynamic button text (credit-only vs check)', /Apply Vendor Credit/.test(pay) && /Record Payment & Print Check/.test(pay));
check('bank account only required when there is a cash portion', /disabled=\{bankPayment <= 0\.005\}/.test(pay) && /bankPayment > 0\.005 \? \[/.test(pay));
check('uses the atomic settle API', /billSettleWithCredits/.test(pay));
check('mixed-vendor batch blocks credit use', /Mixed vendors selected/.test(pay));
check('live settlement summary (bill / credits / bank)', /Bill Balance/.test(pay) && /Vendor Credits/.test(pay) && /Bank Payment/.test(pay));

const eb = read('components/vendors/bills/EnterBill.js');
check('Bill shows Vendor Credits Applied', /Vendor Credits Applied/.test(eb) && /billCreditApplications/.test(eb));
const vc = read('components/vendors/VendorCredits.js');
check('Vendor Credit page shows applied bills', /expandedRowRender/.test(vc) && /vendorCreditApplications/.test(vc));

console.log('\n=== IPC / preload ===');
check('bill-settle-with-credits IPC + preload wired',
  /bill-settle-with-credits/.test(fs.readFileSync(path.join(ROOT, 'src', 'backend', 'handlers', 'ipcHandlers.js'), 'utf8')) &&
  /billSettleWithCredits/.test(fs.readFileSync(path.join(ROOT, 'src', 'backend', 'preload.js'), 'utf8')));
check('credit application traceability IPC + preload wired',
  /vendor-credits-applications/.test(fs.readFileSync(path.join(ROOT, 'src', 'backend', 'handlers', 'vendorCreditHandlers.js'), 'utf8')) &&
  /bill-credit-applications/.test(fs.readFileSync(path.join(ROOT, 'src', 'backend', 'handlers', 'vendorCreditHandlers.js'), 'utf8')));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
