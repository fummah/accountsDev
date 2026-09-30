/**
 * services/inventoryReconciliationService.js — the INVENTORY SUBLEDGER ↔ GL
 * reconciliation (the "one connected chain" check).
 *
 * The central inventory engine keeps TWO representations of the same value:
 *
 *   • the SUBLEDGER  — the stock_movements ledger. Each movement carries the
 *                      cost it consumed/produced, so the on-hand value of an
 *                      item is SUM(quantityChange × unitCost) — exactly what
 *                      services/inventoryValuation computes.
 *   • the GENERAL LEDGER — the Inventory Asset account(s) the item posts to
 *                      (Dr on a purchase/bill, Cr on a sale/COGS).
 *
 * A healthy company has these agree. This service compares them PER Inventory
 * Asset account (items may use different ones) and reports the difference —
 * it never writes a "plug" journal to force them to match. A difference is
 * information for a human: a legacy transaction, a missing journal, a manual GL
 * entry, a wrong item account or an orphan layer.
 *
 * It reuses the central valuation rule (movement value) and the central journal
 * ledger — no second costing or posting engine.
 *
 * Company / tenant: one company per database; every query is scoped to the
 * active file via dbmgr.
 */

const db = require('../models/dbmgr');
const ItemTypes = require('./itemTypes');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const NON_BILL_STATES = "'draft','void','voided','cancelled','canceled'";

/** Subledger value per items.id: the ledger's own value (same rule as totalValue). */
const subledgerValueByItem = () => {
  const map = new Map();
  try {
    for (const r of db.prepare(`
      SELECT m.itemId, SUM(m.quantityChange * COALESCE(m.unitCost, 0)) AS v
      FROM stock_movements m
      GROUP BY m.itemId
    `).all()) map.set(Number(r.itemId), round2(r.v));
  } catch { /* movements optional */ }
  return map;
};

/** Posted GL balance per account: SUM(debit − credit). */
const glBalanceByAccount = () => {
  const map = new Map();
  try {
    for (const r of db.prepare(`
      SELECT jl.account_id AS account_id, SUM(jl.debit - jl.credit) AS b
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_id AND je.status = 'Posted'
      WHERE jl.account_id IS NOT NULL
      GROUP BY jl.account_id
    `).all()) map.set(Number(r.account_id), round2(r.b));
  } catch { /* journal optional */ }
  return map;
};

/** Quantity on hand per items.id (the authoritative item_stock balance). */
const qohByItem = () => {
  const map = new Map();
  try {
    for (const r of db.prepare('SELECT itemId, SUM(quantity) AS q FROM item_stock GROUP BY itemId').all()) {
      map.set(Number(r.itemId), Number(r.q) || 0);
    }
  } catch { /* item_stock optional */ }
  return map;
};

/** Movement-ledger quantity per items.id (must equal QOH). */
const movementQtyByItem = () => {
  const map = new Map();
  try {
    for (const r of db.prepare('SELECT itemId, SUM(quantityChange) AS q FROM stock_movements GROUP BY itemId').all()) {
      map.set(Number(r.itemId), Number(r.q) || 0);
    }
  } catch { /* movements optional */ }
  return map;
};

const accountName = (id) => {
  if (id == null) return '(no Inventory Asset account)';
  try {
    const a = db.prepare('SELECT name, number FROM chart_of_accounts WHERE id = ?').get(Number(id));
    return a ? `${a.number ? a.number + ' ' : ''}${a.name}` : `Account #${id}`;
  } catch { return `Account #${id}`; }
};

/**
 * The full reconciliation payload:
 *   accounts[]  — per Inventory Asset account: subledger value, GL balance, difference
 *   totals      — the company-wide subledger/GL/difference
 *   integrity[] — structural problems (QOH ≠ movement balance, zero qty with value,
 *                 positive qty with no cost basis, orphan/manual movements)
 */
