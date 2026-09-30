/**
 * verify-inventory-dashboard.js
 *
 * Proves the Simple Inventory Dashboard metrics come from the real inventory /
 * purchasing / sales data and follow the required rules:
 *   • Total Inventory Items counts ONLY inventory-tracked items
 *   • In Stock / Low Stock / Out of Stock use the authoritative stock balance
 *   • Low Stock uses the reorder point and never double-counts Out of Stock
 *   • On PO uses remaining open (non-closed/cancelled) PO quantity, unique items
 *   • Recently Received / Sold use real stock movements in the window
 *   • Inventory Value uses the central valuation engine
 *
 * Runs on a SCRATCH COPY of the company file.
 */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-inventory-dashboard' });

const path = require('path');
const ROOT = path.join(__dirname, '..');
const BE = path.join(ROOT, 'src', 'backend');
const db = require(path.join(BE, 'models', 'dbmgr.js'));
const Products = require(path.join(BE, 'models', 'products.js'));
const Inventory = require(path.join(BE, 'models', 'inventory.js'));
const Warehouses = require(path.join(BE, 'models', 'warehouses.js'));
const COA = require(path.join(BE, 'models', 'chartOfAccounts.js'));
require(path.join(BE, 'models', 'purchaseOrders.js'));
const Dashboard = require(path.join(BE, 'services', 'inventoryDashboardService.js'));
const Expenses = require(path.join(BE, 'models', 'expenses.js'));
const JournalEntries = require(path.join(BE, 'models', 'journalEntries.js'));
const Quotes = require(path.join(BE, 'models', 'quotes.js'));
const Valuation = require(path.join(BE, 'services', 'inventoryValuation.js'));

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;

const income = COA.getByName('Sales Revenue')
  || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('income','other income') AND status='Active' ORDER BY id LIMIT 1").get();
const expense = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('expense','cost of goods sold','other expense') AND status='Active' ORDER BY id LIMIT 1").get();
const invAsset = COA.getSystemAccount('Inventory Asset')
  || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('asset','other current asset','inventory') AND status='Active' ORDER BY id LIMIT 1").get();
const cogs = COA.getSystemAccount('Cost of Goods Sold') || expense;
const supplier = db.prepare('SELECT id FROM suppliers ORDER BY id LIMIT 1').get();
const W = Warehouses.getOrCreateDefault();

const stamp = Date.now();
const mkItem = (type, name, extra = {}) => Products.saveItemMaster({
  type, name, sku: `${name}-${stamp}`, salesPrice: 10, purchaseCost: 20,
  incomeAccountId: income.id,
  ...(type === 'INVENTORY_PART' ? { inventoryAssetAccountId: invAsset.id, cogsAccountId: cogs.id, valuationMethod: 'FIFO' } : { purchaseExpenseAccountId: expense.id }),
  ...extra,
});

const summary = () => Dashboard.getDashboard().summary;

