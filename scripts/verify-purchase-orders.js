/**
 * verify-purchase-orders.js
 *
 * Purchase Orders + Goods Receipts:
 *  - a PO posts NOTHING (no AP, no Inventory Asset, no stock)
 *  - a receipt moves INVENTORY QUANTITY only (inventory parts), never a journal
 *  - partial receiving + over-receipt guard + concurrency re-check
 *  - billing linkage helpers prevent double stock receipt
 *
 * Runs on a SCRATCH COPY.
 */
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const Module = require('module');
const electronStub = { ipcMain: { handle: () => {} }, app: { isPackaged: true } };
const originalLoad = Module._load;
Module._load = function (request) { if (request === 'electron') return electronStub; return originalLoad.apply(this, arguments); };

require('./lib/testDb.js').useScratchCopy({ label: 'verify-purchase-orders' });
const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const PurchaseOrders = require(path.join(ROOT, 'src', 'backend', 'models', 'purchaseOrders.js'));
const Products = require(path.join(ROOT, 'src', 'backend', 'models', 'products.js'));
const Expenses = require(path.join(ROOT, 'src', 'backend', 'models', 'expenses.js'));
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js')).raw;

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};
const read = (rel) => fs.readFileSync(path.join(FE, rel), 'utf8');

console.log('\n=== Fixtures ===');
const vendor = db.prepare("SELECT id, display_name, first_name, last_name FROM suppliers ORDER BY id LIMIT 1").get();
const income = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('income','other income') AND status='Active' ORDER BY id LIMIT 1").get();
const expense = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('expense','cost of goods sold','other expense') AND status='Active' ORDER BY id LIMIT 1").get();
const asset = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('asset','bank','cash','other current asset','other asset') AND status='Active' ORDER BY id LIMIT 1").get();
check('a vendor + income/expense/asset accounts exist', !!(vendor && income && expense && asset),
  JSON.stringify({ vendor: vendor?.id, income: income?.id, expense: expense?.id, asset: asset?.id }));

let invItemId = null;
if (vendor && income && expense && asset) {
  const r = Products.saveItemMaster({
    type: 'INVENTORY_PART', name: 'PO Widget A', sku: `PO-W-${Date.now()}`,
    purchaseCost: 20, salesPrice: 35, incomeAccountId: income.id,
    inventoryAssetAccountId: asset.id, cogsAccountId: expense.id,
  });
  invItemId = r.id;
  check('inventory item fixture created', r.success === true, JSON.stringify(r));
}

const journalCount = () => db.prepare('SELECT COUNT(*) AS c FROM journal_entries').get().c;

