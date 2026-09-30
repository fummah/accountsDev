/**
 * verify-item-master.js
 *
 * The Item master redesign: canonical Item Types with a central capability
 * model, an extended products schema, legacy migration, SKU uniqueness,
 * account-type validation, type-change protection, and the wide boxed drawer.
 *
 * Backend checks run on a SCRATCH COPY; frontend checks read the source.
 */
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const Module = require('module');
const electronStub = { ipcMain: { handle: () => {} }, app: { isPackaged: true } };
const originalLoad = Module._load;
Module._load = function (request) { if (request === 'electron') return electronStub; return originalLoad.apply(this, arguments); };

require('./lib/testDb.js').useScratchCopy({ label: 'verify-item-master' });
const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const Products = require(path.join(ROOT, 'src', 'backend', 'models', 'products.js'));
const ItemTypes = require(path.join(ROOT, 'src', 'backend', 'services', 'itemTypes.js'));
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js')).raw;

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};
const read = (rel) => fs.readFileSync(path.join(FE, rel), 'utf8');

// ── 1. Capability model ───────────────────────────────────────────────────
console.log('\n=== Item type capability model ===');
check('three canonical types exist', ['INVENTORY_PART', 'NON_INVENTORY_PART', 'SERVICE'].every(c => ItemTypes.ITEM_TYPES[c]));
check('INVENTORY_PART tracks quantity + needs inventory accounts',
  ItemTypes.tracksInventory('INVENTORY_PART') && ItemTypes.needsInventoryAccounts('INVENTORY_PART'));
check('NON_INVENTORY_PART does NOT track quantity',
  !ItemTypes.tracksInventory('NON_INVENTORY_PART') && !ItemTypes.needsInventoryAccounts('NON_INVENTORY_PART'));
check('SERVICE does NOT track quantity',
  !ItemTypes.tracksInventory('SERVICE') && !ItemTypes.needsInventoryAccounts('SERVICE'));
check('legacy "Product" maps to INVENTORY_PART (behaviour preserved)',
  ItemTypes.normalizeTypeCode('Product') === 'INVENTORY_PART');
check('legacy "Service" maps to SERVICE', ItemTypes.normalizeTypeCode('Service') === 'SERVICE');
check('frontend mirror agrees with backend',
  (() => {
    const src = read('utils/itemTypes.js');
    return src.includes("INVENTORY_PART") && src.includes("NON_INVENTORY_PART") && src.includes("SERVICE");
  })());

