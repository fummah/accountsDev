/**
 * verify-list-toolbar.js
 *
 * ONE shared list toolbar (components/shared/ListToolbar) is used by every list
 * page, and every control inside it shares the project's 36px control height so
 * the status Select can never sit lower than the search box or the buttons.
 *
 * This verifies the structure (left search / right actions), the scoped
 * alignment CSS, that each audited page opts into the shared toolbar, that the
 * per-page behaviour (export / refresh / status / add) is untouched, and that no
 * `translateY` / `position:absolute` / negative-margin hacks were used.
 */
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
const read = (rel) => fs.readFileSync(path.join(FE, rel), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

const toolbar = read('components/shared/ListToolbar.js');
const css = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'public', 'css', 'custom.css'), 'utf8');

console.log('\n=== Shared ListToolbar structure ===');
check('has the shared class hook', /className="al-list-toolbar"/.test(toolbar));
check('left search group exists', /al-list-toolbar__search/.test(toolbar));
check('right actions group exists', /al-list-toolbar__actions/.test(toolbar));
check('row is a centre-aligned flex row', /display:\s*'flex'/.test(toolbar) && /alignItems:\s*'center'/.test(toolbar));
check('row is justified space-between (search left / actions right)', /justifyContent:\s*'space-between'/.test(toolbar));
check('actions group is itself centre-aligned', /al-list-toolbar__actions[\s\S]{0,200}alignItems:\s*'center'/.test(toolbar));
check('renders the search input', /<Input\.Search/.test(toolbar));
check('renders the status Select', /<Select[\s\S]{0,120}onChange=\{onStatusChange\}/.test(toolbar));
check('renders the Export button wired to onExport', /<Button[\s\S]{0,160}onClick=\{onExport\}/.test(toolbar));
check('renders the Refresh button wired to onRefresh', /<Button[\s\S]{0,160}onClick=\{onRefresh\}/.test(toolbar));
check('still exposes primaryAction + children slots', /primaryAction/.test(toolbar) && /\{children\}/.test(toolbar));
check('wrapping is CSS-driven via the shared class', /className="al-list-toolbar"/.test(toolbar) && !/flexWrap:\s*'wrap'/.test(toolbar));

console.log('\n=== No layout hacks ===');
check('ListToolbar has no marginRight:auto hack', !/marginRight:\s*'auto'/.test(toolbar));
check('ListToolbar has no translateY', !/translateY/.test(toolbar));
check('ListToolbar has no absolute positioning', !/position:\s*'absolute'/.test(toolbar));
check('ListToolbar has no negative margins', !/margin(?:Top|Bottom|Left|Right)?:\s*-/.test(toolbar));
check('ListToolbar does not force items-end', !/alignItems:\s*'flex-end'/.test(toolbar));

console.log('\n=== Scoped alignment CSS (custom.css) ===');
check('defines the .al-list-toolbar scope', /\.al-list-toolbar\b/.test(css));
check('removes the theme search margin (.ant-input-search margin-bottom:16px)', /\.al-list-toolbar[^{]*\.ant-input-search[^{]*\{[^}]*margin:\s*0/.test(css));
check('removes the theme Select margin (.ant-select margin-bottom:8px)', /\.al-list-toolbar[^{]*\.ant-select[^{]*\{[^}]*margin:\s*0/.test(css));
check('removes the theme button margin (.ant-btn margin-bottom:15px)', /\.al-list-toolbar[^{]*\.ant-btn[^{]*\{[^}]*margin:\s*0/.test(css));
check('normalises the single Select to 36px', /\.al-list-toolbar[^{]*\.ant-select-single[^{]*\.ant-select-selector[^{]*\{[^}]*height:\s*36px/.test(css));
check('normalises buttons to 36px', /\.al-list-toolbar[^{]*\.ant-btn[^{]*\{[^}]*height:\s*36px/.test(css));
check('centres the Select text in the 36px box', /\.al-list-toolbar[^{]*\.ant-select-selection-item[^{]*\{[^}]*line-height:\s*34px/.test(css));
check('keeps one line on desktop (nowrap)', /\.al-list-toolbar\s*\{[^}]*flex-wrap:\s*nowrap/.test(css));
check('wraps gracefully on narrow screens (media query)', /@media[^{]*\{\s*\.al-list-toolbar\s*\{[^}]*flex-wrap:\s*wrap/.test(css));
check('toolbar CSS uses no translateY / absolute hacks',
  !/\.al-list-toolbar[^{]*\{[^}]*translateY/.test(css) && !/\.al-list-toolbar[^{]*\{[^}]*position:\s*absolute/.test(css));

console.log('\n=== Every audited list page opts into the shared toolbar ===');
const pages = [
  ['components/customers/CustomerList.js', 'Customers'],
  ['components/customers/CustomerCenter.js', 'Customer Center'],
  ['components/vendors/SupplierVendorList.js', 'Vendors'],
  ['components/employees/EmployeeList.js', 'Employees'],
  ['components/employees/EmployeeCenter.js', 'Employee Center'],
  ['components/customers/invoices/InvoiceList.js', 'Invoices'],
  ['components/customers/quotes/QuoteList.js', 'Quotes'],
  ['components/vendors/BillTracker.js', 'Bills'],
];
for (const [rel, label] of pages) {
  const src = read(rel);
  check(`${label}: uses the shared toolbar (ListToolbar or .al-list-toolbar)`,
    /shared\/ListToolbar/.test(src) || /al-list-toolbar/.test(src));
}

console.log('\n=== Behaviour preserved ===');
const customerList = read('components/customers/CustomerList.js');
const vendors = read('components/vendors/SupplierVendorList.js');
check('Customers still imports ListToolbar', /import ListToolbar from '\.\.\/shared\/ListToolbar'/.test(customerList));
check('Customers status filter wired', /onStatusChange=\{setStatusFilter\}/.test(customerList));
check('Customers Export wired to the export handler', /onExport=\{handleExport\}/.test(customerList));
check('Customers Refresh wired', /onRefresh=\{handleRefresh\}/.test(customerList));
check('Customers Add Customer primary action present', /Add Customer<\/Button>/.test(customerList));
check('Customer Export backend call untouched', /getCustomersForExport/.test(customerList));
check('Vendors still imports ListToolbar', /import ListToolbar from '\.\.\/shared\/ListToolbar'/.test(vendors));
check('Vendors status filter wired', /onStatusChange=\{setStatusFilter\}/.test(vendors));
check('Vendors Export wired', /onExport=\{exportCSV\}/.test(vendors));
check('Vendors Add Supplier / Vendor primary action present', /Add Supplier \/ Vendor<\/Button>/.test(vendors));

console.log('\n=== Other toolbars / page headers aligned ===');
check('Credit Card Charges toolbar uses the shared aligned class',
  /className="al-list-toolbar"/.test(read('components/expenses/CreditCardCharges.js')));
check('Create Invoice header uses the aligned page-head class',
  /className="al-page-head"/.test(read('components/customers/invoices/CreateInvoice.js')));
check('Create Quote header uses the aligned page-head class',
  /className="al-page-head"/.test(read('components/customers/quotes/CreateQuote.js')));
check('custom.css defines .al-page-head + zeroes control margins',
  /\.al-page-head\b/.test(css) && /\.al-page-head\s+\.ant-btn[^{]*\{[^}]*margin-bottom:\s*0/.test(css));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
