/**
 * verify-print-bill-reconciliation.js
 *
 * Print for (1) Enter/Edit Bill and (2) Bank Reconciliation:
 *  - both reuse the shared self-contained print helper (no whole-app window.print)
 *  - the Bill print model comes from the SAVED record
 *  - the reconciliation report reuses the screen's own live calculations
 *
 * Backend checks run on a SCRATCH COPY; frontend checks read the source.
 */
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const Module = require('module');
const electronStub = { ipcMain: { handle: () => {} }, app: { isPackaged: true } };
const originalLoad = Module._load;
Module._load = function (request) { if (request === 'electron') return electronStub; return originalLoad.apply(this, arguments); };

require('./lib/testDb.js').useScratchCopy({ label: 'verify-print-bill-rec' });
const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const Expenses = require(path.join(ROOT, 'src', 'backend', 'models', 'expenses.js'));
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js')).raw;

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};
const read = (rel) => fs.readFileSync(path.join(FE, rel), 'utf8');

// ── Shared print helper ────────────────────────────────────────────────────
console.log('\n=== Shared print helper ===');
const util = read('utils/printDocument.js');
check('printHtml opens a blank window and calls print', /window\.open/.test(util) && /\.print\(\)/.test(util));
check('print styles are self-contained (no external assets)', /PRINT_BASE_CSS/.test(util) && !/https?:\/\//.test(util) && !/src\//.test(util));
check('print CSS has print media + page-break rules', /@media print/.test(util) && /break-inside:\s*avoid/.test(util));

// ── Bill print model (backend) ─────────────────────────────────────────────
console.log('\n=== Bill print model ===');
const vendor = db.prepare('SELECT id, display_name, first_name, last_name FROM suppliers ORDER BY id LIMIT 1').get();
const expAcct = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('expense','cost of goods sold','other expense') AND status='Active' ORDER BY id LIMIT 1").get();
let billId = null;
if (vendor && expAcct) {
  const ins = db.prepare(
    "INSERT INTO expenses (payee, payment_account, payment_date, payment_method, ref_no, category, entered_by, approval_status, due_date, memo, terms) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
  ).run(vendor.id, 'Accounts Payable', '2026-06-20', 'bill', 'BILL-PRINT-1', 'bill', 'system', 'Unpaid', '2026-06-20', 'print test', 30);
  billId = ins.lastInsertRowid;
  db.prepare("INSERT INTO expense_lines (expense_id, category, description, amount, account_id, line_type) VALUES (?,?,?,?,?,?)")
    .run(billId, 'General', 'Office supplies', 175, expAcct.id, 'account');
}
check('fixture bill created', !!billId, JSON.stringify({ billId }));
if (billId) {
  const model = Expenses.getBillPrintModel(billId);
  check('getBillPrintModel returns the saved record + lines + totals',
    model && model.expense && Array.isArray(model.lines) && Number(model.totalAmount) === 175,
    JSON.stringify({ total: model?.totalAmount }));
  check('print model computes paid / remaining / status',
    model && 'paid' in model && 'remaining' in model && ['Unpaid', 'Overdue'].includes(model.status), model?.status);
  check('print model exposes vendor + PO/receipts + attachments slots',
    model && 'vendor' in model && 'po' in model && 'receipts' in model && 'attachments' in model);
  check('getBillPrintModel returns null for a missing bill', Expenses.getBillPrintModel(999999) === null);
}

// ── Enter Bill wiring ──────────────────────────────────────────────────────
console.log('\n=== Enter Bill wiring ===');
const eb = read('components/vendors/bills/EnterBill.js');
check('Edit Bill has a Print action', /handlePrintBill/.test(eb) && /PrinterOutlined/.test(eb) && />Print<\/Button>/.test(eb));
check('Print loads the SAVED bill via getBillPrint', /getBillPrint/.test(eb));
check('Print uses the shared printHtml helper', /printHtml\(/.test(eb) && /from '\.\.\/\.\.\/\.\.\/utils\/printDocument'/.test(eb));
check('Print guards unsaved bills', /Save the bill before printing/.test(eb));
check('Print has a loading state + error handling', /loading=\{printing\}/.test(eb) && /Unable to prepare this document for printing/.test(eb));
check('Bill document includes company/vendor/lines/totals/PO/attachments',
  /VENDOR BILL/.test(eb) && /Source Purchase Order/.test(eb) && /Attachments/.test(eb) && /Balance Due/.test(eb));

// ── Bank Reconciliation wiring ─────────────────────────────────────────────
console.log('\n=== Bank Reconciliation wiring ===');
const br = read('components/banking/BankReconciliation.js');
check('Reconciliation has a Print action', /handlePrintReconciliation/.test(br) && /PrinterOutlined/.test(br) && />\s*Print\s*<\/Button>/.test(br));
check('Print uses the shared printHtml helper', /printHtml\(/.test(br) && /from '\.\.\/\.\.\/utils\/printDocument'/.test(br));
check('Print reuses the screen calculations (no duplicate math)',
  /money\(startingBalance\)/.test(br) && /money\(clearedBalance\)/.test(br) && /money\(difference\)/.test(br) && /money\(stmtBal\)/.test(br));
check('Report separates cleared vs outstanding transactions',
  /Cleared Transactions/.test(br) && /Outstanding \/ Uncleared Transactions/.test(br));
check('Report shows statement ending date/balance + status badge',
  /Statement Ending Date/.test(br) && /Statement Ending Balance/.test(br) && /Reconciliation In Progress \(Draft\)/.test(br));
check('Print requires a selected account (no blank report)', /Select a bank account first/.test(br));
check('Print has a loading state + error handling', /loading=\{printing\}/.test(br) && /Unable to prepare this report for printing/.test(br));

// ── IPC + preload ──────────────────────────────────────────────────────────
console.log('\n=== IPC / preload ===');
check('get-bill-print IPC + preload wired',
  /get-bill-print/.test(fs.readFileSync(path.join(ROOT, 'src', 'backend', 'handlers', 'ipcHandlers.js'), 'utf8')) &&
  /getBillPrint/.test(fs.readFileSync(path.join(ROOT, 'src', 'backend', 'preload.js'), 'utf8')));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
