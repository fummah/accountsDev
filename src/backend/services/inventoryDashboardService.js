/**
 * services/inventoryDashboardService.js — the SINGLE backend source of truth
 * for the Simple Inventory Dashboard.
 *
 * It answers only four operational questions: what do I have, what is running
 * low, what is coming in, and what is selling. It deliberately does NOT do
 * forecasting / MRP / BI.
 *
 * ── Canonical sources (no duplicate stock engine) ────────────────────────────
 *   stock quantity      item_stock.quantity, reached via products.item_id
 *                       (the same bridge the rest of the app uses)
 *   item classification services/itemTypes (tracksInventory capability)
 *   on-hand per item    the same COALESCE(SUM(item_stock.quantity)) subquery the
 *                       Products list uses
 *   open PO quantity    purchase_order_lines.qty_ordered - qty_received on
 *                       non-closed / non-cancelled POs
 *   received / sold     stock_movements (the append-only inventory ledger)
 *   inventory value     services/inventoryValuation (the central costing engine)
 *
 * Every number is derived from those tables on the backend. The renderer never
 * computes a financial or inventory figure itself.
 *
 * ── Company / tenant scoping ─────────────────────────────────────────────────
 * AccuLedger is one company per database file; `dbmgr` points at the ACTIVE
 * company file, so every query here is inherently scoped to the active company
 * and can never aggregate across companies.
 *
 * ── "Recent" definition ──────────────────────────────────────────────────────
 * The source document does not define "recent". There is no pre-existing
 * standard window in the app, so this module centralises ONE default
 * (RECENT_DAYS = 30) that the UI can override and surfaces the window it used.
 */

const db = require('../models/dbmgr');
const ItemTypes = require('./itemTypes');
const Valuation = require('./inventoryValuation');

const RECENT_DAYS = 30; // documented default window for "recently"

const num = (v) => Number(v) || 0;

const sinceDate = (days) => {
  const d = new Date(Date.now() - (Number(days) > 0 ? Number(days) : RECENT_DAYS) * 86400000);
  return d.toISOString().slice(0, 10);
};

/** Active, inventory-tracked items with their authoritative on-hand quantity. */
const loadTrackedItems = () => {
  const rows = db.prepare(`
    SELECT p.id, p.name, p.sku, p.type, p.reorder_point, p.valuation_method, p.item_id,
           COALESCE((SELECT SUM(s.quantity) FROM item_stock s WHERE s.itemId = p.item_id), 0) AS on_hand
    FROM products p
    WHERE (p.is_active IS NULL OR p.is_active = 1)
  `).all();
  return rows.filter((r) => ItemTypes.tracksInventory(r.type));
};

/** productId -> remaining-to-receive, across open (non-closed/cancelled) POs. */
const loadOpenPoByProduct = () => {
  const rows = db.prepare(`
    SELECT pol.item_id AS product_id,
           SUM(MAX(pol.qty_ordered - pol.qty_received, 0)) AS remaining
    FROM purchase_order_lines pol
    JOIN purchase_orders po ON po.id = pol.purchase_order_id
    WHERE po.status NOT IN ('CLOSED', 'CANCELLED')
    GROUP BY pol.item_id
    HAVING remaining > 0.005
  `).all();
  const map = new Map();
  for (const r of rows) map.set(Number(r.product_id), num(r.remaining));
  return map;
};

const loadIncomingStock = (trackedIds) => {
  const rows = db.prepare(`
    SELECT pol.id AS line_id, pol.item_id AS product_id,
           p.name AS item_name, p.sku,
           po.id AS po_id, po.po_number, po.expected_date, po.status AS po_status,
           po.vendor_id, s.display_name AS vendor_name,
           (pol.qty_ordered - pol.qty_received) AS remaining
    FROM purchase_order_lines pol
    JOIN purchase_orders po ON po.id = pol.purchase_order_id
    LEFT JOIN suppliers s ON s.id = po.vendor_id
    LEFT JOIN products p ON p.id = pol.item_id
    WHERE po.status NOT IN ('CLOSED', 'CANCELLED')
      AND (pol.qty_ordered - pol.qty_received) > 0.005
    ORDER BY (po.expected_date IS NULL), date(po.expected_date) ASC, po.id DESC
  `).all();
  return rows
    .filter((r) => trackedIds.has(Number(r.product_id)))
    .map((r) => ({
      productId: Number(r.product_id),
      itemName: r.item_name || r.sku || `Item #${r.product_id}`,
      sku: r.sku || '',
      poId: Number(r.po_id),
      poNumber: r.po_number || `PO-${r.po_id}`,
      vendorId: r.vendor_id != null ? Number(r.vendor_id) : null,
      vendorName: r.vendor_name || '—',
      remaining: num(r.remaining),
      expectedDate: r.expected_date || null,
      poStatus: r.po_status || 'OPEN',
    }));
};

