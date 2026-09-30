/**
 * verify-purchasing-reports.js — Basic Purchasing Reports.
 *
 * Proves the 7 required reports reuse the central data: Items Purchased counts
 * PHYSICAL receipts from the ONE movement ledger (never double-counting a
 * receipt + its bill), Received vs Ordered is line-level, and Open / Outstanding
 * POs reuse the central PO fulfillment status.
 *
 * Runs on a SCRATCH COPY, driven through the REAL handlers.
 */
const path = require('path');
const Module = require('module');
const handlers = new Map();
const electronStub = { ipcMain: { handle: (c, fn) => { if (!handlers.has(c)) handlers.set(c, fn); } } };
const originalLoad = Module._load;
Module._load = function (request) { if (request === 'electron') return electronStub; return originalLoad.apply(this, arguments); };

const realLog = console.log.bind(console);
console.log = () => {};
require('./lib/testDb.js').useScratchCopy({ label: 'verify-purchasing-reports' });

const ROOT = path.join(__dirname, '..');
const BE = path.join(ROOT, 'src', 'backend');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
const fs = require('fs');
const db = require(path.join(BE, 'models', 'dbmgr.js')).raw;
const Products = require(path.join(BE, 'models', 'products.js'));
const Inventory = require(path.join(BE, 'models', 'inventory.js'));
const Warehouses = require(path.join(BE, 'models', 'warehouses.js'));
const COA = require(path.join(BE, 'models', 'chartOfAccounts.js'));
const Reports = require(path.join(BE, 'services', 'purchasingReportsService.js'));

require(path.join(BE, 'handlers', 'ipcHandlers.js'))();
require(path.join(BE, 'handlers', 'inventoryHandlers.js'))();
console.log = realLog;

let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  -> ${d}` : ''}`); } };
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
const money = (n) => Math.round(Number(n || 0) * 100) / 100;