// ── 2. Schema ─────────────────────────────────────────────────────────────
console.log('\n=== Schema ===');
const cols = new Set(db.prepare("PRAGMA table_info('products')").all().map(c => c.name));
for (const c of ['subcategory', 'unit_of_measure', 'is_active', 'purchase_cost', 'purchase_description',
  'preferred_vendor_id', 'purchase_expense_account_id', 'purchase_tax_rate_id', 'default_purchase_unit',
  'vendor_item_number', 'sales_description', 'sales_tax_rate_id', 'default_sales_unit',
  'inventory_asset_account_id', 'cogs_account_id', 'reorder_point', 'preferred_stock_level', 'valuation_method']) {
  check(`products.${c} exists`, cols.has(c));
}
check('item_subcategories table exists', !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='item_subcategories'").get());
check('units_of_measure table exists', !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='units_of_measure'").get());
check('units seeded (Each, Hour, ...)', (Products.getUnitsOfMeasure() || []).length >= 3);

// ── 3. Legacy migration ───────────────────────────────────────────────────
console.log('\n=== Legacy type migration ===');
const legacyId = db.prepare("INSERT INTO products (type, name, price) VALUES ('Product', 'Legacy Widget', 0)").run().lastInsertRowid;
const svcId = db.prepare("INSERT INTO products (type, name, price) VALUES ('Service', 'Legacy Service', 0)").run().lastInsertRowid;
Products.migrateLegacyTypes();
check('legacy Product row migrated to INVENTORY_PART',
  Products.getById(legacyId).type === 'INVENTORY_PART', Products.getById(legacyId).type);
check('legacy Service row migrated to SERVICE',
  Products.getById(svcId).type === 'SERVICE', Products.getById(svcId).type);

// ── 4. Account fixtures ───────────────────────────────────────────────────
console.log('\n=== Account-type validation ===');
const income = db.prepare("SELECT id, name FROM chart_of_accounts WHERE LOWER(type) IN ('income','other income') AND status='Active' ORDER BY id LIMIT 1").get();
const expense = db.prepare("SELECT id, name FROM chart_of_accounts WHERE LOWER(type) IN ('expense','cost of goods sold','other expense') AND status='Active' ORDER BY id LIMIT 1").get();
const asset = db.prepare("SELECT id, name FROM chart_of_accounts WHERE LOWER(type) IN ('asset','bank','cash','other current asset','other asset') AND status='Active' ORDER BY id LIMIT 1").get();
check('fixtures: income / expense / asset accounts exist', !!(income && expense && asset),
  JSON.stringify({ income: income?.id, expense: expense?.id, asset: asset?.id }));

// ── 5. saveItemMaster ─────────────────────────────────────────────────────
console.log('\n=== saveItemMaster ===');
let invId = null;
if (income && expense && asset) {
  const r1 = Products.saveItemMaster({
    type: 'INVENTORY_PART', name: 'Widget A', sku: 'W-100',
    purchaseCost: 20, salesPrice: 35,
    incomeAccountId: income.id, purchaseExpenseAccountId: expense.id,
    inventoryAssetAccountId: asset.id, cogsAccountId: expense.id,
    reorderPoint: 10, preferredStockLevel: 50, valuationMethod: 'FIFO', isActive: true,
  });
  check('TEST 1  Inventory Part saves', r1.success === true, JSON.stringify(r1));
  invId = r1.id;
  const full = Products.getItemMaster(invId);
  check('TEST 1  reopens with all fields', full && full.type === 'INVENTORY_PART' && Number(full.purchase_cost) === 20 &&
    Number(full.price) === 35 && Number(full.inventory_asset_account_id) === asset.id && Number(full.reorder_point) === 10,
    JSON.stringify({ type: full?.type, pc: full?.purchase_cost, price: full?.price }));

  // TEST 5 — SKU uniqueness
  const dup = Products.saveItemMaster({ type: 'NON_INVENTORY_PART', name: 'Dup', sku: 'w-100', incomeAccountId: income.id });
  check('TEST 5  duplicate SKU (case-insensitive) rejected', dup.success === false && /already exists/i.test(dup.error || ''), JSON.stringify(dup));

  // TEST 2 — Non-Inventory Part (no inventory accounts required)
  const r2 = Products.saveItemMaster({ type: 'NON_INVENTORY_PART', name: 'Consumable', purchaseCost: 10, salesPrice: 20, incomeAccountId: income.id, purchaseExpenseAccountId: expense.id });
  check('TEST 2  Non-Inventory Part saves without inventory accounts', r2.success === true, JSON.stringify(r2));

  // TEST 3 — Service (income required, purchase optional)
  const r3 = Products.saveItemMaster({ type: 'SERVICE', name: 'Installation', salesPrice: 75, incomeAccountId: income.id });
  check('TEST 3  Service saves with income only', r3.success === true, JSON.stringify(r3));

  // Service requires an income account
  const r3b = Products.saveItemMaster({ type: 'SERVICE', name: 'No Income' });
  check('Service without Income Account rejected', r3b.success === false, JSON.stringify(r3b));

  // Inventory Part requires inventory asset + cogs
  const r1b = Products.saveItemMaster({ type: 'INVENTORY_PART', name: 'Missing Inv Accounts', incomeAccountId: income.id });
  check('Inventory Part without Inventory Asset/COGS rejected', r1b.success === false, JSON.stringify(r1b));

  // Account type validation: a wrong classification is rejected
  const rWrong = Products.saveItemMaster({ type: 'NON_INVENTORY_PART', name: 'Wrong Income', incomeAccountId: expense.id });
  check('Income Account must be an Income/Revenue account', rWrong.success === false && /Income Account/i.test(rWrong.error || ''), JSON.stringify(rWrong));

  // Stale inventory accounts cleared when the type is not inventory
  const r4 = Products.saveItemMaster({ id: invId, type: 'NON_INVENTORY_PART', name: 'Widget A', sku: 'W-100', incomeAccountId: income.id, inventoryAssetAccountId: asset.id, cogsAccountId: expense.id });
  check('non-inventory save clears inventory asset link (no stale postings)', Products.getById(invId).inventory_asset_account_id == null);
  // restore it for the type-change test
  Products.saveItemMaster({ id: invId, type: 'INVENTORY_PART', name: 'Widget A', sku: 'W-100', incomeAccountId: income.id, inventoryAssetAccountId: asset.id, cogsAccountId: expense.id });
}

// ── 6. Type-change protection ─────────────────────────────────────────────
console.log('\n=== Type-change protection ===');
if (invId) {
  // Simulate inventory activity: link the product to an item with stock.
  const itemId = db.prepare("INSERT INTO items (code, name, stock) VALUES ('W-100', 'Widget A', 0)").run().lastInsertRowid;
  db.prepare('UPDATE products SET item_id = ? WHERE id = ?').run(itemId, invId);
  db.prepare("INSERT INTO item_stock (itemId, warehouseId, quantity, reorderPoint) VALUES (?, 1, 10, 0)").run(itemId);
  const blocked = Products.saveItemMaster({ id: invId, type: 'SERVICE', name: 'Widget A', sku: 'W-100', incomeAccountId: income.id });
  check('TEST 24  Inventory Part with stock cannot become a Service', blocked.success === false && /inventory transactions/i.test(blocked.error || ''), JSON.stringify(blocked));
}

// ── 7. Frontend drawer wiring ─────────────────────────────────────────────
console.log('\n=== Frontend drawer ===');
const ui = read('components/shared/UnifiedItemList.js');
check('drawer uses the wide responsive class', /className="app-item-drawer"/.test(ui));
check('drawer has all four boxed sections', ['Basic Information', 'Purchase Information', 'Sales Information', 'Inventory Information'].every(t => ui.includes(t)));
check('uses the shared FormSection component', /FormSection/.test(ui) && /from '\.\/FormSection'/.test(ui));
check('inventory section is conditional on the capability', (/showSection\('inventory'\)/.test(ui) || /caps\.needsInventoryAsset/.test(ui)) && /Item Type/.test(ui));
check('Stock availability (On Hand / On PO / Expected) is read-only', /Stock Availability/.test(ui) && /On PO /.test(ui) && /Expected /.test(ui) && /Read-only/.test(ui));
check('account selectors filter by real account type (allowedTypes)',
  /allowedTypes=\{INCOME_ACCOUNT_TYPES\}/.test(ui) && /allowedTypes=\{EXPENSE_ACCOUNT_TYPES\}/.test(ui) &&
  /allowedTypes=\{INVENTORY_ASSET_ACCOUNT_TYPES\}/.test(ui) && /allowedTypes=\{COGS_ACCOUNT_TYPES\}/.test(ui));
check('saves through saveItemMaster', /saveItemMaster/.test(ui));
check('loads the full master on edit', /getItemMaster/.test(ui));
check('list distinguishes the three types', /itemTypeLabel/.test(ui) && /Inventory Parts/.test(ui) && /Non-Inventory Parts/.test(ui) && /Services/.test(ui));
check('CSS widens the item drawer', /\.ant-drawer\.app-item-drawer/.test(fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'public', 'css', 'custom.css'), 'utf8')));

