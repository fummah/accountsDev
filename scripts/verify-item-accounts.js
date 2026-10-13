/**
 * verify-item-accounts.js — ONE authoritative COGS account per Inventory Part.
 *
 * Proves the Item-Type-driven account rule:
 *   - Inventory Part: the generic Purchase Expense/COGS mapping is normalized to
 *     null on save and NEVER used for posting (purchase → Inventory Asset;
 *     sale → Inventory COGS).
 *   - Non-Inventory / Service: the Purchase Expense/COGS account is used, and
 *     inventory accounts are cleared.
 * Plus the read-only audit of ambiguous/missing mappings.
 *
 * Run: $env:ELECTRON_RUN_AS_NODE="1"; & electron.exe scripts\verify-item-accounts.js
 */
/* eslint-disable no-console */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-item-accounts' });

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const realLog = console.log.bind(console);
console.log = () => {};
const models = require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr')).raw;
console.log = realLog;
const Products = models.Products;
const ItemAccounts = require(path.join(ROOT, 'src', 'backend', 'services', 'itemAccounts'));

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`); }
};

const accountByType = (types) => {
  const ph = types.map(() => '?').join(',');
  const r = db.prepare(`SELECT id, name FROM chart_of_accounts WHERE LOWER(type) IN (${ph}) AND status='Active' ORDER BY id LIMIT 1`).get(...types);
  return r || null;
};
const invAsset = accountByType(['asset', 'other current asset', 'inventory']);
const cogs = accountByType(['cost of goods sold']) || accountByType(['expense']);
const expense = accountByType(['expense', 'other expense']);
const income = accountByType(['income', 'other income']);
if (!invAsset || !cogs || !expense || !income) { console.log('  SKIP: chart of accounts missing required types', { invAsset, cogs, expense, income }); process.exit(0); }
console.log('  accounts:', { invAsset, cogs, expense, income });

const RID = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

console.log('\n=== resolver is type-driven (never "first available account") ===');
{
  const invProd = { type: 'INVENTORY_PART', inventory_asset_account_id: invAsset.id, cogs_account_id: cogs.id, purchase_expense_account_id: expense.id };
  check('Inventory Part purchase → Inventory Asset (NOT the generic expense)', ItemAccounts.resolvePurchasePostingAccountId(invProd) === invAsset.id, ItemAccounts.resolvePurchasePostingAccountId(invProd));
  check('Inventory Part sale COGS → dedicated Inventory COGS', ItemAccounts.resolveSaleCogsAccountId(invProd) === cogs.id, ItemAccounts.resolveSaleCogsAccountId(invProd));
  const svc = { type: 'SERVICE', purchase_expense_account_id: expense.id, inventory_asset_account_id: invAsset.id, cogs_account_id: cogs.id };
  check('Service purchase → Purchase Expense/COGS', ItemAccounts.resolvePurchasePostingAccountId(svc) === expense.id, ItemAccounts.resolvePurchasePostingAccountId(svc));
  check('Service sale COGS → null (no inventory)', ItemAccounts.resolveSaleCogsAccountId(svc) === null);
  const nonInv = { type: 'NON_INVENTORY_PART', purchase_expense_account_id: expense.id };
  check('Non-Inventory purchase → Purchase Expense/COGS', ItemAccounts.resolvePurchasePostingAccountId(nonInv) === expense.id);
}

console.log('\n=== saveItemMaster normalizes by type ===');
let invId = null;
{
  // Malicious/legacy payload: Inventory Part WITH a generic purchase account.
  const res = Products.saveItemMaster({
    type: 'INVENTORY_PART', name: 'INV-ACC-TEST ' + RID(), sku: 'IA-' + RID(),
    incomeAccountId: income.id, inventoryAssetAccountId: invAsset.id, cogsAccountId: cogs.id,
    purchaseExpenseAccountId: expense.id,
  }, { userId: 'test' });
  check('Inventory Part saved', res && res.success, res);
  invId = res && res.id;
  const row = db.prepare('SELECT purchase_expense_account_id, inventory_asset_account_id, cogs_account_id FROM products WHERE id = ?').get(invId);
  check('TEST7 generic purchase account normalized to NULL', row.purchase_expense_account_id === null, row);
  check('  Inventory Asset kept', Number(row.inventory_asset_account_id) === invAsset.id);
  check('  Inventory COGS kept', Number(row.cogs_account_id) === cogs.id);
}
{
  const res = Products.saveItemMaster({
    type: 'INVENTORY_PART', name: 'INV-NOCOGS ' + RID(), sku: 'IA2-' + RID(),
    incomeAccountId: income.id, inventoryAssetAccountId: invAsset.id, // no cogs
  }, { userId: 'test' });
  check('Inventory Part WITHOUT COGS is rejected', res && res.success === false && /COGS Account is required/i.test(res.error || ''), res);
}
{
  const res = Products.saveItemMaster({
    type: 'NON_INVENTORY_PART', name: 'NONINV-ACC ' + RID(), sku: 'NI-' + RID(),
    incomeAccountId: income.id, purchaseExpenseAccountId: expense.id,
    inventoryAssetAccountId: invAsset.id, cogsAccountId: cogs.id, // stale inventory accounts
  }, { userId: 'test' });
  check('Non-Inventory saved', res && res.success, res);
  const row = db.prepare('SELECT purchase_expense_account_id, inventory_asset_account_id, cogs_account_id FROM products WHERE id = ?').get(res.id);
  check('Non-Inventory keeps Purchase Expense/COGS', Number(row.purchase_expense_account_id) === expense.id, row);
  check('Non-Inventory inventory accounts cleared', row.inventory_asset_account_id === null && row.cogs_account_id === null, row);
}

console.log('\n=== audit of ambiguous Inventory Parts (read-only) ===');
{
  // Fabricate the legacy ambiguous state: an Inventory Part with a generic
  // purchase account (bypassing the normalizer via direct SQL).
  db.prepare('UPDATE products SET purchase_expense_account_id = ? WHERE id = ?').run(expense.id, invId);
  const before = db.prepare('SELECT purchase_expense_account_id FROM products WHERE id = ?').get(invId).purchase_expense_account_id;
  const audit = ItemAccounts.auditItemAccountMappings();
  const hit = (audit.items || []).find(i => i.id === invId);
  check('audit flags the DUPLICATE/AMBIGUOUS mapping', !!hit && hit.status === 'DUPLICATE/AMBIGUOUS', hit);
  check('audit lists both purchase + inventory COGS accounts', hit && hit.purchaseExpenseAccount && hit.inventoryCogsAccount, hit);
  const after = db.prepare('SELECT purchase_expense_account_id FROM products WHERE id = ?').get(invId).purchase_expense_account_id;
  check('audit does NOT mutate', before === after, { before, after });
  // Re-saving the item normalizes the stale value.
  const inv2 = db.prepare('SELECT name, sku FROM products WHERE id=?').get(invId);
  const rs = Products.saveItemMaster({
    id: invId, type: 'INVENTORY_PART', name: inv2.name, sku: inv2.sku,
    incomeAccountId: income.id, inventoryAssetAccountId: invAsset.id, cogsAccountId: cogs.id, purchaseExpenseAccountId: expense.id,
  }, { userId: 'test' });
  check('re-saving clears the stale generic purchase account', db.prepare('SELECT purchase_expense_account_id FROM products WHERE id=?').get(invId).purchase_expense_account_id === null, { res: rs, row: db.prepare('SELECT purchase_expense_account_id FROM products WHERE id=?').get(invId) });
}

console.log('\n=== static wiring ===');
{
  const prod = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'models', 'products.js'), 'utf8');
  check('products.saveItemMaster normalizes purchase account to null for Inventory Parts', /purchaseExpenseAccountId = null;/.test(prod) && /cap\.needsInventoryAsset/.test(prod));
  const exp = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'models', 'expenses.js'), 'utf8');
  check('bill resolver uses the central ItemAccounts service', /services\/itemAccounts/.test(exp) && /ItemAccounts\.resolvePurchasePostingAccountId/.test(exp));
  check('bill resolver no longer picks the first non-null account', !/inventory_asset_account_id \|\| .*purchase_expense_account_id/.test(exp));
  const svc = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'services', 'itemAccounts.js'), 'utf8');
  check('itemAccounts exports the type-driven resolvers + audit', /resolvePurchasePostingAccountId/.test(svc) && /resolveSaleCogsAccountId/.test(svc) && /auditItemAccountMappings/.test(svc));
  const preload = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'preload.js'), 'utf8');
  check('preload exposes getItemAccountAudit', /getItemAccountAudit/.test(preload));
  const ui = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'src', 'components', 'shared', 'UnifiedItemList.js'), 'utf8');
  check('UI disables Purchase Expense/COGS for Inventory Parts', /disabled=\{inventoryPart\}/.test(ui) && /Not applicable for Inventory Parts/.test(ui));
  check('UI clears stale purchase account when switching to Inventory Part', /purchaseExpenseAccountId: undefined/.test(ui) && /needsInventoryAsset/.test(ui));
  check('UI shows the Inventory COGS help text', /Used when inventory is sold and cost is recognized/.test(ui));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
