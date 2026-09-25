/**
 * verify-bill-payment-reversal.js
 *
 * Proves the bill-payment lifecycle: paying a bill creates an explicit payment
 * application; deleting the linked check reverses that application, restores the
 * amount applied, restores AP / Bank / vendor balances, re-derives the bill's
 * Paid / Remaining / Status and makes the bill payable again â€” WITHOUT editing
 * the bill. Inventory is never touched by a payment or its reversal.
 *
 * Runs against a SCRATCH COPY of the live DB (never the real file).
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/verify-bill-payment-reversal.js
 */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-bill-payment-reversal' });

const path = require('path');
const ROOT = path.join(__dirname, '..');
const load = (p) => require(path.join(ROOT, 'src', 'backend', p));

const db = load('models/dbmgr.js');
const Expenses = load('models/expenses.js');
const BillPayments = load('models/billPayments.js');
const JournalEntries = load('models/journalEntries.js');
const Transactions = load('models/transactions.js');
const COA = load('models/chartOfAccounts.js');
const Warehouses = load('models/warehouses.js');
const Inventory = load('models/inventory.js');
const Settings = load('models/settings.js');

let pass = 0, fail = 0;
const results = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; results.push(`  PASS  ${name}`); }
  else { fail++; results.push(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;
const money = (v) => Math.round((Number(v) || 0) * 100) / 100;

// â”€â”€ Fixtures â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const closingDate = Settings.get('closingDate');
const today = new Date().toISOString().slice(0, 10);
const POST_DATE = closingDate && today <= closingDate
  ? new Date(new Date(closingDate).getTime() + 86400000).toISOString().slice(0, 10)
  : today;

let checkSeq = 700000 + Math.floor(Math.random() * 90000);
const nextCheck = () => String(checkSeq++);

const supplierId = (() => {
  const info = db.prepare('PRAGMA table_info(suppliers)').all().map(c => c.name);
  const vals = {
    title: '', first_name: 'VerifyRev', last_name: 'Vendor',
    display_name: 'VerifyRev Vendor', company_name: 'VerifyRev Vendor',
    email: '', phone_number: '', mobile_number: '',
  };
  const cols = Object.keys(vals).filter(c => info.includes(c));
  const id = db.prepare(`INSERT INTO suppliers (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(...cols.map(c => vals[c])).lastInsertRowid;
  return Number(id);
})();

const bank = db.prepare("SELECT * FROM chart_of_accounts WHERE type = 'Bank' AND status = 'Active' ORDER BY id LIMIT 1").get();
if (!bank) { console.error('No active Bank account in COA â€” cannot run'); process.exit(1); }
const ap = COA.getSystemAccount('Accounts Payable');
if (!ap) { console.error('No Accounts Payable account in COA â€” cannot run'); process.exit(1); }

// Net balance of an account from POSTED journal lines, honouring normal side.
const DEBIT_NORMAL = new Set(['asset', 'bank', 'cash', 'expense', 'cost of goods sold', 'undeposited funds', 'other current asset', 'fixed asset']);
const acctBalance = (accountId) => {
  const row = db.prepare(`
    SELECT COALESCE(SUM(jl.debit),0) AS d, COALESCE(SUM(jl.credit),0) AS c
    FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_id
    WHERE jl.account_id = ? AND je.status = 'Posted'
  `).get(Number(accountId));
  const acc = COA.getAccount(Number(accountId));
  const type = String((acc && acc.type) || '').toLowerCase();
  return DEBIT_NORMAL.has(type) ? money(row.d - row.c) : money(row.c - row.d);
};
// Vendor payable as the app derives it: open bill balances for the vendor.
const vendorDue = () => money(db.prepare(`
  SELECT COALESCE(SUM(el.amount - COALESCE(e.paid_amount, 0)), 0) AS due
  FROM expense_lines el JOIN expenses e ON e.id = el.expense_id
  WHERE e.payee = ? AND e.category IN ('bill','supplier')
    AND LOWER(COALESCE(e.approval_status, '')) NOT IN ('paid','cancelled','void')
`).get(supplierId).due);
const trialBalanced = () => {
  const rows = Transactions.getTrialBalance();
  const d = money(rows.reduce((s, r) => s + Number(r.debit || 0), 0));
  const c = money(rows.reduce((s, r) => s + Number(r.credit || 0), 0));
  return { d, c, balanced: near(d, c) };
};

// Create an account-line bill + post its AP journal (what Enter Bill does).
let refSeq = 0;
const createBill = async (amount, { lines = null, status = 'Unpaid' } = {}) => {
  const ref = `VR-${Date.now()}-${refSeq++}`;
  const expenseLines = lines || [{ line_type: 'account', category: 'General', amount, description: 'verify bill' }];
  const res = await Expenses.insertExpense(
    supplierId, 'Accounts Payable', POST_DATE, 'bill', ref,
    'bill', 'system', status, expenseLines, POST_DATE, 'verify', 30
  );
  if (!res || !res.success) throw new Error('insertExpense failed: ' + JSON.stringify(res));
  const id = Number(res.expenseId);
  JournalEntries.postExpense({ id, date: POST_DATE, category: 'bill', description: 'verify', reference: ref });
  return id;
};
const billRow = (id) => db.prepare('SELECT approval_status, paid_amount FROM expenses WHERE id = ?').get(id);
const billTotal = (id) => money(db.prepare('SELECT COALESCE(SUM(amount),0) AS t FROM expense_lines WHERE expense_id = ?').get(id).t);

const pay = (billId, amount) => BillPayments.payBill({
  expenseId: billId, amount, paymentDate: POST_DATE, bankAccount: bank.id,
  checkNumber: nextCheck(), enteredBy: 'verify',
});
const deleteCheck = (checkId) => Transactions.deleteCheck(checkId);

(async () => {
  console.log(`\nFixtures: supplier #${supplierId}, bank "${bank.name}" #${bank.id}, AP #${ap.id}, post date ${POST_DATE}`);

  // The live book may already carry a legacy imbalance; what matters is that
  // OUR entries never change the debit−credit difference.
  const tbBaseline = trialBalanced();
  const tbDrift = () => money((trialBalanced().d - trialBalanced().c) - (tbBaseline.d - tbBaseline.c));
  const tbBalancedCheck = (label) => check(label, near(tbDrift(), 0), `drift ${tbDrift()}`);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  console.log('\n=== TEST 1 â€” FULL PAYMENT then delete the check ===');
  {
    const billId = await createBill(2525);
    check('bill created with total 2525', near(billTotal(billId), 2525), billTotal(billId));
    check('bill starts Unpaid with paid_amount 0',
      billRow(billId).approval_status === 'Unpaid' && near(billRow(billId).paid_amount, 0),
      JSON.stringify(billRow(billId)));

    const apBefore = acctBalance(ap.id);
    const bankBefore = acctBalance(bank.id);
    const vendorBefore = vendorDue();

    const paid = pay(billId, 2525);
    check('payBill succeeds', !!(paid && paid.success), JSON.stringify(paid));
    const checkId = paid.check && paid.check.id;
    check('a check transaction was created', !!checkId);
    check('bill is now Paid / paid 2525',
      billRow(billId).approval_status === 'Paid' && near(billRow(billId).paid_amount, 2525),
      JSON.stringify(billRow(billId)));
    check('one ACTIVE application links the check to the bill',
      BillPayments.getActiveForCheck(checkId).length === 1 &&
      Number(BillPayments.getActiveForCheck(checkId)[0].expense_id) === Number(billId));
    check('AP liability decreased by 2525', near(acctBalance(ap.id), apBefore - 2525),
      `${apBefore} -> ${acctBalance(ap.id)}`);
    check('Bank decreased by 2525', near(acctBalance(bank.id), bankBefore - 2525),
      `${bankBefore} -> ${acctBalance(bank.id)}`);
    check('Vendor balance decreased by 2525', near(vendorDue(), vendorBefore - 2525),
      `${vendorBefore} -> ${vendorDue()}`);
    tbBalancedCheck('trial balance stays balanced (debit = credit)');

    // Delete the check â€” NO bill edit.
    const del = deleteCheck(checkId);
    check('deleteCheck succeeds', !!(del && del.success), JSON.stringify(del));
    check('check transaction is gone', !db.prepare('SELECT id FROM transactions WHERE id = ?').get(checkId));
    check('bill reverted to Unpaid with paid 0',
      billRow(billId).approval_status === 'Unpaid' && near(billRow(billId).paid_amount, 0),
      JSON.stringify(billRow(billId)));
    check('no ACTIVE applications remain', BillPayments.getActiveForCheck(checkId).length === 0);
    check('AP restored to pre-payment', near(acctBalance(ap.id), apBefore), `${apBefore} vs ${acctBalance(ap.id)}`);
    check('Bank restored to pre-payment', near(acctBalance(bank.id), bankBefore), `${bankBefore} vs ${acctBalance(bank.id)}`);
    check('Vendor balance restored', near(vendorDue(), vendorBefore), `${vendorBefore} vs ${vendorDue()}`);
    tbBalancedCheck('trial balance stays balanced after reversal');

    const open = Expenses.getOpenBills(supplierId);
    const reopened = open.find(b => Number(b.id) === billId);
    check('bill is payable again (getOpenBills includes it)', !!reopened, JSON.stringify(open.map(o => o.id)));
    check('reopened bill remaining is 2525', reopened && near(reopened.amount - reopened.paid_amount, 2525),
      reopened ? reopened.amount - reopened.paid_amount : 'missing');

    // Idempotency: delete again must not double-reverse.
    const apAfter = acctBalance(ap.id);
    const bankAfter = acctBalance(bank.id);
    const del2 = deleteCheck(checkId);
    check('second delete is a safe no-op', !!(del2 && (del2.success || del2.alreadyReversed)), JSON.stringify(del2));
    check('AP not double-restored', near(acctBalance(ap.id), apAfter), `${apAfter} vs ${acctBalance(ap.id)}`);
    check('Bank not double-restored', near(acctBalance(bank.id), bankAfter), `${bankAfter} vs ${acctBalance(bank.id)}`);
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  console.log('\n=== TEST 2 â€” PARTIAL PAYMENT then delete ===');
  {
    const billId = await createBill(1000);
    const paid = pay(billId, 300);
    check('partial payment marks Partially Paid / paid 300',
      billRow(billId).approval_status === 'Partially Paid' && near(billRow(billId).paid_amount, 300),
      JSON.stringify(billRow(billId)));
    const del = deleteCheck(paid.check.id);
    check('delete succeeds', !!(del && del.success), JSON.stringify(del));
    check('bill returns to Unpaid / paid 0',
      billRow(billId).approval_status === 'Unpaid' && near(billRow(billId).paid_amount, 0),
      JSON.stringify(billRow(billId)));
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  console.log('\n=== TEST 3 â€” MULTIPLE PAYMENTS: delete one, keep the other ===');
  {
    const billId = await createBill(1000);
    const a = pay(billId, 600);
    const b = pay(billId, 400);
    check('fully paid after two payments',
      billRow(billId).approval_status === 'Paid' && near(billRow(billId).paid_amount, 1000),
      JSON.stringify(billRow(billId)));

    deleteCheck(b.check.id);
    check('deleting the second payment leaves paid 600 / remaining 400 / Partially Paid',
      billRow(billId).approval_status === 'Partially Paid' && near(billRow(billId).paid_amount, 600) &&
      near(billTotal(billId) - billRow(billId).paid_amount, 400),
      JSON.stringify(billRow(billId)));
    check('the FIRST payment application is untouched',
      BillPayments.getActiveForCheck(a.check.id).length === 1);

    deleteCheck(a.check.id);
    check('deleting the first payment too leaves paid 0 / Unpaid',
      billRow(billId).approval_status === 'Unpaid' && near(billRow(billId).paid_amount, 0),
      JSON.stringify(billRow(billId)));
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  console.log('\n=== TEST 4 â€” ONE CHECK PAYING MULTIPLE BILLS ===');
  {
    const billA = await createBill(600);
    const billB = await createBill(400);
    const apBefore = acctBalance(ap.id);
    const bankBefore = acctBalance(bank.id);

    const checkNum = nextCheck();
    const tx = Transactions.insert({
      date: POST_DATE, type: 'Check', amount: 1000,
      description: `Bill payment to VerifyRev Vendor â€” Bill #${billA}`,
      reference: checkNum, accountId: bank.id, debit: 0, credit: 1000,
      entered_by: 'verify', payee_name: 'VerifyRev Vendor',
    });
    const checkId = Number(tx.lastInsertRowid);
    const je = JournalEntries.post({
      date: POST_DATE, description: 'multi-bill payment', source_type: 'bill_payment',
      source_id: billA, lines: [
        { account_id: ap.id, debit: 1000, credit: 0 },
        { account_id: bank.id, debit: 0, credit: 1000 },
      ],
    });
    BillPayments.createApplication({ expenseId: billA, transactionId: checkId, journalId: je.id, amount: 600, paymentDate: POST_DATE, balanceApplied: false });
    BillPayments.createApplication({ expenseId: billB, transactionId: checkId, journalId: null, amount: 400, paymentDate: POST_DATE, balanceApplied: false });
    BillPayments.recalcBill(billA);
    BillPayments.recalcBill(billB);

    check('bill A fully paid by the shared check', billRow(billA).approval_status === 'Paid', JSON.stringify(billRow(billA)));
    check('bill B fully paid by the shared check', billRow(billB).approval_status === 'Paid', JSON.stringify(billRow(billB)));

    const del = deleteCheck(checkId);
    check('deleting the shared check succeeds', !!(del && del.success), JSON.stringify(del));
    check('bill A reopened', billRow(billA).approval_status === 'Unpaid' && near(billRow(billA).paid_amount, 0), JSON.stringify(billRow(billA)));
    check('bill B reopened', billRow(billB).approval_status === 'Unpaid' && near(billRow(billB).paid_amount, 0), JSON.stringify(billRow(billB)));
    check('AP restored after shared-check reversal', near(acctBalance(ap.id), apBefore), `${apBefore} vs ${acctBalance(ap.id)}`);
    check('Bank restored after shared-check reversal', near(acctBalance(bank.id), bankBefore), `${bankBefore} vs ${acctBalance(bank.id)}`);
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  console.log('\n=== TEST 5 â€” NORMAL WRITE CHECK (no bill) ===');
  {
    const expenseAcct = COA.getByName('General Expenses')
      || db.prepare("SELECT * FROM chart_of_accounts WHERE type = 'Expense' AND status='Active' LIMIT 1").get();
    const bankBefore = acctBalance(bank.id);
    const expenseBefore = acctBalance(expenseAcct.id);
    const billsBefore = db.prepare("SELECT COUNT(*) AS c FROM expenses WHERE category IN ('bill','supplier')").get().c;

    const tx = Transactions.insert({
      date: POST_DATE, type: 'Check', amount: 500,
      description: 'Check #' + nextCheck() + ' to Office Supplier',
      reference: nextCheck(), accountId: bank.id, debit: 0, credit: 500, entered_by: 'verify',
      payee_name: 'Office Supplier',
    });
    const checkId = Number(tx.lastInsertRowid);
    JournalEntries.postTransaction({
      id: checkId, date: POST_DATE, description: 'office expense', reference: '',
      accountId: bank.id, amount: 500,
      splitLines: [{ account: expenseAcct.name, accountId: expenseAcct.id, amount: 500 }],
    });
    check('no application exists for a normal write check', BillPayments.getAllForCheck(checkId).length === 0);
    check('write check reduced the bank', near(acctBalance(bank.id), bankBefore - 500), `${bankBefore} -> ${acctBalance(bank.id)}`);

    const del = deleteCheck(checkId);
    check('deleting a normal write check succeeds', !!(del && del.success), JSON.stringify(del));
    check('bank restored', near(acctBalance(bank.id), bankBefore), `${bankBefore} vs ${acctBalance(bank.id)}`);
    check('expense restored', near(acctBalance(expenseAcct.id), expenseBefore), `${expenseBefore} vs ${acctBalance(expenseAcct.id)}`);
    const billsAfter = db.prepare("SELECT COUNT(*) AS c FROM expenses WHERE category IN ('bill','supplier')").get().c;
    check('no bill was created or changed by the write check', billsAfter === billsBefore, `${billsBefore} vs ${billsAfter}`);
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  console.log('\n=== TEST 6 â€” INVENTORY IS NOT TOUCHED BY PAYMENT OR REVERSAL ===');
  {
    const product = db.prepare("SELECT id FROM products WHERE LOWER(type) IN ('product','inventory_part','inventory part','raw material','asset','bundle') ORDER BY id LIMIT 1").get();
    if (!product) {
      check('an inventory product exists for the stock test', false, 'no product fixture');
    } else {
      const W = Warehouses.getOrCreateDefault();
      const item = Inventory.resolveInventoryItem(product.id);
      const stockOf = () => {
        const r = db.prepare('SELECT quantity FROM item_stock WHERE itemId = ? AND warehouseId = ?').get(Number(item.id), Number(W.id));
        return r ? Number(r.quantity) : 0;
      };
      const billId = await createBill(0, { lines: [{ 
        line_type: 'item', product_id: product.id, quantity: 50, rate: 22,
        amount: 1100, warehouse_id: W.id, description: 'chicken feed',
      }] });
      check('bill receipt added 50 to stock', near(stockOf(), 50), stockOf());

      const paid = pay(billId, 1100);
      check('paying the bill does NOT change inventory', near(stockOf(), 50), stockOf());

      deleteCheck(paid.check.id);
      check('deleting the payment does NOT change inventory', near(stockOf(), 50), stockOf());
      check('the bill itself still exists', !!db.prepare('SELECT id FROM expenses WHERE id = ?').get(billId));
    }
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  console.log('\n=== TEST 7 - VOID a bill-payment check (row preserved) ===');
  {
    const billId = await createBill(800);
    const apBefore = acctBalance(ap.id);
    const bankBefore = acctBalance(bank.id);
    const paid = pay(billId, 800);
    const checkId = paid.check.id;
    check('bill paid before void', billRow(billId).approval_status === 'Paid', JSON.stringify(billRow(billId)));

    const v = Transactions.voidTransaction(checkId);
    check('void succeeds', !!(v && (v.success || v.changes > 0)), JSON.stringify(v));
    check('the check row is preserved and marked Voided',
      (() => { const r = db.prepare('SELECT status FROM transactions WHERE id = ?').get(checkId); return r && String(r.status).toLowerCase() === 'voided'; })(),
      JSON.stringify(db.prepare('SELECT status FROM transactions WHERE id = ?').get(checkId)));
    check('void reopened the bill', billRow(billId).approval_status === 'Unpaid' && near(billRow(billId).paid_amount, 0), JSON.stringify(billRow(billId)));
    check('void restored AP', near(acctBalance(ap.id), apBefore), `${apBefore} vs ${acctBalance(ap.id)}`);
    check('void restored Bank', near(acctBalance(bank.id), bankBefore), `${bankBefore} vs ${acctBalance(bank.id)}`);

    const apAfter = acctBalance(ap.id);
    deleteCheck(checkId);
    check('deleting the already-voided check does not double-reverse AP', near(acctBalance(ap.id), apAfter), `${apAfter} vs ${acctBalance(ap.id)}`);
    check('the voided check row is gone after delete', !db.prepare('SELECT id FROM transactions WHERE id = ?').get(checkId));
  }

  console.log('\n=== TEST 8 - editing a bill keeps its derived payment state ===');
  {
    const billId = await createBill(1000);
    const paid = pay(billId, 400);
    const ref = db.prepare('SELECT ref_no FROM expenses WHERE id = ?').get(billId).ref_no;
    await Expenses.updateExpense({
      id: billId, payee: supplierId, payment_account: 'Accounts Payable', payment_date: POST_DATE,
      payment_method: 'bill', ref_no: ref, category: 'bill', approval_status: 'Unpaid',
      due_date: POST_DATE, memo: 'edited', terms: 30,
      lines: [{ line_type: 'account', category: 'General', amount: 1200, description: 'edited' }],
    });
    const after = billRow(billId);
    check('edit preserved paid_amount', near(after.paid_amount, 400), JSON.stringify(after));
    check('edit kept Partially Paid (not reset to Unpaid)', after.approval_status === 'Partially Paid', JSON.stringify(after));
    deleteCheck(paid.check.id);
    check('after deleting the payment the edited bill is Unpaid', billRow(billId).approval_status === 'Unpaid', JSON.stringify(billRow(billId)));
  }

  console.log('\n' + results.join('\n'));
  const tb = trialBalanced();
  console.log(`\n  Trial balance: debit ${tb.d} / credit ${tb.c} â€” ${tb.balanced ? 'BALANCED' : 'OUT OF BALANCE'}`);
  console.log(`\n  ${pass} passed, ${fail} failed\n`);

  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\nFATAL:', e && e.stack ? e.stack : e);
  console.log(`\n  ${pass} passed, ${fail + 1} failed\n`);
  process.exit(1);
});