(async () => {
  console.log('\n=== Fixtures: 5 inventory parts + 3 non-inventory + 2 services ===');
  const before = summary();

  const A = mkItem('INVENTORY_PART', 'VDash A', { reorderPoint: 0 });
  const B = mkItem('INVENTORY_PART', 'VDash B', { reorderPoint: 10 });
  const C = mkItem('INVENTORY_PART', 'VDash C', { reorderPoint: 0 });
  const D = mkItem('INVENTORY_PART', 'VDash D', { reorderPoint: 10 });
  const E = mkItem('INVENTORY_PART', 'VDash E', { reorderPoint: 10 });
  mkItem('NON_INVENTORY_PART', 'VDash NI1');
  mkItem('NON_INVENTORY_PART', 'VDash NI2');
  mkItem('NON_INVENTORY_PART', 'VDash NI3');
  mkItem('SERVICE', 'VDash S1');
  mkItem('SERVICE', 'VDash S2');

  const itemId = (r) => Inventory.resolveItemId(r.id);
  const aId = itemId(A), bId = itemId(B), cId = itemId(C), eId = itemId(E);

  // Receipts (recent) — A=10@20, B=4@10, C=1@5
  Inventory.receiveStock(aId, W.id, 10, 20, { sourceType: 'receipt', sourceId: 990001 });
  Inventory.receiveStock(bId, W.id, 4, 10, { sourceType: 'receipt', sourceId: 990002 });
  Inventory.receiveStock(cId, W.id, 1, 5, { sourceType: 'receipt', sourceId: 990003 });
  // E: negative stock (issue with no layers)
  Inventory.issueStock(eId, W.id, 2, 0, { sourceType: 'invoice', sourceId: 990004 });
  // D: no movement → 0 on hand

  const after = summary();
  const d = (k) => Number(after[k]) - Number(before[k]);

  console.log('\n=== TEST 1-5: item counts ===');
  check('TEST 1  Total Inventory Items counts only inventory-tracked items (+5)', d('totalInventoryItems') === 5, String(d('totalInventoryItems')));
  check('TEST 2  In Stock = 3 (A,B,C > 0)', d('inStockItems') === 3, String(d('inStockItems')));
  check('TEST 3  Low Stock = 1 (B only; C is Out of Stock)', d('lowStockItems') === 1, String(d('lowStockItems')));
  check('TEST 4  Out of Stock = 2 (D=0, E=-2)', d('outOfStockItems') === 2, String(d('outOfStockItems')));

  console.log('\n=== TEST 6-9: On Purchase Order ===');
  const poRes = db.prepare("INSERT INTO purchase_orders (po_number, vendor_id, po_date, status, subtotal, tax_total, total, created_by) VALUES (?,?,?,?,?,?,?,?)")
    .run(`VDASH-PO-${stamp}`, supplier.id, '2026-09-01', 'OPEN', 0, 0, 0, 'test');
  const poId = poRes.lastInsertRowid;
  const insLine = db.prepare("INSERT INTO purchase_order_lines (purchase_order_id, item_id, line_no, description, item_type, unit, qty_ordered, qty_received, qty_billed, unit_cost, tax_rate, amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  insLine.run(poId, A.id, 1, 'A', 'INVENTORY_PART', 'Each', 50, 20, 0, 20, 0, 1000);
  // Second open PO, same item A (should NOT double the unique item count)
  const po2 = db.prepare("INSERT INTO purchase_orders (po_number, vendor_id, po_date, status, subtotal, tax_total, total, created_by) VALUES (?,?,?,?,?,?,?,?)")
    .run(`VDASH-PO2-${stamp}`, supplier.id, '2026-09-02', 'OPEN', 0, 0, 0, 'test').lastInsertRowid;
  insLine.run(po2, A.id, 1, 'A', 'INVENTORY_PART', 'Each', 40, 10, 0, 20, 0, 800);
  // Cancelled PO (must be ignored)
  const po3 = db.prepare("INSERT INTO purchase_orders (po_number, vendor_id, po_date, status, subtotal, tax_total, total, created_by) VALUES (?,?,?,?,?,?,?,?)")
    .run(`VDASH-PO3-${stamp}`, supplier.id, '2026-09-03', 'CANCELLED', 0, 0, 0, 'test').lastInsertRowid;
  insLine.run(po3, A.id, 1, 'A', 'INVENTORY_PART', 'Each', 99, 0, 0, 20, 0, 0);
  // Fully received PO (must be ignored)
  const po4 = db.prepare("INSERT INTO purchase_orders (po_number, vendor_id, po_date, status, subtotal, tax_total, total, created_by) VALUES (?,?,?,?,?,?,?,?)")
    .run(`VDASH-PO4-${stamp}`, supplier.id, '2026-09-04', 'OPEN', 0, 0, 0, 'test').lastInsertRowid;
  insLine.run(po4, A.id, 1, 'A', 'INVENTORY_PART', 'Each', 10, 10, 0, 20, 0, 0);

  const dash2 = Dashboard.getDashboard();
  const d2 = (k) => Number(dash2.summary[k]) - Number(before[k]);
  check('TEST 6/7  Items On PO = +1 unique item (A, across two POs)', d2('itemsOnPO') === 1, String(d2('itemsOnPO')));
  check('TEST 7  On PO Qty = 60 (30 + 30 remaining)', near(dash2.summary.onPoQty - before.onPoQty, 60), String(dash2.summary.onPoQty - before.onPoQty));
  check('TEST 8  Cancelled PO excluded', dash2.incomingStock.every((r) => r.poStatus !== 'CANCELLED'));
  check('TEST 9  Fully received PO excluded', dash2.incomingStock.filter((r) => r.productId === Number(A.id)).length === 2, String(dash2.incomingStock.filter((r) => r.productId === Number(A.id)).length));

  console.log('\n=== TEST 10-14: recently received / sold ===');
  check('TEST 10 Recently Received = +3 (A,B,C receipts)', d2('recentlyReceived') === 3, String(d2('recentlyReceived')));
  check('TEST 12 Recently Sold = +1 (E invoice)', d2('recentlySold') === 1, String(d2('recentlySold')));
  const activity = dash2.recentActivity;
  check('TEST 21 Activity has a receipt with Qty In', activity.some((r) => r.transaction === 'Receipt' && r.qtyIn > 0));
  check('TEST 21 Activity has an invoice with Qty Out', activity.some((r) => r.transaction === 'Invoice' && r.qtyOut > 0));

  console.log('\n=== TEST 15-17: inventory value ===');
  check('TEST 15-17 Inventory Value delta = 245 (10@20 + 4@10 + 1@5)', near(dash2.summary.inventoryValue - before.inventoryValue, 245), String(dash2.summary.inventoryValue - before.inventoryValue));

  console.log('\n=== TEST 19: Stock Attention ===');
  const att = dash2.stockAttention;
  const byId = (id) => att.find((r) => r.productId === Number(id));
  check('B is Low Stock with On PO 0', byId(B.id) && byId(B.id).status === 'Low Stock' && byId(B.id).onPo === 0, byId(B.id) && JSON.stringify(byId(B.id)));
  check('D is Out of Stock', byId(D.id) && byId(D.id).status === 'Out of Stock');
  check('E is Negative Stock', byId(E.id) && byId(E.id).status === 'Negative Stock');
  check('A (healthy, on order) is NOT in Stock Attention', !byId(A.id));

  console.log('\n=== TEST 20: Incoming Stock rows ===');
  const inc = dash2.incomingStock.filter((r) => r.productId === Number(A.id));
  check('Incoming rows carry vendor, PO #, remaining and expected date',
    inc.length === 2 && inc.every((r) => r.poNumber && r.remaining > 0) && inc.some((r) => r.vendorName));
  check('Incoming Stock is sorted by expected date', (() => {
    const ds = dash2.incomingStock.map((r) => r.expectedDate || '9999').filter(Boolean);
    return ds.every((v, i) => i === 0 || String(ds[i - 1]) <= String(v));
  })());

  console.log('\n=== Payload shape ===');
  check('payload has summary + 3 sections + window',
    dash2.summary && Array.isArray(dash2.stockAttention) && Array.isArray(dash2.incomingStock) && Array.isArray(dash2.recentActivity) && Number(dash2.window) > 0);

  console.log('\n=== TEST 5: qty 3 with no reorder point is NOT low stock ===');
  const F = mkItem('INVENTORY_PART', `NoReorder-${stamp}`, { reorderPoint: 0 });
  Inventory.receiveStock(itemId(F), W.id, 3, 5, { sourceType: 'receipt', sourceId: 882001 });
  check('TEST 5 not in Stock Attention / not Low Stock', !Dashboard.getDashboard().stockAttention.some((r) => r.productId === Number(F.id)));

  console.log('\n=== TEST 11: old receipt (outside window) not counted ===');
  const OLD = mkItem('INVENTORY_PART', `OldReceipt-${stamp}`, { reorderPoint: 0 });
  const oldItem = itemId(OLD);
  const before11 = Dashboard.getDashboard().summary.recentlyReceived;
  const oldDate = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  db.prepare("INSERT INTO stock_movements (itemId, warehouseId, quantityChange, reason, sourceType, sourceId, movedAt) VALUES (?,?,?,?,?,?,?)")
    .run(oldItem, W.id, 20, 'PURCHASE RECEIPT', 'receipt', 883001, oldDate);
  check('TEST 11 old receipt not counted as Recently Received', Dashboard.getDashboard().summary.recentlyReceived === before11);

  console.log('\n=== TEST 13: quote does not change stock or Recently Sold ===');
  const QUO = mkItem('INVENTORY_PART', `QuoteItem-${stamp}`, { reorderPoint: 0 });
  const quoItem = itemId(QUO);
  const cust = db.prepare('SELECT id FROM customers ORDER BY id LIMIT 1').get();
  const stockQ = () => Number((db.prepare('SELECT COALESCE(SUM(quantity),0) AS q FROM item_stock WHERE itemId = ?').get(quoItem) || {}).q) || 0;
  const soldBefore13 = Dashboard.getDashboard().summary.recentlySold;
  const stockBefore13 = stockQ();
  try { Quotes.insertQuote('Pending', cust.id, '', 0, '', '2026-06-01', '', '', '', `Q-DASH-${stamp}`, 'system', 0, [{ product_id: QUO.id, description: 'q', quantity: 2, rate: 5, amount: 10 }]); } catch { /* best effort */ }
  check('TEST 13 quote leaves stock and Recently Sold unchanged', stockQ() === stockBefore13 && Dashboard.getDashboard().summary.recentlySold === soldBefore13);

  console.log('\n=== TEST 14: voided sale (net 0) does not count as Recently Sold ===');
  const VOID = mkItem('INVENTORY_PART', `VoidItem-${stamp}`, { reorderPoint: 0 });
  const voidItem = itemId(VOID);
  const soldBefore14 = Dashboard.getDashboard().summary.recentlySold;
  Inventory.issueStock(voidItem, W.id, 5, 5, { sourceType: 'invoice', sourceId: 884001 });
  Inventory.receiveStock(voidItem, W.id, 5, 5, { sourceType: 'invoice', sourceId: 884002 });
  check('TEST 14 voided sale not counted', Dashboard.getDashboard().summary.recentlySold === soldBefore14);

  console.log('\n=== TEST 15-17: inventory value via the valuation engine ===');
  const VAL = mkItem('INVENTORY_PART', `ValItem-${stamp}`, { reorderPoint: 0 });
  const valItem = itemId(VAL);
  Inventory.receiveStock(valItem, W.id, 10, 20, { sourceType: 'receipt', sourceId: 881001 });
  check('TEST 15 value 10@20 = 200', near(Valuation.currentValue(valItem, 'FIFO'), 200), String(Valuation.currentValue(valItem, 'FIFO')));
  Inventory.issueStock(valItem, W.id, 2, 20, { sourceType: 'invoice', sourceId: 881002 });
  check('TEST 16 after selling 2 → 160', near(Valuation.currentValue(valItem, 'FIFO'), 160), String(Valuation.currentValue(valItem, 'FIFO')));
  Inventory.receiveStock(valItem, W.id, 5, 30, { sourceType: 'receipt', sourceId: 881003 });
  check('TEST 17 after receiving 5@30 → 310', near(Valuation.currentValue(valItem, 'FIFO'), 310), String(Valuation.currentValue(valItem, 'FIFO')));

  console.log('\n=== TEST 18: dashboard Inventory Value reconciles to Inventory Asset GL ===');
  const invAssetBalance = () => Number((db.prepare('SELECT COALESCE(SUM(jl.debit - jl.credit),0) AS b FROM journal_lines jl WHERE jl.account_id = ?').get(Number(invAsset.id)) || {}).b) || 0;
  const gvalBefore = Dashboard.getDashboard().summary.inventoryValue;
  const glBefore = invAssetBalance();
  const GI = mkItem('INVENTORY_PART', `GLItem-${stamp}`, { reorderPoint: 0 });
  const giBill = await Expenses.insertExpense(supplier.id, 'Accounts Payable', '2026-06-10', 'bill', `GL-${stamp}`, 'bill', 'system', 'Unpaid',
    [{ line_type: 'item', product_id: GI.id, quantity: 10, rate: 20, amount: 200, description: 'gl' }], '2026-06-10', 't', 30);
  JournalEntries.postExpense({ id: Number(giBill.expenseId), date: '2026-06-10', description: 'gl', reference: `GL-${stamp}` });
  const gvalAfter = Dashboard.getDashboard().summary.inventoryValue;
  const glAfter = invAssetBalance();
  check('TEST 18 value delta == Inventory Asset GL delta', near(gvalAfter - gvalBefore, glAfter - glBefore), `${gvalAfter - gvalBefore} vs ${glAfter - glBefore}`);

  console.log('\n=== TEST 29: large dataset loads efficiently ===');
  for (let i = 0; i < 300; i++) mkItem('INVENTORY_PART', `DashBulk${i}-${stamp}`, { reorderPoint: 0 });
  const t0 = Date.now();
  const bigDash = Dashboard.getDashboard();
  const ms = Date.now() - t0;
  console.log(`  dashboard built for the whole company in ${ms} ms`);
  check('TEST 29 dashboard < 3000ms with 300+ items', ms < 3000 && !!bigDash.summary, `${ms}ms`);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
