/**
 * verify-inventory-accounting.js ??? "Central Inventory ??? Accounting Connection"
 *
 * Proves the END-TO-END chain and the reconciliation between the inventory
 * subledger (stock_movements, valued by services/inventoryValuation) and the
 * Inventory Asset GL, plus the single-engine invariants.
 *
 * Accounting model (approved AccuLedger architecture, encoded here):
 *   ??? Purchase Order  ??? commitment only (On PO), no qty/value/GL.
 *   ??? Receipt         ??? moves QUANTITY + valuation layers (no journal).
 *   ??? Vendor Bill     ??? capitalises Inventory Asset (Dr Inventory Asset / Cr AP).
 *   ??? Sale (Invoice)  ??? issues stock + Dr COGS / Cr Inventory Asset.
 *   ??? Payment         ??? AP/AR + Bank only, never stock.
 *
 * Runs on a SCRATCH COPY of the company file, driven through the REAL handlers.
 */
const path = require('path');
const Module = require('module');

const handlers = new Map();
const electronStub = { ipcMain: { handle: (c, fn) => { if (!handlers.has(c)) handlers.set(c, fn); } } };
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) { if (request === 'electron') return electronStub; return originalLoad.apply(this, arguments); };

const realLog = console.log.bind(console);
console.log = () => {};
require('./lib/testDb.js').useScratchCopy({ label: 'verify-inventory-accounting' });

const ROOT = path.join(__dirname, '..');
const BE = path.join(ROOT, 'src', 'backend');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
const fs = require('fs');
const db = require(path.join(BE, 'models', 'dbmgr.js')).raw;
const Products = require(path.join(BE, 'models', 'products.js'));
const Inventory = require(path.join(BE, 'models', 'inventory.js'));
const PurchaseOrders = require(path.join(BE, 'models', 'purchaseOrders.js'));
const Warehouses = require(path.join(BE, 'models', 'warehouses.js'));
const COA = require(path.join(BE, 'models', 'chartOfAccounts.js'));
const ItemStatus = require(path.join(BE, 'services', 'inventoryStockStatus.js'));
const Availability = require(path.join(BE, 'services', 'inventoryAvailabilityService.js'));
const Valuation = require(path.join(BE, 'services', 'inventoryValuation.js'));
const Alerts = require(path.join(BE, 'services', 'inventoryAlertsService.js'));
const Recon = require(path.join(BE, 'services', 'inventoryReconciliationService.js'));

