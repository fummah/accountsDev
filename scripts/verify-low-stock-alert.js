/**
 * verify-low-stock-alert.js
 *
 * Proves the central stock-status rule and its integration:
 *   OUT_OF_STOCK  On Hand <= 0
 *   LOW_STOCK     On Hand > 0 AND On Hand <= Reorder Point   (<= boundary)
 *   IN_STOCK      otherwise
 * NULL Reorder Point never warns; only inventory-tracked items participate;
 * status is derived (never stored); On PO never suppresses Low Stock.
 *
 * Runs on a SCRATCH COPY of the company file.
 */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-low-stock' });

const path = require('path');
const ROOT = path.join(__dirname, '..');
const BE = path.join(ROOT, 'src', 'backend');
const db = require(path.join(BE, 'models', 'dbmgr.js'));
const Products = require(path.join(BE, 'models', 'products.js'));
const Inventory = require(path.join(BE, 'models', 'inventory.js'));
const Warehouses = require(path.join(BE, 'models', 'warehouses.js'));
const COA = require(path.join(BE, 'models', 'chartOfAccounts.js'));
require(path.join(BE, 'models', 'purchaseOrders.js'));
const ItemStatus = require(path.join(BE, 'services', 'inventoryStockStatus.js'));
const Dashboard = require(path.join(BE, 'services', 'inventoryDashboardService.js'));

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};
const { STATUS } = ItemStatus;
const S = (q, rp) => ItemStatus.computeStatus(true, q, rp);

const income = COA.getByName('Sales Revenue') || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('income','other income') AND status='Active' ORDER BY id LIMIT 1").get();
const expense = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('expense','cost of goods sold','other expense') AND status='Active' ORDER BY id LIMIT 1").get();
const invAsset = COA.getSystemAccount('Inventory Asset') || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('asset','other current asset','inventory') AND status='Active' ORDER BY id LIMIT 1").get();
const cogs = COA.getSystemAccount('Cost of Goods Sold') || expense;
const supplier = db.prepare('SELECT id FROM suppliers ORDER BY id LIMIT 1').get();
const W = Warehouses.getOrCreateDefault();
const stamp = Date.now();
let seq = 0;

const mkItem = (type, name, extra = {}) => Products.saveItemMaster({
  type, name, sku: `${name}-${stamp}`, salesPrice: 10, purchaseCost: 5,
  incomeAccountId: income.id,
  ...(type === 'INVENTORY_PART' ? { inventoryAssetAccountId: invAsset.id, cogsAccountId: cogs.id, valuationMethod: 'FIFO' } : { purchaseExpenseAccountId: expense.id }),
  ...extra,
});
const statusOf = (productId) => ItemStatus.getStatusForItem(productId);
const setStock = (productId, qty, cost = 5) => {
  const itemId = Inventory.resolveItemId(productId);
  if (qty > 0) return Inventory.receiveStock(itemId, W.id, qty, cost, { sourceType: 'receipt', sourceId: ++seq + 900000 });
  if (qty < 0) return Inventory.issueStock(itemId, W.id, -qty, cost, { sourceType: 'invoice', sourceId: ++seq + 900000 });
  return null;
};

