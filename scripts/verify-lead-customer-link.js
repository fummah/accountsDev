/**
 * verify-lead-customer-link.js — Customer → Lead → Quote share ONE customerId.
 *
 * Reproduces the duplicate-customer bug (Lead linked to Customer A, quote
 * created a Customer B) and proves it is fixed: createQuoteForLead reuses the
 * lead's customer id, never fabricates a customer, tags the quote with lead_id,
 * rejects a legacy lead with no link (requiresCustomer) and never matches by
 * name. Also checks the audit + the removed New-Lead radio controls.
 *
 * Run: $env:ELECTRON_RUN_AS_NODE="1"; & electron.exe scripts\verify-lead-customer-link.js
 */
/* eslint-disable no-console */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-lead-customer-link' });

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr'));
require(path.join(ROOT, 'src', 'backend', 'models', 'quotes'));   // runs the lead_id migration
const CRM = require(path.join(ROOT, 'src', 'backend', 'models', 'crm'));

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`); }
};

const custCount = () => db.prepare('SELECT COUNT(*) AS c FROM customers').get().c;
const insertCustomer = (fields) => {
  const r = db.prepare(`INSERT INTO customers (title,first_name,last_name,display_name,email,phone_number,mobile_number,company_name,address1,city,state,postal_code)
    VALUES ('',?,?,?,?,?,?,?,?,?,?,?)`).run(
    fields.first_name || '', fields.last_name || '', fields.display_name || '',
    fields.email || '', fields.phone_number || '', fields.mobile_number || '',
    fields.company_name || '', fields.address1 || '', fields.city || '', fields.state || '', fields.postal_code || ''
  );
  return Number(r.lastInsertRowid);
};
const dedupe = (n) => `verify-lead-${n}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

console.log('\n=== A) existing customer (person) → lead → quote reuses the SAME id ===');
{
  const cid = insertCustomer({ first_name: 'Christ', last_name: 'Kauffman', email: dedupe('ck') + '@x.com' });
  const before = custCount();
  const { id: leadId } = CRM.createLead({ name: 'Transport Opportunity', customer_id: cid, email: 'ck@x.com' });
  const lead = db.prepare('SELECT customer_id FROM crm_leads WHERE id=?').get(leadId);
  check('lead.customer_id = selected customer id', Number(lead.customer_id) === cid, { lead: lead.customer_id, cid });
  check('no customer created by creating the lead', custCount() === before, custCount() - before);

  const res = CRM.createQuoteForLead(leadId, { customer_email: 'ck@x.com', billing_address: '289 S Spruce St', start_date: '2026-01-01' }, [{ description: 'Freight', quantity: 1, rate: 100, amount: 100 }]);
  check('quote created', res && res.success, res);
  check('quote reuses the lead customer id', res.customerId === cid, { quote: res.customerId, cid });
  check('NO second customer created by the quote', custCount() === before, { before, after: custCount() });
  const q = db.prepare('SELECT customer, lead_id FROM quotes WHERE id=?').get(res.quoteId);
  check('quote.customer = lead.customer_id', Number(q.customer) === cid, q);
  check('quote.lead_id = lead id (traceability)', Number(q.lead_id) === leadId, q);
}

console.log('\n=== B) company-only customer → lead → quote (Westfield Egg Farm) ===');
{
  const cid = insertCustomer({ company_name: 'Westfield Egg Farm', address1: '6353 Westville Rd', city: 'Hartly', state: 'DE', postal_code: '19953', email: dedupe('wf') + '@x.com' });
  const before = custCount();
  const { id: leadId } = CRM.createLead({ name: 'Eggs', company_name: 'Westfield Egg Farm', customer_id: cid });
  const res = CRM.createQuoteForLead(leadId, {}, [{ description: 'Eggs', quantity: 10, rate: 5, amount: 50 }]);
  check('quote reuses company-only customer', res.success && res.customerId === cid, res);
  check('no duplicate company customer', custCount() === before, { before, after: custCount() });
  const quotes = CRM.getLeadQuotes(leadId);
  check('lead quote shows the company name (fallback)', quotes[0] && quotes[0].customer_name === 'Westfield Egg Farm', quotes[0]);
}

console.log('\n=== C) legacy lead with NO customer: never auto-create by name ===');
{
  const before = custCount();
  const { id: leadId } = CRM.createLead({ name: 'ABC Ltd', company_name: 'ABC Ltd', customer_id: null });
  const res = CRM.createQuoteForLead(leadId, {}, [{ description: 'x', quantity: 1, rate: 1, amount: 1 }]);
  check('rejected with requiresCustomer', res && res.success === false && res.requiresCustomer === true, res);
  check('NO customer auto-created from the lead name', custCount() === before, { before, after: custCount() });
  check('no quote created', db.prepare('SELECT COUNT(*) c FROM quotes WHERE lead_id=?').get(leadId).c === 0);

  // Now supply an explicit customer (the UI "select a customer" prompt).
  const cid = insertCustomer({ company_name: 'ABC Ltd', email: dedupe('abc') + '@x.com' });
  const before2 = custCount();
  const res2 = CRM.createQuoteForLead(leadId, { customer_id: cid }, [{ description: 'x', quantity: 1, rate: 2, amount: 2 }]);
  check('quote created with the selected customer', res2.success && res2.customerId === cid, res2);
  check('no extra customer created', custCount() === before2, custCount() - before2);
  check('selected customer saved back onto the lead', Number(db.prepare('SELECT customer_id FROM crm_leads WHERE id=?').get(leadId).customer_id) === cid);
}

