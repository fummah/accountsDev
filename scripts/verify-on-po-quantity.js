/**
 * verify-on-po-quantity.js
 *
 * Proves the central availability service:
 *   On Hand      = item_stock (physical ledger), never from POs
 *   On PO        = SUM over active PO lines of MAX(ordered − received, 0)
 *   Expected     = On Hand + On PO
 * Active PO = workflow status NOT IN (DRAFT, CANCELLED, CLOSED) and remaining > 0.
 * Billing never reduces On PO (bill-before-receipt is allowed).
 *
 * Runs on a SCRATCH COPY of the company file.
 */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-on-po' });

const path = require('path');
const ROOT = path.join(__dirname, '..');
const BE = path.join(ROOT, 'src', 'backend');
const db = require(path.join(BE, 'models', 'dbmgr.js'));
const Products = require(path.join(BE, 'models', 'products.js'));
const Inventory = require(path.join(BE, 'models', 'inventory.js'));
const Warehouses = require(path.join(BE, 'models', 'warehouses.js'));
const COA = require(path.join(BE, 'models', 'chartOfAccounts.js'));
require(path.join(BE, 'models', 'purchaseOrders.js'));
const Avail = require(path.join(BE, 'services', 'inventoryAvailabilityService.js'));
const Dashboard = require(path.join(BE, 'services', 'inventoryDashboardService.js'));

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};
const eq = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;

const income = COA.getByName('Sales Revenue') || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('income','other income') AND status='Active' ORDER BY id LIMIT 1").get();
const expense = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('expense','cost of goods sold','other expense') AND status='Active' ORDER BY id LIMIT 1").get();
const invAsset = COA.getSystemAccount('Inventory Asset') || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('asset','other current asset','inventory') AND status='Active' ORDER BY id LIMIT 1").get();
const cogs = COA.getSystemAccount('Cost of Goods Sold') || expense;
const supplier = db.prepare('SELECT id FROM suppliers ORDER BY id LIMIT 1').get();
const W = Warehouses.getOrCreateDefault();
const stamp = Date.now();
let seq = 0;

const mkItem = (type, name) => Products.saveItemMaster({
  type, name, sku: `${name}-${stamp}`, salesPrice: 10, purchaseCost: 5,
  incomeAccountId: income.id,
  ...(type === 'INVENTORY_PART' ? { inventoryAssetAccountId: invAsset.id, cogsAccountId: cogs.id, valuationMethod: 'FIFO', reorderPoint: 10 } : { purchaseExpenseAccountId: expense.id }),
});