(async () => {
  const H = (n) => handlers.get(n);
  const ev = { sender: { id: 'verify-purchasing-reports' } };
  const receivePO = H('receive-purchase-order');
  const insertExpense = H('insert-expense');
  const sup = db.prepare("INSERT INTO suppliers (title, first_name, mobile_number, display_name, entered_by) VALUES ('','V','','ZZPR Vendor','test')").run();
  const supplierId = Number(sup.lastInsertRowid);
  const W = Warehouses.getOrCreateDefault();
  const income = COA.getByName('Sales Revenue') || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('income','other income') AND status='Active' LIMIT 1").get();
  const invAsset = COA.getSystemAccount('Inventory Asset');
  const cogs = COA.getSystemAccount('Cost of Goods Sold');
  const stamp = Date.now();
  let seq = 0;

  const mkProduct = (name) => Products.saveItemMaster({ type: 'INVENTORY_PART', name, sku: `${name}-${stamp}-${++seq}`, salesPrice: 35, purchaseCost: 20, incomeAccountId: income.id, inventoryAssetAccountId: invAsset.id, cogsAccountId: cogs.id, valuationMethod: 'FIFO' });
  const itemIdOf = (pid) => Inventory.resolveItemId(Number(pid));
  const addPo = (pid, ordered, cost) => {
    const poId = Number(db.prepare("INSERT INTO purchase_orders (po_number, vendor_id, po_date, expected_date, status, subtotal, tax_total, total, created_by) VALUES (?,?,?,?,?,0,0,0,'t')").run(`ZZPR-${++seq}-${stamp}`, supplierId, '2026-06-01', '2026-06-10', 'OPEN').lastInsertRowid);
    const lineId = Number(db.prepare("INSERT INTO purchase_order_lines (purchase_order_id, item_id, line_no, description, item_type, unit, qty_ordered, qty_received, qty_billed, unit_cost, tax_rate, amount) VALUES (?,?,1,'widget','INVENTORY_PART','Each',?,0,0,?,0,0)").run(poId, pid, ordered, cost).lastInsertRowid);
    return { poId, lineId };
  };
  const makeBill = async (lines) => {
    const res = await insertExpense(ev, supplierId, 'Accounts Payable', '2026-06-01', 'bill', `ZZPR-B-${++seq}`, 'bill', 'test', 'Unpaid', lines, '2026-06-01', 'x', 30);
    return res && (res.expenseId || res.id);
  };
  const billItemLine = (pid, qty, rate, poLineId = null) => ({ line_type: 'item', product_id: pid, quantity: qty, rate, amount: money(qty * rate), warehouse_id: W.id, description: 'widget', purchase_order_line_id: poLineId });

  console.log('\n=== Items Purchased — physical receipts only (no double count) ===');
  const P = mkProduct('ZZPR Widget');
  const po = addPo(P.id, 100, 20);
  await receivePO(ev, po.poId, { receiptDate: '2026-06-02', lines: [{ purchaseOrderLineId: po.lineId, qtyReceived: 60 }] });
  await makeBill([billItemLine(P.id, 60, 20, po.lineId)]); // PO-linked bill — must NOT add a movement
  const ip1 = Reports.getItemsPurchased({});
  const row1 = ip1.rows.find((r) => Number(r.productId) === Number(P.id));
  check('Items Purchased counts the 60 received (not 120 from receipt+bill)', !!row1 && near(row1.quantity, 60), row1 && JSON.stringify(row1));
  check('Items Purchased values it at the receipt cost (60 × 20 = $1,200)', !!row1 && near(row1.value, 1200));
  check('a PO-linked bill creates NO extra movement', db.prepare("SELECT COUNT(*) c FROM stock_movements WHERE sourceType='expense' AND sourceId=?").get(Number(db.prepare("SELECT MAX(id) m FROM expenses").get().m)).c === 0);

  console.log('\n=== Received vs Ordered (line level) ===');
  const rvo = Reports.getReceivedVsOrdered({});
  const line = rvo.rows.find((r) => Number(r.lineId) === Number(po.lineId));
  check('Received vs Ordered shows ordered / received / remaining per line', !!line && line.ordered === 100 && line.received === 60 && near(line.remaining, 40), line && JSON.stringify(line));
  check('Received vs Ordered is line-level (billed is shown separately)', !!line && line.billed === 60);

  console.log('\n=== Open / Outstanding POs ===');
  const open = Reports.getOpenPurchaseOrders();
  const out = Reports.getOutstandingPurchaseOrders();
  check('Open POs includes the active PO', open.rows.some((r) => Number(r.id) === Number(po.poId)));
  check('Outstanding POs includes the PO with remaining to receive', out.rows.some((r) => Number(r.id) === Number(po.poId)));
  const fully = addPo(P.id, 5, 20);
  await receivePO(ev, fully.poId, { receiptDate: '2026-06-03', lines: [{ purchaseOrderLineId: fully.lineId, qtyReceived: 5 }] });
  await makeBill([billItemLine(P.id, 5, 20, fully.lineId)]);
  check('a fully received + billed PO is NOT outstanding', !Reports.getOutstandingPurchaseOrders().rows.some((r) => Number(r.id) === Number(fully.poId)));

  console.log('\n=== Vendor Purchase History ===');
  const hist = Reports.getVendorPurchaseHistory(supplierId);
  check('Vendor Purchase History exposes POs / receipts / bills / payments / credits', hist && Array.isArray(hist.purchaseOrders) && Array.isArray(hist.receipts) && Array.isArray(hist.bills) && Array.isArray(hist.payments) && Array.isArray(hist.credits));

  console.log('\n=== direct (non-PO) bill purchase counts once ===');
  const P2 = mkProduct('ZZPR Direct');
  const b2 = await makeBill([billItemLine(P2.id, 7, 15, null)]); // direct bill receives stock (sourceType bill)
  const ip2 = Reports.getItemsPurchased({});
  const row2 = ip2.rows.find((r) => Number(r.productId) === Number(P2.id));
  check('a direct bill purchase is counted once (from its receipt movement)', !!row2 && near(row2.quantity, 7) && near(row2.value, 105), row2 && JSON.stringify(row2));

  console.log('\n=== date range filter ===');
  const inRange = Reports.getItemsPurchased({ dateFrom: '2000-01-01', dateTo: '2000-12-31' });
  check('date range filter excludes movements outside the range', !inRange.rows.some((r) => Number(r.productId) === Number(P.id)));

  console.log('\n=== reuse / wiring ===');
  const svc = fs.readFileSync(path.join(BE, 'services', 'purchasingReportsService.js'), 'utf8');
  const idx = fs.readFileSync(path.join(FE, 'components', 'vendors', 'index.js'), 'utf8');
  const side = fs.readFileSync(path.join(FE, 'containers', 'Sidebar', 'SidebarContent.js'), 'utf8');
  check('the report reuses PurchaseOrders + the movement ledger (no new engine)', /PurchaseOrders\.getAll/.test(svc) && /stock_movements/.test(svc) && /getVendorActivity/.test(svc));
  check('Items Purchased uses the movement ledger, not bills (no double count)', /sourceType IN \('receipt','bill'\)/.test(svc));
  check('route + sidebar link registered', /purchasing\/reports/.test(idx) && /Purchasing Reports/.test(side));
  check('IPC + preload wired', /get-purchasing-reports/.test(fs.readFileSync(path.join(BE, 'handlers', 'ipcHandlers.js'), 'utf8')) && /getPurchasingReports:/.test(fs.readFileSync(path.join(BE, 'preload.js'), 'utf8')));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e && e.stack ? e.stack : e); process.exit(1); });
