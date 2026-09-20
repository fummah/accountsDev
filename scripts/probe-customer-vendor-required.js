/**
 * PROBE (read-only, scratch DB) — what actually happens for the four
 * First-Name/Company combinations, through the REAL validator and the REAL
 * IPC handlers.
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/probe-customer-vendor-required.js
 */
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const Module = require('module');

const handlers = new Map();
const electronStub = {
  ipcMain: { handle: (c, fn) => handlers.set(c, fn) },
};
const originalLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return electronStub;
  return originalLoad.apply(this, arguments);
};

const realLog = console.log.bind(console);
console.log = () => {};
require('./lib/testDb.js').useScratchCopy({ label: 'probe-cust-vendor-required' });
require('../src/backend/models/index.js');
const registerIpcHandlers = require('../src/backend/handlers/ipcHandlers.js');
const dbmgr = require('../src/backend/models/dbmgr.js');
console.log = realLog;
const db = dbmgr.raw;
registerIpcHandlers();

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── the REAL frontend validator, loaded from the shared module ──────────────
// It used to be sliced out of customers/shared/customerValidation.js, but that
// file now only RE-EXPORTS the rule — the single definition moved to
// src/utils/contactIdentity.js. Slicing a re-export produced an empty function
// body, so this probe threw `firstOrCompanyValidator is not defined`. Load the
// real module instead. (`export ` is stripped so Node can eval the ESM source.)
function loadFrontendIdentity() {
  let src = read('src/frontend/src/utils/contactIdentity.js');
  src = src.replace(/^export\s+/gm, '');
  const mod = { exports: {} };
  new Function(
    'module',
    `${src}\nmodule.exports = { IDENTITY_REQUIRED_MESSAGE, normIdentity, isIdentified, deriveDisplayName, firstOrCompanyValidator, identityRule };`
  )(mod);
  return mod.exports;
}
const FE = loadFrontendIdentity();
const validator = FE.firstOrCompanyValidator;

const fakeForm = (vals) => ({ getFieldValue: (k) => vals[k] });
const runValidator = (vals) => validator(fakeForm(vals))({}, vals.first_name)
  .then(() => 'ACCEPT').catch(e => 'REJECT: ' + e.message);

// ── the REAL save expressions ───────────────────────────────────────────────
function extractArgList(src, callee) {
  const i = src.indexOf(callee + '(');
  if (i < 0) return null;
  const start = i + callee.length + 1;
  let depth = 1, j = start, quote = null;
  for (; j < src.length; j++) {
    const c = src[j];
    if (quote) { if (c === '\\') { j++; continue; } if (c === quote) quote = null; }
    else if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, j);
}
function extractBlock(src, startMarker, callee) {
  const s = src.indexOf(startMarker);
  if (s < 0) return null;
  const i = src.indexOf(callee + '(', s);
  if (i < 0) return null;
  const argStart = i + callee.length + 1;
  let depth = 1, j = argStart, quote = null;
  for (; j < src.length; j++) {
    const c = src[j];
    if (quote) { if (c === '\\') { j++; continue; } if (c === quote) quote = null; }
    else if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) break; }
  }
  return src.slice(s, j + 1);
}

async function runBlock(block, scope) {
  const spy = {};
  const fakeWindow = { electronAPI: {
    insertCustomer: (...a) => { spy.name = 'insertCustomer'; spy.args = a; return { success: true }; },
    insertSupplier: (...a) => { spy.name = 'insertSupplier'; spy.args = a; return { success: true }; },
  } };
  const fullScope = { ...FE, ...scope };
  const fn = new Function(...Object.keys(fullScope), 'window', `return (async () => { ${block} })();`);
  await fn(...Object.values(fullScope), fakeWindow);
  return spy;
}

