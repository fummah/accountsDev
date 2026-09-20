/* Verify Quote and Invoice template settings are stored/read independently. */
const path = require('path');
const fs = require('fs');
const Module = require('module');
const electronStub = { ipcMain: { handle: () => {} }, app: { isPackaged: true } };
const originalLoad = Module._load;
Module._load = function (request) { if (request === 'electron') return electronStub; return originalLoad.apply(this, arguments); };

require('./lib/testDb.js').useScratchCopy({ label: 'probe-quote-template' });
const ROOT = path.join(__dirname, '..');
const Settings = require(path.join(ROOT, 'src', 'backend', 'models', 'settings.js'));

let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (d ? ' -> ' + d : '')); } };

// Write two DIFFERENT templates under the two keys the customization screens use.
Settings.set('quoteTemplate', { footer: 'QUOTE-FOOTER', title: 'QUOTE', logoBase64: 'QUOTE-LOGO' });
Settings.set('invoiceTemplate', { footer: 'INVOICE-FOOTER', title: 'INVOICE', logoBase64: 'INVOICE-LOGO' });

const q = Settings.get('quoteTemplate');
const i = Settings.get('invoiceTemplate');
check('quote and invoice templates are separate settings rows', q && i && q !== i);
check('quote template keeps its own footer', q.footer === 'QUOTE-FOOTER', JSON.stringify(q));
check('invoice template keeps its own footer', i.footer === 'INVOICE-FOOTER', JSON.stringify(i));
check('changing invoice does not touch quote',
  (Settings.set('invoiceTemplate', { footer: 'CHANGED' }), Settings.get('quoteTemplate').footer === 'QUOTE-FOOTER'));

const handlers = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'handlers', 'settingsHandlers.js'), 'utf8');
check('get-quote-template reads the quoteTemplate key', /get-quote-template'[\s\S]{0,120}Settings\.get\('quoteTemplate'\)/.test(handlers));
check('save-quote-template writes the quoteTemplate key', /save-quote-template'[\s\S]{0,160}Settings\.set\('quoteTemplate'/.test(handlers));
check('get-invoice-template reads the invoiceTemplate key', /get-invoice-template'[\s\S]{0,120}Settings\.get\('invoiceTemplate'\)/.test(handlers));
check('save-invoice-template writes the invoiceTemplate key', /save-invoice-template'[\s\S]{0,160}Settings\.set\('invoiceTemplate'/.test(handlers));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
