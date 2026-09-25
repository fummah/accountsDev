/**
 * Verification for the Create/Edit transactional form redesign
 * (Invoice, Quote, Bill).
 *
 * The refactor was PURELY presentational: the same fields, the same handlers and
 * the same IPC calls were reorganised from one long flat column into grouped
 * section cards. This script is the mechanical guard for everything the spec
 * promised, so a later edit cannot silently undo it.
 *
 * What it proves:
 *   1.  all three forms use the ONE shared section kit
 *   2.  the exact section titles exist
 *   3.  Invoice Details keeps the specified row/column order
 *   4.  "Save as Draft" is gone from all three
 *   5.  the standalone Email button + handleEmailClick are gone
 *   6.  Cancel exists and never saves; Save / Save & Email exist
 *   7.  Save & Email saves EXACTLY once, then opens the email workflow
 *   8.  no editable Invoice/Quote status control (no name="status" on the doc form)
 *   9.  the read-only status badge is preserved
 *  10.  the field sets are frozen (nothing added/removed/renamed)
 *  11.  business logic is untouched (due date, dirty guard, payloads, validation)
 *  12.  page width / responsive grid contract
 *  13.  no new icon package
 *
 * Plain node — no DB, no Electron, no Chrome:
 *   node scripts/verify-transactional-forms.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── tiny test harness ────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  [PASS] ${label}`);
  } else {
    failed++;
    console.log(`  [FAIL] ${label}\n      expected: ${e}\n      actual:   ${a}`);
  }
}
function ok(label, cond, detail) {
  check(label, !!cond, true);
  if (!cond && detail) console.log(`      detail: ${detail}`);
}
function eq(label, actual, expected) {
  check(label, actual, expected);
}

// ── paths ────────────────────────────────────────────────────────────────────
const P = {
  section: 'src/frontend/src/components/shared/FormSection.js',
  invoice: 'src/frontend/src/components/customers/invoices/CreateInvoice.js',
  quote: 'src/frontend/src/components/customers/quotes/CreateQuote.js',
  bill: 'src/frontend/src/components/vendors/bills/EnterBill.js',
  pkg: 'package.json',
  employeeList: 'src/frontend/src/components/employees/EmployeeList.js',
  checkPrinting: 'src/frontend/src/components/accountant/CheckPrinting.js',
  customCss: 'src/frontend/public/css/custom.css',
  formLess: 'src/frontend/src/styles/ui/form.less',
};
const src = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, read(v)]));

const FORMS = [
  ['Invoice', src.invoice],
  ['Quote', src.quote],
  ['Bill', src.bill],
];

// ── helpers ──────────────────────────────────────────────────────────────────
/** Every `name="…"` bound to a <Form.Item>. */
const fieldNames = (s) => {
  const re = /<Form\.Item[^>]*\bname="([^"]+)"/g;
  const out = new Set();
  let m;
  while ((m = re.exec(s))) out.add(m[1]);
  return [...out].sort();
};

/** The slice of source from `title="X"` to the next `</FormSection>`. */
const sectionOf = (s, title) => {
  const i = s.indexOf(`title="${title}"`);
  if (i < 0) return '';
  const j = s.indexOf('</FormSection>', i);
  return j < 0 ? s.slice(i) : s.slice(i, j);
};

/** The ordered list of `name="…"` inside a slice. */
const orderIn = (s, title) => {
  const body = sectionOf(s, title);
  const re = /<Form\.Item[^>]*\bname="([^"]+)"/g;
  const out = [];
  let m;
  while ((m = re.exec(body))) out.push(m[1]);
  return out;
};

/** The text of a `left={…}` / `children={…}` JSX prop, by brace matching. */
const propBlock = (s, prop) => {
  const i = s.indexOf(`${prop}={`);
  if (i < 0) return '';
  const open = s.indexOf('{', i + prop.length);
  let depth = 0;
  for (let k = open; k < s.length; k++) {
    const c = s[k];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(open, k + 1);
    }
  }
  return s.slice(open);
};

