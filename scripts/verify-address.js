/**
 * verify-address.js — ONE customer address formatter.
 *
 * Proves the shared formatter (utils/address.js) renders the required order
 * (Name / Street / "City State, Postal" / Email) for structured customers AND
 * free-text snapshots, handles missing fields cleanly, and that the documents
 * (PDF BILL TO / DELIVERY, CreateQuote/CreateInvoice snapshots, CustomerDetails)
 * all use it. No DB needed → plain node.
 */
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend', 'src');

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`); }
};
const eq = (label, actual, expected) => check(label, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });

// Load the two ESM utils in CJS (no bundler): inject getCustomerName into address.js.
function loadCjs(file, prelude, exportsList, injected = {}) {
  let src = fs.readFileSync(file, 'utf8');
  src = src.replace(/^\s*import[^\n]*\n/gm, '');
  src = src.replace(/export\s+(function|const)\s+/g, '$1 ');
  src = `${prelude}\n${src}\nmodule.exports = { ${exportsList} };`;
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', ...Object.keys(injected), src)(mod, mod.exports, ...Object.values(injected));
  return mod.exports;
}

const ci = loadCjs(path.join(FE, 'utils', 'contactIdentity.js'), '', 'getCustomerName');
const addr = loadCjs(
  path.join(FE, 'utils', 'address.js'), '',
  'formatCityStatePostal, structuredAddressLines, textAddressLines, formatAddressLines, formatCustomerAddress',
  { getCustomerName: ci.getCustomerName }
);
const { formatCityStatePostal, textAddressLines, formatAddressLines, formatCustomerAddress } = addr;

console.log('\n=== formatCityStatePostal (the ONE city line) ===');
eq('full → "Lykens PA, 17048"', formatCityStatePostal('Lykens', 'PA', '17048'), 'Lykens PA, 17048');
eq('no postal → "Lykens PA"', formatCityStatePostal('Lykens', 'PA', ''), 'Lykens PA');
eq('no state → "Lykens, 17048"', formatCityStatePostal('Lykens', '', '17048'), 'Lykens, 17048');
eq('no city → "PA, 17048"', formatCityStatePostal('', 'PA', '17048'), 'PA, 17048');
eq('all empty → ""', formatCityStatePostal('', '', ''), '');

console.log('\n=== structured customer (BILL TO order) ===');
const christ = { first_name: 'Christ', last_name: 'Kauffman', address1: '289 S Spruce St', city: 'Lykens', state: 'PA', postal_code: '17048', email: 'ck.sideline@emypeople.net' };
eq('TEST 1 current example', formatCustomerAddress(christ), ['Christ Kauffman', '289 S Spruce St', 'Lykens PA, 17048', 'ck.sideline@emypeople.net']);
const westfield = { first_name: '', last_name: '', company_name: 'Westfield Egg Farm', address1: '6353 Westville Rd', city: 'Hartly', state: 'DE', postal_code: '19953', email: 'customer@email.com' };
eq('TEST 2 company first line', formatCustomerAddress(westfield), ['Westfield Egg Farm', '6353 Westville Rd', 'Hartly DE, 19953', 'customer@email.com']);
eq('TEST 3 no email omits the line', formatCustomerAddress({ ...christ, email: '' }), ['Christ Kauffman', '289 S Spruce St', 'Lykens PA, 17048']);
eq('TEST 4 no street → no blank line', formatCustomerAddress({ ...christ, address1: '' }), ['Christ Kauffman', 'Lykens PA, 17048', 'ck.sideline@emypeople.net']);
eq('TEST 5 no state → "Lykens, 17048"', formatCustomerAddress({ ...christ, state: '' }), ['Christ Kauffman', '289 S Spruce St', 'Lykens, 17048', 'ck.sideline@emypeople.net']);
eq('address2 on its own line', formatCustomerAddress({ ...christ, address2: 'Suite 4' }), ['Christ Kauffman', '289 S Spruce St', 'Suite 4', 'Lykens PA, 17048', 'ck.sideline@emypeople.net']);
eq('includeEmail:false (DELIVERY block)', formatCustomerAddress(westfield, { includeEmail: false }), ['Westfield Egg Farm', '6353 Westville Rd', 'Hartly DE, 19953']);

console.log('\n=== email always last ===');
const lines1 = formatCustomerAddress(christ);
check('email is the final line', lines1[lines1.length - 1] === 'ck.sideline@emypeople.net', lines1);
check('address comes before email', lines1.indexOf('Lykens PA, 17048') < lines1.indexOf('ck.sideline@emypeople.net'), lines1);
check('name comes before address', lines1[0] === 'Christ Kauffman', lines1);

console.log('\n=== snapshot strings (historical billing_address) ===');
eq('multi-line old format', textAddressLines('289 S Spruce St\nLykens, PA\n17048'), ['289 S Spruce St', 'Lykens PA, 17048']);
eq('multi-line new format is idempotent', textAddressLines('289 S Spruce St\nLykens PA, 17048'), ['289 S Spruce St', 'Lykens PA, 17048']);
eq('single comma line is split', textAddressLines('2811 State Route 14, Pen Yan Ny 14527'), ['2811 State Route 14', 'Pen Yan NY, 14527']);
eq('empty snapshot → []', textAddressLines(''), []);
const header = { customerName: 'Christ Kauffman', email: 'ck.sideline@emypeople.net', billingAddress: '289 S Spruce St\nLykens, PA\n17048' };
eq('document header shape', formatCustomerAddress(header), ['Christ Kauffman', '289 S Spruce St', 'Lykens PA, 17048', 'ck.sideline@emypeople.net']);

console.log('\n=== clean output (no junk) ===');
const all = [
  ...formatCustomerAddress(christ),
  ...formatCustomerAddress(westfield),
  ...formatCustomerAddress({ name: 'X', email: 'e@x', city: 'C' }),
  ...formatCustomerAddress({ name: 'NoAddr', email: '' }),
];
const joined = all.join(' | ');
check('no "undefined"', !/undefined/.test(joined), joined);
check('no "null"', !/null/.test(joined), joined);
check('no double commas ",,"', !/,,/.test(joined), joined);
check('no empty lines', all.every(l => l && String(l).trim()), all);
check('no stranded leading/trailing punctuation', all.every(l => !/^[,\s]|[,\s]$/.test(l)), all);

console.log('\n=== static wiring (ONE formatter reused) ===');
const pdf = fs.readFileSync(path.join(FE, 'components', 'customers', 'shared', 'generateDocumentPDF.js'), 'utf8');
const cq = fs.readFileSync(path.join(FE, 'components', 'customers', 'quotes', 'CreateQuote.js'), 'utf8');
const cInv = fs.readFileSync(path.join(FE, 'components', 'customers', 'invoices', 'CreateInvoice.js'), 'utf8');
const details = fs.readFileSync(path.join(FE, 'components', 'customers', 'CustomerDetails.js'), 'utf8');
check('PDF imports the shared formatter', /import \{ formatAddressLines \} from '\.\.\/\.\.\/\.\.\/utils\/address'/.test(pdf));
check('PDF formatAddress delegates to the shared rule', /export function formatAddress\(addr\)\s*\{\s*return formatAddressLines\(addr\);/.test(pdf));
check('PDF BILL TO order: name → address → email', /out\.push\(\{ text: name, bold: true \}\);[\s\S]*opts\.address[\s\S]*opts\.email/.test(pdf));
check('CreateQuote builds the snapshot via formatCityStatePostal', /import \{ formatCityStatePostal \}/.test(cq) && /formatCityStatePostal\(cust\.city/.test(cq));
check('CreateInvoice builds the snapshot via formatCityStatePostal', /import \{ formatCityStatePostal \}/.test(cInv) && /formatCityStatePostal\(cust\.city/.test(cInv));
check('no legacy "city, state" join left in CreateQuote', !/\[cust\.city, cust\.state\]\.filter\(Boolean\)\.join\(', '\)/.test(cq));
check('no legacy "city, state" join left in CreateInvoice', !/\[cust\.city, cust\.state\]\.filter\(Boolean\)\.join\(', '\)/.test(cInv));
check('CustomerDetails uses the shared formatter', /import \{ formatAddressLines \}/.test(details) && /formatAddressLines\(customer/.test(details));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
