/* Read-only: compare the Products & Services "stock" column with the real item_stock. */
const path = require('path');
const { useScratchCopy } = require('./lib/testDb.js');
const { scratch, cleanup } = useScratchCopy({ label: 'probe-stale-stock' });
const Database = require(path.join(__dirname, '..', 'node_modules', 'better-sqlite3'));
const db = new Database(scratch, { readonly: true });

const rows = db.prepare(`
  SELECT p.id AS productId, p.name, p.sku, p.type, p.stock AS products_stock, p.item_id,
         s.warehouseId, w.name AS warehouse, s.quantity AS item_stock_qty
  FROM products p
  LEFT JOIN item_stock s ON s.itemId = p.item_id
  LEFT JOIN warehouses  w ON w.id = s.warehouseId
  WHERE p.stock IS NOT NULL AND p.stock <> 0
     OR p.item_id IS NOT NULL
  ORDER BY p.id DESC
  LIMIT 40
`).all();

console.log('productId | name | sku | type | products.stock | item_id | warehouse | item_stock');
for (const r of rows) {
  console.log([r.productId, r.name, r.sku, r.type, r.products_stock, r.item_id, r.warehouse, r.item_stock_qty].join(' | '));
}

console.log('\nEggs-like products:');
console.log(JSON.stringify(db.prepare(`
  SELECT p.id, p.name, p.sku, p.stock AS products_stock, p.item_id, s.quantity AS item_stock_qty
  FROM products p LEFT JOIN item_stock s ON s.itemId = p.item_id
  WHERE LOWER(p.name) LIKE '%egg%'
`).all(), null, 1));

db.close();
cleanup();
