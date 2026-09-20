/**
 * verify-receive-payments-filters.js — the Receive Payments invoice list must
 * filter by CUSTOMER ID and by INVOICE DATE (start_date), combined with AND,
 * while keeping only outstanding invoices. Runs on a SCRATCH COPY.
 */
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const Module = require('module');
const electronStub = { ipcMain: { handle: () => {} }, app: { isPackaged: true } };
const originalLoad = Module._load;
Module._load = function (request) { if (request === 'electron') return electronStub; return originalLoad.apply(this, arguments); };

require('./lib/testDb.js').useScratchCopy({ label: 'verify-receive-payments-filters' });
const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const Invoices = require(path.join(ROOT, 'src', 'backend', 'models', 'invoices.js'));
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js')).raw;

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

const STATUS = '!paid,cancelled,void';
const q = (cust, from, to) => Invoices.getPaginated(1, 500, '', STATUS, '', '', from || '', to || '', cust || '', true);

console.log('\n=== Receive Payments filters ===');

const all = q('', '', '');
check('baseline returns outstanding invoices', all.total > 0, all.total);

// ── Test 1/2 — customer filter by id ──────────────────────────────────────
const byCust = {};
all.data.forEach(r => { byCust[r.customer] = (byCust[r.customer] || 0) + 1; });
const targetId = Object.keys(byCust).sort((a, b) => byCust[b] - byCust[a])[0];
const targetName = (all.data.find(r => String(r.customer) === String(targetId)) || {}).customer_name;
const onlyTarget = q(targetId, '', '');
check('customer filter returns only that customer',
  onlyTarget.data.length > 0 && onlyTarget.data.every(r => String(r.customer) === String(targetId)),
  [...new Set(onlyTarget.data.map(r => r.customer))]);
check('customer filter narrows the count', onlyTarget.total <= all.total && onlyTarget.total >= 1, onlyTarget.total);
// a different customer yields different rows
const otherId = Object.keys(byCust).find(id => String(id) !== String(targetId));
if (otherId) {
  const other = q(otherId, '', '');
  check('a different customer returns different invoices',
    other.data.every(r => String(r.customer) === String(otherId)), otherId);
}

// ── Test 3 — clear customer (no filter) ───────────────────────────────────
check('clearing the customer returns all customers again', q('', '', '').total === all.total);

// ── Test 4/5/6 — date filters on the INVOICE date (start_date) ────────────
const sample = all.data.find(r => r.start_date);
const day = sample.start_date;
check('baseline rows carry an invoice date', !!day, day);

const fromOnly = q('', '2026-07-01', '');
check('FROM date only: nothing before the date',
  fromOnly.data.every(r => r.start_date >= '2026-07-01'),
  fromOnly.data.filter(r => r.start_date < '2026-07-01').map(r => r.start_date).slice(0, 3));

const toOnly = q('', '', '2026-07-31');
check('TO date only: nothing after the date',
  toOnly.data.every(r => r.start_date <= '2026-07-31'),
  toOnly.data.filter(r => r.start_date > '2026-07-31').map(r => r.start_date).slice(0, 3));

const range = q('', '2026-07-01', '2026-07-31');
check('RANGE: every row is inside July',
  range.data.every(r => r.start_date >= '2026-07-01' && r.start_date <= '2026-07-31'));

// ── Test 8 — To-date inclusivity ──────────────────────────────────────────
const onDay = q('', day, day);
check('an invoice dated exactly on the TO date is INCLUDED', onDay.data.some(r => r.id === sample.id),
  `looked for #${sample.id} @ ${day}; got ${onDay.data.length} rows`);

// ── Test 7 — combined customer + date (AND) ───────────────────────────────
const combined = q(targetId, '2026-01-01', '2026-12-31');
check('combined customer + date returns only that customer',
  combined.data.every(r => String(r.customer) === String(targetId)));
check('combined customer + date stays inside the range',
  combined.data.every(r => r.start_date >= '2026-01-01' && r.start_date <= '2026-12-31'));
check('combined is a subset of customer-only', combined.total <= onlyTarget.total);

// ── Test 11/12 — eligibility preserved; balances intact ───────────────────
check('no fully-paid invoice leaks into the list',
  all.data.every(r => Number(r.balance) > 0.005),
  all.data.filter(r => Number(r.balance) <= 0.005).map(r => ({ id: r.id, status: r.status, balance: r.balance })).slice(0, 3));
check('no Paid/Cancelled/Void status leaks into the list',
  all.data.every(r => !['paid', 'cancelled', 'canceled', 'void', 'voided'].includes(String(r.status || '').toLowerCase())));
const paid = db.prepare("SELECT id FROM invoices WHERE LOWER(status)='paid' LIMIT 1").get();
if (paid) check('a known Paid invoice is excluded', !all.data.some(r => Number(r.id) === Number(paid.id)), paid.id);
const partial = all.data.find(r => String(r.status).toLowerCase() === 'partially paid');
if (partial) {
  check('a Partially Paid invoice is included with a positive balance', Number(partial.balance) > 0);
  check('its balance = total - paid (not recomputed wrongly)',
    Math.abs(Number(partial.balance) - (Number(partial.amount) - Number(partial.totalPaid))) < 0.011,
    { amount: partial.amount, paid: partial.totalPaid, balance: partial.balance });
}

// ── Test 13 — customer with no outstanding invoices returns nothing ───────
const noHitCust = db.prepare("SELECT id FROM customers WHERE id NOT IN (SELECT DISTINCT customer FROM invoices WHERE LOWER(status) NOT IN ('paid','cancelled','void')) LIMIT 1").get();
if (noHitCust) {
  const empty = q(noHitCust.id, '', '');
  check('a customer with no outstanding invoices returns an EMPTY result (no fallback)',
    empty.total === 0 && empty.data.length === 0, empty.total);
}

// ── Source wiring (frontend) ──────────────────────────────────────────────
const ui = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'src', 'components', 'customers', 'payments', 'ReceivePayments.js'), 'utf8');
check('the customer selector value is the customer id', /value=\{c\.id\}/.test(ui));
check('selecting a customer passes the NEW id straight to the query',
  /applyInvoiceFilters\(1, invoicesPageSize, invoicesDateRange, val\)/.test(ui));
check('the fetch accepts an explicit customerId (no stale state read)',
  /customerId = selectedCustomerId/.test(ui));
check('the query sends customerId as the customer filter argument',
  /getInvoicesPaginated\([^)]*startFrom, startTo, customerId, true\)/.test(ui));
check('the query filters on the invoice date (startFrom/startTo)',
  /startFrom, startTo, customerId, true/.test(ui));
check('Refresh re-runs with the current filters', /onClick=\{\(\) => applyInvoiceFilters\(1, invoicesPageSize\)\}/.test(ui));
check('pagination re-runs with the current filters',
  /applyInvoiceFilters\(p, size, invoicesDateRange, selectedCustomerId\)/.test(ui));
check('an invalid range is refused', /Invoice From date cannot be after Invoice To date/.test(ui));
check('a zero-result customer shows a specific empty state', /No outstanding invoices found/.test(ui));
check('the old stale-closure call is gone', !/fetchInvoicesPaginated\(1, invoicesPageSize, invoicesDateRange\)/.test(ui));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
