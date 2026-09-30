/**
 * services/itemProfitabilityService.js — Simple Item Profitability.
 *
 * Answers one question: "if I sell this item at its configured selling price
 * using its current/configured cost, what is the unit gross profit and margin?"
 *
 *   Gross Profit = Selling Price − Cost
 *   Gross Margin = Gross Profit / Selling Price × 100      (NOT markup)
 *
 * Cost source (audited, reusing existing data — no new cost field):
 *   Inventory Part      central inventory carrying cost = current inventory
 *                       value / quantity on hand (from the movement ledger),
 *                       falling back to the configured Purchase Cost when there
 *                       is no stock. The default Purchase Cost is NEVER used to
 *                       rewrite the carrying cost of existing inventory.
 *   Non-Inventory Part  configured Purchase Cost
 *   Service             configured Purchase Cost, else "not available" (a
 *                       Service cost is never assumed to be zero)
 *
 * Selling Price = the Item Master's Sales Price (`products.price`), tax
 * EXCLUSIVE — tax is never treated as profit.
 *
 * Missing/zero handling: NULL cost or price is NOT zero. A zero selling price
 * never divides by zero (margin is null / N/A). Negative profit and margin are
 * supported (loss-making items).
 *
 * Nothing is stored — profitability is derived, so it can never drift. This is
 * informational only and creates no journal entries or inventory movements.
 *
 * Company / tenant: one company per database; all queries scoped to the active file.
 */

const db = require('../models/dbmgr');
const ItemTypes = require('./itemTypes');

