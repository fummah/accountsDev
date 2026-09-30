/**
 * services/purchasingReportsService.js — Basic Purchasing Reports.
 *
 * A small set of operational reports over the EXISTING purchasing data. It owns
 * no new formulas:
 *   - Open / Outstanding POs  → PurchaseOrders.computeStatus + the central
 *                               remaining-to-receive rule (same as On PO).
 *   - Received vs Ordered     → purchase_order_lines (ordered / received / remaining).
 *   - Items Purchased         → the ONE inventory movement ledger. Only PHYSICAL
 *                               receipts count (sourceType 'receipt' from a PO
 *                               receipt, 'bill' from a direct bill that received
 *                               stock); a PO-linked bill creates no movement, so
 *                               receipt + bill can never double-count.
 *   - Vendor Purchase History → PurchaseOrders.getVendorActivity.
 *   - Inventory Movement / Low Stock reuse their own central services.
 *
 * Company / tenant: one company per database; every query is scoped via dbmgr.
 */

const db = require('../models/dbmgr');
const PurchaseOrders = require('../models/purchaseOrders');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => Number(v) || 0;
const vendorName = (r) => r.display_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || r.company_name || '';
const EXCLUDED = ['DRAFT', 'CANCELLED'];

/** Items physically purchased (from the movement ledger — never double counted). */
const getItemsPurchased = ({ dateFrom = null, dateTo = null, vendorId = null } = {}) => {
  const where = ["m.quantityChange > 0", "m.sourceType IN ('receipt','bill')"];
  const params = [];
  if (dateFrom) { where.push('date(m.movedAt) >= date(?)'); params.push(dateFrom); }
  if (dateTo) { where.push('date(m.movedAt) <= date(?)'); params.push(dateTo); }
  const rows = db.prepare(`
    SELECT p.id AS productId, p.name, p.sku, m.itemId,
           SUM(m.quantityChange) AS qty,
           SUM(m.quantityChange * COALESCE(m.unitCost, 0)) AS value
    FROM stock_movements m
    JOIN products p ON p.item_id = m.itemId
    WHERE ${where.join(' AND ')}
    GROUP BY m.itemId
    ORDER BY value DESC
  `).all(...params).map((r) => ({
    productId: r.productId != null ? Number(r.productId) : null,
    itemId: Number(r.itemId),
    name: r.name || r.sku || `Item #${r.itemId}`,
    sku: r.sku || '',
    quantity: round2(r.qty),
    value: round2(r.value),
    avgUnitCost: num(r.qty) !== 0 ? round2(num(r.value) / num(r.qty)) : 0,
  }));
  return { rows, total: round2(rows.reduce((s, r) => s + r.value, 0)), count: rows.length };
};

/** Line-level Ordered / Received / Remaining for active POs. */
const getReceivedVsOrdered = ({ vendorId = null, poStatus = null } = {}) => {
  const where = [`po.status NOT IN (${EXCLUDED.map(() => '?').join(',')})`];
  const params = [...EXCLUDED];
  if (vendorId) { where.push('po.vendor_id = ?'); params.push(Number(vendorId)); }
  if (poStatus) { where.push('po.status = ?'); params.push(String(poStatus)); }
  const rows = db.prepare(`
    SELECT po.id AS poId, po.po_number, po.po_date, po.expected_date, po.status,
           s.display_name, s.first_name, s.last_name, s.company_name,
           pol.id AS lineId, pol.line_no, pol.description,
           pol.qty_ordered, pol.qty_received, pol.qty_billed,
           MAX(pol.qty_ordered - pol.qty_received, 0) AS remaining
    FROM purchase_order_lines pol
    JOIN purchase_orders po ON po.id = pol.purchase_order_id
    LEFT JOIN suppliers s ON s.id = po.vendor_id
    WHERE ${where.join(' AND ')}
    ORDER BY po.id DESC, pol.line_no ASC
  `).all(...params).map((r) => ({
    poId: Number(r.poId), poNumber: r.po_number || `PO-${r.poId}`,
    vendorId: null, vendorName: vendorName(r),
    poDate: r.po_date || null, expectedDate: r.expected_date || null, status: r.status,
    lineId: Number(r.lineId), lineNo: r.line_no, description: r.description || '',
    ordered: num(r.qty_ordered), received: num(r.qty_received), billed: num(r.qty_billed),
    remaining: round2(num(r.remaining)),
  }));
  return { rows, count: rows.length };
};

/** Open POs = active with remaining to receive OR remaining to bill. */
const getOpenPurchaseOrders = () => {
  const rows = PurchaseOrders.getAll({}).filter((p) =>
    p.status !== 'DRAFT' && p.status !== 'CANCELLED' && p.status !== 'CLOSED' &&
    (num(p.remainingToReceive) > 0.005 || num(p.totalOrdered) - num(p.totalBilled) > 0.005));
  return { rows, count: rows.length };
};

/** Outstanding POs = active with quantity still to receive (On PO > 0). */
const getOutstandingPurchaseOrders = () => {
  const rows = PurchaseOrders.getAll({}).filter((p) =>
    p.status !== 'DRAFT' && p.status !== 'CANCELLED' && p.status !== 'CLOSED' && num(p.remainingToReceive) > 0.005);
  return { rows, count: rows.length };
};

/** Vendor purchase history — reuses the ONE vendor-activity service. */
const getVendorPurchaseHistory = (vendorId) => PurchaseOrders.getVendorActivity(vendorId);

/** One payload for the Purchasing Reports screen. */
const getPurchasingReports = (opts = {}) => ({
  itemsPurchased: getItemsPurchased(opts),
  receivedVsOrdered: getReceivedVsOrdered(opts),
  openPurchaseOrders: getOpenPurchaseOrders(),
  outstandingPurchaseOrders: getOutstandingPurchaseOrders(),
  generatedAt: new Date().toISOString(),
});

module.exports = {
  getItemsPurchased, getReceivedVsOrdered, getOpenPurchaseOrders,
  getOutstandingPurchaseOrders, getVendorPurchaseHistory, getPurchasingReports,
};
