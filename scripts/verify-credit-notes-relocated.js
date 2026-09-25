/**
 * verify-credit-notes-relocated.js
 *
 * The standalone "Credit Notes / Refunds" page was removed from the active UI.
 * Customer credits/refunds are managed inside Customer Details. Nothing about the
 * data, tables, APIs or accounting changed — only the route/navigation.
 *
 * Runs on a SCRATCH COPY (for the table/data checks); frontend checks read source.
 */
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const Module = require('module');
const electronStub = { ipcMain: { handle: () => {} }, app: { isPackaged: true } };
const originalLoad = Module._load;
Module._load = function (request) { if (request === 'electron') return electronStub; return originalLoad.apply(this, arguments); };

require('./lib/testDb.js').useScratchCopy({ label: 'verify-credit-notes-relocated' });
const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js')).raw;

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};
const read = (rel) => fs.readFileSync(path.join(FE, rel), 'utf8');

// ── Navigation / route ─────────────────────────────────────────────────────
console.log('\n=== Navigation removed, old route redirects ===');
const routes = read('components/customers/index.js');
check('standalone route no longer renders CreditNoteList', !/CreditNoteList/.test(routes));
check('old /credit-notes route now uses the redirect', /credit-notes`\}\s+component=\{CreditNotesRedirect\}/.test(routes));
const redirect = read('components/customers/creditNotes/CreditNotesRedirect.js');
check('redirect targets a safe destination (customer or Customers list)', /Redirect/.test(redirect) && /\/main\/customers\/details\//.test(redirect) && /\/main\/customers\/center/.test(redirect));
check('no navigation entry links to /credit-notes', (() => {
  const files = [
    'containers/Sidebar/SidebarContent.js', 'containers/Sidebar/PopOverComponent.js',
    'components/CommandPalette.js', 'routes/main/dashboard/Flow/index.js',
  ];
  return files.every(f => !/customers\/credit-notes/.test(read(f)));
})());

// ── Data / tables / APIs preserved ─────────────────────────────────────────
console.log('\n=== Historical data + APIs preserved ===');
check('credit_notes table still exists', !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='credit_notes'").get());
check('credit_note_lines table still exists', !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='credit_note_lines'").get());
const preload = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'preload.js'), 'utf8');
check('credit note APIs still exposed', /creditNotesList/.test(preload) && /creditNoteGet/.test(preload) && /creditNoteApply/.test(preload) && /creditNotesByCustomer/.test(preload));
const model = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'models', 'creditNotes.js'), 'utf8');
check('credit note accounting engine untouched (posts Dr Income / Cr AR)', /Accounts Receivable reduction/.test(model) && /revenue reversal/.test(model));

// ── Customer Details integration ───────────────────────────────────────────
console.log('\n=== Customer Details integration ===');
const cd = read('components/customers/CustomerDetails.js');
check('loads the customer\'s credit notes', /creditNotesByCustomer/.test(cd));
check('Transaction List includes Credit Notes', /docType: 'Credit Note'/.test(cd));
check('credit notes are clickable to their detail', /openCreditNote/.test(cd) && /creditNoteGet/.test(cd));
check('Issue Credit available from Invoices context', /Issue Credit/.test(cd) && /RefundInvoiceModal/.test(cd) && /initialInvoiceId/.test(cd));
check('Apply Credit available (same-customer invoices only)', /creditNoteApply/.test(cd) && /this customer's invoices/.test(cd));
check('Refund Credit creates a linked refund (credit note remains)', /customerRefundCreate/.test(cd) && /creditNoteId/.test(cd));

// ── Payment refund integration retained ────────────────────────────────────
console.log('\n=== Payments tab refund workflow retained ===');
const hist = read('components/customers/payments/CustomerPaymentHistory.js');
check('Refund Payment + Refund Customer remain on Payments', /Refund Selected Payment/.test(hist) && /Refund \/ Credit an Invoice/.test(hist));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
