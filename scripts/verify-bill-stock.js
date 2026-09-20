/**
 * verify-bill-stock.js
 *
 * Proves the Phase-4 contract: saving a vendor bill moves stock, and doing it
 * again does NOT move it twice.
 *
 * Runs on a SCRATCH COPY of the company file.
 *
 * The load-bearing cases are the ones the brief calls out by name:
 *   • 50 → 60 posts +10, never a second +50
 *   • deleting a line reverses it
 *   • two lines for the SAME product in the SAME warehouse both count (which is
 *     why there is no UNIQUE index on the reconciliation tuple)
 *   • moving a bill to Draft un-receives it; back to Unpaid re-receives it
 *   • re-saving with no change posts nothing at all
 *   • deleting the bill puts the stock back
 *   • a bill that cannot post its stock is NOT saved (atomicity)
 *
 * Stock is always read from `item_stock` — the single source of truth — never
 * from `products.stock` / `items.stock`, which are legacy decorative columns.
 */

require('./lib/testDb.js').useScratchCopy({ label: 'verify-bill-stock' });

const path = require('path');
const ROOT = path.join(__dirname, '..');

const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js'));
const Expenses = require(path.join(ROOT, 'src', 'backend', 'models', 'expenses.js'));
const Inventory = require(path.join(ROOT, 'src', 'backend', 'models', 'inventory.js'));
const Warehouses = require(path.join(ROOT, 'src', 'backend', 'models', 'warehouses.js'));
const DocumentInventory = require(path.join(ROOT, 'src', 'backend', 'services', 'documentInventory.js'));

let pass = 0, fail = 0;
const results = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; results.push(`  PASS  ${name}`); }
  else { fail++; results.push(`  FAIL  ${name}${detail ? `  → ${detail}` : ''}`); }
};
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;