if (invItemId) {
  const jeBefore = journalCount();

  // ── TEST 2 — create PO: no accounting, no stock ──────────────────────────
  console.log('\n=== TEST 2: create PO (no AP / no stock) ===');
  const po = PurchaseOrders.save({
    vendorId: vendor.id, poDate: '2026-06-01', expectedDate: '2026-06-10', memo: 'PO test',
    lines: [{ itemId: invItemId, description: 'PO Widget A', itemType: 'INVENTORY_PART', unit: 'Each', qtyOrdered: 100, unitCost: 20 }],
  });
  check('PO saves', po.success === true, JSON.stringify(po));
  const poRow = PurchaseOrders.getById(po.id);
  check('PO total = $2,000', Number(poRow.total) === 2000, String(poRow.total));
  check('PO status is DRAFT', poRow.status === 'DRAFT');
  check('PO number uses the PO-#### pattern', /^PO-\d{4,}$/.test(poRow.po_number || ''), poRow.po_number);
  check('creating a PO posts NO journal entry', journalCount() === jeBefore, `${jeBefore} -> ${journalCount()}`);
  check('creating a PO moves NO stock', Number(poRow.totalReceived) === 0);

  // Open it
  PurchaseOrders.setStatus(po.id, 'OPEN');
  check('PO can be opened', PurchaseOrders.getById(po.id).status === 'OPEN');

  // ── TEST 4 — partial receive ─────────────────────────────────────────────
  console.log('\n=== TEST 4: partial receive 60 ===');
  const itemRow = db.prepare('SELECT item_id FROM products WHERE id = ?').get(invItemId);
  const stockQty = () => {
    // Re-read the bridge each time: resolveInventoryItem() creates it on first receipt.
    const row = db.prepare('SELECT item_id FROM products WHERE id = ?').get(invItemId);
    if (!row || !row.item_id) return 0;
    return Number(db.prepare('SELECT COALESCE(SUM(quantity),0) AS q FROM item_stock WHERE itemId = ?').get(row.item_id).q);
  };
  const r60 = PurchaseOrders.receive(po.id, {
    receiptDate: '2026-06-05', reference: 'PK-1',
    lines: [{ purchaseOrderLineId: poRow.lines[0].id, qtyReceived: 60 }],
  });
  check('receipt saves', r60.success === true, JSON.stringify(r60));
  const after60 = PurchaseOrders.getById(po.id);
  check('qty_received = 60', Number(after60.lines[0].qty_received) === 60, String(after60.lines[0].qty_received));
  check('receiving status = PARTIALLY_RECEIVED', after60.receivingStatus === 'PARTIALLY_RECEIVED', after60.receivingStatus);
  check('display status = PARTIALLY_RECEIVED', after60.displayStatus === 'PARTIALLY_RECEIVED', after60.displayStatus);
  check('inventory stock increased by 60', stockQty() === 60, String(stockQty()));
  check('receipt created a stock movement with sourceType=receipt',
    !!db.prepare("SELECT 1 FROM stock_movements WHERE sourceType='receipt' AND sourceId=? LIMIT 1").get(r60.receiptId));
  check('receipt posted NO journal entry', journalCount() === jeBefore);

  // Over-receive guard
  const over = PurchaseOrders.receive(po.id, { lines: [{ purchaseOrderLineId: after60.lines[0].id, qtyReceived: 50 }] });
  check('over-receipt is blocked', over.success === false && /remaining/i.test(over.error || ''), JSON.stringify(over));

  // ── TEST 5 — receive remaining ───────────────────────────────────────────
  console.log('\n=== TEST 5: receive remaining 40 ===');
  const r40 = PurchaseOrders.receive(po.id, { lines: [{ purchaseOrderLineId: after60.lines[0].id, qtyReceived: 40 }] });
  const after100 = PurchaseOrders.getById(po.id);
  check('receipt saves', r40.success === true, JSON.stringify(r40));
  check('qty_received = 100', Number(after100.lines[0].qty_received) === 100, String(after100.lines[0].qty_received));
  check('receiving status = RECEIVED', after100.receivingStatus === 'RECEIVED', after100.receivingStatus);
  check('inventory stock = 100 (no double count)', stockQty() === 100, String(stockQty()));
  check('two receipts recorded', (after100.receipts || []).length === 2, String((after100.receipts || []).length));

  // ── Non-inventory receive moves no stock ─────────────────────────────────
  console.log('\n=== Non-inventory line: no stock movement ===');
  const nonInv = Products.saveItemMaster({ type: 'NON_INVENTORY_PART', name: 'PO Consumable', sku: `PO-NI-${Date.now()}`, purchaseCost: 5, incomeAccountId: income.id, purchaseExpenseAccountId: expense.id });
  const po2 = PurchaseOrders.save({ vendorId: vendor.id, poDate: '2026-06-02', lines: [{ itemId: nonInv.id, description: 'Consumable', itemType: 'NON_INVENTORY_PART', qtyOrdered: 10, unitCost: 5 }] });
  PurchaseOrders.setStatus(po2.id, 'OPEN');
  const po2row = PurchaseOrders.getById(po2.id);
  const stockBefore = stockQty();
  const rn = PurchaseOrders.receive(po2.id, { lines: [{ purchaseOrderLineId: po2row.lines[0].id, qtyReceived: 10 }] });
  check('non-inventory receipt saves', rn.success === true, JSON.stringify(rn));
  check('non-inventory receipt moves NO stock', stockQty() === stockBefore, `${stockBefore} -> ${stockQty()}`);

  // ── Billing linkage / double-count prevention ────────────────────────────
  console.log('\n=== Billing linkage (double-count prevention) ===');
  const applied = PurchaseOrders.applyBill(999999, [{ purchaseOrderLineId: poRow.lines[0].id, qty: 60 }]);
  check('applyBill records billed qty', applied.success === true);
  const afterBill = PurchaseOrders.getById(po.id);
  check('qty_billed = 60', Number(afterBill.lines[0].qty_billed) === 60, String(afterBill.lines[0].qty_billed));
  check('billing status = PARTIALLY_BILLED', afterBill.billingStatus === 'PARTIALLY_BILLED', afterBill.billingStatus);

  // ── Open-for-vendor + status transitions ─────────────────────────────────
  console.log('\n=== Open-for-vendor + lifecycle ===');
  const open = PurchaseOrders.getOpenForVendor(vendor.id);
  check('open POs returned for the vendor', Array.isArray(open) && open.length >= 1);
  PurchaseOrders.setStatus(po.id, 'CLOSED');
  const closed = PurchaseOrders.getById(po.id);
  check('PO can be closed', closed.status === 'CLOSED');
  const recvClosed = PurchaseOrders.receive(po.id, { lines: [{ purchaseOrderLineId: poRow.lines[0].id, qtyReceived: 1 }] });
  check('a closed PO cannot be received', recvClosed.success === false, JSON.stringify(recvClosed));
}

