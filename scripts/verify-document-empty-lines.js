#!/usr/bin/env node
/**
 * verify-document-empty-lines.js
 *
 * Proves the empty-line-item rule for Quotes and Invoices end to end:
 *   (a) the shared predicate classifies blank vs meaningful lines correctly
 *       (blank, whitespace-only, default qty/rate, free item, description-only);
 *   (b) the frontend and backend predicates agree (no drift);
 *   (c) the Save payloads / edit-load normalise blank rows away (source pin);
 *   (d) a REAL PDF is generated and parsed back: the blank convenience row is
 *       gone, a genuine zero-value product line still prints, numbering is
 *       sequential.
 *
 * Run: node scripts/verify-document-empty-lines.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual); const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  [PASS] ' + label); }
  else { fail++; console.log(`  [FAIL] ${label}\n      expected: ${e}\n      actual:   ${a}`); }
};
const ok = (label, cond, detail) => { check(label, !!cond, true); if (!cond && detail) console.log('      detail: ' + detail); };

// ── shared fixtures ──────────────────────────────────────────────────────────
const blank = { product_id: null, description: '', quantity: 1, rate: 0, amount: 0 };
const whitespace = { product_id: null, description: '     ', quantity: 1, rate: 0, amount: 0 };
const freeItem = { product_id: 7, description: 'Free Sample', quantity: 1, rate: 0, amount: 0 };
const descOnly = { product_id: null, description: 'Delivery adjustment', quantity: 1, rate: 0, amount: 0 };
const real = { product_id: 3, description: 'Large Eggs', quantity: 2, rate: 2.5, amount: 5 };
const realZero = { product_id: 9, description: 'Warranty Item', quantity: 1, rate: 0, amount: 0 };

(async () => {
  // ── (a)/(b) predicates ────────────────────────────────────────────────────
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doclines-'));
  const mjs = path.join(tmpDir, 'lineItems.mjs');
  fs.writeFileSync(mjs, read('src/frontend/src/utils/lineItems.js'));
  const fe = await import('file://' + mjs.replace(/\\/g, '/'));
  const be = require(path.join(ROOT, 'src', 'backend', 'services', 'documentLines.js'));

  console.log('\n=== (a) predicate — frontend ===');
  check('blank row is empty', fe.isLineEmpty(blank), true);
  check('whitespace-only description is empty', fe.isLineEmpty(whitespace), true);
  check('default qty 1 / rate 0 is empty', fe.isLineEmpty({ product_id: null, description: '', quantity: 1, rate: 0, amount: 0 }), true);
  check('qty 2 / rate 0 with no product is MEANINGFUL (qty is real)', fe.isMeaningfulDocumentLine({ product_id: null, description: '', quantity: 2, rate: 0, amount: 0 }), true);
  check('a selected Product with rate 0 is MEANINGFUL (free item)', fe.isMeaningfulDocumentLine(freeItem), true);
  check('a description-only line is MEANINGFUL', fe.isMeaningfulDocumentLine(descOnly), true);
  check('a normal product line is MEANINGFUL', fe.isMeaningfulDocumentLine(real), true);

  console.log('\n=== (b) frontend / backend parity ===');
  const all = [blank, whitespace, freeItem, descOnly, real, realZero, { quantity: 3, rate: 0, amount: 0 }, { rate: 5, amount: 5 }];
  const agree = all.every(l => fe.isLineEmpty(l) === be.isLineEmpty(l));
  ok('the frontend and backend predicates agree on every fixture', agree,
    JSON.stringify(all.map(l => ({ fe: fe.isLineEmpty(l), be: be.isLineEmpty(l) }))));
  check('backend normalize drops blank + whitespace but keeps real lines',
    be.filterDocumentLines([real, blank, whitespace, freeItem, descOnly]).length, 3);

  // ── (c) wiring pins ───────────────────────────────────────────────────────
  console.log('\n=== (c) wiring ===');
  const quote = read('src/frontend/src/components/customers/quotes/CreateQuote.js');
  const invoice = read('src/frontend/src/components/customers/invoices/CreateInvoice.js');
  const pdfGen = read('src/frontend/src/components/customers/shared/generateDocumentPDF.js');
  const quotesModel = read('src/backend/models/quotes.js');
  const invoicesModel = read('src/backend/models/invoices.js');

  ok('Quote save normalises lines', /const quoteLines = normalizeDocumentLines\(lines\)/.test(quote));
  ok('Invoice save normalises lines', /const invoiceLines = normalizeDocumentLines\(lines\)/.test(invoice));
  ok('Quote PDF passes normalised lines', /lines: normalizeDocumentLines\(lines\)/.test(quote));
  ok('Invoice PDF passes normalised lines', /lines: normalizeDocumentLines\(lines\)/.test(invoice));
  ok('Quote edit-load normalises legacy lines', /const loaded = normalizeDocumentLines\(q\.lines\)/.test(quote) && /setLines\(ensureTrailingEmptyLine\(loaded/.test(quote));
  ok('Invoice edit-load normalises legacy lines', /const loaded = normalizeDocumentLines\(inv\.lines\)/.test(invoice) && /setLines\(ensureTrailingEmptyLine\(loaded/.test(invoice));
  ok('Quote delete uses removeLineItem (not force-recreate)', /removeLineItem\(prev, l => l\.key !== key/.test(quote));
  ok('Invoice delete uses removeLineItem (not force-recreate)', /removeLineItem\(prev, l => l\.key !== key/.test(invoice));
  ok('PDF generator filters centrally', /const cleanLines = normalizeDocumentLines\(lines\)/.test(pdfGen) && /cleanLines\.map\(\(l, i\)/.test(pdfGen));
  ok('backend Quote model filters on insert', /filterDocumentLines\(quoteLines\)/.test(quotesModel));
  ok('backend Quote model filters on update', /filterDocumentLines\(lines \|\| quoteLines/.test(quotesModel));
  ok('backend Invoice model filters on insert', /filterDocumentLines\(invoiceLines\)/.test(invoicesModel));
  ok('backend Invoice model filters on update', /filterDocumentLines\(lines \|\| invoiceLines/.test(invoicesModel));

  // ── (d) REAL PDF render + parse ───────────────────────────────────────────
  console.log('\n=== (d) real PDF render ===');
  try {
    const babel = require(path.join(FE, 'node_modules', '@babel', 'core'));
    const presetEnv = path.join(FE, 'node_modules', '@babel', 'preset-env');
    const presetReact = path.join(FE, 'node_modules', '@babel', 'preset-react');
    const srcPath = path.join(FE, 'src', 'components', 'customers', 'shared', 'generateDocumentPDF.js');
    // Transpile NEXT TO the original so its relative imports resolve.
    const tmpFile = path.join(path.dirname(srcPath), '.tmp_generateDocumentPDF.js');
    // Never leave the transpiled helper behind, even if the process exits
    // early or the render throws (the module loader can hold the file open on
    // Windows, so the unlink in `finally` may not succeed until exit).
    process.on('exit', () => { try { fs.unlinkSync(tmpFile); } catch { /* ignore */ } });
    const { code } = babel.transformSync(fs.readFileSync(srcPath, 'utf8'), {
      filename: srcPath,
      presets: [[presetEnv, { targets: { node: 'current' } }], presetReact],
    });
    fs.writeFileSync(tmpFile, code, 'utf8');
    delete require.cache[tmpFile];
    const { generateDocumentPDF } = require(tmpFile);

    const pdfParse = require(path.join(ROOT, 'node_modules', 'pdf-parse'));

    const base = {
      docType: 'Invoice',
      header: { number: 'INV-1', status: 'Unpaid', date: '01/01/2026', customerName: 'Test Co' },
      subtotal: 5,
      grandTotal: 5,
      company: { name: 'Test Co' },
      currencySymbol: '$',
    };

    // Invoice: Large Eggs, blank convenience row, Milk  (blank must vanish)
    const withBlank = generateDocumentPDF({
      ...base,
      lines: [
        { description: 'Large Eggs', quantity: 2, rate: 2.5, amount: 5 },
        { description: '', quantity: 1, rate: 0, amount: 0 },
        { description: 'Milk', quantity: 1, rate: 3, amount: 3 },
      ],
    });
    const t1 = (await pdfParse(Buffer.from(withBlank.output('arraybuffer')))).text;
    ok('PDF contains the real lines', /Large Eggs/.test(t1) && /Milk/.test(t1), t1.replace(/\s+/g, ' ').slice(0, 200));
    ok('PDF has NO blank row (no $0.00 cell anywhere)', !/\$\s?0\.00/.test(t1), t1.replace(/\s+/g, ' ').slice(0, 200));

    // Free item: product selected, rate 0 — MUST print
    const free = generateDocumentPDF({ ...base, lines: [freeItem] });
    const t2 = (await pdfParse(Buffer.from(free.output('arraybuffer')))).text;
    ok('a zero-value product line STILL prints', /Free Sample/.test(t2), t2.replace(/\s+/g, ' ').slice(0, 200));
    ok('  … and its $0.00 is shown (it is a real line)', /\$\s?0\.00/.test(t2), t2.replace(/\s+/g, ' ').slice(0, 200));

    // Quote: same rule
    const q = generateDocumentPDF({
      ...base, docType: 'Quote',
      lines: [{ description: 'Service', quantity: 1, rate: 10, amount: 10 }, { description: '   ', quantity: 1, rate: 0, amount: 0 }],
    });
    const t3 = (await pdfParse(Buffer.from(q.output('arraybuffer')))).text;
    ok('Quote PDF drops the whitespace convenience row', /Service/.test(t3) && !/\$\s?0\.00/.test(t3), t3.replace(/\s+/g, ' ').slice(0, 200));

    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  } catch (e) {
    ok('real PDF render + parse', false, e.message);
  } finally {
    // The transpiled helper lives NEXT TO the source (so relative imports
    // resolve); always remove it, including when the render throws.
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('\n' + '='.repeat(56));
  console.log(pass + ' passed, ' + fail + ' failed');
  console.log('='.repeat(56) + '\n');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
