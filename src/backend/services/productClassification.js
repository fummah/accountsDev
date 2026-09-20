/**
 * productClassification.js — which Products & Services move stock.
 *
 * A vendor bill line can be either an Expense/Account line (no stock effect) or
 * an Inventory Item line (receives stock). A sales invoice line likewise only
 * issues stock for a real inventory item. The ONLY question this module answers
 * is: does this product represent physical goods we hold?
 *
 * The decision is made from the product's TYPE — never from its NAME. Product
 * names repeat heavily in real databases (in the live DB, 33 product rows share
 * the names of just 7 inventory items), so a name-based rule is ambiguous and
 * would move the wrong product's stock.
 *
 * The Add Product form constrains `type` to exactly these five values:
 *     Product | Service | Raw Material | Asset | Bundle
 *
 *   • Service                      → never moves stock (no physical goods)
 *   • Product / Raw Material /
 *     Asset / Bundle               → moves stock
 *   • anything else — blank, null,
 *     or a user-invented type      → does NOT move stock (fail safe)
 *
 * The fail-safe default is deliberate: it is always safer to leave stock alone
 * than to invent a movement for a product we cannot classify. If a real product
 * type is missing from the list below it will simply be ignored by inventory
 * until it is added here.
 *
 * NOTE: this table is mirrored on the renderer side by
 * src/frontend/src/utils/products.js (tracksInventory / isServiceType).
 * Keep both in sync when the product-type vocabulary changes.
 */

// Product types that hold physical stock.
const INVENTORY_PRODUCT_TYPES = new Set([
  'product',
  'raw material',
  'asset',
  'bundle',
]);

// Product types that explicitly never hold stock.
const NON_INVENTORY_PRODUCT_TYPES = new Set([
  'service',
]);

/** Lower-case, whitespace-normalised product type key. */
const typeKey = (productOrType) => {
  const t = (productOrType && typeof productOrType === 'object')
    ? (productOrType.type != null ? productOrType.type : productOrType.productType)
    : productOrType;
  return String(t == null ? '' : t).trim().toLowerCase();
};

/** True when the type is a known inventory type. */
const isInventoryType = (productOrType) => INVENTORY_PRODUCT_TYPES.has(typeKey(productOrType));

/** True when the type is an explicitly non-inventory (service) type. */
const isServiceType = (productOrType) => NON_INVENTORY_PRODUCT_TYPES.has(typeKey(productOrType));

/**
 * Does this product move stock?
 * Accepts a product row, a bare type string, or nothing.
 * Unknown / blank types return false (fail safe).
 */
const tracksInventory = (productOrType) => isInventoryType(productOrType);

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
