/**
 * services/expectedDeliveryService.js — Expected Delivery Tracking.
 *
 * A simple, read-only view of ACTIVE Purchase Orders that still have quantity to
 * receive, with a derived Delivery Status (see services/deliveryStatus.js).
 *
 * It reuses the central PO status service (`PurchaseOrders.computeStatus`) and
 * the central On-PO remaining-to-receive rule, so Expected Delivery totals always
 * agree with the On-PO quantity. Billing never affects it — receiving is the
 * physical event.
 *
 * Company / tenant: one company per database; all queries scoped to the active file.
 */

const db = require('../models/dbmgr');
const PurchaseOrders = require('../models/purchaseOrders');
const Delivery = require('./deliveryStatus');

const num = (v) => Number(v) || 0;
const vendorName = (r) => r.display_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || r.company_name || '';
const localPlus = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

/** Every active PO with a derived Delivery Status (one aggregate query). */
const loadDeliveries = () => {
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
    const st = PurchaseOrders.computeStatus(r, [{ qty_ordered: r.ordered, qty_received: r.received, qty_billed: r.billed }]);
    const active = r.status !== 'DRAFT' && r.status !== 'CANCELLED' && r.status !== 'CLOSED';
    const remainingQty = Math.max(0, num(r.ordered) - num(r.received));
    return {
      poId: Number(r.id),
      poNumber: r.po_number || `PO-${r.id}`,
      vendorId: r.vendor_id != null ? Number(r.vendor_id) : null,
      vendorName: vendorName(r),
      poDate: r.po_date || null,
      expectedDate: r.expected_date || null,
      orderedQty: num(r.ordered),
      receivedQty: num(r.received),
      billedQty: num(r.billed),
      remainingQty,
      poStatus: st.displayStatus,
      receivingStatus: st.receivingStatus,
      billingStatus: st.billingStatus,
      active,
      deliveryStatus: Delivery.computeDeliveryStatus({ expectedDate: r.expected_date, remainingToReceive: remainingQty, active }),
    };
  });
};

const rank = { OVERDUE: 0, DUE_TODAY: 1, EXPECTED: 2, NO_DATE: 3, RECEIVED: 4 };

const applyFilters = (list, f = {}) => {
  let out = list;
  if (f.vendorId != null && f.vendorId !== '') out = out.filter((p) => p.vendorId === Number(f.vendorId));
  if (f.status) out = out.filter((p) => p.deliveryStatus === String(f.status).trim().toUpperCase());
  if (f.poStatus) out = out.filter((p) => String(p.poStatus || '').toUpperCase() === String(f.poStatus).trim().toUpperCase());
  if (f.dateFrom) out = out.filter((p) => p.expectedDate && String(p.expectedDate).slice(0, 10) >= f.dateFrom);
  if (f.dateTo) out = out.filter((p) => p.expectedDate && String(p.expectedDate).slice(0, 10) <= f.dateTo);
  if (f.search) {
    const q = String(f.search).toLowerCase();
    out = out.filter((p) => p.poNumber.toLowerCase().includes(q) || (p.vendorName || '').toLowerCase().includes(q));
  }
  return [...out].sort((a, b) => (rank[a.deliveryStatus] - rank[b.deliveryStatus])
    || String(a.expectedDate || '9999-12-31').localeCompare(String(b.expectedDate || '9999-12-31'))
    || a.poNumber.localeCompare(b.poNumber));
};

const summarize = (list) => {
  const today = Delivery.localToday();
  const next7 = localPlus(7);
  return {
    total: list.length,
    overdue: list.filter((p) => p.deliveryStatus === 'OVERDUE').length,
    dueToday: list.filter((p) => p.deliveryStatus === 'DUE_TODAY').length,
    next7Days: list.filter((p) => p.expectedDate && String(p.expectedDate).slice(0, 10) > today && String(p.expectedDate).slice(0, 10) <= next7).length,
    noDate: list.filter((p) => p.deliveryStatus === 'NO_DATE').length,
    partiallyReceived: list.filter((p) => p.receivingStatus === 'PARTIALLY_RECEIVED').length,
  };
};

/** Active outstanding deliveries (active PO, remaining > 0), filtered + sorted. */
const getExpectedDeliveries = (filters = {}) =>
  applyFilters(loadDeliveries().filter((p) => p.active && p.remainingQty > 0.005), filters);

/** One call for the dashboard: { items, summary }. */
const getExpectedDeliveryBoard = (filters = {}) => {
  const active = loadDeliveries().filter((p) => p.active && p.remainingQty > 0.005);
  return { items: applyFilters(active, filters), summary: summarize(active) };
};

module.exports = { getExpectedDeliveries, getExpectedDeliveryBoard, loadDeliveries, summarize };