/** Body of a named const arrow function, by brace matching. */
const fnBody = (s, name) => {
  const i = s.indexOf(`const ${name} = `);
  if (i < 0) return '';
  const open = s.indexOf('{', i);
  if (open < 0) return '';
  let depth = 0;
  for (let k = open; k < s.length; k++) {
    const c = s[k];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(open, k + 1);
    }
  }
  return s.slice(open);
};

// ── 1. the shared kit ────────────────────────────────────────────────────────
console.log('\n1. One shared section kit\n');
ok('FormSection.js exists', !!src.section);
ok('exports the default FormSection', /export default FormSection/.test(src.section));
ok('exports FormGrid', /export const FormGrid/.test(src.section));
ok('exports FormCol', /export const FormCol/.test(src.section));
ok('exports DocumentActionBar', /export const DocumentActionBar/.test(src.section));
ok('exports TotalsBlock', /export const TotalsBlock/.test(src.section));
ok('exports PAGE_WRAPPER_STYLE', /export const PAGE_WRAPPER_STYLE/.test(src.section));

for (const [label, s] of FORMS) {
  const imp = /from '\.\.\/\.\.\/shared\/FormSection'/.test(s);
  ok(`${label}: imports the shared kit`, imp);
  ok(`${label}: uses <FormSection>`, /<FormSection\b/.test(s));
  ok(`${label}: uses <FormGrid>`, /<FormGrid\b/.test(s));
  ok(`${label}: uses <FormCol>`, /<FormCol\b/.test(s));
  ok(`${label}: uses <DocumentActionBar>`, /<DocumentActionBar\b/.test(s));
  ok(`${label}: uses PAGE_WRAPPER_STYLE (no ad-hoc page shell)`,
    /<div style=\{PAGE_WRAPPER_STYLE\}>/.test(s) && !/maxWidth: 1200/.test(s));
}

// ── 2. section titles ────────────────────────────────────────────────────────
console.log('\n2. Section titles\n');
const TITLES = {
  Invoice: ['Invoice Details', 'Line Items', 'Message on Invoice', 'Statement Memo', 'Actions'],
  Quote: ['Quote Details', 'Line Items', 'Message on Quote', 'Statement Memo', 'Actions'],
  Bill: ['Bill Details', 'Attachments', 'Line Items', 'Actions'],
};
for (const [label, s] of FORMS) {
  for (const t of TITLES[label]) ok(`${label}: section "${t}"`, s.includes(`title="${t}"`));
}

// Message + Statement sit side by side (a 2-column grid), not stacked.
for (const [label, s, msgTitle] of [
  ['Invoice', src.invoice, 'Message on Invoice'],
  ['Quote', src.quote, 'Message on Quote'],
]) {
  const i = s.indexOf(`<FormGrid columns={2}>`);
  ok(`${label}: Message + Statement share a 2-column grid`,
    i > 0 && s.slice(i, s.indexOf('</FormGrid>', i)).includes(`title="${msgTitle}"`));
}

// ── 3. Invoice Details row order ─────────────────────────────────────────────
console.log('\n3. Invoice Details row / column order\n');
eq('Invoice Details field order is Customer | Number | Terms | Date | Due Date | Email | Billing Address | Tax | Status',
  orderIn(src.invoice, 'Invoice Details'),
  ['customer', 'number', 'terms', 'start_date', 'last_date', 'customer_email', 'billing_address', 'vat']);
ok('Billing Address spans 2 columns',
  /<FormCol span=\{2\}>\s*<Form.Item name="billing_address"/.test(src.invoice));
eq('Quote Details field order is Customer | Number | Email | Date | Expiry | Tax | Address',
  orderIn(src.quote, 'Quote Details'),
  ['customer', 'number', 'customer_email', 'start_date', 'last_date', 'vat', 'billing_address']);
