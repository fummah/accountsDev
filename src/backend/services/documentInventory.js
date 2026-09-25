/**
 * services/documentInventory.js — reconcile the STOCK a document caused.
 *
 * This is the seam between the document world and the stock world:
 *
 *   documents key products.id        (expense_lines.product_id, invoice_lines.product)
 *   the stock engine keys items.id   (stock_movements.itemId, item_stock.itemId)
 *
 * The ONLY sanctioned crossing is `Inventory.resolveInventoryItem()` — never a
 * name match. Product names repeat (33 product rows share the names of the 7
 * items in the live DB), so a name join silently moves the wrong product's
 * stock. This module never resolves an id itself; it asks the engine.
 *
 * ── One reconciler, two documents ────────────────────────────────────────────
 * A vendor bill RECEIVES stock and a sales invoice ISSUES it, but the
 * reconciliation arithmetic is identical: compute what the document wants now,
 * compare it with what has already been posted, and move only the difference.
 * Keeping ONE implementation is deliberate — a second copy is how the two
 * directions drift apart, and this codebase has already been bitten by exactly
 * that (see the shared LINE_INSERT_SQL in models/expenses.js).
 *
 * ── Why a DELTA and not a re-post ────────────────────────────────────────────
 * `updateExpense` and `updateInvoice` both DELETE and re-insert their lines, so
 * a line id is NOT stable across an edit and cannot be the reconciliation key.
 * The key is the stable tuple `(sourceType, sourceId, itemId, warehouseId)` —
 * audit §7.4 / §5.6, decision F1.
 *
 * Because the key set is the UNION of "what the document wants now" and "what
 * has already been posted", one code path covers every lifecycle event:
 *
 *   create                    → +desired        (receipt for a bill, issue for an invoice)
 *   edit 50 → 60              → +10      (never +110 — the brief's requirement)
 *   edit 60 → 50              → -10
 *   delete a line             → -posted  (it is in the posted set, not in desired)
 *   change the product        → -posted at the old item, +desired at the new
 *   move warehouse            → -posted at the old warehouse, +desired at the new
 *   re-save with no change    → nothing at all (idempotent)
 *   move to Draft / Void      → pass no lines and the whole effect reverses
 *   delete the document       → pass no lines (see reverseStock)
 *
 * ── Transaction discipline ───────────────────────────────────────────────────
 * `reconcileStock` opens a transaction ONLY when one is not already open, the
 * same way `Inventory.receiveStock` does. So it composes into a caller's
 * transaction when there is one (a bill is written inside its own transaction)
 * and is still atomic on its own when there is not (an invoice is written
 * before the handler runs, so the handler has no transaction to join).
 *
 * ── What this module deliberately does NOT do ────────────────────────────────
 * No valuation. Decision D1 defers costing: the General Ledger uses the line
 * amount, and `unitCost` is written to the movement for traceability only.
 * For a BILL the line rate IS a purchase cost, so it is meaningful there; for an
 * INVOICE the rate is a SELLING price and is deliberately NOT recorded as a cost.
 */

const db = require('../models/dbmgr');
const Inventory = require('../models/inventory');
const Warehouses = require('../models/warehouses');
const Classification = require('./productClassification');
const Valuation = require('./inventoryValuation');

/** The `stock_movements.sourceType` values this module owns. */
const SOURCE_TYPE_BILL = 'bill';
const SOURCE_TYPE_INVOICE = 'invoice';

/**
 * Which way does a document's desired quantity point?
 *
 * A bill's item lines are goods BOUGHT, so a line of 10 means ten units go IN.
 * An invoice's lines are goods SOLD, so a line of 10 means ten units go OUT.
 * The reconciliation arithmetic is otherwise identical, so this sign is the
 * only thing that differs — and it MUST be applied to the desired quantity
 * before the delta is taken, not guessed from the delta's sign. Taking the sign
 * of the delta alone would make the first save of an invoice RECEIVE stock,
 * which is exactly backwards.
 */
const SOURCE_DIRECTION = {
  [SOURCE_TYPE_BILL]: 1,
  [SOURCE_TYPE_INVOICE]: -1,
};

/** Same-tuple key. A string so Map iteration is stable and debuggable. */
const tupleKey = (itemId, warehouseId) => `${Number(itemId)}::${Number(warehouseId)}`;

/** Is a transaction already open? Mirrors the helper in models/inventory.js. */
const inTransaction = () => {
  try { return !!db.raw.inTransaction; } catch { return false; }
};

/**
 * Resolve the warehouse a line should move stock in.
 * The line's own choice wins; otherwise the default warehouse, created if the
 * install has none (see Warehouses.getOrCreateDefault).
 *
 * Invoices have no warehouse column at all, so every invoice line lands in the
 * default warehouse — which is the documented single-warehouse behaviour.
 */
