/**
 * verify-inventory-engine.js — Phase 2 gate for the Inventory integration.
 *
 * Proves the extended stock engine behaves as designed BEFORE any document is
 * wired to it:
 *   • receiveStock / issueStock move item_stock.quantity and write a fully
 *     source-linked movement row
 *   • hasMovement + getPostedQuantity give the backend an authoritative
 *     idempotency guard and the delta primitive an edit needs
 *   • resolveInventoryItem is deterministic, never duplicates, and NEVER
 *     matches on product name
 *   • the classification rule agrees with the live data
 *   • adjustStock / recordMovement are unchanged (Adjustments + Transfers)
 *
 * SAFETY: this script copies the live database to .workbuddy-ai/tmp/ and runs
 * against the COPY. The real accounts.db is opened read-only, purely to be
 * copied, and is never written.
 *
 * Run:  ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/verify-inventory-engine.js
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');
const LIVE_DB = path.join(ROOT, 'src', 'backend', 'db', 'accounts.db');
const TMP_DIR = path.join(ROOT, '.workbuddy-ai', 'tmp');
const TMP_DB = path.join(TMP_DIR, 'verify-inventory-engine.db');

// ── tiny harness ────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  [PASS] ${label}`); }
  else { failed++; console.log(`  [FAIL] ${label}\n      expected: ${e}\n      actual:   ${a}`); }
}
const ok = (label, cond, detail) => {
  check(label, !!cond, true);
  if (!cond && detail !== undefined) console.log(`      detail: ${detail}`);
};
const eq = (label, actual, expected) => check(label, actual, expected);

// ── run against a COPY of the live database ─────────────────────────────────
// Capture the live file's identity FIRST so the end of this script can prove it
// was never written to. (Reading it to copy it does not change mtime.)
const liveMtimeBefore = fs.statSync(LIVE_DB).mtimeMs;
const liveSizeBefore = fs.statSync(LIVE_DB).size;

fs.mkdirSync(TMP_DIR, { recursive: true });
fs.copyFileSync(LIVE_DB, TMP_DB);
const conn = new Database(TMP_DB);

// Stub ./dbmgr so the models bind to the copy. Injecting the module cache entry
// means dbmgr.js itself never runs (and never needs Electron).
const dbmgrPath = require.resolve(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js'));
const wrap = {
  raw: conn,
  all: (sql, params) => {
    const s = conn.prepare(sql);
    if (params === undefined) return s.all();
    return Array.isArray(params) ? s.all(...params) : s.all(params);
  },
  get: (sql, params) => {
    const s = conn.prepare(sql);
    if (params === undefined) return s.get();
    return Array.isArray(params) ? s.get(...params) : s.get(params);
  },
  run: (sql, params) => {
    const s = conn.prepare(sql);
    if (params === undefined) return s.run();
    return Array.isArray(params) ? s.run(...params) : s.run(params);
  },
  exec: (sql) => conn.exec(sql),
  prepare: (sql) => conn.prepare(sql),
  transaction: (fn) => conn.transaction(fn),
  isNewDatabase: false,
};
require.cache[dbmgrPath] = {
  id: dbmgrPath, filename: dbmgrPath, loaded: true, exports: wrap, children: [], paths: [],
};

// Load in the same order models/index.js does, so createTable migrations run.
require(path.join(ROOT, 'src', 'backend', 'models', 'products.js'));
require(path.join(ROOT, 'src', 'backend', 'models', 'warehouses.js'));
const Inventory = require(path.join(ROOT, 'src', 'backend', 'models', 'inventory.js'));
const Classification = require(path.join(ROOT, 'src', 'backend', 'services', 'productClassification.js'));

const one = (sql, ...p) => conn.prepare(sql).get(...p);
const many = (sql, ...p) => conn.prepare(sql).all(...p);

console.log('\n1. Schema — the source-link columns exist\n');

const smCols = new Set(many("PRAGMA table_info('stock_movements')").map(r => r.name));
for (const c of ['sourceType', 'sourceId', 'sourceLineId', 'unitCost']) {
  ok(`stock_movements.${c} exists`, smCols.has(c));
}
ok('stock_movements keeps its original columns',
  ['id', 'itemId', 'warehouseId', 'quantityChange', 'reason', 'refType', 'refId', 'movedAt']
    .every(c => smCols.has(c)));

const prodCols = new Set(many("PRAGMA table_info('products')").map(r => r.name));
ok('products.item_id exists', prodCols.has('item_id'));

const whCols = new Set(many("PRAGMA table_info('warehouses')").map(r => r.name));
ok('warehouses.isDefault exists', whCols.has('isDefault'));

const idx = many("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='stock_movements'").map(r => r.name);
ok('idx_stock_movements_source exists', idx.includes('idx_stock_movements_source'));

const whCount = one('SELECT COUNT(*) c FROM warehouses').c;
const defCount = one('SELECT COUNT(*) c FROM warehouses WHERE isDefault = 1').c;
ok('exactly one warehouse is the default', whCount === 0 || defCount === 1, `warehouses=${whCount} default=${defCount}`);

console.log('\n2. Product classification (type-based, never by name)\n');

eq('Service  → not inventory', Classification.tracksInventory('Service'), false);
eq('Product  → inventory', Classification.tracksInventory('Product'), true);
eq('Raw Material → inventory', Classification.tracksInventory('Raw Material'), true);
eq('Bundle   → inventory', Classification.tracksInventory('Bundle'), true);
eq('blank    → not inventory (fail safe)', Classification.tracksInventory(''), false);
eq('null     → not inventory (fail safe)', Classification.tracksInventory(null), false);
eq('unknown custom type → not inventory (fail safe)', Classification.tracksInventory('DDDziva'), false);
eq('case/whitespace tolerant', Classification.tracksInventory('  sErViCe '), false);
eq('accepts a product row', Classification.tracksInventory({ type: 'Product' }), true);
eq('accepts a product row (service)', Classification.tracksInventory({ type: 'Service' }), false);
eq('isServiceType(Service)', Classification.isServiceType('Service'), true);
eq('isServiceType(Product)', Classification.isServiceType('Product'), false);

// Agreement with the live data: every distinct type in the DB is classified.
const liveTypes = many('SELECT DISTINCT type FROM products').map(r => r.type);
const unclassified = liveTypes.filter(t => !Classification.isInventoryType(t) && !Classification.isServiceType(t));
eq('every live product type is explicitly classified', unclassified, []);
const inventoryRows = one(
  `SELECT COUNT(*) c FROM products WHERE LOWER(TRIM(COALESCE(type,''))) IN ('product','raw material','asset','bundle')`
).c;
const serviceRows = one(`SELECT COUNT(*) c FROM products WHERE LOWER(TRIM(COALESCE(type,''))) = 'service'`).c;
ok('live DB has inventory rows', inventoryRows > 0, `inventoryRows=${inventoryRows}`);
console.log(`      (live: ${inventoryRows} inventory / ${serviceRows} service of ${one('SELECT COUNT(*) c FROM products').c})`);

console.log('\n3. resolveInventoryItem — deterministic, no duplicates, SKU-only\n');

const ORANGE_ITEM_ID = one("SELECT id FROM items WHERE name = 'Orange'").id;
const ORANGE_PROD = one("SELECT id, sku FROM products WHERE name = 'Orange' ORDER BY id ASC LIMIT 1");
ok('fixture: an item named Orange exists', !!ORANGE_ITEM_ID, ORANGE_ITEM_ID);
ok('fixture: a product named Orange exists', !!ORANGE_PROD, ORANGE_PROD);

// A product whose NAME matches an item but whose SKU does NOT must not adopt it.
// (insertProduct is async, so use raw SQL here for determinism.)
const decoySku = 'VERIFY-DECOY-SKU-1';
conn.prepare(`INSERT INTO products (type, name, sku, price) VALUES ('Product','Orange',?,10)`).run(decoySku);
const decoyId = one('SELECT id FROM products WHERE sku = ?', decoySku).id;

const resolvedDecoy = Inventory.resolveInventoryItem(decoyId);
ok('name collision does NOT reuse the same-named item', resolvedDecoy && resolvedDecoy.id !== ORANGE_ITEM_ID,
  `resolved=${resolvedDecoy && resolvedDecoy.id} orangeItem=${ORANGE_ITEM_ID}`);
eq('the decoy got its own item code = its SKU', resolvedDecoy && resolvedDecoy.code, decoySku);

const itemsBefore = one('SELECT COUNT(*) c FROM items').c;
const r1 = Inventory.resolveInventoryItem(decoyId);
const r2 = Inventory.resolveInventoryItem(decoyId);
const itemsAfter = one('SELECT COUNT(*) c FROM items').c;
eq('resolve is deterministic (same id twice)', r1.id, r2.id);
eq('resolve does not duplicate the item', itemsAfter, itemsBefore);
eq('resolve writes the link back to products.item_id',
  one('SELECT item_id FROM products WHERE id = ?', decoyId).item_id, r1.id);
eq('resolveItemId returns the same id', Inventory.resolveItemId(decoyId), r1.id);

// SKU match reuses an existing item rather than creating one.
conn.prepare(`INSERT INTO items (code, name) VALUES ('VERIFY-SKU-REUSE','Verify Reuse Item')`).run();
const reuseItemId = one("SELECT id FROM items WHERE code = 'VERIFY-SKU-REUSE'").id;
conn.prepare(`INSERT INTO products (type, name, sku, price) VALUES ('Product','Totally Different Name',?,5)`).run('VERIFY-SKU-REUSE');
const reuseProdId = one("SELECT id FROM products WHERE sku = 'VERIFY-SKU-REUSE'").id;
const itemsBefore2 = one('SELECT COUNT(*) c FROM items').c;
const reuseResolved = Inventory.resolveInventoryItem(reuseProdId);
eq('SKU match reuses the existing item', reuseResolved.id, reuseItemId);
eq('SKU match creates no new item', one('SELECT COUNT(*) c FROM items').c, itemsBefore2);

eq('nonexistent product resolves to null', Inventory.resolveInventoryItem(987654321), null);
eq('non-numeric product resolves to null', Inventory.resolveInventoryItem('nope'), null);

console.log('\n4. receiveStock — goods IN from a vendor bill\n');

const WH = one('SELECT id FROM warehouses ORDER BY id ASC LIMIT 1').id;
ok('fixture: a warehouse exists', !!WH, WH);

const ITEM = reuseItemId; // isolated item created above
const BILL = 990001;

eq('hasMovement is false before any receipt', Inventory.hasMovement('bill', BILL), false);
eq('item_stock row does not exist yet',
  one('SELECT COUNT(*) c FROM item_stock WHERE itemId=? AND warehouseId=?', ITEM, WH).c, 0);

const rec1 = Inventory.receiveStock(ITEM, WH, 50, 22, {
  sourceType: 'bill', sourceId: BILL, sourceLineId: 1,
});
eq('receiveStock reports success', rec1.success, true);
eq('receiveStock creates the item_stock row', 
  one('SELECT COUNT(*) c FROM item_stock WHERE itemId=? AND warehouseId=?', ITEM, WH).c, 1);
eq('quantity is now 50', one('SELECT quantity FROM item_stock WHERE itemId=? AND warehouseId=?', ITEM, WH).quantity, 50);

const mv1 = one('SELECT * FROM stock_movements WHERE sourceType=? AND sourceId=? ORDER BY id DESC LIMIT 1', 'bill', BILL);
eq('movement quantityChange is +50', mv1.quantityChange, 50);
eq('movement sourceType is bill', mv1.sourceType, 'bill');
eq('movement sourceId is the bill id', mv1.sourceId, BILL);
eq('movement sourceLineId is the line id', mv1.sourceLineId, 1);
eq('movement unitCost is recorded', mv1.unitCost, 22);
eq('movement reason is PURCHASE RECEIPT', mv1.reason, 'PURCHASE RECEIPT');
eq('movement leaves the legacy refType untouched (NULL)', mv1.refType, null);
eq('movement leaves the legacy refId untouched (NULL)', mv1.refId, null);

eq('hasMovement is now true', Inventory.hasMovement('bill', BILL), true);
eq('getPostedQuantity nets +50', Inventory.getPostedQuantity('bill', BILL, ITEM, WH), 50);

// second receipt on the same document accumulates (the caller guards idempotency)
Inventory.receiveStock(ITEM, WH, 10, 22, { sourceType: 'bill', sourceId: BILL, sourceLineId: 2 });
eq('a second line accumulates to 60',
  one('SELECT quantity FROM item_stock WHERE itemId=? AND warehouseId=?', ITEM, WH).quantity, 60);
eq('getPostedQuantity nets +60', Inventory.getPostedQuantity('bill', BILL, ITEM, WH), 60);

console.log('\n5. Validation guards\n');
eq('rejects zero quantity', Inventory.receiveStock(ITEM, WH, 0, 1, {}).success, false);
eq('rejects negative quantity', Inventory.receiveStock(ITEM, WH, -5, 1, {}).success, false);
eq('rejects missing itemId', Inventory.receiveStock(null, WH, 5, 1, {}).success, false);
eq('rejects missing warehouseId', Inventory.receiveStock(ITEM, null, 5, 1, {}).success, false);
eq('rejects non-numeric quantity', Inventory.receiveStock(ITEM, WH, 'abc', 1, {}).success, false);
eq('a rejected receipt did not change stock',
  one('SELECT quantity FROM item_stock WHERE itemId=? AND warehouseId=?', ITEM, WH).quantity, 60);

console.log('\n6. issueStock — goods OUT on a sales invoice\n');

const INVOICE = 990002;
const i1 = Inventory.issueStock(ITEM, WH, 10, 22, {
  sourceType: 'invoice', sourceId: INVOICE, sourceLineId: 7,
});
eq('issueStock reports success', i1.success, true);
eq('balance reported back is 50', i1.balance, 50);
eq('not flagged negative', i1.negative, false);
eq('quantity is now 50',
  one('SELECT quantity FROM item_stock WHERE itemId=? AND warehouseId=?', ITEM, WH).quantity, 50);

const mv2 = one('SELECT * FROM stock_movements WHERE sourceType=? AND sourceId=? ORDER BY id DESC LIMIT 1', 'invoice', INVOICE);
eq('movement quantityChange is -10', mv2.quantityChange, -10);
eq('movement reason is SALE ISSUE', mv2.reason, 'SALE ISSUE');
eq('movement sourceLineId is recorded', mv2.sourceLineId, 7);
eq('invoice movements are separate from bill movements',
  Inventory.hasMovement('invoice', INVOICE), true);

// oversell: allowed, surfaced, not blocked
const i2 = Inventory.issueStock(ITEM, WH, 999, 22, { sourceType: 'invoice', sourceId: 990003 });
eq('overselling is allowed (a sale must still be recordable)', i2.success, true);
eq('overselling is flagged', i2.negative, true);
ok('overselling produced a negative balance', i2.balance < 0, `balance=${i2.balance}`);
// undo the oversell so later assertions are readable
Inventory.receiveStock(ITEM, WH, 999, 22, { sourceType: 'manual', sourceId: 990003, reason: 'VERIFY UNDO' });
eq('balance restored after undo',
  one('SELECT quantity FROM item_stock WHERE itemId=? AND warehouseId=?', ITEM, WH).quantity, 50);

console.log('\n7. Delta reconciliation — the 50 → 60 edit case\n');

const DELTA_BILL = 990004;
Inventory.receiveStock(ITEM, WH, 50, 22, { sourceType: 'bill', sourceId: DELTA_BILL, sourceLineId: 1 });
const qtyAfter50 = one('SELECT quantity FROM item_stock WHERE itemId=? AND warehouseId=?', ITEM, WH).quantity;

// The edit path: compute the delta from what is already posted, post only that.
const posted = Inventory.getPostedQuantity('bill', DELTA_BILL, ITEM, WH);
const delta = 60 - posted;
eq('posted quantity before edit is 50', posted, 50);
eq('delta for 50 → 60 is +10', delta, 10);
Inventory.receiveStock(ITEM, WH, delta, 22, { sourceType: 'bill', sourceId: DELTA_BILL, sourceLineId: 1 });
const qtyAfter60 = one('SELECT quantity FROM item_stock WHERE itemId=? AND warehouseId=?', ITEM, WH).quantity;
eq('50 → 60 yields +10, NOT +110', qtyAfter60 - qtyAfter50, 10);
eq('net posted for the document is 60', Inventory.getPostedQuantity('bill', DELTA_BILL, ITEM, WH), 60);

// Reducing a line: 60 → 45 must take stock DOWN by 15.
const posted2 = Inventory.getPostedQuantity('bill', DELTA_BILL, ITEM, WH);
const delta2 = 45 - posted2;
eq('delta for 60 → 45 is -15', delta2, -15);
Inventory.issueStock(ITEM, WH, Math.abs(delta2), 22, { sourceType: 'bill', sourceId: DELTA_BILL, sourceLineId: 1 });
eq('net posted for the document is now 45', Inventory.getPostedQuantity('bill', DELTA_BILL, ITEM, WH), 45);
eq('stock moved down by exactly 15', 
  qtyAfter60 - one('SELECT quantity FROM item_stock WHERE itemId=? AND warehouseId=?', ITEM, WH).quantity, 15);

console.log('\n8. Composition inside a caller transaction (one transaction per document)\n');

const qtyBeforeTx = one('SELECT quantity FROM item_stock WHERE itemId=? AND warehouseId=?', ITEM, WH).quantity;
const TX_BILL = 990005;
conn.prepare('BEGIN').run();
ok('a caller transaction is open', conn.inTransaction === true);
const inTx = Inventory.receiveStock(ITEM, WH, 77, 22, { sourceType: 'bill', sourceId: TX_BILL, sourceLineId: 1 });
eq('receiveStock succeeds inside the caller transaction', inTx.success, true);
eq('the write is visible inside the transaction',
  one('SELECT quantity FROM item_stock WHERE itemId=? AND warehouseId=?', ITEM, WH).quantity, qtyBeforeTx + 77);
conn.prepare('ROLLBACK').run();
eq('the caller rollback undid the receipt',
  one('SELECT quantity FROM item_stock WHERE itemId=? AND warehouseId=?', ITEM, WH).quantity, qtyBeforeTx);
eq('the caller rollback also undid the movement row', Inventory.hasMovement('bill', TX_BILL), false);

console.log('\n9. getMovementsForSource — Inventory History trace\n');
const trace = Inventory.getMovementsForSource('bill', BILL);
eq('returns the document movements', trace.length, 2);
ok('movements carry the item name', !!trace[0].itemName, trace[0].itemName);
ok('movements carry the warehouse name', !!trace[0].warehouseName, trace[0].warehouseName);
eq('an unknown source returns nothing', Inventory.getMovementsForSource('bill', 111111).length, 0);
eq('hasMovement on a null source is false', Inventory.hasMovement(null, null), false);
eq('getPostedQuantity on a null source is 0', Inventory.getPostedQuantity(null, null, ITEM, WH), 0);

console.log('\n10. adjustStock + recordMovement are UNCHANGED\n');

const ADJ_ITEM = one("SELECT id FROM items WHERE code = 'VERIFY-SKU-REUSE'").id;
const adj = Inventory.adjustStock(ADJ_ITEM, WH, 8, 'verify adjustment');
eq('adjustStock still succeeds', adj.success, true);
const adjMv = one(`SELECT * FROM stock_movements WHERE itemId=? AND reason='verify adjustment' ORDER BY id DESC LIMIT 1`, ADJ_ITEM);
eq('adjustStock still writes refType ADJUSTMENT', adjMv.refType, 'ADJUSTMENT');
eq('adjustStock still writes refId NULL', adjMv.refId, null);
eq('adjustStock does NOT write sourceType', adjMv.sourceType, null);
eq('adjustStock does NOT write sourceId', adjMv.sourceId, null);
eq('adjustStock still writes an inventory_adjustments row',
  one(`SELECT COUNT(*) c FROM inventory_adjustments WHERE itemId=? AND reason='verify adjustment'`, ADJ_ITEM).c, 1);

// transfer
conn.prepare(`INSERT INTO warehouses (code, name, location, isDefault) VALUES ('VERIFY-WH2','Verify WH2','x',0)`).run();
const WH2 = one("SELECT id FROM warehouses WHERE code='VERIFY-WH2'").id;
Inventory.adjustStock(ADJ_ITEM, WH, 20, 'verify transfer seed');
const before2 = one('SELECT quantity FROM item_stock WHERE itemId=? AND warehouseId=?', ADJ_ITEM, WH).quantity;
const tr = Inventory.recordMovement(ADJ_ITEM, WH, WH2, 5, 'MANUAL', 42);
eq('recordMovement still succeeds', tr.success, true);
eq('source warehouse went down by 5',
  one('SELECT quantity FROM item_stock WHERE itemId=? AND warehouseId=?', ADJ_ITEM, WH).quantity, before2 - 5);
eq('destination warehouse went up by 5',
  one('SELECT quantity FROM item_stock WHERE itemId=? AND warehouseId=?', ADJ_ITEM, WH2).quantity, 5);
const trOut = one(`SELECT * FROM stock_movements WHERE itemId=? AND warehouseId=? AND reason='TRANSFER OUT' ORDER BY id DESC LIMIT 1`, ADJ_ITEM, WH);
eq('TRANSFER OUT reason preserved', trOut.reason, 'TRANSFER OUT');
eq('TRANSFER OUT refType passed through', trOut.refType, 'MANUAL');
eq('TRANSFER OUT refId passed through', trOut.refId, 42);
eq('TRANSFER OUT leaves sourceType NULL (transfers are not documents)', trOut.sourceType, null);

const trFail = Inventory.recordMovement(ADJ_ITEM, WH, WH2, 999999, 'MANUAL', null);
eq('recordMovement still refuses to over-transfer', trFail.success, false);
eq('over-transfer error message unchanged', trFail.error, 'Insufficient stock at source warehouse');
eq('rejects non-positive transfer quantity',
  Inventory.recordMovement(ADJ_ITEM, WH, WH2, 0, 'MANUAL', null).error, 'Quantity must be positive');

console.log('\n11. The live database was NOT touched\n');
// Identity check rather than a schema check: asserting "the live DB has no
// sourceType column" would break the moment the app legitimately runs the
// migration. What must always hold is that THIS SCRIPT never wrote to it.
const liveStatAfter = fs.statSync(LIVE_DB);
eq('live db mtime unchanged by this run', liveStatAfter.mtimeMs, liveMtimeBefore);
eq('live db size unchanged by this run', liveStatAfter.size, liveSizeBefore);
ok('live db file is present and non-empty', liveStatAfter.size > 0, liveStatAfter.size);

const liveConn = new Database(LIVE_DB, { readonly: true });
const liveSmRows = liveConn.prepare('SELECT COUNT(*) c FROM stock_movements').get().c;
const liveStockRows = liveConn.prepare('SELECT COUNT(*) c FROM item_stock').get().c;
liveConn.close();
ok('live stock_movements readable', Number.isFinite(liveSmRows), liveSmRows);
ok('live item_stock readable', Number.isFinite(liveStockRows), liveStockRows);
console.log(`      (live: stock_movements=${liveSmRows} rows, item_stock=${liveStockRows} rows — untouched)`);

console.log(`\nRESULT: ${passed} passed, ${failed} failed\n`);
console.log(`(ran against a copy: ${TMP_DB})`);

conn.close();
process.exit(failed ? 1 : 0);
