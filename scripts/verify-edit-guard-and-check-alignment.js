/**
 * verify-edit-guard-and-check-alignment.js
 *
 * PART A — the invoice/quote edit warning has ONE owner (`useDocumentEditGuard`)
 * with a synchronous re-entry lock, and the product-select path sets the tax
 * field INSIDE the guard callback (so one action cannot open two dialogs).
 *
 * PART B — the preprinted check body uses a single physical vertical offset
 * (inches), defaults to +0.50in, is persisted, and can be test-printed without
 * posting accounting.
 *
 * Run: $env:ELECTRON_RUN_AS_NODE="1"; & electron.exe scripts\verify-edit-guard-and-check-alignment.js
 */
/* eslint-disable no-console */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-guard-align' });
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const realLog = console.log.bind(console);
console.log = () => {};
require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
console.log = realLog;
const Settings = require(path.join(ROOT, 'src', 'backend', 'models', 'settings'));

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`); }
};
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

console.log('\n=== PART A: one confirmation owner ===');
{
  const guard = read('src/frontend/src/components/customers/shared/documentEditGuard.js');
  check('documentEditGuard exports useDocumentEditGuard', /export function useDocumentEditGuard/.test(guard));
  check('has a synchronous re-entry lock (pendingRef)', /pendingRef/.test(guard) && /if \(pendingRef\.current\) return pendingRef\.current/.test(guard));
  check('arms the session on confirm (armedRef)', /armedRef\.current = true/.test(guard));
  check('exposes guard + guardWithCancel + reset', /guard, guardWithCancel, armedRef, reset/.test(guard));

  for (const file of ['src/frontend/src/components/customers/invoices/CreateInvoice.js', 'src/frontend/src/components/customers/quotes/CreateQuote.js']) {
    const src = read(file);
    const name = file.includes('invoices') ? 'Invoice' : 'Quote';
    check(`${name}: uses the shared useDocumentEditGuard`, /useDocumentEditGuard\(\{ isEdit, confirm:/.test(src));
    check(`${name}: no local armedRef declaration (single owner)`, !/const armedRef = useRef\(/.test(src));
    check(`${name}: no direct confirm() inside handleFormValuesChange/runEditGuard`, !/const ok = await confirmSavedDocumentEdit/.test(src) && !/confirmSavedDocumentEdit\('(Invoice|Quote)'\)\.then/.test(src));
    check(`${name}: form change routes through guardWithCancel`, /editGuardWithCancel\(/.test(src));
    check(`${name}: resets via resetEditGuard()`, /resetEditGuard\(\)/.test(src));
    // The product-select tax default must be set INSIDE the guard callback.
    const sp = src.slice(src.indexOf('const selectProduct'));
    const guardIdx = sp.indexOf('runEditGuard(() => {');
    const vatIdx = sp.indexOf('form.setFieldsValue({ vat');
    check(`${name}: product-select sets the tax field INSIDE the guard (no double dialog)`, guardIdx !== -1 && vatIdx !== -1 && vatIdx > guardIdx, { guardIdx, vatIdx });
  }
}

console.log('\n=== PART B: preprinted check alignment ===');
{
  const cp = read('src/frontend/src/components/accountant/CheckPrinting.js');
  check('check body vertical offset is a CSS variable applied to the whole body', /--check-offset-y: \$\{Number\(alignYIn/.test(cp) && /margin-top: var\(--check-offset-y\)/.test(cp));
  check('default vertical offset is +0.50in', /useState\(0\.5\)/.test(cp));
  check('horizontal offset defaults to 0', /const \[alignXIn, setAlignXIn\] = useState\(0\)/.test(cp));
  check('alignment is loaded from persisted settings', /getCheckPrintSettings/.test(cp));
  check('alignment is saved to persisted settings', /saveCheckPrintSettings/.test(cp));
  check('a safe Print Test Check exists (no transaction)', /printTestCheck/.test(cp) && /generateCheckHtml\(sample, true\)/.test(cp));
  check('uses physical units (in)', /\$\{Number\(alignYIn \|\| 0\)\}in/.test(cp) && /\$\{Number\(alignXIn \|\| 0\)\}in/.test(cp));

  const handlers = read('src/backend/handlers/settingsHandlers.js');
  check('backend get-check-print-settings defaults Y to 0.5', /get-check-print-settings/.test(handlers) && /offsetYIn: s\.offsetYIn != null[\s\S]{0,60}\? Number\(s\.offsetYIn\) : 0\.5/.test(handlers));
  check('backend save-check-print-settings exists', /save-check-print-settings/.test(handlers));
  const preload = read('src/backend/preload.js');
  check('preload exposes getCheckPrintSettings / saveCheckPrintSettings', /getCheckPrintSettings/.test(preload) && /saveCheckPrintSettings/.test(preload));
}

console.log('\n=== PART B: settings persistence roundtrip ===');
{
  Settings.set('checkPrintSettings', { offsetYIn: 0.45, offsetXIn: 0 });
  const s = Settings.get('checkPrintSettings');
  check('saved alignment round-trips', s && Number(s.offsetYIn) === 0.45 && Number(s.offsetXIn) === 0);
  Settings.set('checkPrintSettings', { offsetYIn: 0.5, offsetXIn: 0 });
  check('default +0.50in persisted', Number(Settings.get('checkPrintSettings').offsetYIn) === 0.5);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
