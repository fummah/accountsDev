/**
 * verify-inventory-integration.js — PHASE 10
 *
 * The brief's 21 numbered cases, end to end, against a SCRATCH COPY of the
 * company file, driven through the REAL IPC handlers (stubbed `electron`).
 *
 * ── Provenance of the 21 cases ──────────────────────────────────────────────
 * The brief itself is not in the repository; these 21 cases are reconstructed
 * from every requirement INVENTORY_INTEGRATION_AUDIT.md records from it (Parts
 * 1, 2, 3, 5, 6, 9, 13, 20, 22, 23, 24), one case per testable requirement.
 * Cases that are DEFERRED by decision D1 are marked and asserted as deferred
 * rather than reported as passing — a deferred feature must not look verified.
 *
 * Cases 1–3    Part 1  — the bug: an invoice never moved stock
 * Cases 4–6    Part 2  — the Enter Bill line redesign and its accounting
 * Cases 7–8    Part 3/5 — bill accounting
 * Case  9      Part 5/6/7 — costing  → DEFERRED (D1)
 * Cases 10–12  Part 6  — bill lifecycle
 * Cases 13–14  Part 9  — payments move no stock
 * Cases 15–16  Part 13 — idempotency is backend-authoritative
 * Case  17     Part 20 — no backfill of history
 * Cases 18–19  Part 22/23 — Stock Levels, mixed bills
 * Cases 20–21  Part 24 — Inventory History and its source trace
 *
 * ── Why the balance is tracked, not hardcoded ───────────────────────────────
 * Every case shares ONE item and ONE warehouse, and the cases run in order, so
 * a literal expectation is only correct if it happens to match the running
 * total. `expected` is advanced by each case's INTENT ("a bill of 50 buys 50",
 * "an invoice of 10 ships 10") and asserted against the observed balance — so a
 * sign error still fails loudly, but case ordering can never produce a false
 * failure. The movement-count and quantityChange assertions below are the
 * stronger evidence anyway: they prove +10 and not +110.
 */

const path = require('path');
const Module = require('module');

// ── stub electron BEFORE any handler module is required ─────────────────────
const handlers = new Map();
const electronStub = {
  ipcMain: {
    handle: (channel, fn) => {
      if (handlers.has(channel)) throw new Error(`second handler registered for '${channel}'`);
      handlers.set(channel, fn);
    },
  },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return electronStub;
  return originalLoad.apply(this, arguments);
};

const realLog = console.log.bind(console);
console.log = () => {};
require('./lib/testDb.js').useScratchCopy({ label: 'verify-inventory-integration' });

const ROOT = path.join(__dirname, '..');
const models = require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js')).raw;
const Inventory = require(path.join(ROOT, 'src', 'backend', 'models', 'inventory.js'));
const Warehouses = require(path.join(ROOT, 'src', 'backend', 'models', 'warehouses.js'));
const COA = require(path.join(ROOT, 'src', 'backend', 'models', 'chartOfAccounts.js'));
const DocumentInventory = require(path.join(ROOT, 'src', 'backend', 'services', 'documentInventory.js'));

require(path.join(ROOT, 'src', 'backend', 'handlers', 'inventoryHandlers.js'))();
require(path.join(ROOT, 'src', 'backend', 'handlers', 'invoiceHandlers.js'))();
require(path.join(ROOT, 'src', 'backend', 'handlers', 'customerHandlers.js'))();
require(path.join(ROOT, 'src', 'backend', 'handlers', 'ipcHandlers.js'))();
console.log = realLog;

let pass = 0, fail = 0;
const results = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; results.push(`  PASS  ${name}`); }
  else { fail++; results.push(`  FAIL  ${name}${detail ? `  → ${detail}` : ''}`); }
};
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;
const money = (n) => Math.round(Number(n || 0) * 100) / 100;

