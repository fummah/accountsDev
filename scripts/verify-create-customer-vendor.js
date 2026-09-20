/**
 * End-to-end "Create still works" check for the redesigned Add Customer and
 * Add Vendor forms.
 *
 * The redesign was presentational, so the risk is not the layout — it is that a
 * form silently stops SENDING a field it still displays. That is exactly the
 * class of bug found in VendorCenter (company_name / address2 / country were
 * captured by the UI and then hardcoded to '' in the save handler).
 *
 * So this script does not hardcode a payload. It reads the REAL save expression
 * out of each component's source, evaluates it against a distinctive set of
 * form values, and then pushes the resulting arguments through the REAL IPC
 * handler into the REAL database — proving the whole chain:
 *
 *     component's save expression → IPC handler → model → DB row
 *
 * If someone later deletes a field from a form, or starts hardcoding one, this
 * fails. `ipcMain` is unavailable under ELECTRON_RUN_AS_NODE, so the electron
 * module is stubbed and the handlers are captured.
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/verify-create-customer-vendor.js
 *
 * Every row it creates is deleted in a `finally` block.
 */

const path = require('path');
const fs = require('fs');
const Module = require('module');

// ── stub electron BEFORE the handlers are required ──────────────────────────
const handlers = new Map();
const electronStub = {
  ipcMain: {
    handle: (channel, fn) => {
      if (handlers.has(channel)) throw new Error("Attempted to register a second handler for '" + channel + "'");
      handlers.set(channel, fn);
    },
  },
};
const originalLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return electronStub;
  return originalLoad.apply(this, arguments);
};

const realLog = console.log.bind(console);
console.log = () => {};
// Verify against a SCRATCH COPY of the company file — loading the model
// layer runs createTable() + the migration runner, which would otherwise
// rewrite the live bookkeeping database. Must come before any model require.
require('./lib/testDb.js').useScratchCopy({ label: 'verify-create-customer-vendor' });

require('../src/backend/models/index.js');
const registerIpcHandlers = require('../src/backend/handlers/ipcHandlers.js');
const dbmgr = require('../src/backend/models/dbmgr.js');
console.log = realLog;
const db = dbmgr.raw;
registerIpcHandlers();

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── the REAL frontend helpers ───────────────────────────────────────────────
// The components import these from src/utils/*.js, and the sliced save blocks
// below call deriveDisplayName() / resolveTaxRateFields(). The harness therefore
// has to supply the same functions the component would have — the real ones,
// loaded from the real modules, not stubs. (`export ` is stripped so Node can
// eval the ESM source as a plain script.)
function loadFrontendModule(rel, exportNames) {
  let src = read(rel);
  src = src.replace(/^export\s+/gm, '');
  const mod = { exports: {} };
  new Function(
    'module',
    `${src}\nmodule.exports = { ${exportNames.join(', ')} };`
  )(mod);
  return mod.exports;
}

const FE = loadFrontendModule(
  'src/frontend/src/utils/contactIdentity.js',
  ['IDENTITY_REQUIRED_MESSAGE', 'normIdentity', 'isIdentified', 'deriveDisplayName', 'firstOrCompanyValidator', 'identityRule']
);

// The ONE tax-rate rule the forms share (see utils/taxRate.js). Loaded for real
// so a change to the rule is exercised here, not just in the tax-rate suite.
const TAX = loadFrontendModule(
  'src/frontend/src/utils/taxRate.js',
  ['resolveTaxRateFields', 'taxRateLabel', 'taxRateFormValue', 'describeTaxRate']
);

// ── tiny harness ────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  [PASS] ${label}`); }
  else { failed++; console.log(`  [FAIL] ${label}\n      expected: ${e}\n      actual:   ${a}`); }
}
function ok(label, cond, detail) {
  check(label, !!cond, true);
  if (!cond && detail) console.log(`      detail: ${detail}`);
}

// ── source slicing ──────────────────────────────────────────────────────────
/** Return the text between `callee(` and its matching `)`. */
function extractArgList(src, callee) {
  const i = src.indexOf(callee + '(');
  if (i < 0) return null;
  const start = i + callee.length + 1;
  let depth = 1, j = start, quote = null;
  for (; j < src.length; j++) {
    const c = src[j];
    if (quote) {
      if (c === '\\') { j++; continue; }
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, j);
}

/** Return the text from `startMarker` up to the end of the `callee(...)` call. */
function extractBlock(src, startMarker, callee) {
  const s = src.indexOf(startMarker);
  if (s < 0) return null;
  const i = src.indexOf(callee + '(', s);
  if (i < 0) return null;
  const argStart = i + callee.length + 1;
  let depth = 1, j = argStart, quote = null;
  for (; j < src.length; j++) {
    const c = src[j];
    if (quote) {
      if (c === '\\') { j++; continue; }
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) break; }
  }
  return src.slice(s, j + 1);
}

const evalExpr = (expr, scope) =>
  new Function(...Object.keys(scope), `return (${expr});`)(...Object.values(scope));