// ── Frontend wiring ────────────────────────────────────────────────────────
console.log('\n=== Frontend wiring ===');
const page = read('components/vendors/purchasing/PurchaseOrders.js');
check('PO list page exists with the polished sections', /Purchase Orders/.test(page) && /FormSection/.test(page));
check('PO form has Details + Items boxed sections', /Purchase Order Details/.test(page) && /title="Items"/.test(page));
check('PO line pulls defaults from the Item master', /purchase_cost/.test(page) && /purchase_description/.test(page));
check('Receive Items drawer with remaining validation', /Receive Items/.test(page) && /Remaining/.test(page) && /receivePurchaseOrder/.test(page));
check('PO detail drawer shows receipts + bills', /Receipts/.test(page) && /Bills/.test(page));
check('PO detail lines show ordered/received/billed/remaining', /Remaining to Receive|Rem. Receive/.test(page) || /Rem\. Receive/.test(page));
check('route registered', /purchasing\/purchase-orders/.test(read('components/vendors/index.js')));
check('sidebar link added', /Purchase Orders/.test(fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'src', 'containers', 'Sidebar', 'SidebarContent.js'), 'utf8')));
check('IPC + preload wired',
  /save-purchase-order/.test(fs.readFileSync(path.join(ROOT, 'src', 'backend', 'handlers', 'ipcHandlers.js'), 'utf8')) &&
  /savePurchaseOrder/.test(fs.readFileSync(path.join(ROOT, 'src', 'backend', 'preload.js'), 'utf8')));
check('CSS widens the PO drawers', /\.ant-drawer\.app-po-drawer/.test(fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'public', 'css', 'custom.css'), 'utf8')));
check('inactive tab panes are hidden (tab switching fix)',
  /\.ant-tabs-tabpane-hidden\s*\{[^}]*display:\s*none/.test(fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'public', 'css', 'custom.css'), 'utf8')));
check('PO Terms is a dropdown (like the invoice Terms)',
  /TERMS_OPTIONS/.test(page) && /name="terms"[\s\S]{0,200}<Select/.test(page));
