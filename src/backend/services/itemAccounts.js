/**
 * services/itemAccounts.js — THE single, Item-Type-driven account resolver.
 *
 * The problem this module removes: an Inventory Part used to be configurable
 * with BOTH a generic Purchase "Expense / COGS Account" AND the dedicated
 * Inventory "COGS Account". Posting then took "whichever account happened to be
 * non-null", so a bill could Dr Expense while the receipt/bill model also
 * Dr Inventory Asset — two competing mappings for one item.
 *
 * The rule is now decided by ITEM TYPE, never by "first available account":
 *
 *   INVENTORY_PART
 *     purchase posting  → Inventory Asset account (central inventory model)
 *     sale / COGS       → the dedicated Inventory COGS account
 *     generic Purchase Expense/COGS is NOT APPLICABLE and is never returned
 *
 *   NON_INVENTORY_PART / SERVICE
 *     purchase posting  → the configured Purchase Expense / COGS account
 *     no inventory accounts, no stock movement
 *
 * Every purchasing/sales posting path must resolve accounts through here.
 */

const db = require('../models/dbmgr');
const ItemTypes = require('./itemTypes');

/** True when the type (code string or product row) tracks inventory quantity. */
function isInventoryType(typeOrProduct) {
  const raw = (typeOrProduct && typeof typeOrProduct === 'object')
    ? typeOrProduct.type
    : typeOrProduct;
  return ItemTypes.tracksInventory(String(raw == null ? '' : raw).trim().toLowerCase());
}

const systemAccountId = (name) => {
  try {
    const a = require('../models/chartOfAccounts').getSystemAccount(name);
    return a && a.id != null ? Number(a.id) : null;
  } catch { return null; }
};

/**
 * The account a PURCHASE of this item debits.
 *  - Inventory Part → Inventory Asset (never a generic Expense/COGS account).
 *  - Non-Inventory / Service → the configured Purchase Expense/COGS account.
 */
function resolvePurchasePostingAccountId(prod) {
  if (!prod) return null;
  if (isInventoryType(prod)) {
    if (prod.inventory_asset_account_id != null) return Number(prod.inventory_asset_account_id);
    return systemAccountId('Inventory Asset');
  }
  if (prod.purchase_expense_account_id != null) return Number(prod.purchase_expense_account_id);
  return null;
}

/** The COGS account a SALE debits. Inventory Parts only; null otherwise. */
function resolveSaleCogsAccountId(prod) {
  if (!prod || !isInventoryType(prod)) return null;
  if (prod.cogs_account_id != null) return Number(prod.cogs_account_id);
  return systemAccountId('Cost of Goods Sold');
}

/** The Inventory Asset account an Inventory Part credits on a sale / debits on receipt. */
function resolveInventoryAssetAccountId(prod) {
  if (!prod || !isInventoryType(prod)) return null;
  if (prod.inventory_asset_account_id != null) return Number(prod.inventory_asset_account_id);
  return systemAccountId('Inventory Asset');
}

/**
 * Deterministic server-side normalization for a save payload.
 * An Inventory Part must never persist the generic Purchase Expense/COGS
 * mapping (a stale value from a prior Non-Inventory configuration) — it is
 * normalized to null so no later posting can pick it up. A Non-Inventory /
 * Service must never persist inventory accounts.
 */
function normalizeItemAccounts(typeOrProduct, data = {}) {
  const out = { ...data };
  if (isInventoryType(typeOrProduct)) {
    out.purchaseExpenseAccountId = null;
  } else {
    out.inventoryAssetAccountId = null;
    out.cogsAccountId = null;
  }
  return out;
}

/**
 * READ-ONLY audit of Inventory Parts whose account mappings are incomplete or
 * ambiguous. Never mutates. Statuses:
 *   OK                        — Inventory Asset + COGS set, no generic mapping
 *   DUPLICATE/AMBIGUOUS       — also carries a generic Purchase Expense/COGS
 *   MISSING INVENTORY COGS    — no dedicated COGS account
 *   MISSING INVENTORY ASSET   — no Inventory Asset account
 */
function auditItemAccountMappings() {
  const accountName = (id) => {
    if (id == null) return '';
    try { const a = db.prepare('SELECT name FROM chart_of_accounts WHERE id = ?').get(Number(id)); return a ? a.name : `#${id}`; } catch { return `#${id}`; }
  };
  let rows = [];
  try {
    rows = db.prepare(`SELECT id, name, sku, type, purchase_expense_account_id, inventory_asset_account_id, cogs_account_id FROM products`).all();
  } catch { return { generatedAt: new Date().toISOString(), count: 0, items: [], note: 'products table unavailable' }; }

  const items = [];
  for (const p of rows) {
    if (!isInventoryType(p.type)) continue;
    const hasPurchaseExp = p.purchase_expense_account_id != null;
    const hasCogs = p.cogs_account_id != null;
    const hasAsset = p.inventory_asset_account_id != null;
    let status = 'OK';
    if (!hasCogs) status = 'MISSING INVENTORY COGS';
    else if (!hasAsset) status = 'MISSING INVENTORY ASSET';
    else if (hasPurchaseExp) status = 'DUPLICATE/AMBIGUOUS';
    if (status === 'OK') continue;
    items.push({
      id: Number(p.id),
      name: p.name,
      sku: p.sku,
      type: p.type,
      purchaseExpenseAccountId: p.purchase_expense_account_id == null ? null : Number(p.purchase_expense_account_id),
      purchaseExpenseAccount: accountName(p.purchase_expense_account_id),
      inventoryCogsAccountId: p.cogs_account_id == null ? null : Number(p.cogs_account_id),
      inventoryCogsAccount: accountName(p.cogs_account_id),
      inventoryAssetAccountId: p.inventory_asset_account_id == null ? null : Number(p.inventory_asset_account_id),
      inventoryAssetAccount: accountName(p.inventory_asset_account_id),
      status,
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    count: items.length,
    items,
    note: 'Read-only. Inventory Parts should carry Inventory Asset + COGS only; a generic Purchase Expense/COGS mapping is never used for posting and may be cleared on the next save.',
  };
}

module.exports = {
  isInventoryType,
  resolvePurchasePostingAccountId,
  resolveSaleCogsAccountId,
  resolveInventoryAssetAccountId,
  normalizeItemAccounts,
  auditItemAccountMappings,
};
