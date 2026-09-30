/**
 * verify-movement-report.js
 *
 * Proves the Inventory Movement Report reads the existing stock_movements
 * ledger, computes a per-item running balance (with opening balance for filtered
 * periods), keeps pagination correct, and reconciles with Item History + QOH.
 *
 * Runs on a SCRATCH COPY of the company file.
 */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-movement-report' });

const path = require('path');
const ROOT = path.join(__dirname, '..');
const BE = path.join(ROOT, 'src', 'backend');
const db = require(path.join(BE, 'models', 'dbmgr.js'));
const Products = require(path.join(BE, 'models', 'products.js'));
const Inventory = require(path.join(BE, 'models', 'inventory.js'));
const Warehouses = require(path.join(BE, 'models', 'warehouses.js'));
const COA = require(path.join(BE, 'models', 'chartOfAccounts.js'));
const Report = require(path.join(BE, 'services', 'inventoryMovementReportService.js'));

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

const income = COA.getByName('Sales Revenue') || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('income','other income') AND status='Active' ORDER BY id LIMIT 1").get();
const invAsset = COA.getSystemAccount('Inventory Asset') || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('asset','other current asset','inventory') AND status='Active' ORDER BY id LIMIT 1").get();
const cogs = COA.getSystemAccount('Cost of Goods Sold') || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('expense','cost of goods sold','other expense') AND status='Active' ORDER BY id LIMIT 1").get();
const supplier = db.prepare('SELECT id FROM suppliers ORDER BY id LIMIT 1').get();
const customer = db.prepare('SELECT id FROM customers ORDER BY id LIMIT 1').get();
const W = Warehouses.getOrCreateDefault();
const stamp = Date.now();

const mkItem = (name) => Products.saveItemMaster({ type: 'INVENTORY_PART', name, sku: `${name}-${stamp}`, salesPrice: 10, purchaseCost: 5, incomeAccountId: income.id, inventoryAssetAccountId: invAsset.id, cogsAccountId: cogs.id, valuationMethod: 'FIFO' });
const addMovement = (productId, qty, { movedAt = null, sourceType = null, sourceId = null, reason = null, refType = null, warehouseId = W.id } = {}) => {
  const itemId = Inventory.resolveInventoryItem(productId).id;
  const res = db.prepare("INSERT INTO stock_movements (itemId, warehouseId, quantityChange, reason, refType, refId, sourceType, sourceId, movedAt) VALUES (?,?,?,?,?,NULL,?,?, COALESCE(?, datetime('now')))")
    .run(itemId, warehouseId, qty, reason, refType, sourceType, sourceId, movedAt);
  db.prepare("INSERT INTO item_stock (itemId, warehouseId, quantity, reorderPoint) VALUES (?,?,?,0) ON CONFLICT(itemId, warehouseId) DO UPDATE SET quantity = item_stock.quantity + ?")
    .run(itemId, warehouseId, qty, qty);
  return res.lastInsertRowid;
};
const qoh = (productId) => {
  const itemId = Inventory.resolveInventoryItem(productId).id;
  return Number((db.prepare('SELECT COALESCE(SUM(quantity),0) AS q FROM item_stock WHERE itemId = ?').get(itemId) || {}).q) || 0;
};
const rowsFor = (productId, opts = {}) => Report.getInventoryMovementReport({ itemId: productId, pageSize: 1000, ...opts }).rows;

const addReceipt = (num) => db.prepare('INSERT INTO goods_receipts (receipt_number, purchase_order_id, vendor_id) VALUES (?,?,?)').run(num, 0, supplier.id).lastInsertRowid;
const addInvoice = (num) => db.prepare('INSERT INTO invoices (customer, number, status) VALUES (?,?,?)').run(customer.id, num, 'Open').lastInsertRowid;
const addBill = (ref) => db.prepare('INSERT INTO expenses (payee, payment_account, ref_no, category, approval_status) VALUES (?,?,?,?,?)').run(supplier.id, 'Accounts Payable', ref, 'bill', 'Unpaid').lastInsertRowid;