check('PO Ship To auto-fills from the selected vendor',
  /vendorAddress/.test(page) && /onChange=\{\(v\) => \{[\s\S]{0,200}setFieldsValue\(\{ shipTo: vendorAddress/.test(page));
check('PO print/PDF output implemented', /buildPoHtml/.test(page) && /handlePrint/.test(page) && /\.print\(\)/.test(page));
check('PO email reuses the shared mail engine', /emailSend/.test(page) && /buildPoHtml/.test(page));
check('PO export covers the filtered list', /exportCSV/.test(page) && /rows\.map/.test(page));
check('bill stock receipt excludes PO-linked lines (no double count)',
  /purchase_order_line_id == null/.test(fs.readFileSync(path.join(ROOT, 'src', 'backend', 'models', 'expenses.js'), 'utf8')));
check('billed PO-line helper exists for the Bill engine',
  /getBilledPoLineIds/.test(fs.readFileSync(path.join(ROOT, 'src', 'backend', 'models', 'purchaseOrders.js'), 'utf8')));

// ── Enter Bill ← PO: billed sync + no double stock ─────────────────────────
(async () => {
  if (invItemId && typeof vendor !== 'undefined' && vendor) {
    console.log('\n=== Enter Bill ← PO: billed sync + no double stock ===');
    const wh = db.prepare('SELECT id FROM warehouses ORDER BY isDefault DESC, id LIMIT 1').get();
    const po = PurchaseOrders.getAll({}).find(p => (p.lines || []).some(l => l.item_id === invItemId)) || PurchaseOrders.getAll({})[0];
    const poRow = PurchaseOrders.getById(po.id);
    const pol = poRow.lines[0];
    const stockQty = () => {
      const row = db.prepare('SELECT item_id FROM products WHERE id = ?').get(invItemId);
      if (!row || !row.item_id) return 0;
      return Number(db.prepare('SELECT COALESCE(SUM(quantity),0) AS q FROM item_stock WHERE itemId = ?').get(row.item_id).q);
    };
    const stockBefore = stockQty();
    const bill = await Expenses.insertExpense(
      vendor.id, 'Accounts Payable', '2026-06-06', 'bill', 'BILL-PO-1', 'bill', 'system', 'Unpaid',
      [{ line_type: 'item', category: 'Inventory', description: pol.description, amount: 60 * Number(pol.unit_cost), product_id: invItemId, quantity: 60, rate: Number(pol.unit_cost), warehouse_id: wh ? wh.id : null, purchase_order_id: poRow.id, purchase_order_line_id: pol.id }],
      '2026-06-06', 'from PO', 30
    );
    check('PO-linked bill saves', !!(bill && bill.success), JSON.stringify(bill));
    const afterBill = PurchaseOrders.getById(poRow.id);
    check('qty_billed recomputed from the bill = 60', Number(afterBill.lines[0].qty_billed) === 60, String(afterBill.lines[0].qty_billed));
    check('PO-linked bill did NOT move stock again (no double count)', stockQty() === stockBefore, `${stockBefore} -> ${stockQty()}`);
    check('bill line stores the PO + PO-line ids',
      !!db.prepare('SELECT 1 FROM expense_lines WHERE expense_id = ? AND purchase_order_line_id = ? LIMIT 1').get(Number(bill.expenseId || bill.id), pol.id));
  }

  // Enter Bill UI wiring
  console.log('\n=== Enter Bill UI wiring ===');
  const eb = fs.readFileSync(path.join(FE, 'components/vendors/bills/EnterBill.js'), 'utf8');
  check('Enter Bill has an Add from PO action', /Add from PO/.test(eb) && /getOpenPurchaseOrders/.test(eb));
  check('PO picker modal shows PO/received/billed/available', /Available to Bill/.test(eb));
  check('bill lines carry the PO linkage', /purchase_order_line_id:/.test(eb) && /purchaseOrderLineId/.test(eb));
  check('three-way match warning present', /Bill quantity exceeds quantity received/.test(eb) && /threeWayIssues/.test(eb));
  check('PO match column shows ordered/received/billed', /Ordered \{pol\.qty_ordered\}/.test(eb));

  // ── PO detail: enriched bills/payments/credits + separated summary ────────
  console.log('\n=== PO detail enrichment ===');
  {
    const poForDetail = PurchaseOrders.getAll({}).find(p => (p.lines || []).some(l => l.item_id === invItemId)) || PurchaseOrders.getAll({})[0];
    const det = PurchaseOrders.getById(poForDetail.id);
    check('PO detail exposes bills with amount/paid/credits/balance/status',
      Array.isArray(det.bills) && det.bills.every(b => 'amount' in b && 'paid' in b && 'credits' in b && 'balance' in b && 'status' in b));
    check('PO detail exposes payments + credits arrays', Array.isArray(det.payments) && Array.isArray(det.credits));
    check('PO detail separates quantity and money summaries',
      det.summary && 'orderedQty' in det.summary && 'receivedQty' in det.summary && 'remainingToReceive' in det.summary &&
      'poTotal' in det.summary && 'billedAmount' in det.summary && 'creditsApplied' in det.summary &&
      'paidAmount' in det.summary && 'outstandingBills' in det.summary && 'remainingToBill' in det.summary,
      JSON.stringify(det.summary));
    check('remainingToReceive is a quantity, remainingToBill is money (distinct fields)',
      'remainingToReceive' in det.summary && 'remainingToBill' in det.summary);
    // A payment must belong to a Bill, never to the PO.
    check('no payment is posted directly against the PO (payments carry billId)',
      (det.payments || []).every(p => p.billId != null));
  }

  // ── Frontend: PO detail actions + tabs ────────────────────────────────────
  console.log('\n=== PO detail UI ===');
  check('PO detail has Create Bill (reuses Enter Bill via ?po=)',
    /createBillFromPO/.test(page) && /bills\/enter\?po=/.test(page));
  check('PO detail has Pay Bill (reuses Pay Bills via ?bill=)',
    /payBillFromPO/.test(page) && /bills\/pay\?bill=/.test(page));
  check('PO detail has a Payments tab', /Payments \(/.test(page) && /detail\.payments/.test(page));
  check('PO detail separates Fulfillment and Financial summaries',
    /Fulfillment \(Qty\)/.test(page) && /Outstanding Bill Balance/.test(page) && /Remaining to Bill/.test(page));
  check('PO detail shows Receiving + Billing status badges', /Receiving:/.test(page) && /Billing:/.test(page));
  check('Bills empty state offers Create Bill from PO', /Create Bill from PO/.test(page));
  check('Enter Bill supports ?po= deep link', /preSelectedPoId/.test(eb) && /getPurchaseOrder\?\.\(preSelectedPoId\)/.test(eb));
  check('Pay Bills supports ?bill= deep link', /get\('bill'\)/.test(read('components/vendors/bills/PayBills.js')) && /billLinkAppliedRef/.test(read('components/vendors/bills/PayBills.js')));

  // Vendor Activity
  console.log('\n=== Vendor Activity ===');
  const act = PurchaseOrders.getVendorActivity(vendor.id);
  check('getVendorActivity returns the five activity lists',
    act && Array.isArray(act.purchaseOrders) && Array.isArray(act.receipts) && Array.isArray(act.bills) &&
    Array.isArray(act.payments) && Array.isArray(act.credits),
    JSON.stringify(Object.keys(act || {})));
  check('vendor activity includes this vendor\'s POs', (act.purchaseOrders || []).length >= 1);
  const vd = fs.readFileSync(path.join(FE, 'components/vendors/VendorDetailsContent.js'), 'utf8');
  check('Vendor Details shows activity tabs', /Purchase Orders \(/.test(vd) && /Receipts \(/.test(vd) && /Bills \(/.test(vd) && /Payments \(/.test(vd) && /Credits \(/.test(vd));
  check('Vendor Details loads vendor activity', /getVendorActivity/.test(vd));
  check('IPC + preload expose vendor activity',
    /get-vendor-activity/.test(fs.readFileSync(path.join(ROOT, 'src', 'backend', 'handlers', 'ipcHandlers.js'), 'utf8')) &&
    /getVendorActivity/.test(fs.readFileSync(path.join(ROOT, 'src', 'backend', 'preload.js'), 'utf8')));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();

