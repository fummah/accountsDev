/**
 * verify-customer-name.js — ONE customer-name resolver for documents.
 *
 * Proves getCustomerName precedence (person → company → display), null/space/"-"
 * handling, and that the Invoice/Quote header, selector, preview/PDF and Bill To
 * all use it (so a business customer is never blank).
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend', 'src');

let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  -> ${d}` : ''}`); } };

// Load the real resolver (ESM util, no imports → evaluate in CJS).
const src = fs.readFileSync(path.join(FE, 'utils', 'contactIdentity.js'), 'utf8');
const cjs = `${src.replace(/export const /g, 'const ')}
module.exports = { normIdentity, deriveDisplayName, getCustomerName };`;
const mod = { exports: {} };
// eslint-disable-next-line no-new-func
new Function('module', 'exports', cjs)(mod, mod.exports);
const { getCustomerName } = mod.exports;

console.log('\n=== precedence / cases ===');
check('CASE 1 individual: John Smith wins over company', getCustomerName({ first_name: 'John', last_name: 'Smith', company_name: 'Smith Hardware' }) === 'John Smith');
check('CASE 2 first only → John', getCustomerName({ first_name: 'John', last_name: '', company_name: 'Smith Hardware' }) === 'John');
check('CASE 3 last only → Smith', getCustomerName({ first_name: '', last_name: 'Smith', company_name: 'Smith Hardware' }) === 'Smith');
check('CASE 4 business (screenshot) → Westfield Egg Farm', getCustomerName({ first_name: '', last_name: '', company_name: 'Westfield Egg Farm' }) === 'Westfield Egg Farm');
check('CASE 5 business → A&M Transportation', getCustomerName({ first_name: null, last_name: null, company_name: 'A&M Transportation' }) === 'A&M Transportation');
check('CASE 6 whitespace-only first → company (ABC Supplies)', getCustomerName({ first_name: '   ', last_name: '', company_name: 'ABC Supplies' }) === 'ABC Supplies');
check('CASE 7 no name, only display → Cash Customer', getCustomerName({ first_name: '', last_name: '', company_name: '', display_name: 'Cash Customer' }) === 'Cash Customer');
check('CASE 8 "-" placeholders are ignored → company', getCustomerName({ first_name: '-', last_name: '-', company_name: 'Westfield Egg Farm' }) === 'Westfield Egg Farm');
check('never returns "- -" or "- Company"', !/^-/.test(getCustomerName({ first_name: '-', last_name: '-', company_name: 'X' })) && !getCustomerName({ first_name: '-', last_name: '-' }).includes('-'));

console.log('\n=== robustness ===');
check('null/undefined safe', getCustomerName(null) === '' && getCustomerName(undefined) === '' && getCustomerName() === '');
check('all empty → empty string (no " " or "-")', getCustomerName({ first_name: '', last_name: '', company_name: '', display_name: '' }) === '');
check('no double spaces (first only)', getCustomerName({ first_name: 'John' }) === 'John');
check('no trailing space (last only)', getCustomerName({ last_name: 'Smith' }) === 'Smith');
check('camelCase keys supported', getCustomerName({ firstName: 'John', lastName: 'Smith' }) === 'John Smith' && getCustomerName({ company: 'A&M Transportation' }) === 'A&M Transportation');
check('trims surrounding whitespace', getCustomerName({ first_name: '  John ', last_name: ' Smith ' }) === 'John Smith');

console.log('\n=== wiring ===');
const ci = fs.readFileSync(path.join(FE, 'components', 'customers', 'invoices', 'CreateInvoice.js'), 'utf8');
const cq = fs.readFileSync(path.join(FE, 'components', 'customers', 'quotes', 'CreateQuote.js'), 'utf8');
const pdf = fs.readFileSync(path.join(FE, 'components', 'customers', 'shared', 'generateDocumentPDF.js'), 'utf8');
check('contactIdentity exports getCustomerName', /export const getCustomerName/.test(src));
check('CreateInvoice imports + uses getCustomerName for header/selector/pdf', /getCustomerName/.test(ci) && (ci.match(/getCustomerName\(/g) || []).length >= 3);
check('CreateQuote imports + uses getCustomerName', /getCustomerName/.test(cq) && (cq.match(/getCustomerName\(/g) || []).length >= 3);
check('no remaining "display_name || first+last" name paths in CreateInvoice', !/display_name \|\|.*first_name/.test(ci));
check('no remaining "display_name || first+last" name paths in CreateQuote', !/display_name \|\|.*first_name/.test(cq));
check('PDF Bill To uses header.customerName (the resolved name)', /customerLines\(header\.customerName/.test(pdf) && /billLines/.test(pdf));

console.log('\n=== First/Last stay OPTIONAL ===');
const fields = fs.readFileSync(path.join(FE, 'components', 'customers', 'shared', 'CustomerContactFields.js'), 'utf8');
check("Last Name has NO required rule", /last_name: item\('last_name', 'Last Name', <Input \/>\)/.test(fields));
check('first name rule is the first-OR-company rule (not required)', /first_name: item\('first_name'[\s\S]{0,80}getContactRules\('first_name'/.test(fields));
const cv = fs.readFileSync(path.join(FE, 'components', 'customers', 'shared', 'customerValidation.js'), 'utf8');
check('validator requires first_name OR company_name only', /identityRule\(form\)/.test(cv));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
