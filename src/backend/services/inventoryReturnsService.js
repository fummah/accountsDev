/**
 * services/inventoryReturnsService.js — physical returns that move stock.
 *
 * The client distinguishes a FINANCIAL refund from a PHYSICAL return:
 *   • a refund / credit memo never restocks by itself;
 *   • goods only come back into inventory through an explicit RETURN + RESTOCK.
 *
 * This service is the ONE place that moves stock for a return, and it reuses the
 * central engine throughout:
 *   - models/inventory        (receiveStock / issueStock — the only QOH writer)
 *   - services/inventoryValuation (cost basis)
 *   - models/journalEntries   (COGS / Inventory Asset)
 *
 * Customer return + restock : goods back IN at the ORIGINAL sale's cost basis;
 *                             COGS is reversed (Dr Inventory Asset / Cr COGS).
 * Vendor return             : goods OUT at the central carrying cost;
 *                             Inventory Asset is relieved against the configured
 *                             Inventory Adjustment offset (Dr offset / Cr Inv).
 *
 * Company / tenant: one company per database; every query is scoped via dbmgr.
 */

const db = require('../models/dbmgr');
const Inventory = require('../models/inventory');
const Warehouses = require('../models/warehouses');
const COA = require('../models/chartOfAccounts');
const JournalEntries = require('../models/journalEntries');
const Valuation = require('./inventoryValuation');
const ItemTypes = require('./itemTypes');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

const resolveWarehouse = (warehouseId) => {
  const w = Number(warehouseId);
  if (Number.isFinite(w) && w > 0) return w;
  const def = Warehouses.getOrCreateDefault();
  return def && def.id != null ? Number(def.id) : null;
};

const invAccountOf = (prod) => (prod && prod.inventory_asset_account_id != null ? Number(prod.inventory_asset_account_id) : ((COA.getSystemAccount('Inventory Asset') || {}).id));
const cogsAccountOf = (prod) => (prod && prod.cogs_account_id != null ? Number(prod.cogs_account_id) : ((COA.getSystemAccount('Cost of Goods Sold') || {}).id));

/**
 * Customer return + RESTOCK.
 * @param {object} p { productId, quantity, warehouseId?, invoiceId?, reason? }
 * Restocks at the original sale's cost basis (the invoice's issue movement),
 * reversing COGS. The original Invoice/Payment history is left untouched.
 */
const restockCustomerReturn = (p = {}) => {
  const pid = Number(p.productId);
  const qty = Number(p.quantity);
  if (!pid || !(qty > 0)) return { success: false, error: 'A product and a positive quantity are required.' };
  const prod = db.prepare('SELECT id, type, inventory_asset_account_id, cogs_account_id, valuation_method, purchase_cost FROM products WHERE id = ?').get(pid);
  if (!prod) return { success: false, error: `Product #${pid} not found.` };
  if (!ItemTypes.tracksInventory(prod.type)) return { success: false, error: 'Only inventory-tracked items can be restocked.' };
  const item = Inventory.resolveInventoryItem(pid);
  if (!item) return { success: false, error: `Product #${pid} could not be mapped to a stock item.` };
  const warehouseId = resolveWarehouse(p.warehouseId);
  if (!warehouseId) return { success: false, error: 'No warehouse available to restock into.' };

  // Cost basis: the original sale's issue cost (if tied to an invoice), else the
  // item's current carrying cost. Never the selling price.
  let unitCost = 0;
  if (p.invoiceId != null) {
    const mv = db.prepare(
      "SELECT unitCost FROM stock_movements WHERE sourceType = 'invoice' AND sourceId = ? AND itemId = ? AND quantityChange < 0 ORDER BY id DESC LIMIT 1"
    ).get(Number(p.invoiceId), Number(item.id));
    if (mv && mv.unitCost != null) unitCost = Number(mv.unitCost) || 0;
  }
  if (!unitCost) {
    const state = Valuation.replay(item.id, prod.valuation_method || 'FIFO');
    unitCost = state.qtyOn > 0 ? state.value / state.qtyOn : (Number(prod.purchase_cost) || 0);
  }

  const tx = db.transaction(() => {
    const res = Inventory.receiveStock(item.id, warehouseId, qty, unitCost, {
      sourceType: 'customer_return',
      sourceId: p.invoiceId != null ? Number(p.invoiceId) : 0,
      reason: p.reason || 'Customer return — restock',
    });
    if (!res || res.success === false) throw new Error((res && res.error) || 'Restock failed');

    const amount = round2(qty * unitCost);
    const invAcct = invAccountOf(prod);
    const cogsAcct = cogsAccountOf(prod);
    if (amount > 0 && invAcct && cogsAcct) {
      const jr = JournalEntries.post({
        date: today(),
        reference: p.invoiceId != null ? `RET-${p.invoiceId}` : 'RET',
        description: `Customer return restock — ${prod.name || pid}`,
        source_type: 'customer_return', source_id: p.invoiceId != null ? Number(p.invoiceId) : null,
        lines: [
          { account_id: invAcct, debit: amount, credit: 0, description: 'Inventory restored (return)' },
          { account_id: cogsAcct, debit: 0, credit: amount, description: 'COGS reversed (return)' },
        ],
      });
      if (jr && jr.error) throw new Error(jr.error);
    }
    return { success: true, unitCost, amount };
  });

  try { return tx(); } catch (e) { return { success: false, error: e.message }; }
};

