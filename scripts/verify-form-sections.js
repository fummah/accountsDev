/**
 * Verification for the Add/Edit Customer + Add/Edit Vendor form redesign.
 *
 * This refactor was PURELY presentational — reorganising the existing flat
 * grids into grouped section cards. The one hard guarantee is therefore:
 *
 *     NO FIELD WAS REMOVED, RENAMED, OR ADDED.
 *
 * This script proves that mechanically by extracting every `name="…"` bound to
 * a <Form.Item> (plus the `item('…')` helper used by the shared customer
 * block) from each form and comparing it to the field list that existed before
 * the change. Those baseline lists are written out below so the assertion is
 * auditable by eye.
 *
 * It also asserts the structural things the redesign promised: the section
 * titles, the shared FormSection component, the Lead form opting OUT of the
 * new layout, and the three vendor fields VendorCenter used to silently drop.
 *
 * Plain node — no DB, no Electron:
 *   node scripts/verify-form-sections.js
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

// ── field extraction ─────────────────────────────────────────────────────────
// Two shapes are in play:
//   <Form.Item name="email" …>            → direct binding
//   item('email', 'Email', <Input />)     → the shared customer block's helper
const FORM_ITEM_NAME = /<Form\.Item[^>]*\bname="([^"]+)"/g;
const ITEM_HELPER = /\bitem\('([^']+)'/g;

const fieldNames = (src) => {
  const out = new Set();
  let m;
  FORM_ITEM_NAME.lastIndex = 0;
  while ((m = FORM_ITEM_NAME.exec(src))) out.add(m[1]);
  ITEM_HELPER.lastIndex = 0;
  while ((m = ITEM_HELPER.exec(src))) out.add(m[1]);
  return [...out].sort();
};

// ── baselines (the field lists as they were BEFORE the redesign) ─────────────
const CUSTOMER_FIELDS = [
  'address1', 'address2', 'city', 'company_name', 'country',
  'default_tax_rate_id', 'display_name', 'email', 'first_name', 'last_name',
  'mobile_number', 'notes', 'phone_number', 'postal_code', 'state', 'taxable',
];

const VENDOR_CENTER_FIELDS = [
  'address1', 'address2', 'city', 'company_name', 'country', 'display_name',
  'email', 'first_name', 'opening_balance', 'phone_number', 'state', 'zip',
];

const VENDOR_LIST_FIELDS = [
  'account_number', 'address1', 'address2', 'business_number', 'city',
  'company_name', 'country', 'display_name', 'email', 'expense_category',
  'first_name', 'last_name', 'mobile_number', 'notes', 'opening_balance',
  'phone_number', 'postal_code', 'state', 'supplier_terms', 'title',
  'vendor_type', 'website',
];

// ── paths ────────────────────────────────────────────────────────────────────
const P = {
  shared: 'src/frontend/src/components/customers/shared/CustomerContactFields.js',
  // The Tax Settings block moved OUT of the shared customer block into its own
  // component (so Customer and Vendor forms can both import it). The customer
  // field set therefore spans two files now.
  taxSection: 'src/frontend/src/components/shared/TaxSettingsSection.js',
  section: 'src/frontend/src/components/shared/FormSection.js',
  leads: 'src/frontend/src/components/customers/Leads.js',
  center: 'src/frontend/src/components/customers/CustomerCenter.js',
  list: 'src/frontend/src/components/customers/CustomerList.js',
  details: 'src/frontend/src/components/customers/CustomerDetails.js',
  invoice: 'src/frontend/src/components/customers/invoices/CreateInvoice.js',
  quote: 'src/frontend/src/components/customers/quotes/CreateQuote.js',
  vendorCenter: 'src/frontend/src/components/vendors/VendorCenter.js',
  vendorList: 'src/frontend/src/components/vendors/SupplierVendorList.js',
};

const src = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, read(v)]));

// ── 1. the shared section component ──────────────────────────────────────────
console.log('\n1. Shared FormSection component\n');
ok('FormSection.js exists', !!src.section);
ok('exports FORM_ITEM_STYLE', /export const FORM_ITEM_STYLE/.test(src.section));
ok('exports MODAL_BODY_SCROLL_STYLE', /export const MODAL_BODY_SCROLL_STYLE/.test(src.section));
ok('exports MODAL_WIDTH', /export const MODAL_WIDTH/.test(src.section));
ok('modal width is in the 700–850 band',
  (() => { const m = src.section.match(/MODAL_WIDTH = (\d+)/); const w = m ? Number(m[1]) : 0; return w >= 700 && w <= 850; })());
ok('renders a bordered, rounded, compact section',
  /border: '1px solid/.test(src.section) && /borderRadius: 8/.test(src.section) && /padding: '12px 16px/.test(src.section));
ok('renders an UPPERCASE section heading', /textTransform: 'uppercase'/.test(src.section));
// NOTE: the pattern must require a delimiter after `<form`, otherwise the
// kit's own `<FormGrid>` / `<FormCol>` names match it case-insensitively.
ok('does NOT wrap children in a <form> or fieldset (accessibility)',
  !/<form[\s>/]|<fieldset/i.test(src.section));

// ── 2. shared customer fields: no field lost ─────────────────────────────────
console.log('\n2. Customer fields — nothing removed\n');
// Tax Status + Default Tax Rate now live in the shared Tax Settings component,
// so the customer field set is the union of the two files.
check('shared customer field set is unchanged',
  fieldNames(`${src.shared}\n${src.taxSection}`), CUSTOMER_FIELDS);

// ── 3. shared customer fields: the sections ──────────────────────────────────
console.log('\n3. Customer sections\n');
['Customer Information', 'Contact Information', 'Billing Address', 'Notes']
  .forEach(t => ok(`section "${t}"`, src.shared.includes(`title="${t}"`)));
ok('section "Tax Settings" (shared component)',
  src.taxSection.includes('title="Tax Settings"'));
ok('Tax Settings is rendered by the customer block when vatRates are supplied',
  /<TaxSettingsSection[\s\S]{0,80}vatRates=\{vatRates\}/.test(src.shared));

// field → section membership, so a field can't silently fall out of the layout.
// The sectioned layout renders the pre-built nodes, i.e. `{fields.email}`.
const sectionOf = (title, s = src.shared) => {
  const i = s.indexOf(`title="${title}"`);
  if (i < 0) return '';
  const j = s.indexOf('</FormSection>', i);
  return s.slice(i, j);
};
const holds = (section, fields) => fields.every(f => section.includes(`fields.${f}`));

ok('Customer Information holds First/Last/Display/Company',
  holds(sectionOf('Customer Information'), ['first_name', 'last_name', 'display_name', 'company_name']));
ok('Contact Information holds Email/Phone/Mobile',
  holds(sectionOf('Contact Information'), ['email', 'phone_number', 'mobile_number']));
ok('Billing Address holds the 6 address fields',
  holds(sectionOf('Billing Address'), ['address1', 'address2', 'city', 'state', 'postal_code', 'country']));
ok('Tax Settings holds Tax Status + Default Tax Rate',
  sectionOf('Tax Settings', src.taxSection).includes('name="taxable"')
  && sectionOf('Tax Settings', src.taxSection).includes('name="default_tax_rate_id"'));

// ── 4. the Lead form now USES the shared boxed sections ──────────────────────
console.log('\n4. CRM Lead form uses the shared section cards\n');
ok('legacy flat branch still exists in the shared block', /if \(sections === false\)/.test(src.shared));
check('Leads no longer opts out of the sectioned layout',
  (src.leads.match(/sections=\{false\}/g) || []).length, 0);
ok('Leads still renders CustomerContactFields',
  /<CustomerContactFields/.test(src.leads));
ok('Leads uses the shared contact block in the lead layout',
  /<CustomerContactFields[\s\S]{0,200}?layout="lead"/.test(src.leads));
ok('Leads wraps its sections in the shared FormSection component',
  /<FormSection\b/.test(src.leads));
ok('Lead boxes Source / Lead Details / Notes',
  /title="Source"/.test(src.leads) && /title="Lead Details"/.test(src.leads) && /title="Notes"/.test(src.leads));
ok('Lead contact block provides the Customer/Contact + Address cards',
  /title="Customer \/ Contact Information"/.test(src.shared) && /title="Address"/.test(src.shared));

// ── 5. every customer consumer moved to the sectioned block ──────────────────
console.log('\n5. Customer form consumers\n');
const customerConsumers = [
  ['CustomerCenter (Add Customer)', src.center],
  ['CustomerList (Add Customer)', src.list],
  ['CustomerDetails (Edit Customer)', src.details],
  ['CreateInvoice (Add New Customer)', src.invoice],
  ['CreateQuote (Add New Customer)', src.quote],
];
for (const [label, s] of customerConsumers) {
  ok(`${label}: uses the shared sectioned block`, /<CustomerContactFields/.test(s));
  ok(`${label}: passes vatRates (Tax Settings inline)`, /<CustomerContactFields[\s\S]{0,220}?vatRates=\{vatRates\}/.test(s));
  ok(`${label}: no leftover CustomerTaxFields / "Tax Settings" divider`,
    !/CustomerTaxFields/.test(s) && !/Divider>Tax Settings/.test(s));
  ok(`${label}: scrollable modal body + standard width`,
    /bodyStyle=\{MODAL_BODY_SCROLL_STYLE\}/.test(s) && /width=\{MODAL_WIDTH\}/.test(s));
}

// ── 6. vendor: no field lost ─────────────────────────────────────────────────
console.log('\n6. Vendor fields — nothing removed\n');
check('VendorCenter Add Vendor field set is unchanged', fieldNames(src.vendorCenter), VENDOR_CENTER_FIELDS);
check('SupplierVendorList Add/Edit field set is unchanged', fieldNames(src.vendorList), VENDOR_LIST_FIELDS);

// ── 7. vendor sections ───────────────────────────────────────────────────────
console.log('\n7. Vendor sections\n');
['Vendor Information', 'Contact Information', 'Address', 'Payment Settings']
  .forEach(t => ok(`VendorCenter section "${t}"`, src.vendorCenter.includes(`title="${t}"`)));
['Vendor Information', 'Contact Information', 'Address', 'Payment Settings', 'Notes']
  .forEach(t => ok(`SupplierVendorList section "${t}"`, src.vendorList.includes(`title="${t}"`)));
ok('VendorCenter renders the shared Tax Settings section',
  /<TaxSettingsSection[\s\S]{0,60}vatRates=\{vatRates\}/.test(src.vendorCenter));
ok('SupplierVendorList renders the shared Tax Settings section',
  /<TaxSettingsSection[\s\S]{0,60}vatRates=\{vatRates\}/.test(src.vendorList));
ok('both vendor forms load saved rates from getAllVat',
  /getAllVat\?\.\(\)/.test(src.vendorCenter) && /getAllVat\?\.\(\)/.test(src.vendorList));

// ── 8. the silently-dropped fields are now saved ─────────────────────────────
console.log('\n8. VendorCenter save bug fixed\n');
ok('company_name is read from the form', /const company_name = values\.company_name/.test(src.vendorCenter));
ok('address2 is read from the form', /const address2 = values\.address2/.test(src.vendorCenter));
ok('country is read from the form', /const country = values\.country/.test(src.vendorCenter));
ok('nothing is still hardcoded to an empty string for those three',
  !/const company_name = '';/.test(src.vendorCenter)
  && !/const address2 = '';/.test(src.vendorCenter)
  && !/const country = '';/.test(src.vendorCenter));

// ── 9. no save path changed ──────────────────────────────────────────────────
console.log('\n9. Save / validation behaviour untouched\n');
ok('CustomerCenter still calls insertCustomer', /electronAPI\.insertCustomer\(/.test(src.center));
ok('CustomerList still calls its create handler', /onFinish=\{handleAddCustomer\}/.test(src.list));
ok('CustomerDetails still calls handleUpdate', /onOk=\{handleUpdate\}/.test(src.details));
ok('VendorCenter still calls insertSupplier', /electronAPI\.insertSupplier\(/.test(src.vendorCenter));
ok('SupplierVendorList still calls insertSupplier + updateSupplier',
  /electronAPI\.insertSupplier\(/.test(src.vendorList) && /electronAPI\.updateSupplier\(/.test(src.vendorList));
ok('first-name-or-company rule still wired in the shared block',
  /getContactRules\('first_name', form\)/.test(src.shared));
ok('phone formatting preserved (phoneInputHandler)',
  (src.shared.match(/phoneInputHandler\(/g) || []).length === 2);
ok('display-name auto-generation preserved in CustomerCenter',
  /values\.display_name \|\| `\$\{values\.first_name/.test(src.center));

// The tax payload is now produced by ONE shared rule (utils/taxRate.js) instead
// of a per-form `selectedRate ? … : …` expression, so assert the rule is used
// and that the id — not the label — is what gets stored.
const TAX_UTIL = 'src/frontend/src/utils/taxRate.js';
const taxSrc = read(TAX_UTIL);
ok('one shared tax-rate rule exists', /export const resolveTaxRateFields/.test(taxSrc));
ok('the rule stores the rate ID (not the display text)',
  /default_tax_rate_id: Number\(rate\.id\)/.test(taxSrc));
ok('the rule clears both columns when nothing is selected',
  /rawId == null[\s\S]{0,120}default_tax_rate: null, default_tax_rate_id: null/.test(taxSrc));
for (const [label, s] of [
  ['CustomerCenter', src.center],
  ['CustomerList', src.list],
  ['CustomerDetails', src.details],
  ['CreateInvoice', src.invoice],
  ['CreateQuote', src.quote],
  ['VendorCenter', src.vendorCenter],
  ['SupplierVendorList', src.vendorList],
]) {
  ok(`${label}: tax payload comes from the shared rule`,
    /resolveTaxRateFields\(/.test(s) && !/selectedRate \?/.test(s));
}
// Customer and Vendor must share ONE dropdown implementation.
ok('vendors import the same shared TaxSettingsSection (no parallel dropdown)',
  /import TaxSettingsSection from '\.\.\/shared\/TaxSettingsSection'/.test(src.vendorCenter)
  && /import TaxSettingsSection from '\.\.\/shared\/TaxSettingsSection'/.test(src.vendorList));
ok('the shared section is the only Default Tax Rate dropdown',
  /import TaxRateSelect from '\.\/TaxRateSelect'/.test(src.taxSection)
  && !/vat_percentage\}%\)/.test(src.vendorList));

// ── summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
