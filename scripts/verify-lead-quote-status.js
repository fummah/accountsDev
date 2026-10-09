/**
 * Verification for "Creating Quote For Leads".
 *
 * Proves the two behaviours that were fixed on the lead → quote path:
 *
 *   (1) STATUS IS AUTOMATIC. A quote created from a lead is always stored
 *       Pending, exactly like the standard Create Quote screen — whatever
 *       status the caller sends (including legacy labels such as 'Draft',
 *       'Open', 'Sent') is ignored. Quote status is workflow-owned and only
 *       moves through acceptQuote / declineQuote / convertQuoteToInvoice.
 *
 *   (2) LINE PRODUCTS ARE PERSISTED. The renderer sends `product_id`; the
 *       stored `quote_lines.product` must carry it (it used to be dropped and
 *       written as 0, which broke editing the quote afterwards).
 *
 * Also checks the quote is linked back onto the lead (`quote_ids`) and that the
 * lead advances to the `proposal` stage.
 *
 * Run with the repo's Electron binary in plain-node mode (better-sqlite3 is
 * built for Electron's ABI):
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/verify-lead-quote-status.js
 *
 * The script exercises the REAL model against the REAL database and removes
 * every record it creates in a `finally` block. Snapshot the DB file first.
 */

const path = require('path');

// dbmgr enables better-sqlite3 verbose SQL logging in dev. Silence while loading.
const realLog = console.log.bind(console);
console.log = () => {};
// Verify against a SCRATCH COPY of the company file — loading the model
// layer runs createTable() + the migration runner, which would otherwise
// rewrite the live bookkeeping database. Must come before any model require.
require('./lib/testDb.js').useScratchCopy({ label: 'verify-lead-quote-status' });

const models = require('../src/backend/models/index.js');
const dbmgr = require('../src/backend/models/dbmgr.js');
console.log = realLog;
const db = dbmgr.raw;
const { CRM } = models;

const { QUOTE_STATUS } = require('../src/backend/services/documentStatus.js');

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

// ── fixtures ─────────────────────────────────────────────────────────────────
const TAG = 'ZZLeadQuoteStatus';
const RND = String(Date.now()).slice(-6);
const created = { leads: [], quotes: [], customers: [] };

function makeLead(over = {}) {
  // A Lead now links to an existing Customer BY ID (Customer → Lead → Quote).
  // createQuoteForLead reuses that id and never fabricates a customer, so the
  // fixture must supply one.
  const cr = db.prepare(`
    INSERT INTO customers (title, first_name, last_name, display_name, email, phone_number, mobile_number, company_name)
    VALUES ('', ?, ?, ?, ?, '', '', ?)
  `).run(
    over.name ?? `${TAG} Lead`,
    '',
    over.name ?? `${TAG} Lead`,
    over.email ?? `zz-leadquote-${RND}@example.invalid`,
    over.company ?? `${TAG} Co`
  );
  const customerId = Number(cr.lastInsertRowid);
  created.customers.push(customerId);

  const r = db.prepare(`
    INSERT INTO crm_leads
      (name, company, email, phone, address, status, pipeline_stage, source, priority, customer_id, createdAt)
    VALUES (?, ?, ?, ?, ?, 'new', 'new', 'Other', 'medium', ?, datetime('now'))
  `).run(
    over.name ?? `${TAG} Lead`,
    over.company ?? `${TAG} Co`,
    over.email ?? `zz-leadquote-${RND}@example.invalid`,
    over.phone ?? '(717) 555-0000',
    over.address ?? '1 Test Street, Testville',
    customerId
  );
  const id = Number(r.lastInsertRowid);
  created.leads.push(id);
  return id;
}

function cleanup() {
  try {
    for (const qid of created.quotes) {
      db.prepare('DELETE FROM quote_lines WHERE quote_id = ?').run(qid);
      db.prepare('DELETE FROM quotes WHERE id = ?').run(qid);
    }
    for (const lid of created.leads) {
      db.prepare('DELETE FROM crm_activities WHERE leadId = ?').run(lid);
      db.prepare('DELETE FROM crm_leads WHERE id = ?').run(lid);
    }
    for (const cid of created.customers) {
      db.prepare('DELETE FROM customers WHERE id = ?').run(cid);
    }
  } catch (e) {
    console.log('  [warn] cleanup issue:', e.message);
  }
}

