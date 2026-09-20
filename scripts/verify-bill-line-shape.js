/**
 * verify-bill-line-shape.js
 *
 * Proves the Phase-3 bill-line contract end to end, on a SCRATCH COPY of the
 * company file:
 *
 *   (a) The additive columns exist after the model loads, and every
 *       pre-existing row reads as an ACCOUNT line — the migration is
 *       non-destructive, so historical bills behave exactly as before.
 *   (b) `insertExpense` persists the full line shape (line_type, product_id,
 *       quantity, rate, warehouse_id) — not just the amount.
 *   (c) `updateExpense` persists it too. Create and edit share ONE insert
 *       statement, so a column cannot be written on create and silently
 *       dropped on edit (the classic trap this suite exists to catch).
 *   (d) An ITEM line with no accountId still resolves to the seeded
 *       Inventory Asset account — the backend, not the renderer, is
 *       authoritative about where inventory goes.
 *   (e) `postExpense` debits Inventory Asset for the item line and credits
 *       Accounts Payable for the whole bill, and an ACCOUNT line still debits
 *       the account the user picked.
 *   (f) The renderer actually sends the new fields, and does NOT prefill an
 *       item line's rate from products.price (a selling price would overstate
 *       both the inventory value and AP).
 *
 * The renderer-side checks are source assertions on purpose: there is no
 * headless DOM here, and the risk they guard against (a field that is computed
 * but never sent) is a textual one.
 */

// MUST be first: pins every model to a scratch copy of the live company file.
require('./lib/testDb.js').useScratchCopy({ label: 'verify-bill-line-shape' });

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js'));
const Expenses = require(path.join(ROOT, 'src', 'backend', 'models', 'expenses.js'));
const JournalEntries = require(path.join(ROOT, 'src', 'backend', 'models', 'journalEntries.js'));
const COA = require(path.join(ROOT, 'src', 'backend', 'models', 'chartOfAccounts.js'));
const Warehouses = require(path.join(ROOT, 'src', 'backend', 'models', 'warehouses.js'));

let pass = 0, fail = 0;
const results = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; results.push(`  PASS  ${name}`); }
  else { fail++; results.push(`  FAIL  ${name}${detail ? `  → ${detail}` : ''}`); }
};
const money = (n) => Math.round(Number(n || 0) * 100) / 100;

