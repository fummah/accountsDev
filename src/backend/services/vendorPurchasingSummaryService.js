/**
 * services/vendorPurchasingSummaryService.js — Vendor Purchasing Summary.
 *
 * A simple operational + financial picture for ONE vendor, connecting
 * Vendor → Purchase Orders → Receipts → Bills → Payments → Vendor Credits.
 *
 * Definitions (all derived — nothing stored):
 *   Open PO      active POs (not Draft/Cancelled/Closed) that are still open
 *                (remaining to receive OR remaining to bill), value = remaining
 *                to receive × unit cost
 *   Received     actual goods receipts value (qty_received × unit_cost)
 *   Bills        valid vendor bills (Unpaid/Partially Paid/Paid; void/draft excluded)
 *   Paid         actual active bill payments (cash/bank/check) — vendor credits
 *                are NOT counted as cash paid
 *   Outstanding  SUM of current bill balances (total − active payments − applied
 *                credits) — the existing bill balance engine
 *   Credits      available (unapplied) vendor credit balance
 *
 * Company / tenant: one company per database; all queries scoped to the active file.
 */

const db = require('../models/dbmgr');

const num = (v) => Number(v) || 0;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const getVendorPurchasingSummary = (vendorId) => {
  const vid = Number(vendorId);
  if (!vid) return null;

  // ── Open Purchase Orders (remaining commitment) ──────────────────────────
  const poRows = db.prepare(`
    SELECT po.id,
           SUM(MAX(pol.qty_ordered - pol.qty_received, 0)) AS rem_recv,
           SUM(MAX(pol.qty_ordered - pol.qty_billed, 0)) AS rem_bill,
           SUM(MAX(pol.qty_ordered - pol.qty_received, 0) * pol.unit_cost) AS rem_value
    FROM purchase_orders po
    JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id
    WHERE po.vendor_id = ? AND po.status NOT IN ('DRAFT', 'CANCELLED', 'CLOSED')
    GROUP BY po.id
  `).all(vid);
  let openPoCount = 0;
  let openPoAmount = 0;
  for (const r of poRows) {
    if (num(r.rem_recv) > 0.005 || num(r.rem_bill) > 0.005) {
      openPoCount += 1;
      openPoAmount += num(r.rem_value);
    }
  }

  // ── Received (goods receipts value) ──────────────────────────────────────
  const recvRow = db.prepare(`
    SELECT COUNT(DISTINCT gr.id) AS cnt,
           COALESCE(SUM(grl.qty_received * grl.unit_cost), 0) AS amount
    FROM goods_receipts gr
    LEFT JOIN goods_receipt_lines grl ON grl.receipt_id = gr.id
    WHERE gr.vendor_id = ?
  `).get(vid);

  // ── Bills + Paid + Outstanding ───────────────────────────────────────────
  const billRows = db.prepare(`
    SELECT e.id,
           (SELECT COALESCE(SUM(el.amount), 0) FROM expense_lines el WHERE el.expense_id = e.id) AS total,
           (SELECT COALESCE(SUM(bp.amount), 0) FROM bill_payments bp WHERE bp.expense_id = e.id AND bp.status = 'Active') AS paid,
           (SELECT COALESCE(SUM(ca.amount), 0) FROM credit_applications ca WHERE ca.expense_id = e.id) AS credits
    FROM expenses e
    WHERE e.payee = ?
      AND (e.category = 'bill' OR e.payment_method = 'bill')
      AND LOWER(COALESCE(e.approval_status, '')) NOT IN ('void', 'voided', 'draft', 'cancelled', 'canceled', 'deleted')
  `).all(vid);

  let billsAmount = 0;
  let outstandingCount = 0;
  let outstandingAmount = 0;
  for (const b of billRows) {
    const total = num(b.total);
    billsAmount += total;
    const balance = Math.max(0, total - num(b.paid) - num(b.credits));
    if (balance > 0.005) { outstandingCount += 1; outstandingAmount += balance; }
  }

  const paidRow = db.prepare(`
    SELECT COUNT(*) AS cnt, COALESCE(SUM(bp.amount), 0) AS amount
    FROM bill_payments bp
    JOIN expenses e ON e.id = bp.expense_id
    WHERE e.payee = ? AND bp.status = 'Active'
      AND (e.category = 'bill' OR e.payment_method = 'bill')
  `).get(vid);

  // ── Available (unapplied) vendor credits ─────────────────────────────────
  let creditsAvailable = 0;
  try {
    const c = db.prepare("SELECT COALESCE(SUM(remaining_amount), 0) AS avail FROM vendor_credits WHERE supplier_id = ? AND status = 'Active'").get(vid);
    creditsAvailable = num(c && c.avail);
  } catch { creditsAvailable = 0; }

  return {
    vendorId: vid,
    openPurchaseOrders: { count: openPoCount, amount: round2(openPoAmount) },
    received: { count: num(recvRow && recvRow.cnt), amount: round2(num(recvRow && recvRow.amount)) },
    bills: { count: billRows.length, amount: round2(billsAmount) },
    paid: { count: num(paidRow && paidRow.cnt), amount: round2(num(paidRow && paidRow.amount)) },
    outstanding: { billCount: outstandingCount, amount: round2(outstandingAmount) },
    credits: { availableAmount: round2(creditsAvailable) },
  };
};

module.exports = { getVendorPurchasingSummary };