const num = (v) => (v == null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

const STATUS = {
  POSITIVE: 'POSITIVE',
  ZERO: 'ZERO',
  NEGATIVE: 'NEGATIVE',
  ZERO_PRICE: 'ZERO_PRICE',
  MISSING_COST: 'MISSING_COST',
  MISSING_PRICE: 'MISSING_PRICE',
};

/** Pure formula — the ONE place gross profit / margin are computed. */
const computeProfitability = (cost, sellingPrice, costSource) => {
  const c = num(cost);
  const p = num(sellingPrice);
  if (c == null) return { cost: null, sellingPrice: p, grossProfit: null, marginPercent: null, status: STATUS.MISSING_COST, costSource };
  if (p == null) return { cost: c, sellingPrice: null, grossProfit: null, marginPercent: null, status: STATUS.MISSING_PRICE, costSource };
  const grossProfit = p - c;
  const marginPercent = p !== 0 ? (grossProfit / p) * 100 : null;
  let status = STATUS.POSITIVE;
  if (p === 0) status = STATUS.ZERO_PRICE;
  else if (grossProfit < 0) status = STATUS.NEGATIVE;
  else if (grossProfit === 0) status = STATUS.ZERO;
  return { cost: c, sellingPrice: p, grossProfit, marginPercent, status, costSource };
};

/** itemId -> { value, qty } from the movement ledger + item_stock (batch). */
const carryingCostMap = (itemIds) => {
  const map = new Map();
  const ids = [...new Set((itemIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return map;
  const ph = ids.map(() => '?').join(',');
  const qtyMap = new Map();
  try {
    for (const r of db.prepare(`SELECT itemId, SUM(quantity) AS qty FROM item_stock WHERE itemId IN (${ph}) GROUP BY itemId`).all(...ids)) {
      qtyMap.set(Number(r.itemId), Number(r.qty) || 0);
    }
  } catch { /* item_stock may be empty */ }
  const valueMap = new Map();
  try {
    for (const r of db.prepare(`SELECT itemId, SUM(quantityChange * COALESCE(unitCost, 0)) AS value FROM stock_movements WHERE itemId IN (${ph}) GROUP BY itemId`).all(...ids)) {
      valueMap.set(Number(r.itemId), Number(r.value) || 0);
    }
  } catch { /* movements may be empty */ }
  for (const id of ids) {
    const qty = qtyMap.get(id) || 0;
    const value = valueMap.get(id) || 0;
    map.set(id, { value, qty, cost: qty > 0 ? value / qty : null });
  }
  return map;
};

const costForProduct = (p, carrying) => {
  if (ItemTypes.tracksInventory(p.type)) {
    const c = p.item_id != null ? carrying.get(Number(p.item_id)) : null;
    if (c && c.qty > 0 && c.cost != null) {
      const method = String(p.valuation_method || 'FIFO').toUpperCase();
      return { cost: c.cost, costSource: method.includes('WEIGHTED') ? 'WEIGHTED_AVERAGE' : 'FIFO_CARRYING_COST' };
    }
    const fallback = num(p.purchase_cost);
    return fallback != null && fallback > 0
      ? { cost: fallback, costSource: 'DEFAULT_PURCHASE_COST' }
      : { cost: null, costSource: 'NONE' };
  }
  const cfg = num(p.purchase_cost);
  if (cfg == null) return { cost: null, costSource: 'NONE' };
  return { cost: cfg, costSource: ItemTypes.normalizeTypeCode(p.type) === 'SERVICE' ? 'SERVICE_COST' : 'DEFAULT_PURCHASE_COST' };
};

/** Profitability for one item. */
const getItemProfitability = (itemId) => {
  const p = db.prepare('SELECT id, name, sku, type, price, purchase_cost, item_id, valuation_method FROM products WHERE id = ?').get(Number(itemId));
  if (!p) return null;
  const carrying = carryingCostMap([p.item_id]);
  const { cost, costSource } = costForProduct(p, carrying);
  return { itemId: Number(p.id), name: p.name, sku: p.sku || '', type: p.type, ...computeProfitability(cost, p.price, costSource) };
};

/** Profitability for many items (one batch carrying-cost query — no N+1). */
const getItemProfitabilities = (filters = {}) => {
  const search = String(filters.search || '').trim().toLowerCase();
  const type = String(filters.type || '').trim();
  const category = String(filters.category || '').trim();
  const dataStatus = String(filters.dataStatus || '').trim().toUpperCase();

  const where = [];
  const params = [];
  if (type) { where.push('type = ?'); params.push(type); }
  if (category) { where.push('category = ?'); params.push(category); }
  if (search) { where.push('(LOWER(name) LIKE ? OR LOWER(sku) LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  const rows = db.prepare(`SELECT id, name, sku, type, category, price, purchase_cost, item_id, valuation_method FROM products${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY name ASC`).all(...params);

  const carrying = carryingCostMap(rows.filter((r) => ItemTypes.tracksInventory(r.type)).map((r) => r.item_id));
  let items = rows.map((p) => {
    const { cost, costSource } = costForProduct(p, carrying);
    return { itemId: Number(p.id), name: p.name, sku: p.sku || '', type: p.type, category: p.category || '', ...computeProfitability(cost, p.price, costSource) };
  });

  if (dataStatus) {
    if (dataStatus === 'MISSING_COST') items = items.filter((i) => i.status === STATUS.MISSING_COST);
    else if (dataStatus === 'MISSING_PRICE') items = items.filter((i) => i.status === STATUS.MISSING_PRICE);
    else if (dataStatus === 'NEGATIVE') items = items.filter((i) => i.status === STATUS.NEGATIVE);
    else if (dataStatus === 'HAS_DATA') items = items.filter((i) => i.grossProfit != null);
  }

  const summary = {
    total: items.length,
    withData: items.filter((i) => i.grossProfit != null).length,
    missingCost: items.filter((i) => i.status === STATUS.MISSING_COST).length,
    missingPrice: items.filter((i) => i.status === STATUS.MISSING_PRICE).length,
    negative: items.filter((i) => i.status === STATUS.NEGATIVE).length,
  };
  return { items, summary };
};

module.exports = { STATUS, computeProfitability, getItemProfitability, getItemProfitabilities };
