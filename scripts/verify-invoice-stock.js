/**
 * verify-invoice-stock.js
 *
 * Proves the Phase-7/8/9 contract — the Part 1 fix: **saving a sales invoice
 * reduces inventory, and nothing else does.**
 *
 * This suite drives the REAL IPC handlers rather than the models, because the
 * bug being fixed lives in the handler layer: `postInvoice` was called there and
 * stock was never wired to it at all. `ipcMain` does not exist under
 * ELECTRON_RUN_AS_NODE, so the electron module is stubbed and the handlers the
 * modules register are captured — the same technique as verify-quote-handlers.
 *
 * It then ALSO calls `models.Invoices.insertInvoice` directly (§10–11), because
 * five callers create invoices and only one of them goes through a handler. A
 * handler-only suite cannot see the other four.
 *
 * Runs on a SCRATCH COPY of the company file.
 *
 * What it pins down:
 *   • insert-invoice issues stock AND posts the journal — one guard, both effects
 *   • a Service line moves no stock (classification, not a name or a guess)
 *   • a Draft invoice issues nothing
 *   • edit 10 → 15 issues 5 more; edit 15 → 12 gives 3 back (delta, not re-post)
 *   • editing to Draft reverses the whole issue
 *   • deleting the invoice gives the stock back
 *   • a customer payment moves NO stock (Part 9 — verify only)
 *   • a DIRECT model insert (no handler) still issues stock, and still respects
 *     the Draft guard — so the recurring / scheduler / project / import callers
 *     are covered too
 *   • a DIRECT model update reconciles stock the same way
 *   • both writes are atomic with the stock: injecting a stock failure leaves no
 *     invoice row behind (insert), and leaves the invoice's ORIGINAL lines
 *     intact (update, whose DELETE would otherwise be unrolled-back)
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

// Silence the model layer's verbose SQL while it boots (dbmgr sets
// `options.verbose = console.log` in development).
const realLog = console.log.bind(console);
console.log = () => {};
require('./lib/testDb.js').useScratchCopy({ label: 'verify-invoice-stock' });

const ROOT = path.join(__dirname, '..');
const models = require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js')).raw;
const Inventory = require(path.join(ROOT, 'src', 'backend', 'models', 'inventory.js'));
const Warehouses = require(path.join(ROOT, 'src', 'backend', 'models', 'warehouses.js'));

require(path.join(ROOT, 'src', 'backend', 'handlers', 'invoiceHandlers.js'))();
require(path.join(ROOT, 'src', 'backend', 'handlers', 'customerHandlers.js'))();
console.log = realLog;

let pass = 0, fail = 0;
const results = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; results.push(`  PASS  ${name}`); }
  else { fail++; results.push(`  FAIL  ${name}${detail ? `  → ${detail}` : ''}`); }
};
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;

(async () => {
  const insertInvoice = handlers.get('insert-invoice');
  const updateInvoice = handlers.get('updateinvoice');
  const createPayment = handlers.get('customer-payment-create');
  const fakeEvent = { sender: { id: 'verify-invoice-stock' } };

  check('the invoice handlers are registered', !!insertInvoice && !!updateInvoice,
    [...handlers.keys()].join(','));

  // ── Fixtures ───────────────────────────────────────────────────────────
  const cust = db.prepare(`
    INSERT INTO customers (title, first_name, last_name, mobile_number, display_name, email, status, entered_by, date_entered)
    VALUES ('', 'ZZInvoiceStock', 'Verify', '', 'ZZ Invoice Stock', 'zz-invoice-stock@example.invalid', 'Active', 'test', datetime('now'))
  `).run();
  const customerId = Number(cust.lastInsertRowid);

  const invProduct = db.prepare(
    "SELECT id, name, sku FROM products WHERE LOWER(type) IN ('product','inventory_part','inventory part','raw material','asset','bundle') ORDER BY id LIMIT 1"
  ).get();
  const svcProduct = db.prepare(
    "SELECT id, name, type FROM products WHERE LOWER(type) = 'service' ORDER BY id LIMIT 1"
  ).get();
  const W = Warehouses.getOrCreateDefault();

  const item = Inventory.resolveInventoryItem(invProduct.id);
  const stockOf = () => {
    const r = db.prepare('SELECT quantity FROM item_stock WHERE itemId = ? AND warehouseId = ?')
      .get(Number(item.id), Number(W.id));
    return r ? Number(r.quantity) : 0;
  };
  const movementsOf = (invoiceId) => db.prepare(
    "SELECT * FROM stock_movements WHERE sourceType = 'invoice' AND sourceId = ? ORDER BY id"
  ).all(Number(invoiceId));
  const glPosted = (invoiceId) => !!db.prepare(
    "SELECT id FROM journal_entries WHERE source_type = 'invoice' AND source_id = ? AND status = 'Posted' LIMIT 1"
  ).get(Number(invoiceId));

  // A line the invoice model understands: it reads `product_id || product`.
  const line = (productId, qty, rate) => ({
    product_id: productId, product: productId, description: 'stock fixture',
    quantity: qty, rate, amount: Math.round(qty * rate * 100) / 100,
  });

  const BASELINE = stockOf();
  console.log('\n=== Invoice → stock ===');
  console.log(`  fixture: customer #${customerId}, inventory product #${invProduct.id} "${invProduct.name}", ` +
              `service product #${svcProduct.id} "${svcProduct.name}"`);
  console.log(`  item #${item.id}, default warehouse #${W.id} "${W.name}", baseline stock ${BASELINE}`);

  // ── 1. Insert issues the stock AND posts the journal ───────────────────
  const created = await insertInvoice(
    fakeEvent, customerId, 'zz-invoice-stock@example.invalid', false, 'Addr', 'Net 30',
    '2026-06-01', '2026-07-01', '', '', null, 'test', 0, undefined,
    [line(invProduct.id, 10, 25)]
  );
  check('insert-invoice succeeds', !!(created && (created.success || created.invoiceId || created.id)),
    JSON.stringify(created));
  const invId = created && (created.invoiceId || created.invoice_id || created.id);
  check('insert-invoice returns an invoice id', !!invId, JSON.stringify(created));
  check('  … and reports no stock warning', !(created && created.stockWarning),
    created && created.stockWarning);

  check('saving an invoice REDUCES stock by 10', near(stockOf(), BASELINE - 10),
    `${BASELINE} → ${stockOf()}`);
  const mv = movementsOf(invId);
  check('exactly one movement was written', mv.length === 1, `${mv.length}`);
  check('the movement is −10', !!mv[0] && near(mv[0].quantityChange, -10), mv[0] && mv[0].quantityChange);
  check('the movement carries sourceType "invoice"', mv[0] && mv[0].sourceType === 'invoice',
    mv[0] && mv[0].sourceType);
  check('the movement carries the sourceId', mv[0] && Number(mv[0].sourceId) === Number(invId));
  check('the movement points at its source LINE', mv[0] && Number(mv[0].sourceLineId) > 0,
    mv[0] && mv[0].sourceLineId);
  check('the movement records NO cost (a selling price is not a cost)',
    mv[0] && mv[0].unitCost == null, mv[0] && mv[0].unitCost);
  check('hasMovement("invoice", id) is true', Inventory.hasMovement('invoice', invId) === true);

  // The GL must have been posted by the SAME guard — that is the whole point.
  check('the journal entry was posted too (one guard, both effects)', glPosted(invId));

  // ── 2. A Service line moves no stock ───────────────────────────────────
  const svc = await insertInvoice(
    fakeEvent, customerId, 'zz-invoice-stock@example.invalid', false, 'Addr', 'Net 30',
    '2026-06-01', '2026-07-01', '', '', null, 'test', 0, undefined,
    [line(svcProduct.id, 5, 100)]
  );
  const svcId = svc && (svc.invoiceId || svc.invoice_id || svc.id);
  check('a service-only invoice saves', !!svcId, JSON.stringify(svc));
  check('a service-only invoice writes NO movement', movementsOf(svcId).length === 0,
    `${movementsOf(svcId).length}`);
  check('a service-only invoice leaves stock alone', near(stockOf(), BASELINE - 10), stockOf());

  // ── 3. A Draft invoice issues nothing ──────────────────────────────────
  const draft = await insertInvoice(
    fakeEvent, customerId, 'zz-invoice-stock@example.invalid', false, 'Addr', 'Net 30',
    '2026-06-01', '2026-07-01', '', '', null, 'test', 0, 'Draft',
    [line(invProduct.id, 4, 25)]
  );
  const draftId = draft && (draft.invoiceId || draft.invoice_id || draft.id);
  check('a Draft invoice saves', !!draftId, JSON.stringify(draft));
  check('a Draft invoice writes NO movement', movementsOf(draftId).length === 0,
    `${movementsOf(draftId).length}`);
  check('a Draft invoice posts NO journal entry', glPosted(draftId) === false);
  check('a Draft invoice leaves stock alone', near(stockOf(), BASELINE - 10), stockOf());

  // ── 4. Edit 10 → 15 issues 5 more ──────────────────────────────────────
  const invRow = db.prepare('SELECT * FROM invoices WHERE id = ?').get(Number(invId));
  const editPayload = (lines, status) => ({
    id: Number(invId), customer: customerId, customer_email: 'zz-invoice-stock@example.invalid',
    islater: false, billing_address: 'Addr', terms: 'Net 30', start_date: '2026-06-01',
    last_date: '2026-07-01', number: invRow.number, vat: 0, message: '', statement_message: '',
    status, lines,
  });

  await updateInvoice(fakeEvent, editPayload([line(invProduct.id, 15, 25)], undefined));
  check('editing 10 → 15 leaves 15 issued', near(stockOf(), BASELINE - 15), stockOf());
  const mv2 = movementsOf(invId);
  check('the edit wrote exactly one more movement', mv2.length === 2, `${mv2.length}`);
  check('the delta issued is −5, never a second −10',
    mv2[1] && near(mv2[1].quantityChange, -5), mv2[1] && mv2[1].quantityChange);

  // ── 5. Edit 15 → 12 gives 3 back ───────────────────────────────────────
  await updateInvoice(fakeEvent, editPayload([line(invProduct.id, 12, 25)], undefined));
  check('editing 15 → 12 leaves 12 issued', near(stockOf(), BASELINE - 12), stockOf());
  const mv3 = movementsOf(invId);
  check('a reduction gives goods back (+3)', mv3[2] && near(mv3[2].quantityChange, 3),
    mv3[2] && mv3[2].quantityChange);

  // ── 6. An unchanged re-save moves nothing ──────────────────────────────
  const before = movementsOf(invId).length;
  await updateInvoice(fakeEvent, editPayload([line(invProduct.id, 12, 25)], undefined));
  check('an unchanged re-save writes no movement', movementsOf(invId).length === before,
    `${before} → ${movementsOf(invId).length}`);

  // ── 7. Editing to Draft reverses the whole issue ───────────────────────
  await updateInvoice(fakeEvent, editPayload([line(invProduct.id, 12, 25)], 'Draft'));
  check('editing an invoice to Draft gives ALL the stock back', near(stockOf(), BASELINE), stockOf());
  check('  … and it did so by a movement, not by deleting history',
    movementsOf(invId).length > mv3.length, `${movementsOf(invId).length}`);

  // ── 8. Deleting an invoice gives the stock back ────────────────────────
  const del = await models.Invoices.deleteInvoice(Number(invId));
  check('deleting the invoice succeeds', !!(del && del.success), JSON.stringify(del));
  check('deleting the invoice leaves stock at the baseline', near(stockOf(), BASELINE), stockOf());
  check('the movements survive as an audit trail', movementsOf(invId).length > 0,
    `${movementsOf(invId).length}`);

  // ── 9. A customer payment moves NO stock (Part 9, verify only) ─────────
  const paid = await insertInvoice(
    fakeEvent, customerId, 'zz-invoice-stock@example.invalid', false, 'Addr', 'Net 30',
    '2026-06-01', '2026-07-01', '', '', null, 'test', 0, undefined,
    [line(invProduct.id, 2, 25)]
  );
  const paidId = paid && (paid.invoiceId || paid.invoice_id || paid.id);
  const afterInvoice = stockOf();
  const pay = await createPayment(fakeEvent, {
    customerId, amount: 50, date: '2026-06-05', paymentMethod: 'Cash',
    reference: 'ZZ-PAY', allocations: [{ invoiceId: Number(paidId), amount: 50 }],
  });
  check('the customer payment is recorded', !!(pay && pay.success), JSON.stringify(pay));
  check('a customer payment moves NO stock', near(stockOf(), afterInvoice),
    `${afterInvoice} → ${stockOf()}`);
  check('a customer payment writes no invoice-sourced movement',
    movementsOf(paidId).length === 1, `${movementsOf(paidId).length}`);

  // ── 10. The MODEL moves stock, not the handler ────────────────────────
  // FIVE callers create invoices: the `insert-invoice` handler, a recurring
  // run (`recurring-run-now`), the scheduler, project timesheets, and the bulk
  // importer. Only the first goes through a handler, so the stock issue lives
  // in Invoices.insertInvoice — otherwise the other four would silently never
  // move stock, which is the Part 1 bug again on paths that every case above
  // is structurally unable to reach.
  const beforeModel = stockOf();
  const modelRes = await models.Invoices.insertInvoice(
    customerId, 'zz-invoice-stock@example.invalid', 0, 'Addr', 'Net 30',
    '2026-06-01', '2026-07-01', '', '', null, 'test', 0, undefined,
    [line(invProduct.id, 4, 25)]
  );
  const modelId = modelRes && (modelRes.invoiceId || modelRes.invoice_id || modelRes.id);
  check('a DIRECT model insert (no handler at all) still issues stock',
    !!(modelRes && modelRes.success) && near(stockOf(), beforeModel - 4),
    `${beforeModel} → ${stockOf()}`);
  check('  … and writes one correctly-sourced movement',
    movementsOf(modelId).length === 1 && Number(movementsOf(modelId)[0].quantityChange) === -4,
    JSON.stringify(movementsOf(modelId).map(m => m.quantityChange)));

  // A Draft must move nothing even when it never touches the handler — the
  // guard travels with the model.
  const beforeDraft = stockOf();
  const modelDraftRes = await models.Invoices.insertInvoice(
    customerId, 'zz-invoice-stock@example.invalid', 0, 'Addr', 'Net 30',
    '2026-06-01', '2026-07-01', '', '', null, 'test', 0, 'Draft',
    [line(invProduct.id, 9, 25)]
  );
  const modelDraftId = modelDraftRes && (modelDraftRes.invoiceId || modelDraftRes.invoice_id || modelDraftRes.id);
  check('a DIRECT model insert as Draft moves no stock',
    !!(modelDraftRes && modelDraftRes.success) && near(stockOf(), beforeDraft) &&
    movementsOf(modelDraftId).length === 0,
    `${beforeDraft} → ${stockOf()}, movements ${movementsOf(modelDraftId).length}`);

  // ── 11. The invoice write is atomic — proven by injecting a stock failure ─
  // The stock issue is INSIDE the invoice's transaction, so a failure there
  // must leave no invoice row behind. Counting rows before/after is the honest
  // assertion: checking a returned id passes vacuously, because a failed call
  // returns no id.
  const InventoryMod = require(path.join(ROOT, 'src', 'backend', 'models', 'inventory.js'));
  const realIssue = InventoryMod.issueStock;
  const realReceive = InventoryMod.receiveStock;
  // BOTH primitives. Which one runs depends on the direction of the delta — an
  // increase ISSUES, a reduction RECEIVES — so injecting only one lets the
  // opposite-direction case succeed and its assertions pass vacuously.
  const injectStockFailure = () => {
    InventoryMod.issueStock = () => ({ success: false, error: 'injected failure' });
    InventoryMod.receiveStock = () => ({ success: false, error: 'injected failure' });
  };
  const restoreStock = () => {
    InventoryMod.issueStock = realIssue;
    InventoryMod.receiveStock = realReceive;
  };
  injectStockFailure();
  const invoicesBefore = db.prepare('SELECT COUNT(*) AS c FROM invoices').get().c;
  const stockBeforeFail = stockOf();
  const failRes = await models.Invoices.insertInvoice(
    customerId, 'zz-invoice-stock@example.invalid', 0, 'Addr', 'Net 30',
    '2026-06-01', '2026-07-01', '', '', null, 'test', 0, undefined,
    [line(invProduct.id, 5, 25)]
  );
  restoreStock();
  const invoicesAfter = db.prepare('SELECT COUNT(*) AS c FROM invoices').get().c;
  check('a failing stock issue aborts the WHOLE invoice (one transaction)',
    !!(failRes && failRes.success === false) && invoicesAfter === invoicesBefore,
    `${invoicesBefore} → ${invoicesAfter} invoice rows`);
  check('  … and leaves the balance untouched', near(stockOf(), stockBeforeFail),
    `${stockBeforeFail} → ${stockOf()}`);

  // ── 12. The MODEL reconciles on update too ────────────────────────────
  // Same asymmetry as the insert path. `updateInvoice` is called only by the
  // `updateinvoice` handler today, but the reconcile belongs in the model so a
  // second caller cannot silently skip it — which is exactly how four insert
  // callers stayed broken.
  const modelRow = db.prepare('SELECT number FROM invoices WHERE id = ?').get(Number(modelId));
  const modelPayload = (lines) => ({
    id: Number(modelId), customer: customerId, customer_email: 'zz-invoice-stock@example.invalid',
    islater: false, billing_address: 'Addr', terms: 'Net 30', start_date: '2026-06-01',
    last_date: '2026-07-01', number: modelRow.number, vat: 0, message: '', statement_message: '',
    status: undefined, lines,
  });

  const beforeUpd = stockOf();
  await models.Invoices.updateInvoice(modelPayload([line(invProduct.id, 9, 25)]));
  check('a DIRECT model update reconciles stock (4 → 9 issues 5 more)',
    near(stockOf(), beforeUpd - 5), `${beforeUpd} → ${stockOf()}`);

  // ── 13. The update is atomic — the line rewrite cannot be lost ─────────
  // updateInvoice DELETEs the lines then re-inserts them. With no transaction a
  // failure in between destroys the invoice's original lines and leaves a
  // partial set behind. This proves the rollback restores them.
  const countLines = () => db.prepare('SELECT COUNT(*) AS c FROM invoice_lines WHERE invoice_id = ?')
    .get(Number(modelId)).c;
  const linesBeforeFail = countLines();
  const stockBeforeUpdFail = stockOf();
  // The shared helper injects BOTH primitives, because which one runs depends
  // on the direction of the delta: an increase ISSUES, a reduction RECEIVES.
  // Injecting only `issueStock` here silently let the update succeed (9 → 3 is a
  // reduction) and made the assertions below pass vacuously.
  injectStockFailure();
  let updFailed = false;
  try {
    await models.Invoices.updateInvoice(modelPayload([line(invProduct.id, 3, 25)]));
  } catch { updFailed = true; }
  restoreStock();
  const linesAfterFail = countLines();
  check('a failing stock reconcile aborts the update',
    updFailed, 'the update did not throw');
  check('  … and the invoice keeps its ORIGINAL lines (the DELETE was rolled back)',
    linesAfterFail === linesBeforeFail, `${linesBeforeFail} → ${linesAfterFail} lines`);
  check('  … and the balance is untouched', near(stockOf(), stockBeforeUpdFail),
    `${stockBeforeUpdFail} → ${stockOf()}`);

  // ── Report ─────────────────────────────────────────────────────────────
  console.log('\n' + results.join('\n'));
  console.log(`\n  item #${item.id} in warehouse #${W.id}: baseline ${BASELINE} → now ${stockOf()}`);
  console.log(`  movements on the lifecycle invoice: ${movementsOf(invId).length}`);
  console.log(`\n  ${pass} passed, ${fail} failed\n`);

  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\nFATAL:', e && e.stack ? e.stack : e);
  console.log(`\n  ${pass} passed, ${fail + 1} failed\n`);
  process.exit(1);
});
