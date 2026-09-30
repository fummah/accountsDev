/**
 * itemTypes.js — THE central definition of what an Item is and what each Item
 * Type can do. Nothing else should branch on a raw type string; everything
 * asks this module.
 *
 * AccuLedger has ONE item master (`products`). Its `type` column stores a
 * canonical TYPE CODE:
 *
 *   INVENTORY_PART      physical goods whose quantity + inventory value are tracked
 *   NON_INVENTORY_PART  physical goods bought/sold but NOT quantity-tracked
 *   SERVICE             labour / service activities (no stock, optionally purchased)
 *
 * The capability table lives in ONE place — src/frontend/src/shared/itemTypes.json
 * — which is imported by BOTH this module and the renderer mirror
 * (src/frontend/src/utils/itemTypes.js). Adding a future type is a one-line
 * change to that JSON; UI/validation/transaction behaviour follow automatically.
 *
 * ── Backward compatibility ───────────────────────────────────────────────────
 * Legacy rows use the old vocabulary ('Product', 'Raw Material', 'Asset',
 * 'Bundle', 'Service'). `normalizeTypeCode` maps those onto the canonical
 * codes, and `tracksInventory` keeps the legacy "Product tracks stock"
 * behaviour so existing inventory never silently stops moving.
 */

const SHARED = require('../../frontend/src/shared/itemTypes.json');

const ITEM_TYPES = SHARED.types;
const ITEM_TYPE_CODES = Object.keys(ITEM_TYPES);
const LEGACY_TYPE_MAP = SHARED.legacyTypeMap;

const typeKey = (raw) => String(raw == null ? '' : raw).trim().toLowerCase();

/** Canonical TYPE CODE for any stored/legacy value, or null when unknown. */
const normalizeTypeCode = (raw) => {
  const k = typeKey(raw);
  if (!k) return null;
  const direct = k.toUpperCase();
  if (ITEM_TYPES[direct]) return direct;
  return LEGACY_TYPE_MAP[k] || null;
};

/** Capability object for a type code / stored value (null when unknown). */
const capabilities = (raw) => {
  const code = normalizeTypeCode(raw);
  return code ? ITEM_TYPES[code] : null;
};

const label = (raw) => {
  const cap = capabilities(raw);
  return cap ? cap.label : (raw == null ? '' : String(raw));
};

/** True when the item's quantity/inventory value are tracked. */
const tracksInventory = (raw) => {
  const cap = capabilities(raw);
  if (cap) return !!cap.tracksQuantity;
  // Fail safe: legacy 'product' etc. map above; unknown blank = no stock.
  return false;
};

/** Does a type require the Inventory Information section? */
const needsInventoryAccounts = (raw) => {
  const cap = capabilities(raw);
  return !!(cap && cap.needsInventoryAsset);
};

/** Alias used by the item-master validation code. */
const requiresInventoryAsset = needsInventoryAccounts;

/** Does a type require a COGS account? */
const requiresCogs = (raw) => {
  const cap = capabilities(raw);
  return !!(cap && cap.needsCOGS);
};

/** Does a type require an income account? */
const requiresIncomeAccount = (raw) => {
  const cap = capabilities(raw);
  return !!(cap && cap.requiresIncomeAccount);
};

const isSellable = (raw) => {
  const cap = capabilities(raw);
  return !!(cap && cap.sellable);
};

const isPurchasable = (raw) => {
  const cap = capabilities(raw);
  return !!(cap && cap.purchasable);
};

/** The visible form sections for a type (canonical; drives the UI). */
const getSections = (raw) => {
  const cap = capabilities(raw);
  return cap && Array.isArray(cap.sections) ? cap.sections.slice() : [];
};

/** Canonical list for dropdowns / validation messages. */
const typeOptions = () => ITEM_TYPE_CODES.map(code => ({ value: code, label: ITEM_TYPES[code].label }));

/**
 * Every raw `products.type` value that TRACKS inventory (canonical codes +
 * legacy vocabulary), lower-cased — for building SQL `LOWER(p.type) IN (...)`
 * filters from the ONE capability table instead of a hand-maintained list.
 */
const inventoryTypeKeys = () => {
  const keys = new Set();
  for (const code of ITEM_TYPE_CODES) if (ITEM_TYPES[code].tracksQuantity) keys.add(code.toLowerCase());
  for (const [legacy, code] of Object.entries(LEGACY_TYPE_MAP)) {
    if (ITEM_TYPES[code] && ITEM_TYPES[code].tracksQuantity) keys.add(legacy.toLowerCase());
  }
  return [...keys];
};

module.exports = {
  ITEM_TYPES,
  ITEM_TYPE_CODES,
  LEGACY_TYPE_MAP,
  normalizeTypeCode,
  capabilities,
  label,
  tracksInventory,
  needsInventoryAccounts,
  requiresInventoryAsset,
  requiresCogs,
  requiresIncomeAccount,
  isSellable,
  isPurchasable,
  getSections,
  typeOptions,
  inventoryTypeKeys,
};