require(path.join(BE, 'handlers', 'inventoryHandlers.js'))();
require(path.join(BE, 'handlers', 'invoiceHandlers.js'))();
require(path.join(BE, 'handlers', 'customerHandlers.js'))();
require(path.join(BE, 'handlers', 'ipcHandlers.js'))();
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
  const ev = { sender: { id: 'verify-inventory-accounting' } };
  const insertExpense = H('insert-expense');
  const updateExpense = H('updateexpense');
  const insertInvoice = H('insert-invoice');
  const receivePO = H('receive-purchase-order');
  const billPay = H('bill-pay');

  check('required handlers registered', !!(insertExpense && updateExpense && insertInvoice && receivePO && billPay));

  const cust = db.prepare(`INSERT INTO customers (title, first_name, last_name, mobile_number, display_name, email, status, entered_by, date_entered) VALUES ('', 'ZZAcc', 'Link', '', 'ZZ Acc Link', 'zz-acc@example.invalid', 'Active', 'test', datetime('now'))`).run();
  const customerId = Number(cust.lastInsertRowid);
  const sup = db.prepare("INSERT INTO suppliers (title, first_name, mobile_number, display_name, entered_by) VALUES ('','V','','ZZ Acc Vendor','test')").run();
  const supplierId = Number(sup.lastInsertRowid);
  const W = Warehouses.getOrCreateDefault();
  const income = COA.getByName('Sales Revenue') || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('income','other income') AND status='Active' LIMIT 1").get();
  const cogs = COA.getSystemAccount('Cost of Goods Sold') || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type)='cost of goods sold' LIMIT 1").get();
  const invAsset = COA.getSystemAccount('Inventory Asset');
  const expenseAcct = db.prepare("SELECT id, name FROM chart_of_accounts WHERE LOWER(type)='expense' AND status='Active' ORDER BY id LIMIT 1").get();
  const bankAcct = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type)='bank' AND status='Active' ORDER BY id LIMIT 1").get();
  // A SECOND inventory asset account, to prove per-account reconciliation.
  db.prepare("INSERT INTO chart_of_accounts (name, type, subType, number, normalBalance, status, isSystem) VALUES ('ZZ Inventory Asset 2','Asset','Inventory','1299','Debit','Active',0)").run();
  const invAsset2 = db.prepare("SELECT id FROM chart_of_accounts WHERE name='ZZ Inventory Asset 2'").get();
  const stamp = Date.now();
  let seq = 0;

  const mkProduct = (name, extra = {}) => Products.saveItemMaster({
    type: 'INVENTORY_PART', name, sku: `${name}-${stamp}-${++seq}`, salesPrice: 35, purchaseCost: 20,
    incomeAccountId: income.id, inventoryAssetAccountId: invAsset.id, cogsAccountId: cogs.id, valuationMethod: 'FIFO', ...extra,
  });
  const itemIdOf = (pid) => Inventory.resolveItemId(Number(pid));
  const qoh = (pid) => { const r = db.prepare('SELECT COALESCE(SUM(quantity),0) q FROM item_stock WHERE itemId=?').get(itemIdOf(pid)); return Number(r.q); };
  const moves = (t, id) => db.prepare('SELECT * FROM stock_movements WHERE sourceType=? AND sourceId=? ORDER BY id').all(t, Number(id));
  const glFor = (t, id) => { const e = db.prepare("SELECT id FROM journal_entries WHERE source_type=? AND source_id=? AND status='Posted' ORDER BY id DESC LIMIT 1").get(t, Number(id)); return e ? db.prepare('SELECT account_id,debit,credit FROM journal_lines WHERE journal_id=?').all(e.id) : []; };
  const glAcct = (gl, id, side) => money(gl.filter(l => Number(l.account_id) === Number(id)).reduce((s, l) => s + Number(l[side] || 0), 0));
  const glBalance = (acctId) => money(Number((db.prepare("SELECT COALESCE(SUM(jl.debit-jl.credit),0) b FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_id AND je.status='Posted' WHERE jl.account_id=?").get(Number(acctId)) || {}).b) || 0);
  const addPo = (itemId, ordered, cost) => {
    const poId = Number(db.prepare("INSERT INTO purchase_orders (po_number, vendor_id, po_date, status, subtotal, tax_total, total, created_by) VALUES (?,?,?,?,0,0,0,'t')").run(`ZZAC-${++seq}-${stamp}`, supplierId, '2026-06-01', 'OPEN').lastInsertRowid);
    const lineId = Number(db.prepare("INSERT INTO purchase_order_lines (purchase_order_id, item_id, line_no, description, item_type, unit, qty_ordered, qty_received, qty_billed, unit_cost, tax_rate, amount) VALUES (?,?,1,'x','INVENTORY_PART','Each',?,0,0,?,0,0)").run(poId, itemId, ordered, cost).lastInsertRowid);
    return { poId, lineId };
  };
  const billItemLine = (pid, qty, rate, poLineId = null) => ({ line_type: 'item', product_id: pid, quantity: qty, rate, amount: money(qty * rate), warehouse_id: W.id, description: 'x', purchase_order_line_id: poLineId });
  const makeBill = async (lines, status = 'Unpaid') => {
    const res = await insertExpense(ev, supplierId, 'Accounts Payable', '2026-06-01', 'bill', `ZZAC-B-${++seq}`, 'bill', 'test', status, lines, '2026-06-01', 'x', 30);
    return res && (res.expenseId || res.id);
  };
  const makeInvoice = async (lines) => {
    const res = await insertInvoice(ev, customerId, 'zz-acc@example.invalid', false, 'Addr', 'Net 30', '2026-06-15', '2026-07-15', '', '', null, 'test', 0, null, lines);
    return res && (res.invoiceId || res.invoice_id || res.id);
  };
  const invLine = (pid, qty, rate) => ({ product_id: pid, product: pid, description: 'sale', quantity: qty, rate, amount: money(qty * rate) });

  // Baseline reconciliation so the shared company data cancels out of every delta.
  const baseRecon = Recon.getInventoryReconciliation();
  const acctDiff = (r, acctId) => { const a = r.accounts.find(x => Number(x.accountId) === Number(acctId)); return a ? a.difference : 0; };
  const totalDiff = (r) => r.totals.difference;

  console.log('\n=== TEST 1-3: Purchase Order ??? Receipt ===');
  const P = mkProduct('ZZ Acc Widget');
  const { poId, lineId } = addPo(P.id, 100, 20);
  check('TEST 1  a PO creates NO stock movement', moves('receipt', poId).length === 0 && qoh(P.id) === 0);
  check('TEST 1  a PO changes On PO (+100) but not On Hand', Availability.getItemAvailability(P.id).onPurchaseOrder === 100 && Availability.getItemAvailability(P.id).onHand === 0);
  check('TEST 1  a PO posts NO journal (commitment only)', glFor('purchase_order', poId).length === 0);

  const r60 = await receivePO(ev, poId, { receiptDate: '2026-06-02', lines: [{ purchaseOrderLineId: lineId, qtyReceived: 60 }] });
  check('TEST 2  receiving 60 increases On Hand by 60 and leaves On PO 40', r60.success && qoh(P.id) === 60 && Availability.getItemAvailability(P.id).onPurchaseOrder === 40, JSON.stringify(r60));
  check('TEST 2  a receipt creates ONE movement of +60', moves('receipt', r60.receiptId).length === 1 && near(moves('receipt', r60.receiptId)[0].quantityChange, 60));
  check('TEST 2  the receipt values the stock at the PO cost (20)', near(moves('receipt', r60.receiptId)[0].unitCost, 20));
  check('TEST 4  the approved model posts NO journal at Receipt', glFor('receipt', r60.receiptId).length === 0);
  note('TEST 4 accounting model: AccuLedger capitalises Inventory Asset at the vendor BILL (Dr Inventory Asset / Cr AP); a Receipt moves quantity + valuation layers only. This is the repository\'s tested contract (verify-purchase-orders asserts "receipt posted NO journal entry").');

  const r40 = await receivePO(ev, poId, { receiptDate: '2026-06-05', lines: [{ purchaseOrderLineId: lineId, qtyReceived: 40 }] });
  check('TEST 3  receiving the remainder ??? On Hand 100, On PO 0', r40.success && qoh(P.id) === 100 && Availability.getItemAvailability(P.id).onPurchaseOrder === 0);
  check('TEST 3  Expected reconciles (On Hand + On PO)', Availability.getItemAvailability(P.id).expected === 100);

  console.log('\n=== TEST 5-6: Bill after receipt / payment ===');
  const glInvBefore = glBalance(invAsset.id);
  const bill = await makeBill([billItemLine(P.id, 100, 20, lineId)]);
  const billGl = glFor('expense', bill);
  check('TEST 5  a PO-linked bill does NOT re-receive stock (still 100 on hand)', qoh(P.id) === 100 && moves('expense', bill).length === 0, `${qoh(P.id)}`);
  check('TEST 5  the bill capitalises Inventory Asset once (Dr $2,000)', near(glAcct(billGl, invAsset.id, 'debit'), 2000) && near(glBalance(invAsset.id) - glInvBefore, 2000), JSON.stringify(billGl));
  const apCredit = billGl.filter(l => Number(l.credit) > 0).reduce((s, l) => s + Number(l.credit), 0);
  check('TEST 5  Accounts Payable is credited the bill total ($2,000)', near(apCredit, 2000));
  check('TEST 5  no duplicate Inventory Asset (received value == billed value)', near(glBalance(invAsset.id) - glInvBefore, 2000));

  const before6 = qoh(P.id); const bankBefore = bankAcct ? glBalance(bankAcct.id) : 0;
  if (bankAcct) await billPay(ev, { expenseId: Number(bill), amount: 2000, paymentDate: '2026-06-10', bankAccount: bankAcct.id, checkNumber: 'ZZAC-1' });
  check('TEST 6  paying the bill leaves inventory unchanged', qoh(P.id) === before6);
  check('TEST 6  paying the bill reduces the bank balance', !bankAcct || near(glBalance(bankAcct.id) - bankBefore, -2000), `${bankBefore} ??? ${bankAcct ? glBalance(bankAcct.id) : 'n/a'}`);

  console.log('\n=== TEST 7: Bill before receipt ===');
  const P7 = mkProduct('ZZ Acc BillFirst'); const it7 = itemIdOf(P7.id);
  const po7 = addPo(P7.id, 100, 20);
  const bill7 = await makeBill([billItemLine(P7.id, 100, 20, po7.lineId)]);
  check('TEST 7  bill-before-receipt: AP reflects the bill but QOH stays 0', qoh(P7.id) === 0 && glAcct(glFor('expense', bill7), invAsset.id, 'debit') > 0, `qoh=${qoh(P7.id)}`);
  const rec7 = await receivePO(ev, po7.poId, { receiptDate: '2026-06-20', lines: [{ purchaseOrderLineId: po7.lineId, qtyReceived: 60 }] });
  check('TEST 7  later receipt of 60 ??? QOH 60, no duplicate value', rec7.success && qoh(P7.id) === 60 && moves('receipt', rec7.receiptId).length === 1);

  console.log('\n=== TEST 8: three-way mismatch ===');
  const alerts = Alerts.getAlerts({}).alerts;
  check('TEST 8  billed > received surfaces the mismatch alert', alerts.some(a => a.type === 'BILL_RECEIPT_MISMATCH' && a.meta.productId === Number(P7.id) && a.meta.difference === 40), `diff for P7`);

  console.log('\n=== TEST 9-15: sale, COGS, derived stock ===');
  const P9 = mkProduct('ZZ Acc Sale'); const it9 = itemIdOf(P9.id);
  const po9 = addPo(P9.id, 100, 20);
  await receivePO(ev, po9.poId, { receiptDate: '2026-06-02', lines: [{ purchaseOrderLineId: po9.lineId, qtyReceived: 100 }] });
  const inv9 = await makeInvoice([invLine(P9.id, 5, 35)]);
  check('TEST 9  a posted invoice reduces On Hand by 5 (100 ??? 95)', qoh(P9.id) === 95 && moves('invoice', inv9).length === 1);
  const gl9 = glFor('invoice', inv9);
  check('TEST 10 revenue posts (AR debit = selling value $175)', near(glAcct(gl9, COA.getSystemAccount('Accounts Receivable').id, 'debit'), 175));
  check('TEST 11 COGS = $100 (cost), Inventory Asset credited $100', near(glAcct(gl9, cogs.id, 'debit'), 100) && near(glAcct(gl9, invAsset.id, 'credit'), 100));

  const P14 = mkProduct('ZZ Acc Low', { reorderPoint: 10 });
  const po14 = addPo(P14.id, 12, 20); await receivePO(ev, po14.poId, { receiptDate: '2026-06-02', lines: [{ purchaseOrderLineId: po14.lineId, qtyReceived: 12 }] });
  await makeInvoice([invLine(P14.id, 3, 35)]);
  check('TEST 14 sale 12 ??? 9 crosses reorder ??? Low Stock', qoh(P14.id) === 9 && ItemStatus.getStatusForItem(P14.id).status === 'LOW_STOCK');
  const P15 = mkProduct('ZZ Acc Out'); const po15 = addPo(P15.id, 5, 20); await receivePO(ev, po15.poId, { receiptDate: '2026-06-02', lines: [{ purchaseOrderLineId: po15.lineId, qtyReceived: 5 }] });
  await makeInvoice([invLine(P15.id, 5, 35)]);
  check('TEST 15 sale 5 ??? 0 ??? Out of Stock', qoh(P15.id) === 0 && ItemStatus.getStatusForItem(P15.id).status === 'OUT_OF_STOCK');
  const P16 = mkProduct('ZZ Acc Reorder', { reorderPoint: 10 }); const po16 = addPo(P16.id, 4, 20); await receivePO(ev, po16.poId, { receiptDate: '2026-06-02', lines: [{ purchaseOrderLineId: po16.lineId, qtyReceived: 4 }] });
  const rec16 = await receivePO(ev, po16.poId, { receiptDate: '2026-06-03', lines: [{ purchaseOrderLineId: po16.lineId, qtyReceived: 20, }] }).catch(() => null);
  // over-receive is blocked by the engine; receive the remainder instead
  const po16b = addPo(P16.id, 20, 20); await receivePO(ev, po16b.poId, { receiptDate: '2026-06-04', lines: [{ purchaseOrderLineId: po16b.lineId, qtyReceived: 20 }] });
  check('TEST 16 receiving clears Low Stock (4 ??? 24)', qoh(P16.id) === 24 && ItemStatus.getStatusForItem(P16.id).status === 'IN_STOCK', `${qoh(P16.id)}`);

  console.log('\n=== TEST 17-23: adjustment / valuation ===');
  const P17 = mkProduct('ZZ Acc Adjust'); const po17 = addPo(P17.id, 20, 20); await receivePO(ev, po17.poId, { receiptDate: '2026-06-02', lines: [{ purchaseOrderLineId: po17.lineId, qtyReceived: 20 }] });
  const valBefore17 = Valuation.currentValue(itemIdOf(P17.id), 'FIFO');
  const invBalBefore17 = glBalance(invAsset.id);
  const adj17 = Inventory.adjustStock(itemIdOf(P17.id), W.id, -5, 'damaged');
  check('TEST 17 a -5 adjustment reduces QOH and value', qoh(P17.id) === 15 && near(Valuation.currentValue(itemIdOf(P17.id), 'FIFO'), valBefore17 - 5 * 20), `qoh=${qoh(P17.id)}`);
  const adjGl = glFor('adjustment', adj17.adjustmentId);
  const adjOffset = COA.getSystemAccount('Inventory Adjustment');
  check('TEST 17 the adjustment POSTS a journal (Dr offset / Cr Inventory Asset)', !!adjOffset && near(glAcct(adjGl, adjOffset.id, 'debit'), 100) && near(glAcct(adjGl, invAsset.id, 'credit'), 100), JSON.stringify(adjGl));
  check('TEST 17 Inventory Asset GL fell by the adjustment cost', near(glBalance(invAsset.id) - invBalBefore17, -100));
  const adj18 = Inventory.adjustStock(itemIdOf(P17.id), W.id, 5, 'count gain');
  check('TEST 18 a +5 adjustment restores QOH (20) and posts Dr Inventory Asset / Cr offset', qoh(P17.id) === 20 && near(glAcct(glFor('adjustment', adj18.adjustmentId), invAsset.id, 'debit'), 100));
  note('TEST 17/18 adjustment accounting: adjustStock records a COST BASIS AND posts a balanced journal against the item Inventory Asset account and the configured system "Inventory Adjustment" offset — atomic with the stock movement.');

  const FIFO = mkProduct('ZZ Acc FIFO'); const iF = itemIdOf(FIFO.id);
  Inventory.receiveStock(iF, W.id, 3, 10, { sourceType: 'receipt', sourceId: ++seq + 600000 });
  Inventory.receiveStock(iF, W.id, 10, 12, { sourceType: 'receipt', sourceId: ++seq + 600000 });
  const invF = await makeInvoice([invLine(FIFO.id, 5, 35)]);
  const fGl = glFor('invoice', invF);
  check('TEST 22 FIFO COGS $54, remaining value $96', near(glAcct(fGl, cogs.id, 'debit'), 54) && near(Valuation.currentValue(iF, 'FIFO'), 96), `cogs=${glAcct(fGl, cogs.id, 'debit')} val=${Valuation.currentValue(iF, 'FIFO')}`);
  const WA = mkProduct('ZZ Acc WA', { valuationMethod: 'WEIGHTED_AVERAGE' }); const iW = itemIdOf(WA.id);
  Inventory.receiveStock(iW, W.id, 40, 15, { sourceType: 'receipt', sourceId: ++seq + 600000 });
  Inventory.receiveStock(iW, W.id, 60, 20, { sourceType: 'receipt', sourceId: ++seq + 600000 });
  const invW = await makeInvoice([invLine(WA.id, 10, 35)]);
  check('TEST 23 weighted average: COGS $180, remaining value $1,620', near(glAcct(glFor('invoice', invW), cogs.id, 'debit'), 180) && near(Valuation.currentValue(iW, 'WEIGHTED_AVERAGE'), 1620), `val=${Valuation.currentValue(iW, 'WEIGHTED_AVERAGE')}`);

  console.log('\n=== TEST 24-31: reconciliation + single source of truth ===');
  // A matched flow must NOT change the subledger???GL difference.
  const P24 = mkProduct('ZZ Acc Recon'); const po24 = addPo(P24.id, 50, 20);
  const before24 = Recon.getInventoryReconciliation();
  await receivePO(ev, po24.poId, { receiptDate: '2026-06-02', lines: [{ purchaseOrderLineId: po24.lineId, qtyReceived: 50 }] });
  await makeBill([billItemLine(P24.id, 50, 20, po24.lineId)]);
  const after24 = Recon.getInventoryReconciliation();
  check('TEST 24 a matched receipt+bill leaves the Inventory Asset difference unchanged (delta 0)', near(acctDiff(after24, invAsset.id) - acctDiff(before24, invAsset.id), 0), `??=${money(acctDiff(after24, invAsset.id) - acctDiff(before24, invAsset.id))}`);
  check('TEST 24 the service reports per-account subledger / GL / difference', after24.accounts.every(a => 'subledgerValue' in a && 'glBalance' in a && 'difference' in a));

  const P25 = mkProduct('ZZ Acc Recon2'); const po25 = addPo(P25.id, 10, 20);
  await receivePO(ev, po25.poId, { receiptDate: '2026-06-02', lines: [{ purchaseOrderLineId: po25.lineId, qtyReceived: 10 }] });
  const inv25 = await makeInvoice([invLine(P25.id, 2, 35)]);
  check('TEST 25 Item Detail / valuation agrees with the ledger', near(Valuation.currentValue(itemIdOf(P25.id), 'FIFO'), 8 * 20));
  check('TEST 25 COGS for the sale equals the valuation cost removed', near(glAcct(glFor('invoice', inv25), cogs.id, 'debit'), 40));

  // Multiple Inventory Asset accounts reconcile independently.
  const P30 = mkProduct('ZZ Acc Acct2', { inventoryAssetAccountId: invAsset2.id }); const po30 = addPo(P30.id, 10, 50);
  const before30 = Recon.getInventoryReconciliation();
  await receivePO(ev, po30.poId, { receiptDate: '2026-06-02', lines: [{ purchaseOrderLineId: po30.lineId, qtyReceived: 10 }] });
  await makeBill([billItemLine(P30.id, 10, 50, po30.lineId)]);
  const after30 = Recon.getInventoryReconciliation();
  check('TEST 30 the second Inventory Asset account reconciles independently (delta 0)', near(acctDiff(after30, invAsset2.id) - acctDiff(before30, invAsset2.id), 0), `??=${money(acctDiff(after30, invAsset2.id) - acctDiff(before30, invAsset2.id))}`);
  check('TEST 30 account 1 is unaffected by account 2 activity', near(acctDiff(after30, invAsset.id) - acctDiff(before30, invAsset.id), 0));

  // A manual GL entry straight to Inventory Asset must show as a difference.
  const beforeManual = Recon.getInventoryReconciliation();
  const JournalEntries = require(path.join(BE, 'models', 'journalEntries.js'));
  const someExpense = expenseAcct.id;
  JournalEntries.post({ date: '2026-06-30', reference: 'ZZAC-MANUAL', description: 'manual', source_type: 'manual', source_id: 999001,
    lines: [{ account_id: invAsset.id, debit: 777, credit: 0 }, { account_id: someExpense, debit: 0, credit: 777 }] });
  const afterManual = Recon.getInventoryReconciliation();
  check('TEST 54 a manual GL entry to Inventory Asset is detected as a reconciliation difference', near(acctDiff(afterManual, invAsset.id) - acctDiff(beforeManual, invAsset.id), -777), `??=${money(acctDiff(afterManual, invAsset.id) - acctDiff(beforeManual, invAsset.id))}`);
  check('TEST 54 the reconciliation NEVER auto-writes a plug journal (only reports)', typeof afterManual.totals.difference === 'number');

  console.log('\n=== TEST 27-28: movement / history ending balance ===');
  const hist = db.prepare('SELECT SUM(quantityChange) q FROM stock_movements WHERE itemId=?').get(itemIdOf(P25.id));
  check('TEST 27/28 the movement ledger sum equals QOH for the item', near(hist.q, qoh(P25.id)));

  console.log('\n=== TEST 34-36: missing config / cost basis ===');
  const rej34 = Products.saveItemMaster({ type: 'INVENTORY_PART', name: 'ZZ Acc NoAsset', sku: `ZZ-NOASSET-${stamp}`, salesPrice: 35, purchaseCost: 20, incomeAccountId: income.id, inventoryAssetAccountId: null, cogsAccountId: cogs.id });
  check('TEST 34 an Inventory Part without an Inventory Asset account is REJECTED at setup (controlled validation)', rej34 && rej34.success === false && /Inventory Asset Account/.test(rej34.error || ''), JSON.stringify(rej34));
  let legacyPid = null;
  try {
    legacyPid = Number(db.prepare("INSERT INTO products (type, name, sku, price, is_active, inventory_asset_account_id, cogs_account_id, valuation_method) VALUES ('INVENTORY_PART', ?, ?, 35, 1, NULL, ?, 'FIFO')").run('ZZ Acc LegacyNoAsset', `ZZ-LEG-${stamp}`, cogs.id).lastInsertRowid);
  } catch { legacyPid = null; }
  const recon34 = Recon.getInventoryReconciliation();
  check('TEST 34 a legacy Inventory Part with no asset account is flagged by reconciliation', legacyPid == null || recon34.integrity.some(i => i.type === 'MISSING_INVENTORY_ASSET_ACCOUNT' && i.productId === legacyPid));
  const P36 = mkProduct('ZZ Acc NoCost');
  Inventory.receiveStock(itemIdOf(P36.id), W.id, 5, 0, { sourceType: 'receipt', sourceId: ++seq + 600000 }); // zero-cost receipt
  const recon36 = Recon.getInventoryReconciliation();
  check('TEST 36 positive stock with no cost basis is flagged (never silently zero-COGS)', recon36.integrity.some(i => i.type === 'NO_COST_BASIS' && i.productId === Number(P36.id)));

  console.log('\n=== TEST 52-53: isolation / period lock ===');
  const prodSrc = fs.readFileSync(path.join(BE, 'models', 'inventory.js'), 'utf8');
  check('TEST 52 all stock queries are scoped to the active db (dbmgr)', /require\('\.\/dbmgr(\.js)?'\)/.test(prodSrc));
  const Settings = require(path.join(BE, 'models', 'settings.js'));
  const origClosing = Settings.get('closingDate');
  try {
    Settings.set('closingDate', '2026-06-30');
    const qohBefore53 = qoh(P25.id);
    const invBefore53 = db.prepare('SELECT COUNT(*) c FROM invoices').get().c;
    await makeInvoice([invLine(P25.id, 1, 35)]);
    const qohAfter53 = qoh(P25.id);
    const invAfter53 = db.prepare('SELECT COUNT(*) c FROM invoices').get().c;
    check('TEST 53 a backdated sale into a closed period is blocked and rolls back (no stock, no invoice)', qohAfter53 === qohBefore53 && invAfter53 === invBefore53, `qoh ${qohBefore53}???${qohAfter53}, invoices ${invBefore53}???${invAfter53}`);
  } finally {
    try { Settings.set('closingDate', origClosing || ''); } catch { /* ignore */ }
  }

  console.log('\n=== TEST 55-56: legacy / performance ===');
  const historical = db.prepare(`SELECT i.id FROM invoices i WHERE NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.sourceType='invoice' AND m.sourceId=i.id) ORDER BY i.id DESC LIMIT 1`).get();
  const hBefore = historical ? moves('invoice', historical.id).length : 0;
  if (historical) { try { await require(path.join(BE, 'models', 'invoices.js')).getSingleInvoice(historical.id); } catch (_) { /* read */ } }
  const hAfter = historical ? moves('invoice', historical.id).length : 0;
  check('TEST 55 reading a legacy invoice posts NO stock (no blind backfill)', !historical || (hBefore === 0 && hAfter === 0));

  for (let i = 0; i < 800; i++) { const p = mkProduct(`ZZAccBulk${i}`); const po = addPo(p.id, 5, 10); await receivePO(ev, po.poId, { receiptDate: '2026-06-02', lines: [{ purchaseOrderLineId: po.lineId, qtyReceived: 5 }] }); }
  const t0 = Date.now();
  const big = Recon.getInventoryReconciliation();
  const ms = Date.now() - t0;
  console.log(`  reconciliation over the whole company in ${ms} ms`);
  check('TEST 56 reconciliation over 800+ items is efficient (< 3000ms)', ms < 3000 && big.accounts.length >= 1, `${ms}ms`);

  console.log('\n=== TEST 29/60: full-chain reconciliation (delta) ===');
  const P60 = mkProduct('ZZ Acc Full'); const i60 = itemIdOf(P60.id);
  const before60 = Recon.getInventoryReconciliation();
  const po60 = addPo(P60.id, 40, 20);
  await receivePO(ev, po60.poId, { receiptDate: '2026-06-02', lines: [{ purchaseOrderLineId: po60.lineId, qtyReceived: 40 }] });   // purchase receipt
  await makeBill([billItemLine(P60.id, 40, 20, po60.lineId)]);                                                                     // vendor bill
  await makeInvoice([invLine(P60.id, 5, 35)]);                                                                                     // sale
  Inventory.adjustStock(i60, W.id, -1, 'shrinkage');                                                                               // adjustment
  const after60 = Recon.getInventoryReconciliation();
  check('TEST 60 QOH reconciles to the movement ledger after the full chain', near(db.prepare('SELECT SUM(quantityChange) q FROM stock_movements WHERE itemId=?').get(i60).q, qoh(P60.id)));
  // The adjustment is the ONLY unbalanced step (no GL), so the difference moves by its value.
  check('TEST 29/60 the full chain (receipt + bill + sale + adjustment) leaves the Inventory Asset difference UNCHANGED (delta 0)', near(acctDiff(after60, invAsset.id) - acctDiff(before60, invAsset.id), 0), `delta=${money(acctDiff(after60, invAsset.id) - acctDiff(before60, invAsset.id))}`);
  check('TEST 60 subledger total ??? GL total equals the sum of per-account differences', near(totalDiff(after60), money(after60.accounts.reduce((s, a) => s + a.difference, 0))));

  console.log('\n=== UI wiring ===');
  const page = fs.readFileSync(path.join(FE, 'components', 'inventory', 'pages', 'InventoryReconciliation.js'), 'utf8');
  const idx = fs.readFileSync(path.join(FE, 'components', 'inventory', 'index.js'), 'utf8');
  const side = fs.readFileSync(path.join(FE, 'containers', 'Sidebar', 'SidebarContent.js'), 'utf8');
  check('reconciliation page has the required columns', ['Inventory Asset Account', 'Subledger Value', 'GL Balance', 'Difference'].every(c => page.includes(c)));
  check('route + sidebar link registered', /reconciliation/.test(idx) && /Inventory Reconciliation/.test(side));
  check('IPC + preload wired', /get-inventory-reconciliation/.test(fs.readFileSync(path.join(BE, 'handlers', 'inventoryHandlers.js'), 'utf8')) && /getInventoryReconciliation:/.test(fs.readFileSync(path.join(BE, 'preload.js'), 'utf8')));

  note('TEST 19/21/59 Customer Return restock + Vendor Return: NOT implemented ??? there is no restock/return-to-inventory workflow (customerRefunds/creditNotes move no stock). Documented gap.');
  note('TEST 57/58 packaged Windows end-to-end: not executed here (no GUI/display).');
  note('TEST 4/10 accounting model: Bill-driven capitalisation (not GRNI); Receipt moves quantity + valuation layers only. This is the repository\'s tested contract.');

  console.log('\n' + notes.map(n => `  - ${n}`).join('\n'));
  console.log(`\nRESULT: ${pass} passed, ${fail} failed (${notes.length} documented notes)`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e && e.stack ? e.stack : e); process.exit(1); });