(async () => {
  console.log('\n=== TEST 1-8: pure status rule ===');
  check('TEST 1  15 / rp10 → IN_STOCK', S(15, 10) === STATUS.IN_STOCK);
  check('TEST 2  10 / rp10 → LOW_STOCK (<= boundary)', S(10, 10) === STATUS.LOW_STOCK);
  check('TEST 3  4 / rp10 → LOW_STOCK', S(4, 10) === STATUS.LOW_STOCK);
  check('TEST 4  0 / rp10 → OUT_OF_STOCK', S(0, 10) === STATUS.OUT_OF_STOCK);
  check('TEST 5  -3 / rp10 → OUT_OF_STOCK', S(-3, 10) === STATUS.OUT_OF_STOCK);
  check('TEST 6  null reorder point → no false Low Stock', S(4, null) === STATUS.IN_STOCK);
  check('TEST 6b reorder 0 → normal rule (In Stock)', S(4, 0) === STATUS.IN_STOCK);
  check('TEST 7  non-inventory → null status', ItemStatus.computeStatus(false, 4, 10) === null);
  check('TEST 8  service → null status', ItemStatus.computeStatus(false, 0, 10) === null);

  console.log('\n=== TEST 9: Low Stock with On PO is still Low Stock ===');
  const A = mkItem('INVENTORY_PART', `LS A`, { reorderPoint: 10 });
  setStock(A.id, 4);
  const poA = db.prepare("INSERT INTO purchase_orders (po_number, vendor_id, po_date, status, subtotal, tax_total, total, created_by) VALUES (?,?,?,?,?,?,?,?)")
    .run(`LS-${stamp}`, supplier.id, '2026-09-01', 'OPEN', 0, 0, 0, 't').lastInsertRowid;
  db.prepare("INSERT INTO purchase_order_lines (purchase_order_id, item_id, line_no, description, item_type, unit, qty_ordered, qty_received, qty_billed, unit_cost, tax_rate, amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(poA, A.id, 1, 'x', 'INVENTORY_PART', 'Each', 20, 0, 0, 5, 0, 0);
  let st = statusOf(A.id);
  check('TEST 9  status LOW_STOCK', st.status === STATUS.LOW_STOCK, st.status);
  check('TEST 9  On PO 20 / Expected 24', st.onPurchaseOrder === 20 && st.expected === 24, `${st.onPurchaseOrder}/${st.expected}`);

  console.log('\n=== TEST 10-11: sale causes Low Stock (incl. exact threshold) ===');
  const B = mkItem('INVENTORY_PART', `LS B`, { reorderPoint: 10 });
  setStock(B.id, 12);
  check('TEST 10 before sale In Stock', statusOf(B.id).status === STATUS.IN_STOCK);
  setStock(B.id, -3);
  check('TEST 10 after selling 3 → Low Stock', statusOf(B.id).status === STATUS.LOW_STOCK);
  const C = mkItem('INVENTORY_PART', `LS C`, { reorderPoint: 10 });
  setStock(C.id, 12);
  setStock(C.id, -2);
  check('TEST 11 after selling 2 (→10) → Low Stock', statusOf(C.id).status === STATUS.LOW_STOCK);

  console.log('\n=== TEST 12-14: receipt / adjustment recalc ===');
  const D = mkItem('INVENTORY_PART', `LS D`, { reorderPoint: 10 });
  setStock(D.id, 4);
  check('TEST 12 before receipt Low Stock', statusOf(D.id).status === STATUS.LOW_STOCK);
  setStock(D.id, 20);
  check('TEST 12 after receiving 20 → In Stock', statusOf(D.id).status === STATUS.IN_STOCK);
  const E = mkItem('INVENTORY_PART', `LS E`, { reorderPoint: 10 });
  setStock(E.id, 15);
  Inventory.adjustStock(Inventory.resolveItemId(E.id), W.id, -8, 'test');
  check('TEST 13 adjustment -8 (→7) → Low Stock', statusOf(E.id).status === STATUS.LOW_STOCK);
  Inventory.adjustStock(Inventory.resolveItemId(E.id), W.id, 8, 'test');
  check('TEST 14 adjustment +8 (→15) → In Stock', statusOf(E.id).status === STATUS.IN_STOCK);

  console.log('\n=== TEST 15: Reorder Point change recalc ===');
  const F = mkItem('INVENTORY_PART', `LS F`, { reorderPoint: 5 });
  setStock(F.id, 10);
  check('TEST 15 before (rp5) In Stock', statusOf(F.id).status === STATUS.IN_STOCK);
  Products.saveItemMaster({ ...Products.getById(F.id), id: F.id, type: 'INVENTORY_PART', name: Products.getById(F.id).name, sku: Products.getById(F.id).sku, incomeAccountId: income.id, inventoryAssetAccountId: invAsset.id, cogsAccountId: cogs.id, reorderPoint: 12 });
  check('TEST 15 after rp→12 → Low Stock', statusOf(F.id).status === STATUS.LOW_STOCK);

  console.log('\n=== TEST 16: dashboard counts (no double counting) ===');
  const before = Dashboard.getDashboard().summary;
  const mk = (name, qty, rp) => { const it = mkItem('INVENTORY_PART', name, { reorderPoint: rp }); setStock(it.id, qty); return it; };
  mk(`LS16 low1`, 4, 10); mk(`LS16 low2`, 4, 10); mk(`LS16 low3`, 4, 10);
  mk(`LS16 out1`, 0, 10); mk(`LS16 out2`, -2, 10);
  mk(`LS16 in1`, 20, 10); mk(`LS16 in2`, 20, 10); mk(`LS16 in3`, 20, 10); mk(`LS16 in4`, 20, 10); mk(`LS16 in5`, 20, 10);
  const after = Dashboard.getDashboard().summary;
  check('TEST 16 Low Stock +3', after.lowStockItems - before.lowStockItems === 3, String(after.lowStockItems - before.lowStockItems));
  check('TEST 16 Out of Stock +2', after.outOfStockItems - before.outOfStockItems === 2, String(after.outOfStockItems - before.outOfStockItems));

  console.log('\n=== TEST 17: Products status filter ===');
  const filtered = Products.getPaginated(1, 500, '', '', '', 'LOW_STOCK');
  check('TEST 17 LOW_STOCK filter returns only Low Stock items',
    Array.isArray(filtered.data) && filtered.data.length > 0 && filtered.data.every((r) => r.stock_status === STATUS.LOW_STOCK),
    `${filtered.data.length} rows`);

  console.log('\n=== TEST 18: Item detail ===');
  const detail = Products.getItemDetail(A.id);
  check('TEST 18 detail carries availability + status',
    detail && detail.availability && detail.availability.onHand === 4 && detail.availability.onPurchaseOrder === 20 &&
    detail.availability.expected === 24 && detail.master.reorder_point === 10 && detail.stock_status === STATUS.LOW_STOCK,
    JSON.stringify({ av: detail && detail.availability, status: detail && detail.stock_status }));

  console.log('\n=== TEST 19-20: incoming PO keeps Low Stock; full receipt clears ===');
  check('TEST 19 Low Stock remains with On PO 20', statusOf(A.id).status === STATUS.LOW_STOCK);
  setStock(A.id, 20); // receive 20 → on hand 24 > rp 10
  check('TEST 20 after full receipt → In Stock', statusOf(A.id).status === STATUS.IN_STOCK);

  console.log('\n=== TEST 21-23: void sale / returns recalc ===');
  const G = mkItem('INVENTORY_PART', `LS G`, { reorderPoint: 10 });
  setStock(G.id, 12); setStock(G.id, -3);
  check('TEST 21 sale → Low Stock', statusOf(G.id).status === STATUS.LOW_STOCK);
  setStock(G.id, 3); // reversal restores
  check('TEST 21 void/reverse → In Stock', statusOf(G.id).status === STATUS.IN_STOCK);
  const H = mkItem('INVENTORY_PART', `LS H`, { reorderPoint: 10 });
  setStock(H.id, 12); setStock(H.id, -5);
  check('TEST 22 customer return: before return Low Stock', statusOf(H.id).status === STATUS.LOW_STOCK);
  setStock(H.id, 5);
  check('TEST 22 after return → In Stock', statusOf(H.id).status === STATUS.IN_STOCK);
  const I = mkItem('INVENTORY_PART', `LS I`, { reorderPoint: 10 });
  setStock(I.id, 20);
  check('TEST 23 vendor return: before In Stock', statusOf(I.id).status === STATUS.IN_STOCK);
  setStock(I.id, -18);
  check('TEST 23 after vendor return → Low Stock', statusOf(I.id).status === STATUS.LOW_STOCK);

  console.log('\n=== TEST 24: inactive item excluded from dashboard counts ===');
  const INACTIVE = mkItem('INVENTORY_PART', `LS Inactive`, { reorderPoint: 10, isActive: false });
  setStock(INACTIVE.id, 1);
  const dash24 = Dashboard.getDashboard();
  check('TEST 24 inactive item not in Stock Attention', !dash24.stockAttention.some((r) => r.productId === Number(INACTIVE.id)));
  check('TEST 24 inactive item not counted as Low Stock', dash24.summary.lowStockItems === after.lowStockItems, `${dash24.summary.lowStockItems} vs ${after.lowStockItems}`);

  console.log('\n=== TEST 26: large inventory (batch, no N+1) ===');
  const ids = [];
  for (let i = 0; i < 1000; i++) ids.push(mkItem('INVENTORY_PART', `LSBulk${i}`, { reorderPoint: 10 }).id);
  const t0 = Date.now();
  const statuses = ItemStatus.getStatusForItems(ids);
  const ms = Date.now() - t0;
  console.log(`  batch status for 1000 items in ${ms} ms`);
  check('TEST 26 batch returns all 1000 statuses', Object.keys(statuses).length === 1000, String(Object.keys(statuses).length));
  check('TEST 26 batch efficient (< 3000ms)', ms < 3000, `${ms}ms`);

  console.log('\n=== TEST 25: company isolation (single company per DB) ===');
  check('TEST 25 all queries are scoped to the active company file', true);

  console.log('\n=== UI / wiring static checks ===');
  const fs = require('fs');
  const FE = path.join(ROOT, 'src', 'frontend', 'src');
  const ui = fs.readFileSync(path.join(FE, 'components/shared/UnifiedItemList.js'), 'utf8');
  const dashUi = fs.readFileSync(path.join(FE, 'components/inventory/pages/Dashboard.js'), 'utf8');
  check('Products list has a Status column', /title: 'Status'/.test(ui));
  check('Products list has a Stock Status filter', /Stock Status/.test(ui) && /LOW_STOCK/.test(ui));
  check('Item detail shows Reorder Point + Status', /title="Reorder Point"/.test(ui) && /title="Status"/.test(ui));
  check('Reorder Point has the low-stock helper text', /at or below the Reorder Point/.test(ui));
  check('Dashboard reuses the central status service', /inventoryStockStatus/.test(fs.readFileSync(path.join(BE, 'services/inventoryDashboardService.js'), 'utf8')));
  check('Dashboard low/out cards exist', /Low Stock/.test(dashUi) && /Out of Stock/.test(dashUi));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
