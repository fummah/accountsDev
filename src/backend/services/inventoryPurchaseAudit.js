/**
 * services/inventoryPurchaseAudit.js — READ-ONLY purchase/inventory audit.
 *
 * Two jobs, both non-mutating (they never merge, reverse or rewrite anything):
 *
 *   1. auditDuplicatePurchaseMovements()
 *      Find items where the SAME purchase produced BOTH a goods-receipt movement
 *      (sourceType 'receipt') AND a PO-linked bill movement (sourceType 'bill').
 *      That is the historical shape of the "King Mattress" double-count: the
 *      receipt took the stock in, and the PO-linked bill received it again.
 *      Returns a review report — a human decides what (if anything) to reverse.
 *
 *   2. reconcileQoh()
 *      Prove the authoritative Quantity On Hand (the movement ledger) still
 *      equals the cached item_stock rows. Any mismatch is reported per item.
 */

const db = require('../models/dbmgr');

const num = (v) => Number(v) || 0;

/** qty received per (itemId, poId) from all goods receipts. */
const receiptQtyByItemPo = () => {
  const map = new Map();
  try {
    const rows = db.prepare(`
      SELECT m.itemId AS itemId, r.purchase_order_id AS poId, SUM(m.quantityChange) AS qty
      FROM stock_movements m
      JOIN goods_receipts r ON r.id = m.sourceId
      WHERE m.sourceType = 'receipt' AND m.quantityChange > 0
      GROUP BY m.itemId, r.purchase_order_id
    `).all();
    for (const r of rows) map.set(`${Number(r.itemId)}:${Number(r.poId)}`, num(r.qty));
  } catch { /* tables may be absent on very old DBs */ }
  return map;
};

/** Positive inventory billed on a PO-linked bill line, per movement. */
const billMovementsWithPo = () => {
  try {
    return db.prepare(`
      SELECT m.id AS movementId, m.itemId AS itemId, m.quantityChange AS quantity,
             m.unitCost AS unitCost, m.movedAt AS movedAt, m.sourceId AS billId,
             e.ref_no AS billRef,
             (SELECT el.purchase_order_id
                FROM expense_lines el
                JOIN products p ON p.id = el.product_id
               WHERE el.expense_id = m.sourceId
                 AND p.item_id = m.itemId
                 AND el.purchase_order_id IS NOT NULL
               LIMIT 1) AS poId
      FROM stock_movements m
      LEFT JOIN expenses e ON e.id = m.sourceId
      WHERE m.sourceType = 'bill' AND m.quantityChange > 0
    `).all();
  } catch { return []; }
};

/**
 * READ-ONLY duplicate-purchase report. Groups by (item, PO) where a receipt AND
 * a PO-linked bill both moved stock. Never mutates.
 */
function auditDuplicatePurchaseMovements() {
  const receipts = receiptQtyByItemPo();
  const bills = billMovementsWithPo();
  const groups = new Map();

  for (const b of bills) {
    if (!b.poId) continue;
    const key = `${Number(b.itemId)}:${Number(b.poId)}`;
    if (!receipts.has(key)) continue;             // this bill had no receipt for the same PO
    if (!groups.has(key)) {
      const item = db.prepare('SELECT id, name FROM items WHERE id = ?').get(Number(b.itemId));
      const po = db.prepare('SELECT po_number FROM purchase_orders WHERE id = ?').get(Number(b.poId));
      groups.set(key, {
        itemId: Number(b.itemId),
        itemName: item ? item.name : `Item #${b.itemId}`,
        poId: Number(b.poId),
        poNumber: po ? po.po_number : `PO #${b.poId}`,
        receiptQty: num(receipts.get(key)),
        billQty: 0,
        billMovements: [],
      });
    }
    const g = groups.get(key);
    g.billQty += num(b.quantity);
    g.billMovements.push({ movementId: b.movementId, billId: b.billId, billRef: b.billRef, quantity: num(b.quantity), unitCost: b.unitCost == null ? null : num(b.unitCost), movedAt: b.movedAt });
  }

  const duplicateGroups = [...groups.values()].map(g => ({
    ...g,
    overStatedQty: Math.min(num(g.receiptQty), num(g.billQty)),
    recommendation: 'Review: the goods were received (receipt) AND the PO-linked bill moved quantity again. Reverse the duplicated BILL movement(s) via a controlled repair — do not delete rows by hand and do not touch the receipt.',
  }));

  return {
    generatedAt: new Date().toISOString(),
    duplicateGroupCount: duplicateGroups.length,
    duplicateGroups,
    note: 'Read-only advisory. Confirmed duplicates must be repaired through a controlled migration/reversal that also fixes valuation and the GL.',
  };
}

/**
 * READ-ONLY reconciliation of the authoritative ledger against the cached
 * item_stock rows. Returns per-item mismatches (there should be none).
 */
function reconcileQoh() {
  const ledger = [];
  const cached = [];
  try { ledger.push(...db.prepare('SELECT itemId, SUM(quantityChange) AS qty FROM stock_movements GROUP BY itemId').all()); } catch { /* ignore */ }
  try { cached.push(...db.prepare('SELECT itemId, SUM(quantity) AS qty FROM item_stock GROUP BY itemId').all()); } catch { /* ignore */ }

  const cachedMap = new Map(cached.map(r => [Number(r.itemId), num(r.qty)]));
  const seen = new Set();
  const mismatches = [];
  const push = (id, l, c) => {
    const item = db.prepare('SELECT name FROM items WHERE id = ?').get(id);
    mismatches.push({ itemId: id, itemName: item ? item.name : `Item #${id}`, ledgerQty: l, cachedQty: c, diff: Math.round((l - c) * 1e6) / 1e6 });
  };
  for (const r of ledger) {
    const id = Number(r.itemId); seen.add(id);
    const l = num(r.qty); const c = cachedMap.get(id) || 0;
    if (Math.abs(l - c) > 1e-6) push(id, l, c);
  }
  for (const [id, c] of cachedMap) {
    if (!seen.has(id) && Math.abs(c) > 1e-6) push(id, 0, c);
  }

  return { generatedAt: new Date().toISOString(), mismatchCount: mismatches.length, mismatches: mismatches.slice(0, 500) };
}

module.exports = { auditDuplicatePurchaseMovements, reconcileQoh };
