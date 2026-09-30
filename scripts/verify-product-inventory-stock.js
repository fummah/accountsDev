/**
 * verify-product-inventory-stock.js
 *
 * The Products & Services list must show the REAL on-hand quantity from the
 * inventory engine (item_stock), never the legacy decorative products.stock.
 *
 * Runs against a SCRATCH COPY (scripts/lib/testDb.js) — the live company file is
 * never opened for writing.
 */
const path = require('path');
require('./lib/testDb.js').useScratchCopy({ label: 'verify-product-inventory-stock' });

const ROOT = path.join(__dirname, '..');
const models = require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js')).raw;
const Products = require(path.join(ROOT, 'src', 'backend', 'models', 'products.js'));
const Inventory = require(path.join(ROOT, 'src', 'backend', 'models', 'inventory.js'));
const Warehouses = require(path.join(ROOT, 'src', 'backend', 'models', 'warehouses.js'));

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

console.log('\n=== Products & Services show REAL inventory stock ===');

// A brand-new product with a deliberately WRONG legacy decorative stock (999),
// so the only correct answer the list may show is the inventory-engine value.
const SKU = `ZZ-INVSTK-${Date.now()}`;
const ins = db.prepare(
  "INSERT INTO products (type, name, sku, category, description, price, stock) VALUES ('Product', 'ZZ Inventory Stock Fixture', ?, '', '', 10, 999)"
).run(SKU);
const productId = Number(ins.lastInsertRowid);

const findIn = (rows) => rows.find(r => Number(r.id) === productId);
const W = Warehouses.getOrCreateDefault();

// 1. Never resolved -> the decorative 999 must be ignored; real stock is 0.
const before = findIn(Products.getPaginated(1, 500, SKU).data) || findIn(Products.getAllProducts());
check('the product is returned by getPaginated', !!before);
check('inventory_stock is present on the row', before && before.inventory_stock !== undefined, before && JSON.stringify(before));
check('legacy products.stock (999) is NOT used as the stock', before && Number(before.inventory_stock) === 0,
  before && `inventory_stock=${before.inventory_stock}, stock=${before.stock}`);
check('the decorative column is still 999 (untouched)', before && Number(before.stock) === 999);
check('getAllProducts agrees (0)', Number((findIn(Products.getAllProducts()) || {}).inventory_stock) === 0);

// 2. Listing must be side-effect free: it may not resolve/create an items row.
const itemsBefore = db.prepare('SELECT COUNT(*) c FROM items').get().c;
Products.getAllProducts();
Products.getPaginated(1, 25, SKU);
const itemsAfter = db.prepare('SELECT COUNT(*) c FROM items').get().c;
check('listing products does not create items rows', itemsBefore === itemsAfter, `${itemsBefore} -> ${itemsAfter}`);
check('an unresolved product still has no item_id', db.prepare('SELECT item_id FROM products WHERE id = ?').get(productId).item_id == null);

// 3. Receive stock through the inventory engine and confirm the list follows.
const item = Inventory.resolveInventoryItem(productId);
check('resolveInventoryItem maps the product to an item', !!item);
const recv = Inventory.receiveStock(item.id, W.id, 42, 5, { sourceType: 'bill', sourceId: 999999, sourceLineId: 1, reason: 'PURCHASE RECEIPT' });
check('receiveStock succeeds', recv && recv.success, recv && recv.error);

const after = findIn(Products.getPaginated(1, 500, SKU).data) || findIn(Products.getAllProducts());
check('inventory_stock reflects the receipt (42)', after && Number(after.inventory_stock) === 42,
  after && `inventory_stock=${after.inventory_stock}`);
check('the list value equals item_stock (the source of truth)',
  after && Number(after.inventory_stock) === Number(db.prepare('SELECT quantity FROM item_stock WHERE itemId = ? AND warehouseId = ?').get(item.id, W.id).quantity));

// 4. Issue stock (a sale) and confirm it follows down too — the reported bug.
Inventory.issueStock(item.id, W.id, 10, null, { sourceType: 'invoice', sourceId: 999998, sourceLineId: 1, reason: 'SALE ISSUE' });
const afterSale = findIn(Products.getPaginated(1, 500, SKU).data);
check('inventory_stock drops after a sale (32)', afterSale && Number(afterSale.inventory_stock) === 32,
  afterSale && `inventory_stock=${afterSale.inventory_stock}`);

// 5. Source wiring: the list reads the derived field, not the decorative column.
const fs = require('fs');
const ui = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'src', 'components', 'shared', 'UnifiedItemList.js'), 'utf8');
check('UnifiedItemList defines stockOf()', /const stockOf = \(r\) =>/.test(ui));
check('UnifiedItemList reads inventory_stock', /r\.inventory_stock != null/.test(ui));
check('UnifiedItemList Stock column uses stockOf', /title: 'On Hand'[\s\S]{0,340}stockOf\(r\)/.test(ui));
check('UnifiedItemList no longer reads raw r.stock for the column', !/const s = Number\(r\.stock \|\| r\.quantity \|\| 0\)/.test(ui));
check('the product form Stock field is read-only', /Stock Availability[\s\S]{0,400}?Read-only/.test(ui) && /On Hand[\s\S]{0,120}?stockOf\(editingItem\)/.test(ui));

const productsSrc = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'models', 'products.js'), 'utf8');
check('products.js derives inventory_stock from item_stock', /SUM\(s\.quantity\) FROM item_stock s WHERE s\.itemId = p\.item_id/.test(productsSrc));
check('products.js aliases products as p in both reads', /FROM products p ORDER BY p\.id DESC/.test(productsSrc) && /FROM products p\$\{whereClause\}/.test(productsSrc));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