/**
 * Vendor return — physical goods leave inventory back to the vendor.
 * @param {object} p { productId, quantity, warehouseId?, reason? }
 * Removes stock at the central carrying cost and relieves Inventory Asset against
 * the configured Inventory Adjustment offset (Dr offset / Cr Inventory Asset).
 */
const vendorReturn = (p = {}) => {
  const pid = Number(p.productId);
  const qty = Number(p.quantity);
  if (!pid || !(qty > 0)) return { success: false, error: 'A product and a positive quantity are required.' };
  const prod = db.prepare('SELECT id, type, inventory_asset_account_id, valuation_method, purchase_cost FROM products WHERE id = ?').get(pid);
  if (!prod) return { success: false, error: `Product #${pid} not found.` };
  if (!ItemTypes.tracksInventory(prod.type)) return { success: false, error: 'Only inventory-tracked items can be returned to a vendor.' };
  const item = Inventory.resolveInventoryItem(pid);
  if (!item) return { success: false, error: `Product #${pid} could not be mapped to a stock item.` };
  const warehouseId = resolveWarehouse(p.warehouseId);
  if (!warehouseId) return { success: false, error: 'No warehouse available to return from.' };

  const unitCost = Valuation.costOfRemoval(item.id, qty, prod.valuation_method || 'FIFO', { standardCost: Number(prod.purchase_cost) || 0 }).unitCost || 0;

  const tx = db.transaction(() => {
    const res = Inventory.issueStock(item.id, warehouseId, qty, unitCost, {
      sourceType: 'vendor_return', sourceId: 0, reason: p.reason || 'Vendor return',
    });
    if (!res || res.success === false) throw new Error((res && res.error) || 'Vendor return failed');

    const amount = round2(qty * unitCost);
    const invAcct = invAccountOf(prod);
    const offset = (COA.getSystemAccount('Inventory Adjustment') || {}).id;
    if (amount > 0 && invAcct && offset) {
      const jr = JournalEntries.post({
        date: today(),
        reference: 'VRET',
        description: `Vendor return — ${prod.name || pid}`,
        source_type: 'vendor_return', source_id: null,
        lines: [
          { account_id: offset, debit: amount, credit: 0, description: 'Vendor return (inventory out)' },
          { account_id: invAcct, debit: 0, credit: amount, description: 'Inventory relieved (vendor return)' },
        ],
      });
      if (jr && jr.error) throw new Error(jr.error);
    }
    return { success: true, unitCost, amount };
  });

  try { return tx(); } catch (e) { return { success: false, error: e.message }; }
};

module.exports = { restockCustomerReturn, vendorReturn };
