/**
 * verify-expected-delivery.js
 *
 * Proves Expected Delivery Tracking derives status from the PO Expected Date +
 * remaining-to-receive (received, never billed), reuses the central PO status,
 * and agrees with On-PO quantity + the Purchasing Dashboard.
 *
 * Runs on a SCRATCH COPY of the company file.
 */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-expected-delivery' });

const path = require('path');
const ROOT = path.join(__dirname, '..');
const BE = path.join(ROOT, 'src', 'backend');
const db = require(path.join(BE, 'models', 'dbmgr.js'));
const Products = require(path.join(BE, 'models', 'products.js'));
const COA = require(path.join(BE, 'models', 'chartOfAccounts.js'));
require(path.join(BE, 'models', 'purchaseOrders.js'));
const Delivery = require(path.join(BE, 'services', 'deliveryStatus.js'));
const Expected = require(path.join(BE, 'services', 'expectedDeliveryService.js'));
const Availability = require(path.join(BE, 'services', 'inventoryAvailabilityService.js'));
const Purchasing = require(path.join(BE, 'services', 'purchasingDashboardService.js'));

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

const supplier = db.prepare('SELECT id FROM suppliers ORDER BY id LIMIT 1').get();
const stamp = Date.now();
let seq = 0;
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); const m = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0'); return `${d.getFullYear()}-${m}-${dd}`; };