ok('Quote: Address spans 2 columns',
  /<FormCol span=\{2\}>\s*<Form.Item name="billing_address"/.test(src.quote));

// ── 4. "Save as Draft" removed ───────────────────────────────────────────────
console.log('\n4. "Save as Draft" removed\n');
for (const [label, s] of FORMS) {
  ok(`${label}: no "Save as Draft"`, !/Save as Draft/i.test(s));
  ok(`${label}: no draft status write`, !/['"]Draft['"]/.test(s));
}
// and it must not survive anywhere else in the app's create screens
const appFiles = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) appFiles.push(p);
  }
};
walk(path.join(ROOT, 'src/frontend/src/components'));
const draftHits = appFiles.filter((f) => /Save as Draft/i.test(fs.readFileSync(f, 'utf8')));
eq('no component anywhere still offers "Save as Draft"',
  draftHits.map((f) => path.relative(ROOT, f).replace(/\\/g, '/')), []);

// ── 5. standalone Email button removed ───────────────────────────────────────
console.log('\n5. Standalone Email button removed\n');
for (const [label, s] of FORMS) {
  ok(`${label}: handleEmailClick is gone`, !/handleEmailClick/.test(s));
}
eq('no standalone "Email Quote" button text',
  (src.quote.match(/>\s*Email Quote\s*</g) || []).length, 0);
eq('no standalone "Email Invoice" button text',
  (src.invoice.match(/>\s*Email Invoice\s*</g) || []).length, 0);

