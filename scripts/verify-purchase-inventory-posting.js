/**
 * verify-purchase-inventory-posting.js — ONE physical receipt = ONE movement.
 *
 * Proves the root-cause fix: a goods receipt is the single physical stock event
 * for a PO purchase, and a vendor bill NEVER re-receives goods already received
 * (by line OR by header PO reference). Also proves direct bills still receive
 * once (Model B), partial receipts/bills aggregate, receipts are idempotent,
 * On-PO is ordered − received, and the QOH ledger reconciles.
 *
 * Run: $env:ELECTRON_RUN_AS_NODE="1"; & electron.exe scripts\verify-purchase-inventory-posting.js
 */
/* eslint-disable no-console */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-purchase-inventory' });

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const realLog = console.log.bind(console);
console.log = () => {};
const models = require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr')).raw;
console.log = realLog;
const { PurchaseOrders, Expenses } = models;
const Inventory = require(path.join(ROOT, 'src', 'backend', 'models', 'inventory'));
const Warehouses = require(path.join(ROOT, 'src', 'backend', 'models', 'warehouses'));
const Audit = require(path.join(ROOT, 'src', 'backend', 'services', 'inventoryPurchaseAudit'));

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`); }
};

const wh = Warehouses.getOrCreateDefault();
const supplier = db.prepare('SELECT id FROM suppliers LIMIT 1').get();
const template = db.prepare("SELECT * FROM products WHERE item_id IS NOT NULL AND type IN ('INVENTORY_PART','Inventory Part','Product') LIMIT 1").get();
if (!template) { console.log('  SKIP: no inventory product template in this DB'); process.exit(0); }

let seq = 0;
const RID = () => `${Date.now()}-${++seq}-${Math.floor(Math.random() * 1e6)}`;

function makeProduct(name) {
  const rid = RID();
  const item = db.prepare("INSERT INTO items (code, name, description, category, unitPrice, stock, createdAt) VALUES (?,?,?,?,?,0,datetime('now'))").run('TST-' + rid, name, '', '', 1900);
  const itemId = Number(item.lastInsertRowid);
  const cols = Object.keys(template).filter(c => c !== 'id');
  const vals = cols.map(c => (c === 'name' ? name : c === 'item_id' ? itemId : c === 'sku' ? 'TST-' + rid : template[c]));
  const prod = db.prepare(`INSERT INTO products (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
  const productId = Number(prod.lastInsertRowid);
  db.prepare('INSERT INTO item_stock (itemId, warehouseId, quantity, reorderPoint) VALUES (?,?,0,0)').run(itemId, wh.id);
  return { productId, itemId, name };
}

const qoh = (itemId) => Number((db.prepare('SELECT quantity FROM item_stock WHERE itemId=? AND warehouseId=?').get(itemId, wh.id) || {}).quantity || 0);
const movs = (itemId) => db.prepare('SELECT id, quantityChange, reason, sourceType, sourceId FROM stock_movements WHERE itemId=? ORDER BY id').all(itemId);
const ledgerSum = (itemId) => Number((db.prepare('SELECT COALESCE(SUM(quantityChange),0) AS q FROM stock_movements WHERE itemId=?').get(itemId) || {}).q || 0);

function makePO(itemId, qty, unitCost = 1900) {
  const po = db.prepare("INSERT INTO purchase_orders (po_number, vendor_id, po_date, status, subtotal, total) VALUES (?,?,?, 'OPEN', ?, ?)").run('TESTPO-' + RID(), supplier.id, '2026-01-01', qty * unitCost, qty * unitCost);
  const poId = Number(po.lastInsertRowid);
  const line = db.prepare("INSERT INTO purchase_order_lines (purchase_order_id, line_no, description, item_id, item_type, qty_ordered, qty_received, qty_billed, unit_cost) VALUES (?,1,?,?,?,?,0,0,?)").run(poId, 'line', itemId, 'INVENTORY_PART', qty, unitCost);
  return { poId, poLineId: Number(line.lastInsertRowid) };
}
const receive = (poId, poLineId, q, requestId) => PurchaseOrders.receive(poId, { requestId, lines: [{ purchaseOrderLineId: poLineId, qtyReceived: q }] });
const bill = (lines, ref) => Expenses.insertExpense(supplier.id, 'Accounts Payable', '2026-01-05', 'bill', ref, 'bill', 'system', 'Unpaid', lines, '2026-01-31', '', 30);
const billLine = (p, qty, poRef = {}) => ({ line_type: 'item', product_id: p.productId, description: p.name, quantity: qty, rate: 1900, amount: qty * 1900, warehouse_id: wh.id, purchase_order_id: poRef.poId ?? null, purchase_order_line_id: poRef.poLineId ?? null });