const evalArgs = (argSrc, scope) =>
  new Function(...Object.keys(scope), `return [${argSrc}];`)(...Object.values(scope));

/**
 * How many positional arguments the real IPC handler declares (minus `event`).
 * The payload is positional, so a form that sends one argument too few silently
 * shifts every later value — the exact failure mode this suite exists to catch.
 * Deriving the expected count from the handler keeps the check honest.
 */
function handlerArity(channel) {
  const src = read('src/backend/handlers/ipcHandlers.js');
  const i = src.indexOf(`safeHandle('${channel}',`);
  if (i < 0) return null;
  const paren = src.indexOf('(', src.indexOf('async', i));
  let depth = 1, j = paren + 1, quote = null;
  for (; j < src.length; j++) {
    const c = src[j];
    if (quote) { if (c === '\\') { j++; continue; } if (c === quote) quote = null; }
    else if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) break; }
  }
  const params = src.slice(paren + 1, j).split(',').map(s => s.trim()).filter(Boolean);
  return params.length - 1; // drop `event`
}

// Run a sliced component block that ends in `const res = await window.…(…)`.
// The window stub records the arguments the component would have sent. The
// real identity helpers are merged into the scope so the block's own
// `deriveDisplayName(...)` call resolves to the real implementation.
async function runBlock(block, scope, spy) {
  const fakeWindow = { electronAPI: {
    insertCustomer: (...a) => { spy.name = 'insertCustomer'; spy.args = a; return { success: true }; },
    insertSupplier: (...a) => { spy.name = 'insertSupplier'; spy.args = a; return { success: true }; },
  } };
  const fullScope = { ...FE, ...TAX, ...scope };
  const fn = new Function(...Object.keys(fullScope), 'window', `return (async () => { ${block} })();`);
  await fn(...Object.values(fullScope), fakeWindow);
  return spy;
}

// ── distinctive form values ─────────────────────────────────────────────────
const V = {
  title: 'Mr',
  first_name: 'ZzCreateCheck',
  last_name: 'ZzLast',
  display_name: 'Zz Display Check',
  company_name: 'Zz Company Ltd',
  email: 'zz-create-check@example.invalid',
  phone_number: '(555) 111-2222',
  mobile_number: '(555) 333-4444',
  website: 'https://zz.example.invalid',
  address1: '1 Zz Street',
  address2: 'Suite Zz',
  city: 'ZzCity',
  state: 'ZzState',
  postal_code: '9999',
  zip: '9999',
  country: 'ZzCountry',
  notes: 'Zz note text',
  taxable: true,
  default_tax_rate_id: 1,
  supplier_terms: 'Net 30',
  business_number: 'ZZBIZ',
  account_number: 'ZZACC',
  expense_category: 'ZzCat',
  opening_balance: '123.45',
  vendor_type: '1099',
};
const VAT_RATES = [{ id: 1, vat_name: 'Zz VAT', vat_percentage: 15 }];

const fakeEvent = { sender: { id: 'test-sender' } };
const created = { customers: [], suppliers: [] };

function cleanup() {
  try {
    for (const id of created.customers) db.prepare('DELETE FROM customers WHERE id = ?').run(id);
    for (const id of created.suppliers) db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
  } catch (e) { console.log('  [warn] cleanup:', e.message); }
}

// ── suites ──────────────────────────────────────────────────────────────────
async function customerCenter() {
  console.log('\nAdd Customer — CustomerCenter.js\n');
  const src = read('src/frontend/src/components/customers/CustomerCenter.js');
  const block = extractBlock(src, 'const display =', 'window.electronAPI.insertCustomer');
  ok('save expression found in the component', !!block);
  if (!block) return;

  const spy = await runBlock(block, { values: V, vatRates: VAT_RATES }, {});
  check('component calls insertCustomer', spy.name, 'insertCustomer');
  check('argument count matches the handler arity',
    spy.args && spy.args.length, handlerArity('insert-customer'));

  const res = await handlers.get('insert-customer')(fakeEvent, ...spy.args);
  ok('handler reports success', res && res.success !== false, JSON.stringify(res));

  const row = db.prepare('SELECT * FROM customers WHERE email = ? ORDER BY id DESC LIMIT 1').get(V.email);
  ok('row written', !!row);
  if (!row) return;
  created.customers.push(Number(row.id));

  check('first_name', row.first_name, V.first_name);
  check('last_name', row.last_name, V.last_name);
  check('display_name', row.display_name, V.display_name);
  check('company_name', row.company_name, V.company_name);
  check('phone_number', row.phone_number, V.phone_number);
  check('mobile_number', row.mobile_number, V.mobile_number);
  check('address1', row.address1, V.address1);
  check('address2', row.address2, V.address2);
  check('city', row.city, V.city);
  check('state', row.state, V.state);
  check('postal_code', row.postal_code, V.postal_code);
  check('country', row.country, V.country);
  check('notes', row.notes, V.notes);
  check('taxable', Number(row.taxable), 1);
  check('default_tax_rate', Number(row.default_tax_rate), 15);
  check('default_tax_rate_id', Number(row.default_tax_rate_id), 1);
}