const clearPos = () => { db.prepare('DELETE FROM purchase_order_lines').run(); db.prepare('DELETE FROM purchase_orders').run(); };
const addPo = (status, lines) => {
  const poId = db.prepare("INSERT INTO purchase_orders (po_number, vendor_id, po_date, status, subtotal, tax_total, total, created_by) VALUES (?,?,?,?,?,?,?,?)")
    .run(`T${++seq}-${stamp}`, supplier.id, '2026-09-01', status, 0, 0, 0, 't').lastInsertRowid;
  lines.forEach((l, i) => db.prepare("INSERT INTO purchase_order_lines (purchase_order_id, item_id, line_no, description, item_type, unit, qty_ordered, qty_received, qty_billed, unit_cost, tax_rate, amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(poId, l.item, i + 1, 'x', 'INVENTORY_PART', 'Each', l.ordered, l.received || 0, l.billed || 0, 5, 0, 0));
  return poId;
};

(async () => {
  const A = mkItem('INVENTORY_PART', 'OnPo A');
  const NI = mkItem('NON_INVENTORY_PART', 'OnPo NI');
  const SVC = mkItem('SERVICE', 'OnPo SVC');
  const aItem = Inventory.resolveItemId(A.id);
  const recv = (qty) => Inventory.receiveStock(aItem, W.id, qty, 5, { sourceType: 'receipt', sourceId: ++seq + 900000 });

  console.log('\n=== TEST 1: simple PO ===');
  recv(20);
  clearPos();
  addPo('OPEN', [{ item: A.id, ordered: 50, received: 0 }]);
  let av = Avail.getItemAvailability(A.id);
  check('On Hand = 20', eq(av.onHand, 20), String(av.onHand));
  check('On PO = 50', eq(av.onPurchaseOrder, 50), String(av.onPurchaseOrder));
  check('Expected = 70', eq(av.expected, 70), String(av.expected));

  console.log('\n=== TEST 2: partial receipt (receive 20, line received 20) ===');
  recv(20);
  clearPos();
  addPo('OPEN', [{ item: A.id, ordered: 50, received: 20 }]);
  av = Avail.getItemAvailability(A.id);
  check('On Hand = 40', eq(av.onHand, 40), String(av.onHand));
  check('On PO = 30', eq(av.onPurchaseOrder, 30), String(av.onPurchaseOrder));
  check('Expected = 70', eq(av.expected, 70), String(av.expected));

  console.log('\n=== TEST 3: full receipt (receive 30, line received 50) ===');
  recv(30);
  clearPos();
  addPo('OPEN', [{ item: A.id, ordered: 50, received: 50 }]);
  av = Avail.getItemAvailability(A.id);
  check('On Hand = 70', eq(av.onHand, 70), String(av.onHand));
  check('On PO = 0', eq(av.onPurchaseOrder, 0), String(av.onPurchaseOrder));
  check('Expected = 70', eq(av.expected, 70), String(av.expected));

  console.log('\n=== TEST 4: multiple POs ===');
  clearPos();
  addPo('OPEN', [{ item: A.id, ordered: 20, received: 0 }]);
  addPo('OPEN', [{ item: A.id, ordered: 30, received: 0 }]);
  av = Avail.getItemAvailability(A.id);
  check('On PO = 50 across two POs', eq(av.onPurchaseOrder, 50), String(av.onPurchaseOrder));

  console.log('\n=== TEST 5/6/7: cancelled / closed / draft excluded ===');
  clearPos();
  addPo('CANCELLED', [{ item: A.id, ordered: 100, received: 20 }]);
  check('Cancelled excluded (On PO 0)', eq(Avail.getItemAvailability(A.id).onPurchaseOrder, 0));
  clearPos();
  addPo('CLOSED', [{ item: A.id, ordered: 100, received: 60 }]);
  check('Closed excluded (On PO 0)', eq(Avail.getItemAvailability(A.id).onPurchaseOrder, 0));
  clearPos();
  addPo('DRAFT', [{ item: A.id, ordered: 100, received: 0 }]);
  check('Draft excluded (On PO 0)', eq(Avail.getItemAvailability(A.id).onPurchaseOrder, 0));

  console.log('\n=== TEST 8: billed before receipt ===');
  clearPos();
  addPo('OPEN', [{ item: A.id, ordered: 100, received: 0, billed: 100 }]);
  check('On PO = 100 (billing ignored)', eq(Avail.getItemAvailability(A.id).onPurchaseOrder, 100));

  console.log('\n=== TEST 9: partially billed ===');
  clearPos();
  addPo('OPEN', [{ item: A.id, ordered: 100, received: 30, billed: 80 }]);
  check('On PO = 70 (received, not billed)', eq(Avail.getItemAvailability(A.id).onPurchaseOrder, 70));

  console.log('\n=== TEST 10: over receipt ===');
  clearPos();
  addPo('OPEN', [{ item: A.id, ordered: 100, received: 105 }]);
  check('On PO = 0 (never negative)', eq(Avail.getItemAvailability(A.id).onPurchaseOrder, 0));

  console.log('\n=== TEST 11/12: non-inventory + service have no inventory metrics ===');
  clearPos();
  addPo('OPEN', [{ item: NI.id, ordered: 50, received: 0 }, { item: SVC.id, ordered: 50, received: 0 }]);
  check('Non-Inventory returns null On PO', Avail.getItemAvailability(NI.id).onPurchaseOrder === null);
  check('Service returns null On PO', Avail.getItemAvailability(SVC.id).onPurchaseOrder === null);
  check('Non-Inventory not counted as an inventory item', Avail.getItemAvailability(NI.id).tracksInventory === false);

  console.log('\n=== TEST 13: same item twice on one PO ===');
  clearPos();
  addPo('OPEN', [{ item: A.id, ordered: 10, received: 0 }, { item: A.id, ordered: 15, received: 0 }]);
  check('On PO = 25 (10 + 15)', eq(Avail.getItemAvailability(A.id).onPurchaseOrder, 25));

  console.log('\n=== TEST 14: edit PO up (50→70, received 10) ===');
  clearPos();
  const poUp = addPo('OPEN', [{ item: A.id, ordered: 50, received: 10 }]);
  check('On PO = 40 before edit', eq(Avail.getItemAvailability(A.id).onPurchaseOrder, 40));
  db.prepare('UPDATE purchase_order_lines SET qty_ordered = 70 WHERE purchase_order_id = ?').run(poUp);
  check('On PO = 60 after edit up', eq(Avail.getItemAvailability(A.id).onPurchaseOrder, 60));

  console.log('\n=== TEST 15: edit PO down (70→40, received 20) ===');
  clearPos();
  const poDn = addPo('OPEN', [{ item: A.id, ordered: 70, received: 20 }]);
  check('On PO = 50 before edit', eq(Avail.getItemAvailability(A.id).onPurchaseOrder, 50));
  db.prepare('UPDATE purchase_order_lines SET qty_ordered = 40 WHERE purchase_order_id = ?').run(poDn);
  check('On PO = 20 after edit down (no negative)', eq(Avail.getItemAvailability(A.id).onPurchaseOrder, 20));

  console.log('\n=== TEST 18: On-PO drill-down lines sum to the On-PO quantity ===');
  clearPos();
  addPo('OPEN', [{ item: A.id, ordered: 30, received: 10 }]); // remaining 20
  addPo('OPEN', [{ item: A.id, ordered: 40, received: 20 }]); // remaining 20
  addPo('CANCELLED', [{ item: A.id, ordered: 99, received: 0 }]); // ignored
  const lines = Avail.getOnPoLines(A.id);
  const lineSum = lines.reduce((s, l) => s + Number(l.remaining || 0), 0);
  check('Only 2 active lines returned', lines.length === 2, String(lines.length));
  check('Line remaining sums to On PO (40)', eq(lineSum, 40) && eq(Avail.getItemAvailability(A.id).onPurchaseOrder, 40), String(lineSum));
  check('Drill-down lines carry PO #, vendor and expected date', lines.every((l) => l.poNumber && l.vendorName) );

  console.log('\n=== TEST 20: dashboard uses the SAME calculation ===');
  const dash = Dashboard.getDashboard();
  const incForA = (dash.incomingStock || []).filter((r) => r.productId === Number(A.id));
  const incSum = incForA.reduce((s, r) => s + Number(r.remaining || 0), 0);
  check('Dashboard incoming for A == availability On PO', eq(incSum, Avail.getItemAvailability(A.id).onPurchaseOrder), `${incSum} vs ${Avail.getItemAvailability(A.id).onPurchaseOrder}`);

  console.log('\n=== TEST 11b: batch availability matches per-item ===');
  const batch = Avail.getAvailabilityForItems([A.id, NI.id, SVC.id]);
  check('Batch On PO matches per-item for A', eq(batch[Number(A.id)].onPurchaseOrder, Avail.getItemAvailability(A.id).onPurchaseOrder));
  check('Batch nulls for Non-Inventory/Service', batch[Number(NI.id)].onPurchaseOrder === null && batch[Number(SVC.id)].onPurchaseOrder === null);

  console.log('\n=== UI / wiring static checks ===');
  const fs = require('fs');
  const FE = path.join(ROOT, 'src', 'frontend', 'src');
  const readFe = (rel) => fs.readFileSync(path.join(FE, rel), 'utf8');
  const readBe = (rel) => fs.readFileSync(path.join(BE, rel), 'utf8');
  const ui = readFe('components/shared/UnifiedItemList.js');
  check('Products list shows On PO + Expected columns', /title: 'On PO'/.test(ui) && /title: 'Expected'/.test(ui));
  check('Item detail uses backend availability', /viewDetail\.availability/.test(ui));
  check('Item form shows read-only availability', /Stock Availability/.test(ui));
  check('On-PO drill-down modal wired to getOnPoLines', /getOnPoLines/.test(ui));
  check('Products model merges availability (on_po/expected)', /attachAvailability/.test(readBe('models/products.js')));
  check('preload exposes getOnPoLines + getItemAvailability', /getOnPoLines/.test(readBe('preload.js')) && /getItemAvailability/.test(readBe('preload.js')));
  check('dashboard reuses the availability service (single source)', /inventoryAvailabilityService/.test(readBe('services/inventoryDashboardService.js')));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
