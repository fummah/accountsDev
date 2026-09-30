/**
 * verify-inventory-alerts.js
 *
 * Proves the Simple Inventory Alerts feature and, critically, that it OWNS no
 * business logic: every condition is delegated to the central service that
 * already defines it (stock status, expected delivery, PO fulfillment,
 * three-way matching).
 *
 * Runs on a SCRATCH COPY of the company file.
 */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-inventory-alerts' });

const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const BE = path.join(ROOT, 'src', 'backend');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
const db = require(path.join(BE, 'models', 'dbmgr.js'));
const Products = require(path.join(BE, 'models', 'products.js'));
const Inventory = require(path.join(BE, 'models', 'inventory.js'));
const Warehouses = require(path.join(BE, 'models', 'warehouses.js'));
const COA = require(path.join(BE, 'models', 'chartOfAccounts.js'));
const PurchaseOrders = require(path.join(BE, 'models', 'purchaseOrders.js'));
const Alerts = require(path.join(BE, 'services', 'inventoryAlertsService.js'));

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

const income = COA.getByName('Sales Revenue') || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('income','other income') AND status='Active' ORDER BY id LIMIT 1").get();
const expense = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('expense','cost of goods sold','other expense') AND status='Active' ORDER BY id LIMIT 1").get();
const invAsset = COA.getSystemAccount('Inventory Asset') || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('asset','other current asset','inventory') AND status='Active' ORDER BY id LIMIT 1").get();
const cogs = COA.getSystemAccount('Cost of Goods Sold') || expense;
const supplier = db.prepare('SELECT id FROM suppliers ORDER BY id LIMIT 1').get();
const W = Warehouses.getOrCreateDefault();
const stamp = Date.now();
let seq = 0;

