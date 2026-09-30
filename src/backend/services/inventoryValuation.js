/**
 * services/inventoryValuation.js — cost basis for inventory.
 *
 * This is the single place that answers: "what did it COST us to remove N units
 * of this item?" It is used by the document→stock reconciler so an inventory
 * SALE records a real COGS (from actual receipt costs), never the selling price
 * and never today's `products.purchase_cost`.
 *
 * Cost layers are derived from the movement ledger itself (`stock_movements`):
 * every positive movement that carries a `unitCost` is a receipt layer; every
 * negative movement consumes layers. Nothing is stored twice, so the layers can
 * never drift from the transactions that created them.
 *
 * Supported methods (products.valuation_method):
 *   FIFO             — consume the oldest available layer first
 *   WEIGHTED_AVERAGE — consume at the running average cost of on-hand stock
 *
 * An issue with no cost basis (e.g. opening stock with no receipt) values at 0
 * rather than inventing a cost — the spec explicitly forbids using the current
 * purchase cost as historical COGS.
 */

const db = require('../models/dbmgr');

const normMethod = (m) => {
  const k = String(m == null ? '' : m).trim().toUpperCase().replace(/\s+/g, '_');
  if (k === 'WEIGHTED_AVERAGE' || k === 'AVERAGE' || k === 'WEIGHTED_AVG' || k === 'WAVG') return 'WEIGHTED_AVERAGE';
  if (k === 'STANDARD_COST' || k === 'STANDARD') return 'STANDARD_COST';
  return 'FIFO';
};

/** Every movement for one item, oldest first (the ledger replay order). */
const movements = (itemId) => {
  try {
    return db.prepare(`
      SELECT id, quantityChange, unitCost, movedAt
      FROM stock_movements
      WHERE itemId = ?
      ORDER BY movedAt ASC, id ASC
    `).all(Number(itemId));
  } catch { return []; }
};

/**
 * Replay the ledger into the current on-hand layers / average.
 * `excludeMovementId` lets a caller value an issue that is ALREADY recorded
 * (used by reconciliation) without the new issue consuming itself.
 */
const replay = (itemId, method, excludeMovementId = null) => {
  const m = normMethod(method);
  const layers = [];       // FIFO layers: { qty, cost }
  let qtyOn = 0;
  let value = 0;

  for (const mv of movements(itemId)) {
    if (excludeMovementId != null && Number(mv.id) === Number(excludeMovementId)) continue;
    const q = Number(mv.quantityChange) || 0;
    const unit = Number(mv.unitCost) || 0;
    if (q > 0) {
      qtyOn += q;
      value += q * unit;
      if (m === 'FIFO') layers.push({ qty: q, cost: unit });
    } else if (q < 0) {
      let out = -q;
      if (m === 'FIFO') {
        // FIFO consumes the oldest layers; the authoritative value is the sum of
        // the REMAINING layers, so track quantity here and derive value below.
        qtyOn -= out;
        while (out > 1e-9 && layers.length) {
          const L = layers[0];
          const take = Math.min(L.qty, out);
          L.qty -= take; out -= take;
          if (L.qty <= 1e-9) layers.shift();
        }
      } else {
        const avg = qtyOn > 0 ? value / qtyOn : 0;
        const take = Math.min(out, qtyOn);
        value -= take * avg; qtyOn -= take;
      }
    }
  }

  // For FIFO the on-hand value is exactly the remaining cost layers.
  if (m === 'FIFO') value = layers.reduce((s, L) => s + L.qty * L.cost, 0);

  return { method: m, layers, qtyOn, value };
};

/**
 * Cost of removing `qty` units, using the ledger state BEFORE that removal.
 * `opts.standardCost` supplies the fixed cost for the STANDARD_COST method.
 * Returns { unitCost, totalCost, remainingQty, remainingValue }.
 */
const costOfRemoval = (itemId, qty, method, opts = {}) => {
  const n = Number(qty) || 0;
  const { method: m, layers, qtyOn, value } = replay(itemId, method);
  if (n <= 0) return { unitCost: 0, totalCost: 0, remainingQty: qtyOn, remainingValue: value };

  if (m === 'STANDARD_COST') {
    // A standard cost is a configured rate, not a layer cost. Fall back to the
    // running average when no standard cost is supplied.
    const sc = Number(opts.standardCost) > 0
      ? Number(opts.standardCost)
      : (qtyOn > 0 ? value / qtyOn : 0);
    const totalCost = sc * n;
    return { unitCost: sc, totalCost, remainingQty: qtyOn - n, remainingValue: value - totalCost };
  }

  if (m === 'FIFO') {
    let need = n;
    let cost = 0;
    for (const L of layers) {
      if (need <= 1e-9) break;
      const take = Math.min(L.qty, need);
      cost += take * L.cost;
      need -= take;
    }
    return { unitCost: cost / n, totalCost: cost, remainingQty: qtyOn - n, remainingValue: Math.max(0, value - cost) };
  }

  // WEIGHTED_AVERAGE (and STANDARD_COST fallback) — running average.
  const avg = qtyOn > 0 ? value / qtyOn : 0;
  const totalCost = avg * n;
  return { unitCost: avg, totalCost, remainingQty: qtyOn - n, remainingValue: value - totalCost };
};

/** Current on-hand value for one item (for the Inventory Asset ↔ subledger test). */
const currentValue = (itemId, method) => replay(itemId, method).value;

/**
 * Total value of inventory on hand across the whole ledger (all items).
 *
 * Because every issue records the valuation cost it consumed, the running
 * (in − out) value at recorded cost equals the sum of the current cost layers
 * for BOTH FIFO and weighted average. One aggregate query — no per-item replay
 * — so the dashboard stays O(1) in the number of items.
 */
const totalValue = () => {
  try {
    const row = db.prepare(`
      SELECT COALESCE(SUM(m.quantityChange * COALESCE(m.unitCost, 0)), 0) AS v
      FROM stock_movements m
    `).get();
    return Math.round((Number(row && row.v) || 0) * 100) / 100;
  } catch { return 0; }
};

module.exports = { costOfRemoval, currentValue, totalValue, replay, normMethod };