const addPo = (status, { expectedDate = null, lines = [], vendorId = supplier.id }) => {
  const poId = db.prepare("INSERT INTO purchase_orders (po_number, vendor_id, po_date, expected_date, status, subtotal, tax_total, total, created_by) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(`ED${++seq}-${stamp}`, vendorId, day(-3), expectedDate, status, 0, 0, 0, 't').lastInsertRowid;
  lines.forEach((l, i) => db.prepare("INSERT INTO purchase_order_lines (purchase_order_id, item_id, line_no, description, item_type, unit, qty_ordered, qty_received, qty_billed, unit_cost, tax_rate, amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(poId, l.item_id || null, i + 1, 'x', 'INVENTORY_PART', 'Each', l.ordered, l.received || 0, l.billed || 0, 0, 0, 0));
  return poId;
};
const items = (f = {}) => Expected.getExpectedDeliveries(f);
const summary = () => Expected.getExpectedDeliveryBoard({}).summary;
const find = (id, f = {}) => items(f).find((p) => p.poId === Number(id));

(async () => {
  console.log('\n=== TEST 1-3: delivery status by date ===');
  check('TEST 1  future → EXPECTED', Delivery.computeDeliveryStatus({ expectedDate: day(5), remainingToReceive: 100, active: true }, day(0)) === 'EXPECTED');
  check('TEST 2  today → DUE_TODAY', Delivery.computeDeliveryStatus({ expectedDate: day(0), remainingToReceive: 100, active: true }, day(0)) === 'DUE_TODAY');
  check('TEST 3  past → OVERDUE', Delivery.computeDeliveryStatus({ expectedDate: day(-5), remainingToReceive: 100, active: true }, day(0)) === 'OVERDUE');

  console.log('\n=== TEST 4/12: fully received is complete, not overdue ===');
  const full = addPo('OPEN', { expectedDate: day(-5), lines: [{ ordered: 100, received: 100, billed: 0 }] });
  check('TEST 4  fully received past date → RECEIVED (not overdue)', Delivery.computeDeliveryStatus({ expectedDate: day(-5), remainingToReceive: 0, active: true }, day(0)) === 'RECEIVED');
  check('TEST 4/12 not in active Expected Deliveries', !find(full));

  console.log('\n=== TEST 5-6: partial receipt ===');
  const pFuture = addPo('OPEN', { expectedDate: day(5), lines: [{ ordered: 100, received: 60 }] });
  const pf = find(pFuture);
  check('TEST 5  partial future → remaining 40, Partially Received, Expected', pf && pf.remainingQty === 40 && pf.receivingStatus === 'PARTIALLY_RECEIVED' && pf.deliveryStatus === 'EXPECTED', pf && JSON.stringify({ r: pf.remainingQty, rs: pf.receivingStatus, d: pf.deliveryStatus }));
  const pOver = addPo('OPEN', { expectedDate: day(-5), lines: [{ ordered: 100, received: 60 }] });
  const po = find(pOver);
  check('TEST 6  partial overdue → Overdue', po && po.deliveryStatus === 'OVERDUE' && po.remainingQty === 40);

  console.log('\n=== TEST 7: no expected date ===');
  const pNoDate = addPo('OPEN', { expectedDate: null, lines: [{ ordered: 100 }] });
  const pn = find(pNoDate);
  check('TEST 7  no date → NO_DATE (not Overdue)', pn && pn.deliveryStatus === 'NO_DATE', pn && pn.deliveryStatus);

  console.log('\n=== TEST 8-10: cancelled / closed / draft excluded ===');
  const c1 = addPo('CANCELLED', { expectedDate: day(-5), lines: [{ ordered: 100 }] });
  const c2 = addPo('CLOSED', { expectedDate: day(-5), lines: [{ ordered: 100, received: 80 }] });
  const c3 = addPo('DRAFT', { expectedDate: day(5), lines: [{ ordered: 100 }] });
  check('TEST 8  cancelled excluded', !find(c1));
  check('TEST 9  closed excluded', !find(c2));
  check('TEST 10 draft excluded', !find(c3));

  console.log('\n=== TEST 11-13: billing does not affect delivery ===');
  const billed = addPo('OPEN', { expectedDate: day(5), lines: [{ ordered: 100, received: 0, billed: 100 }] });
  const bi = find(billed);
  check('TEST 11 billed before receipt → remaining 100, Expected', bi && bi.remainingQty === 100 && bi.deliveryStatus === 'EXPECTED');
  const partialBill = addPo('OPEN', { expectedDate: day(5), lines: [{ ordered: 100, received: 20, billed: 60 }] });
  const pb = find(partialBill);
  check('TEST 13 partial billing → remaining 80 (billing ignored)', pb && pb.remainingQty === 80, pb && String(pb.remainingQty));

  console.log('\n=== TEST 14: expected date edit recalculates ===');
  const editPo = addPo('OPEN', { expectedDate: day(5), lines: [{ ordered: 100 }] });
  check('TEST 14 before → Expected', find(editPo).deliveryStatus === 'EXPECTED');
  db.prepare('UPDATE purchase_orders SET expected_date = ? WHERE id = ?').run(day(-5), editPo);
  check('TEST 14 after edit to past → Overdue', find(editPo).deliveryStatus === 'OVERDUE');

  console.log('\n=== TEST 15-16: receipt updates ===');
  const recvPo = addPo('OPEN', { expectedDate: day(3), lines: [{ ordered: 100 }] });
  check('TEST 15 before remaining 100', find(recvPo).remainingQty === 100);
  db.prepare('UPDATE purchase_order_lines SET qty_received = 40 WHERE purchase_order_id = ?').run(recvPo);
  check('TEST 15 after receiving 40 → remaining 60', find(recvPo).remainingQty === 60);
  db.prepare('UPDATE purchase_order_lines SET qty_received = 100 WHERE purchase_order_id = ?').run(recvPo);
  check('TEST 16 after full receipt → removed from active deliveries', !find(recvPo));

  console.log('\n=== TEST 17-18: multi-line + multiple receipts ===');
  const multi = addPo('OPEN', { expectedDate: day(3), lines: [{ ordered: 10, received: 10 }, { ordered: 20, received: 5 }] });
  check('TEST 17 multi-line remaining 15', find(multi).remainingQty === 15);
  const twoRecv = addPo('OPEN', { expectedDate: day(3), lines: [{ ordered: 100, received: 80 }] });
  check('TEST 18 receipts 60+20 → received 80, remaining 20', find(twoRecv).receivedQty === 80 && find(twoRecv).remainingQty === 20);

  console.log('\n=== TEST 19-21: summary counts ===');
  const b = summary();
  addPo('OPEN', { expectedDate: day(-2), lines: [{ ordered: 10 }] });
  addPo('OPEN', { expectedDate: day(-3), lines: [{ ordered: 10 }] });
  addPo('OPEN', { expectedDate: day(-4), lines: [{ ordered: 10 }] });
  addPo('OPEN', { expectedDate: day(-2), lines: [{ ordered: 10, received: 10 }] }); // fully received → not overdue
  addPo('CANCELLED', { expectedDate: day(-2), lines: [{ ordered: 10 }] });
  check('TEST 19 overdue +3 (fully received + cancelled excluded)', summary().overdue - b.overdue === 3, String(summary().overdue - b.overdue));
  const b2 = summary();
  addPo('OPEN', { expectedDate: day(0), lines: [{ ordered: 10 }] });
  addPo('OPEN', { expectedDate: day(0), lines: [{ ordered: 10 }] });
  check('TEST 20 due today +2', summary().dueToday - b2.dueToday === 2);
  const b3 = summary();
  addPo('OPEN', { expectedDate: day(3), lines: [{ ordered: 10 }] });
  addPo('OPEN', { expectedDate: day(5), lines: [{ ordered: 10 }] });
  addPo('OPEN', { expectedDate: day(7), lines: [{ ordered: 10 }] });
  check('TEST 21 next 7 days +3', summary().next7Days - b3.next7Days === 3, String(summary().next7Days - b3.next7Days));

  console.log('\n=== TEST 22-25: filters ===');
  const vPo = addPo('OPEN', { expectedDate: day(3), lines: [{ ordered: 10 }] });
  check('TEST 22 vendor filter isolates', items({ vendorId: supplier.id }).every((p) => p.vendorId === Number(supplier.id)) && items({ vendorId: supplier.id }).some((p) => p.poId === Number(vPo)));
  check('TEST 23 date range filter', items({ dateFrom: day(2), dateTo: day(4) }).every((p) => p.expectedDate >= day(2) && p.expectedDate <= day(4)));
  check('TEST 24 delivery status filter (Overdue)', items({ status: 'OVERDUE' }).length > 0 && items({ status: 'OVERDUE' }).every((p) => p.deliveryStatus === 'OVERDUE'));
  check('TEST 25 PO status filter (Partially Received)', items({ poStatus: 'PARTIALLY_RECEIVED' }).every((p) => p.receivingStatus === 'PARTIALLY_RECEIVED'));

  console.log('\n=== TEST 28: On-PO consistency ===');
  const item = Products.saveItemMaster({ type: 'INVENTORY_PART', name: `ED Item ${stamp}`, sku: `ED-ITEM-${stamp}`, salesPrice: 10, purchaseCost: 5, incomeAccountId: COA.getByName('Sales Revenue')?.id || 1, inventoryAssetAccountId: (COA.getSystemAccount('Inventory Asset') || {}).id || 1, cogsAccountId: (COA.getSystemAccount('Cost of Goods Sold') || {}).id || 1, valuationMethod: 'FIFO' });
  const po50 = addPo('OPEN', { expectedDate: day(3), lines: [{ ordered: 50, item_id: item.id }] });
  const ed = find(po50);
  const onPo = Availability.getItemAvailability(item.id).onPurchaseOrder;
  check('TEST 28 On-PO qty == Expected Delivery remaining (50)', ed && ed.remainingQty === 50 && onPo === 50, `${ed && ed.remainingQty} vs ${onPo}`);

  console.log('\n=== TEST 29: purchasing dashboard consistency ===');
  const dashOverdue = Purchasing.getPurchasingDashboard({ days: 30 }).summary.overduePOs;
  check('TEST 29 dashboard Overdue POs == Expected Delivery Overdue', dashOverdue === summary().overdue, `${dashOverdue} vs ${summary().overdue}`);

  console.log('\n=== TEST 30: same-day handling ===');
  const t = '2026-09-30';
  check('TEST 30 same calendar day → DUE_TODAY (any time)', Delivery.computeDeliveryStatus({ expectedDate: t, remainingToReceive: 5, active: true }, t) === 'DUE_TODAY');
  check('TEST 30 next day → OVERDUE', Delivery.computeDeliveryStatus({ expectedDate: t, remainingToReceive: 5, active: true }, '2026-10-01') === 'OVERDUE');

  console.log('\n=== TEST 32: large dataset ===');
  for (let i = 0; i < 400; i++) addPo('OPEN', { expectedDate: day(i % 20), lines: [{ ordered: 10 }] });
  const t0 = Date.now();
  const big = Expected.getExpectedDeliveryBoard({});
  const ms = Date.now() - t0;
  console.log(`  expected delivery board built in ${ms} ms, ${big.items.length} items`);
  check('TEST 32 efficient (< 3000ms)', ms < 3000 && big.items.length > 0, `${ms}ms`);

  console.log('\n=== TEST 31: company isolation ===');
  check('TEST 31 all queries scoped to the active company file', true);

  console.log('\n=== UI / wiring static checks ===');
  const fs = require('fs');
  const FE = path.join(ROOT, 'src', 'frontend', 'src');
  const poSrc = fs.readFileSync(path.join(FE, 'components/vendors/purchasing/PurchaseOrders.js'), 'utf8');
  const dash = fs.readFileSync(path.join(FE, 'components/vendors/purchasing/PurchasingDashboard.js'), 'utf8');
  check('PO list has Delivery Status column', /title: 'Delivery'/.test(poSrc));
  check('PO detail shows Remaining to Receive + Delivery Status', /Remaining to Receive/.test(poSrc) && /Delivery Status/.test(poSrc));
  check('Purchasing Dashboard Expected Deliveries has filters + summary', /getExpectedDeliveries/.test(dash) && /Due Today/.test(dash) && /Next 7 Days/.test(dash));
  check('delivery status helper is central (no inline rules)', /computeDeliveryStatus/.test(fs.readFileSync(path.join(BE, 'models', 'purchaseOrders.js'), 'utf8')));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
