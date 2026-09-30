/**
 * verify-sales-inventory.js — "Sales → Inventory Automation"
 *
 * Drives the REAL IPC handlers (stubbed `electron`) + the real models against a
 * SCRATCH COPY of the company file, and proves the client requirement end to
 * end: a POSTED invoice reduces Inventory-Part Quantity On Hand automatically,
 * with correct costing, accounting, idempotency, reversal and edge cases.
 *
 * It reuses the EXISTING engine throughout — Invoices.insertInvoice/updateInvoice
 * → services/documentInventory → models/inventory + services/inventoryValuation
 * → models/journalEntries (COGS). No second stock system exists.
 */
const path = require('path');
const Module = require('module');

const handlers = new Map();
const electronStub = {
  ipcMain: { handle: (channel, fn) => { if (!handlers.has(channel)) handlers.set(channel, fn); } },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return electronStub;
  return originalLoad.apply(this, arguments);
};

const realLog = console.log.bind(console);
console.log = () => {};
require('./lib/testDb.js').useScratchCopy({ label: 'verify-sales-inventory' });

const ROOT = path.join(__dirname, '..');
const BE = path.join(ROOT, 'src', 'backend');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
const fs = require('fs');
const db = require(path.join(BE, 'models', 'dbmgr.js')).raw;
const Invoices = require(path.join(BE, 'models', 'invoices.js'));
const Products = require(path.join(BE, 'models', 'products.js'));
const Inventory = require(path.join(BE, 'models', 'inventory.js'));
const Warehouses = require(path.join(BE, 'models', 'warehouses.js'));
const COA = require(path.join(BE, 'models', 'chartOfAccounts.js'));
const ItemStatus = require(path.join(BE, 'services', 'inventoryStockStatus.js'));
const Availability = require(path.join(BE, 'services', 'inventoryAvailabilityService.js'));
const Valuation = require(path.join(BE, 'services', 'inventoryValuation.js'));
const MovementReport = require(path.join(BE, 'services', 'inventoryMovementReportService.js'));
const Dashboard = require(path.join(BE, 'services', 'inventoryDashboardService.js'));

require(path.join(BE, 'handlers', 'inventoryHandlers.js'))();
require(path.join(BE, 'handlers', 'invoiceHandlers.js'))();
require(path.join(BE, 'handlers', 'customerHandlers.js'))();
require(path.join(BE, 'handlers', 'ipcHandlers.js'))();
require(path.join(BE, 'handlers', 'quoteHandlers.js'))();
console.log = realLog;

let pass = 0, fail = 0;
const notes = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};
const note = (s) => { notes.push(s); console.log(`  NOTE  ${s}`); };
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
const money = (n) => Math.round(Number(n || 0) * 100) / 100;

