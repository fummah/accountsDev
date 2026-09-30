/**
 * services/inventoryAvailabilityService.js — THE single source of truth for
 * "how much do I have, how much is coming, and what do I expect".
 *
 *   Quantity on Hand   = physical stock in the inventory ledger (item_stock),
 *                        reached through products.item_id. NEVER derived from POs.
 *   On Purchase Order  = SUM over active PO lines of MAX(ordered − received, 0).
 *   Expected           = On Hand + On Purchase Order.
 *
 * On PO is a PHYSICAL incoming-stock metric: it uses RECEIVED quantity, never
 * BILLED quantity (AccuLedger allows billing before receipt, and billed goods
 * may still be physically on the way).
 *
 * Active PO lines are those on a PO whose workflow status is NOT DRAFT,
 * CANCELLED or CLOSED and whose remaining-to-receive is > 0. Billing status is
 * irrelevant here.
 *
 * Company / tenant: AccuLedger is one company per database file and `dbmgr`
 * points at the active company, so every query is inherently company-scoped.
 *
 * Only inventory-tracked Item Types (services/itemTypes `tracksInventory`)
 * expose these metrics; Non-Inventory Parts and Services return nulls.
 */

const db = require('../models/dbmgr');
const ItemTypes = require('./itemTypes');

// Workflow statuses (purchase_orders.status) that do NOT represent an active,
// still-expected delivery. The computed PARTIALLY_RECEIVED / RECEIVED / BILLED
// display states are derived from these, so filtering the stored status is
// correct.
const EXCLUDED_PO_STATUSES = ['DRAFT', 'CANCELLED', 'CLOSED'];

const num = (v) => Number(v) || 0;

const ACTIVE_PO_LINES_SQL = `
  SELECT pol.item_id AS product_id,
         po.id AS po_id, po.po_number, po.vendor_id, po.expected_date, po.status AS po_status,
         s.display_name AS vendor_name,
         pol.qty_ordered, pol.qty_received,
         MAX(pol.qty_ordered - pol.qty_received, 0) AS remaining
  FROM purchase_order_lines pol
  JOIN purchase_orders po ON po.id = pol.purchase_order_id
  LEFT JOIN suppliers s ON s.id = po.vendor_id
  WHERE po.status NOT IN (${EXCLUDED_PO_STATUSES.map(() => '?').join(',')})
    AND MAX(pol.qty_ordered - pol.qty_received, 0) > 0.005
`;

const onHandSql = (itemId) =>
  db.prepare('SELECT COALESCE(SUM(quantity), 0) AS q FROM item_stock WHERE itemId = ?').get(itemId);

const isTracked = (type) => ItemTypes.tracksInventory(type);

/** productId -> { onPurchaseOrder, lines[] } across all active PO lines. */
const getActivePoByProduct = () => {
  const rows = db.prepare(ACTIVE_PO_LINES_SQL).all(...EXCLUDED_PO_STATUSES);
  const map = new Map();
  for (const r of rows) {
    const key = Number(r.product_id);
    const entry = map.get(key) || { onPurchaseOrder: 0, lines: [] };
    entry.onPurchaseOrder += num(r.remaining);
    entry.lines.push({
      poId: Number(r.po_id),
      poNumber: r.po_number || `PO-${r.po_id}`,
      vendorId: r.vendor_id != null ? Number(r.vendor_id) : null,
      vendorName: r.vendor_name || '—',
      expectedDate: r.expected_date || null,
      poStatus: r.po_status || 'OPEN',
      qtyOrdered: num(r.qty_ordered),
      qtyReceived: num(r.qty_received),
      remaining: num(r.remaining),
    });
    map.set(key, entry);
  }
  return map;
};

/** The contributing active PO lines for one product (drill-down). */
const getOnPoLines = (productId) =>
  db.prepare(`${ACTIVE_PO_LINES_SQL} AND pol.item_id = ? ORDER BY (po.expected_date IS NULL), date(po.expected_date) ASC, po.id DESC`)
    .all(...EXCLUDED_PO_STATUSES, Number(productId))
    .map((r) => ({
      poId: Number(r.po_id),
      poNumber: r.po_number || `PO-${r.po_id}`,
      vendorId: r.vendor_id != null ? Number(r.vendor_id) : null,
      vendorName: r.vendor_name || '—',
      expectedDate: r.expected_date || null,
      poStatus: r.po_status || 'OPEN',
      qtyOrdered: num(r.qty_ordered),
      qtyReceived: num(r.qty_received),
      remaining: num(r.remaining),
    }));

/** Availability for one item. Non-tracked types return null metrics. */
const getItemAvailability = (productId) => {
  const p = db.prepare('SELECT id, type, item_id FROM products WHERE id = ?').get(Number(productId));
  if (!p) return null;
  if (!isTracked(p.type)) {
    return { productId: Number(p.id), tracksInventory: false, onHand: null, onPurchaseOrder: null, expected: null };
  }
  const onHandRow = onHandSql(p.item_id);
  const onHand = num(onHandRow && onHandRow.q);
  const po = getActivePoByProduct().get(Number(p.id));
  const onPo = po ? po.onPurchaseOrder : 0;
  return {
    productId: Number(p.id),
    tracksInventory: true,
    onHand,
    onPurchaseOrder: onPo,
    expected: onHand + onPo,
  };
};

/**
 * Batch availability for a list of product ids — ONE query per source, never
 * per item (no N+1). Returns { [productId]: { onHand, onPurchaseOrder, expected } }.
 */
const getAvailabilityForItems = (productIds) => {
  const ids = [...new Set((productIds || []).map(Number).filter(Boolean))];
  const out = {};
  if (!ids.length) return out;
  const ph = ids.map(() => '?').join(',');

  const prods = db.prepare(`SELECT id, type, item_id FROM products WHERE id IN (${ph})`).all(...ids);

  const onHandByItem = new Map();
  const itemIds = [...new Set(prods.map((p) => p.item_id).filter(Boolean).map(Number))];
  if (itemIds.length) {
    const ph2 = itemIds.map(() => '?').join(',');
    for (const r of db.prepare(`SELECT itemId, SUM(quantity) AS q FROM item_stock WHERE itemId IN (${ph2}) GROUP BY itemId`).all(...itemIds)) {
      onHandByItem.set(Number(r.itemId), num(r.q));
    }
  }

  const onPoByProduct = new Map();
  for (const [pid, entry] of getActivePoByProduct()) {
    if (ids.includes(pid)) onPoByProduct.set(pid, entry.onPurchaseOrder);
  }

  for (const p of prods) {
    const pid = Number(p.id);
    if (!isTracked(p.type)) { out[pid] = { onHand: null, onPurchaseOrder: null, expected: null }; continue; }
    const onHand = onHandByItem.get(Number(p.item_id)) || 0;
    const onPo = onPoByProduct.get(pid) || 0;
    out[pid] = { onHand, onPurchaseOrder: onPo, expected: onHand + onPo };
  }
  return out;
};

/** Availability for every inventory-tracked, active item (company-wide). */
const getCompanyInventoryAvailability = () => {
  const prods = db.prepare('SELECT id, type, item_id FROM products WHERE (is_active IS NULL OR is_active = 1)').all();
  const tracked = prods.filter((p) => isTracked(p.type));
  return getAvailabilityForItems(tracked.map((p) => p.id));
};

module.exports = {
  EXCLUDED_PO_STATUSES,
  getItemAvailability,
  getAvailabilityForItems,
  getCompanyInventoryAvailability,
  getActivePoByProduct,
  getOnPoLines,
};