const loadRecentActivity = (limit = 25) => {
  const rows = db.prepare(`
    SELECT m.id, m.movedAt AS date, m.quantityChange, m.sourceType, m.sourceId,
           m.reason, m.refType,
           p.id AS product_id, p.name AS item_name, p.sku,
           e.ref_no AS bill_ref,
           i.number AS invoice_number,
           gr.receipt_number AS receipt_number
    FROM stock_movements m
    LEFT JOIN products p ON p.item_id = m.itemId
    LEFT JOIN expenses e ON m.sourceType = 'bill' AND e.id = m.sourceId
    LEFT JOIN invoices i ON m.sourceType = 'invoice' AND i.id = m.sourceId
    LEFT JOIN goods_receipts gr ON m.sourceType = 'receipt' AND gr.id = m.sourceId
    ORDER BY m.movedAt DESC, m.id DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(200, Number(limit) || 25)));

  const label = (r) => {
    if (r.sourceType === 'receipt') return 'Receipt';
    if (r.sourceType === 'bill') return 'Bill';
    if (r.sourceType === 'invoice') return 'Invoice';
    if (String(r.reason || '').toUpperCase().includes('ADJUST') || String(r.refType || '').toUpperCase().includes('ADJUST')) return 'Adjustment';
    return 'Movement';
  };
  const reference = (r) => {
    if (r.sourceType === 'receipt') return r.receipt_number || (r.sourceId != null ? `RCV-${r.sourceId}` : '');
    if (r.sourceType === 'bill') return r.bill_ref || (r.sourceId != null ? `BILL-${r.sourceId}` : '');
    if (r.sourceType === 'invoice') return r.invoice_number || (r.sourceId != null ? `INV-${r.sourceId}` : '');
    return r.refType || '';
  };

  return rows.map((r) => {
    const change = num(r.quantityChange);
    return {
      id: r.id,
      date: r.date,
      productId: r.product_id != null ? Number(r.product_id) : null,
      itemName: r.item_name || r.sku || '—',
      transaction: label(r),
      reference: reference(r),
      sourceType: r.sourceType || null,
      sourceId: r.sourceId != null ? Number(r.sourceId) : null,
      qtyIn: change > 0 ? change : 0,
      qtyOut: change < 0 ? -change : 0,
    };
  });
};

/**
 * The full dashboard payload. One call, aggregated queries, no per-item N+1.
 */
const getDashboard = ({ days } = {}) => {
  const window = Number(days) > 0 ? Number(days) : RECENT_DAYS;
  const since = sinceDate(window);

  const tracked = loadTrackedItems();
  const trackedIds = new Set(tracked.map((r) => Number(r.id)));

  const totalInventoryItems = tracked.length;
  const inStockItems = tracked.filter((r) => num(r.on_hand) > 0).length;
  const outOfStockItems = tracked.filter((r) => num(r.on_hand) <= 0).length;
  const lowStockItems = tracked.filter(
    (r) => num(r.on_hand) > 0 && num(r.reorder_point) > 0 && num(r.on_hand) <= num(r.reorder_point)
  ).length;

  const openPoByProduct = loadOpenPoByProduct();
  const itemsOnPO = [...openPoByProduct.keys()].filter((id) => trackedIds.has(id)).length;
  const onPoQty = [...openPoByProduct.entries()]
    .filter(([id]) => trackedIds.has(id))
    .reduce((s, [, q]) => s + q, 0);

  const receivedRows = db.prepare(`
    SELECT DISTINCT p.id AS product_id
    FROM stock_movements m
    JOIN products p ON p.item_id = m.itemId
    WHERE m.quantityChange > 0 AND m.sourceType IN ('receipt', 'bill')
      AND date(m.movedAt) >= date(?)
  `).all(since);
  const recentlyReceived = receivedRows.filter((r) => trackedIds.has(Number(r.product_id))).length;

  const soldRows = db.prepare(`
    SELECT DISTINCT p.id AS product_id
    FROM stock_movements m
    JOIN products p ON p.item_id = m.itemId
    WHERE m.quantityChange < 0 AND m.sourceType = 'invoice'
      AND date(m.movedAt) >= date(?)
  `).all(since);
  const recentlySold = soldRows.filter((r) => trackedIds.has(Number(r.product_id))).length;

  const inventoryValue = Valuation.totalValue();

  // Stock Attention: Low Stock + Out of Stock (+ Negative), with on-PO qty.
  const stockAttention = tracked
    .filter((r) => num(r.on_hand) <= 0 || (num(r.reorder_point) > 0 && num(r.on_hand) <= num(r.reorder_point)))
    .map((r) => {
      const onHand = num(r.on_hand);
      return {
        productId: Number(r.id),
        itemName: r.name || r.sku || `Item #${r.id}`,
        sku: r.sku || '',
        onHand,
        reorderPoint: num(r.reorder_point),
        onPo: openPoByProduct.get(Number(r.id)) || 0,
        status: onHand < 0 ? 'Negative Stock' : onHand === 0 ? 'Out of Stock' : 'Low Stock',
      };
    })
    .sort((a, b) => a.onHand - b.onHand);

  const incomingStock = loadIncomingStock(trackedIds);
  const recentActivity = loadRecentActivity(25);

  return {
    window,
    since,
    summary: {
      totalInventoryItems,
      inStockItems,
      lowStockItems,
      outOfStockItems,
      itemsOnPO,
      recentlyReceived,
      recentlySold,
      inventoryValue,
      onPoQty,
    },
    stockAttention,
    incomingStock,
    recentActivity,
  };
};

module.exports = { getDashboard, RECENT_DAYS };
