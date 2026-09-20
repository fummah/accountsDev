/**
 * scripts/run-verification.js — run the verification suite and report a summary.
 *
 * Safety: every suite is expected to run against a scratch copy of the company
 * file (see scripts/lib/testDb.js). This runner records the live database's
 * hash before and after and FAILS LOUDLY if any suite modified it.
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/run-verification.js
 *   ... scripts/run-verification.js --only verify-normal-balance-repair
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const LIVE_DB = path.join(ROOT, 'src', 'backend', 'db', 'accounts.db');
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');

// Suites that are expected to pass. smoke-tests.js is excluded by design: it
// mutates fixtures it does not own and depends on pre-existing reconciliation
// rows, so it is a manual debugging aid rather than a regression gate.
const SUITES = [
  'verify-normal-balance-repair',
  'verify-ledger-opening-balance',
  'verify-bank-reconciliation',
  'verify-status-workflow',
  'verify-migration-rollback',
  'verify-bill-account-eligibility',
  'verify-invoice-status',
  'verify-paid-date',
  'verify-lead-customer-link',
  'verify-lead-quote-status',
  'verify-lead-quote-tax',
  'verify-invoice-customer',
  'verify-create-customer-vendor',
  'verify-contact-identity',
  'verify-tax-rate-dropdown',
  'verify-quote-handlers',
  'verify-document-template-isolation',
  'verify-deposit-delete',
  'verify-deposit-party',
  'verify-receive-payments-filters',
  'verify-enter-bill-due-date',
  'verify-inventory-engine',
  'verify-bill-line-shape',
  'verify-bill-stock',
  'verify-invoice-stock',
  'verify-inventory-integration',
  'verify-product-inventory-stock',
  'verify-financial-reports-pl',
  'verify-pl-subtotals',
  'verify-form-sections',
  'verify-form-field-grid',
  'verify-check-printing',
  'verify-check-split-accounts',
  'verify-email-templates',
  'verify-email-workflow',
  'verify-mail-client',
  'verify-external-links',
  'verify-jsx-compile',
];

const hash = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');

const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;
const suites = only ? SUITES.filter(s => s.includes(only)) : SUITES;

const before = hash(LIVE_DB);
console.log(`live database md5 before: ${before}`);
console.log(`running ${suites.length} suite(s)\n`);

const results = [];
for (const name of suites) {
  const file = path.join(__dirname, `${name}.js`);
  if (!fs.existsSync(file)) { results.push({ name, status: 'MISSING' }); continue; }

  let out = '', failed = false;
  try {
    out = execFileSync(ELECTRON, [file], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      cwd: ROOT,
      stdio: 'pipe',
      maxBuffer: 64 * 1024 * 1024,
      encoding: 'utf8',
    });
  } catch (e) {
    failed = true;
    out = `${e.stdout || ''}\n${e.stderr || ''}`;
  }

  // Pull the suite's own tally out of its output.
  const m = out.match(/(?:RESULT:\s*)?(\d+)\s*passed[,;]?\s*(\d+)\s*failed/i)
        || out.match(/passed:\s*(\d+)\s+failed:\s*(\d+)/i)
        || out.match(/OK:\s*(\d+)\s+FAILED:\s*(\d+)/i);
  const passed = m ? Number(m[1]) : 0;
  const failCount = m ? Number(m[2]) : (failed ? 1 : 0);

  const status = (!failed && failCount === 0 && m) ? 'PASS' : 'FAIL';
  results.push({ name, status, passed, failed: failCount });
  console.log(`  ${status.padEnd(5)} ${name.padEnd(36)} ${m ? `${passed} passed, ${failCount} failed` : 'no tally parsed'}`);
}

const after = hash(LIVE_DB);
console.log(`\nlive database md5 after:  ${after}`);

let bad = results.filter(r => r.status !== 'PASS').length;
if (before !== after) {
  console.log('\n!!! LIVE DATABASE WAS MODIFIED BY A SUITE — this is a bug in the harness !!!');
  bad++;
} else {
  console.log('live database untouched by every suite.');
}

const totalPassed = results.reduce((n, r) => n + (r.passed || 0), 0);
console.log(`\n${results.length - bad}/${results.length} suites passed (${totalPassed} assertions).`);
process.exit(bad ? 1 : 0);
