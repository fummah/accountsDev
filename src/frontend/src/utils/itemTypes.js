/**
 * itemTypes.js — renderer side of the ONE canonical Item Type definition.
 *
 * The capability table is imported from the single shared source
 * (src/frontend/src/shared/itemTypes.json) — the SAME file the backend
 * (src/backend/services/itemTypes.js) consumes. There is no second table to
 * keep in sync: every Add/Edit Item section, validation rule and transaction
 * default reads from here instead of branching on a raw type string.
 *
 * Canonical type codes:
 *   INVENTORY_PART      tracks quantity + inventory value
 *   NON_INVENTORY_PART  bought/sold, never quantity-tracked
 *   SERVICE             labour / service, no stock (optionally purchased)
 *
 * Adding a future type is a one-line change to the shared JSON.
 */

import SHARED from '../shared/itemTypes.json';

export const ITEM_TYPES = SHARED.types;
export const ITEM_TYPE_CODES = Object.keys(ITEM_TYPES);

const LEGACY_TYPE_MAP = SHARED.legacyTypeMap;

const typeKey = (raw) => String(raw == null ? '' : raw).trim().toLowerCase();

export const normalizeTypeCode = (raw) => {
  const k = typeKey(raw);
  if (!k) return null;
  const direct = k.toUpperCase();
  if (ITEM_TYPES[direct]) return direct;
  return LEGACY_TYPE_MAP[k] || null;
};

export const capabilities = (raw) => {
  const code = normalizeTypeCode(raw);
  return code ? ITEM_TYPES[code] : null;
};

export const itemTypeLabel = (raw) => {
  const cap = capabilities(raw);
  return cap ? cap.label : (raw == null ? '' : String(raw));
};

export const tracksInventory = (raw) => {
  const cap = capabilities(raw);
  return !!(cap && cap.tracksQuantity);
};

export const needsInventoryAccounts = (raw) => {
  const cap = capabilities(raw);
  return !!(cap && cap.needsInventoryAsset);
};

export const requiresInventoryAsset = needsInventoryAccounts;

export const requiresCogs = (raw) => {
  const cap = capabilities(raw);
  return !!(cap && cap.needsCOGS);
};

export const requiresIncomeAccount = (raw) => {
  const cap = capabilities(raw);
  return !!(cap && cap.requiresIncomeAccount);
};

export const isSellable = (raw) => {
  const cap = capabilities(raw);
  return !!(cap && cap.sellable);
};

export const isPurchasable = (raw) => {
  const cap = capabilities(raw);
  return !!(cap && cap.purchasable);
};

/** Visible form sections for a type — the UI renders exactly these. */
export const getSections = (raw) => {
  const cap = capabilities(raw);
  return cap && Array.isArray(cap.sections) ? cap.sections.slice() : [];
};

export const typeOptions = () =>
  ITEM_TYPE_CODES.map(code => ({ value: code, label: ITEM_TYPES[code].label }));

export default {
  ITEM_TYPES,
  ITEM_TYPE_CODES,
  normalizeTypeCode,
  capabilities,
  itemTypeLabel,
  tracksInventory,
  needsInventoryAccounts,
  requiresInventoryAsset,
  requiresCogs,
  requiresIncomeAccount,
  isSellable,
  isPurchasable,
  getSections,
  typeOptions,
};
