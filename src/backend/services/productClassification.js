/**
 * productClassification.js — which Products & Services move stock.
 *
 * A vendor bill line can be either an Expense/Account line (no stock effect) or
 * an Inventory Item line (receives stock). A sales invoice line likewise only
 * issues stock for a real inventory item. The ONLY question this module answers
 * is: does this product represent physical goods we hold?
 *
 * The decision is made from the product's TYPE — never from its NAME. Product
 * names repeat heavily in real databases, so a name-based rule is ambiguous and
 * would move the wrong product's stock.
 *
 * ── ONE canonical definition ─────────────────────────────────────────────────
 * The authority is services/itemTypes.js, which is built from the single shared
 * table src/frontend/src/shared/itemTypes.json. This module no longer keeps its own hardcoded
 * type lists — it derives everything from the canonical capabilities so a new
 * Item Type automatically controls stock behaviour. Legacy type names ('Product',
 * 'Raw Material', 'Asset', 'Bundle') are mapped by normalizeTypeCode.
 */

const ItemTypes = require('./itemTypes');

// Derived, for any legacy reader. The authority is the capability model.
const INVENTORY_PRODUCT_TYPES = new Set([
  ...ItemTypes.ITEM_TYPE_CODES.filter((code) => ItemTypes.tracksInventory(code)),
  // legacy names that normalize onto an inventory code
  ...Object.keys(ItemTypes.LEGACY_TYPE_MAP).filter((k) => ItemTypes.tracksInventory(k)),
]);

const NON_INVENTORY_PRODUCT_TYPES = new Set([
  ...ItemTypes.ITEM_TYPE_CODES.filter((code) => !ItemTypes.tracksInventory(code)),
  ...Object.keys(ItemTypes.LEGACY_TYPE_MAP).filter((k) => !ItemTypes.tracksInventory(k)),
]);

/** Lower-case, whitespace-normalised product type key. */
const typeKey = (productOrType) => {
  const t = (productOrType && typeof productOrType === 'object')
    ? (productOrType.type != null ? productOrType.type : productOrType.productType)
    : productOrType;
  return String(t == null ? '' : t).trim().toLowerCase();
};

/** True when the type is a known inventory type. */
const isInventoryType = (productOrType) => ItemTypes.tracksInventory(typeKey(productOrType));

/** True when the type is an explicitly non-inventory (service) type. */
const isServiceType = (productOrType) => {
  const cap = ItemTypes.capabilities(typeKey(productOrType));
  return !!cap && !cap.tracksQuantity;
};

/**
 * Does this product move stock?
 * Accepts a product row, a bare type string, or nothing.
 * Unknown / blank types return false (fail safe).
 */
const tracksInventory = (productOrType) => ItemTypes.tracksInventory(typeKey(productOrType));

/** Filter a list of products down to those that move stock. */
const getInventoryProducts = (products) =>
  (Array.isArray(products) ? products : []).filter(tracksInventory);

module.exports = {
  INVENTORY_PRODUCT_TYPES,
  NON_INVENTORY_PRODUCT_TYPES,
  isInventoryType,
  isServiceType,
  tracksInventory,
  getInventoryProducts,
};
