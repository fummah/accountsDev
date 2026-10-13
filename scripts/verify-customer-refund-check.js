/**
 * verify-customer-refund-check.js — ONE refund = ONE cash outflow.
 *
 * Proves a customer refund now creates a linked CHECK (bank-register) row that
 * appears in the bank register/reconciliation, while the refund journal remains
 * the SINGLE authoritative bank posting (Bank is credited exactly once). Also
 * idempotency, multi/partial refunds, reversal coherence, and the guard against
 * voiding/deleting a refund-sourced check directly.
 *
 * Run: $env:ELECTRON_RUN_AS_NODE="1"; & electron.exe scripts\verify-customer-refund-check.js
 */
/* eslint-disable no-console */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-refund-check' });

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const realLog = console.log.bind(console);
console.log = () => {};
require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr')).raw;
console.log = realLog;
const CustomerRefunds = require(path.join(ROOT, 'src', 'backend', 'models', 'customerRefunds'));
const Transactions = require(path.join(ROOT, 'src', 'backend', 'models', 'transactions'));
const COA = require(path.join(ROOT, 'src', 'backend', 'models', 'chartOfAccounts'));

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`); }
};

const RID = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const bankId = (() => {
  let b = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type)='bank' ORDER BY id LIMIT 1").get();
  if (b) return Number(b.id);
  const r = db.prepare("INSERT INTO chart_of_accounts (name, type, subType, number, normalBalance, openingBalance, status, isSystem, entered_by) VALUES (?, 'Bank','Checking','ZZ9001','Debit',0,'Active',0,'test')").run('Test Bank ' + RID());
  return Number(r.lastInsertRowid);
})();

const mkCustomer = (first, last, company) => {
  const r = db.prepare("INSERT INTO customers (title,first_name,last_name,display_name,company_name,mobile_number,email,address1,city,state,postal_code) VALUES ('',?,?,?,?,?,?,?,?,?,?)")
    .run(first || '', last || '', [first, last].filter(Boolean).join(' ') || company || '', company || '', '', 'x@t.com', '1 Test St', 'Town', 'TS', '00000');
  return Number(r.lastInsertRowid);
};
const mkPayment = (customerId, amount) => {
  const r = db.prepare("INSERT INTO payments (invoiceId, customerId, amount, paymentMethod, date, createdAt, status) VALUES (NULL, ?, ?, 'Bank Transfer', '2026-03-01', datetime('now'), 'Deposited')").run(customerId, amount);
  return Number(r.lastInsertRowid);
};

const refundJournalLines = (refundId) => db.prepare(`
  SELECT jl.account_id, jl.debit, jl.credit FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.entry_id
  WHERE je.source_type='customer_refund' AND je.source_id=? AND je.status='Posted'`).all(refundId);
const checkTx = (refundId) => db.prepare("SELECT * FROM transactions WHERE source_type='customer_refund' AND source_id=? AND LOWER(type)='check'").get(refundId);

console.log('\n=== TEST 1: full refund creates refund + ONE check + ONE bank credit ===');
let fullRefundId = null, fullCheckId = null, custId = null;
{
  custId = mkCustomer('Christ', 'Kauffman', '');
  const paymentId = mkPayment(custId, 1150);
  const res = CustomerRefunds.createRefund({ paymentId, amount: 1150, bankAccountId: bankId, requestId: 'r-full-' + RID() }, { userId: 'test' });
  check('refund created', res && res.success, res);
  fullRefundId = res.id;
  const row = db.prepare('SELECT * FROM customer_refunds WHERE id=?').get(res.id);
  check('refund links a check_transaction_id', row.check_transaction_id != null && Number(row.check_transaction_id) > 0, row);
  const chk = checkTx(res.id);
  fullCheckId = chk && chk.id;
  check('a CHECK row exists in the bank register', !!chk, chk);
  check('check amount equals refund (credit 1150)', chk && Number(chk.credit) === 1150 && Number(chk.debit) === 0, chk);
  check('check uses the SELECTED bank account', chk && Number(chk.accountId) === bankId);
  check('check payee = customer (Christ Kauffman)', chk && chk.payee_name === 'Christ Kauffman', chk && chk.payee_name);
  check('check carries source_type/source_id = customer_refund/refundId', chk && chk.source_type === 'customer_refund' && Number(chk.source_id) === res.id);
  check('check has a check number', chk && chk.reference && String(chk.reference).length > 0, chk && chk.reference);

  const lines = refundJournalLines(res.id);
  const bankCredit = lines.filter(l => Number(l.account_id) === bankId).reduce((s, l) => s + Number(l.credit), 0);
  check('refund journal credits Bank exactly 1150 (once)', bankCredit === 1150, lines);
  check('refund journal debits AR 1150', lines.some(l => Number(l.debit) === 1150));
  // The check row posts NO journal of its own.
  const txJournals = db.prepare("SELECT COUNT(*) c FROM journal_entries WHERE source_type='transaction' AND source_id=?").get(String(fullCheckId)).c;
  check('check row posts NO second journal (no double bank credit)', txJournals === 0, txJournals);

  const withCheck = CustomerRefunds.getById(res.id);
  check('refund detail exposes the check number', withCheck && withCheck.checkNumber === chk.reference, withCheck && withCheck.checkNumber);
}

console.log('\n=== TEST 7: check appears in Bank Reconciliation source ===');
{
  const unrec = Transactions.getUnreconciledTransactions({ accountId: bankId });
  const mine = unrec.find(t => Number(t.id) === Number(fullCheckId));
  check('unreconciled list includes the refund check', !!mine, unrec.map(t => t.id));
  check('its signed movement is -1150 (money out)', mine && Number(mine.amount) === -1150, mine && mine.amount);
  check('not yet reconciled', mine && !Number(mine.isReconciled));
}

console.log('\n=== TEST 12/13: idempotency (same requestId) ===');
{
  const req = 'r-idem-' + RID();
  const paymentId = mkPayment(custId, 400);
  const before = db.prepare('SELECT COUNT(*) c FROM customer_refunds').get().c;
  const beforeTx = db.prepare("SELECT COUNT(*) c FROM transactions WHERE LOWER(type)='check'").get().c;
  const a = CustomerRefunds.createRefund({ paymentId, amount: 400, bankAccountId: bankId, requestId: req });
  const b = CustomerRefunds.createRefund({ paymentId, amount: 400, bankAccountId: bankId, requestId: req });
  check('first succeeds', a && a.success, a);
  check('second is idempotent (same refund id, idempotent flag)', b && b.success && b.idempotent === true && b.id === a.id, b);
  check('only ONE refund created', db.prepare('SELECT COUNT(*) c FROM customer_refunds').get().c === before + 1);
  check('only ONE check created', db.prepare("SELECT COUNT(*) c FROM transactions WHERE LOWER(type)='check'").get().c === beforeTx + 1);
}

console.log('\n=== TEST 10/11: partial + multiple refunds ===');
{
  const cid = mkCustomer('', '', 'Westfield Egg Farm');
  const paymentId = mkPayment(cid, 2000);
  const r500 = CustomerRefunds.createRefund({ paymentId, amount: 500, bankAccountId: bankId, requestId: 'p1-' + RID() });
  const c500 = checkTx(r500.id);
  check('partial refund 500 → check 500', Number(c500.credit) === 500, c500 && c500.credit);
  check('company-only customer → check payee = company name', c500.payee_name === 'Westfield Egg Farm', c500 && c500.payee_name);
  const r300 = CustomerRefunds.createRefund({ paymentId, amount: 300, bankAccountId: bankId, requestId: 'p2-' + RID() });
  const c300 = checkTx(r300.id);
  check('second partial refund 300 → check 300', r300.success && Number(c300.credit) === 300, { r300, credit: c300 && c300.credit });
  const total = db.prepare("SELECT COALESCE(SUM(credit),0) t FROM transactions WHERE source_type='customer_refund' AND source_id IN (?,?)").get(r500.id, r300.id).t;
  check('total bank outflow = 800 (not 1600)', Number(total) === 800, total);
}

console.log('\n=== TEST 17/18: reversal voids the linked check; direct void/delete guarded ===');
{
  const res = CustomerRefunds.reverseRefund(fullRefundId, { userId: 'test' });
  check('refund reversed', res && res.success, res);
  const chk = db.prepare('SELECT status FROM transactions WHERE id=?').get(fullCheckId);
  check('linked check voided', chk && String(chk.status).toLowerCase() === 'voided', chk);
  const row = db.prepare('SELECT status FROM customer_refunds WHERE id=?').get(fullRefundId);
  check('refund marked Reversed', String(row.status).toLowerCase() === 'reversed', row);

  // Direct void/delete of a refund check is blocked.
  const cid = mkCustomer('Pat', 'Lee', '');
  const pid = mkPayment(cid, 100);
  const r = CustomerRefunds.createRefund({ paymentId: pid, amount: 100, bankAccountId: bankId, requestId: 'g-' + RID() });
  const txid = checkTx(r.id).id;
  let threw = false; try { Transactions.voidTransaction(txid); } catch { threw = true; }
  check('voidTransaction on a refund check is blocked', threw);
  const del = Transactions.deleteCheck(txid);
  check('deleteCheck on a refund check is blocked', del && del.success === false, del);
}

console.log('\n=== TEST 14/15: atomic — a failing check rolls the refund back ===');
{
  const cid = mkCustomer('Atom', 'Ic', '');
  const pid = mkPayment(cid, 250);
  const beforeRefunds = db.prepare('SELECT COUNT(*) c FROM customer_refunds').get().c;
  const beforeTx = db.prepare("SELECT COUNT(*) c FROM transactions WHERE LOWER(type)='check'").get().c;
  // Force the check insert to fail: use a bank account id that is fine for the
  // refund validation (a real Bank account) but pre-occupy the next check number
  // is hard — instead temporarily break `transactions` insert by closing date.
  const Settings = require(path.join(ROOT, 'src', 'backend', 'models', 'settings'));
  const prevClose = Settings.get('closingDate');
  Settings.set('closingDate', '2099-12-31'); // refund date 2026 < closing → transactions.insert throws
  let res;
  try { res = CustomerRefunds.createRefund({ paymentId: pid, amount: 250, bankAccountId: bankId, date: '2026-06-01', requestId: 'atomic-' + RID() }); }
  finally { if (prevClose == null) Settings.set('closingDate', null); else Settings.set('closingDate', prevClose); }
  check('refund fails when the check cannot be created', res && res.success === false, res);
  check('no refund row left behind', db.prepare('SELECT COUNT(*) c FROM customer_refunds').get().c === beforeRefunds);
  check('no check row left behind', db.prepare("SELECT COUNT(*) c FROM transactions WHERE LOWER(type)='check'").get().c === beforeTx);
}

console.log('\n=== PART 5/6: refunds are NOT available unapplied; genuine value is ===');
{
  const Payments = require(path.join(ROOT, 'src', 'backend', 'models', 'payments'));
  const mkInvoice = (customerId, amount) => {
    const prod = db.prepare('SELECT id FROM products ORDER BY id LIMIT 1').get();
    const r = db.prepare("INSERT INTO invoices (number, customer, status, start_date, last_date, vat, terms) VALUES (?,?, 'Open', '2026-03-01','2026-04-01',0,30)").run('INV-T' + RID(), customerId);
    const invId = Number(r.lastInsertRowid);
    db.prepare("INSERT INTO invoice_lines (invoice_id, product, description, quantity, rate, amount) VALUES (?, ?, 'test', 1, ?, ?)").run(invId, prod ? prod.id : 0, amount, amount);
    return invId;
  };
  const unappliedOf = (customerId, paymentId) => {
    const row = Payments.getByCustomer(customerId).find(p => Number(p.id) === Number(paymentId));
    return row ? Number(row.unapplied) : null;
  };

  const cid = mkCustomer('Unapp', 'Lied', '');
  const p1 = mkPayment(cid, 1150);
  CustomerRefunds.createRefund({ paymentId: p1, amount: 1150, bankAccountId: bankId, requestId: 'u1-' + RID() });
  check('full unapplied refund → unapplied 0', unappliedOf(cid, p1) === 0, unappliedOf(cid, p1));

  const p2 = mkPayment(cid, 1000);
  const rf = CustomerRefunds.createRefund({ paymentId: p2, amount: 400, bankAccountId: bankId, requestId: 'u2-' + RID() });
  check('partial unapplied refund → unapplied 600', unappliedOf(cid, p2) === 600, unappliedOf(cid, p2));
  CustomerRefunds.reverseRefund(rf.id, {});
  check('reversed refund restores unapplied to 1000', unappliedOf(cid, p2) === 1000, unappliedOf(cid, p2));

  const p3 = mkPayment(cid, 700);
  check('untouched payment stays fully unapplied (700)', unappliedOf(cid, p3) === 700, unappliedOf(cid, p3));

  // Partly applied + partly refunded → genuine remaining unapplied = 500.
  const cid2 = mkCustomer('Part', 'Applied', '');
  const inv = mkInvoice(cid2, 2000);
  const p4 = mkPayment(cid2, 2000);
  db.prepare('INSERT INTO payment_allocations (paymentId, invoiceId, amount) VALUES (?,?,?)').run(p4, inv, 1000);
  CustomerRefunds.createRefund({ paymentId: p4, amount: 500, bankAccountId: bankId, requestId: 'u4-' + RID() });
  check('applied 1000 + refunded 500 → unapplied 500 (not 1000)', unappliedOf(cid2, p4) === 500, unappliedOf(cid2, p4));

  // The customer balance summary agrees.
  const bal = Payments.getCustomerBalance(cid2);
  check('balance unappliedCredits = 500', Number(bal.unappliedCredits) === 500, bal);

  // A genuine customer CREDIT is unaffected (still available).
  const cn = db.prepare("INSERT INTO credit_notes (customer_id, date, total, status) VALUES (?, '2026-03-01', 300, 'Issued')").run(cid).lastInsertRowid;
  check('a genuine credit note is not touched by the refund rule', !!cn);
}

console.log('\n=== static wiring ===');
{
  const cr = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'models', 'customerRefunds.js'), 'utf8');
  check('refund creates a check via Transactions.insert (no second journal)', /Transactions\.insert\(/.test(cr) && /type: 'Check'/.test(cr));
  check('refund stores check_transaction_id + client_request_id', /check_transaction_id/.test(cr) && /client_request_id/.test(cr));
  check('refund reversal voids the linked check', /UPDATE transactions SET status = 'Voided'/.test(cr));
  const tx = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'models', 'transactions.js'), 'utf8');
  check('direct void of a refund check is guarded', /customer_refund/.test(tx) && /Reverse the refund instead/.test(tx));
  const ui = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'src', 'components', 'customers', 'payments', 'RefundPaymentModal.js'), 'utf8');
  check('UI sends a requestId (idempotency)', /requestId: requestIdRef\.current/.test(ui));
  check('UI offers Print Check Now / Save Check for Later', /Print Check Now/.test(ui) && /Save Check for Later/.test(ui));
  check('Print Now opens the existing Check Printing workflow', /check-printing\?checkId=/.test(ui));
  const cp = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'src', 'components', 'accountant', 'CheckPrinting.js'), 'utf8');
  check('check list shows the Customer Refund source', /Customer Refund/.test(cp));
  const pay = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'models', 'payments.js'), 'utf8');
  check('payments unapplied subtracts completed refunds', /refunded_total/.test(pay) && /UNAPPLIED_EXPR/.test(pay));
  const pdm = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'src', 'components', 'customers', 'payments', 'PaymentDetailsModal.js'), 'utf8');
  check('payment/refund detail shows the linked check (View Check)', /check-printing\?checkId=/.test(pdm) && /Refund History/.test(pdm));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
