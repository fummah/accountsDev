/**
 * verify-contact-identity.js — "First Name OR Company Name", end to end.
 *
 * THE RULE
 *   A customer or vendor must be identifiable either as a PERSON (First Name)
 *   or as a BUSINESS (Company Name). Neither is required on its own; at least
 *   one is:
 *
 *       First Name = John    Company = ''        -> valid
 *       First Name = ''      Company = Amazon    -> valid
 *       First Name = John    Company = ABC Ltd   -> valid
 *       First Name = ''      Company = ''        -> INVALID
 *
 * WHAT WENT WRONG (why this suite exists)
 *   The rule was correct in the frontend but the BACKEND HAD NONE, so the API
 *   accepted a record the UI refused. Separately, four of the five forms that
 *   carried the rule had their own copy of it, and the display-name derivation
 *   had three different formulas — two of which produced a blank name for a
 *   company-only record. This suite pins all of it down.
 *
 * HOW IT IS VERIFIED
 *   Nothing is re-implemented here. The suite loads:
 *     • the REAL frontend rule   — src/frontend/src/utils/contactIdentity.js
 *       (its `export ` keywords are stripped so it can be evaluated in Node)
 *     • the REAL backend rule    — src/backend/services/contactIdentity.js
 *     • the REAL IPC handlers    — captured by stubbing `electron`
 *     • the REAL database        — a scratch copy of the company file
 *   and then runs the SAME cases through both sides, asserting they agree.
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/verify-contact-identity.js
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
// Scratch copy — loading the model layer runs createTable() + migrations,
// which would otherwise rewrite the live bookkeeping database.
require('./lib/testDb.js').useScratchCopy({ label: 'verify-contact-identity' });

require('../src/backend/models/index.js');
const registerIpcHandlers = require('../src/backend/handlers/ipcHandlers.js');
const dbmgr = require('../src/backend/models/dbmgr.js');
console.log = realLog;
const db = dbmgr.raw;
registerIpcHandlers();

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── the two rules under test ────────────────────────────────────────────────
const BE = require('../src/backend/services/contactIdentity.js');

/** Load the frontend ESM module as a plain script so Node can evaluate it. */
function loadFrontendIdentity() {
  let src = read('src/frontend/src/utils/contactIdentity.js');
  src = src.replace(/^export\s+/gm, '');
  const mod = { exports: {} };
  const fn = new Function(
    'module',
    `${src}\nmodule.exports = { IDENTITY_REQUIRED_MESSAGE, normIdentity, isIdentified, deriveDisplayName, firstOrCompanyValidator, identityRule };`
  );
  fn(mod);
  return mod.exports;
}
const FE = loadFrontendIdentity();

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

// Strip comments before asserting that a fabricated-name fallback is gone.
// The removal was documented in a comment that NAMES the old fallback, and a
// naive `/'Unnamed'/` test then matched the explanation of the fix rather than
// a surviving fallback. Comments are not code, so remove them first.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Parameter names of a real IPC handler, minus `event`. */
function handlerParamNames(channel) {
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
  return src.slice(paren + 1, j).split(',').map(s => s.trim()).filter(Boolean).slice(1);
}

const evalArgs = (argSrc, scope) =>
  new Function(...Object.keys(scope), `return [${argSrc}];`)(...Object.values(scope));

const fakeEvent = { sender: { id: 'test-sender' } };

/** Call a real handler, aligning values by the handler's OWN parameter names. */
async function callHandler(channel, values) {
  const names = handlerParamNames(channel);
  const args = names.map(n => (n in values && values[n] !== undefined ? values[n] : ''));
  return handlers.get(channel)(fakeEvent, ...args);
}

// ── a fake antd form, just enough for the validator ─────────────────────────
const fakeForm = (vals, companyField = 'company_name') => ({
  getFieldValue: (k) => (k === companyField ? vals.company_name ?? vals.company : vals[k]),
});

