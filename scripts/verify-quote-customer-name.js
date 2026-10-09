/**
 * verify-quote-customer-name.js — the Quote/Customer list Customer column.
 *
 * Proves the SHARED customer-name rule (person → company → display_name) is
 * used by the Quotes list, that the SQL expression (customerNameSql) produces
 * EXACTLY the same string as the JS helper (getCustomerName) for every real
 * customer row, and that the frontend components import the same helper.
 *
 * Run: $env:ELECTRON_RUN_AS_NODE="1"; & electron.exe scripts\verify-quote-customer-name.js
 */
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
const { getCustomerName, customerNameSql } = require(path.join(ROOT, 'src', 'backend', 'services', 'contactIdentity'));

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`); }
};

// ── 1. SQL expression vs JS helper, on a synthetic table covering the cases ──
const liveDb = path.join(ROOT, 'src', 'backend', 'db', 'accounts.db');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quotecust-'));
const tmpDb = path.join(tmpDir, 'accounts_copy.db');
let db;
try {
  fs.copyFileSync(liveDb, tmpDb);
  const Database = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
  db = new Database(tmpDb);
} catch (e) {
  console.log('  (no sqlite available, running static-only):', e.message);
}

console.log('\n=== synthetic cases: SQL must equal JS ===');
const CASES = [
  ['1 person wins', { first_name: 'John', last_name: 'Smith', company_name: 'Smith Hardware' }, 'John Smith'],
  ['2 first only', { first_name: 'John', last_name: '', company_name: 'Smith Hardware' }, 'John'],
  ['3 last only', { first_name: '', last_name: 'Smith', company_name: 'Smith Hardware' }, 'Smith'],
  ['4 company only (Westfield)', { first_name: '', last_name: '', company_name: 'Westfield Egg Farm' }, 'Westfield Egg Farm'],
  ['5 company only (A&M)', { first_name: null, last_name: null, company_name: 'A&M Transportation' }, 'A&M Transportation'],
  ['6 whitespace first', { first_name: '   ', last_name: '', company_name: 'ABC Supplies' }, 'ABC Supplies'],
  ['7 display only', { first_name: '', last_name: '', company_name: '', display_name: 'Cash Customer' }, 'Cash Customer'],
  ['8 dashes ignored', { first_name: '-', last_name: '-', company_name: 'Westfield Egg Farm' }, 'Westfield Egg Farm'],
];
for (const [label, row, expected] of CASES) {
  check(`JS  ${label}`, getCustomerName(row) === expected, getCustomerName(row));
}

if (db) {
  db.prepare('CREATE TABLE IF NOT EXISTS cust_test (first_name TEXT, last_name TEXT, company_name TEXT, display_name TEXT)').run();
  const ins = db.prepare('INSERT INTO cust_test (first_name, last_name, company_name, display_name) VALUES (?,?,?,?)');
  for (const [, row] of CASES) ins.run(row.first_name ?? null, row.last_name ?? null, row.company_name ?? null, row.display_name ?? null);
  const sel = `SELECT rowid, ${customerNameSql('cust_test')} AS name FROM cust_test ORDER BY rowid`;
  const sqlRows = db.prepare(sel).all();
  CASES.forEach(([label, , expected], i) => check(`SQL ${label}`, sqlRows[i] && sqlRows[i].name === expected, sqlRows[i] && sqlRows[i].name));
  for (const r of sqlRows) {
    check(`SQL no "- -" / lone "-" (row ${r.rowid}: ${JSON.stringify(r.name)})`, r.name !== '-' && !/- -/.test(r.name), r.name);
  }

  // ── 2. Parity across EVERY real customer row: SQL == JS ──
  console.log('\n=== parity on the live customers table ===');
  const realRows = db.prepare('SELECT first_name, last_name, company_name, display_name, ' + customerNameSql('customers') + ' AS name FROM customers').all();
  let mismatches = 0;
  for (const r of realRows) {
    const js = getCustomerName(r);
    if (js !== (r.name || '')) { mismatches++; if (mismatches <= 5) console.log('  mismatch:', JSON.stringify(r), '-> sql', JSON.stringify(r.name), 'js', JSON.stringify(js)); }
  }
  check(`SQL matches JS for all ${realRows.length} customers`, mismatches === 0, { mismatches });

  const companyOnly = db.prepare(`SELECT ${customerNameSql('customers')} AS name FROM customers
    WHERE (first_name IS NULL OR TRIM(first_name) IN ('', '-')) AND (last_name IS NULL OR TRIM(last_name) IN ('', '-'))
      AND COALESCE(company_name,'') <> '' LIMIT 3`).all();
  check('company-only customers resolve to their company (not blank)', companyOnly.every(r => r.name && r.name.trim()), companyOnly);
  console.log('  company-only samples:', JSON.stringify(companyOnly));

  try { db.close(); } catch (_) {}
}
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}

// ── 3. Static wiring: the shared helper/SQL is used everywhere ──
console.log('\n=== static wiring ===');
const quotes = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'models', 'quotes.js'), 'utf8');
const invoices = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'models', 'invoices.js'), 'utf8');
check('contactIdentity exports getCustomerName + customerNameSql', typeof getCustomerName === 'function' && typeof customerNameSql === 'function');
check('quotes.js uses customerNameSql for customer_name', /customerNameSql\('customers'\)/.test(quotes) && /AS customer_name/.test(quotes));
check('quotes.js has NO legacy first+last customer_name', !/first_name \|\| ' ' \|\| .*last_name AS customer_name/.test(quotes));
check('quotes.js search uses the resolved name', /customerNameSql\('customers'\)[\s\S]{0,4}LIKE \?/.test(quotes));
check('invoices.js uses the shared CUSTOMER_NAME_SQL', /CUSTOMER_NAME_SQL/.test(invoices) && /customerNameSql\('customers'\)/.test(invoices));
check('invoices.js no legacy COALESCE(display,first+last) remains', !/COALESCE\(NULLIF\(customers\.display_name, ''\), NULLIF\(customers\.company_name/.test(invoices));

const listCmp = fs.readFileSync(path.join(FE, 'components', 'customers', 'quotes', 'QuoteList.js'), 'utf8');
const center = fs.readFileSync(path.join(FE, 'components', 'customers', 'CustomerCenter.js'), 'utf8');
const details = fs.readFileSync(path.join(FE, 'components', 'customers', 'CustomerDetails.js'), 'utf8');
check('QuoteList imports + uses getCustomerName', /import \{ getCustomerName \}/.test(listCmp) && /getCustomerName\(/.test(listCmp));
check('CustomerCenter imports + uses getCustomerName', /import \{ getCustomerName \}/.test(center) && /getCustomerName\(/.test(center));
check('CustomerDetails imports + uses getCustomerName', /import \{ getCustomerName \}/.test(details) && /getCustomerName\(/.test(details));
check('no quote-only fallback "customerName || company" introduced', !/customerName \|\| .*company/.test(listCmp + center));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
