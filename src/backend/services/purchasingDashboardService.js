/**
 * services/purchasingDashboardService.js — the Simple Purchasing Dashboard.
 *
 * An operational overview over the purchasing workflow already in AccuLedger:
 * Purchase Orders → Receipts → Bills → Payments (+ vendor credits). It does NOT
 * own any of that logic — it aggregates the existing tables and reuses the
 * central PO status service (`PurchaseOrders.computeStatus`) and the bill
 * balance formula (total − active payments − applied credits).
 *
 *   Open POs            active (not Draft/Cancelled/Closed) with remaining to
 *                       receive OR remaining to bill
 *   Partially Received  active with 0 < received < ordered
 *   Overdue POs         active with an Expected Date before today AND remaining
 *                       to receive > 0 (no expected date never counts)
 *   Recently Received   goods_receipts within the recent window (by receipt date)
 *   Recently Billed     vendor bills within the recent window (by bill date)
 *   Unpaid Vendor Bills bills with balance > 0 (Unpaid + Partially Paid)
 *
 * Receiving and billing are independent: a fully-billed PO with nothing received
 * is still open; a fully-received PO with nothing billed still owes billing.
 *
 * Company / tenant: one company per database; all queries scoped to the active file.
 */

const db = require('../models/dbmgr');
const PurchaseOrders = require('../models/purchaseOrders');

const RECENT_DAYS = 30;
const TOLERANCE = 0.005;
const NON_BILL_STATES = new Set(['void', 'voided', 'draft', 'cancelled', 'canceled', 'deleted']);

const num = (v) => Number(v) || 0;
const todayStr = () => new Date().toISOString().slice(0, 10);
const sinceStr = (days) => new Date(Date.now() - (Number(days) > 0 ? Number(days) : RECENT_DAYS) * 86400000).toISOString().slice(0, 10);
const vendorName = (r) => r.display_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || r.company_name || '';

const loadPOs = () => {
  const rows = db.prepare(`
    SELECT po.id, po.po_number, po.vendor_id, po.po_date, po.expected_date, po.status, po.total,
           s.display_name, s.first_name, s.last_name, s.company_name,
           COALESCE(SUM(pol.qty_ordered), 0) AS ordered,
           COALESCE(SUM(pol.qty_received), 0) AS received,
           COALESCE(SUM(pol.qty_billed), 0) AS billed
    FROM purchase_orders po
    LEFT JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id
    LEFT JOIN suppliers s ON s.id = po.vendor_id
    GROUP BY po.id
    ORDER BY po.id DESC
  `).all();

  return rows.map((r) => {
    // Reuse the ONE PO status service with the aggregated line totals.
    const st = PurchaseOrders.computeStatus(r, [{ qty_ordered: r.ordered, qty_received: r.received, qty_billed: r.billed }]);
    const active = r.status !== 'DRAFT' && r.status !== 'CANCELLED' && r.status !== 'CLOSED';
    const remainingToReceive = Math.max(0, num(r.ordered) - num(r.received));
    const remainingToBill = Math.max(0, num(r.ordered) - num(r.billed));
    return {
      poId: Number(r.id),
      poNumber: r.po_number || `PO-${r.id}`,
      vendorId: r.vendor_id != null ? Number(r.vendor_id) : null,
      vendorName: vendorName(r),
      poDate: r.po_date || null,
      expectedDate: r.expected_date || null,
      ordered: num(r.ordered),
      received: num(r.received),
      billed: num(r.billed),
      remainingToReceive,
      remainingToBill,
      total: num(r.total),
      status: st.status,
      displayStatus: st.displayStatus,
      receivingStatus: st.receivingStatus,
      billingStatus: st.billingStatus,
      active,
    };
  });
};

const loadBills = () => {
  const rows = db.prepare(`
    SELECT e.id, e.ref_no, e.payment_date, e.due_date, e.payee, e.approval_status,
           s.display_name, s.first_name, s.last_name, s.company_name,
           (SELECT COALESCE(SUM(el.amount), 0) FROM expense_lines el WHERE el.expense_id = e.id) AS total,
           (SELECT COALESCE(SUM(bp.amount), 0) FROM bill_payments bp WHERE bp.expense_id = e.id AND bp.status = 'Active') AS payments,
           (SELECT COALESCE(SUM(ca.amount), 0) FROM credit_applications ca WHERE ca.expense_id = e.id) AS credits
    FROM expenses e
    LEFT JOIN suppliers s ON s.id = e.payee
    WHERE (e.category = 'bill' OR e.payment_method = 'bill')
  `).all();

  return rows.map((r) => {
    const total = num(r.total);
    const paid = num(r.payments) + num(r.credits);
    const balance = Math.round((total - paid) * 100) / 100;
    const state = String(r.approval_status || '').toLowerCase();
    const voided = NON_BILL_STATES.has(state);
    let status;
    if (total > TOLERANCE && balance <= TOLERANCE) status = 'Paid';
    else if (paid > TOLERANCE) status = 'Partially Paid';
    else if (voided) status = r.approval_status;
    else status = 'Unpaid';
    return {
      billId: Number(r.id),
      billNumber: r.ref_no || `BILL-${r.id}`,
      vendorId: r.payee != null ? Number(r.payee) : null,
      vendorName: vendorName(r),
      billDate: r.payment_date || null,
      dueDate: r.due_date || null,
      total,
      credits: num(r.credits),
      paid: num(r.payments),
      balance,
      status,
      voided,
    };
  });
};