const getInventoryReconciliation = () => {
  const products = db.prepare(
    'SELECT id, name, sku, type, item_id, inventory_asset_account_id, valuation_method FROM products'
  ).all().filter((p) => ItemTypes.tracksInventory(p.type));

  const valByItem = subledgerValueByItem();
  const glByAccount = glBalanceByAccount();
  const qohByItemMap = qohByItem();
  const mvQtyByItem = movementQtyByItem();

  // Group the subledger value by the item's Inventory Asset account.
  const byAccount = new Map(); // accountId (or null) -> { accountId, subledger, items:[], itemCount }
  const ensure = (acctId) => {
    const key = acctId == null ? 'null' : Number(acctId);
    if (!byAccount.has(key)) byAccount.set(key, { accountId: acctId == null ? null : Number(acctId), subledger: 0, itemCount: 0, items: [] });
    return byAccount.get(key);
  };

  for (const p of products) {
    const itemId = p.item_id != null ? Number(p.item_id) : null;
    const value = itemId != null ? (valByItem.get(itemId) || 0) : 0;
    const bucket = ensure(p.inventory_asset_account_id);
    bucket.subledger = round2(bucket.subledger + value);
    bucket.itemCount += 1;
    if (Math.abs(value) > 0.005) bucket.items.push({ productId: Number(p.id), name: p.name || p.sku || `Item #${p.id}`, itemId, value });
  }

  // Any Inventory Asset account with a GL balance but no item mapped to it
  // (e.g. a manual journal straight to Inventory Asset) must still appear.
  const mappedAccounts = new Set([...byAccount.values()].map((b) => (b.accountId == null ? 'null' : Number(b.accountId))));
  const inventoryAssetAccounts = new Set();
  try {
    for (const a of db.prepare("SELECT id, name, subType FROM chart_of_accounts WHERE status='Active'").all()) {
      if (String(a.subType || '').toLowerCase().includes('inventory') || String(a.name || '').toLowerCase().includes('inventory asset')) {
        inventoryAssetAccounts.add(Number(a.id));
      }
    }
  } catch { /* COA optional */ }
  for (const acctId of inventoryAssetAccounts) {
    if (!mappedAccounts.has(Number(acctId))) ensure(acctId);
  }

  const accounts = [...byAccount.values()].map((b) => {
    const gl = b.accountId != null ? (glByAccount.get(Number(b.accountId)) || 0) : 0;
    const difference = round2(b.subledger - gl);
    return {
      accountId: b.accountId,
      accountName: accountName(b.accountId),
      itemCount: b.itemCount,
      subledgerValue: b.subledger,
      glBalance: gl,
      difference,
      balanced: Math.abs(difference) < 0.005,
      items: b.items.sort((a, c) => Math.abs(c.value) - Math.abs(a.value)).slice(0, 25),
    };
  }).sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference) || String(a.accountName).localeCompare(String(b.accountName)));

  const totals = {
    subledgerValue: round2(accounts.reduce((s, a) => s + a.subledgerValue, 0)),
    glBalance: round2(accounts.reduce((s, a) => s + a.glBalance, 0)),
  };
  totals.difference = round2(totals.subledgerValue - totals.glBalance);

  // ── Structural integrity checks ─────────────────────────────────────────
  const integrity = [];
  for (const p of products) {
    const itemId = p.item_id != null ? Number(p.item_id) : null;
    if (p.inventory_asset_account_id == null) {
      integrity.push({ type: 'MISSING_INVENTORY_ASSET_ACCOUNT', productId: Number(p.id), name: p.name || `Item #${p.id}`, detail: 'Inventory Part has no Inventory Asset Account configured.' });
    }
    if (itemId == null) {
      integrity.push({ type: 'NO_ITEM_LINK', productId: Number(p.id), name: p.name || `Item #${p.id}`, detail: 'Inventory Part is not linked to a stock item.' });
      continue;
    }
    const qoh = qohByItemMap.get(itemId) || 0;
    const mvQty = mvQtyByItem.get(itemId) || 0;
    const value = valByItem.get(itemId) || 0;
    if (Math.abs(qoh - mvQty) > 0.005) {
      integrity.push({ type: 'QOH_MOVEMENT_MISMATCH', productId: Number(p.id), name: p.name || `Item #${p.id}`, detail: `On hand ${qoh} ≠ movement balance ${mvQty}.`, qoh, movementQty: mvQty });
    }
    if (Math.abs(qoh) < 0.005 && Math.abs(value) > 0.005) {
      integrity.push({ type: 'ZERO_QTY_NONZERO_VALUE', productId: Number(p.id), name: p.name || `Item #${p.id}`, detail: `Zero quantity on hand but carrying value ${value}.`, value });
    }
    if (qoh > 0.005 && Math.abs(value) < 0.005) {
      integrity.push({ type: 'NO_COST_BASIS', productId: Number(p.id), name: p.name || `Item #${p.id}`, detail: `${qoh} on hand with no cost basis (value 0) — was it received with a cost?`, qoh });
    }
  }

  // Movements with no source document (manual / orphan).
  let manualMovements = 0;
  try {
    manualMovements = db.prepare("SELECT COUNT(*) AS c FROM stock_movements WHERE sourceType IS NULL OR sourceType = ''").get().c;
  } catch { manualMovements = 0; }

  // Duplicate posting guard: source documents with more than one identical movement row.
  let duplicateMovements = 0;
  try {
    const dup = db.prepare(`
      SELECT sourceType, sourceId, itemId, warehouseId, quantityChange, COUNT(*) AS c
      FROM stock_movements
      WHERE sourceType IS NOT NULL AND sourceType != ''
      GROUP BY sourceType, sourceId, itemId, warehouseId, quantityChange
      HAVING COUNT(*) > 1
    `).all();
    duplicateMovements = dup.length;
  } catch { duplicateMovements = 0; }

  // Legacy bills that still post Inventory Asset while linked to a receipt
  // (informational: the approved model capitalises at the Bill, so this is
  // expected — surfaced only so a migration can be planned, never auto-changed).
  let billsWithItemLines = 0;
  try {
    billsWithItemLines = db.prepare(`
      SELECT COUNT(DISTINCT e.id) AS c FROM expenses e
      JOIN expense_lines el ON el.expense_id = e.id AND el.line_type = 'item'
      WHERE LOWER(COALESCE(e.approval_status,'')) NOT IN (${NON_BILL_STATES})
    `).get().c;
  } catch { billsWithItemLines = 0; }

  return {
    accounts,
    totals,
    integrity,
    summary: {
      accountsChecked: accounts.length,
      accountsBalanced: accounts.filter((a) => a.balanced).length,
      accountsOutOfBalance: accounts.filter((a) => !a.balanced).length,
      integrityIssues: integrity.length,
      manualMovements,
      duplicateMovements,
      billsWithItemLines,
    },
    generatedAt: new Date().toISOString(),
  };
};

module.exports = { getInventoryReconciliation };
