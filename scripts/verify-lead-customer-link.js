/**
 * Verification for "CRM → Leads → New Lead" (existing-customer linking,
 * from-scratch creation, shared contact fields/validation, Customer ↔ Leads).
 *
 * Run with the repo's Electron binary in plain-node mode (better-sqlite3 is
 * built for Electron's ABI):
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/verify-lead-customer-link.js
 *
 * The script exercises the REAL models against the REAL database and removes
 * every record it creates in a `finally` block. Snapshot the DB file first.
 */

const path = require('path');
const fs = require('fs');

// dbmgr enables better-sqlite3 verbose SQL logging in dev. Silence while loading.
const realLog = console.log.bind(console);
console.log = () => {};
// Verify against a SCRATCH COPY of the company file — loading the model
// layer runs createTable() + the migration runner, which would otherwise
// rewrite the live bookkeeping database. Must come before any model require.
require('./lib/testDb.js').useScratchCopy({ label: 'verify-lead-customer-link' });

const models = require('../src/backend/models/index.js');
const dbmgr = require('../src/backend/models/dbmgr.js');
console.log = realLog;
const db = dbmgr.raw;
const { CRM, Customers } = models;

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── tiny test harness ────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  [PASS] ${label}`);
  } else {
    failed++;
    failures.push(`${label}\n      expected: ${e}\n      actual:   ${a}`);
    console.log(`  [FAIL] ${label}\n      expected: ${e}\n      actual:   ${a}`);
  }
}
function ok(label, cond, detail) {
  check(label, !!cond, true);
  if (!cond && detail) console.log(`      detail: ${detail}`);
}

// ── fixtures ─────────────────────────────────────────────────────────────────
const created = { customers: [], leads: [] };
const TAG = 'ZZLeadLinkTest';
// Randomised so the exact formatted strings cannot collide with seeded data.
const RND = String(Date.now()).slice(-4);
const PHONE_A  = `(717) 555-${RND}`;
const MOBILE_A = `(717) 444-${RND}`;

function makeCustomer(over = {}) {
  const r = db.prepare(`
    INSERT INTO customers
      (title, first_name, last_name, display_name, company_name, email, phone_number, mobile_number,
       address1, address2, city, state, postal_code, country, status, entered_by, date_entered)
    VALUES ('', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', 'test', datetime('now'))
  `).run(
    over.first_name ?? TAG, over.last_name ?? 'Customer',
    over.display_name ?? `${TAG} Display`,
    over.company_name ?? `${TAG} Co`,
    over.email ?? `zz-leadlink-${Math.random().toString(36).slice(2)}@example.invalid`,
    over.phone_number ?? '(717) 555-1234',
    over.mobile_number ?? '(717) 555-9876',
    over.address1 ?? '1 Test Way', over.address2 ?? 'Suite 9',
    over.city ?? 'York', over.state ?? 'PA', over.postal_code ?? '17401', over.country ?? 'United States'
  );
  const id = Number(r.lastInsertRowid);
  created.customers.push(id);
  return id;
}

function makeLead(payload) {
  const res = CRM.createLead(payload);
  if (!res || res.success === false) throw new Error('createLead failed: ' + JSON.stringify(res));
  const id = Number(res.id);
  created.leads.push(id);
  return id;
}

console.log('\n=== CRM → Leads → New Lead : verification ===\n');

try {
  // ═══════════════════════════════════════════════════════════════════════════
  // A. Customer search must find customers by display name / phone / mobile / #
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('A. Existing-customer search (server-side)');

  const custA = makeCustomer({ display_name: `${TAG} Alpha`, first_name: 'Alphonse', last_name: 'Zulu',
    company_name: `${TAG} Alpha Co`, email: `zz-alpha-${Date.now()}@example.invalid`,
    phone_number: PHONE_A, mobile_number: MOBILE_A });

  const search = (term) => Customers.getPaginated(1, 25, term, '');
  const idsFor = (term) => search(term).data.map(r => Number(r.id));

  ok('search by display name finds the customer', idsFor(`${TAG} Alpha`).includes(custA));
  ok('search by first name finds the customer', idsFor('Alphonse').includes(custA));
  ok('search by company finds the customer', idsFor(`${TAG} Alpha Co`).includes(custA));
  ok('search by email finds the customer', idsFor('zz-alpha-').includes(custA));
  // The full formatted strings are unique to this customer, so a hit proves the
  // phone_number / mobile_number columns specifically are being searched.
  ok('search by phone finds the customer', idsFor(PHONE_A).includes(custA));
  ok('search by mobile finds the customer', idsFor(MOBILE_A).includes(custA));
  ok('search by customer number finds the customer', idsFor(String(custA)).includes(custA));
  ok('a short phone fragment matches rows', search('4321').total >= 1);
  check('nonsense search returns nothing', search('zzzz-no-such-customer-zzzz').total, 0);
  ok('search is paginated (never the full table)', search('').data.length <= 25,
     `got ${search('').data.length}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // B. Lead creation: from scratch vs linked to an existing customer
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\nB. Lead creation modes');

  const scratchId = makeLead({
    first_name: 'Scratch', last_name: 'Person', display_name: `${TAG} Scratch Lead`,
    company_name: `${TAG} Scratch Co`, email: `zz-scratch-${Date.now()}@example.invalid`,
    phone_number: '(717) 555-0000', mobile_number: '(717) 555-0001',
    address1: '9 From Scratch Rd', city: 'Lancaster', state: 'PA', postal_code: '17601',
    country: 'United States', pipeline_stage: 'new', priority: 'medium', value: 1234.5,
    source: 'Referral', tags: ['a', 'b'],
  });
  const scratch = CRM.getLead(scratchId);
  check('from-scratch lead has no customer link', scratch.customer_id, null);
  check('from-scratch lead derives name from display name', scratch.name, `${TAG} Scratch Lead`);
  check('from-scratch lead keeps lead-only fields', [scratch.pipeline_stage, scratch.priority, Number(scratch.value), scratch.source],
        ['new', 'medium', 1234.5, 'Referral']);
  check('from-scratch lead stores structured address', [scratch.address1, scratch.city, scratch.state], ['9 From Scratch Rd', 'Lancaster', 'PA']);
  check('from-scratch lead mirrors legacy address', scratch.address, '9 From Scratch Rd, Lancaster, PA, 17601, United States');
  check('from-scratch lead persists the structured phone', scratch.phone_number, '(717) 555-0000');
  check('from-scratch lead persists the structured mobile', scratch.mobile_number, '(717) 555-0001');

  const linkedId = makeLead({
    customer_id: custA,
    first_name: 'Alphonse', last_name: 'Zulu', display_name: `${TAG} Alpha`,
    company_name: `${TAG} Alpha Co`, email: `zz-alpha-${Date.now()}@example.invalid`,
    phone_number: PHONE_A, mobile_number: MOBILE_A,
    address1: '1 Test Way', city: 'York', state: 'PA',
    pipeline_stage: 'qualified', priority: 'high', value: 5000,
  });
  const linked = CRM.getLead(linkedId);
  check('linked lead stores customer_id', Number(linked.customer_id), custA);
  ok('linked lead exposes the customer name for display', !!linked.linked_customer_name,
     `linked_customer_name=${linked.linked_customer_name}`);
  check('linked lead keeps its own contact copy', [linked.first_name, linked.phone_number], ['Alphonse', PHONE_A]);

  // ═══════════════════════════════════════════════════════════════════════════
  // C. Customer → Leads relationship
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\nC. Customer → Leads');

  const forCust = CRM.listLeadsByCustomer(custA);
  check('listLeadsByCustomer returns only this customer\'s leads', forCust.map(l => Number(l.id)), [linkedId]);
  check('listLeadsByCustomer([]) for unknown id', CRM.listLeadsByCustomer(999999999).length, 0);
  check('listLeadsByCustomer(null) is safe', CRM.listLeadsByCustomer(null).length, 0);

  // ═══════════════════════════════════════════════════════════════════════════
  // D. Update semantics: preserve / unlink
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\nD. Link update semantics');

  // Partial update that omits customer_id must NOT unlink.
  CRM.updateLead({ ...CRM.getLead(linkedId), id: linkedId, pipeline_stage: 'proposal' });
  const afterOmit = db.prepare('SELECT customer_id, pipeline_stage FROM crm_leads WHERE id=?').get(linkedId);
  check('omitting customer_id preserves the link', Number(afterOmit.customer_id), custA);
  check('omitting customer_id still applies other edits', afterOmit.pipeline_stage, 'proposal');

  // Explicit null unlinks (mode switch to "from scratch").
  CRM.updateLead({ ...CRM.getLead(linkedId), id: linkedId, customer_id: null });
  check('explicit null unlinks the lead', db.prepare('SELECT customer_id FROM crm_leads WHERE id=?').get(linkedId).customer_id, null);

  // Re-link.
  CRM.updateLead({ ...CRM.getLead(linkedId), id: linkedId, customer_id: custA });
  check('re-linking works', Number(db.prepare('SELECT customer_id FROM crm_leads WHERE id=?').get(linkedId).customer_id), custA);

  // ═══════════════════════════════════════════════════════════════════════════
  // E. Name derivation fallbacks (backwards compatibility)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\nE. Name derivation');

  const n1 = CRM._normalizeLeadFields({ first_name: 'Jane', last_name: 'Doe' });
  check('name falls back to "First Last"', n1.name, 'Jane Doe');
  const n2 = CRM._normalizeLeadFields({ company_name: 'Acme Ltd' });
  check('name falls back to company', n2.name, 'Acme Ltd');
  const n3 = CRM._normalizeLeadFields({ name: 'Legacy Name' });
  check('name preserved when nothing else supplied', n3.name, 'Legacy Name');
  const n4 = CRM._normalizeLeadFields({});
  check('name never null (NOT NULL column)', n4.name, 'Unnamed Lead');
  const n5 = CRM._normalizeLeadFields({ address: '1 Old St' });
  check('legacy single-line address preserved', n5.address, '1 Old St');
  const n6 = CRM._normalizeLeadFields({ display_name: 'D', first_name: 'F', last_name: 'L' });
  check('display name wins over first/last', n6.name, 'D');

  // ═══════════════════════════════════════════════════════════════════════════
  // F. Conversion must REUSE a linked customer, never duplicate it
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\nF. Conversion reuses the linked customer');

  const beforeCount = db.prepare('SELECT COUNT(*) AS c FROM customers').get().c;
  const conv = CRM.convertToCustomer(linkedId, {});
  ok('conversion succeeded', conv.success, JSON.stringify(conv));
  check('conversion reused the existing customer', conv.reusedExistingCustomer, true);
  check('conversion returned the linked customer id', Number(conv.customerId), custA);
  const afterCount = db.prepare('SELECT COUNT(*) AS c FROM customers').get().c;
  check('no duplicate customer was created', afterCount, beforeCount);
  const converted = CRM.getLead(linkedId);
  check('converted lead points at the same customer', Number(converted.converted_customer_id), custA);
  check('converted lead marked won', converted.pipeline_stage, 'won');

  // A from-scratch lead still creates a customer on conversion (unchanged behaviour).
  const beforeCount2 = db.prepare('SELECT COUNT(*) AS c FROM customers').get().c;
  const conv2 = CRM.convertToCustomer(scratchId, {});
  ok('from-scratch conversion succeeded', conv2.success, JSON.stringify(conv2));
  check('from-scratch conversion created a customer', conv2.reusedExistingCustomer, false);
  check('customer count grew by exactly one', db.prepare('SELECT COUNT(*) AS c FROM customers').get().c, beforeCount2 + 1);
  created.customers.push(Number(conv2.customerId));

  // ═══════════════════════════════════════════════════════════════════════════
  // G. Existing data must not break
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\nG. Backwards compatibility');

  const totalLeads = db.prepare('SELECT COUNT(*) AS c FROM crm_leads').get().c;
  const blankName = db.prepare("SELECT COUNT(*) AS c FROM crm_leads WHERE name IS NULL OR TRIM(name) = ''").get().c;
  check('no lead has a null/blank name', blankName, 0);
  ok('lead table still readable', totalLeads > 0, `totalLeads=${totalLeads}`);
  const allLeads = CRM.listLeads({});
  check('listLeads returns every lead', allLeads.length, totalLeads);
  ok('listLeads exposes the new columns', 'customer_id' in allLeads[0],
     `keys=${Object.keys(allLeads[0]).slice(0, 8).join(',')}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // H. Frontend contract (source inspection)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\nH. Frontend contract');

  const leadsJs = read('src/frontend/src/components/customers/Leads.js');
  const detailsJs = read('src/frontend/src/components/customers/CustomerDetails.js');
  const fieldsJs = read('src/frontend/src/components/customers/shared/CustomerContactFields.js');
  const validJs = read('src/frontend/src/components/customers/shared/customerValidation.js');
  const preloadJs = read('src/backend/preload.js');
  const handlersJs = read('src/backend/handlers/crmHandlers.js');

  ok('Leads.js defines the two creation modes',
     /MODE_EXISTING\s*=\s*'existing'/.test(leadsJs) && /MODE_SCRATCH\s*=\s*'scratch'/.test(leadsJs));
  ok('Leads.js renders a mode switch', /<Radio\.Group/.test(leadsJs) && /handleModeChange/.test(leadsJs));
  ok('Leads.js reuses the shared contact block', /from '\.\/shared\/CustomerContactFields'/.test(leadsJs) && /<CustomerContactFields/.test(leadsJs));
  ok('Lead form composes the shared validation (via the shared block)',
     /getContactRules/.test(fieldsJs) && /customerContactSchema/.test(validJs) && /<CustomerContactFields/.test(leadsJs));
  ok('Leads.js sends customer_id explicitly',
     /customer_id:\s*createMode === MODE_EXISTING/.test(leadsJs));
  ok('Leads.js uses server-side customer search',
     /getCustomersPaginated/.test(leadsJs) && !/getAllCustomers/.test(leadsJs));
  ok('Leads.js debounces the customer search', /customerSearchTimer/.test(leadsJs) && /setTimeout/.test(leadsJs));
  ok('Leads.js links by id, never by name/email routing',
     /goToCustomer/.test(leadsJs) && /\/main\/customers\/details\/\$\{/.test(leadsJs));
  ok('Leads.js has a duplicate-customer guard', /duplicateWarning/.test(leadsJs) && /checkDuplicateCustomer/.test(leadsJs));
  ok('Leads.js confirms before clearing on mode switch', /Modal\.confirm/.test(leadsJs));
  ok('Leads.js uses boxed sections (Source / Lead Details / Notes)',
     /<FormSection\b/.test(leadsJs) && /title="Source"/.test(leadsJs)
     && /title="Lead Details"/.test(leadsJs) && /title="Notes"/.test(leadsJs));
  ok('Leads.js renders the shared contact block in the lead layout',
     /<CustomerContactFields[\s\S]{0,200}?layout="lead"/.test(leadsJs));
  ok('Leads.js has a one-time auto-open for the customer picker',
     /autoOpenedCustomerRef/.test(leadsJs) && /customerDropdownOpen/.test(leadsJs)
     && /onDropdownVisibleChange/.test(leadsJs));
  ok('Leads.js customer dropdown offers + Add New Customer',
     /Add New Customer/.test(leadsJs) && /setCustModalOpen\(true\)/.test(leadsJs));
  ok('Lead modal scrolls instead of overflowing', /maxHeight:\s*'calc\(100vh/.test(leadsJs) && /width=\{920\}/.test(leadsJs));
  ok('Lead table shows the linked customer', /title: 'Customer'/.test(leadsJs));

  ok('shared contact block owns phone formatting', /phoneInputHandler/.test(fieldsJs));
  ok('shared validation is the single definition',
     /customerContactSchema/.test(validJs) && /firstOrCompanyValidator/.test(validJs) && /getContactRules/.test(validJs));
  // The Edit Customer form reuses the shared block, and still renders the tax
  // settings — they are now passed in via `vatRates` so the shared block can
  // lay Tax Settings out as its own section (it is no longer a separate
  // <CustomerTaxFields/> sibling under a <Divider>).
  ok('shared block is reused by the Edit Customer form',
     /CustomerContactFields/.test(detailsJs) && /vatRates=\{vatRates\}/.test(detailsJs));

  ok('CustomerDetails has a Leads tab', /key="leads"/.test(detailsJs) && /activeTab === 'leads'/.test(detailsJs));
  ok('CustomerDetails loads leads by customer id', /crmListLeadsByCustomer/.test(detailsJs));
  ok('IPC handler registered', /crm-list-leads-by-customer/.test(handlersJs));
  ok('preload exposes the API', /crmListLeadsByCustomer:/.test(preloadJs));

  // No leftover duplicate contact blocks in the forms we refactored.
  const dupBlock = /name="phone_number"[\s\S]{0,400}name="mobile_number"/.test(leadsJs);
  check('Leads.js has no hand-rolled contact block', dupBlock, false);

} catch (err) {
  failed++;
  failures.push('EXCEPTION: ' + (err && err.stack ? err.stack : err));
  console.log('  [FAIL] EXCEPTION: ' + (err && err.message ? err.message : err));
} finally {
  // ── cleanup ────────────────────────────────────────────────────────────────
  try {
    for (const id of created.leads) {
      db.prepare('DELETE FROM crm_activities WHERE leadId = ?').run(id);
      db.prepare('DELETE FROM crm_leads WHERE id = ?').run(id);
    }
    for (const id of created.customers) {
      db.prepare('DELETE FROM customers WHERE id = ?').run(id);
    }
  } catch (e) { console.log('  cleanup warning: ' + e.message); }
}

console.log('\n─────────────────────────────────────────────');
console.log(`  passed: ${passed}   failed: ${failed}`);
if (failures.length) {
  console.log('\n  failures:');
  failures.forEach(f => console.log('   - ' + f));
}
console.log('─────────────────────────────────────────────\n');

process.exit(failed ? 1 : 0);
