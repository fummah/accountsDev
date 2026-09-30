/**
 * verify-inventory-returns.js — physical returns (customer restock / vendor
 * return) move stock through the CENTRAL engine, at the correct cost basis,
 * with COGS/Inventory Asset accounting, atomically.
 *
 * Runs on a SCRATCH COPY, driven through the REAL invoice handler.
 */
const path = require('path');
const Module = require('module');
const handlers = new Map();
const electronStub = { ipcMain: { handle: (c, fn) => { if (!handlers.has(c)) handlers.set(c, fn); } } };
const originalLoad = Module._load;
Module._load = function (request) { if (request === 'electron') return electronStub; return originalLoad.apply(this, arguments); };

const realLog = console.log.bind(console);
console.log = () => {};
require('./lib/testDb.js').useScratchCopy({ label: 'verify-inventory-returns' });

const ROOT = path.join(__dirname, '..');
const BE = path.join(ROOT, 'src', 'backend');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
const fs = require('fs');
const db = require(path.join(BE, 'models', 'dbmgr.js')).raw;
const Products = require(path.join(BE, 'models', 'products.js'));
const Inventory = require(path.join(BE, 'models', 'inventory.js'));
const Warehouses = require(path.join(BE, 'models', 'warehouses.js'));
const COA = require(path.join(BE, 'models', 'chartOfAccounts.js'));
const Valuation = require(path.join(BE, 'services', 'inventoryValuation.js'));
const Recon = require(path.join(BE, 'services', 'inventoryReconciliationService.js'));
const Returns = require(path.join(BE, 'services', 'inventoryReturnsService.js'));
const JournalEntries = require(path.join(BE, 'models', 'journalEntries.js'));

require(path.join(BE, 'handlers', 'invoiceHandlers.js'))();
require(path.join(BE, 'handlers', 'inventoryHandlers.js'))();
console.log = realLog;

let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  -> ${d}` : ''}`); } };
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
const money = (n) => Math.round(Number(n || 0) * 100) / 100;

