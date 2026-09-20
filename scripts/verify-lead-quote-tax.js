/**
 * verify-lead-quote-tax.js — the tax field on "Create Quote from a Lead" must be
 * a dropdown linked to the saved tax entities (the `vat` table), matching the
 * standard Create Quote screen. Static wiring + a real DB check of the entities.
 */
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const Module = require('module');
const electronStub = { ipcMain: { handle: () => {} }, app: { isPackaged: true } };
const originalLoad = Module._load;
Module._load = function (request) { if (request === 'electron') return electronStub; return originalLoad.apply(this, arguments); };

require('./lib/testDb.js').useScratchCopy({ label: 'verify-lead-quote-tax' });
const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js')).raw;

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

const FE = path.join(ROOT, 'src', 'frontend', 'src');
const leads = fs.readFileSync(path.join(FE, 'components', 'customers', 'Leads.js'), 'utf8');
const ipc = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'handlers', 'ipcHandlers.js'), 'utf8');

console.log('\n=== Lead quote tax dropdown ===');

// ── the tax field is a dropdown, not a free-typed number ──────────────────
const taxItem = leads.slice(leads.indexOf('name="q_vat"'), leads.indexOf('name="q_vat"') + 900);
check('the lead quote tax field is a Select (dropdown)', /<Select/.test(taxItem), taxItem.slice(0, 120));
check('it is no longer a free-typed InputNumber', !/InputNumber/.test(taxItem));
check('it is bound to the quote tax field (q_vat)', /name="q_vat"/.test(leads));

// ── it is LINKED to the saved tax entities ────────────────────────────────
check('it loads the tax entities via getAllVat', /window\.electronAPI\.getAllVat/.test(leads));
check('it maps the tax entities into options', /vatRates\.map\(v =>/.test(leads));
check('each option shows the tax entity name + percentage', /\{v\.vat_name\} \(\{v\.vat_percentage\}%\)/.test(leads));
check('the option value is the rate percentage used by the quote', /value=\{v\.vat_percentage\}/.test(leads));
check('it offers a No Tax (0%) option', /No Tax \(0%\)/.test(leads));
check('it supports clearing the tax selection', /allowClear/.test(taxItem));

// ── adding a new tax entity, reusing the existing VAT IPC ─────────────────
check('the dropdown offers "Add New Tax Rate"', /Add New Tax Rate/.test(leads));
check('adding a rate reuses insertVat', /window\.electronAPI\.insertVat/.test(leads));
check('adding a rate reloads the entity list', /await fetchVatRates\(\)/.test(leads));
check('the backend registers get-vat', /safeHandle\('get-vat'/.test(ipc));
check('the backend registers insert-vat', /safeHandle\('insert-vat'/.test(ipc));

// ── the totals react to the selection ─────────────────────────────────────
check('selecting a rate updates the live tax percent', /onChange=\{\(v\) => setLeadQuoteVatPercent\(Number\(v\) \|\| 0\)\}/.test(leads));
check('the quote totals use the live tax percent', /const vatRate\s*=\s*Number\(leadQuoteVatPercent\)/.test(leads));
check('opening the modal resets the tax percent', /setLeadQuoteVatPercent\(0\)/.test(leads));
check('the quote payload still sends the numeric vat', /vat: Number\(allVals\.q_vat \|\| 0\)/.test(leads));

// ── real tax entities exist for the dropdown ──────────────────────────────
const rates = db.prepare('SELECT id, vat_name, vat_percentage FROM vat ORDER BY id').all();
check('the vat table has selectable tax entities', rates.length > 0, rates.length);
check('each entity has an id, name and percentage',
  rates.every(r => r.id != null && r.vat_name != null && r.vat_percentage != null),
  JSON.stringify(rates.slice(0, 3)));
console.log('    entities:', rates.map(r => `${r.vat_name} (${r.vat_percentage}%)`).slice(0, 6).join(', '));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