/** Run the REAL frontend validator. true = the form accepts the values. */
async function frontendAccepts(vals, companyField) {
  const validator = FE.firstOrCompanyValidator(fakeForm(vals, companyField), companyField);
  try { await validator({}, vals.first_name); return true; }
  catch (_) { return false; }
}

// ── the four cases, plus whitespace-only ────────────────────────────────────
const CASES = [
  { key: 'first name only  (John / blank)',    first_name: 'John',  company_name: '',       valid: true  },
  { key: 'company only     (blank / Amazon)',  first_name: '',      company_name: 'Amazon', valid: true  },
  { key: 'both             (John / Amazon)',   first_name: 'John',  company_name: 'Amazon', valid: true  },
  { key: 'neither          (blank / blank)',   first_name: '',      company_name: '',       valid: false },
  { key: 'whitespace only  (  /   )',          first_name: '   ',   company_name: '  ',     valid: false },
];

const created = { customers: [], suppliers: [], leads: [], quotes: [] };
function cleanup() {
  try {
    for (const id of created.customers) db.prepare('DELETE FROM customers WHERE id = ?').run(id);
    for (const id of created.suppliers) db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
    for (const id of created.quotes) {
      db.prepare('DELETE FROM quote_lines WHERE quote_id = ?').run(id);
      db.prepare('DELETE FROM quotes WHERE id = ?').run(id);
    }
    for (const id of created.leads) db.prepare('DELETE FROM crm_leads WHERE id = ?').run(id);
  } catch (e) { console.log('  [warn] cleanup:', e.message); }
}

// ════════════════════════════════════════════════════════════════════════════
// 1. The two rules agree — same verdict, same message, same display name
// ════════════════════════════════════════════════════════════════════════════
function rulesAgree() {
  console.log('\n1. Frontend rule vs backend rule\n');

  check('the rejection message is identical on both sides',
    FE.IDENTITY_REQUIRED_MESSAGE, BE.IDENTITY_ERROR);

  for (const c of CASES) {
    const fe = FE.isIdentified(c);
    const be = BE.isIdentified(c);
    check(`isIdentified agrees — ${c.key}`, fe, be);
    check(`  … and is ${c.valid ? 'valid' : 'INVALID'}`, be, c.valid);
  }

  // The display-name matrix. If either side changes its priority order, this
  // fails on the first case that differs.
  const DN = [
    { display_name: '',        first_name: 'John', last_name: 'Doe',  company_name: ''       },
    { display_name: '',        first_name: '',     last_name: '',     company_name: 'Amazon' },
    { display_name: '',        first_name: 'John', last_name: 'Doe',  company_name: 'Amazon' },
    { display_name: 'Override',first_name: 'John', last_name: 'Doe',  company_name: 'Amazon' },
    { display_name: '   ',     first_name: 'John', last_name: 'Doe',  company_name: ''       },
    { display_name: '',        first_name: ' John ', last_name: ' Doe ', company_name: ''    },
    { display_name: '',        first_name: 'John', last_name: '',     company_name: 'Amazon' },
    { display_name: '',        first_name: '   ',  last_name: '',     company_name: 'Amazon' },
    { display_name: '',        first_name: '',     last_name: '',     company_name: ''       },
  ];
  for (const c of DN) {
    const fe = FE.deriveDisplayName(c);
    const be = BE.deriveDisplayName(c);
    check(`deriveDisplayName agrees — ${JSON.stringify([c.display_name, c.first_name, c.last_name, c.company_name])}`, fe, be);
  }

  // The two behaviours the brief calls out by name.
  check('company-only derives from the company',
    BE.deriveDisplayName({ display_name: '', first_name: '', last_name: '', company_name: 'Amazon' }), 'Amazon');
  check('an individual still derives from the personal name',
    BE.deriveDisplayName({ display_name: '', first_name: 'John', last_name: 'Doe', company_name: '' }), 'John Doe');
  check('an explicit display name always wins',
    BE.deriveDisplayName({ display_name: 'Amazon UK', first_name: 'John', last_name: 'Doe', company_name: 'Amazon' }), 'Amazon UK');
}