const getPurchasingDashboard = (opts = {}) => {
  const window = Number(opts.days) > 0 ? Number(opts.days) : RECENT_DAYS;
  const since = sinceStr(window);
  const today = todayStr();

  const pos = loadPOs();
  const bills = loadBills();

  const isOpen = (p) => p.active && (p.remainingToReceive > TOLERANCE || p.remainingToBill > TOLERANCE);
  const isPartialReceived = (p) => p.active && p.received > TOLERANCE && p.received < p.ordered - TOLERANCE;
  const isOverdue = (p) => p.active && !!p.expectedDate && p.expectedDate < today && p.remainingToReceive > TOLERANCE;

  const openPOs = pos.filter(isOpen).length;
  const partiallyReceivedPOs = pos.filter(isPartialReceived).length;
  const overduePOs = pos.filter(isOverdue).length;

  const receiptRows = db.prepare(`
    SELECT gr.id, gr.receipt_number, gr.receipt_date, gr.purchase_order_id, gr.vendor_id,
           s.display_name, s.first_name, s.last_name, s.company_name,
           (SELECT COUNT(*) FROM goods_receipt_lines gl WHERE gl.receipt_id = gr.id) AS line_count
    FROM goods_receipts gr
    LEFT JOIN suppliers s ON s.id = gr.vendor_id
    WHERE date(gr.receipt_date) >= date(?)
    ORDER BY gr.receipt_date DESC, gr.id DESC
  `).all(since);

  const recentBills = bills.filter((b) => !b.voided && b.billDate && String(b.billDate).slice(0, 10) >= since);
  const unpaid = bills.filter((b) => !b.voided && b.balance > TOLERANCE && b.status !== 'Paid');
  const unpaidAmount = Math.round(unpaid.reduce((s, b) => s + b.balance, 0) * 100) / 100;

  // Section: POs requiring attention (open), overdue first then by expected date.
  const attentionPOs = pos.filter(isOpen)
    .map((p) => ({
      ...p,
      overdue: isOverdue(p),
      deliveryStatus: isOverdue(p) ? 'Overdue' : (p.expectedDate === today ? 'Due Today' : (p.received > TOLERANCE ? 'Partially Received' : 'Expected')),
    }))
    .sort((a, b) => (Number(b.overdue) - Number(a.overdue)) || String(a.expectedDate || '9999').localeCompare(String(b.expectedDate || '9999')));

  const expectedDeliveries = pos.filter((p) => p.active && p.remainingToReceive > TOLERANCE)
    .map((p) => ({
      poId: p.poId, poNumber: p.poNumber, vendorId: p.vendorId, vendorName: p.vendorName,
      expectedDate: p.expectedDate, remainingToReceive: p.remainingToReceive,
      status: isOverdue(p) ? 'Overdue' : (p.expectedDate === today ? 'Due Today' : (p.received > TOLERANCE ? 'Partially Received' : 'Expected')),
    }))
    .sort((a, b) => (a.status === 'Overdue' ? -1 : 0) - (b.status === 'Overdue' ? -1 : 0) || String(a.expectedDate || '9999').localeCompare(String(b.expectedDate || '9999')));

  // Section: recent activity = receipts + bills + POs created, newest first.
  const activity = [];
  for (const r of receiptRows) activity.push({ date: r.receipt_date, type: 'Receipt', reference: r.receipt_number || `RCV-${r.id}`, sourceType: 'receipt', sourceId: Number(r.id), vendorId: r.vendor_id != null ? Number(r.vendor_id) : null, vendorName: vendorName(r), summary: `${r.line_count} item line(s) received`, status: 'Posted' });
  for (const b of recentBills) activity.push({ date: b.billDate, type: 'Bill', reference: b.billNumber, sourceType: 'bill', sourceId: b.billId, vendorId: b.vendorId, vendorName: b.vendorName, summary: `$${b.total.toFixed(2)}`, status: b.status });
  for (const p of pos.filter((x) => x.poDate && String(x.poDate).slice(0, 10) >= since)) activity.push({ date: p.poDate, type: 'Purchase Order', reference: p.poNumber, sourceType: 'po', sourceId: p.poId, vendorId: p.vendorId, vendorName: p.vendorName, summary: `$${p.total.toFixed(2)}`, status: p.displayStatus });
  activity.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  return {
    window,
    since,
    summary: {
      openPOs,
      partiallyReceivedPOs,
      overduePOs,
      recentlyReceived: receiptRows.length,
      recentlyBilled: recentBills.length,
      unpaidVendorBills: unpaid.length,
      unpaidAmount,
    },
    attentionPOs,
    expectedDeliveries,
    recentActivity: activity.slice(0, 20),
    unpaidBills: unpaid.sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'))),
  };
};

module.exports = { getPurchasingDashboard, RECENT_DAYS };