async function vendorCenter() {
  console.log('\nAdd Vendor — VendorCenter.js\n');
  const src = read('src/frontend/src/components/vendors/VendorCenter.js');
  const block = extractBlock(src, "const title = '';", 'window.electronAPI.insertSupplier');
  ok('save expression found in the component', !!block);
  if (!block) return;

  const spy = await runBlock(block, { values: V, vatRates: VAT_RATES }, {});
  check('component calls insertSupplier', spy.name, 'insertSupplier');
  check('argument count matches the handler arity',
    spy.args && spy.args.length, handlerArity('insert-supplier'));

  const res = await handlers.get('insert-supplier')(fakeEvent, ...spy.args);
  ok('handler reports success', res && res.success !== false, JSON.stringify(res));

  const row = db.prepare('SELECT * FROM suppliers WHERE email = ? ORDER BY id DESC LIMIT 1').get(V.email);
  ok('row written', !!row);
  if (!row) return;
  created.suppliers.push(Number(row.id));

  check('first_name', row.first_name, V.first_name);
  check('display_name', row.display_name, V.display_name);
  check('company_name  (was silently dropped)', row.company_name, V.company_name);
  check('address2      (was silently dropped)', row.address2, V.address2);
  check('country       (was silently dropped)', row.country, V.country);
  check('phone_number', row.phone_number, V.phone_number);
  check('address1', row.address1, V.address1);
  check('city', row.city, V.city);
  check('state', row.state, V.state);
  check('postal_code (from the form\'s ZIP field)', row.postal_code, V.zip);
  check('opening_balance', Number(row.opening_balance), 123.45);
  check('vendor_type', row.vendor_type, 'Regular');
  check('taxable', Number(row.taxable), 1);
  check('default_tax_rate', Number(row.default_tax_rate), 15);
  check('default_tax_rate_id', Number(row.default_tax_rate_id), 1);
}

async function supplierVendorList() {
  console.log('\nAdd Vendor — SupplierVendorList.js (drawer)\n');
  const src = read('src/frontend/src/components/vendors/SupplierVendorList.js');

  const displayExpr = (src.match(/const display = ([^\n]+);/) || [])[1];
  ok('display expression found', !!displayExpr);
  const argSrc = extractArgList(src, 'window.electronAPI.insertSupplier');
  ok('save argument list found', !!argSrc);
  if (!displayExpr || !argSrc) return;

  const display = evalExpr(displayExpr, { ...FE, vals: V });
  // The block only computes `display` and `tax` before the call, so both are
  // supplied here — `tax` from the REAL shared rule, not a hand-written object.
  const tax = TAX.resolveTaxRateFields(V, VAT_RATES);
  const args = evalArgs(argSrc, { ...FE, ...TAX, vals: V, display, tax, vatRates: VAT_RATES });
  check('argument count matches the handler arity', args.length, handlerArity('insert-supplier'));

  const res = await handlers.get('insert-supplier')(fakeEvent, ...args);
  ok('handler reports success', res && res.success !== false, JSON.stringify(res));

  const row = db.prepare('SELECT * FROM suppliers WHERE email = ? ORDER BY id DESC LIMIT 1').get(V.email);
  ok('row written', !!row);
  if (!row) return;
  created.suppliers.push(Number(row.id));

  check('title', row.title, V.title);
  check('first_name', row.first_name, V.first_name);
  check('last_name', row.last_name, V.last_name);
  check('display_name', row.display_name, V.display_name);
  check('company_name', row.company_name, V.company_name);
  check('phone_number', row.phone_number, V.phone_number);
  check('mobile_number', row.mobile_number, V.mobile_number);
  check('website', row.website, V.website);
  check('address1', row.address1, V.address1);
  check('address2', row.address2, V.address2);
  check('city', row.city, V.city);
  check('state', row.state, V.state);
  check('postal_code', row.postal_code, V.postal_code);
  check('country', row.country, V.country);
  check('supplier_terms', row.supplier_terms, V.supplier_terms);
  check('business_number', row.business_number, V.business_number);
  check('account_number', row.account_number, V.account_number);
  check('expense_category', row.expense_category, V.expense_category);
  check('opening_balance', Number(row.opening_balance), 123.45);
  check('vendor_type', row.vendor_type, V.vendor_type);
  check('notes', row.notes, V.notes);
  check('taxable', Number(row.taxable), 1);
  check('default_tax_rate', Number(row.default_tax_rate), 15);
  check('default_tax_rate_id', Number(row.default_tax_rate_id), 1);
}

(async () => {
  try {
    await customerCenter();
    await vendorCenter();
    await supplierVendorList();
  } catch (e) {
    failed++;
    console.log(`  [FAIL] suite threw: ${e.message}`);
  } finally {
    cleanup();
  }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
