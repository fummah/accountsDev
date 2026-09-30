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
const Availability = require('./inventoryAvailabilityService');
const ItemStatus = require('./inventoryStockStatus');

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

/** productId -> remaining-to-receive. Reuses the ONE availability service. */
const loadOpenPoByProduct = () => {
  const map = new Map();
  for (const [pid, entry] of Availability.getActivePoByProduct()) {
    map.set(Number(pid), entry.onPurchaseOrder);
  }
  return map;
};

const loadIncomingStock = (tracked) => {
  const byId = new Map(tracked.map((t) => [Number(t.id), t]));
  const out = [];
  for (const [pid, entry] of Availability.getActivePoByProduct()) {
    const t = byId.get(Number(pid));
    if (!t) continue; // non-tracked / unknown item
    for (const l of entry.lines) {
      out.push({
        productId: Number(pid),
        itemName: t.name || t.sku || `Item #${pid}`,
        sku: t.sku || '',
        poId: l.poId,
        poNumber: l.poNumber,
        vendorId: l.vendorId,
        vendorName: l.vendorName,
        remaining: l.remaining,
        expectedDate: l.expectedDate,
        poStatus: l.poStatus,
      });
    }
  }
  out.sort((a, b) => {
    const da = a.expectedDate || '9999-12-31';
    const db2 = b.expectedDate || '9999-12-31';
    if (da !== db2) return da < db2 ? -1 : 1;
    return b.poId - a.poId;
  });
  return out;
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

  // One status helper drives Low Stock / Out of Stock everywhere.
  const statusOf = (r) => ItemStatus.computeStatus(true, r.on_hand, r.reorder_point);
  const totalInventoryItems = tracked.length;
  const inStockItems = tracked.filter((r) => num(r.on_hand) > 0).length;
  const lowStockItems = tracked.filter((r) => statusOf(r) === ItemStatus.STATUS.LOW_STOCK).length;
  const outOfStockItems = tracked.filter((r) => statusOf(r) === ItemStatus.STATUS.OUT_OF_STOCK).length;

  const openPoByProduct = loadOpenPoByProduct();
  const itemsOnPO = [...openPoByProduct.keys()].filter((id) => trackedIds.has(id)).length;
  const onPoQty = [...openPoByProduct.entries()]
    .filter(([id]) => trackedIds.has(id))
    .reduce((s, [, q]) => s + q, 0);

  // Recently received / sold are NET per item within the window, so a voided /
  // reversed document (which leaves an equal-and-opposite movement) cancels out
  // and cannot inflate the count.
  const receivedRows = db.prepare(`
    SELECT p.id AS product_id
    FROM stock_movements m
    JOIN products p ON p.item_id = m.itemId
    WHERE m.sourceType IN ('receipt', 'bill')
      AND date(m.movedAt) >= date(?)
    GROUP BY p.id
    HAVING SUM(m.quantityChange) > 0.005
  `).all(since);
  const recentlyReceived = receivedRows.filter((r) => trackedIds.has(Number(r.product_id))).length;

  const soldRows = db.prepare(`
    SELECT p.id AS product_id
    FROM stock_movements m
    JOIN products p ON p.item_id = m.itemId
    WHERE m.sourceType = 'invoice'
      AND date(m.movedAt) >= date(?)
    GROUP BY p.id
    HAVING SUM(m.quantityChange) < -0.005
  `).all(since);
  const recentlySold = soldRows.filter((r) => trackedIds.has(Number(r.product_id))).length;

  const inventoryValue = Valuation.totalValue();

  // Stock Attention: Low Stock + Out of Stock (+ Negative), with on-PO qty.
  const stockAttention = tracked
    .filter((r) => statusOf(r) !== ItemStatus.STATUS.IN_STOCK)
    .map((r) => {
      const onHand = num(r.on_hand);
      const st = statusOf(r);
      return {
        productId: Number(r.id),
        itemName: r.name || r.sku || `Item #${r.id}`,
        sku: r.sku || '',
        onHand,
        reorderPoint: num(r.reorder_point),
        onPo: openPoByProduct.get(Number(r.id)) || 0,
        status: onHand < 0 ? 'Negative Stock' : st === ItemStatus.STATUS.OUT_OF_STOCK ? 'Out of Stock' : 'Low Stock',
      };
    })
    .sort((a, b) => a.onHand - b.onHand);

  const incomingStock = loadIncomingStock(tracked);
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
