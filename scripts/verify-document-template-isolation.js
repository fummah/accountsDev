/**
 * verify-document-template-isolation.js
 *
 * End-to-end proof that a Quote renders with the QUOTE template settings and an
 * Invoice renders with the INVOICE template settings — the two never bleed.
 *
 * It runs the REAL renderer (src/frontend/src/components/customers/shared/
 * generateDocumentPDF.js) in Node by transpiling its ESM to CJS with the
 * frontend's own Babel + jspdf, then reads the produced PDF bytes. jsPDF writes
 * uncompressed content streams, so the template labels/footer appear verbatim.
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend');
const RENDERER = path.join(FE, 'src', 'components', 'customers', 'shared', 'generateDocumentPDF.js');

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

// ── load the real renderer (ESM → CJS) with the frontend's own deps ─────────
const babel = require(path.join(FE, 'node_modules', '@babel', 'core'));
const presetEnv = require(path.join(FE, 'node_modules', '@babel', 'preset-env'));
const jspdfPath = path.join(FE, 'node_modules', 'jspdf');
const autotablePath = path.join(FE, 'node_modules', 'jspdf-autotable');

const src = fs.readFileSync(RENDERER, 'utf8');
const { code } = babel.transformSync(src, {
  filename: RENDERER, babelrc: false, configFile: false,
  presets: [[presetEnv, { targets: { node: 'current' }, modules: 'commonjs' }]],
});
// The renderer now imports the shared line-item helper; transpile it too and
// hand it to the shim so this Node harness can resolve the relative import.
const lineItemsPath = path.join(FE, 'src', 'utils', 'lineItems.js');
const lineItemsCode = babel.transformSync(fs.readFileSync(lineItemsPath, 'utf8'), {
  filename: lineItemsPath, babelrc: false, configFile: false,
  presets: [[presetEnv, { targets: { node: 'current' }, modules: 'commonjs' }]],
}).code;
const lineItemsMod = { exports: {} };
// eslint-disable-next-line no-new-func
new Function('require', 'module', 'exports', lineItemsCode)(require, lineItemsMod, lineItemsMod.exports);

const mod = { exports: {} };
const shimRequire = (id) => {
  if (id === 'jspdf') return require(jspdfPath);
  if (id === 'jspdf-autotable') return require(autotablePath);
  if (id === '../../../utils/lineItems') return lineItemsMod.exports;
  return require(id);
};
// eslint-disable-next-line no-new-func
new Function('require', 'module', 'exports', '__filename', '__dirname', code)(shimRequire, mod, mod.exports, RENDERER, path.dirname(RENDERER));
const { generateDocumentPDF } = mod.exports;
check('the real document renderer loads', typeof generateDocumentPDF === 'function');

// ── a minimal document ──────────────────────────────────────────────────────
const docOpts = (docType, templateSettings) => ({
  docType,
  header: { number: 'DOC-1', status: 'Open', date: '2026-01-01', dueDate: '2026-01-31', terms: 'Net 30', customerName: 'Test Customer', email: '', billingAddress: '' },
  lines: [{ description: 'Consulting', quantity: 1, rate: 100, amount: 100 }],
  subtotal: 100, vatPercent: 0, vatAmount: 0, grandTotal: 100, paidToDate: 0,
  message: '', statementMemo: '',
  company: { name: 'Test Co', email: '', phone: '', address: '' },
  currencySymbol: '$',
  templateSettings,
});

const renderText = (docType, templateSettings) => {
  const doc = generateDocumentPDF(docOpts(docType, templateSettings));
  return Buffer.from(doc.output('arraybuffer')).toString('latin1');
};

console.log('\n=== Quote vs Invoice template isolation (rendered PDF) ===');

const QUOTE_TPL = { quoteLabel: 'ZQTLBL', quoteNoLabel: 'ZQNO', footerText: 'ZQFOOTER', validUntilLabel: 'ZQVALID' };
const INV_TPL = { invoiceLabel: 'ZINVLBL', invoiceNoLabel: 'ZINVNO', footerText: 'ZIFOOTER', dueDateLabel: 'ZIDUE' };

const quotePdf = renderText('Quote', QUOTE_TPL);
const invoicePdf = renderText('Invoice', INV_TPL);

check('Quote PDF carries the QUOTE label', quotePdf.includes('ZQTLBL'));
check('Quote PDF carries the QUOTE number label', quotePdf.includes('ZQNO'));
check('Quote PDF carries the QUOTE footer', quotePdf.includes('ZQFOOTER'));
check('Quote PDF does NOT carry any INVOICE label', !quotePdf.includes('ZINVLBL') && !quotePdf.includes('ZINVNO'));
check('Quote PDF does NOT carry the INVOICE footer', !quotePdf.includes('ZIFOOTER'));

check('Invoice PDF carries the INVOICE label', invoicePdf.includes('ZINVLBL'));
check('Invoice PDF carries the INVOICE number label', invoicePdf.includes('ZINVNO'));
check('Invoice PDF carries the INVOICE footer', invoicePdf.includes('ZIFOOTER'));
check('Invoice PDF does NOT carry any QUOTE label', !invoicePdf.includes('ZQTLBL'));
check('Invoice PDF does NOT carry the QUOTE footer', !invoicePdf.includes('ZQFOOTER'));

// ── the two customization screens persist to separate keys ──────────────────
const handlers = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'handlers', 'settingsHandlers.js'), 'utf8');
check('Quote customization saves to the quoteTemplate key', /save-quote-template'[\s\S]{0,160}Settings\.set\('quoteTemplate'/.test(handlers));
check('Invoice customization saves to the invoiceTemplate key', /save-invoice-template'[\s\S]{0,160}Settings\.set\('invoiceTemplate'/.test(handlers));

// ── the callers feed the matching template into the renderer ────────────────
const quoteCalls = fs.readFileSync(path.join(FE, 'src', 'components', 'customers', 'quotes', 'CreateQuote.js'), 'utf8');
const invoiceCalls = fs.readFileSync(path.join(FE, 'src', 'components', 'customers', 'invoices', 'CreateInvoice.js'), 'utf8');
check('CreateQuote reads the quote template', /getQuoteTemplate/.test(quoteCalls));
check('CreateInvoice reads the invoice template', /getInvoiceTemplate/.test(invoiceCalls));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
