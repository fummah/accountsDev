/**
 * productClassification — renderer-side mirror of
 * src/backend/services/productClassification.js
 *
 * Which Products & Services move stock. Decided from the product's TYPE, never
 * from its NAME: product names repeat heavily in real data (in the live DB, 33
 * product rows share the names of just 7 inventory items), so a name-based rule
 * would move the wrong product's stock.
 *
 * The Add Product form constrains `type` to:
 *     Product | Service | Raw Material | Asset | Bundle
 *
 *   • Service                                 → never moves stock
 *   • Product / Raw Material / Asset / Bundle → moves stock
 *   • anything else (blank, null, custom)     → does NOT move stock (fail safe)
 *
 * Keep the two type sets in sync with the backend service.
 */

// Product types that hold physical stock.
export const INVENTORY_PRODUCT_TYPES = new Set([
  'product',
  'raw material',
  'asset',
  'bundle',
]);

// Product types that explicitly never hold stock.
export const NON_INVENTORY_PRODUCT_TYPES = new Set([
  'service',
]);

/** Lower-case, whitespace-normalised product type key. */
export const productTypeKey = (productOrType) => {
  const t = (productOrType && typeof productOrType === 'object')
    ? (productOrType.type != null ? productOrType.type : productOrType.productType)
    : productOrType;
  return String(t == null ? '' : t).trim().toLowerCase();
};

/** True when the type is a known inventory type. */
export const isInventoryType = (productOrType) =>
  INVENTORY_PRODUCT_TYPES.has(productTypeKey(productOrType));

/** True when the type is an explicitly non-inventory (service) type. */
export const isServiceType = (productOrType) =>
  NON_INVENTORY_PRODUCT_TYPES.has(productTypeKey(productOrType));

/**
 * Does this product move stock?
 * Accepts a product row, a bare type string, or nothing.
 * Unknown / blank types return false (fail safe).
 */
export const tracksInventory = (productOrType) => isInventoryType(productOrType);

/** Filter a list of products down to those that move stock. */
export const getInventoryProducts = (products) =>
  (Array.isArray(products) ? products : []).filter(tracksInventory);

export default {
  INVENTORY_PRODUCT_TYPES,
  NON_INVENTORY_PRODUCT_TYPES,
  productTypeKey,
  isInventoryType,
  isServiceType,
  tracksInventory,
  getInventoryProducts,
};