console.log('\n=== D) two customers with the SAME name → use the LINKED id, never name-match ===');
{
  const first = insertCustomer({ company_name: 'John Smith', email: dedupe('js1') + '@x.com' });
  const second = insertCustomer({ company_name: 'John Smith', email: dedupe('js2') + '@x.com' });
  const { id: leadId } = CRM.createLead({ name: 'John Smith deal', company_name: 'John Smith', customer_id: first });
  const res = CRM.createQuoteForLead(leadId, {}, [{ description: 'x', quantity: 1, rate: 3, amount: 3 }]);
  check('quote uses the LINKED customer, not the same-named other', res.customerId === first && res.customerId !== second, { linked: first, other: second, got: res.customerId });
}

console.log('\n=== E) convertToCustomer on a linked lead reuses the existing customer ===');
{
  const cid = insertCustomer({ company_name: 'Linked Co', email: dedupe('lc') + '@x.com' });
  const { id: leadId } = CRM.createLead({ name: 'Linked Co', company_name: 'Linked Co', customer_id: cid });
  const before = custCount();
  const res = CRM.convertToCustomer(leadId, {});
  check('convert reuses the linked customer', res.success && res.customerId === cid && res.reusedExistingCustomer === true, res);
  check('convert creates no duplicate customer', custCount() === before, custCount() - before);
}

console.log('\n=== F) audit finds lead/quote duplicates but never merges ===');
{
  const name = `Dup Co ${Date.now()}`;
  const a = insertCustomer({ company_name: name });
  const b = insertCustomer({ company_name: name });
  CRM.createLead({ name, company_name: name, customer_id: a });
  const { id: leadId } = CRM.createLead({ name, company_name: name, customer_id: b });
  CRM.createQuoteForLead(leadId, {}, [{ description: 'x', quantity: 1, rate: 1, amount: 1 }]);
  const before = custCount();
  const audit = CRM.auditDuplicateCustomers();
  const hit = audit.find(g => g.name === name);
  check('audit reports the duplicate group', !!hit, audit.map(g => g.name));
  check('group lists both customers with lead/quote counts', hit && hit.customers.length === 2 && hit.customers.some(c => c.leads > 0) && hit.customers.some(c => c.quotes > 0), hit);
  check('audit does NOT merge (customer count unchanged)', custCount() === before, custCount() - before);
}

console.log('\n=== G) static wiring / UI source ===');
{
  const crm = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'models', 'crm.js'), 'utf8');
  check('createQuoteForLead never INSERTs into customers', !/createQuoteForLead[\s\S]*?INSERT INTO customers[\s\S]*?\n  \}/.test(crm) || !/INSERT INTO customers/.test(crm.slice(crm.indexOf('createQuoteForLead'))));
  check('createQuoteForLead resolves customer_id as well as converted_customer_id', /converted_customer_id \|\| lead\.customer_id/.test(crm));
  check('createQuoteForLead returns requiresCustomer', /requiresCustomer: true/.test(crm));
  check('createQuoteForLead sets lead_id on the quote', /lead_id\)\s*VALUES|lead_id\b/.test(crm));
  check('auditDuplicateCustomers exists', /auditDuplicateCustomers:/.test(crm));

  const quotes = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'models', 'quotes.js'), 'utf8');
  check('quotes table migrates a lead_id column', /ALTER TABLE quotes ADD COLUMN lead_id/.test(quotes));

  const leads = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'src', 'components', 'customers', 'Leads.js'), 'utf8');
  check('New Lead UI: "Existing Customer" removed', !/Existing Customer/.test(leads));
  check('New Lead UI: "From Scratch" removed', !/From Scratch/.test(leads));
  check('New Lead UI: no createMode / MODE_ state', !/createMode|MODE_SCRATCH|MODE_EXISTING/.test(leads));
  check('New Lead UI: has the searchable Customer field', /name="customer_id"[\s\S]*?showSearch/.test(leads));
  check('New Lead UI: has + Add New Customer', /Add New Customer/.test(leads));
  check('New Lead UI: uses shared getCustomerName for the dropdown', /import \{ getCustomerName \}/.test(leads) && /getCustomerName\(c\)/.test(leads));
  check('New Lead UI: audit action wired', /crmAuditDuplicateCustomers/.test(leads));
  check('New Lead UI: double-click guards', /savingLeadRef\.current/.test(leads) && /creatingQuoteRef\.current/.test(leads));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