(async () => {
  const ev = { sender: { id: 'verify-inventory-returns' } };
  const insertInvoice = handlers.get('insert-invoice');
  const cust = db.prepare(`INSERT INTO customers (title, first_name, last_name, mobile_number, display_name, email, status, entered_by, date_entered) VALUES ('', 'ZZRet', 'Cust', '', 'ZZ Ret Cust', 'zz-ret@example.invalid', 'Active', 'test', datetime('now'))`).run();
  const customerId = Number(cust.lastInsertRowid);
  const W = Warehouses.getOrCreateDefault();
  const income = COA.getByName('Sales Revenue') || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('income','other income') AND status='Active' LIMIT 1").get();
  const cogs = COA.getSystemAccount('Cost of Goods Sold');
  const invAsset = COA.getSystemAccount('Inventory Asset');
  const offset = COA.getSystemAccount('Inventory Adjustment');
  const stamp = Date.now();
  let seq = 0;

  check('the configured "Inventory Adjustment" offset account exists', !!offset);

  const mkProduct = (name, extra = {}) => Products.saveItemMaster({
    type: 'INVENTORY_PART', name, sku: `${name}-${stamp}-${++seq}`, salesPrice: 35, purchaseCost: 20,
    incomeAccountId: income.id, inventoryAssetAccountId: invAsset.id, cogsAccountId: cogs.id, valuationMethod: 'FIFO', ...extra,
  });
  const itemIdOf = (pid) => Inventory.resolveItemId(Number(pid));
  const qoh = (pid) => Number(db.prepare('SELECT COALESCE(SUM(quantity),0) q FROM item_stock WHERE itemId=?').get(itemIdOf(pid)).q);
  const moves = (t, id) => db.prepare('SELECT * FROM stock_movements WHERE sourceType=? AND sourceId=? ORDER BY id').all(t, Number(id));
  const glFor = (t, id) => { const e = db.prepare("SELECT id FROM journal_entries WHERE source_type=? AND source_id=? AND status='Posted' ORDER BY id DESC LIMIT 1").get(t, id); return e ? db.prepare('SELECT account_id,debit,credit FROM journal_lines WHERE journal_id=?').all(e.id) : []; };
  const glLatest = (t) => { const e = db.prepare("SELECT id FROM journal_entries WHERE source_type=? AND status='Posted' ORDER BY id DESC LIMIT 1").get(t); return e ? db.prepare('SELECT account_id,debit,credit FROM journal_lines WHERE journal_id=?').all(e.id) : []; };
  const glAcct = (gl, id, side) => money(gl.filter(l => Number(l.account_id) === Number(id)).reduce((s, l) => s + Number(l[side] || 0), 0));
  const makeInvoice = async (lines) => {
    const res = await insertInvoice(ev, customerId, 'zz-ret@example.invalid', false, 'Addr', 'Net 30', '2026-06-15', '2026-07-15', '', '', null, 'test', 0, null, lines);
    return res && (res.invoiceId || res.invoice_id || res.id);
  };
  const invLine = (pid, qty, rate) => ({ product_id: pid, product: pid, description: 'sale', quantity: qty, rate, amount: money(qty * rate) });

  console.log('\n=== customer return + restock ===');
  const P = mkProduct('ZZ Ret Widget');
  Inventory.receiveStock(itemIdOf(P.id), W.id, 20, 20, { sourceType: 'receipt', sourceId: ++seq + 500000 });
  const inv = await makeInvoice([invLine(P.id, 5, 35)]);
  check('sale posted: QOH 15, COGS $100', qoh(P.id) === 15 && near(glAcct(glFor('invoice', inv), cogs.id, 'debit'), 100));

  const before = Recon.getInventoryReconciliation();
  const ret = Returns.restockCustomerReturn({ productId: P.id, quantity: 2, invoiceId: inv });
  check('customer return restock succeeds', ret.success === true, JSON.stringify(ret));
  check('restock increases QOH by 2 (15 → 17)', qoh(P.id) === 17, `${qoh(P.id)}`);
  check('restock values the goods at the ORIGINAL sale cost (20), not the selling price', near(ret.unitCost, 20));
  const retGl = glFor('customer_return', inv);
  check('restock posts Dr Inventory Asset / Cr COGS (COGS reversed $40)', near(glAcct(retGl, invAsset.id, 'debit'), 40) && near(glAcct(retGl, cogs.id, 'credit'), 40), JSON.stringify(retGl));
  check('the restock movement is linked to the original invoice', moves('customer_return', inv).length === 1 && near(moves('customer_return', inv)[0].quantityChange, 2));
  check('inventory value restored by 2 × 20 = $40', near(Valuation.currentValue(itemIdOf(P.id), 'FIFO'), 17 * 20));
  const after = Recon.getInventoryReconciliation();
  const acctDiff = (r) => { const a = r.accounts.find(x => Number(x.accountId) === Number(invAsset.id)); return a ? a.difference : 0; };
  check('restock keeps the subledger↔GL difference unchanged (delta 0)', near(acctDiff(after) - acctDiff(before), 0), `delta=${money(acctDiff(after) - acctDiff(before))}`);

  console.log('\n=== vendor return ===');
  const vr = Returns.vendorReturn({ productId: P.id, quantity: 3, reason: 'damaged' });
  check('vendor return succeeds', vr.success === true, JSON.stringify(vr));
  check('vendor return reduces QOH by 3 (17 → 14)', qoh(P.id) === 14, `${qoh(P.id)}`);
  check('vendor return removes stock at the central carrying cost (20)', near(vr.unitCost, 20));
  const vrGl = glLatest('vendor_return');
  check('vendor return posts Dr offset / Cr Inventory Asset ($60)', near(glAcct(vrGl, offset.id, 'debit'), 60) && near(glAcct(vrGl, invAsset.id, 'credit'), 60), JSON.stringify(vrGl));
  const afterVr = Recon.getInventoryReconciliation();
  check('vendor return keeps the subledger↔GL difference unchanged (delta 0)', near(acctDiff(afterVr) - acctDiff(after), 0), `delta=${money(acctDiff(afterVr) - acctDiff(after))}`);

  console.log('\n=== guards / atomicity ===');
  const svc = mkProduct('ZZ Ret Service', { type: 'SERVICE', inventoryAssetAccountId: undefined });
  const bad = Returns.restockCustomerReturn({ productId: svc.id, quantity: 1 });
  check('a Service cannot be restocked (controlled error, no movement)', bad.success === false && /inventory-tracked/i.test(bad.error || ''), JSON.stringify(bad));
  const badQty = Returns.restockCustomerReturn({ productId: P.id, quantity: 0 });
  check('a non-positive quantity is rejected', badQty.success === false);

  const P2 = mkProduct('ZZ Ret Atomic');
  Inventory.receiveStock(itemIdOf(P2.id), W.id, 10, 20, { sourceType: 'receipt', sourceId: ++seq + 500000 });
  const qohBefore = qoh(P2.id);
  const origPost = JournalEntries.post;
  JournalEntries.post = () => { throw new Error('forced GL failure'); };
  const failed = Returns.restockCustomerReturn({ productId: P2.id, quantity: 2 });
  JournalEntries.post = origPost;
  check('a failed GL posting rolls the restock back (atomic, no stock change)', failed.success === false && qoh(P2.id) === qohBefore, `qoh ${qohBefore} → ${qoh(P2.id)}`);

  console.log('\n=== UI wiring ===');
  const ui = fs.readFileSync(path.join(FE, 'components', 'shared', 'UnifiedItemList.js'), 'utf8');
  const preload = fs.readFileSync(path.join(BE, 'preload.js'), 'utf8');
  const invHandlers = fs.readFileSync(path.join(BE, 'handlers', 'inventoryHandlers.js'), 'utf8');
  check('IPC handlers registered', /customer-return-restock/.test(invHandlers) && /vendor-return/.test(invHandlers));
  check('preload exposes restockCustomerReturn / vendorReturn', /restockCustomerReturn:/.test(preload) && /vendorReturn:/.test(preload));
  check('item detail exposes Customer Return + Vendor Return actions', /Customer Return/.test(ui) && /Vendor Return/.test(ui) && /submitReturn/.test(ui));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e && e.stack ? e.stack : e); process.exit(1); });
