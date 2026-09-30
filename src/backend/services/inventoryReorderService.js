/**
 * services/inventoryReorderService.js — the Reorder Needed list.
 *
 * A SIMPLE purchasing decision list: which active Inventory Parts are at or
 * below their Reorder Point, how much is on hand, how much is already on
 * Purchase Order, and which still genuinely need attention.
 *
 * Rules (reusing the ONE central stock-status + availability services):
 *   appears when  tracksInventory AND active AND reorder_point IS NOT NULL
 *                 AND On Hand <= Reorder Point
 *   Expected      = On Hand + On PO            (incoming visibility only)
 *   Shortfall     = MAX(Reorder Point - Expected, 0)
 *   status        Out of Stock (On Hand <= 0) / Needs Ordering (On PO <= 0) /
 *                 On Order (On PO > 0) / Out of Stock — On Order
 *
 * On PO is CONTEXT, never the trigger: a Low Stock item stays on the list even
 * when stock is already on order. Nothing is stored — every value is derived.
 */

const db = require('../models/dbmgr');
const ItemTypes = require('./itemTypes');
const Availability = require('./inventoryAvailabilityService');

const REORDER_STATUS = {
  NEEDS_ORDERING: 'NEEDS_ORDERING',
  ON_ORDER: 'ON_ORDER',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  OUT_OF_STOCK_ON_ORDER: 'OUT_OF_STOCK_ON_ORDER',
};

const reorderStatus = (onHand, onPo) => {
  const q = Number(onHand) || 0;
  const po = Number(onPo) || 0;
  if (q <= 0) return po > 0 ? REORDER_STATUS.OUT_OF_STOCK_ON_ORDER : REORDER_STATUS.OUT_OF_STOCK;
  return po > 0 ? REORDER_STATUS.ON_ORDER : REORDER_STATUS.NEEDS_ORDERING;
};

const vendorName = (v) => (v ? (v.display_name || [v.first_name, v.last_name].filter(Boolean).join(' ') || v.company_name || '') : '');

const getReorderItems = (filters = {}) => {
  const search = String(filters.search || '').trim().toLowerCase();
  const status = String(filters.status || '').trim().toUpperCase();
  const category = String(filters.category || '').trim();
  const vendorId = filters.vendorId != null && filters.vendorId !== '' ? Number(filters.vendorId) : null;

  const rows = db.prepare(`
    SELECT p.id, p.name, p.sku, p.category, p.reorder_point, p.preferred_vendor_id, p.purchase_cost, p.item_id, p.type,
           COALESCE((SELECT SUM(s.quantity) FROM item_stock s WHERE s.itemId = p.item_id), 0) AS on_hand
    FROM products p
    WHERE (p.is_active IS NULL OR p.is_active = 1)
  `).all();

  const tracked = rows.filter((r) => ItemTypes.tracksInventory(r.type));
  const avail = Availability.getAvailabilityForItems(tracked.map((r) => r.id));

  const vendorIds = [...new Set(tracked.map((r) => r.preferred_vendor_id).filter(Boolean).map(Number))];
  const vendorNames = new Map();
  if (vendorIds.length) {
    const ph = vendorIds.map(() => '?').join(',');
    for (const v of db.prepare(`SELECT id, display_name, first_name, last_name, company_name FROM suppliers WHERE id IN (${ph})`).all(...vendorIds)) {
      vendorNames.set(Number(v.id), vendorName(v));
    }
  }

  const all = [];
  for (const r of tracked) {
    const rp = r.reorder_point == null || r.reorder_point === '' ? null : Number(r.reorder_point);
    if (rp == null) continue; // no configured Reorder Point → never on the list
    const a = avail[Number(r.id)] || {};
    const onHand = Number(a.onHand != null ? a.onHand : r.on_hand) || 0;
    if (onHand > rp) continue; // healthy
    const onPo = Number(a.onPurchaseOrder) || 0;
    const expected = onHand + onPo;
    all.push({
      productId: Number(r.id),
      itemId: r.item_id != null ? Number(r.item_id) : null,
      name: r.name || r.sku || `Item #${r.id}`,
      sku: r.sku || '',
      category: r.category || '',
      onHand,
      reorderPoint: rp,
      onPurchaseOrder: onPo,
      expected,
      shortfall: Math.max(rp - expected, 0),
      preferredVendorId: r.preferred_vendor_id != null ? Number(r.preferred_vendor_id) : null,
      preferredVendorName: r.preferred_vendor_id != null ? (vendorNames.get(Number(r.preferred_vendor_id)) || '') : '',
      purchaseCost: Number(r.purchase_cost) || 0,
      status: reorderStatus(onHand, onPo),
    });
  }

  // Summary is over the WHOLE reorder population (stable operational KPIs).
  const summary = {
    total: all.length,
    needsOrdering: all.filter((i) => i.status === REORDER_STATUS.NEEDS_ORDERING).length,
    onOrder: all.filter((i) => i.status === REORDER_STATUS.ON_ORDER || i.status === REORDER_STATUS.OUT_OF_STOCK_ON_ORDER).length,
    outOfStock: all.filter((i) => i.status === REORDER_STATUS.OUT_OF_STOCK || i.status === REORDER_STATUS.OUT_OF_STOCK_ON_ORDER).length,
    totalShortfall: all.reduce((s, i) => s + i.shortfall, 0),
  };

  let list = all;
  if (search) list = list.filter((i) => i.name.toLowerCase().includes(search) || i.sku.toLowerCase().includes(search) || (i.preferredVendorName || '').toLowerCase().includes(search));
  if (category) list = list.filter((i) => i.category === category);
  if (vendorId) list = list.filter((i) => i.preferredVendorId === vendorId);
  if (status) {
    if (status === 'ON_ORDER') list = list.filter((i) => i.status === REORDER_STATUS.ON_ORDER || i.status === REORDER_STATUS.OUT_OF_STOCK_ON_ORDER);
    else if (status === 'OUT_OF_STOCK') list = list.filter((i) => i.status === REORDER_STATUS.OUT_OF_STOCK || i.status === REORDER_STATUS.OUT_OF_STOCK_ON_ORDER);
    else list = list.filter((i) => i.status === status);
  }

  // Deterministic order: Out of Stock, Out of Stock — On Order, Needs Ordering,
  // On Order, then lowest On Hand, then name.
  const rank = {
    OUT_OF_STOCK: 0, OUT_OF_STOCK_ON_ORDER: 1, NEEDS_ORDERING: 2, ON_ORDER: 3,
  };
  list = [...list].sort((a, b) => (rank[a.status] - rank[b.status]) || (a.onHand - b.onHand) || a.name.localeCompare(b.name));

  return { items: list, summary };
};

module.exports = { REORDER_STATUS, reorderStatus, getReorderItems };