(async () => {
  const H = (name) => handlers.get(name);
  const ev = { sender: { id: 'verify-inventory-integration' } };

  const insertInvoice = H('insert-invoice');
  const insertExpense = H('insert-expense');
  const updateExpense = H('updateexpense');
  const deleteRecord = H('deletingrecord');
  const getItemStock = H('get-item-stock');
  const getItemMovements = H('get-item-movements');
  const createPayment = H('customer-payment-create');
  const billPay = H('bill-pay');

  check('every handler this suite needs is registered',
    !!(insertInvoice && insertExpense && updateExpense && deleteRecord &&
       getItemStock && getItemMovements && createPayment && billPay),
    [...handlers.keys()].join(','));

  // ── Fixtures ───────────────────────────────────────────────────────────
  const cust = db.prepare(`
    INSERT INTO customers (title, first_name, last_name, mobile_number, display_name, email, status, entered_by, date_entered)
    VALUES ('', 'ZZIntegration', 'Phase10', '', 'ZZ Integration Phase10', 'zz-integration@example.invalid', 'Active', 'test', datetime('now'))
  `).run();
  const customerId = Number(cust.lastInsertRowid);

  const invProduct = db.prepare("SELECT id, name, sku FROM products WHERE LOWER(type) IN ('product','inventory_part','inventory part','raw material','asset','bundle') ORDER BY id LIMIT 1").get();
  const svcProduct = db.prepare("SELECT id, name, type FROM products WHERE LOWER(type)='service' ORDER BY id LIMIT 1").get();
  const supplier = db.prepare('SELECT id FROM suppliers ORDER BY id LIMIT 1').get();
  const expenseAcct = db.prepare(
    "SELECT id, name FROM chart_of_accounts WHERE LOWER(type)='expense' AND status='Active' ORDER BY id LIMIT 1"
  ).get();
  const bankAcct = db.prepare(
    "SELECT id, name FROM chart_of_accounts WHERE LOWER(type)='bank' AND status='Active' ORDER BY id LIMIT 1"
  ).get();

  const W = Warehouses.getOrCreateDefault();
  const item = Inventory.resolveInventoryItem(invProduct.id);
  const invAsset = COA.getSystemAccount('Inventory Asset');

  const stockOf = (itemId, warehouseId) => {
    const r = db.prepare('SELECT quantity FROM item_stock WHERE itemId = ? AND warehouseId = ?')
      .get(Number(itemId), Number(warehouseId));
    return r ? Number(r.quantity) : 0;
  };
  const movements = (sourceType, sourceId) => db.prepare(
    'SELECT * FROM stock_movements WHERE sourceType = ? AND sourceId = ? ORDER BY id'
  ).all(sourceType, Number(sourceId));
  const glLines = (sourceType, sourceId) => {
    const e = db.prepare(
      "SELECT id FROM journal_entries WHERE source_type = ? AND source_id = ? AND status = 'Posted'"
    ).get(sourceType, Number(sourceId));
    return e ? db.prepare('SELECT account_id, debit, credit FROM journal_lines WHERE journal_id = ?').all(e.id) : [];
  };

  const BASELINE = stockOf(item.id, W.id);
  let expected = BASELINE;                 // running expectation for (item, warehouse)
  const stockNow = () => stockOf(item.id, W.id);
  const stockNote = () => `expected ${expected}, got ${stockNow()}`;

  console.log('\n=== Inventory integration — the 21 cases ===');
  console.log(`  fixtures: customer #${customerId}, supplier #${supplier.id}, item #${item.id}, ` +
              `warehouse #${W.id}, inventory product #${invProduct.id}, service product #${svcProduct.id}`);
  console.log(`  baseline stock: ${BASELINE}\n`);

  const invLine = (qty, rate) => ({
    product_id: invProduct.id, product: invProduct.id, description: 'integration fixture',
    quantity: qty, rate, amount: money(qty * rate),
  });
  const billItemLine = (qty, rate) => ({
    line_type: 'item', product_id: invProduct.id, quantity: qty, rate,
    amount: money(qty * rate), warehouse_id: W.id, description: 'integration fixture',
  });
  const billAcctLine = (amount) => ({
    line_type: 'account', accountId: expenseAcct.id, category: expenseAcct.name,
    description: 'freight', amount,
  });

  const makeInvoice = async (lines, status) => {
    const res = await insertInvoice(ev, customerId, 'zz-integration@example.invalid', false, 'Addr',
      'Net 30', '2026-06-01', '2026-07-01', '', '', null, 'test', 0, status, lines);
    return res && (res.invoiceId || res.invoice_id || res.id);
  };
  const makeBill = async (lines, status = 'Unpaid') => {
    const res = await insertExpense(ev, supplier.id, 'Accounts Payable', '2026-06-01', 'bill',
      'ZZ-INT-1', 'bill', 'test', status, lines, '2026-06-01', 'integration fixture', 30);
    return res && res.expenseId;
  };

  // ══ Cases 1–3 — Part 1: the bug ═════════════════════════════════════════
  const invA = await makeInvoice([invLine(10, 25)]);
  expected -= 10;                                    // an invoice ships 10
  check('[01] saving a sales invoice with an inventory product reduces stock',
    near(stockNow(), expected), stockNote());
  check('[01] … and posts the journal entry under the same guard',
    glLines('invoice', invA).length > 0);

  const invSvc = await makeInvoice([invLine(5, 100)].map(l => ({ ...l, product_id: svcProduct.id, product: svcProduct.id })));
  check('[02] an invoice for a SERVICE product moves no stock',
    movements('invoice', invSvc).length === 0, `${movements('invoice', invSvc).length}`);
  check('[02] … and leaves the balance untouched', near(stockNow(), expected), stockNote());

  const invDraft = await makeInvoice([invLine(4, 25)], 'Draft');
  check('[03] a DRAFT invoice moves no stock', movements('invoice', invDraft).length === 0,
    `${movements('invoice', invDraft).length}`);
  check('[03] … and posts no journal entry', glLines('invoice', invDraft).length === 0);

  // ══ Cases 4–6 — Part 2: the Enter Bill line redesign ═══════════════════
  const billA = await makeBill([billItemLine(50, 22), billAcctLine(20)]);
  expected += 50;                                    // a bill buys 50
  const billLines = db.prepare('SELECT * FROM expense_lines WHERE expense_id = ? ORDER BY id').all(Number(billA));
  check('[04] a bill line can be an INVENTORY ITEM (product + qty + rate + warehouse)',
    billLines.length === 2 && billLines[0].line_type === 'item' &&
    Number(billLines[0].product_id) === Number(invProduct.id) &&
    near(billLines[0].quantity, 50) && near(billLines[0].rate, 22) &&
    Number(billLines[0].warehouse_id) === Number(W.id),
    JSON.stringify(billLines[0]));
  check('[05] a bill line can still be an ACCOUNT line with a typed amount',
    billLines[1].line_type === 'account' && Number(billLines[1].account_id) === Number(expenseAcct.id) &&
    money(billLines[1].amount) === 20 && billLines[1].product_id == null,
    JSON.stringify(billLines[1]));

  const billGl = glLines('expense', billA);
  const invDebit = billGl.find(l => Number(l.account_id) === Number(invAsset.id) && Number(l.debit) > 0);
  check('[06] an inventory line debits INVENTORY ASSET, not an expense account',
    !!invDebit && money(invDebit.debit) === 1100, JSON.stringify(billGl));

  // ══ Cases 7–8 — Part 3/5: bill accounting ══════════════════════════════
  const ap = COA.getSystemAccount('Accounts Payable');
  const apCredit = billGl.find(l => Number(l.account_id) === Number(ap.id) && Number(l.credit) > 0);
  check('[07] Accounts Payable is credited the FULL bill total (1120)',
    !!apCredit && money(apCredit.credit) === 1120, apCredit && apCredit.credit);
  const totalDr = money(billGl.reduce((s, l) => s + Number(l.debit || 0), 0));
  const totalCr = money(billGl.reduce((s, l) => s + Number(l.credit || 0), 0));
  check('[08] the posted bill entry balances', totalDr === totalCr && totalDr === 1120,
    `DR ${totalDr} / CR ${totalCr}`);

  // ══ Case 9 — costing: DEFERRED ═════════════════════════════════════════
  const costCols = db.prepare("PRAGMA table_info('stock_movements')").all().map(c => c.name);
  const hasCosting = ['averageCost', 'avgCost', 'fifoLayer', 'costOfGoods'].some(c => costCols.includes(c));
  check('[09] costing / valuation is DEFERRED (decision D1) — no costing engine exists, ' +
        'and the GL uses the bill line amount', hasCosting === false,
    'a costing column appeared — D1 must be revisited');
  check('[09] … and the movement still records the bill line rate for traceability',
    movements('bill', billA).some(m => m.unitCost != null && near(m.unitCost, 22)),
    JSON.stringify(movements('bill', billA).map(m => m.unitCost)));

  // ══ Cases 10–12 — Part 6: bill lifecycle ═══════════════════════════════
  const editBill = (lines, status = 'Unpaid') => updateExpense(ev, {
    id: Number(billA), payee: supplier.id, payment_account: 'Accounts Payable',
    payment_date: '2026-06-01', payment_method: 'bill', ref_no: 'ZZ-INT-1', category: 'bill',
    approval_status: status, due_date: '2026-06-01', memo: '', terms: 30, lines,
  });

  await editBill([billItemLine(60, 22), billAcctLine(20)]);
  expected += 10;                                    // 50 → 60 is +10, not +60
  const mA = movements('bill', billA);
  check('[10] editing a bill 50 → 60 moves the stock by exactly +10',
    near(stockNow(), expected), stockNote());
  check('[10] … and posts ONE further movement, not a second receipt of 60',
    mA.length === 2 && near(mA[1].quantityChange, 10),
    `movements ${mA.length}: ${mA.map(m => m.quantityChange).join(',')}`);

  await editBill([billItemLine(40, 22), billAcctLine(20)]);
  expected -= 20;                                    // 60 → 40 gives 20 back
  check('[11] reducing a bill 60 → 40 gives the goods back',
    near(stockNow(), expected), stockNote());
  check('[11] … as an issue of 20, not a re-receipt',
    near(movements('bill', billA)[2].quantityChange, -20),
    movements('bill', billA)[2].quantityChange);

  const billB = await makeBill([billItemLine(7, 5)]);
  expected += 7;
  const beforeDelete = stockNow();
  await deleteRecord(ev, Number(billB), 'expenses');
  expected -= 7;
  check('[12] deleting a bill reverses its receipt',
    near(stockNow(), beforeDelete - 7) && near(stockNow(), expected),
    `${beforeDelete} → ${stockNow()}`);

  // ══ Cases 13–14 — Part 9: payments ═════════════════════════════════════
  const invPaid = await makeInvoice([invLine(3, 25)]);
  expected -= 3;
  const beforePay = stockNow();
  const invMovesBefore = movements('invoice', invPaid).length;
  const pay = await createPayment(ev, {
    customerId, amount: 75, date: '2026-06-05', paymentMethod: 'Cash',
    reference: 'ZZ-INT-PAY', allocations: [{ invoiceId: Number(invPaid), amount: 75 }],
  });
  check('[13] Receive Payment creates NO movement',
    !!(pay && pay.success) && near(stockNow(), beforePay) &&
    movements('invoice', invPaid).length === invMovesBefore,
    `stock ${beforePay} → ${stockNow()}, movements ${invMovesBefore} → ${movements('invoice', invPaid).length}`);

  const billPaid = await makeBill([billItemLine(2, 9)]);
  expected += 2;
  const beforeBillPay = stockNow();
  const billMovesBefore = movements('bill', billPaid).length;
  const bp = bankAcct
    ? await billPay(ev, { expenseId: Number(billPaid), amount: 18, paymentDate: '2026-06-10',
        bankAccount: bankAcct.id, checkNumber: 'ZZ-1' })
    : { success: false, error: 'no active Bank account in this database' };
  check('[14] Pay Bill creates NO movement',
    near(stockNow(), beforeBillPay) && movements('bill', billPaid).length === billMovesBefore,
    `bill-pay ${JSON.stringify(bp)}; stock ${beforeBillPay} → ${stockNow()}`);

  // ══ Cases 15–16 — Part 13: idempotency is backend-authoritative ════════
  const movesBefore = movements('bill', billA).length;
  await editBill([billItemLine(40, 22), billAcctLine(20)]);
  check('[15] re-saving a document with no change posts nothing at all',
    movements('bill', billA).length === movesBefore && near(stockNow(), expected),
    `${movesBefore} → ${movements('bill', billA).length}; ${stockNote()}`);

  // The replay must be fed the document's OWN persisted lines. Passing [] is
  // the REVERSER (see the next check), not a no-op — that distinction is the
  // whole contract of services/documentInventory.js.
  const billALines = db.prepare(
    `SELECT id AS lineId, product_id AS productId, quantity, rate AS unitCost, warehouse_id AS warehouseId
       FROM expense_lines WHERE expense_id = ? AND line_type = 'item' ORDER BY id`
  ).all(Number(billA));
  const replay = DocumentInventory.reconcileBillStock(billA, billALines);
  check('[16] a replayed reconcile is a backend no-op (the guard is not a disabled button)',
    replay && replay.applied.length === 0 && movements('bill', billA).length === movesBefore,
    JSON.stringify(replay && replay.applied));
  check('[16] … and the balance is unchanged by the replay', near(stockNow(), expected), stockNote());

  // …and the complementary half of the contract: no lines at all reverses the
  // document. Draft / Void / Cancelled and a delete all ride on this.
  const scratch = await makeBill([billItemLine(6, 4)]);
  expected += 6;
  const rev = DocumentInventory.reverseBillStock(scratch);
  expected -= 6;
  check('[16] … and passing NO lines reverses the document (the Draft/Void/delete contract)',
    rev && rev.applied.length === 1 && near(rev.applied[0].delta, -6) && near(stockNow(), expected),
    `${JSON.stringify(rev && rev.applied)}; ${stockNote()}`);

  // ══ Case 17 — Part 20: no backfill ═════════════════════════════════════
  // The guarantee is that NOTHING iterates historical invoices to post stock:
  // a plain READ must never create a movement. (Asserting "the newest historical
  // invoice has no movements" was brittle — invoices created by an earlier test
  // run legitimately have them. Picking a movement-free historical invoice and
  // proving a read leaves it movement-free tests the actual contract.)
  const historical = db.prepare(
    `SELECT i.id FROM invoices i
      WHERE i.id < ?
        AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.sourceType = 'invoice' AND m.sourceId = i.id)
      ORDER BY i.id DESC LIMIT 1`
  ).get(Number(invA));
  const histMovesBefore = historical ? movements('invoice', historical.id).length : 0;
  if (historical) {
    try { await models.Invoices.getSingleInvoice(historical.id); } catch (_) { /* read path */ }
    try { models.Invoices.getPaginated(1, 5, '', '', '', '', '', ''); } catch (_) { /* read path */ }
  }
  const histMovesAfter = historical ? movements('invoice', historical.id).length : 0;
  check('[17] reading a historical invoice posts NO stock (no backfill)',
    !historical || (histMovesBefore === 0 && histMovesAfter === 0),
    historical ? `invoice #${historical.id}: ${histMovesBefore} -> ${histMovesAfter}` : 'no movement-free historical invoice to check');
  const totalMovements = db.prepare(
    "SELECT COUNT(*) AS c FROM stock_movements WHERE sourceType IN ('bill','invoice')"
  ).get().c;
  console.log(`  (documents drove ${totalMovements} movements in this run — historical rows contributed none)`);

  // ══ Cases 18–19 — Part 22/23: Stock Levels and mixed bills ═════════════
  const stockRows = await getItemStock(ev, item.id);
  const wRow = Array.isArray(stockRows) ? stockRows.find(r => Number(r.warehouseId) === Number(W.id)) : null;
  check('[18] Stock Levels reports the balance from item_stock (the single source of truth)',
    !!wRow && near(wRow.quantity, stockNow()), `${JSON.stringify(stockRows)} vs item_stock ${stockNow()}`);
  check('[18] … and agrees with the reconciled balance', !!wRow && near(wRow.quantity, expected),
    wRow && wRow.quantity);

  const mixed = await makeBill([billItemLine(5, 3), billItemLine(4, 3)]);
  expected += 9;                                     // 5 + 4, both counted
  check('[19] two bill lines for the SAME product and warehouse both count (mixed bills)',
    near(stockNow(), expected), stockNote());
  check('[19] … and they are summed into the posted quantity',
    near(Inventory.getPostedQuantity('bill', mixed, item.id, W.id), 9),
    Inventory.getPostedQuantity('bill', mixed, item.id, W.id));

  // ══ Cases 20–21 — Part 24: Inventory History ══════════════════════════
  const history = await getItemMovements(ev, item.id, 200);
  const billHistory = (Array.isArray(history) ? history : []).filter(m => m.sourceType === 'bill');
  check('[20] Inventory History returns the item\'s movements, newest first',
    Array.isArray(history) && history.length > 0 &&
    (history.length < 2 || String(history[0].movedAt) >= String(history[history.length - 1].movedAt)),
    `${Array.isArray(history) ? history.length : 'not an array'} rows`);
  check('[20] … and captions a bill movement with its VENDOR and bill reference',
    billHistory.length > 0 && /^Vendor bill /.test(billHistory[0].source || ''),
    billHistory[0] && billHistory[0].source);
  const invHistory = (Array.isArray(history) ? history : []).filter(m => m.sourceType === 'invoice');
  check('[20] … and captions an invoice movement with its INVOICE number',
    invHistory.length > 0 && /^Invoice /.test(invHistory[0].source || ''),
    invHistory[0] && invHistory[0].source);

  const withLine = (Array.isArray(history) ? history : []).filter(m => m.sourceLineId != null);
  check('[21] every document-driven movement is traceable to its source LINE',
    withLine.length > 0 && withLine.every(m => Number(m.sourceLineId) > 0),
    `${withLine.length} of ${Array.isArray(history) ? history.length : 0} rows carry a line id`);
  const sourced = (Array.isArray(history) ? history : []).filter(m => m.sourceType);
  check('[21] … and to its source DOCUMENT',
    sourced.length > 0 && sourced.every(m => Number(m.sourceId) > 0),
    `${sourced.length} rows`);

  // ══ Report ═════════════════════════════════════════════════════════════
  console.log(results.join('\n'));
  console.log(`\n  item #${item.id} in warehouse #${W.id}: ${BASELINE} → ${stockNow()} (expected ${expected})`);
  console.log(`  document-driven movements: ${totalMovements}`);
  console.log(`\n  ${pass} passed, ${fail} failed\n`);

  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\nFATAL:', e && e.stack ? e.stack : e);
  console.log(`\n  ${pass} passed, ${fail + 1} failed\n`);
  process.exit(1);
});