// ── 8. Transaction default wiring ─────────────────────────────────────────
console.log('\n=== Transaction defaults ===');
check('Invoice uses sales_description + item price',
  /prod\.sales_description \|\| prod\.description/.test(read('components/customers/invoices/CreateInvoice.js')));
check('Quote uses sales_description + item price',
  /prod\.sales_description \|\| prod\.description/.test(read('components/customers/quotes/CreateQuote.js')));
check('Enter Bill defaults the rate from purchase cost',
  /prod\.purchase_cost/.test(read('components/vendors/bills/EnterBill.js')));
check('Enter Bill offers purchasable items (not inventory-only)',
  /isPurchasable/.test(read('components/vendors/bills/EnterBill.js')));
check('bill item line posts to configured expense for non-inventory',
  /purchase_expense_account_id/.test(fs.readFileSync(path.join(ROOT, 'src', 'backend', 'models', 'expenses.js'), 'utf8')));

// ── 9. View detail (master + movements + related transactions) ─────────────
console.log('\n=== View item detail ===');
if (invId) {
  const detail = Products.getItemDetail(invId);
  check('getItemDetail returns master + stock + movements + transactions + summary',
    detail && detail.master && Array.isArray(detail.stock) && Array.isArray(detail.movements) &&
    Array.isArray(detail.purchases) && Array.isArray(detail.sales) && detail.summary,
    JSON.stringify(Object.keys(detail || {})));
  check('getItemDetail summary exposes onHand + purchase/sales totals',
    detail && 'onHand' in detail.summary && 'purchaseValue' in detail.summary && 'salesValue' in detail.summary);
  check('getItemDetail returns null for a missing item', Products.getItemDetail(999999) === null);
}
check('list has a View action', /EyeOutlined/.test(ui) && /openView\(r\)/.test(ui));
check('View loads the full detail via getItemDetail', /getItemDetail/.test(ui));
check('detail drawer uses the detail class', /className="app-item-detail-drawer"/.test(ui));
check('detail shows movements / stock / purchases / sales',
  /viewDetail\.movements/.test(ui) && /viewDetail\.stock/.test(ui) && /viewDetail\.purchases/.test(ui) && /viewDetail\.sales/.test(ui));