const resolveWarehouseId = (line) => {
  const chosen = Number(line && line.warehouseId);
  if (Number.isFinite(chosen) && chosen > 0) return chosen;
  const def = Warehouses.getOrCreateDefault();
  return def && def.id != null ? Number(def.id) : null;
};

/** The raw reconciliation. Assumes a transaction is already open. */
const applyReconciliation = (sourceType, sourceId, itemLines) => {
  const errors = [];
  const applied = [];
  // +1 for a bill (goods in), −1 for an invoice (goods out).
  const direction = SOURCE_DIRECTION[sourceType] || 1;

  // ── 1. What the document wants now, in the items.id space ────────────────
  // Summed per tuple: a bill may legitimately carry TWO lines for the same
  // product in the same warehouse, which is exactly why §7.3 refuses a UNIQUE
  // index on the tuple.
  const desired = new Map();
  for (const line of itemLines || []) {
    const qty = Number(line.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue; // a zero line moves nothing

    if (line.productId == null) {
      errors.push(`line ${line.lineId}: an inventory line needs a product`);
      continue;
    }

    // A line that does not represent physical stock is NOT an error: a
    // Non-Inventory Part or a Service is a legitimate bill/invoice line that
    // simply never moves stock. Skip it from the DESIRED set. Because the
    // reconciliation key set is the union of desired + posted, any stock this
    // line moved while it WAS an inventory item (e.g. the product was later
    // retyped) is still reversed by the loop below — we only stop ADDING stock
    // for it.
    const prod = db.prepare('SELECT id, type, name, valuation_method, purchase_cost FROM products WHERE id = ?').get(Number(line.productId));
    if (!prod) {
      errors.push(`line ${line.lineId}: product #${line.productId} does not exist`);
      continue;
    }
    if (!Classification.tracksInventory(prod.type)) {
      continue;
    }

    const item = Inventory.resolveInventoryItem(line.productId);
    if (!item) {
      errors.push(`line ${line.lineId}: product #${line.productId} could not be mapped to an inventory item`);
      continue;
    }
    const warehouseId = resolveWarehouseId(line);
    if (!warehouseId) {
      errors.push(`line ${line.lineId}: no warehouse available to move stock in`);
      continue;
    }

    const key = tupleKey(item.id, warehouseId);
    const prev = desired.get(key) || {
      itemId: Number(item.id),
      warehouseId,
      quantity: 0,
      costTotal: 0,
      method: prod.valuation_method || 'FIFO',
      standardCost: Number(prod.purchase_cost) || 0,
      lineId: line.lineId,
    };
    prev.quantity += qty;
    // Cost carried by the line (a bill's rate is a purchase cost). For an
    // invoice the rate is a SELLING price, so unitCost is null and the removal
    // is valued from receipt layers instead (see the move loop).
    prev.costTotal += qty * (Number(line.unitCost) || 0);
    desired.set(key, prev);
  }

  // ── 2. What has already been posted, already in the items.id space ───────
  const posted = new Map();
  for (const m of Inventory.getMovementsForSource(sourceType, sourceId)) {
    const key = tupleKey(m.itemId, m.warehouseId);
    const prev = posted.get(key) || {
      itemId: Number(m.itemId),
      warehouseId: Number(m.warehouseId),
      quantity: 0,
      costTotal: 0,
      method: null,
    };
    prev.quantity += Number(m.quantityChange || 0);
    // Signed cost already posted — lets a reversal restore the ORIGINAL cost
    // instead of re-valuing at today's layers.
    prev.costTotal += Number(m.quantityChange || 0) * (Number(m.unitCost) || 0);
    posted.set(key, prev);
  }

  // Resolve the valuation method for a tuple whose desired line is gone
  // (a reversal), by mapping the stock item back to its product.
  const methodForItem = (itemId) => {
    try {
      const p = db.prepare('SELECT valuation_method FROM products WHERE item_id = ? LIMIT 1').get(Number(itemId));
      return p && p.valuation_method ? p.valuation_method : 'FIFO';
    } catch { return 'FIFO'; }
  };
  const standardCostForItem = (itemId) => {
    try {
      const p = db.prepare('SELECT purchase_cost FROM products WHERE item_id = ? LIMIT 1').get(Number(itemId));
      return p ? Number(p.purchase_cost) || 0 : 0;
    } catch { return 0; }
  };

  // ── 3. Move only the difference, across the UNION of both key sets ───────
  for (const key of new Set([...desired.keys(), ...posted.keys()])) {
    const want = desired.get(key);
    const have = posted.get(key);
    // `want.quantity` is always a positive line quantity; the DOCUMENT's
    // direction turns it into a signed target. `posted` is already signed
    // (a receipt is positive, an issue negative).
    const targetSigned = direction * (want ? want.quantity : 0);
    const delta = targetSigned - (have ? have.quantity : 0);
    if (Math.abs(delta) < 1e-9) continue; // unchanged — move nothing at all

    const target = want || have; // `have` carries the ids for a removed line
    const source = {
      sourceType,
      sourceId,
      // Informational only — never the reconciliation key (§7.4).
      sourceLineId: want ? want.lineId : null,
    };

    // ── Cost basis ───────────────────────────────────────────────────────────
    // ADDING stock (delta > 0): use the line's own cost (a bill rate), else the
    // original posted cost so a reversal restores exactly what it took.
    // REMOVING stock (delta < 0): value it from receipt layers. A bill return
    // carries a purchase cost on the line; an invoice issue does not (its rate
    // is a selling price) so the valuation engine supplies the COGS unit cost.
    let unitCost = null;
    if (delta > 0) {
      if (want && want.quantity > 0 && want.costTotal > 0) {
        unitCost = want.costTotal / want.quantity;
      } else if (have && Math.abs(have.quantity) > 1e-9 && Math.abs(have.costTotal) > 1e-9) {
        unitCost = Math.abs(have.costTotal) / Math.abs(have.quantity);
      }
    } else {
      const method = (want && want.method) || (have && have.method) || methodForItem(target.itemId);
      const standardCost = (want && want.standardCost) || standardCostForItem(target.itemId);
      const v = Valuation.costOfRemoval(target.itemId, -delta, method, { standardCost });
      if (v.unitCost > 0) unitCost = v.unitCost;
      else if (want && want.quantity > 0 && want.costTotal > 0) unitCost = want.costTotal / want.quantity;
    }

    // The sign of the DELTA decides the primitive, not the document type:
    // a bill cut from 60 to 40 gives goods back, and an invoice raised from
    // 40 to 60 takes more. Both are "remove stock".
    const res = delta > 0
      ? Inventory.receiveStock(target.itemId, target.warehouseId, delta, unitCost, source)
      : Inventory.issueStock(target.itemId, target.warehouseId, -delta, unitCost, source);

    if (res && res.success) {
      applied.push({
        itemId: target.itemId,
        warehouseId: target.warehouseId,
        delta,
        unitCost,
        lineId: want ? want.lineId : null,
      });
    } else {
      // An engine failure is not a per-line data problem — throw so the
      // caller's transaction rolls back instead of half-posting.
      throw new Error(
        `Could not ${delta > 0 ? 'add' : 'remove'} ${Math.abs(delta)} of item ` +
        `#${target.itemId} in warehouse #${target.warehouseId}: ` +
        `${(res && res.error) || 'unknown error'}`
      );
    }
  }

  return { success: errors.length === 0, applied, errors };
};

/**
 * Reconcile one document's stock effect against its current item lines.
 *
 * @param {string} sourceType  'bill' | 'invoice'
 * @param {number} sourceId    expenses.id | invoices.id
 * @param {Array}  itemLines   [{ lineId, productId, quantity, warehouseId, unitCost }]
 *                             Pass an EMPTY array to reverse everything this
 *                             document ever moved (Draft / Void / delete).
 * @returns {{success:boolean, applied:Array, errors:Array}}
 *          Never throws for a per-line problem — the caller decides whether an
 *          unresolvable line should abort the document. Throws only if the
 *          engine itself fails, so the caller's transaction rolls back.
 */
function reconcileStock(sourceType, sourceId, itemLines) {
  const id = Number(sourceId);
  if (!sourceType) return { success: false, applied: [], errors: ['sourceType is required'] };
  if (!id) return { success: false, applied: [], errors: ['sourceId is required'] };

  // Compose into the caller's transaction when there is one; otherwise be
  // atomic on our own. A multi-line reconcile that fails half way must not
  // leave half the goods moved.
  if (inTransaction()) return applyReconciliation(sourceType, id, itemLines);
  const tx = db.transaction(() => applyReconciliation(sourceType, id, itemLines));
  return tx();
}

/** Reverse every movement a document caused (Draft / Void / delete). */
function reverseStock(sourceType, sourceId) {
  return reconcileStock(sourceType, sourceId, []);
}

// ── Bill-facing wrappers ────────────────────────────────────────────────────
const reconcileBillStock = (expenseId, itemLines) =>
  reconcileStock(SOURCE_TYPE_BILL, expenseId, itemLines);
const reverseBillStock = (expenseId) => reverseStock(SOURCE_TYPE_BILL, expenseId);

// ── Invoice-facing wrappers ─────────────────────────────────────────────────
const reconcileInvoiceStock = (invoiceId, itemLines) =>
  reconcileStock(SOURCE_TYPE_INVOICE, invoiceId, itemLines);
const reverseInvoiceStock = (invoiceId) => reverseStock(SOURCE_TYPE_INVOICE, invoiceId);

module.exports = {
  reconcileStock,
  reverseStock,
  reconcileBillStock,
  reverseBillStock,
  reconcileInvoiceStock,
  reverseInvoiceStock,
  SOURCE_TYPE_BILL,
  SOURCE_TYPE_INVOICE,
  tupleKey,
};