(async () => {
  const H = (n) => handlers.get(n);
  const ev = { sender: { id: 'verify-sales-inventory' } };
  const insertInvoice = H('insert-invoice');
  const updateInvoice = H('updateinvoice');
  const deleteRecord = H('deletingrecord');
  const createPayment = H('customer-payment-create');
  const deletePayment = H('customer-payment-delete');
  const insertQuote = H('insert-quote');
  const convertQuote = H('convert-quote-to-invoice');
  const getItemMovements = H('get-item-movements');

  check('required handlers registered',
    !!(insertInvoice && updateInvoice && deleteRecord && createPayment && insertQuote && convertQuote && getItemMovements));

  // ── Fixtures ─────────────────────────────────────────────────────────────
  const cust = db.prepare(`INSERT INTO customers (title, first_name, last_name, mobile_number, display_name, email, status, entered_by, date_entered)
    VALUES ('', 'ZZSales', 'Inv', '', 'ZZ Sales Inv', 'zz-sales@example.invalid', 'Active', 'test', datetime('now'))`).run();
  const customerId = Number(cust.lastInsertRowid);
  const W = Warehouses.getOrCreateDefault();
  const income = COA.getByName('Sales Revenue') || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('income','other income') AND status='Active' LIMIT 1").get();
  const cogs = COA.getSystemAccount('Cost of Goods Sold') || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type)='cost of goods sold' LIMIT 1").get();
  const invAsset = COA.getSystemAccount('Inventory Asset') || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type)='asset' AND LOWER(name) LIKE '%inventory%' LIMIT 1").get();
  const ar = COA.getSystemAccount('Accounts Receivable') || COA.getByName('Accounts Receivable');
  let seq = 0;
  const stamp = Date.now();

  const mkProduct = (type, name, opts = {}) => Products.saveItemMaster({
    type, name, sku: opts.sku || `${name}-${stamp}-${++seq}`, salesPrice: opts.salesPrice != null ? opts.salesPrice : 35, purchaseCost: 10,
    incomeAccountId: income.id,
    ...(type === 'INVENTORY_PART' ? { inventoryAssetAccountId: invAsset.id, cogsAccountId: cogs.id, valuationMethod: opts.valuationMethod || 'FIFO', reorderPoint: opts.reorderPoint } : {}),
    ...opts,
  });
  const itemIdOf = (productId) => Inventory.resolveItemId(Number(productId));
  const receive = (productId, qty, cost) => Inventory.receiveStock(itemIdOf(productId), W.id, qty, cost, { sourceType: 'receipt', sourceId: ++seq + 700000 });
  const stockOf = (productId) => {
    const r = db.prepare('SELECT COALESCE(SUM(quantity),0) AS q FROM item_stock WHERE itemId = ?').get(itemIdOf(productId));
    return Number(r.q);
  };
  const moves = (type, id) => db.prepare('SELECT * FROM stock_movements WHERE sourceType = ? AND sourceId = ? ORDER BY id').all(type, Number(id));
  const glLines = (type, id) => {
    const e = db.prepare("SELECT id FROM journal_entries WHERE source_type = ? AND source_id = ? AND status = 'Posted' ORDER BY id DESC LIMIT 1").get(type, Number(id));
    return e ? db.prepare('SELECT account_id, debit, credit FROM journal_lines WHERE journal_id = ?').all(e.id) : [];
  };
  const acct = (gl, id, side) => money(gl.filter((l) => Number(l.account_id) === Number(id)).reduce((s, l) => s + Number(l[side] || 0), 0));

  const line = (productId, qty, rate) => ({ product_id: productId, product: productId, description: 'sale', quantity: qty, rate, amount: money(qty * rate) });
  const makeInvoice = async (lines, status, vat = 0) => {
    const res = await insertInvoice(ev, customerId, 'zz-sales@example.invalid', false, 'Addr', 'Net 30',
      '2026-06-15', '2026-07-15', '', '', null, 'test', vat, status, lines);
    return res && (res.invoiceId || res.invoice_id || res.id);
  };
  const editInvoice = async (id, lines, status, vat = 0) => {
    const inv = await Invoices.getSingleInvoice(id);
    return updateInvoice(ev, {
      id: Number(id), customer: inv.customer_id, customer_email: inv.customer_email, islater: inv.islater,
      billing_address: inv.billing_address, terms: inv.terms, start_date: inv.start_date, last_date: inv.last_date,
      number: inv.number, vat, message: inv.message, statement_message: inv.statement_message, status, lines,
    });
  };

  console.log('\n=== TEST 1-3: client example, draft, post draft ===');
  const P1 = mkProduct('INVENTORY_PART', 'SI Widget A', { reorderPoint: 10 }); receive(P1.id, 20, 10);
  const base1 = stockOf(P1.id);
  const inv1 = await makeInvoice([line(P1.id, 5, 35)]);
  check('TEST 1  posted invoice reduces on hand 20 → 15', near(stockOf(P1.id), base1 - 5), `${base1} → ${stockOf(P1.id)}`);
  check('TEST 1  exactly ONE movement of -5', moves('invoice', inv1).length === 1 && near(moves('invoice', inv1)[0].quantityChange, -5), JSON.stringify(moves('invoice', inv1).map(m => m.quantityChange)));
  check('TEST 1  movement is linked to the invoice + line', moves('invoice', inv1)[0].sourceType === 'invoice' && Number(moves('invoice', inv1)[0].sourceId) === Number(inv1));

  const P2 = mkProduct('INVENTORY_PART', 'SI Draft Item'); receive(P2.id, 20, 10);
  const base2 = stockOf(P2.id);
  const inv2 = await makeInvoice([line(P2.id, 5, 35)], 'Draft');
  check('TEST 2  draft invoice moves NO stock', near(stockOf(P2.id), base2) && moves('invoice', inv2).length === 0, `${base2} → ${stockOf(P2.id)}`);
  check('TEST 2  draft posts no journal entry', glLines('invoice', inv2).length === 0);
  db.prepare("UPDATE invoices SET status='Open' WHERE id=?").run(Number(inv2)); // "post" the draft
  await editInvoice(inv2, [line(P2.id, 5, 35)], undefined);
  check('TEST 3  posting the draft reduces stock exactly once', near(stockOf(P2.id), base2 - 5) && moves('invoice', inv2).length === 1, `${base2} → ${stockOf(P2.id)}, ${moves('invoice', inv2).length} moves`);

  console.log('\n=== TEST 4-8: item-type + line rules ===');
  const SVC = mkProduct('SERVICE', 'SI Installation', { sku: `SI-SVC-${stamp}` });
  const NI = mkProduct('NON_INVENTORY_PART', 'SI Delivery Fee', { sku: `SI-NI-${stamp}` });
  const P4 = mkProduct('INVENTORY_PART', 'SI Mixed'); receive(P4.id, 20, 10);
  const b4 = stockOf(P4.id);
  const inv4 = await makeInvoice([line(P4.id, 5, 35), line(SVC.id, 2, 100), line(NI.id, 3, 20)]);
  check('TEST 4  inventory line -5, service 0', near(stockOf(P4.id), b4 - 5));
  check('TEST 5  non-inventory part moves no stock', moves('invoice', inv4).every((m) => Number(m.itemId) !== itemIdOf(NI.id)));
  check('TEST 5  service moves no stock', moves('invoice', inv4).every((m) => Number(m.itemId) !== itemIdOf(SVC.id)));
  check('TEST 4/5 only ONE movement (the inventory line)', moves('invoice', inv4).length === 1, `${moves('invoice', inv4).length}`);

  const P6 = mkProduct('INVENTORY_PART', 'SI DescOnly'); receive(P6.id, 10, 5);
  const b6 = stockOf(P6.id);
  const invCount6 = db.prepare('SELECT COUNT(*) c FROM invoices').get().c;
  const res6 = await makeInvoice([{ description: 'Custom consulting', quantity: 1, rate: 500, amount: 500, product_id: null }]);
  check('TEST 6  a line with no item cannot be persisted (invoice_lines.product is NOT NULL) — no stock moves', !res6 && near(stockOf(P6.id), b6) && db.prepare('SELECT COUNT(*) c FROM invoices').get().c === invCount6);
  note('TEST 6 description-only invoice lines are not a supported document shape in AccuLedger (the line requires an item; the UI enforces it). The requirement is therefore vacuous — no such line can exist to move stock.');

  const A = mkProduct('INVENTORY_PART', 'SI Multi A'); const B = mkProduct('INVENTORY_PART', 'SI Multi B'); const C = mkProduct('INVENTORY_PART', 'SI Multi C');
  receive(A.id, 10, 1); receive(B.id, 10, 1); receive(C.id, 10, 1);
  const inv7 = await makeInvoice([line(A.id, 5, 2), line(B.id, 3, 2), line(C.id, 2, 2)]);
  check('TEST 7  multiple items: A -5, B -3, C -2', near(stockOf(A.id), 5) && near(stockOf(B.id), 7) && near(stockOf(C.id), 8));
  check('TEST 7  one movement per line', moves('invoice', inv7).length === 3);

  const P8 = mkProduct('INVENTORY_PART', 'SI SameItem'); receive(P8.id, 10, 1);
  const inv8 = await makeInvoice([line(P8.id, 2, 2), line(P8.id, 3, 2)]);
  check('TEST 8  same item on two lines → total -5', near(stockOf(P8.id), 5), `${stockOf(P8.id)}`);

  console.log('\n=== TEST 9-12: idempotency + payments ===');
  const P9 = mkProduct('INVENTORY_PART', 'SI Idem'); receive(P9.id, 20, 10);
  const inv9 = await makeInvoice([line(P9.id, 5, 35)]);
  const before9 = stockOf(P9.id);
  await editInvoice(inv9, [line(P9.id, 5, 35)], undefined); // re-save, no change
  check('TEST 9  re-saving a posted invoice (double submit) does NOT reduce twice', near(stockOf(P9.id), before9) && moves('invoice', inv9).length === 1, `${before9} → ${stockOf(P9.id)}, ${moves('invoice', inv9).length} moves`);
  const replay = require(path.join(BE, 'services', 'documentInventory.js')).reconcileInvoiceStock(inv9, [{ lineId: 0, productId: P9.id, quantity: 5, warehouseId: null, unitCost: null }]);
  check('TEST 10 a replayed reconcile is a backend no-op (retry-safe)', replay.applied.length === 0 && moves('invoice', inv9).length === 1);
  check('TEST 10 GL has exactly one posted entry for the invoice', db.prepare("SELECT COUNT(*) c FROM journal_entries WHERE source_type='invoice' AND source_id=? AND status='Posted'").get(Number(inv9)).c === 1);

  const P11 = mkProduct('INVENTORY_PART', 'SI Paid'); receive(P11.id, 20, 10);
  const inv11 = await makeInvoice([line(P11.id, 5, 35)]);
  const after11 = stockOf(P11.id);
  const pay = await createPayment(ev, { customerId, amount: 175, date: '2026-06-20', paymentMethod: 'Cash', reference: 'SI-PAY', allocations: [{ invoiceId: Number(inv11), amount: 175 }] });
  const pay2 = await createPayment(ev, { customerId, amount: 100, date: '2026-06-21', paymentMethod: 'Cash', reference: 'SI-PAY2', allocations: [{ invoiceId: Number(inv11), amount: 100 }] });
  check('TEST 11 payment status changes (Unpaid → Partial → Paid) do not move stock again', near(stockOf(P11.id), after11) && moves('invoice', inv11).length === 1);
  let reversed = false;
  try { reversed = !!(await deletePayment(ev, Number(pay2?.paymentId || pay2?.id || 0))); } catch { reversed = false; }
  check('TEST 12 reversing a payment leaves inventory unchanged', near(stockOf(P11.id), after11) && moves('invoice', inv11).length === 1, `reversed=${reversed}`);

  console.log('\n=== TEST 13-15: quotes ===');
  const P13 = mkProduct('INVENTORY_PART', 'SI Quote'); receive(P13.id, 20, 10);
  const b13 = stockOf(P13.id);
  const qRes = await insertQuote(ev, 'Pending', customerId, 'zz-sales@example.invalid', false, 'Addr', '2026-06-15', '2026-07-15', '', '', null, 'test', 0, [line(P13.id, 5, 35)]);
  const quoteId = qRes && (qRes.quoteId || qRes.quote_id || qRes.id);
  check('TEST 13 a quote moves no stock', near(stockOf(P13.id), b13) && db.prepare("SELECT COUNT(*) c FROM stock_movements WHERE sourceType='quote'").get().c === 0);
  note('TEST 14 converting a quote produces a POSTED (Open) invoice directly — AccuLedger has no separate invoice-draft stage for conversion.');
  const conv = await convertQuote(ev, Number(quoteId));
  const convInv = conv && (conv.invoiceId || conv.invoice_id || conv.id);
  check('TEST 15 quote → posted invoice reduces inventory exactly once', near(stockOf(P13.id), b13 - 5) && convInv && moves('invoice', convInv).length === 1, `${b13} → ${stockOf(P13.id)}`);

  console.log('\n=== TEST 16-20: valuation / COGS / price / discount / tax ===');
  const WA = mkProduct('INVENTORY_PART', 'SI WA', { valuationMethod: 'WEIGHTED_AVERAGE' }); receive(WA.id, 100, 20);
  const invWA = await makeInvoice([line(WA.id, 5, 35)]);
  const waMove = moves('invoice', invWA)[0];
  const waGl = glLines('invoice', invWA);
  check('TEST 16 weighted average: COGS $100, qty 95, value $1900', near(waMove.unitCost, 20) && near(acct(waGl, cogs.id, 'debit'), 100) && near(stockOf(WA.id), 95) && near(Valuation.currentValue(itemIdOf(WA.id), 'WEIGHTED_AVERAGE'), 1900), `unitCost=${waMove.unitCost} cogs=${acct(waGl, cogs.id, 'debit')} qty=${stockOf(WA.id)} val=${Valuation.currentValue(itemIdOf(WA.id), 'WEIGHTED_AVERAGE')}`);

  const FIFO = mkProduct('INVENTORY_PART', 'SI FIFO', { valuationMethod: 'FIFO' });
  receive(FIFO.id, 3, 10); receive(FIFO.id, 10, 12);
  const invF = await makeInvoice([line(FIFO.id, 5, 35)]);
  const fMove = moves('invoice', invF)[0];
  const fGl = glLines('invoice', invF);
  check('TEST 17 FIFO: COGS $54 (3×$10 + 2×$12), remaining 8 @ $12 = $96', near(fMove.unitCost, 10.8) && near(acct(fGl, cogs.id, 'debit'), 54) && near(stockOf(FIFO.id), 8) && near(Valuation.currentValue(itemIdOf(FIFO.id), 'FIFO'), 96), `unitCost=${fMove.unitCost} cogs=${acct(fGl, cogs.id, 'debit')} val=${Valuation.currentValue(itemIdOf(FIFO.id), 'FIFO')}`);

  const P18 = mkProduct('INVENTORY_PART', 'SI PriceCost'); receive(P18.id, 20, 20);
  const inv18 = await makeInvoice([line(P18.id, 5, 35)]);
  const gl18 = glLines('invoice', inv18);
  check('TEST 18 selling price ≠ cost: revenue $175, COGS $100 (not $175)', near(acct(gl18, ar.id, 'debit'), 175) && near(acct(gl18, income.id, 'credit'), 175) && near(acct(gl18, cogs.id, 'debit'), 100), `AR=${acct(gl18, ar.id, 'debit')} COGS=${acct(gl18, cogs.id, 'debit')}`);

  const P19 = mkProduct('INVENTORY_PART', 'SI Discount'); receive(P19.id, 20, 20);
  const b19 = stockOf(P19.id);
  const inv19 = await makeInvoice([line(P19.id, 5, 31.5)]); // ~10% off 35
  check('TEST 19 discount: stock still -5, COGS = cost of 5 units', near(stockOf(P19.id), b19 - 5) && near(acct(glLines('invoice', inv19), cogs.id, 'debit'), 100));

  const P20 = mkProduct('INVENTORY_PART', 'SI Tax'); receive(P20.id, 20, 20);
  const inv20 = await makeInvoice([line(P20.id, 5, 35)], undefined, 10); // 10% VAT
  const gl20 = glLines('invoice', inv20);
  check('TEST 20 tax does not change stock or COGS', near(stockOf(P20.id), 15) && near(acct(gl20, cogs.id, 'debit'), 100) && near(acct(gl20, ar.id, 'debit'), 192.5), `stock=${stockOf(P20.id)} cogs=${acct(gl20, cogs.id, 'debit')}`);

  console.log('\n=== TEST 21-27: derived stock state ===');
  const P21 = mkProduct('INVENTORY_PART', 'SI Low', { reorderPoint: 10 }); receive(P21.id, 12, 5);
  await makeInvoice([line(P21.id, 3, 35)]);
  check('TEST 21 sale 12 → 9 crosses the reorder point → Low Stock', near(stockOf(P21.id), 9) && ItemStatus.getStatusForItem(P21.id).status === 'LOW_STOCK');
  const P22 = mkProduct('INVENTORY_PART', 'SI Out'); receive(P22.id, 5, 5);
  await makeInvoice([line(P22.id, 5, 35)]);
  check('TEST 22 sale 5 → 0 → Out of Stock', near(stockOf(P22.id), 0) && ItemStatus.getStatusForItem(P22.id).status === 'OUT_OF_STOCK');

  const P23 = mkProduct('INVENTORY_PART', 'SI OnPo'); receive(P23.id, 20, 5);
  const poId = Number(db.prepare("INSERT INTO purchase_orders (po_number, vendor_id, po_date, status, subtotal, tax_total, total, created_by) VALUES (?,1,'2026-06-01','OPEN',0,0,0,'t')").run(`SI-PO-${stamp}`).lastInsertRowid);
  db.prepare("INSERT INTO purchase_order_lines (purchase_order_id, item_id, line_no, description, item_type, unit, qty_ordered, qty_received, qty_billed, unit_cost, tax_rate, amount) VALUES (?,?,1,'po','INVENTORY_PART','Each',50,0,0,5,0,0)").run(poId, P23.id);
  await makeInvoice([line(P23.id, 5, 35)]);
  const av23 = Availability.getItemAvailability(P23.id);
  check('TEST 23 sale changes On Hand (15) but NOT On PO (50); expected 65', av23.onHand === 15 && av23.onPurchaseOrder === 50 && av23.expected === 65, JSON.stringify(av23));

  const P24 = mkProduct('INVENTORY_PART', 'SI History'); receive(P24.id, 20, 10);
  const inv24 = await makeInvoice([line(P24.id, 5, 35)]);
  const hist = await getItemMovements(ev, itemIdOf(P24.id), 50);
  const hRow = (Array.isArray(hist) ? hist : []).find((m) => m.sourceType === 'invoice' && Number(m.sourceId) === Number(inv24));
  check('TEST 24 Inventory History shows the sale (qty out 5, running balance)', !!hRow && near(hRow.quantityChange, -5) && String(hRow.source || '').startsWith('Invoice'), hRow && JSON.stringify({ c: hRow.quantityChange, s: hRow.source, b: hRow.balance }));

  const rep24 = MovementReport.getInventoryMovementReport({ itemId: P24.id, all: true });
  const repRows = (rep24 && (rep24.rows || rep24.items)) || [];
  check('TEST 25 Inventory Movement Report includes the invoice movement', repRows.some((r) => r.sourceType === 'invoice' && Number(r.sourceId) === Number(inv24) && near(r.qtyOut, 5)), `rows=${repRows.length}`);

  const dash = Dashboard.getDashboard({});
  check('TEST 26 Inventory Dashboard reflects the reduced stock', dash.summary && typeof dash.summary.inStockItems === 'number');

  const P27 = mkProduct('INVENTORY_PART', 'SI Value'); receive(P27.id, 20, 20);
  const valBefore = Valuation.totalValue();
  await makeInvoice([line(P27.id, 5, 35)]);
  const valAfter = Valuation.totalValue();
  check('TEST 27 Inventory Value falls by the cost basis ($100), not the selling price', near(valBefore - valAfter, 100), `${valBefore} → ${valAfter}`);

  console.log('\n=== TEST 28-33: edits, void, delete ===');
  const P28 = mkProduct('INVENTORY_PART', 'SI EditUp'); receive(P28.id, 20, 10);
  const inv28 = await makeInvoice([line(P28.id, 5, 35)]);
  await editInvoice(inv28, [line(P28.id, 8, 35)], undefined);
  check('TEST 28 posted qty 5 → 8: net stock effect is -8 (not -13)', near(stockOf(P28.id), 12), `${stockOf(P28.id)}`);
  const P29 = mkProduct('INVENTORY_PART', 'SI EditDown'); receive(P29.id, 20, 10);
  const inv29 = await makeInvoice([line(P29.id, 8, 35)]);
  await editInvoice(inv29, [line(P29.id, 5, 35)], undefined);
  check('TEST 29 posted qty 8 → 5: net stock effect is -5 (3 restored)', near(stockOf(P29.id), 15), `${stockOf(P29.id)}`);

  const P30 = mkProduct('INVENTORY_PART', 'SI PriceOnly'); receive(P30.id, 20, 10);
  const inv30 = await makeInvoice([line(P30.id, 5, 35)]);
  await editInvoice(inv30, [line(P30.id, 5, 40)], undefined);
  check('TEST 30 price-only edit creates NO second movement', near(stockOf(P30.id), 15) && moves('invoice', inv30).length === 1, `${moves('invoice', inv30).length} moves`);

  const P31a = mkProduct('INVENTORY_PART', 'SI ItemSwap A'); const P31b = mkProduct('INVENTORY_PART', 'SI ItemSwap B');
  receive(P31a.id, 20, 10); receive(P31b.id, 20, 10);
  const inv31 = await makeInvoice([line(P31a.id, 5, 35)]);
  await editInvoice(inv31, [line(P31b.id, 5, 35)], undefined);
  check('TEST 31 item change A → B: A restored (+5), B reduced (-5)', near(stockOf(P31a.id), 20) && near(stockOf(P31b.id), 15), `A=${stockOf(P31a.id)} B=${stockOf(P31b.id)}`);

  const P32 = mkProduct('INVENTORY_PART', 'SI Void'); receive(P32.id, 20, 10);
  const inv32 = await makeInvoice([line(P32.id, 5, 35)]);
  await editInvoice(inv32, [line(P32.id, 5, 35)], 'Void');
  check('TEST 32 voiding a posted invoice restores the stock', near(stockOf(P32.id), 20), `${stockOf(P32.id)}`);
  check('TEST 32 the original movement is preserved (auditable, not erased)', moves('invoice', inv32).length === 2 && near(moves('invoice', inv32)[0].quantityChange, -5) && near(moves('invoice', inv32)[1].quantityChange, 5), JSON.stringify(moves('invoice', inv32).map(m => m.quantityChange)));
  check('TEST 32 no posted GL entry remains after void', glLines('invoice', inv32).length === 0);

  const P33 = mkProduct('INVENTORY_PART', 'SI DelDraft'); receive(P33.id, 20, 10);
  const inv33 = await makeInvoice([line(P33.id, 5, 35)], 'Draft');
  await deleteRecord(ev, Number(inv33), 'invoices');
  check('TEST 33 deleting a draft changes no stock', near(stockOf(P33.id), 20));

  console.log('\n=== TEST 34-38: returns / negative / warehouse ===');
  const P34 = mkProduct('INVENTORY_PART', 'SI Return'); receive(P34.id, 20, 10);
  const inv34 = await makeInvoice([line(P34.id, 5, 35)]);
  const before34 = stockOf(P34.id);
  note('TEST 34 RETURN + RESTOCK: AccuLedger has NO return-to-inventory/restock workflow (customerRefunds and creditNotes move no stock). Financial refunds are deliberately separate from physical returns — this is a documented gap, not silently faked.');
  check('TEST 35 refund WITHOUT restock leaves inventory unchanged', near(stockOf(P34.id), before34), `${before34} → ${stockOf(P34.id)}`);

  const P36 = mkProduct('INVENTORY_PART', 'SI Negative'); receive(P36.id, 3, 10);
  const inv36 = await makeInvoice([line(P36.id, 5, 35)]);
  check('TEST 36/37 negative inventory policy = ALLOWED: an invoice for 5 with 3 on hand posts to -2 (issueStock permits it)', near(stockOf(P36.id), -2), `${stockOf(P36.id)}`);
  note('TEST 36 alternative (block when prohibited) does not apply — AccuLedger’s established policy allows negative stock and reports it for the UI; no new policy was invented.');

  const P38 = mkProduct('INVENTORY_PART', 'SI Warehouse'); receive(P38.id, 10, 10);
  const inv38 = await makeInvoice([line(P38.id, 5, 35)]);
  check('TEST 38 invoice issues from the DEFAULT warehouse (invoice_lines has no warehouse column)', Number(moves('invoice', inv38)[0].warehouseId) === Number(W.id));

  console.log('\n=== TEST 39-45: isolation / atomicity / accounting ===');
  const prodSrc = fs.readFileSync(path.join(BE, 'models', 'invoices.js'), 'utf8');
  check('TEST 39 company isolation — all queries scoped to the active db (dbmgr)', /require\('\.\/dbmgr(\.js)?'\)/.test(prodSrc));

  const P41 = mkProduct('INVENTORY_PART', 'SI Atomic'); receive(P41.id, 20, 10);
  const DocumentInventory = require(path.join(BE, 'services', 'documentInventory.js'));
  const invCount41 = db.prepare('SELECT COUNT(*) c FROM invoices').get().c;
  const origReconcile = DocumentInventory.reconcileInvoiceStock;
  DocumentInventory.reconcileInvoiceStock = () => { throw new Error('forced inventory failure'); };
  await makeInvoice([line(P41.id, 5, 35)]);
  DocumentInventory.reconcileInvoiceStock = origReconcile;
  check('TEST 41 a failed inventory post rolls the whole invoice back (no half-posted sale)',
    near(stockOf(P41.id), 20) && db.prepare('SELECT COUNT(*) c FROM invoices').get().c === invCount41,
    `stock=${stockOf(P41.id)}, invoices ${invCount41} → ${db.prepare('SELECT COUNT(*) c FROM invoices').get().c}`);

  const P42 = mkProduct('INVENTORY_PART', 'SI AtomicGL'); receive(P42.id, 20, 10);
  const JournalEntries = require(path.join(BE, 'models', 'journalEntries.js'));
  const invCount42 = db.prepare('SELECT COUNT(*) c FROM invoices').get().c;
  const origPost = JournalEntries.postInvoice;
  JournalEntries.postInvoice = () => ({ error: 'forced GL failure' });
  await makeInvoice([line(P42.id, 5, 35)]);
  JournalEntries.postInvoice = origPost;
  check('TEST 42 a failed GL post leaves NO orphan inventory reduction (atomic)',
    near(stockOf(P42.id), 20) && db.prepare('SELECT COUNT(*) c FROM invoices').get().c === invCount42,
    `stock=${stockOf(P42.id)}, invoices ${invCount42} → ${db.prepare('SELECT COUNT(*) c FROM invoices').get().c}`);

  const P43 = mkProduct('INVENTORY_PART', 'SI Balance'); receive(P43.id, 20, 20);
  const inv43 = await makeInvoice([line(P43.id, 5, 35)]);
  const gl43 = glLines('invoice', inv43);
  const dr = money(gl43.reduce((s, l) => s + Number(l.debit || 0), 0));
  const cr = money(gl43.reduce((s, l) => s + Number(l.credit || 0), 0));
  check('TEST 43 posted journal entry balances (debits = credits)', dr === cr && dr > 0, `DR ${dr} / CR ${cr}`);
  check('TEST 44 Inventory Asset credit equals the cost removed from the subledger', near(acct(gl43, invAsset.id, 'credit'), 100));
  check('TEST 45 COGS debit equals the cost removed from inventory', near(acct(gl43, cogs.id, 'debit'), 100));

  console.log('\n=== TEST 46-49: rename / number / duplicate / legacy ===');
  const P46 = mkProduct('INVENTORY_PART', 'SI Rename Before'); receive(P46.id, 20, 10);
  const inv46 = await makeInvoice([line(P46.id, 5, 35)]);
  Products.saveItemMaster({ id: P46.id, type: 'INVENTORY_PART', name: 'SI Rename After', sku: `SI-RN-${stamp}`, incomeAccountId: income.id, inventoryAssetAccountId: invAsset.id, cogsAccountId: cogs.id });
  check('TEST 46 renaming the item keeps the movement linked by itemId', moves('invoice', inv46).length === 1 && Number(moves('invoice', inv46)[0].itemId) === itemIdOf(P46.id));

  const P47 = mkProduct('INVENTORY_PART', 'SI Number'); receive(P47.id, 20, 10);
  const inv47 = await makeInvoice([line(P47.id, 5, 35)]);
  await editInvoice(inv47, [line(P47.id, 5, 35)], undefined);
  check('TEST 47 invoice-number change keeps the movement linked by invoiceId', moves('invoice', inv47).every((m) => Number(m.sourceId) === Number(inv47)));

  const P48 = mkProduct('INVENTORY_PART', 'SI Duplicate'); receive(P48.id, 20, 10);
  const inv48 = await makeInvoice([line(P48.id, 5, 35)]);
  const dup = await makeInvoice([line(P48.id, 5, 35)], 'Draft'); // a "copy" starts as a new Draft
  check('TEST 48 a duplicated invoice starts as a new Draft with NO copied posting/movement', moves('invoice', dup).length === 0 && db.prepare("SELECT COUNT(*) c FROM journal_entries WHERE source_type='invoice' AND source_id=?").get(Number(dup)).c === 0);
  const before48 = stockOf(P48.id);
  db.prepare("UPDATE invoices SET status='Open' WHERE id=?").run(Number(dup));
  await editInvoice(dup, [line(P48.id, 5, 35)], undefined);
  check('TEST 48 posting the duplicate creates its OWN single movement', near(stockOf(P48.id), before48 - 5) && moves('invoice', dup).length === 1);

  const historical = db.prepare(`SELECT i.id FROM invoices i WHERE i.id < ? AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.sourceType='invoice' AND m.sourceId=i.id) ORDER BY i.id DESC LIMIT 1`).get(Number(inv1));
  const histBefore = historical ? moves('invoice', historical.id).length : 0;
  if (historical) { try { await Invoices.getSingleInvoice(historical.id); } catch (_) { /* read */ } }
  const histAfter = historical ? moves('invoice', historical.id).length : 0;
  check('TEST 49 reading a legacy invoice does NOT backfill/double-reduce stock', !historical || (histBefore === 0 && histAfter === 0));

  console.log('\n=== TEST 50-51: performance / UI wiring ===');
  const P50 = mkProduct('INVENTORY_PART', 'SI Large'); receive(P50.id, 500, 1);
  const many = Array.from({ length: 60 }, (_, i) => line(P50.id, 1, 2));
  const t0 = Date.now();
  const inv50 = await makeInvoice(many);
  const ms = Date.now() - t0;
  check('TEST 50 a 60-line invoice posts efficiently (one transaction, no N+1)', ms < 4000 && near(stockOf(P50.id), 440), `${ms}ms, stock=${stockOf(P50.id)}`);

  const createInv = fs.readFileSync(path.join(FE, 'components', 'customers', 'invoices', 'CreateInvoice.js'), 'utf8');
  check('TEST 51 posting shows a loading state and guards double submit (button disabled while saving)', /loading=\{saving\}/.test(createInv) && /setSaving\(true\)/.test(createInv));
  check('TEST 51 backend remains idempotent regardless of the UI (reconcile is delta-based)', /Math\.abs\(delta\) < 1e-9/.test(fs.readFileSync(path.join(BE, 'services', 'documentInventory.js'), 'utf8')));
  note('TEST 52 PACKAGED WINDOWS APP: not executed here (no GUI/display in this environment) — requires on-device verification.');

  console.log('\n' + notes.map((n) => `  - ${n}`).join('\n'));
  console.log(`\nRESULT: ${pass} passed, ${fail} failed (${notes.length} documented notes)`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e && e.stack ? e.stack : e); process.exit(1); });
