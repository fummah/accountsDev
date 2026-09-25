/**
 * services/itemMasterService.js — THE single business-service write path for
 * Item Master records.
 *
 * Every creation/update of a `products` row must go through here so that SKU
 * uniqueness, type normalisation, account classification, tax/vendor/warehouse
 * validation and tenant-scoping are applied consistently — including the legacy
 * "quick add" dialogs (Enter Bill / Invoice / Quote) and the bulk importer that
 * previously wrote straight into `products`.
 *
 * The renderer is never trusted: this service re-resolves and re-validates on
 * the backend. `Products.saveItemMaster` remains the low-level writer and holds
 * the authoritative validation; this module only maps legacy shapes onto it and
 * supplies safe DEFAULTS so a quick-add still produces a VALID item instead of
 * an invalid Inventory Part with no accounts.
 */

const db = require('../models/dbmgr');
const Products = require('../models/products');
const ItemTypes = require('./itemTypes');

const firstActiveAccountId = (types) => {
  try {
    const ph = types.map(() => '?').join(',');
    const row = db.prepare(
      `SELECT id FROM chart_of_accounts WHERE LOWER(type) IN (${ph}) AND status = 'Active' ORDER BY id LIMIT 1`
    ).get(...types);
    return row ? Number(row.id) : null;
  } catch { return null; }
};

const systemAccountId = (name) => {
  try {
    const a = require('../models/chartOfAccounts').getSystemAccount(name);
    return a && a.id != null ? Number(a.id) : null;
  } catch { return null; }
};

const resolveAccountId = (idOrName) => {
  if (idOrName == null || idOrName === '') return null;
  try {
    if (Number.isFinite(Number(idOrName))) {
      const byId = db.prepare('SELECT id FROM chart_of_accounts WHERE id = ?').get(Number(idOrName));
      if (byId) return Number(byId.id);
    }
    const byName = db.prepare(
      'SELECT id FROM chart_of_accounts WHERE LOWER(name) = LOWER(?) OR number = ? LIMIT 1'
    ).get(String(idOrName), String(idOrName));
    return byName ? Number(byName.id) : null;
  } catch { return null; }
};

/** Fill the accounts an Item Type requires so a partial quick-add is still VALID. */
const withTypeDefaults = (typeCode, data) => {
  const out = { ...data };
  const cap = ItemTypes.ITEM_TYPES[typeCode];
  if (!cap) return out;
  if (!out.incomeAccountId) out.incomeAccountId = firstActiveAccountId(['income', 'other income']);
  if (cap.needsInventoryAsset) {
    if (!out.inventoryAssetAccountId) {
      out.inventoryAssetAccountId = systemAccountId('Inventory Asset')
        || firstActiveAccountId(['asset', 'other current asset', 'inventory']);
    }
    if (!out.cogsAccountId) {
      out.cogsAccountId = systemAccountId('Cost of Goods Sold')
        || firstActiveAccountId(['cost of goods sold', 'expense', 'other expense']);
    }
  }
  return out;
};

/**
 * Create from the legacy positional shape used by the quick-add dialogs and the
 * importer. Returns { success, id } or { success:false, error }.
 */
const createFromLegacy = (args = {}, ctx = {}) => {
  const {
    type, name, sku, category, description, price,
    income_account, income_account_id,
  } = args;
  const typeCode = ItemTypes.normalizeTypeCode(type) || ItemTypes.normalizeTypeCode('NON_INVENTORY_PART');
  const data = withTypeDefaults(typeCode, {
    type: typeCode,
    name,
    sku: sku || '',
    category: category || '',
    description: description || '',
    salesPrice: Number(price) || 0,
    incomeAccountId: resolveAccountId(income_account_id) || resolveAccountId(income_account),
    isActive: true,
  });
  return Products.saveItemMaster(data, ctx);
};

/**
 * Update from the legacy object shape. Merges onto the existing master row so a
 * partial update (e.g. renaming from the Products tab) never wipes the item's
 * accounting configuration.
 */
const updateFromLegacy = (productData = {}, ctx = {}) => {
  const id = Number(productData.id);
  if (!id) return { success: false, error: 'Item id is required.' };
  const existing = Products.getById(id);
  if (!existing) return { success: false, error: 'Item not found.' };

  const typeCode = ItemTypes.normalizeTypeCode(productData.type) || ItemTypes.normalizeTypeCode(existing.type);
  const merged = {
    id,
    type: typeCode,
    name: productData.name != null ? productData.name : existing.name,
    sku: productData.sku != null ? productData.sku : existing.sku,
    category: productData.category != null ? productData.category : existing.category,
    subcategory: existing.subcategory,
    description: productData.description != null ? productData.description : existing.description,
    unitOfMeasure: existing.unit_of_measure,
    isActive: existing.is_active == null ? true : !!Number(existing.is_active),
    salesPrice: productData.price != null ? productData.price
      : (productData.selling_price != null ? productData.selling_price : existing.price),
    incomeAccountId: resolveAccountId(productData.income_account_id)
      || resolveAccountId(productData.income_account) || existing.income_account_id,
    purchaseCost: existing.purchase_cost,
    purchaseDescription: existing.purchase_description,
    preferredVendorId: existing.preferred_vendor_id,
    purchaseExpenseAccountId: existing.purchase_expense_account_id,
    purchaseTaxRateId: existing.purchase_tax_rate_id,
    defaultPurchaseUnit: existing.default_purchase_unit,
    vendorItemNumber: existing.vendor_item_number,
    salesDescription: existing.sales_description,
    salesTaxRateId: existing.sales_tax_rate_id,
    defaultSalesUnit: existing.default_sales_unit,
    inventoryAssetAccountId: existing.inventory_asset_account_id,
    cogsAccountId: existing.cogs_account_id,
    reorderPoint: existing.reorder_point,
    preferredStockLevel: existing.preferred_stock_level,
    valuationMethod: existing.valuation_method,
    defaultWarehouseId: existing.default_warehouse_id,
  };
  return Products.saveItemMaster(withTypeDefaults(typeCode, merged), ctx);
};

module.exports = { createFromLegacy, updateFromLegacy, withTypeDefaults, resolveAccountId };