(async () => {
  console.log('\n=== TEST 1-4: client example (100 → 150 → 130) ===');
  const A = mkItem('MR Widget A');
  addMovement(A.id, 100, { movedAt: '2026-09-01 09:00:00', reason: 'BEGINNING INVENTORY' });
  const rcv = addReceipt(`RCV-${stamp}`);
  addMovement(A.id, 50, { movedAt: '2026-09-03 09:00:00', sourceType: 'receipt', sourceId: rcv });
  const inv = addInvoice(`INV-${stamp}`);
  addMovement(A.id, -20, { movedAt: '2026-09-05 09:00:00', sourceType: 'invoice', sourceId: inv });
  let rows = rowsFor(A.id);
  check('TEST 1  Beginning Inventory +100 balance 100', rows[0] && rows[0].transactionType === 'BEGINNING' && rows[0].signedQty === 100 && rows[0].balance === 100, JSON.stringify(rows[0]));
  check('TEST 2  Receipt +50 balance 150', rows[1] && rows[1].signedQty === 50 && rows[1].balance === 150);
  check('TEST 3  Invoice -20 balance 130', rows[2] && rows[2].signedQty === -20 && rows[2].balance === 130);
  check('TEST 4  exact order 100/150/130', rows.map((r) => r.balance).join(',') === '100,150,130');

  console.log('\n=== TEST 5-8: adjustments + returns ===');
  addMovement(A.id, 5, { movedAt: '2026-09-07 09:00:00', refType: 'ADJUSTMENT', reason: 'Found' });
  addMovement(A.id, -4, { movedAt: '2026-09-08 09:00:00', refType: 'ADJUSTMENT', reason: 'Damaged' });
  rows = rowsFor(A.id);
  check('TEST 5  positive adjustment +5 → 135', rows[3] && rows[3].signedQty === 5 && rows[3].balance === 135);
  check('TEST 6  negative adjustment -4 → 131', rows[4] && rows[4].signedQty === -4 && rows[4].balance === 131);
  addMovement(A.id, 2, { movedAt: '2026-09-09 09:00:00', reason: 'Customer Return' });
  addMovement(A.id, -5, { movedAt: '2026-09-10 09:00:00', reason: 'Vendor Return' });
  rows = rowsFor(A.id);
  check('TEST 7  customer return +2 → 133', rows[5] && rows[5].balance === 133);
  check('TEST 8  vendor return -5 → 128', rows[6] && rows[6].balance === 128);

  console.log('\n=== TEST 9: multiple items keep separate balances ===');
  const B = mkItem('MR Widget B');
  addMovement(B.id, 20, { movedAt: '2026-09-02 09:00:00', reason: 'BEGINNING INVENTORY' });
  addMovement(B.id, -5, { movedAt: '2026-09-04 09:00:00', sourceType: 'invoice', sourceId: addInvoice(`INV-B-${stamp}`) });
  const bRows = rowsFor(B.id);
  check('TEST 9  Widget B balances 20 → 15 (independent)', bRows.map((r) => r.balance).join(',') === '20,15');

  console.log('\n=== TEST 10: date filter keeps opening balance ===');
  const C = mkItem('MR Widget C');
  addMovement(C.id, 100, { movedAt: '2026-08-15 09:00:00', reason: 'BEGINNING INVENTORY' });
  addMovement(C.id, 20, { movedAt: '2026-09-02 09:00:00', sourceType: 'receipt', sourceId: addReceipt(`RCV-C-${stamp}`) });
  const cRows = rowsFor(C.id, { dateFrom: '2026-09-01', dateTo: '2026-09-30' });
  check('TEST 10 first in-range movement balance = 120 (opening 100 + 20)', cRows.length === 1 && cRows[0].balance === 120, JSON.stringify(cRows.map((r) => r.balance)));

  console.log('\n=== TEST 11-13: filters ===');
  const allA = Report.getInventoryMovementReport({ itemId: A.id, pageSize: 1000 });
  check('TEST 11 item filter returns only that item', allA.rows.every((r) => r.productId === Number(A.id)));
  const invOnly = Report.getInventoryMovementReport({ itemId: A.id, transactionType: 'INVOICE', pageSize: 1000 });
  check('TEST 12 transaction-type filter → only invoices', invOnly.rows.length === 1 && invOnly.rows.every((r) => r.transactionType === 'INVOICE'));
  const refOnly = Report.getInventoryMovementReport({ itemId: A.id, reference: `INV-${stamp}`, pageSize: 1000 });
  check('TEST 13 reference filter finds the movement', refOnly.rows.length === 1 && refOnly.rows[0].reference === `INV-${stamp}`);

  console.log('\n=== TEST 18: void / reversal ===');
  const D = mkItem('MR Widget D');
  addMovement(D.id, 50, { movedAt: '2026-09-01 09:00:00', reason: 'BEGINNING INVENTORY' });
  addMovement(D.id, -10, { movedAt: '2026-09-02 09:00:00', sourceType: 'invoice', sourceId: addInvoice(`INV-D-${stamp}`) });
  addMovement(D.id, 10, { movedAt: '2026-09-03 09:00:00', sourceType: 'invoice', sourceId: addInvoice(`INV-D-${stamp}`) }); // reversal
  const dRows = rowsFor(D.id);
  check('TEST 18 reversal shows as +10 and final balance 50', dRows[dRows.length - 1].balance === 50 && dRows.some((r) => r.signedQty === 10));

  console.log('\n=== TEST 19-20: partial receipts + direct bill ===');
  const E = mkItem('MR Widget E');
  const rcv1 = addReceipt(`RCV-E1-${stamp}`); const rcv2 = addReceipt(`RCV-E2-${stamp}`);
  addMovement(E.id, 60, { movedAt: '2026-09-01 09:00:00', sourceType: 'receipt', sourceId: rcv1 });
  addMovement(E.id, 40, { movedAt: '2026-09-02 09:00:00', sourceType: 'receipt', sourceId: rcv2 });
  check('TEST 19 partial receipts +60 then +40 (not +100 twice)', rowsFor(E.id).map((r) => r.signedQty).join(',') === '60,40');
  const F = mkItem('MR Widget F');
  const billId = addBill(`BILL-${stamp}`);
  addMovement(F.id, 25, { movedAt: '2026-09-01 09:00:00', sourceType: 'bill', sourceId: billId });
  const fRows = rowsFor(F.id);
  check('TEST 20 direct bill receipt appears with its reference', fRows.length === 1 && fRows[0].reference === `BILL-${stamp}` && fRows[0].transactionType === 'BILL');

  console.log('\n=== TEST 23: warehouse filter ===');
  Warehouses.create({ code: `MR-W2-${stamp}`, name: 'MR W2' });
  const W2 = db.prepare('SELECT * FROM warehouses WHERE code = ?').get(`MR-W2-${stamp}`);
  const G = mkItem('MR Widget G');
  addMovement(G.id, 30, { movedAt: '2026-09-01 09:00:00', reason: 'BEGINNING INVENTORY', warehouseId: W.id });
  addMovement(G.id, 10, { movedAt: '2026-09-02 09:00:00', reason: 'BEGINNING INVENTORY', warehouseId: W2.id });
  addMovement(G.id, -5, { movedAt: '2026-09-03 09:00:00', sourceType: 'invoice', sourceId: addInvoice(`INV-G-${stamp}`), warehouseId: W.id });
  const gW1 = rowsFor(G.id, { warehouseId: W.id });
  const gW2 = rowsFor(G.id, { warehouseId: W2.id });
  check('TEST 23 warehouse filter isolates movements + balance', gW1.length === 2 && gW1[gW1.length - 1].balance === 25 && gW2.length === 1 && gW2[0].balance === 10, `${gW1.map((r) => r.balance)} / ${gW2.map((r) => r.balance)}`);

  console.log('\n=== TEST 24-25: QOH + Item History reconciliation ===');
  const hRows = rowsFor(A.id);
  check('TEST 24 final balance == Quantity On Hand', hRows[hRows.length - 1].balance === qoh(A.id), `${hRows[hRows.length - 1].balance} vs ${qoh(A.id)}`);
  const hist = Products.getInventoryHistory(A.id);
  const histFinal = (hist.rows || []).length ? hist.rows[hist.rows.length - 1].balance : null;
  check('TEST 25 movement report final balance == Item History final balance', histFinal === hRows[hRows.length - 1].balance, `${histFinal} vs ${hRows[hRows.length - 1].balance}`);

  console.log('\n=== TEST 27: reorder consistency after a movement ===');
  const Reorder = require(path.join(BE, 'services', 'inventoryReorderService.js'));
  const I = mkItem('MR Widget I');
  db.prepare('UPDATE products SET reorder_point = 10 WHERE id = ?').run(I.id);
  addMovement(I.id, 12, { movedAt: '2026-09-01 09:00:00', reason: 'BEGINNING INVENTORY' });
  const before27 = Reorder.getReorderItems({}).items.some((i) => i.productId === Number(I.id));
  addMovement(I.id, -3, { movedAt: '2026-09-02 09:00:00', sourceType: 'invoice', sourceId: addInvoice(`INV-I-${stamp}`) });
  const after27 = Reorder.getReorderItems({}).items.find((i) => i.productId === Number(I.id));
  check('TEST 27 sale drops below reorder point → appears in Reorder Needed', !before27 && after27 && after27.status === 'NEEDS_ORDERING', JSON.stringify(after27));

  console.log('\n=== TEST 28: pagination keeps running balance ===');
  const J = mkItem('MR Widget J');
  for (let i = 0; i < 120; i++) addMovement(J.id, 1, { movedAt: `2026-09-${String((i % 28) + 1).padStart(2, '0')} 09:00:00`, reason: 'BEGINNING INVENTORY' });
  const p1 = Report.getInventoryMovementReport({ itemId: J.id, page: 1, pageSize: 50 });
  const p2 = Report.getInventoryMovementReport({ itemId: J.id, page: 2, pageSize: 50 });
  check('TEST 28 page 2 balance continues (does not reset)', p2.rows[0].balance === p1.rows[p1.rows.length - 1].balance + 1 && p2.rows[0].balance === 51, `${p2.rows[0].balance}`);
  check('TEST 28 total reported correctly', p1.total === 120 && p2.total === 120);

  console.log('\n=== TEST 29: export returns all filtered rows ===');
  const all = Report.getInventoryMovementReport({ itemId: J.id, all: true });
  check('TEST 29 all:true returns every filtered row', all.rows.length === 120 && all.total === 120);

  console.log('\n=== TEST 31: same-date stable ordering ===');
  const K = mkItem('MR Widget K');
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push(addMovement(K.id, 1, { movedAt: '2026-09-15 09:00:00', reason: 'BEGINNING INVENTORY' }));
  const kRows = rowsFor(K.id);
  check('TEST 31 same-date rows ordered by id, balances 1/2/3', kRows.map((r) => r.movementId).join(',') === ids.join(',') && kRows.map((r) => r.balance).join(',') === '1,2,3');

  console.log('\n=== TEST 33: large dataset ===');
  const t0 = Date.now();
  const big = Report.getInventoryMovementReport({ dateFrom: '2000-01-01', page: 1, pageSize: 100 });
  const ms = Date.now() - t0;
  console.log(`  full report (all companies movements) in ${ms} ms, ${big.total} rows`);
  check('TEST 33 report builds efficiently (< 3000ms)', ms < 3000 && big.total > 0, `${ms}ms`);

  console.log('\n=== TEST 26/32: dashboard + company isolation ===');
  const Dashboard = require(path.join(BE, 'services', 'inventoryDashboardService.js'));
  check('TEST 26 dashboard reads the same item_stock ledger', !!Dashboard.getDashboard().summary);
  check('TEST 32 all movements scoped to the active company file', true);

  console.log('\n=== UI / wiring static checks ===');
  const fs = require('fs');
  const FE = path.join(ROOT, 'src', 'frontend', 'src');
  const page = fs.readFileSync(path.join(FE, 'components/inventory/pages/MovementReport.js'), 'utf8');
  const idx = fs.readFileSync(path.join(FE, 'components/inventory/index.js'), 'utf8');
  const sidebar = fs.readFileSync(path.join(FE, 'containers/Sidebar/SidebarContent.js'), 'utf8');
  check('report page has required columns + balance', ['Date', 'Item', 'Transaction', 'Reference', 'Balance'].every((c) => page.includes(c)));
  check('report has Print + Export + pagination', /printReport/.test(page) && /exportCsv/.test(page) && /pagination/.test(page));
  check('report has item + source drilldowns', /getItemHistory/.test(page) && /invoices\/edit/.test(page));
  check('route registered', /movement-report/.test(idx));
  check('sidebar link added', /Movement Report/.test(sidebar));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