// ════════════════════════════════════════════════════════════════════════════
// 2. The frontend validator — the four cases
// ════════════════════════════════════════════════════════════════════════════
async function frontendValidator() {
  console.log('\n2. Frontend validator (antd rule)\n');
  for (const c of CASES) {
    const accepted = await frontendAccepts(c);
    check(`form ${c.valid ? 'ACCEPTS' : 'REJECTS'} — ${c.key}`, accepted, c.valid);
  }
  // The one legacy form that names the company field `company`.
  const acceptedAlias = await frontendAccepts({ first_name: '', company: 'Amazon' }, 'company');
  check('form ACCEPTS — company-only via the aliased `company` field (EnterBill)', acceptedAlias, true);
  const rejectedAlias = await frontendAccepts({ first_name: '', company: '' }, 'company');
  check('form REJECTS — neither, via the aliased `company` field', rejectedAlias, false);
}

// ════════════════════════════════════════════════════════════════════════════
// 3. The backend handlers — the four cases, customer and vendor
// ════════════════════════════════════════════════════════════════════════════
async function backendCustomer() {
  console.log('\n3a. Customer API — insert-customer\n');
  for (const c of CASES) {
    const email = `zz-identity-cust-${c.valid ? 'ok' : 'no'}-${c.first_name.length}-${c.company_name.length}@example.invalid`;
    const res = await callHandler('insert-customer', {
      title: '', first_name: c.first_name, last_name: '', email, display_name: '',
      company_name: c.company_name, entered_by: 'test', opening_balance: 0, taxable: 1,
    });
    if (c.valid) {
      check(`API ACCEPTS — ${c.key}`, !!(res && res.success), true);
      const row = db.prepare('SELECT * FROM customers WHERE email = ? ORDER BY id DESC LIMIT 1').get(email);
      ok(`  row written — ${c.key}`, !!row, JSON.stringify(res));
      if (row) {
        created.customers.push(Number(row.id));
        check('  first_name persisted', row.first_name, c.first_name.trim());
        check('  company_name persisted', row.company_name, c.company_name.trim());
        const expectedDn = BE.deriveDisplayName(c);
        check('  display_name derived', row.display_name, expectedDn);
      }
    } else {
      check(`API REFUSES — ${c.key}`, !!(res && res.error), true);
      check('  with the shared message', res && res.error, BE.IDENTITY_ERROR);
      const row = db.prepare('SELECT * FROM customers WHERE email = ?').get(email);
      check('  nothing written', row, undefined);
    }
  }
}