(async () => {
  console.log('\n=== TEST 1-3: PO → partial receipts (one event each) ===');
  {
    const p = makeProduct('TEST-MATTRESS-A');
    const { poId, poLineId } = makePO(p.productId, 5);
    check('TEST1 PO created → QOH 0, no movement', qoh(p.itemId) === 0 && movs(p.itemId).length === 0, { qoh: qoh(p.itemId), movs: movs(p.itemId) });
    const onPo = () => { const l = db.prepare('SELECT qty_ordered, qty_received FROM purchase_order_lines WHERE id=?').get(poLineId); return (Number(l.qty_ordered) - Number(l.qty_received)); };

    await receive(poId, poLineId, 1, 'req-1');
    check('TEST2 receive 1 → QOH 1, one movement, On PO 4', qoh(p.itemId) === 1 && movs(p.itemId).length === 1 && onPo() === 4, { qoh: qoh(p.itemId), movs: movs(p.itemId), onPo: onPo() });
    check('  movement is a receipt (sourceType receipt, reason PO RECEIPT)', movs(p.itemId)[0].sourceType === 'receipt' && movs(p.itemId)[0].reason === 'PO RECEIPT');

    await receive(poId, poLineId, 4, 'req-2');
    check('TEST3 receive 4 → QOH 5, two movements, On PO 0', qoh(p.itemId) === 5 && movs(p.itemId).length === 2 && onPo() === 0, { qoh: qoh(p.itemId), n: movs(p.itemId).length, onPo: onPo() });
    check('  no bill-and-receipt duplicate (0 bill movements)', movs(p.itemId).filter(m => m.sourceType === 'bill').length === 0);

    console.log('\n=== TEST 4: Create Bill from PO (line-linked) → NO stock ===');
    const b1 = await bill([billLine(p, 5, { poId, poLineId })], 'BILL-LINKED');
    check('bill saved', b1 && b1.success, b1);
    check('TEST4 linked bill does NOT change QOH (still 5)', qoh(p.itemId) === 5, qoh(p.itemId));
    check('  no new inventory movement from the bill', movs(p.itemId).length === 2, movs(p.itemId).length);

    console.log('\n=== ROOT-CAUSE: bill referencing PO by header only → NO stock ===');
    const b2 = await bill([billLine(p, 5, { poId, poLineId: null })], 'BILL-POID-ONLY');
    check('PO-id-only bill saved', b2 && b2.success, b2);
    check('PO-id-only bill does NOT re-receive (still 5)', qoh(p.itemId) === 5, qoh(p.itemId));
    check('  movement count unchanged', movs(p.itemId).length === 2, movs(p.itemId).length);
  }

  console.log('\n=== TEST 8: Bill BEFORE receipt (PO) → QOH 0 until received ===');
  {
    const p = makeProduct('TEST-MATTRESS-B');
    const { poId, poLineId } = makePO(p.productId, 5);
    const b = await bill([billLine(p, 5, { poId, poLineId })], 'BILL-BEFORE');
    check('bill-before-receipt saved', b && b.success, b);
    check('QOH stays 0 (physical event is the receipt)', qoh(p.itemId) === 0 && movs(p.itemId).length === 0, { qoh: qoh(p.itemId), movs: movs(p.itemId).length });
    await receive(poId, poLineId, 5, 'req-b');
    check('after receipt → QOH 5, exactly one movement', qoh(p.itemId) === 5 && movs(p.itemId).length === 1, { qoh: qoh(p.itemId), movs: movs(p.itemId).length });
  }

  console.log('\n=== TEST 9: partial BILLING (2 + 3) → no extra stock ===');
  {
    const p = makeProduct('TEST-MATTRESS-C');
    const { poId, poLineId } = makePO(p.productId, 5);
    await receive(poId, poLineId, 5, 'req-c');
    await bill([billLine(p, 2, { poId, poLineId })], 'BILL-C1');
    await bill([billLine(p, 3, { poId, poLineId })], 'BILL-C2');
    check('QOH still 5 (two linked bills added nothing)', qoh(p.itemId) === 5 && movs(p.itemId).length === 1, { qoh: qoh(p.itemId), n: movs(p.itemId).length });
  }

  console.log('\n=== TEST 12: DIRECT bill (no PO) → ONE receipt (Model B) ===');
  {
    const p = makeProduct('TEST-MATTRESS-D');
    const b = await bill([billLine(p, 5, {})], 'BILL-DIRECT');
    check('direct bill saved', b && b.success, b);
    check('direct bill receives exactly once (QOH 5, 1 movement)', qoh(p.itemId) === 5 && movs(p.itemId).length === 1, { qoh: qoh(p.itemId), n: movs(p.itemId).length });
    check('  movement sourceType is bill', movs(p.itemId)[0].sourceType === 'bill');
  }

  console.log('\n=== TEST 13: double-click receive (same requestId) → ONE receipt ===');
  {
    const p = makeProduct('TEST-MATTRESS-E');
    const { poId, poLineId } = makePO(p.productId, 5);
    const r1 = await receive(poId, poLineId, 5, 'dup-req');
    const r2 = await receive(poId, poLineId, 5, 'dup-req');
    check('second receive with same requestId is idempotent', r2 && r2.success && r2.idempotent === true, r2);
    check('QOH 5 and exactly one movement', qoh(p.itemId) === 5 && movs(p.itemId).length === 1, { qoh: qoh(p.itemId), n: movs(p.itemId).length });
  }

  console.log('\n=== TEST 6/7: sale issues stock; final QOH = received − sold ===');
  {
    const p = makeProduct('TEST-MATTRESS-S');
    const { poId, poLineId } = makePO(p.productId, 5);
    await receive(poId, poLineId, 5, 'req-s');
    Inventory.issueStock(p.itemId, wh.id, 1, 1900, { sourceType: 'invoice', sourceId: 900001 });
    check('after receiving 5 and selling 1 → QOH 4', qoh(p.itemId) === 4, qoh(p.itemId));
    check('movements: +5 then -1', movs(p.itemId).map(m => m.quantityChange).join(',') === '5,-1', movs(p.itemId));
  }

  console.log('\n=== TEST 15/16/17/18: reconciliation ===');
  {
    const r = Audit.reconcileQoh();
    check('ledger QOH reconciles to cached item_stock (0 mismatches)', r.mismatchCount === 0, r.mismatches.slice(0, 5));
    const p = makeProduct('TEST-MATTRESS-R');
    check('ledger sum equals cached QOH for a sampled item', ledgerSum(p.itemId) === qoh(p.itemId), { ledger: ledgerSum(p.itemId), cached: qoh(p.itemId) });
  }

  console.log('\n=== historical duplicate audit (read-only) ===');
  {
    const p = makeProduct('TEST-MATTRESS-DUP');
    const { poId, poLineId } = makePO(p.productId, 5);
    await receive(poId, poLineId, 5, 'req-dup');
    // Fabricate the OLD bug: a PO-linked bill movement for the same PO/item.
    db.prepare("INSERT INTO expenses (id, payee, payment_account, category, approval_status) VALUES (777001, ?, 'Accounts Payable', 'bill', 'Unpaid')").run(supplier.id);
    db.prepare("INSERT INTO stock_movements (itemId, warehouseId, quantityChange, reason, sourceType, sourceId, sourceLineId, movedAt) VALUES (?,?,?, 'PURCHASE RECEIPT', 'bill', 777001, NULL, datetime('now'))").run(p.itemId, wh.id, 5);
    db.prepare("INSERT INTO item_stock (itemId, warehouseId, quantity, reorderPoint) VALUES (?,?,?,0) ON CONFLICT(itemId, warehouseId) DO UPDATE SET quantity = quantity + 5").run(p.itemId, wh.id, 5);
    db.prepare("INSERT INTO expense_lines (expense_id, category, description, amount, line_type, product_id, quantity, rate, purchase_order_id, purchase_order_line_id) VALUES (777001,'Inventory','dup',9500,'item',?,5,1900,?,NULL)").run(p.productId, poId);
    const before = movs(p.itemId).length;
    const audit = Audit.auditDuplicatePurchaseMovements();
    const hit = audit.duplicateGroups.find(g => g.itemId === p.itemId);
    check('audit flags the receipt+bill duplicate group', !!hit, audit.duplicateGroups.map(g => g.itemName));
    check('  reports receipt vs bill quantity + overstatement', hit && hit.receiptQty === 5 && hit.billQty === 5 && hit.overStatedQty === 5, hit);
    check('audit does NOT mutate (movement count unchanged)', movs(p.itemId).length === before, { before, after: movs(p.itemId).length });
  }

  console.log('\n=== static wiring ===');
  {
    const exp = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'models', 'expenses.js'), 'utf8');
    check('bill stock guard filters on purchase_order_id AND purchase_order_line_id', /r\.purchase_order_id == null && r\.purchase_order_line_id == null/.test(exp));
    const po = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'models', 'purchaseOrders.js'), 'utf8');
    check('receipt has a client_request_id idempotency key', /client_request_id/.test(po) && /idempotent: true/.test(po));
    const inv = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'models', 'inventory.js'), 'utf8');
    check('receipt movements are labelled with the receipt document', /Receipt \$\{r\.receiptNumber/.test(inv));
    check('audit + reconciliation service exists', /auditDuplicatePurchaseMovements/.test(fs.readFileSync(path.join(ROOT, 'src', 'backend', 'services', 'inventoryPurchaseAudit.js'), 'utf8')));
    const preload = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'preload.js'), 'utf8');
    check('preload exposes getInventoryPurchaseAudit', /getInventoryPurchaseAudit/.test(preload));
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
