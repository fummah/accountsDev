/* Read-only probe of the live data (via scratch copy). */
const path = require('path');
const { useScratchCopy } = require('./lib/testDb.js');
const { scratch, cleanup } = useScratchCopy({ label: 'probe-inventory' });

const Database = require(path.join(__dirname, '..', 'node_modules', 'better-sqlite3'));
const db = new Database(scratch, { readonly: true });

const q = (label, sql, params = []) => {
  try {
    const rows = db.prepare(sql).all(...params);
    console.log(`\n### ${label} (${rows.length})`);
    for (const r of rows.slice(0, 40)) console.log('   ', JSON.stringify(r));
    if (rows.length > 40) console.log(`    ... +${rows.length - 40} more`);
  } catch (e) {
    console.log(`\n### ${label} ERROR: ${e.message}`);
  }
};

console.log('=== TABLES ===');
console.log(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name).join(', '));

q('products by type', "SELECT COALESCE(NULLIF(TRIM(type),''),'<blank/null>') AS type, COUNT(*) c FROM products GROUP BY 1 ORDER BY c DESC");
q('products sample', "SELECT id, name, sku, type, item_id, price FROM products ORDER BY id DESC LIMIT 15");
q('items count', "SELECT COUNT(*) c, SUM(CASE WHEN item_id IS NOT NULL THEN 1 ELSE 0 END) linked FROM (SELECT 1) x, (SELECT 1) y");
q('items sample', "SELECT id, code, name, stock FROM items ORDER BY id DESC LIMIT 15");
q('products with item_id', "SELECT COUNT(*) AS with_item FROM products WHERE item_id IS NOT NULL");
q('warehouses', "SELECT id, code, name, isDefault FROM warehouses ORDER BY id");
q('item_stock sample', "SELECT s.id, s.itemId, i.name AS item, s.warehouseId, w.name AS wh, s.quantity FROM item_stock s LEFT JOIN items i ON i.id=s.itemId LEFT JOIN warehouses w ON w.id=s.warehouseId ORDER BY s.id DESC LIMIT 20");

console.log('\n=== STOCK MOVEMENTS ===');
try {
  const cols = db.prepare("PRAGMA table_info('stock_movements')").all().map(c => c.name);
  console.log('stock_movements columns:', cols.join(', '));
  q('movements by reason', "SELECT reason, COUNT(*) c FROM stock_movements GROUP BY reason ORDER BY c DESC");
  q('movements by sourceType', "SELECT COALESCE(sourceType,'<null>') st, COUNT(*) c FROM stock_movements GROUP BY 1");
  q('recent movements', "SELECT id, itemId, warehouseId, quantityChange, reason, sourceType, sourceId, sourceLineId, unitCost, movedAt FROM stock_movements ORDER BY id DESC LIMIT 20");
} catch (e) { console.log('movements probe error', e.message); }

console.log('\n=== INVOICES ===');
q('invoice_lines columns', "SELECT name FROM pragma_table_info('invoice_lines')");
q('recent invoices', "SELECT id, number, customer, status, start_date FROM invoices ORDER BY id DESC LIMIT 10");
q('recent invoice_lines', "SELECT il.id, il.invoice_id, il.product, p.name AS product_name, p.type AS product_type, il.quantity, il.rate, il.amount FROM invoice_lines il LEFT JOIN products p ON p.id=il.product ORDER BY il.id DESC LIMIT 25");
q('invoice_lines product null', "SELECT COUNT(*) total, SUM(CASE WHEN product IS NULL THEN 1 ELSE 0 END) null_product FROM invoice_lines");
q('invoice_lines joinable to inventory product', "SELECT COUNT(*) c FROM invoice_lines il JOIN products p ON p.id=il.product WHERE LOWER(TRIM(p.type)) IN ('product','raw material','asset','bundle')");

console.log('\n=== BILLS / EXPENSES ===');
q('expense_lines columns', "SELECT name FROM pragma_table_info('expense_lines')");
q('recent expense_lines', "SELECT id, expense_id, line_type, product_id, quantity, rate, warehouse_id, amount, account_id FROM expense_lines ORDER BY id DESC LIMIT 25");
q('expense_lines by line_type', "SELECT COALESCE(line_type,'<null>') lt, COUNT(*) c FROM expense_lines GROUP BY 1");
q('recent expenses', "SELECT id, payee, category, payment_method, approval_status, ref_no FROM expenses ORDER BY id DESC LIMIT 10");

console.log('\n=== PAYMENTS ===');
q('payment tables', "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%payment%' OR name LIKE '%vendor%')");

db.close();
cleanup();