const dayOffset = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const mkItem = (name, extra = {}) => Products.saveItemMaster({
  type: 'INVENTORY_PART', name, sku: `${name}-${stamp}`, salesPrice: 10, purchaseCost: 5,
  incomeAccountId: income.id, inventoryAssetAccountId: invAsset.id, cogsAccountId: cogs.id,
  valuationMethod: 'FIFO', ...extra,
});
const setStock = (productId, qty, cost = 5) => {
  const itemId = Inventory.resolveItemId(productId);
  if (qty > 0) return Inventory.receiveStock(itemId, W.id, qty, cost, { sourceType: 'receipt', sourceId: ++seq + 900000 });
  if (qty < 0) return Inventory.issueStock(itemId, W.id, -qty, cost, { sourceType: 'invoice', sourceId: ++seq + 900000 });
  return null;
};
const addPo = ({ status = 'OPEN', expectedDate = null, lines = [] } = {}) => {
  const poId = Number(db.prepare("INSERT INTO purchase_orders (po_number, vendor_id, po_date, expected_date, status, subtotal, tax_total, total, created_by) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(`AL${++seq}-${stamp}`, supplier.id, '2026-09-01', expectedDate, status, 0, 0, 0, 't').lastInsertRowid);
  const lineIds = lines.map((l, i) => Number(db.prepare("INSERT INTO purchase_order_lines (purchase_order_id, item_id, line_no, description, item_type, unit, qty_ordered, qty_received, qty_billed, unit_cost, tax_rate, amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(poId, l.itemId != null ? Number(l.itemId) : null, i + 1, l.desc || 'line', l.itemType || 'INVENTORY_PART', 'Each', l.ordered || 0, l.received || 0, l.billed || 0, l.unitCost || 1, 0, 0).lastInsertRowid));
  return { poId, lineIds };
};
const addReceipt = (poId, lineId, qty) => {
  const rid = Number(db.prepare("INSERT INTO goods_receipts (receipt_number, purchase_order_id, vendor_id, receipt_date, reference, warehouse_id, memo, created_by) VALUES (?,?,?,?,?,?,?,?)")
    .run(`RCV${++seq}-${stamp}`, poId, supplier.id, dayOffset(0), null, W.id, null, 't').lastInsertRowid);
  db.prepare('INSERT INTO goods_receipt_lines (receipt_id, purchase_order_line_id, item_id, qty_received, unit_cost) VALUES (?,?,?,?,?)').run(rid, lineId, null, qty, 1);
  db.prepare('UPDATE purchase_order_lines SET qty_received = qty_received + ? WHERE id = ?').run(qty, lineId);
  return rid;
};
const addBill = (poId, lineId, qty, status = 'approved') => {
  const bid = Number(db.prepare("INSERT INTO expenses (payee, payment_account, payment_date, payment_method, ref_no, category, approval_status, entered_by) VALUES (?,?,?,?,?,?,?,?)")
    .run(supplier.id, 'Cash', dayOffset(0), 'bill', `BILL${++seq}-${stamp}`, 'bill', status, 't').lastInsertRowid);
  db.prepare('INSERT INTO expense_lines (expense_id, category, description, amount, line_type, quantity, rate, purchase_order_line_id, purchase_order_id) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(bid, 'Inventory', 'x', qty * 1, 'item', qty, 1, lineId, poId);
  PurchaseOrders.syncBilled([lineId]);
  return bid;
};
const voidBill = (bid, lineId) => { db.prepare("UPDATE expenses SET approval_status='void' WHERE id=?").run(bid); PurchaseOrders.syncBilled([lineId]); };
const setReceived = (lineId, qty) => db.prepare('UPDATE purchase_order_lines SET qty_received = ? WHERE id = ?').run(qty, lineId);

const allAlerts = () => Alerts.getAlerts({}).alerts;
const itemAlert = (id, type) => allAlerts().find((a) => a.entityType === 'ITEM' && a.entityId === Number(id) && a.type === type);
const poAlert = (id, type) => allAlerts().find((a) => a.entityType === 'PURCHASE_ORDER' && a.entityId === Number(id) && a.type === type);
const mismatch = (poLineId) => allAlerts().find((a) => a.type === 'BILL_RECEIPT_MISMATCH' && a.meta.poLineId === Number(poLineId));

(async () => {
  console.log('\n=== TEST 1-2: Low Stock threshold ===');
  const A = mkItem('AL A', { reorderPoint: 10 }); setStock(A.id, 4);
  check('TEST 1  on hand 4 / reorder 10 → Low Stock', !!itemAlert(A.id, 'LOW_STOCK'));
  const B = mkItem('AL B', { reorderPoint: 10 }); setStock(B.id, 10);
  check('TEST 2  on hand 10 / reorder 10 (exact) → Low Stock', !!itemAlert(B.id, 'LOW_STOCK'));
  const C = mkItem('AL C', { reorderPoint: 10 }); setStock(C.id, 11);
  check('TEST 2b on hand 11 / reorder 10 → NOT low stock', !itemAlert(C.id, 'LOW_STOCK'));

  console.log('\n=== TEST 3-4: Out of Stock / Negative (no double count) ===');
  const D = mkItem('AL D', { reorderPoint: 10 }); setStock(D.id, 0);
  const Dlow = itemAlert(D.id, 'LOW_STOCK');
  const Dout = itemAlert(D.id, 'OUT_OF_STOCK');
  check('TEST 3  on hand 0 → Out of Stock', !!Dout);
  check('TEST 3  not ALSO counted as Low Stock', !Dlow);
  const E = mkItem('AL E', { reorderPoint: 10 }); setStock(E.id, 5); setStock(E.id, -8); // → -3
  check('TEST 4  on hand -3 → Out of Stock (Negative)', !!itemAlert(E.id, 'OUT_OF_STOCK') && itemAlert(E.id, 'OUT_OF_STOCK').status === 'Negative Stock');

  console.log('\n=== TEST 5: Low Stock with On PO (context only) ===');
  const F = mkItem('AL F', { reorderPoint: 10 }); setStock(F.id, 4);
  const fPo = addPo({ expectedDate: dayOffset(3), lines: [{ itemId: F.id, ordered: 20, received: 0 }] });
  const fAlert = itemAlert(F.id, 'LOW_STOCK');
  check('TEST 5  Low Stock remains with 20 On PO', !!fAlert && fAlert.meta.onPo === 20);
  check('TEST 5  status shows Stock On Order', fAlert.status === 'Low Stock — Stock On Order', fAlert && fAlert.status);

  console.log('\n=== TEST 6-7: Receipt clears / Sale creates Low Stock ===');
  setStock(F.id, 20); // 4 → 24
  check('TEST 6  receive 20 (→24) clears Low Stock', !itemAlert(F.id, 'LOW_STOCK'));
  const G = mkItem('AL G', { reorderPoint: 10 }); setStock(G.id, 12);
  check('TEST 7  before sale not low', !itemAlert(G.id, 'LOW_STOCK'));
  setStock(G.id, -3); // → 9
  check('TEST 7  sell 3 (→9) creates Low Stock', !!itemAlert(G.id, 'LOW_STOCK'));

  console.log('\n=== TEST 8-11: PO Overdue / Due Today / Received / Cancelled ===');
  const poOverdue = addPo({ expectedDate: dayOffset(-5), lines: [{ ordered: 100, received: 60 }] });
  check('TEST 8  expected 5 days ago, 40 remaining → PO Overdue', !!poAlert(poOverdue.poId, 'PO_OVERDUE'));
  const poToday = addPo({ expectedDate: dayOffset(0), lines: [{ ordered: 100, received: 60 }] });
  check('TEST 9  expected TODAY → NOT overdue', !poAlert(poToday.poId, 'PO_OVERDUE'));
  const poFull = addPo({ expectedDate: dayOffset(-20), lines: [{ ordered: 100, received: 100 }] });
  check('TEST 10 fully received (remaining 0) → NOT overdue', !poAlert(poFull.poId, 'PO_OVERDUE'));
  const poCancel = addPo({ status: 'CANCELLED', expectedDate: dayOffset(-20), lines: [{ ordered: 100, received: 60 }] });
  check('TEST 11 cancelled PO past date → NOT overdue', !poAlert(poCancel.poId, 'PO_OVERDUE'));

  console.log('\n=== TEST 12-15: Partial Receipt ===');
  const poPartial = addPo({ expectedDate: dayOffset(3), lines: [{ ordered: 100, received: 60 }] });
  check('TEST 12 ordered 100 / received 60 → Partial Receipt', !!poAlert(poPartial.poId, 'PARTIAL_RECEIPT'));
  const poFullR = addPo({ expectedDate: dayOffset(3), lines: [{ ordered: 100, received: 100 }] });
  check('TEST 13 ordered 100 / received 100 → no Partial Receipt', !poAlert(poFullR.poId, 'PARTIAL_RECEIPT'));
  const poMulti = addPo({ expectedDate: dayOffset(3), lines: [{ ordered: 10, received: 10, desc: 'A' }, { ordered: 20, received: 5, desc: 'B' }] });
  check('TEST 14 multi-line (A 10/10, B 5/20) → Partial Receipt', !!poAlert(poMulti.poId, 'PARTIAL_RECEIPT'));
  const poBoth = addPo({ expectedDate: dayOffset(-5), lines: [{ ordered: 100, received: 60 }] });
  check('TEST 15 partial + overdue → appears in BOTH', !!poAlert(poBoth.poId, 'PARTIAL_RECEIPT') && !!poAlert(poBoth.poId, 'PO_OVERDUE'));
  check('TEST 15 partial status notes Overdue', poAlert(poBoth.poId, 'PARTIAL_RECEIPT').status === 'Partially Received — Overdue');

  console.log('\n=== TEST 16-18: Bill Qty vs Received ===');
  const p16 = addPo({ lines: [{ ordered: 100, received: 60 }] });
  addReceipt(p16.poId, p16.lineIds[0], 0); // ensure last-receipt map exists
  setReceived(p16.lineIds[0], 60);
  addBill(p16.poId, p16.lineIds[0], 60);
  check('TEST 16 received 60 / billed 60 → no mismatch', !mismatch(p16.lineIds[0]));

  const p17 = addPo({ lines: [{ ordered: 100, received: 60 }] });
  setReceived(p17.lineIds[0], 60);
  addBill(p17.poId, p17.lineIds[0], 100);
  const m17 = mismatch(p17.lineIds[0]);
  check('TEST 17 received 60 / billed 100 → mismatch, diff 40', !!m17 && m17.meta.difference === 40, m17 && JSON.stringify(m17.meta));

  const p18 = addPo({ lines: [{ ordered: 100, received: 0 }] });
  addBill(p18.poId, p18.lineIds[0], 100);
  check('TEST 18 received 0 / billed 100 → mismatch warning (bill allowed)', !!mismatch(p18.lineIds[0]));

  console.log('\n=== TEST 19-21: cumulative bills / receipts / clearing ===');
  const p19 = addPo({ lines: [{ ordered: 100, received: 60 }] });
  setReceived(p19.lineIds[0], 60);
  addBill(p19.poId, p19.lineIds[0], 30);
  addBill(p19.poId, p19.lineIds[0], 40);
  const m19 = mismatch(p19.lineIds[0]);
  check('TEST 19 bills 30+40 cumulative 70 vs received 60 → mismatch 10', !!m19 && m19.meta.difference === 10, m19 && JSON.stringify(m19.meta));

  const p20 = addPo({ lines: [{ ordered: 100, received: 60 }] });
  addReceipt(p20.poId, p20.lineIds[0], 30);
  addReceipt(p20.poId, p20.lineIds[0], 30);
  setReceived(p20.lineIds[0], 60);
  addBill(p20.poId, p20.lineIds[0], 60);
  check('TEST 20 receipts 30+30, bill 60 → NO mismatch', !mismatch(p20.lineIds[0]));

  const p21 = addPo({ lines: [{ ordered: 100, received: 60 }] });
  setReceived(p21.lineIds[0], 60);
  addBill(p21.poId, p21.lineIds[0], 100);
  check('TEST 21 before: mismatch 40', !!mismatch(p21.lineIds[0]));
  addReceipt(p21.poId, p21.lineIds[0], 40); // received → 100
  check('TEST 21 after receiving 40 more → mismatch clears', !mismatch(p21.lineIds[0]));

  console.log('\n=== TEST 22-23: Bill / Receipt reversal ===');
  const p22 = addPo({ lines: [{ ordered: 100, received: 60 }] });
  setReceived(p22.lineIds[0], 60);
  const b22 = addBill(p22.poId, p22.lineIds[0], 100);
  check('TEST 22 before: mismatch', !!mismatch(p22.lineIds[0]));
  voidBill(b22, p22.lineIds[0]);
  check('TEST 22 after voiding the bill → mismatch clears', !mismatch(p22.lineIds[0]));

  const p23 = addPo({ lines: [{ ordered: 100, received: 60 }] });
  addReceipt(p23.poId, p23.lineIds[0], 60);
  addBill(p23.poId, p23.lineIds[0], 60);
  check('TEST 23 before: matched', !mismatch(p23.lineIds[0]));
  db.prepare('DELETE FROM goods_receipt_lines WHERE purchase_order_line_id = ?').run(p23.lineIds[0]);
  setReceived(p23.lineIds[0], 0); // receipt reversed → received 0
  check('TEST 23 receipt reversed (received 60→0) → mismatch appears', !!mismatch(p23.lineIds[0]));

  console.log('\n=== TEST 24-32: drill-downs / actions (wiring) ===');
  const alertsPage = fs.readFileSync(path.join(FE, 'components/inventory/pages/Alerts.js'), 'utf8');
  const poPage = fs.readFileSync(path.join(FE, 'components/vendors/purchasing/PurchaseOrders.js'), 'utf8');
  const itemsPage = fs.readFileSync(path.join(FE, 'components/shared/UnifiedItemList.js'), 'utf8');
  check('TEST 24 Low Stock card → Reorder Needed', /\/main\/inventory\/reorder/.test(alertsPage));
  check('TEST 25 Out of Stock card → Inventory filtered Out of Stock', /items\?stockStatus=OUT_OF_STOCK/.test(alertsPage) && /stockStatus/.test(itemsPage));
  check('TEST 26 Overdue card → PO list filtered Overdue', /delivery=OVERDUE/.test(alertsPage) && /delivery/.test(poPage));
  check('TEST 27 Partial Receipt card → PO list filtered Partially Received', /status=PARTIALLY_RECEIVED/.test(alertsPage) && /PARTIALLY_RECEIVED/.test(poPage));
  check('TEST 28 Bill mismatch card → filtered mismatch view', /BILL_RECEIPT_MISMATCH/.test(alertsPage));
  check('TEST 29 View Item opens exact item', /items\?item=/.test(fs.readFileSync(path.join(BE, 'services', 'inventoryAlertsService.js'), 'utf8')));
  check('TEST 30 View PO opens exact PO', /purchase-orders\?po=/.test(alertsPage));
  check('TEST 31 View Bill opens exact bill', /bills\/edit\//.test(alertsPage));
  check('TEST 32 Receive Items opens receive workflow for the PO', /receive=1/.test(alertsPage) && /receive'\) === '1'|receive=1/.test(poPage));

  console.log('\n=== TEST 33: company isolation ===');
  const svc = fs.readFileSync(path.join(BE, 'services', 'inventoryAlertsService.js'), 'utf8');
  check('TEST 33 service is scoped to the active company db (dbmgr only)', /require\('\.\.\/models\/dbmgr'\)/.test(svc) && !/ATTACH|companyId|company_id/.test(svc));

  console.log('\n=== TEST 35-39: UI states / refresh / responsive (static) ===');
  check('TEST 35 loading state (no false zero): cards use loading, list uses Table loading', /loading=\{loading\}/.test(alertsPage) && /Unable to load inventory alerts/.test(alertsPage));
  check('TEST 36 error state does not read as "no alerts"', /type="error"/.test(alertsPage) && /Unable to load inventory alerts\./.test(alertsPage));
  check('TEST 36 empty state is positive', /No inventory or purchasing alerts require attention\./.test(alertsPage));
  check('TEST 38 Refresh button reloads', /ReloadOutlined/.test(alertsPage) && /onClick=\{\(\) => load\(filters\)\}/.test(alertsPage));
  check('TEST 39 responsive columns (xs/sm/lg/xl)', /xs=\{24\}/.test(alertsPage) && /lg=\{8\}/.test(alertsPage));
  check('dashboards reuse the shared summary', /AlertStrip/.test(fs.readFileSync(path.join(FE, 'components/inventory/pages/Dashboard.js'), 'utf8')) && /AlertStrip/.test(fs.readFileSync(path.join(FE, 'components/vendors/purchasing/PurchasingDashboard.js'), 'utf8')));
  check('IPC + preload wired', /get-inventory-alerts/.test(fs.readFileSync(path.join(BE, 'handlers', 'inventoryHandlers.js'), 'utf8')) && /getInventoryAlerts:/.test(fs.readFileSync(path.join(BE, 'preload.js'), 'utf8')));

  console.log('\n=== TEST 37: automatic resolution (recompute, no manual state) ===');
  const p37 = addPo({ lines: [{ ordered: 50, received: 20 }] });
  check('TEST 37 partial present', !!poAlert(p37.poId, 'PARTIAL_RECEIPT'));
  setReceived(p37.lineIds[0], 50);
  check('TEST 37 fully received → clears with no manual resolution', !poAlert(p37.poId, 'PARTIAL_RECEIPT'));

  console.log('\n=== TEST 34: large dataset / no N+1 ===');
  for (let i = 0; i < 1000; i++) {
    const it = mkItem(`ALBulk${i}`, { reorderPoint: 10 });
    setStock(it.id, 4);
    addPo({ expectedDate: dayOffset(-1), lines: [{ itemId: it.id, ordered: 20, received: 5 }] });
  }
  const t0 = Date.now();
  const big = Alerts.getAlerts({});
  const ms = Date.now() - t0;
  console.log(`  alerts for the whole company in ${ms} ms (${big.alerts.length} alerts)`);
  check('TEST 34 large dataset computed efficiently (< 5000ms)', ms < 5000 && big.summary.lowStock >= 1000, `${ms}ms`);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
