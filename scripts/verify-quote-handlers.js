/**
 * Verification of the IPC handler layer for the quote workflow (PART E + PART I).
 *
 * The models are already covered by verify-status-workflow.js. This script checks
 * the layer above: that the registered IPC channels strip client status, enforce the
 * transition matrix, and write audit-log entries.
 *
 * `ipcMain` is unavailable in ELECTRON_RUN_AS_NODE, so we stub the electron module
 * and capture the handlers the module registers.
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/verify-quote-handlers.js
 */

const path = require('path');
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
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return electronStub;
  return originalLoad.apply(this, arguments);
};

const realLog = console.log.bind(console);
console.log = () => {};
// Verify against a SCRATCH COPY of the company file — loading the model
// layer runs createTable() + the migration runner, which would otherwise
// rewrite the live bookkeeping database. Must come before any model require.
require('./lib/testDb.js').useScratchCopy({ label: 'verify-quote-handlers' });

const models = require('../src/backend/models/index.js');
const dbmgr = require('../src/backend/models/dbmgr.js');
console.log = realLog;
const db = dbmgr.raw;
const { Quotes } = models;

// ── tiny harness ────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  [PASS] ${label}`); }
  else { failed++; failures.push(`${label}\n      expected: ${e}\n      actual:   ${a}`); console.log(`  [FAIL] ${label}\n      expected: ${e}\n      actual:   ${a}`); }
}

const created = { quotes: [], invoices: [], customerId: null };
const fakeEvent = { sender: { id: 'test-sender' } };

function makeCustomer() {
  const res = db.prepare(`
    INSERT INTO customers (title, first_name, last_name, mobile_number, display_name, email, status, entered_by, date_entered)
    VALUES ('', 'ZZHandlerTest', 'Workflow', '', 'ZZ Handler Test', 'zz-handler-test@example.invalid', 'Active', 'test', datetime('now'))
  `).run();
  created.customerId = Number(res.lastInsertRowid);
}

function createQuote(amount) {
  const res = Quotes.insertQuote(
    undefined, created.customerId, 'zz-handler-test@example.invalid', false, 'Addr',
    '2026-01-01', '2026-01-31', '', '', null, 'test', 0,
    [{ product: 1, description: 'line', quantity: 1, rate: amount, amount }]
  );
  created.quotes.push(Number(res.quoteId));
  return Number(res.quoteId);
}

function cleanup() {
  for (const id of created.invoices) {
    try { db.prepare('DELETE FROM invoice_lines WHERE invoice_id = ?').run(id); } catch {}
    try { db.prepare('DELETE FROM invoices WHERE id = ?').run(id); } catch {}
  }
  for (const id of created.quotes) {
    try { db.prepare('DELETE FROM quote_lines WHERE quote_id = ?').run(id); } catch {}
    try { db.prepare('DELETE FROM quotes WHERE id = ?').run(id); } catch {}
  }
  try { db.prepare("DELETE FROM audit_logs WHERE entityType = 'quote' AND entityId IN (" + created.quotes.map(() => '?').join(',') + ")").run(...created.quotes.map(String)); } catch {}
  if (created.customerId) { try { db.prepare('DELETE FROM customers WHERE id = ?').run(created.customerId); } catch {} }
}

async function main() {
  console.log('Quote IPC handler verification\n');
  makeCustomer();

  // Register the real handler module against the stubbed ipcMain.
  require('../src/backend/handlers/quoteHandlers.js')();
  check('registers accept-quote', handlers.has('accept-quote'), true);
  check('registers decline-quote', handlers.has('decline-quote'), true);
  check('registers convert-quote-to-invoice', handlers.has('convert-quote-to-invoice'), true);

  const accept = handlers.get('accept-quote');
  const decline = handlers.get('decline-quote');
  const convert = handlers.get('convert-quote-to-invoice');

  // ── 1. Accept writes an audit entry ──────────────────────────────────────
  const q1 = createQuote(100);
  let res = await accept(fakeEvent, q1);
  check('handler accept → success', res.success, true);
  check('handler accept → Accepted', res.status, 'Accepted');
  let audits = db.prepare("SELECT * FROM audit_logs WHERE entityType='quote' AND entityId=?").all(String(q1));
  check('accept wrote exactly 1 audit row', audits.length, 1);
  check('audit row records the transition', JSON.parse(audits[0].details).transition, 'Pending → Accepted');

  // ── 2. Convert via the handler creates an invoice and audits ────────────
  res = await convert(fakeEvent, q1);
  check('handler convert → success', res.success, true);
  check('handler convert → invoice Open', res.invoiceStatus, 'Open');
  check('handler convert → quote Converted', res.quoteStatus, 'Converted');
  if (res.invoiceId) created.invoices.push(Number(res.invoiceId));
  audits = db.prepare("SELECT * FROM audit_logs WHERE entityType='quote' AND entityId=? ORDER BY id").all(String(q1));
  check('convert added a 2nd audit row', audits.length, 2);
  const convDetails = JSON.parse(audits[1].details);
  check('convert audit links the invoice', Number(convDetails.createdInvoiceId), Number(res.invoiceId));
  check('convert audit records invoice status', convDetails.invoiceStatus, 'Open');

  // ── 3. Duplicate conversion blocked at handler level ────────────────────
  res = await convert(fakeEvent, q1);
  check('handler double-convert → blocked', res.success, false);
  check('handler double-convert → alreadyConverted', !!res.alreadyConverted, true);
  check('handler double-convert wrote no audit row',
    db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE entityType='quote' AND entityId=?").get(String(q1)).n, 2);

  // ── 4. Declined quote cannot be converted ───────────────────────────────
  const q2 = createQuote(50);
  res = await decline(fakeEvent, q2);
  check('handler decline → Declined', res.status, 'Declined');
  res = await convert(fakeEvent, q2);
  check('handler convert declined → blocked', res.success, false);
  check('handler convert declined → invalidTransition', !!res.invalidTransition, true);

  // ── 5. updatequote strips a client-supplied status ──────────────────────
  const ipcHandlersPath = require.resolve('../src/backend/handlers/ipcHandlers.js');
  delete require.cache[ipcHandlersPath];
  require('../src/backend/handlers/ipcHandlers.js')();
  const updateQuote = handlers.get('updatequote');
  if (updateQuote) {
    const q3 = createQuote(75);
    await updateQuote(fakeEvent, {
      id: q3, customer: created.customerId, customer_email: '', islater: false,
      billing_address: '', start_date: '2026-01-01', last_date: '2026-01-31',
      number: '', vat: 0, message: '', statement_message: '', status: 'Converted',
      quoteLines: [{ product: 1, description: 'line', quantity: 1, rate: 75, amount: 75 }],
    });
    check('updatequote ignores injected status "Converted"', Quotes.getSingleQuote(q3).status, 'Pending');
  } else {
    check('updatequote handler registered', false, true);
  }

  cleanup();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  if (failures.length) { console.log('\nFailures:'); failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`)); }
  console.log('='.repeat(60));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  cleanup();
  console.error('UNCAUGHT:', e);
  process.exit(1);
});