check('detail renders the master accounting relationships',
  /accountLabel\(m\.income_account_id\)/.test(ui) && /accountLabel\(m\.inventory_asset_account_id\)/.test(ui));
check('IPC handler get-item-detail registered',
  /safeHandle\('get-item-detail'/.test(fs.readFileSync(path.join(ROOT, 'src', 'backend', 'handlers', 'ipcHandlers.js'), 'utf8')));
check('preload exposes getItemDetail',
  /getItemDetail:\s*\(id\)\s*=>\s*ipcRenderer\.invoke\('get-item-detail'/.test(fs.readFileSync(path.join(ROOT, 'src', 'backend', 'preload.js'), 'utf8')));
check('CSS widens the item detail drawer', /\.ant-drawer\.app-item-detail-drawer/.test(fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'public', 'css', 'custom.css'), 'utf8')));
check('inactive tab panes are hidden (View Item tab switching fix)',
  /\.ant-tabs-tabpane-hidden\s*\{[^}]*display:\s*none/.test(fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'public', 'css', 'custom.css'), 'utf8')));

// ── 10. Product Inventory History (running balance) ────────────────────────
console.log('\n=== Product inventory history ===');
if (invId) {
  // Give the item a receipt + an issue so the running balance is meaningful.
  const Inventory = require(path.join(ROOT, 'src', 'backend', 'models', 'inventory.js'));
  const it = Inventory.resolveInventoryItem(invId);
  const wh = db.prepare('SELECT id FROM warehouses ORDER BY isDefault DESC, id LIMIT 1').get();
  Inventory.receiveStock(it.id, wh ? wh.id : 1, 100, 20, { sourceType: 'receipt', sourceId: 1, reason: 'PO RECEIPT' });
  Inventory.issueStock(it.id, wh ? wh.id : 1, 24, 20, { sourceType: 'invoice', sourceId: 1, reason: 'SALE ISSUE' });
  const hist = Products.getInventoryHistory(invId, {});
  check('getInventoryHistory returns master + rows + summary',
    hist && hist.master && Array.isArray(hist.rows) && hist.summary, JSON.stringify(Object.keys(hist || {})));
  check('summary derives totals from the movement ledger',
    hist && 'currentStock' in hist.summary && 'totalIn' in hist.summary && 'totalOut' in hist.summary && 'inventoryValue' in hist.summary);
  check('rows carry a chronological running balance',
    hist.rows.length >= 2 && hist.rows[hist.rows.length - 1].balance === (hist.summary.totalIn - hist.summary.totalOut),
    `last=${hist.rows[hist.rows.length - 1]?.balance} in-out=${hist.summary.totalIn - hist.summary.totalOut}`);
  check('totalIn / totalOut are derived', hist.summary.totalIn >= 100 && hist.summary.totalOut >= 24,
    JSON.stringify({ in: hist.summary.totalIn, out: hist.summary.totalOut }));
}
check('list name is clickable to open history', /openHistory\(r\)/.test(ui) && /getItemHistory/.test(ui));
check('history drawer shows the running balance columns',
  /title: 'Qty In'/.test(ui) && /title: 'Qty Out'/.test(ui) && /title: 'Balance'/.test(ui));
check('history references are clickable (invoice/bill/receipt/adjustment)',
  /historyRefCell/.test(ui) && /customers\/invoices\/edit/.test(ui) && /vendors\/bills\/edit/.test(ui));
check('history has date/type filters', /RangePicker/.test(ui) && /All Types/.test(ui));
check('IPC + preload expose item history',
  /get-item-history/.test(fs.readFileSync(path.join(ROOT, 'src', 'backend', 'handlers', 'ipcHandlers.js'), 'utf8')) &&
  /getItemHistory/.test(fs.readFileSync(path.join(ROOT, 'src', 'backend', 'preload.js'), 'utf8')));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
