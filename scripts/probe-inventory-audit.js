/* PHASE 1 audit probe — read-only. Confirms the facts the audit document relies on. */
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'src', 'backend', 'db', 'accounts.db');
const db = new Database(dbPath, { readonly: true });

const q = (sql, ...p) => { try { return db.prepare(sql).all(...p); } catch (e) { return [{ ERROR: e.message }]; } };
const one = (sql, ...p) => { try { return db.prepare(sql).get(...p); } catch (e) { return { ERROR: e.message }; } };

const line = (t) => console.log('\n=== ' + t + ' ===');

line('TABLE SCHEMAS');
for (const t of ['items', 'products', 'item_stock', 'stock_movements', 'inventory_adjustments',
                 'warehouses', 'expenses', 'expense_lines', 'invoices', 'invoice_lines',
                 'journal_entries', 'journal_lines', 'accounts']) {
  const s = one(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, t);
  console.log('\n-- ' + t + ' --');
  console.log(s && s.sql ? s.sql : JSON.stringify(s));
}

line('ROW COUNTS');
for (const t of ['items', 'products', 'product_types', 'item_stock', 'stock_movements',
                 'inventory_adjustments', 'warehouses', 'expenses', 'expense_lines',
                 'invoices', 'invoice_lines', 'accounts']) {
  console.log(t + ' = ' + (one(`SELECT COUNT(*) c FROM ${t}`) || {}).c);
}

line('INDEXES on item_stock / stock_movements');
console.log(JSON.stringify(q(`SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND tbl_name IN ('item_stock','stock_movements','inventory_adjustments')`), null, 1));

line('ITEMS vs PRODUCTS (id space)');
console.log('items: ' + JSON.stringify(q('SELECT id, code, name, stock FROM items')));
console.log('item_stock: ' + JSON.stringify(q('SELECT * FROM item_stock')));
console.log('products named like items: ' + JSON.stringify(q(`SELECT id, type, name, sku, stock FROM products WHERE name IN (SELECT name FROM items)`)));
console.log('products total by type: ' + JSON.stringify(q('SELECT type, COUNT(*) c FROM products GROUP BY type')));
console.log('product_types: ' + JSON.stringify(q('SELECT * FROM product_types')));

line('STOCK MOVEMENTS (all)');
console.log(JSON.stringify(q('SELECT * FROM stock_movements'), null, 1));

line('distinct refType in stock_movements');
console.log(JSON.stringify(q('SELECT refType, COUNT(*) c FROM stock_movements GROUP BY refType')));

line('BILLS (expenses category=bill) sample');
console.log(JSON.stringify(q(`SELECT id, payee, ref_no, category, payment_account, due_date, terms, paid_amount FROM expenses WHERE category='bill' LIMIT 5`), null, 1));
console.log('expense_lines for those: ' + JSON.stringify(q(`SELECT l.* FROM expense_lines l JOIN expenses e ON e.id=l.expense_id WHERE e.category='bill' LIMIT 8`), null, 1));

line('ACCOUNTS that look like inventory / COGS');
console.log(JSON.stringify(q(`SELECT id, name, type, subtype FROM accounts WHERE name LIKE '%nventor%' OR name LIKE '%Cost of Goods%' OR name LIKE '%COGS%'`), null, 1));
console.log('distinct account types: ' + JSON.stringify(q('SELECT type, COUNT(*) c FROM accounts GROUP BY type')));

line('INVOICE LINE sample');
console.log(JSON.stringify(q('SELECT * FROM invoice_lines ORDER BY id DESC LIMIT 5'), null, 1));

line('journal_entries source_type distribution');
console.log(JSON.stringify(q('SELECT source_type, COUNT(*) c FROM journal_entries GROUP BY source_type')));

db.close();