const CASES = [
  { label: 'company only  ', first_name: '',        last_name: '',      company_name: 'Amazon' },
  { label: 'first only    ', first_name: 'John',    last_name: '',      company_name: '' },
  { label: 'both          ', first_name: 'John',    last_name: 'Smith', company_name: 'ABC Services' },
  { label: 'neither       ', first_name: '',        last_name: '',      company_name: '' },
];

const CC = read('src/frontend/src/components/customers/CustomerCenter.js');
const VC = read('src/frontend/src/components/vendors/VendorCenter.js');
const SV = read('src/frontend/src/components/vendors/SupplierVendorList.js');
const ccBlock = extractBlock(CC, 'const display =', 'window.electronAPI.insertCustomer');
const vcBlock = extractBlock(VC, "const title = '';", 'window.electronAPI.insertSupplier');
const svArgs = extractArgList(SV, 'window.electronAPI.insertSupplier');
const svDisplay = (SV.match(/const display = ([^\n]+);/) || [])[1];

const fakeEvent = { sender: { id: 'probe' } };
const made = { customers: [], suppliers: [] };

(async () => {
  console.log('\n=== A. FRONTEND VALIDATOR (firstOrCompanyValidator) ===\n');
  for (const c of CASES) {
    const ui = await runValidator(c);
    console.log(`  ${c.label} first=${JSON.stringify(c.first_name).padEnd(7)} company=${JSON.stringify(c.company_name).padEnd(16)} -> ${ui}`);
  }

  console.log('\n=== B. CUSTOMER: real save expression -> real insert-customer handler -> DB ===\n');
  for (const c of CASES) {
    const vals = { ...c, display_name: '', email: `probe-c-${c.label.trim()}@example.invalid`, taxable: true };
    const spy = await runBlock(ccBlock, { values: vals, vatRates: [] });
    const res = await handlers.get('insert-customer')(fakeEvent, ...spy.args);
    const row = db.prepare('SELECT * FROM customers WHERE email = ? ORDER BY id DESC LIMIT 1').get(vals.email);
    if (row) made.customers.push(Number(row.id));
    console.log(`  ${c.label} handler=${res && res.success ? 'SUCCESS' : 'ERROR ' + JSON.stringify(res)}`);
    console.log(`             stored first_name=${JSON.stringify(row && row.first_name)} last_name=${JSON.stringify(row && row.last_name)} company_name=${JSON.stringify(row && row.company_name)} display_name=${JSON.stringify(row && row.display_name)}`);
  }

  console.log('\n=== C. VENDOR (VendorCenter): real save expression -> insert-supplier -> DB ===\n');
  for (const c of CASES) {
    const vals = { ...c, display_name: '', email: `probe-v-${c.label.trim()}@example.invalid` };
    const spy = await runBlock(vcBlock, { values: vals });
    const res = await handlers.get('insert-supplier')(fakeEvent, ...spy.args);
    const row = db.prepare('SELECT * FROM suppliers WHERE email = ? ORDER BY id DESC LIMIT 1').get(vals.email);
    if (row) made.suppliers.push(Number(row.id));
    console.log(`  ${c.label} handler=${res && res.success ? 'SUCCESS' : 'ERROR ' + JSON.stringify(res)}`);
    console.log(`             stored first_name=${JSON.stringify(row && row.first_name)} last_name=${JSON.stringify(row && row.last_name)} company_name=${JSON.stringify(row && row.company_name)} display_name=${JSON.stringify(row && row.display_name)}`);
  }

  console.log('\n=== D. VENDOR (SupplierVendorList drawer) ===\n');
  for (const c of CASES) {
    const vals = { ...c, display_name: '', email: `probe-s-${c.label.trim()}@example.invalid` };
    const display = new Function('vals', ...Object.keys(FE), `return (${svDisplay});`)(vals, ...Object.values(FE));
    const args = new Function('vals', 'display', ...Object.keys(FE), `return [${svArgs}];`)(vals, display, ...Object.values(FE));
    const res = await handlers.get('insert-supplier')(fakeEvent, ...args);
    const row = db.prepare('SELECT * FROM suppliers WHERE email = ? ORDER BY id DESC LIMIT 1').get(vals.email);
    if (row) made.suppliers.push(Number(row.id));
    console.log(`  ${c.label} handler=${res && res.success ? 'SUCCESS' : 'ERROR ' + JSON.stringify(res)}`);
    console.log(`             stored first_name=${JSON.stringify(row && row.first_name)} company_name=${JSON.stringify(row && row.company_name)} display_name=${JSON.stringify(row && row.display_name)}`);
  }

  console.log('\n=== E. UPDATE PATH: does an edit preserve a company-only record? ===\n');
  const cid = made.customers[0];
  if (cid) {
    const before = db.prepare('SELECT * FROM customers WHERE id = ?').get(cid);
    console.log(`  before: first_name=${JSON.stringify(before.first_name)} last_name=${JSON.stringify(before.last_name)} company_name=${JSON.stringify(before.company_name)} display_name=${JSON.stringify(before.display_name)}`);
    const upd = await handlers.get('updatecustomer')(fakeEvent, { id: cid, first_name: '', last_name: '', company_name: 'Amazon', display_name: 'Amazon', email: before.email });
    const after = db.prepare('SELECT * FROM customers WHERE id = ?').get(cid);
    console.log(`  updatecustomer -> ${upd && upd.success ? 'SUCCESS' : JSON.stringify(upd)}`);
    console.log(`  after:  first_name=${JSON.stringify(after.first_name)} last_name=${JSON.stringify(after.last_name)} company_name=${JSON.stringify(after.company_name)} display_name=${JSON.stringify(after.display_name)}`);
    // A partial edit that sends ONLY the address must not invent a name.
    const upd2 = await handlers.get('updatecustomer')(fakeEvent, { id: cid, address1: '1 New Street' });
    const after2 = db.prepare('SELECT * FROM customers WHERE id = ?').get(cid);
    console.log(`  partial (address only) -> ${upd2 && upd2.success ? 'SUCCESS' : JSON.stringify(upd2)}`);
    console.log(`  after:  first_name=${JSON.stringify(after2.first_name)} last_name=${JSON.stringify(after2.last_name)} company_name=${JSON.stringify(after2.company_name)}`);
  }

  const sid = made.suppliers[0];
  if (sid) {
    const before = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(sid);
    console.log(`\n  supplier before: first_name=${JSON.stringify(before.first_name)} company_name=${JSON.stringify(before.company_name)} display_name=${JSON.stringify(before.display_name)}`);
    const upd = await handlers.get('updatesupplier')(fakeEvent, { id: sid, first_name: '', company_name: 'Amazon', display_name: 'Amazon', email: before.email });
    const after = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(sid);
    console.log(`  updatesupplier -> ${upd && upd.success ? 'SUCCESS' : JSON.stringify(upd)}`);
    console.log(`  after:  first_name=${JSON.stringify(after.first_name)} company_name=${JSON.stringify(after.company_name)} display_name=${JSON.stringify(after.display_name)}`);
    const upd2 = await handlers.get('updatesupplier')(fakeEvent, { id: sid, address1: '1 New Street' });
    const after2 = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(sid);
    console.log(`  partial (address only) -> ${upd2 && upd2.success ? 'SUCCESS' : JSON.stringify(upd2)}`);
    console.log(`  after:  first_name=${JSON.stringify(after2.first_name)} company_name=${JSON.stringify(after2.company_name)} display_name=${JSON.stringify(after2.display_name)}`);
  }

  try {
    for (const id of made.customers) db.prepare('DELETE FROM customers WHERE id = ?').run(id);
    for (const id of made.suppliers) db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
  } catch (e) { console.log('  [warn] cleanup:', e.message); }
  console.log('\nprobe complete (scratch DB only; every row removed)\n');
})();