// ── 6. Cancel / Save / Save & Email ──────────────────────────────────────────
console.log('\n6. Action bar contents\n');
for (const [label, s] of FORMS) {
  ok(`${label}: Cancel button present`,
    /<Button size="large" onClick=\{handleCancel\}>Cancel<\/Button>/.test(s));
  ok(`${label}: Cancel sits on the left of the action bar (Clear may sit beside it)`,
    propBlock(s, 'left').includes('<Button size="large" onClick={handleCancel}>Cancel</Button>'));
}
ok('Invoice: Save Invoice', /'Save Invoice'/.test(src.invoice));
ok('Invoice: Save & Email', /'Save & Email'/.test(src.invoice));
ok('Quote: Save Quote', /'Save Quote'/.test(src.quote));
ok('Quote: Save & Email', /'Save & Email'/.test(src.quote));
ok('Bill: Save Bill', /'Save Bill'/.test(src.bill));
ok('Bill: Cancel does not save',
  /const handleCancel = \(\) => \{\s*if \(history/.test(src.bill) && !/handleSave/.test(fnBody(src.bill, 'handleCancel')));

// Cancel must reuse the existing dirty guard, never a new one.
for (const [label, s] of [
  ['Invoice', src.invoice],
  ['Quote', src.quote],
]) {
  ok(`${label}: Cancel === handleBack (no new warning system)`,
    /const handleCancel = handleBack;/.test(s));
  ok(`${label}: reuses useUnsavedChanges`, /useUnsavedChanges\(isDirty, navBypassRef\)/.test(s));
}
eq('no second, competing beforeunload listener was added',
  (src.invoice.match(/beforeunload/g) || []).length, 0);
eq('no second, competing beforeunload listener was added (quote)',
  (src.quote.match(/beforeunload/g) || []).length, 0);

// ── 7. Save & Email saves exactly once ───────────────────────────────────────
console.log('\n7. Save & Email saves exactly once\n');
for (const [label, s] of [
  ['Invoice', src.invoice],
  ['Quote', src.quote],
]) {
  const body = fnBody(s, 'handleSaveAndEmail');
  ok(`${label}: handleSaveAndEmail exists`, !!body);
  eq(`${label}: handleSaveAndEmail calls handleSave exactly once`,
    (body.match(/handleSave\(/g) || []).length, 1);
  ok(`${label}: handleSaveAndEmail does not navigate away`,
    /handleSave\((?:[^)]*,\s*)?false\s*\)/.test(body));
  ok(`${label}: email modal only opens with a real saved id`,
    /const savedId = await handleSave\([^)]*\);\s*if \(savedId\) setEmailModalOpen\(true\)/.test(body));
  ok(`${label}: handleSave returns the saved id`,
    /return savedId;/.test(fnBody(s, 'handleSave')));
  ok(`${label}: handleSave returns null on validation failure`,
    /if \(e\?\.errorFields\) return null;/.test(fnBody(s, 'handleSave')));
  ok(`${label}: only one save path reaches the IPC (no double insert)`,
    (s.match(/electronAPI\.insertInvoice|electronAPI\.insertQuote/g) || []).length === 1);
}
// the correct email templates must be untouched
ok('Invoice email workflow still opens the invoice template modal',
  /setEmailModalOpen\(true\)/.test(src.invoice) && /emailModalOpen/.test(src.invoice));
ok('Quote email workflow still opens the quote template modal',
  /setEmailModalOpen\(true\)/.test(src.quote) && /emailModalOpen/.test(src.quote));

// ── 8. status is never user-editable ─────────────────────────────────────────
console.log('\n8. Status is system-controlled\n');
ok('Invoice: no Form.Item named "status"', !/<Form\.Item[^>]*\bname="status"/.test(src.invoice));
ok('Quote: no Form.Item named "status"', !/<Form\.Item[^>]*\bname="status"/.test(src.quote));
ok('Invoice: the status Form.Item is unnamed (not registered)',
  /<Form\.Item label="Status" style=\{FORM_ITEM_STYLE\}>/.test(src.invoice));
ok('Quote: the status Form.Item is unnamed (not registered)',
  /<Form\.Item label="Status" style=\{FORM_ITEM_STYLE\}>/.test(src.quote));
ok('Invoice: no status Select anywhere', !/name="status"[\s\S]{0,80}<Select/.test(src.invoice));
ok('Quote: no status Select anywhere', !/name="status"[\s\S]{0,80}<Select/.test(src.quote));
ok('Bill: the only name="status" is the chart-of-accounts Active/Inactive picker',
  (src.bill.match(/name="status"/g) || []).length === 1
  && /name="status" label="Status"[\s\S]{0,120}<Option value="Active">/.test(src.bill));

// the client must not push a status into the document payload
ok('Invoice: insert/update payload carries no status',
  !/updateInvoice\?\.\(\{[\s\S]{0,400}?\bstatus:/.test(src.invoice)
  && !/insertInvoice\?\.\([\s\S]{0,400}?['"]Open['"]/.test(src.invoice));
ok('Quote: insert/update payload carries no status',
  !/updateQuote\?\.\(\{[\s\S]{0,400}?\bstatus:/.test(src.quote)
  && !/insertQuote\?\.\([\s\S]{0,400}?['"]Pending['"]/.test(src.quote));

// ── 9. read-only badge preserved ─────────────────────────────────────────────
console.log('\n9. Read-only status badge preserved\n');
ok('Invoice uses InvoiceStatusBadge', /<InvoiceStatusBadge status=\{displayStatus\}/.test(src.invoice));
ok('Invoice keeps the derived-status helper', /const displayStatus = useMemo/.test(src.invoice));
ok('Quote uses QuoteStatusBadge', /<QuoteStatusBadge status=\{isEdit \? canonicalQuoteStatus : 'Pending'\}/.test(src.quote));
ok('Quote keeps the workflow status helper', /const canonicalQuoteStatus = normalizeStatus\(quoteStatus\)/.test(src.quote));
ok('Quote keeps the Accept/Decline/Convert workflow actions',
  /acceptQuote/.test(src.quote) && /declineQuote/.test(src.quote) && /convertQuoteToInvoice/.test(src.quote));
ok('Bill keeps the PAID / Unpaid read-only tags',
  /<Tag color="green">PAID<\/Tag>/.test(src.bill) && /<Tag color="orange">Unpaid/.test(src.bill));

// ── 10. field sets frozen ────────────────────────────────────────────────────
console.log('\n10. Field sets frozen (nothing added / removed / renamed)\n');
const BASELINE = {
  Invoice: ['billing_address', 'cat_name', 'category', 'customer', 'customer_email', 'description',
    'income_account', 'last_date', 'message', 'name', 'number', 'price', 'sku', 'start_date',
    'statement_message', 'stock', 'terms', 'type', 'vat', 'vat_name', 'vat_percentage'],
  Quote: ['billing_address', 'cat_name', 'category', 'customer', 'customer_email', 'description',
    'last_date', 'message', 'name', 'number', 'price', 'sku', 'start_date',
    'statement_message', 'stock', 'type', 'vat', 'vat_name', 'vat_percentage'],
  Bill: ['accountCode', 'accountName', 'accountType', 'address1', 'address2', 'bankAccount',
    'billDate', 'billNumber', 'city', 'company', 'country', 'description', 'dueDate', 'email',
    'first_name', 'last_name', 'memo', 'normalBalance', 'openingBalance', 'parentId',
    'paymentDate', 'phone', 'postal_code', 'state', 'status', 'subType', 'taxLine', 'terms',
    'vendorId',
    // Quick-add "Add New Inventory Item" modal fields captured in the same file.
    'category', 'name', 'price', 'sku', 'stock', 'type'],
};
eq('Invoice field set unchanged', fieldNames(src.invoice), BASELINE.Invoice);
eq('Quote field set unchanged', fieldNames(src.quote), BASELINE.Quote);
eq('Bill field set unchanged', fieldNames(src.bill), [...BASELINE.Bill].sort());
ok('Invoice: every Form.Item in the document form carries the compact spacing',
  (src.invoice.match(/style=\{FORM_ITEM_STYLE\}/g) || []).length >= 9);
ok('Quote: every Form.Item in the document form carries the compact spacing',
  (src.quote.match(/style=\{FORM_ITEM_STYLE\}/g) || []).length >= 9);
ok('Bill: every Form.Item in the document form carries the compact spacing',
  (src.bill.match(/style=\{FORM_ITEM_STYLE\}/g) || []).length >= 5);

// ── 11. business logic untouched ─────────────────────────────────────────────
console.log('\n11. Business logic untouched\n');
ok('Bill: ONE calculateDueDate helper', (src.bill.match(/const calculateDueDate = /g) || []).length === 1);
ok('Bill: ONE applyDueDate writer (no competing writers)',
  (src.bill.match(/const applyDueDate = /g) || []).length === 1);
ok('Bill: calculateDueDate has exactly one call site (inside applyDueDate)',
  (src.bill.match(/calculateDueDate\(/g) || []).length === 1
  && /const next = calculateDueDate\(billDate, terms\)/.test(fnBody(src.bill, 'applyDueDate')));
ok('Bill: the Due Date field has exactly one writer',
  (src.bill.match(/setFieldsValue\(\{ dueDate/g) || []).length === 1
  && fnBody(src.bill, 'applyDueDate').includes('setFieldsValue({ dueDate: next })'));
ok('Bill: Due Date = Bill Date + Terms',
  /applyDueDate\(val, form\.getFieldValue\('terms'\)\)/.test(fnBody(src.bill, 'handleBillDateChange'))
  && /applyDueDate\(form\.getFieldValue\('billDate'\), val\)/.test(fnBody(src.bill, 'handleTermsChange')));
ok('Bill: the Bill Date and Terms controls are still wired to those handlers',
  /name="billDate"[\s\S]{0,200}?onChange=\{handleBillDateChange\}/.test(src.bill)
  && /name="terms"[\s\S]{0,160}?onChange=\{handleTermsChange\}/.test(src.bill)
  && /name="dueDate"/.test(src.bill));
ok('Bill: vendor default terms still recompute the Due Date',
  /applyDueDate\(/.test(fnBody(src.bill, 'applyVendorDefaultTerms')));
ok('Bill: Clear and the mount initialiser both go through applyDueDate',
  /applyDueDate\(/.test(fnBody(src.bill, 'resetForm'))
  && (src.bill.match(/applyDueDate\(/g) || []).length >= 4);
ok('Bill: account eligibility filter still applied',
  /getBillLineAccounts\(/.test(src.bill) && /isBillLineAccount/.test(src.bill));
ok('Bill: uses the shared AttachmentManager for attachments',
  /<AttachmentManager/.test(src.bill) && /entityType="bill"/.test(src.bill));
ok('Bill: paid/reclassification logic preserved',
  /isReclassification/.test(src.bill) || /Credit Card \/ Loan Reclassification/.test(src.bill));
ok('Bill: record-payment path preserved', /Record Payment/.test(src.bill));
ok('Invoice: validation still runs', /await form\.validateFields\(\)/.test(src.invoice));
ok('Quote: validation still runs', /await form\.validateFields\(\)/.test(src.quote));
ok('Invoice: dirty tracking preserved', /setIsDirty\(true\)/.test(src.invoice));
ok('Quote: dirty tracking preserved', /setIsDirty\(true\)/.test(src.quote));
ok('Invoice: due-date auto-calc preserved', /const calcDueDate = /.test(src.invoice));
ok('Quote: no terms→due-date automation was added or removed (Quote Date + Expiry Date only)',
  /name="last_date" label="Expiry Date"/.test(src.quote) && !/calculateDueDate|calcDueDate/.test(src.quote));
ok('Invoice: line items still a state-driven table inside the one Form',
  /<Table/.test(src.invoice) && /setLines\(/.test(src.invoice));
ok('Quote: line items still a state-driven table inside the one Form',
  /<Table/.test(src.quote) && /setLines\(/.test(src.quote));
ok('Invoice: print/PDF path preserved', /handleDocumentPDF/.test(src.invoice));
ok('Quote: print/PDF path preserved', /handleDocumentPDF/.test(src.quote));
ok('Bill: attachment open/remove handled by the shared component',
  /<AttachmentManager/.test(src.bill) && /attachmentRef/.test(src.bill));

// ── 12. page width + responsive contract ─────────────────────────────────────
console.log('\n12. Page width / responsive grid\n');
const maxW = (() => {
  const m = src.section.match(/PAGE_MAX_WIDTH = (\d+)/);
  return m ? Number(m[1]) : 0;
})();
ok(`page max width is in the 1200–1400 band (${maxW}px)`, maxW >= 1200 && maxW <= 1400);
ok('FormCol is mobile-first: xs=24 (one column on phones)',
  /<Col xs=\{24\} md=\{md\} lg=\{lg\}/.test(src.section));
ok('FormCol degrades to 2 columns on tablet',
  /const md = span >= 2 \? 24 : 12;/.test(src.section));
ok('FormGrid wraps (no horizontal scroll)', /<Row gutter=\{gutter\}/.test(src.section));
ok('action bar wraps instead of overflowing', /flexWrap: 'wrap'/.test(src.section));
ok('the .ant-row column regression is still neutralised in custom.css',
  /\.ant-form-vertical \.ant-row(?::not\(\.ant-form-item-row\))?\s*\{[^}]*flex-direction:\s*row\s*!important/.test(src.customCss));
ok('the LESS source no longer forces column on .ant-row',
  !/&-vertical\s*\{[^}]*?\.ant-row\s*\{[^}]*?flex-direction:\s*column/.test(src.formLess));
// A 7-column antd Table with `table-layout:auto` pushes the DOCUMENT wider than a phone
// viewport (measured: 620px of content in a 504px viewport). `scroll={{x}}` makes antd wrap it
// in its own overflow container instead, which is what "no horizontal scroll" requires.
ok('Invoice: the line-items table scrolls inside its own container',
  /<Table[^>]*\bscroll=\{\{ x: 'max-content' \}\}/.test(src.invoice));
ok('Quote: the line-items table scrolls inside its own container',
  /<Table[^>]*\bscroll=\{\{ x: 'max-content' \}\}/.test(src.quote));
ok('Bill: the line rows stay shrinkable flex (no fixed-px field widths)',
  !/style=\{\{ flex: '0 0 \d+px' \}\}/.test(src.bill)
  && /style=\{\{ flex: 1 \}\}/.test(src.bill) && /style=\{\{ flex: 2 \}\}/.test(src.bill));

// ── 13. no new icon package ──────────────────────────────────────────────────
console.log('\n13. No new icon package\n');
const pkg = JSON.parse(src.pkg);
const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
const banned = deps.filter((d) => /^(react-icons|lucide-react|@heroicons|@tabler\/icons|feather-icons|font-awesome|@fortawesome)/.test(d));
eq('no alternative icon package was installed', banned, []);
ok('the forms only use the already-present @ant-design/icons',
  FORMS.every(([, s]) => !/from '(?!@ant-design\/icons)[^']*icons[^']*'/.test(s)));

// ── 14. every named import from FormSection actually exists ──────────────────
// The production build fails hard with
//   "Attempted import error: 'X' is not exported from '../../shared/FormSection'"
// so resolve every importer's named list against the module's real exports.
console.log('\n14. Import / export contract of the shared kit\n');
const exported = new Set();
{
  // Strip comments first: the file's own doc-comment mentions `export { FormSection }`,
  // and a naive scan would "find" exports that do not exist.
  const code = src.section
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const re = /export\s+(?:const|function|let|var)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(code))) exported.add(m[1]);
  const re2 = /export\s*\{([^}]+)\}/g;
  while ((m = re2.exec(code))) {
    m[1].split(',').forEach((n) => {
      const name = n.trim().split(/\s+as\s+/).pop();
      if (name) exported.add(name);
    });
  }
}
ok('FormSection.js has a default export', /export default FormSection/.test(src.section));
ok('FormSection is also a named export', exported.has('FormSection'));

const importerFiles = [];
const walkSrc = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkSrc(p);
    else if (e.name.endsWith('.js')) importerFiles.push(p);
  }
};
walkSrc(path.join(ROOT, 'src/frontend/src'));

const importers = [];
const missing = [];
for (const f of importerFiles) {
  const s = fs.readFileSync(f, 'utf8');
  const re = /import\s+([^;]*?)\s+from\s+'([^']*shared\/FormSection)'/g;
  let m;
  while ((m = re.exec(s))) {
    const clause = m[1];
    const named = clause.match(/\{([^}]*)\}/);
    const hasDefault = /^\s*[A-Za-z_$][\w$]*\s*(?:,|$)/.test(clause.replace(/\{[^}]*\}/, '').trim() || clause.split(',')[0] + ',');
    importers.push(path.relative(ROOT, f).replace(/\\/g, '/'));
    if (!named) continue;
    for (const raw of named[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0];
      if (name && !exported.has(name)) missing.push(`${path.basename(f)} → ${name}`);
    }
    if (hasDefault && !/export default/.test(src.section)) missing.push(`${path.basename(f)} → default`);
  }
}
ok('every file that imports the shared kit was found', importers.length >= 9, `found ${importers.length}`);
eq('no importer references a name the kit does not export', missing, []);

// The reverse direction: a file that USES a kit identifier without importing it.
// This is the `react/jsx-no-undef` class of error — it renders a blank component
// (or throws) and is invisible to Babel, which does not resolve imports.
const KIT_NAMES = ['FormSection', 'FormGrid', 'FormCol', 'DocumentActionBar', 'FORM_ITEM_STYLE'];
const KIT_PATH = path.resolve(ROOT, P.section);
const notImported = [];
for (const f of importerFiles) {
  // The kit defines these names — it does not import them.
  if (path.resolve(f) === KIT_PATH) continue;
  const raw = fs.readFileSync(f, 'utf8');
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const kitImports = new Set();
  const reImp = /import\s+([^;]*?)\s+from\s+'([^']*(?:shared\/FormSection|\.\/FormSection))'/g;
  let m;
  while ((m = reImp.exec(code))) {
    const clause = m[1];
    const named = clause.match(/\{([^}]*)\}/);
    if (named) {
      named[1].split(',').forEach((n) => {
        const nm = n.trim().split(/\s+as\s+/)[0];
        if (nm) kitImports.add(nm);
      });
    }
    // Default binding: `import FormSection, { … } from '…'` — strip the braces and
    // any commas, then take the first bare identifier. (`FormSection,` must not
    // survive as a name, which is why commas are replaced before trimming.)
    const def = clause.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim().split(/\s+/)[0];
    if (/^[A-Za-z_$][\w$]*$/.test(def)) kitImports.add(def);
  }
  // Remove import statements so their own text cannot count as a "usage".
  const body = code.replace(/import\s+[^;]*?from\s+'[^']*';?/g, '');
  for (const name of KIT_NAMES) {
    const used = new RegExp('<' + name + '[\\s/>]').test(body) || new RegExp('\\b' + name + '\\b').test(body);
    if (used && !kitImports.has(name)) {
      notImported.push(`${path.basename(f)} uses ${name} but does not import it`);
    }
  }
}
eq('every kit identifier that is used is imported by that same file', notImported, []);

// ── 15. Phase 6: the two other forms that adopted the kit ────────────────────
console.log('\n15. Phase 6 — Employees + Checks adopted the kit\n');
const EXTRA = {
  Employees: ['src/frontend/src/components/employees/EmployeeList.js',
    ['date_hired', 'department', 'email', 'first_name', 'last_name', 'middle_name', 'phone',
      'role', 'salary', 'status']],
  Checks: ['src/frontend/src/components/accountant/CheckPrinting.js',
    ['accountId', 'amount', 'checkNumber', 'date', 'memo', 'payee', 'payeeAddress', 'payeeName']],
};
for (const [label, [rel, baseline]] of Object.entries(EXTRA)) {
  const s = read(rel);
  ok(`${label}: imports the shared kit`, /from '\.\.\/shared\/FormSection'/.test(s));
  ok(`${label}: uses <FormSection>`, /<FormSection\b/.test(s));
  ok(`${label}: uses <FormGrid> + <FormCol>`, /<FormGrid\b/.test(s) && /<FormCol\b/.test(s));
  ok(`${label}: uses <DocumentActionBar>`, /<DocumentActionBar\b/.test(s));
  ok(`${label}: no leftover ad-hoc Row/Col field grid`, !/<Row gutter=\{16\}>/.test(s));
  eq(`${label}: field set unchanged`, fieldNames(s), baseline);
}
ok('Employees: 3 sections (Information / Contact / Employment)',
  ['Employee Information', 'Contact Information', 'Employment Details']
    .every((t) => src.employeeList.includes(`title="${t}"`)));
ok('Checks: 4 sections (Details / Attachments / Split Lines / Actions)',
  ['Check Details', 'Attachments', 'Split Lines (Expense Accounts)', 'Actions']
    .every((t) => src.checkPrinting.includes(`title="${t}"`)));
ok('Checks: the old Divider pseudo-header is gone',
  !/<Divider orientation="left"/.test(src.checkPrinting));
ok('Checks: Split Lines stays a state-driven list (not a Form.List)',
  !/name=\{\[field\.name/.test(src.checkPrinting));
ok('Employees: modal body scrolls (same treatment as the Customer/Vendor modals)',
  /bodyStyle=\{MODAL_BODY_SCROLL_STYLE\}/.test(src.employeeList));

// ── summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