(async () => {
  // ── Fixtures ───────────────────────────────────────────────────────────
  const invAsset = COA.getSystemAccount('Inventory Asset');
  const ap = COA.getSystemAccount('Accounts Payable');
  const supplier = db.prepare('SELECT id FROM suppliers ORDER BY id LIMIT 1').get();
  const product = db.prepare('SELECT id, name FROM products ORDER BY id LIMIT 1').get();
  const warehouse = Warehouses.getDefault();
  const expenseAcct = db.prepare(
    "SELECT id, name FROM chart_of_accounts WHERE LOWER(type) = 'expense' AND status = 'Active' ORDER BY id LIMIT 1"
  ).get();

  // Posting must land after the closing date or JournalEntries.post refuses.
  const closingRow = db.prepare("SELECT value FROM settings WHERE key = 'closingDate'").get();
  let closingDate = closingRow ? closingRow.value : null;
  try { closingDate = closingDate ? JSON.parse(closingDate) : null; } catch { /* keep raw */ }
  const today = new Date().toISOString().slice(0, 10);
  let POST_DATE = today;
  if (closingDate && String(today) <= String(closingDate).slice(0, 10)) {
    const d = new Date(closingDate);
    d.setDate(d.getDate() + 1);
    POST_DATE = d.toISOString().slice(0, 10);
  }

  console.log('\n=== Bill-line shape ===');
  console.log(`  fixture: supplier #${supplier && supplier.id}, product #${product && product.id}, ` +
              `warehouse ${warehouse ? `#${warehouse.id} (${warehouse.name})` : 'none'}`);
  console.log(`  posting date: ${POST_DATE}${closingDate ? `  (closing date ${closingDate})` : ''}`);

  // ── (a) Columns exist; legacy rows read as 'account' ────────────────────
  const cols = db.prepare("PRAGMA table_info('expense_lines')").all().map(c => c.name);
  for (const c of ['line_type', 'product_id', 'quantity', 'rate', 'warehouse_id']) {
    check(`expense_lines has column "${c}" after the model loads`, cols.includes(c), cols.join(','));
  }

  check('Expenses exposes LINE_TYPE_ACCOUNT = "account"', Expenses.LINE_TYPE_ACCOUNT === 'account');
  check('Expenses exposes LINE_TYPE_ITEM = "item"', Expenses.LINE_TYPE_ITEM === 'item');

  // A NULL / blank / unknown value is an ACCOUNT line — this is what makes the
  // migration non-destructive for every row written before today.
  const legacyReads = [
    [undefined, 'account'], [null, 'account'], ['', 'account'], ['   ', 'account'],
    ['account', 'account'], ['ACCOUNT', 'account'], [' Account ', 'account'],
    ['item', 'item'], ['ITEM', 'item'], [' Item ', 'item'],
    ['nonsense', 'account'],
  ];
  for (const [raw, want] of legacyReads) {
    check(`normalizeLineType(${JSON.stringify(raw)}) === '${want}'`,
      Expenses.normalizeLineType(raw) === want, `got ${JSON.stringify(Expenses.normalizeLineType(raw))}`);
  }

  const legacyRows = db.prepare("SELECT COUNT(*) AS c FROM expense_lines WHERE line_type IS NULL OR line_type = ''").get().c;
  const nonAccount = db.prepare("SELECT COUNT(*) AS c FROM expense_lines WHERE line_type IS NOT NULL AND line_type <> '' AND line_type <> 'account'").get().c;
  check('every pre-existing line reads as an account line',
    nonAccount === 0, `${nonAccount} row(s) carry a non-account line_type`);
  console.log(`  legacy rows still reading as account lines: ${legacyRows}`);

  // ── (d) The seeded system account the item line depends on ─────────────
  check('requiring the Chart of Accounts seeds a system "Inventory Asset" account',
    !!invAsset, 'no account named "Inventory Asset" was seeded');
  check('the seeded Inventory Asset account is an Asset', !!invAsset && invAsset.type === 'Asset',
    invAsset && invAsset.type);
  check('the seeded Inventory Asset account is active', !!invAsset && invAsset.status === 'Active',
    invAsset && invAsset.status);
  check('Accounts Payable resolves to a system account', !!ap, 'no Accounts Payable account');
  check('a bill fixture has a supplier', !!supplier && supplier.id != null);
  check('a bill fixture has an inventory product', !!product && product.id != null);
  check('a bill fixture has a warehouse with a default', !!warehouse && warehouse.id != null);
  check('a bill fixture has an active Expense account', !!expenseAcct && expenseAcct.id != null);

  // ── (b) insertExpense round-trips the whole line shape ─────────────────
  const ITEM_QTY = 10, ITEM_RATE = 5.25, ITEM_AMOUNT = money(ITEM_QTY * ITEM_RATE); // 52.50
  const ACCT_AMOUNT = 20;

  const ins = await Expenses.insertExpense(
    supplier.id, 'Accounts Payable', POST_DATE, 'bill', 'BILL-SHAPE-1',
    'bill', 'system', 'Unpaid',
    [
      { line_type: 'item', product_id: product.id, quantity: ITEM_QTY, rate: ITEM_RATE,
        amount: ITEM_AMOUNT, warehouse_id: warehouse.id, description: 'Inventory purchase' },
      { line_type: 'account', accountId: expenseAcct.id, category: expenseAcct.name,
        description: 'Freight', amount: ACCT_AMOUNT },
    ],
    POST_DATE, 'shape suite', 30
  );
  check('insertExpense succeeds for a mixed item/account bill', !!(ins && ins.success), JSON.stringify(ins));
  const billId = ins && ins.expenseId;

  const stored = billId
    ? db.prepare('SELECT * FROM expense_lines WHERE expense_id = ? ORDER BY id').all(billId)
    : [];
  check('insertExpense wrote both lines', stored.length === 2, `got ${stored.length}`);

  const itemRow = stored[0] || {};
  const acctRow = stored[1] || {};

  check('item line persisted line_type = "item"', itemRow.line_type === 'item', itemRow.line_type);
  check('item line persisted product_id', Number(itemRow.product_id) === Number(product.id),
    `${itemRow.product_id} vs ${product.id}`);
  check('item line persisted quantity', Number(itemRow.quantity) === ITEM_QTY, itemRow.quantity);
  check('item line persisted rate', Number(itemRow.rate) === ITEM_RATE, itemRow.rate);
  check('item line persisted warehouse_id', Number(itemRow.warehouse_id) === Number(warehouse.id),
    `${itemRow.warehouse_id} vs ${warehouse.id}`);
  check('item line amount equals quantity x rate', money(itemRow.amount) === ITEM_AMOUNT,
    `${itemRow.amount} vs ${ITEM_AMOUNT}`);
  check('item line was given the Inventory Asset account even though none was sent',
    Number(itemRow.account_id) === Number(invAsset.id),
    `account_id ${itemRow.account_id} vs Inventory Asset ${invAsset.id}`);

  check('account line persisted line_type = "account"', acctRow.line_type === 'account', acctRow.line_type);
  check('account line kept its own account_id', Number(acctRow.account_id) === Number(expenseAcct.id),
    `${acctRow.account_id} vs ${expenseAcct.id}`);
  check('account line carries no product_id', acctRow.product_id == null, acctRow.product_id);
  check('account line carries no quantity', acctRow.quantity == null, acctRow.quantity);
  check('account line carries no rate', acctRow.rate == null, acctRow.rate);
  check('account line carries no warehouse_id', acctRow.warehouse_id == null, acctRow.warehouse_id);
  check('account line amount is the hand-typed amount', money(acctRow.amount) === ACCT_AMOUNT,
    acctRow.amount);

  // ── (c) updateExpense round-trips it too ───────────────────────────────
  const NEW_QTY = 3, NEW_RATE = 7.5, NEW_AMOUNT = money(NEW_QTY * NEW_RATE); // 22.50
  const upd = await Expenses.updateExpense({
    id: billId,
    payee: supplier.id, payment_account: 'Accounts Payable', payment_date: POST_DATE,
    payment_method: 'bill', ref_no: 'BILL-SHAPE-1', category: 'bill',
    approval_status: 'Unpaid', due_date: POST_DATE, memo: 'edited', terms: 30,
    lines: [
      // Same item line, different quantity/rate — the edit must not lose the shape.
      { line_type: 'item', product_id: product.id, quantity: NEW_QTY, rate: NEW_RATE,
        amount: NEW_AMOUNT, warehouse_id: warehouse.id, description: 'Inventory purchase (edited)' },
      { line_type: 'account', accountId: expenseAcct.id, category: expenseAcct.name,
        description: 'Freight (edited)', amount: ACCT_AMOUNT },
    ],
  });
  check('updateExpense succeeds', !!(upd && upd.success), JSON.stringify(upd));

  const afterUpdate = db.prepare('SELECT * FROM expense_lines WHERE expense_id = ? ORDER BY id').all(billId);
  check('updateExpense rewrote both lines', afterUpdate.length === 2, `got ${afterUpdate.length}`);
  const updItem = afterUpdate[0] || {};
  check('updateExpense kept line_type = "item"', updItem.line_type === 'item', updItem.line_type);
  check('updateExpense kept product_id', Number(updItem.product_id) === Number(product.id), updItem.product_id);
  check('updateExpense kept the NEW quantity', Number(updItem.quantity) === NEW_QTY, updItem.quantity);
  check('updateExpense kept the NEW rate', Number(updItem.rate) === NEW_RATE, updItem.rate);
  check('updateExpense kept warehouse_id', Number(updItem.warehouse_id) === Number(warehouse.id),
    updItem.warehouse_id);
  check('updateExpense kept the item line on Inventory Asset',
    Number(updItem.account_id) === Number(invAsset.id), updItem.account_id);
  check('updateExpense kept the account line on its own account',
    Number((afterUpdate[1] || {}).account_id) === Number(expenseAcct.id),
    (afterUpdate[1] || {}).account_id);

  // ── (e) postExpense: DR Inventory Asset + account, CR Accounts Payable ──
  //
  // NOTE: the GL entry for a bill is posted by the `insert-expense` IPC handler
  // on CREATE, and by updateExpense itself on EDIT. The suite has no IPC layer,
  // so it reads the entry updateExpense just posted — which is the same
  // JournalEntries.postExpense() the handler calls, against the same lines.
  const entry = db.prepare(
    "SELECT id FROM journal_entries WHERE source_type = 'expense' AND source_id = ? AND status = 'Posted'"
  ).get(Number(billId));
  check('updateExpense re-posted a Posted journal entry for the bill', !!entry,
    'no Posted entry — the GL re-post on edit did not run');

  // Posting twice must be a no-op, or editing a bill would double the GL.
  const repost = JournalEntries.postExpense({
    id: billId, date: POST_DATE, category: 'bill',
    description: 'Bill BILL-SHAPE-1', reference: 'BILL-SHAPE-1',
  });
  check('postExpense refuses to double-post an already-posted bill',
    !!(repost && repost.skipped), JSON.stringify(repost));
  const entryCount = db.prepare(
    "SELECT COUNT(*) AS c FROM journal_entries WHERE source_type = 'expense' AND source_id = ? AND status = 'Posted'"
  ).get(Number(billId)).c;
  check('exactly one Posted entry exists for the bill', entryCount === 1, `${entryCount} entries`);

  const jlines = entry
    ? db.prepare('SELECT account_id, debit, credit FROM journal_lines WHERE journal_id = ?').all(entry.id)
    : [];

  const invDebit = jlines.find(l => Number(l.account_id) === Number(invAsset.id) && Number(l.debit) > 0);
  check('the item line debits Inventory Asset', !!invDebit, JSON.stringify(jlines));
  check('the Inventory Asset debit equals the item line amount',
    !!invDebit && money(invDebit.debit) === NEW_AMOUNT, invDebit && invDebit.debit);

  const acctDebit = jlines.find(l => Number(l.account_id) === Number(expenseAcct.id) && Number(l.debit) > 0);
  check('the account line debits its own account', !!acctDebit, JSON.stringify(jlines));
  check('the account-line debit equals the hand-typed amount',
    !!acctDebit && money(acctDebit.debit) === ACCT_AMOUNT, acctDebit && acctDebit.debit);

  const apCredit = jlines.find(l => Number(l.account_id) === Number(ap.id) && Number(l.credit) > 0);
  check('Accounts Payable is credited', !!apCredit, JSON.stringify(jlines));
  check('the AP credit equals the whole bill total',
    !!apCredit && money(apCredit.credit) === money(NEW_AMOUNT + ACCT_AMOUNT),
    apCredit && `${apCredit.credit} vs ${money(NEW_AMOUNT + ACCT_AMOUNT)}`);

  const totalDr = money(jlines.reduce((s, l) => s + Number(l.debit || 0), 0));
  const totalCr = money(jlines.reduce((s, l) => s + Number(l.credit || 0), 0));
  check('the posted entry balances', totalDr === totalCr && totalDr > 0, `DR ${totalDr} / CR ${totalCr}`);

  // ── (g) The postExpense BACKSTOP ───────────────────────────────────────
  // models/expenses.js resolves an item line's account at write time, so a
  // stored item line normally carries Inventory Asset. This proves the GL side
  // does not silently fall back to an EXPENSE account when that link is missing
  // or has been deactivated — which would understate the balance sheet and
  // overstate profit. Void the entry, blank the link, re-post, and check where
  // the debit actually landed.
  db.prepare("UPDATE journal_entries SET status = 'Void' WHERE source_type = 'expense' AND source_id = ?").run(Number(billId));
  db.prepare("UPDATE expense_lines SET account_id = NULL WHERE id = ?").run(Number(updItem.id));

  const reposted = JournalEntries.postExpense({
    id: billId, date: POST_DATE, category: 'bill',
    description: 'Bill BILL-SHAPE-1 (backstop)', reference: 'BILL-SHAPE-1',
  });
  check('postExpense re-posts after the entry was voided', !!(reposted && reposted.success), JSON.stringify(reposted));

  const entry2 = db.prepare(
    "SELECT id FROM journal_entries WHERE source_type = 'expense' AND source_id = ? AND status = 'Posted'"
  ).get(Number(billId));
  const jlines2 = entry2
    ? db.prepare('SELECT account_id, debit, credit FROM journal_lines WHERE journal_id = ?').all(entry2.id)
    : [];

  const invDebit2 = jlines2.find(l => Number(l.account_id) === Number(invAsset.id) && Number(l.debit) > 0);
  check('an item line with NO stored account still debits Inventory Asset', !!invDebit2,
    JSON.stringify(jlines2));
  check('  … for the item line amount only', !!invDebit2 && money(invDebit2.debit) === NEW_AMOUNT,
    invDebit2 && invDebit2.debit);
  // The bill also carries a genuine account line for Freight, so the expense
  // account is EXPECTED to have a debit — but only for that line. If the item
  // line had fallen through to the expense account this would be 42.50.
  const expDebit2 = jlines2.find(l => Number(l.account_id) === Number(expenseAcct.id) && Number(l.debit) > 0);
  check('  … and the expense account carries ONLY the account line',
    !!expDebit2 && money(expDebit2.debit) === ACCT_AMOUNT,
    `debit ${expDebit2 && expDebit2.debit} — expected ${ACCT_AMOUNT}, not the item amount`);
  check('  … and AP is still credited the full total',
    !!jlines2.find(l => Number(l.account_id) === Number(ap.id) && money(l.credit) === money(NEW_AMOUNT + ACCT_AMOUNT)),
    JSON.stringify(jlines2));

  // ── (f) Renderer source guards ─────────────────────────────────────────
  const expSrc = read('src/backend/models/expenses.js');
  const insertSqlCount = (expSrc.match(/INSERT INTO expense_lines/g) || []).length;
  check('insertExpense and updateExpense share ONE insert statement',
    insertSqlCount === 1, `${insertSqlCount} copies of the expense_lines INSERT`);
  check('the shared statement lists every line-shape column',
    /line_type,\s*product_id,\s*quantity,\s*rate,\s*warehouse_id/.test(expSrc));

  const billSrc = read('src/frontend/src/components/vendors/bills/EnterBill.js');
  for (const field of ['line_type', 'product_id', 'quantity', 'rate', 'warehouse_id']) {
    check(`EnterBill submits ${field}`, new RegExp(`${field}\\s*:`).test(billSrc), `no "${field}:" in the payload`);
  }
  check('EnterBill renders the Type | Item/Account | Description | Qty | Rate | Amount | Warehouse | Actions columns',
    ['Type', 'Item / Account', 'Description', 'Qty', 'Amount', 'Warehouse'].every(h => billSrc.includes(`title: '${h}'`) || billSrc.includes(`title: \`${h}`)),
    'a column header is missing');
  check('EnterBill only offers inventory-tracking products on an item line',
    /getInventoryProducts\(products\)/.test(billSrc));
  check('EnterBill does not prefill an item line rate from the selling price',
    !/rate:\s*(prod|product|p)\.price/.test(billSrc));

  const selectItemBody = (() => {
    const i = billSrc.indexOf('const selectLineItem');
    if (i < 0) return '';
    const j = billSrc.indexOf('\n  const ', i + 10);
    return billSrc.slice(i, j < 0 ? billSrc.length : j);
  })();
  check('selectLineItem never reads a product price',
    !!selectItemBody && !/\.price/.test(selectItemBody),
    'selectLineItem references a price column');

  // ── Report ─────────────────────────────────────────────────────────────
  console.log('\n' + results.join('\n'));
  console.log(`\n  item line: qty ${ITEM_QTY} x rate ${ITEM_RATE} = ${ITEM_AMOUNT} ` +
              `→ after edit qty ${NEW_QTY} x rate ${NEW_RATE} = ${NEW_AMOUNT}`);
  console.log(`  posted: DR Inventory Asset ${NEW_AMOUNT} + DR ${expenseAcct.name} ${ACCT_AMOUNT} ` +
              `/ CR Accounts Payable ${money(NEW_AMOUNT + ACCT_AMOUNT)}`);
  console.log(`\n  ${pass} passed, ${fail} failed\n`);

  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\nFATAL:', e && e.stack ? e.stack : e);
  console.log(`\n  ${pass} passed, ${fail + 1} failed\n`);
  process.exit(1);
});
