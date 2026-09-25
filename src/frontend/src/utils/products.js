/**
 * products.js — renderer-side stock classification.
 *
 * REFACTORED: this module no longer keeps its own hardcoded type lists. It is a
 * thin compatibility facade over the ONE canonical Item Type capability model
 * (utils/itemTypes.js → src/frontend/src/shared/itemTypes.json). Anything that still imports
 * from here gets the same answer as the rest of the app, so the two can never
 * disagree.
 *
 * Which Products & Services move stock is decided from the product's TYPE, never
 * from its NAME: product names repeat heavily in real data, so a name-based rule
 * would move the wrong product's stock.
 */

import {
  ITEM_TYPES,
  ITEM_TYPE_CODES,
  normalizeTypeCode,
  capabilities,
  tracksInventory as capTracksInventory,
} from './itemTypes';

// Derived sets, kept for any legacy reader. The authority is the capability model.
export const INVENTORY_PRODUCT_TYPES = new Set(
  ITEM_TYPE_CODES.filter((code) => capTracksInventory(code))
);
export const NON_INVENTORY_PRODUCT_TYPES = new Set(
  ITEM_TYPE_CODES.filter((code) => !capTracksInventory(code))
);

/** Lower-case, whitespace-normalised product type key. */
export const productTypeKey = (productOrType) => {
  const t = (productOrType && typeof productOrType === 'object')
    ? (productOrType.type != null ? productOrType.type : productOrType.productType)
    : productOrType;
  return String(t == null ? '' : t).trim().toLowerCase();
};

/** True when the type is a known inventory type. */
export const isInventoryType = (productOrType) =>
  capTracksInventory(productTypeKey(productOrType));

/** True when the type is an explicitly non-inventory (service) type. */
export const isServiceType = (productOrType) => {
  const cap = capabilities(productTypeKey(productOrType));
  return !!cap && !cap.tracksQuantity;
};

/**
 * Does this product move stock?
 * Accepts a product row, a bare type string, or nothing.
 * Unknown / blank types return false (fail safe).
 */
export const tracksInventory = (productOrType) =>
  capTracksInventory(productTypeKey(productOrType));

/** Filter a list of products down to those that move stock. */
export const getInventoryProducts = (products) =>
  (Array.isArray(products) ? products : []).filter(tracksInventory);

export { ITEM_TYPES, normalizeTypeCode };

export default {
  INVENTORY_PRODUCT_TYPES,
  NON_INVENTORY_PRODUCT_TYPES,
  productTypeKey,
  isInventoryType,
  isServiceType,
  tracksInventory,
  getInventoryProducts,
};