async function backendVendor() {
  console.log('\n3b. Vendor API — insert-supplier\n');
  for (const c of CASES) {
    const email = `zz-identity-supp-${c.valid ? 'ok' : 'no'}-${c.first_name.length}-${c.company_name.length}@example.invalid`;
    const res = await callHandler('insert-supplier', {
      title: '', first_name: c.first_name, last_name: '', email, display_name: '',
      company_name: c.company_name, entered_by: 'test', opening_balance: 0,
    });
    if (c.valid) {
      check(`API ACCEPTS — ${c.key}`, !!(res && res.success), true);
      const row = db.prepare('SELECT * FROM suppliers WHERE email = ? ORDER BY id DESC LIMIT 1').get(email);
      ok(`  row written — ${c.key}`, !!row, JSON.stringify(res));
      if (row) {
        created.suppliers.push(Number(row.id));
        check('  first_name persisted', row.first_name, c.first_name.trim());
        check('  company_name persisted', row.company_name, c.company_name.trim());
        const expectedDn = BE.deriveDisplayName(c);
        check('  display_name derived', row.display_name, expectedDn);
      }
    } else {
      check(`API REFUSES — ${c.key}`, !!(res && res.error), true);
      check('  with the shared message', res && res.error, BE.IDENTITY_ERROR);
      const row = db.prepare('SELECT * FROM suppliers WHERE email = ?').get(email);
      check('  nothing written', row, undefined);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 4. Reopen a saved company-only record
// ════════════════════════════════════════════════════════════════════════════
async function reopenCompanyOnly() {
  console.log('\n4. Reopen a saved company-only record\n');

  const cEmail = 'zz-reopen-cust@example.invalid';
  await callHandler('insert-customer', {
    title: '', first_name: '', last_name: '', email: cEmail, display_name: '',
    company_name: 'Amazon', entered_by: 'test', opening_balance: 0, taxable: 1,
  });
  const cRow = db.prepare('SELECT * FROM customers WHERE email = ? ORDER BY id DESC LIMIT 1').get(cEmail);
  ok('customer row exists', !!cRow);
  if (cRow) {
    created.customers.push(Number(cRow.id));
    check('customer first_name is blank, not a fabricated name', cRow.first_name, '');
    check('customer company_name', cRow.company_name, 'Amazon');
    check('customer display_name', cRow.display_name, 'Amazon');
  }

  const sEmail = 'zz-reopen-supp@example.invalid';
  await callHandler('insert-supplier', {
    title: '', first_name: '', last_name: '', email: sEmail, display_name: '',
    company_name: 'Amazon', entered_by: 'test', opening_balance: 0,
  });
  const sRow = db.prepare('SELECT * FROM suppliers WHERE email = ? ORDER BY id DESC LIMIT 1').get(sEmail);
  ok('vendor row exists', !!sRow);
  if (sRow) {
    created.suppliers.push(Number(sRow.id));
    check('vendor first_name is blank, not a fabricated name', sRow.first_name, '');
    check('vendor company_name', sRow.company_name, 'Amazon');
    check('vendor display_name', sRow.display_name, 'Amazon');

    // …and read back through the model's own read path.
    const viaModel = await handlers.get('get-singleSupplier')(fakeEvent, Number(sRow.id));
    ok('get-singleSupplier returns the row', !!viaModel);
    if (viaModel) {
      check('  read-back company_name', viaModel.company_name, 'Amazon');
      check('  read-back display_name', viaModel.display_name, 'Amazon');
      check('  read-back first_name', viaModel.first_name, '');
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 5. The update path
// ════════════════════════════════════════════════════════════════════════════
async function updatePaths() {
  console.log('\n5. Edit path\n');

  // ── customer: company-only, partial edit ──────────────────────────────────
  const cEmail = 'zz-update-cust@example.invalid';
  await callHandler('insert-customer', {
    title: '', first_name: '', last_name: '', email: cEmail, display_name: '',
    company_name: 'Amazon', entered_by: 'test', opening_balance: 0, taxable: 1,
  });
  const c = db.prepare('SELECT * FROM customers WHERE email = ? ORDER BY id DESC LIMIT 1').get(cEmail);
  ok('company-only customer created', !!c);
  if (c) {
    created.customers.push(Number(c.id));

    // A partial edit (address only) must save, and must NOT fabricate a name.
    const res = await handlers.get('updatecustomer')(fakeEvent, { id: c.id, address1: '1 Test Street' });
    ok('partial update (address only) succeeds', !(res && res.error), JSON.stringify(res));
    const after = db.prepare('SELECT * FROM customers WHERE id = ?').get(c.id);
    check('  address1 updated', after.address1, '1 Test Street');
    check('  first_name NOT fabricated from the display name', after.first_name, '');
    check('  company_name preserved', after.company_name, 'Amazon');
    check('  display_name preserved', after.display_name, 'Amazon');

    // Blanking BOTH fields must be refused.
    const bad = await handlers.get('updatecustomer')(fakeEvent, { id: c.id, first_name: '', company_name: '' });
    check('editing a company-only customer to neither is REFUSED', bad && bad.error, BE.IDENTITY_ERROR);
    const still = db.prepare('SELECT * FROM customers WHERE id = ?').get(c.id);
    check('  the row is unchanged', [still.first_name, still.company_name], ['', 'Amazon']);
  }

  // ── vendor: company-only, partial edit ───────────────────────────────────
  const sEmail = 'zz-update-supp@example.invalid';
  await callHandler('insert-supplier', {
    title: '', first_name: '', last_name: '', email: sEmail, display_name: '',
    company_name: 'Amazon', entered_by: 'test', opening_balance: 0,
  });
  const s = db.prepare('SELECT * FROM suppliers WHERE email = ? ORDER BY id DESC LIMIT 1').get(sEmail);
  ok('company-only vendor created', !!s);
  if (s) {
    created.suppliers.push(Number(s.id));

    // Regression: this used to throw NOT NULL constraint failed: suppliers.title,
    // because updateSupplier bound every column from the payload with no merge.
    const res = await handlers.get('updatesupplier')(fakeEvent, { id: s.id, address1: '1 Test Street' });
    ok('partial update (address only) succeeds — no NOT NULL crash', !(res && res.error), JSON.stringify(res));
    const after = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(s.id);
    check('  address1 updated', after.address1, '1 Test Street');
    check('  title preserved (the column that used to crash)', after.title, '');
    check('  first_name NOT fabricated', after.first_name, '');
    check('  company_name preserved', after.company_name, 'Amazon');
    check('  display_name preserved', after.display_name, 'Amazon');

    // Blanking BOTH fields must be refused.
    const bad = await handlers.get('updatesupplier')(fakeEvent, { id: s.id, first_name: '', company_name: '' });
    check('editing a company-only vendor to neither is REFUSED', bad && bad.error, BE.IDENTITY_ERROR);
    const still = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(s.id);
    check('  the row is unchanged', [still.first_name, still.company_name], ['', 'Amazon']);
  }

  // ── an individual is unaffected by all of the above ───────────────────────
  const pEmail = 'zz-update-person@example.invalid';
  await callHandler('insert-supplier', {
    title: 'Mr', first_name: 'John', last_name: 'Doe', email: pEmail, display_name: '',
    company_name: '', entered_by: 'test', opening_balance: 0,
  });
  const p = db.prepare('SELECT * FROM suppliers WHERE email = ? ORDER BY id DESC LIMIT 1').get(pEmail);
  ok('individual vendor created', !!p);
  if (p) {
    created.suppliers.push(Number(p.id));
    check('individual display_name derives from the personal name', p.display_name, 'John Doe');
    const res = await handlers.get('updatesupplier')(fakeEvent, { id: p.id, city: 'Cape Town' });
    ok('partial update of an individual succeeds', !(res && res.error), JSON.stringify(res));
    const after = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(p.id);
    check('  city updated', after.city, 'Cape Town');
    check('  display_name unchanged', after.display_name, 'John Doe');
    check('  company_name still blank', after.company_name, '');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 6. Converting a lead writes a customer under the SAME rule
// ════════════════════════════════════════════════════════════════════════════
// Conversion INSERTs straight into `customers`, so it is a customer-writing
// path like any other. It used to have a private rule that split the lead's
// single `name` into first/last and fell back to 'Unknown', which turned a
// company-only lead into a person called "Amazon".
async function leadConversion() {
  console.log('\n6. Lead -> customer conversion\n');
  const CRM = require('../src/backend/models/crm.js');

  const cases = [
    { key: 'company only', lead: { company_name: 'Amazon' },
      first_name: '', company_name: 'Amazon', display_name: 'Amazon' },
    { key: 'person only', lead: { first_name: 'John', last_name: 'Doe' },
      first_name: 'John', company_name: '', display_name: 'John Doe' },
    { key: 'both', lead: { first_name: 'John', last_name: 'Doe', company_name: 'ABC Services' },
      first_name: 'John', company_name: 'ABC Services', display_name: 'John Doe' },
  ];

  for (const c of cases) {
    const lead = CRM.createLead({ ...c.lead, email: `zz-conv-${c.key.replace(/\s/g, '-')}@example.invalid` });
    ok(`lead created — ${c.key}`, lead && lead.success, JSON.stringify(lead));
    if (!lead || !lead.success) continue;
    created.leads.push(Number(lead.id));

    const conv = CRM.convertToCustomer(lead.id, {});
    ok(`conversion succeeded — ${c.key}`, conv && conv.success, JSON.stringify(conv));
    if (!conv || !conv.success) continue;
    created.customers.push(Number(conv.customerId));

    const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(conv.customerId);
    ok(`customer written — ${c.key}`, !!row);
    if (!row) continue;
    check(`  first_name — ${c.key}`, row.first_name, c.first_name);
    check(`  company_name — ${c.key}`, row.company_name, c.company_name);
    check(`  display_name — ${c.key}`, row.display_name, c.display_name);
    ok(`  no fabricated name ("Unknown"/"Unnamed") — ${c.key}`,
      !/^(Unknown|Unnamed)$/i.test(String(row.first_name || '').trim()), row.first_name);
  }

  // There is a SECOND auto-conversion path: creating a quote for a lead
  // converts it. Same table, same rule — it had the same bug.
  console.log('');
  const qLead = CRM.createLead({
    company_name: 'eBay',
    email: `zz-conv-quote-${Date.now()}@example.invalid`,
  });
  ok('quote-path: lead created', qLead && qLead.success, JSON.stringify(qLead));
  if (qLead && qLead.success) {
    created.leads.push(Number(qLead.id));
    const qres = CRM.createQuoteForLead(qLead.id, {}, []);
    ok('quote-path: createQuoteForLead succeeded', qres && qres.success !== false, JSON.stringify(qres));
    if (qres && qres.quoteId) created.quotes.push(Number(qres.quoteId));

    const custId = qres && qres.customerId;
    ok('quote-path: lead auto-converted to a customer', !!custId, JSON.stringify(qres));
    if (custId) {
      created.customers.push(Number(custId));
      const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(custId);
      ok('quote-path: customer written', !!row);
      if (row) {
        check('  first_name — quote path', row.first_name, '');
        check('  company_name — quote path', row.company_name, 'eBay');
        check('  display_name — quote path', row.display_name, 'eBay');
        ok('  no fabricated name — quote path',
          !/^(Unknown|Unnamed)$/i.test(String(row.first_name || '').trim()), row.first_name);
      }
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 7. CSV import — the last contact write path
// ════════════════════════════════════════════════════════════════════════════
// Import is registered from main.js, not from ipcHandlers, so it has to be
// required explicitly — and its module exports a `register()` function rather
// than registering on require (main.js calls it the same way). It goes through
// the models, so it inherits the rule — but it also had its own name-splitting
// that turned a Company into a person.
async function csvImport() {
  console.log('\n7. CSV import\n');
  require('../src/backend/handlers/importHandlers.js')();

  const stamp = Date.now();

  // ── a COMPANY row: Company populated, no First/Last ────────────────────────
  const cEmail = `zz-import-cust-${stamp}@example.invalid`;
  const cRes = await handlers.get('import-customers-csv')(
    fakeEvent, `Company,Main Email\nAmazon,${cEmail}\n`, {});
  ok('customer import succeeded', cRes && cRes.success, JSON.stringify(cRes));
  check('  one customer inserted', cRes && cRes.inserted, 1);
  const cRow = db.prepare('SELECT * FROM customers WHERE email = ?').get(cEmail);
  ok('  customer row written', !!cRow);
  if (cRow) {
    created.customers.push(Number(cRow.id));
    check('  first_name stays blank (not a split of the company)', cRow.first_name, '');
    check('  company_name', cRow.company_name, 'Amazon');
    check('  display_name', cRow.display_name, 'Amazon');
  }

  // ── a PERSON row: single "Customer" column, no Company ────────────────────
  const pEmail = `zz-import-person-${stamp}@example.invalid`;
  const pRes = await handlers.get('import-customers-csv')(
    fakeEvent, `Customer,Main Email\nJohn Smith,${pEmail}\n`, {});
  ok('person import succeeded', pRes && pRes.success, JSON.stringify(pRes));
  const pRow = db.prepare('SELECT * FROM customers WHERE email = ?').get(pEmail);
  ok('  person row written', !!pRow);
  if (pRow) {
    created.customers.push(Number(pRow.id));
    check('  first_name — the legacy split is preserved for a person', pRow.first_name, 'John');
    check('  last_name — the legacy split is preserved for a person', pRow.last_name, 'Smith');
  }

  // ── a CONTACT AT A COMPANY: distinct Customer and Company values ──────────
  const bEmail = `zz-import-both-${stamp}@example.invalid`;
  const bRes = await handlers.get('import-customers-csv')(
    fakeEvent, `Customer,Company,Main Email\nJohn Smith,Acme Ltd,${bEmail}\n`, {});
  ok('contact-at-company import succeeded', bRes && bRes.success, JSON.stringify(bRes));
  const bRow = db.prepare('SELECT * FROM customers WHERE email = ?').get(bEmail);
  ok('  row written', !!bRow);
  if (bRow) {
    created.customers.push(Number(bRow.id));
    check('  first_name — a distinct Customer name is still split', bRow.first_name, 'John');
    check('  company_name', bRow.company_name, 'Acme Ltd');
  }

  // ── a VENDOR row: Company populated, no Vendor/First/Last ─────────────────
  const sEmail = `zz-import-supp-${stamp}@example.invalid`;
  const sRes = await handlers.get('import-suppliers-csv')(
    fakeEvent, `Company,Email\nAmazon,${sEmail}\n`, {});
  ok('vendor import succeeded', sRes && sRes.success, JSON.stringify(sRes));
  const sRow = db.prepare('SELECT * FROM suppliers WHERE email = ?').get(sEmail);
  ok('  vendor row written', !!sRow);
  if (sRow) {
    created.suppliers.push(Number(sRow.id));
    check('  first_name stays blank (not a split of the company)', sRow.first_name, '');
    check('  company_name', sRow.company_name, 'Amazon');
    check('  display_name', sRow.display_name, 'Amazon');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 8. The forms actually use the shared rule (source assertions)
// ════════════════════════════════════════════════════════════════════════════
function sourceAssertions() {
  console.log('\n6. The UI uses the one rule\n');

  const identityForms = [
    'src/frontend/src/components/customers/shared/CustomerContactFields.js',
    'src/frontend/src/components/vendors/VendorCenter.js',
    'src/frontend/src/components/vendors/SupplierVendorList.js',
    'src/frontend/src/components/vendors/bills/EnterBill.js',
    'src/frontend/src/components/Inner/Customers/AddCustomer/index.js',
  ];

  for (const rel of identityForms) {
    const src = read(rel);
    ok(`${path.basename(rel)} uses the shared rule`, /identityRule|getContactRules/.test(src));
    ok(`${path.basename(rel)} renders the shared note`, /ContactIdentityNote/.test(src));
  }

  // No form may carry its own copy of the rule or its own wording again.
  const srcFiles = identityForms.map(read).join('\n');
  ok('no inline copy of the validator survives',
    !/getFieldValue\('company_name'\)\s*\|\|/.test(srcFiles));
  ok('no stale wording survives ("Enter a first name or company name")',
    !/Enter a first name or company name/.test(srcFiles));
  ok('no stale wording survives ("Enter a vendor name or company name")',
    !/Enter a vendor name or company name/.test(srcFiles));

  // The fabricated-name fallbacks that produced blank/incorrect display names.
  ok("SupplierVendorList no longer fabricates 'Unnamed'",
    !/'Unnamed'/.test(stripComments(read('src/frontend/src/components/vendors/SupplierVendorList.js'))));
  ok("EnterBill no longer fabricates 'New Supplier'",
    !/'New Supplier'/.test(stripComments(read('src/frontend/src/components/vendors/bills/EnterBill.js'))));
  ok('VendorCenter derives the display name from the shared rule',
    /display_name = deriveDisplayName\(/.test(read('src/frontend/src/components/vendors/VendorCenter.js')));

  // No customer/vendor form may carry its OWN display-name derivation with a
  // placeholder fallback. The backend honours an explicit display_name verbatim,
  // so a placeholder a form sends is persisted as the customer's real name —
  // which is how a company-only record could end up called "New Customer".
  const displayForms = [
    'src/frontend/src/components/customers/invoices/CreateInvoice.js',
    'src/frontend/src/components/customers/quotes/CreateQuote.js',
    'src/frontend/src/components/vendors/VendorCenter.js',
    'src/frontend/src/components/vendors/SupplierVendorList.js',
    'src/frontend/src/components/vendors/bills/EnterBill.js',
  ];
  for (const rel of displayForms) {
    const code = stripComments(read(rel));
    ok(`${path.basename(rel)} has no placeholder display-name fallback`,
      !/'New Customer'|'New Supplier'|'Unnamed'/.test(code));
  }

  // No misleading `required` marker on a customer/vendor First Name field.
  const requiredFirst = srcFiles.match(/name="first_name"[^>]*required:\s*true/g) || [];
  check('no customer/vendor First Name field carries `required: true`', requiredFirst.length, 0);

  // The note must appear once per form. CustomerContactFields has two mutually
  // exclusive layout branches, so it legitimately contains two.
  const EXPECTED_NOTES = { 'CustomerContactFields.js': 3 };
  for (const rel of identityForms) {
    const base = path.basename(rel);
    const n = (read(rel).match(/<ContactIdentityNote/g) || []).length;
    check(`${base} renders the note (${EXPECTED_NOTES[base] || 1}x)`, n, EXPECTED_NOTES[base] || 1);
  }

  // Regression: EnterBill used to pass 26 positional args to a 28-parameter
  // handler, which shifted the street address into `website`.
  const ebSrc = read('src/frontend/src/components/vendors/bills/EnterBill.js');
  const ebArgs = extractArgList(ebSrc, 'window.electronAPI.insertSupplier?.');
  ok('EnterBill save argument list found', !!ebArgs);
  if (ebArgs) {
    const vals = { first_name: 'John', last_name: 'Doe', company: 'Amazon', address1: '1 Test Street' };
    const display = FE.deriveDisplayName({ first_name: 'John', last_name: 'Doe', company_name: 'Amazon' });
    const args = evalArgs(ebArgs, { vals, display });
    const names = handlerParamNames('insert-supplier');
    check('EnterBill passes one argument per handler parameter', args.length, names.length);
    check('  … and the street address lands in the address1 slot, not `website`',
      args[names.indexOf('address1')], '1 Test Street');
    check('  … and the company name lands in company_name', args[names.indexOf('company_name')], 'Amazon');
  }
}

// ════════════════════════════════════════════════════════════════════════════
(async () => {
  try {
    rulesAgree();
    await frontendValidator();
    await backendCustomer();
    await backendVendor();
    await reopenCompanyOnly();
    await updatePaths();
    await leadConversion();
    await csvImport();
    sourceAssertions();
  } catch (e) {
    failed++;
    console.log(`  [FAIL] suite threw: ${e.message}\n${e.stack}`);
  } finally {
    cleanup();
  }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