// ── the suite ────────────────────────────────────────────────────────────────
function run() {
  console.log('\nLead → Quote: automatic status + persisted line products\n');

  const leadId = makeLead();

  // A product row to reference (any existing product works; the FK is loose).
  const product = db.prepare('SELECT id FROM products LIMIT 1').get();
  const productId = product ? Number(product.id) : null;

  const lines = [
    { product_id: productId, description: 'Consulting', quantity: 2, rate: 500, amount: 1000 },
  ];

  // ── (1) caller-supplied status must be ignored ────────────────────────────
  // 'Draft' is a legacy label that must never survive onto a new quote.
  const res = CRM.createQuoteForLead(leadId, {
    status: 'Draft',
    customer_email: 'client@example.invalid',
    billing_address: '9 Client Road',
    start_date: '2026-01-05',
    last_date: '2026-02-05',
    vat: 15,
    message: 'Thanks for your business',
  }, lines);

  ok('createQuoteForLead succeeded', res && res.success === true, JSON.stringify(res));
  if (!res || !res.success) return;

  created.quotes.push(Number(res.quoteId));
  if (res.customerId) created.customers.push(Number(res.customerId));

  check('returned status is Pending', res.status, QUOTE_STATUS.PENDING);

  const stored = db.prepare('SELECT status, number, customer_email, vat, start_date FROM quotes WHERE id = ?').get(res.quoteId);
  check('stored status is Pending (caller sent "Draft")', stored.status, 'Pending');
  check('quote number generated', stored.number, `QUO-${String(res.quoteId).padStart(5, '0')}`);
  check('customer_email carried over', stored.customer_email, 'client@example.invalid');
  check('vat carried over', Number(stored.vat), 15);
  check('start_date carried over', stored.start_date, '2026-01-05');

  // ── (2) line products must be persisted ───────────────────────────────────
  const storedLines = db.prepare('SELECT product, description, quantity, rate, amount FROM quote_lines WHERE quote_id = ?').all(res.quoteId);
  check('one line stored', storedLines.length, 1);
  if (storedLines.length === 1) {
    check('line product = the product_id sent', Number(storedLines[0].product), productId);
    check('line description stored', storedLines[0].description, 'Consulting');
    check('line quantity stored', Number(storedLines[0].quantity), 2);
    check('line rate stored', Number(storedLines[0].rate), 500);
    check('line amount stored', Number(storedLines[0].amount), 1000);
  }

  // ── (3) link + stage ──────────────────────────────────────────────────────
  const lead = db.prepare('SELECT quote_ids, pipeline_stage FROM crm_leads WHERE id = ?').get(leadId);
  let ids = [];
  try { ids = JSON.parse(lead.quote_ids || '[]'); } catch { ids = []; }
  ok('quote id linked onto the lead', ids.map(Number).includes(Number(res.quoteId)), JSON.stringify(ids));
  check('lead advanced to proposal', lead.pipeline_stage, 'proposal');

  // ── (4) every other legacy status is ignored too ──────────────────────────
  for (const legacy of ['Open', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Converted']) {
    const l2 = makeLead({ name: `${TAG} ${legacy}` });
    const r2 = CRM.createQuoteForLead(l2, { status: legacy }, [
      { product_id: productId, description: 'X', quantity: 1, rate: 10, amount: 10 },
    ]);
    if (r2 && r2.success) {
      created.quotes.push(Number(r2.quoteId));
      if (r2.customerId) created.customers.push(Number(r2.customerId));
      const s = db.prepare('SELECT status FROM quotes WHERE id = ?').get(r2.quoteId);
      check(`caller status "${legacy}" → stored Pending`, s.status, 'Pending');
    } else {
      ok(`createQuoteForLead with status "${legacy}" succeeded`, false, JSON.stringify(r2));
    }
  }

  // ── (4b) legacy lead WITHOUT a customer → requiresCustomer (no auto-create) ─
  {
    const rNo = db.prepare(`
      INSERT INTO crm_leads (name, company, pipeline_stage, source, createdAt)
      VALUES (?, ?, 'new', 'Other', datetime('now'))
    `).run(`${TAG} NoCustomer`, `${TAG} NoCustomer`).lastInsertRowid;
    created.leads.push(Number(rNo));
    const cBefore = db.prepare('SELECT COUNT(*) AS c FROM customers').get().c;
    const r = CRM.createQuoteForLead(Number(rNo), {}, [{ description: 'x', quantity: 1, rate: 1, amount: 1 }]);
    ok('lead without customer → requiresCustomer', r && r.success === false && r.requiresCustomer === true, JSON.stringify(r));
    check('no customer auto-created for an unlinked lead', db.prepare('SELECT COUNT(*) AS c FROM customers').get().c, cBefore);
  }

  // ── (5) the model no longer reads quoteData.status at all ─────────────────
  const src = require('fs').readFileSync(
    path.join(__dirname, '..', 'src', 'backend', 'models', 'crm.js'), 'utf8'
  );
  const body = src.slice(src.indexOf('createQuoteForLead:'));
  ok('crm.js no longer writes quoteData.status', !/quoteData\.status/.test(body.split('getLeadWithRelated')[0]));
  ok('crm.js inserts QUOTE_STATUS.PENDING', /QUOTE_STATUS\.PENDING/.test(body));
  ok('crm.js maps product_id onto quote_lines.product', /l\.product_id \|\| l\.product/.test(body));
}

try {
  run();
} finally {
  cleanup();
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