(async () => {
  // ── Fixtures ───────────────────────────────────────────────────────────
  const supplier = db.prepare('SELECT id FROM suppliers ORDER BY id LIMIT 1').get();
  const product = db.prepare(
    "SELECT id, name, sku FROM products WHERE LOWER(type) = 'product' ORDER BY id LIMIT 1"
  ).get();
  const W1 = Warehouses.getOrCreateDefault();
  Warehouses.create({ code: 'VBS-W2', name: 'verify-bill-stock W2' });
  const W2 = db.prepare("SELECT * FROM warehouses WHERE code = 'VBS-W2'").get();

  const stockOf = (itemId, warehouseId) => {
    const r = db.prepare('SELECT quantity FROM item_stock WHERE itemId = ? AND warehouseId = ?')
      .get(Number(itemId), Number(warehouseId));
    return r ? Number(r.quantity) : 0;
  };
  const movementsOf = (billId) => db.prepare(
    "SELECT * FROM stock_movements WHERE sourceType = 'bill' AND sourceId = ? ORDER BY id"
  ).all(Number(billId));

  // The bill's item line, in the shape insertExpense/updateExpense accept.
  const itemLine = (qty, rate, warehouseId, productId = product.id) => ({
    line_type: 'item', product_id: productId, quantity: qty, rate,
    amount: Math.round(qty * rate * 100) / 100, warehouse_id: warehouseId,
    description: 'stock fixture',
  });

  const insertBill = (lines, status = 'Unpaid') => Expenses.insertExpense(
    supplier.id, 'Accounts Payable', '2026-06-01', 'bill', 'VBS-1',
    'bill', 'system', status, lines, '2026-06-01', 'stock suite', 30
  );

  const updateBill = (id, lines, status = 'Unpaid') => Expenses.updateExpense({
    id, payee: supplier.id, payment_account: 'Accounts Payable', payment_date: '2026-06-01',
    payment_method: 'bill', ref_no: 'VBS-1', category: 'bill', approval_status: status,
    due_date: '2026-06-01', memo: 'stock suite', terms: 30, lines,
  });

  console.log('\n=== Bill → stock ===');
  console.log(`  fixture: supplier #${supplier.id}, product #${product.id} "${product.name}" (sku ${product.sku || '—'})`);
  console.log(`  warehouse W1 #${W1.id} "${W1.name}" (default), W2 #${W2.id}`);

  // ── 1. A bill that moves no stock must move none ───────────────────────
  // This suite deliberately never requires models/products.js. That is what
  // makes the next assertion meaningful: Inventory.resolveInventoryItem reads
  // and writes products.item_id, and it must not depend on another model having
  // been loaded first to create that column.
  check('this run does NOT load products.js (so load-order independence is real)',
    !require.cache[path.join(ROOT, 'src', 'backend', 'models', 'products.js')],
    'products.js is in the module cache — this run proves nothing about load order');
  check('inventory.js creates products.item_id by itself',
    db.prepare("PRAGMA table_info('products')").all().map(c => c.name).includes('item_id'),
    'products.item_id is missing with products.js unloaded');

  const acctOnly = await Expenses.insertExpense(
    supplier.id, 'Accounts Payable', '2026-06-01', 'bill', 'VBS-A', 'bill', 'system', 'Unpaid',
    [{ line_type: 'account', accountId: null, category: 'General', amount: 25, description: 'no stock' }],
    '2026-06-01', '', 30
  );
  check('an account-only bill still saves', !!(acctOnly && acctOnly.success), JSON.stringify(acctOnly));
  check('an account-only bill creates NO stock movement',
    movementsOf(acctOnly.expenseId).length === 0, `${movementsOf(acctOnly.expenseId).length} movements`);

  // ── 2. CREATE — a receipt of 50 ────────────────────────────────────────
  const created = await insertBill([itemLine(50, 22, W1.id)]);
  check('a bill with an inventory line saves', !!(created && created.success), JSON.stringify(created));
  const billId = created && created.expenseId;

  // Resolve through the ONE backend resolver — never a name match.
  const itemsBefore = db.prepare('SELECT COUNT(*) AS c FROM items').get().c;
  const item = Inventory.resolveInventoryItem(product.id);
  check('the product resolves to an items row', !!item, 'resolveInventoryItem returned null');
  check('the products.item_id link is written back',
    Number(db.prepare('SELECT item_id FROM products WHERE id = ?').get(product.id).item_id) === Number(item.id));
  // The regression guard for the name-collision bug: resolving is a ONE-TIME
  // mapping. If it ever matched on name it would keep finding a different item,
  // and if it re-created on every call the row count would grow.
  const itemsAfterFirst = db.prepare('SELECT COUNT(*) AS c FROM items').get().c;
  const itemAgain = Inventory.resolveInventoryItem(product.id);
  const itemsAfterSecond = db.prepare('SELECT COUNT(*) AS c FROM items').get().c;
  check('resolving is deterministic (same item both times)',
    Number(itemAgain.id) === Number(item.id), `${item.id} vs ${itemAgain.id}`);
  check('resolving creates at most ONE items row',
    itemsAfterSecond === itemsAfterFirst,
    `${itemsBefore} → ${itemsAfterFirst} → ${itemsAfterSecond}`);
  check('the resolved item is the SKU match, not a name match',
    !product.sku || String(item.code || '') === String(product.sku),
    `item.code ${item.code} vs sku ${product.sku}`);

  check('stock rose by exactly 50', near(stockOf(item.id, W1.id), 50), stockOf(item.id, W1.id));

  const mv1 = movementsOf(billId);
  check('exactly one movement was written', mv1.length === 1, `${mv1.length}`);
  check('the movement is +50', !!mv1[0] && near(mv1[0].quantityChange, 50), mv1[0] && mv1[0].quantityChange);
  check('the movement carries the sourceType', mv1[0] && mv1[0].sourceType === 'bill', mv1[0] && mv1[0].sourceType);
  check('the movement carries the sourceId', mv1[0] && Number(mv1[0].sourceId) === Number(billId));
  check('the movement points at its source LINE',
    mv1[0] && Number(mv1[0].sourceLineId) > 0, mv1[0] && mv1[0].sourceLineId);
  check('the movement records the unit cost (informational)',
    mv1[0] && near(mv1[0].unitCost, 22), mv1[0] && mv1[0].unitCost);
  check('the legacy refType/refId columns were left alone',
    mv1[0] && mv1[0].refType == null && mv1[0].refId == null,
    mv1[0] && `${mv1[0].refType}/${mv1[0].refId}`);
  check('hasMovement("bill", id) is true', Inventory.hasMovement('bill', billId) === true);
  check('getPostedQuantity is 50', near(Inventory.getPostedQuantity('bill', billId, item.id, W1.id), 50),
    Inventory.getPostedQuantity('bill', billId, item.id, W1.id));

  // ── 3. EDIT 50 → 60 posts +10, not a second +50 ────────────────────────
  await updateBill(billId, [itemLine(60, 22, W1.id)]);
  check('editing 50 → 60 leaves the balance at 60', near(stockOf(item.id, W1.id), 60), stockOf(item.id, W1.id));
  const mv2 = movementsOf(billId);
  check('the edit wrote exactly one more movement', mv2.length === 2, `${mv2.length}`);
  check('the delta posted is +10, never +50',
    mv2[1] && near(mv2[1].quantityChange, 10), mv2[1] && mv2[1].quantityChange);

  // ── 4. EDIT 60 → 40 posts −20 (an issue) ───────────────────────────────
  await updateBill(billId, [itemLine(40, 22, W1.id)]);
  check('editing 60 → 40 leaves the balance at 40', near(stockOf(item.id, W1.id), 40), stockOf(item.id, W1.id));
  const mv3 = movementsOf(billId);
  check('a reduction posts a negative delta',
    mv3[2] && near(mv3[2].quantityChange, -20), mv3[2] && mv3[2].quantityChange);

  // ── 5. TWO lines, same product, same warehouse — both must count ───────
  // This is the case that forbids a UNIQUE index on the reconciliation tuple.
  await updateBill(billId, [itemLine(40, 22, W1.id), itemLine(5, 22, W1.id)]);
  check('two lines for the same product+warehouse sum to 45',
    near(stockOf(item.id, W1.id), 45), stockOf(item.id, W1.id));
  check('getPostedQuantity agrees (45)',
    near(Inventory.getPostedQuantity('bill', billId, item.id, W1.id), 45),
    Inventory.getPostedQuantity('bill', billId, item.id, W1.id));

  // ── 6. Removing the second line reverses just it ───────────────────────
  await updateBill(billId, [itemLine(40, 22, W1.id)]);
  check('removing the duplicate line returns the balance to 40',
    near(stockOf(item.id, W1.id), 40), stockOf(item.id, W1.id));

  // ── 7. Re-saving with NO change posts nothing ──────────────────────────
  const before = movementsOf(billId).length;
  await updateBill(billId, [itemLine(40, 22, W1.id)]);
  check('an unchanged re-save writes no movement',
    movementsOf(billId).length === before, `${before} → ${movementsOf(billId).length}`);
  check('an unchanged re-save leaves the balance alone', near(stockOf(item.id, W1.id), 40), stockOf(item.id, W1.id));

  // ── 8. Moving the warehouse moves the stock ────────────────────────────
  await updateBill(billId, [itemLine(40, 22, W2.id)]);
  check('the old warehouse is emptied', near(stockOf(item.id, W1.id), 0), stockOf(item.id, W1.id));
  check('the new warehouse holds the goods', near(stockOf(item.id, W2.id), 40), stockOf(item.id, W2.id));

  // ── 9. Draft un-receives; back to Unpaid re-receives ───────────────────
  await updateBill(billId, [itemLine(40, 22, W2.id)], 'Draft');
  check('a Draft bill holds no stock', near(stockOf(item.id, W2.id), 0), stockOf(item.id, W2.id));
  await updateBill(billId, [itemLine(40, 22, W2.id)], 'Unpaid');
  check('leaving Draft re-receives the goods', near(stockOf(item.id, W2.id), 40), stockOf(item.id, W2.id));

  // ── 10. A Draft bill created directly moves nothing ────────────────────
  const draft = await insertBill([itemLine(7, 3, W1.id)], 'Draft');
  check('a bill created as Draft saves', !!(draft && draft.success), JSON.stringify(draft));
  check('a bill created as Draft writes no movement',
    movementsOf(draft.expenseId).length === 0, `${movementsOf(draft.expenseId).length}`);
  check('a bill created as Draft moves no stock', near(stockOf(item.id, W1.id), 0), stockOf(item.id, W1.id));

  // ── 11. Posting the same bill twice is a no-op ─────────────────────────
  const lines = [{ lineId: 0, productId: product.id, quantity: 40, warehouseId: W2.id, unitCost: 22 }];
  const again = DocumentInventory.reconcileBillStock(billId, lines);
  check('re-reconciling an unchanged bill applies nothing',
    again && again.applied.length === 0, JSON.stringify(again && again.applied));

  // ── 12. DELETE puts the stock back ─────────────────────────────────────
  const del = Expenses.deleteExpense(billId);
  check('deleting the bill succeeds', !!(del && del.success), JSON.stringify(del));
  check('deleting the bill returns its stock to zero',
    near(stockOf(item.id, W2.id), 0), stockOf(item.id, W2.id));
  check('the movements survive as an audit trail',
    movementsOf(billId).length > 0, `${movementsOf(billId).length}`);

  // ── 13. ATOMICITY — a bill that cannot post stock must not be saved ────
  // The product id does not exist, so the reconciler reports an unresolvable
  // line, postBillStock throws, and the whole bill transaction must roll back.
  // Counting rows is the only honest way to prove it: the failed call never
  // returns an id, so asserting on `bad.expenseId` would pass vacuously.
  const expensesBefore = db.prepare('SELECT COUNT(*) AS c FROM expenses').get().c;
  const linesBefore = db.prepare('SELECT COUNT(*) AS c FROM expense_lines').get().c;
  const bad = await insertBill([itemLine(5, 1, W1.id, 999999999)]);
  const expensesAfter = db.prepare('SELECT COUNT(*) AS c FROM expenses').get().c;
  const linesAfter = db.prepare('SELECT COUNT(*) AS c FROM expense_lines').get().c;

  check('a bill whose stock cannot be posted FAILS', !!(bad && bad.success === false), JSON.stringify(bad));
  check('  … and it reports why', !!(bad && bad.error), JSON.stringify(bad));
  check('  … and no expense row was left behind',
    expensesAfter === expensesBefore, `${expensesBefore} → ${expensesAfter}`);
  check('  … and no orphan expense line was left behind',
    linesAfter === linesBefore, `${linesBefore} → ${linesAfter}`);
  check('  … and it moved no stock',
    near(stockOf(item.id, W1.id), 0), stockOf(item.id, W1.id));

  // ── 14. An explicit warehouse fallback ─────────────────────────────────
  const noWh = await insertBill([{ ...itemLine(3, 4, null), warehouse_id: null }]);
  check('an item line with no warehouse falls back to the default',
    !!(noWh && noWh.success), JSON.stringify(noWh));
  check('  … and the goods land in the default warehouse',
    near(stockOf(item.id, W1.id), 3), stockOf(item.id, W1.id));
  Expenses.deleteExpense(noWh.expenseId);

  // ── 15. The reverser is idempotent ─────────────────────────────────────
  const rev1 = DocumentInventory.reverseBillStock(noWh.expenseId);
  const rev2 = DocumentInventory.reverseBillStock(noWh.expenseId);
  check('reversing an already-reversed bill applies nothing',
    rev1.applied.length === 0 && rev2.applied.length === 0,
    `${rev1.applied.length}/${rev2.applied.length}`);

  // ── Report ─────────────────────────────────────────────────────────────
  console.log('\n' + results.join('\n'));
  console.log(`\n  item #${item.id} · W1 #${W1.id} = ${stockOf(item.id, W1.id)} · W2 #${W2.id} = ${stockOf(item.id, W2.id)}`);
  console.log(`  movements on the lifecycle bill: ${movementsOf(billId).length}`);
  console.log(`\n  ${pass} passed, ${fail} failed\n`);

  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\nFATAL:', e && e.stack ? e.stack : e);
  console.log(`\n  ${pass} passed, ${fail + 1} failed\n`);
  process.exit(1);
});
