/**
 * services/itemProfitabilityService.js — Simple Item Profitability.
 *
 * Answers one question: "if I sell this item at its configured selling price
 * using its configured purchase cost, what is the unit gross profit and margin?"
 *
 *   Gross Profit = Selling Price − Cost
 *   Gross Margin = Gross Profit / Selling Price × 100      (NOT markup)
 *
 * Cost source (audited): the Item Master's CONFIGURED PURCHASE COST
 * (`products.purchase_cost`) — for EVERY item type. This is a CURRENT,
 * unit-level ESTIMATE, so it must use exactly what the user configured on the
 * item — never a carrying/valuation cost.
 *
 *   Inventory Part      configured Purchase Cost
 *   Non-Inventory Part  configured Purchase Cost
 *   Service             configured Purchase Cost
 *
 * IMPORTANT — this is NOT the Inventory Valuation cost. The inventory valuation
 * engine (FIFO / Weighted Average carrying layers) and the realized-COGS engine
 * answer different questions and MUST NOT be substituted here:
 *   • Inventory Value / carrying cost  = cost of the stock actually on hand
 *   • Realized COGS                    = cost actually removed on a sale
 *   • Item Profitability               = configured cost vs selling price
 * Using the carrying cost (inventory value / QOH) here produced a wrong "Cost"
 * (e.g. $349.97) whenever the movement ledger's costing differed from the item's
 * configured purchase cost — which is exactly what this fixes. Inventory
 * valuation and COGS are untouched.
 *
 * Selling Price = the Item Master's Sales Price (`products.price`), tax
 * EXCLUSIVE — tax is never treated as profit.
 *
 * Missing/zero handling: NULL cost or price is NOT zero. A zero selling price
 * never divides by zero (margin is null / N/A). Negative profit and margin are
 * supported (loss-making items). An explicitly configured 0 cost stays 0.
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

/**
 * The configured Purchase Cost. A NULL/blank cost is "not configured"
 * (MISSING_COST downstream); an explicit 0 is a real, known zero.
 * A Service's cost is labelled SERVICE_COST so the source stays explicit.
 */
const costForProduct = (p) => {
  const cfg = num(p.purchase_cost);
  if (cfg == null) return { cost: null, costSource: 'NONE' };
  const isService = String(ItemTypes.normalizeTypeCode ? ItemTypes.normalizeTypeCode(p.type) : p.type) === 'SERVICE';
  return { cost: cfg, costSource: isService ? 'SERVICE_COST' : 'PURCHASE_COST' };
};

/** Profitability for one item. */
const getItemProfitability = (itemId) => {
  const p = db.prepare('SELECT id, name, sku, type, price, purchase_cost FROM products WHERE id = ?').get(Number(itemId));
  if (!p) return null;
  const { cost, costSource } = costForProduct(p);
  return { itemId: Number(p.id), name: p.name, sku: p.sku || '', type: p.type, ...computeProfitability(cost, p.price, costSource) };
};

/** Profitability for many items. */
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
  const rows = db.prepare(`SELECT id, name, sku, type, category, price, purchase_cost FROM products${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY name ASC`).all(...params);

  let items = rows.map((p) => {
    const { cost, costSource } = costForProduct(p);
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
