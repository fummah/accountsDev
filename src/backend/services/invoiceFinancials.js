const db = require('./../models/dbmgr');
const {
  deriveInvoiceStatus,
  INVOICE_STATUS,
  MONEY_TOLERANCE,
} = require('./documentStatus');

// Single source of truth for an invoice's financial state.
//
// Invoice totals, paid-to-date, balance and payment status must be derived from
// persisted data (invoice_lines + payment_allocations/payments) — never trusted
// from a client payload. Editing an invoice rewrites its lines but MUST NOT
// touch payment history, so existing payments keep their original amounts and
// the balance/status simply follow.
//
// The status vocabulary (Open / Partially Paid / Paid + document lifecycle
// states) lives in ./documentStatus so every model shares one definition.

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const clamp0 = (n) => (round2(n) < 0 ? 0 : round2(n));

function computeInvoiceTotal(invoiceId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(l.amount), 0) AS subtotal, COALESCE(MAX(i.vat), 0) AS vat
    FROM invoice_lines l
    JOIN invoices i ON i.id = l.invoice_id
    WHERE l.invoice_id = ?
  `).get(invoiceId);
  const subtotal = Number(row?.subtotal) || 0;
  const vat = Number(row?.vat) || 0;
  return round2(subtotal * (1 + vat / 100));
}

// Paid-to-date uses the same formula as the invoice list / single-invoice reads:
// explicit allocations plus direct (unallocated) payments attached to the invoice.
function computePaidToDate(invoiceId) {
  let paid = 0;
  try {
    const alloc = db.prepare(
      'SELECT COALESCE(SUM(amount), 0) AS paid FROM payment_allocations WHERE invoiceId = ?'
    ).get(invoiceId);
    const direct = db.prepare(`
      SELECT COALESCE(SUM(p.amount), 0) AS paid
      FROM payments p
      WHERE p.invoiceId = ? AND p.invoiceId != 0
        AND NOT EXISTS (SELECT 1 FROM payment_allocations x WHERE x.paymentId = p.id)
    `).get(invoiceId);
    paid = (Number(alloc?.paid) || 0) + (Number(direct?.paid) || 0);
  } catch (e) {
    console.error('[invoiceFinancials] paid-to-date compute error:', e.message);
  }
  return round2(paid);
}

// Normalize a stored date/datetime to a plain YYYY-MM-DD string when possible.
function normalizePaidDate(dt) {
  if (!dt) return null;
  const s = String(dt);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

// The date the invoice became fully paid: the payment date at which the
// cumulative applied amount reached the invoice total. Falls back to null when
// the invoice is not fully settled. Uses real payment history (allocations +
// direct payments) so it is never the creation/due date.
function computePaidDate(invoiceId) {
  const total = computeInvoiceTotal(invoiceId);
  let rows = [];
  try {
    rows = db.prepare(`
      SELECT amount, dt, pid FROM (
        SELECT a.amount AS amount, COALESCE(p.date, p.createdAt) AS dt, p.id AS pid
        FROM payment_allocations a JOIN payments p ON p.id = a.paymentId
        WHERE a.invoiceId = ?
        UNION ALL
        SELECT p.amount AS amount, COALESCE(p.date, p.createdAt) AS dt, p.id AS pid
        FROM payments p
        WHERE p.invoiceId = ? AND p.invoiceId != 0
          AND NOT EXISTS (SELECT 1 FROM payment_allocations x WHERE x.paymentId = p.id)
      )
      ORDER BY dt ASC, pid ASC
    `).all(invoiceId, invoiceId);
  } catch (e) {
    console.error('[invoiceFinancials] paid-date compute error:', e.message);
    return null;
  }
  if (!rows.length) return null;
  if (round2(total) <= 0) return normalizePaidDate(rows[rows.length - 1].dt);
  let cum = 0;
  for (const r of rows) {
    cum = round2(cum + (Number(r.amount) || 0));
    if (cum >= round2(total) - 0.005) return normalizePaidDate(r.dt);
  }
  return null;
}

// Read-only financial snapshot (does not persist).
function getInvoiceFinancials(invoiceId) {
  const inv = db.prepare('SELECT id, status FROM invoices WHERE id = ?').get(invoiceId);
  if (!inv) return null;
  const invoiceTotal = computeInvoiceTotal(invoiceId);
  const paidToDate = computePaidToDate(invoiceId);
  const balance = round2(invoiceTotal - paidToDate);
  const status = deriveInvoiceStatus({ currentStatus: inv.status, invoiceTotal, paidToDate });
  return {
    invoiceTotal,
    paidToDate,
    rawBalance: balance,
    balance: clamp0(balance),
    overpayment: balance < 0 ? round2(-balance) : 0,
    status,
    settled: balance <= MONEY_TOLERANCE,
    paidDate: balance <= MONEY_TOLERANCE ? computePaidDate(invoiceId) : null,
  };
}

// Recompute and persist invoices.balance + invoices.status.
function recalcInvoiceFinancials(invoiceId) {
  const f = getInvoiceFinancials(invoiceId);
  if (!f) return null;
  db.prepare('UPDATE invoices SET balance = ?, status = ? WHERE id = ?')
    .run(f.balance, f.status, invoiceId);
  return f;
}

module.exports = {
  computeInvoiceTotal,
  computePaidToDate,
  computePaidDate,
  deriveInvoiceStatus,
  getInvoiceFinancials,
  recalcInvoiceFinancials,
  round2,
};
