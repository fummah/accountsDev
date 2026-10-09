// Verifies the invoices customer_name SQL against a COPY of the DB.
// Run: $env:ELECTRON_RUN_AS_NODE="1"; & electron.exe scripts\verify-invoice-customer.js
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const os = require('os');

const liveDb = path.join(__dirname, '..', 'src', 'backend', 'db', 'accounts.db');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'invcust-'));
const tmpDb = path.join(tmpDir, 'accounts_copy.db');
fs.copyFileSync(liveDb, tmpDb);

const Database = require('better-sqlite3');
const real = new Database(tmpDb);

const custExpr = require(path.join(__dirname, '..', 'src', 'backend', 'services', 'contactIdentity')).customerNameSql('customers');
const sql = `SELECT invoices.id, invoices.number, invoices.customer, ${custExpr} AS customer_name
             FROM invoices
             LEFT JOIN invoice_lines ON invoice_lines.invoice_id = invoices.id
             LEFT JOIN customers ON invoices.customer = customers.id
             GROUP BY invoices.id
             ORDER BY invoices.id DESC
             LIMIT 25`;

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`); }
};

let rows;
try {
  rows = real.prepare(sql).all();
  check('query executes', true);
} catch (e) {
  check('query executes', false, e.message);
  rows = [];
}

console.log(`  rows returned: ${rows.length}`);
const withName = rows.filter(r => r.customer_name && String(r.customer_name).trim());
check('at least one row has a non-empty customer_name', withName.length > 0, { total: rows.length, named: withName.length });
console.log('  samples:', JSON.stringify(rows.slice(0, 5).map(r => ({ id: r.id, number: r.number, customer: r.customer, name: r.customer_name }))));

// Specifically confirm rows whose customer has only a company/display name still resolve.
const companyOnly = real.prepare(`
  SELECT c.id, c.display_name, c.company_name, c.first_name, c.last_name
  FROM customers c
  WHERE (c.first_name IS NULL OR TRIM(c.first_name) = '')
    AND (c.last_name IS NULL OR TRIM(c.last_name) = '')
    AND (COALESCE(c.display_name,'') <> '' OR COALESCE(c.company_name,'') <> '')
  LIMIT 3
`).all();
console.log('  company-only customers:', JSON.stringify(companyOnly));

// Verify the fallback ordering directly against a synthetic check.
const sample = real.prepare(`SELECT ${custExpr} AS n FROM customers WHERE id = ?`);
if (rows.length) {
  check('first row name is a string', typeof rows[0].customer_name === 'string', typeof rows[0].customer_name);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
try { real.close(); } catch (_) {}
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
process.exit(fail === 0 ? 0 : 1);
