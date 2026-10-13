/**
 * verify-po-email.js — Purchase Order email reuses the shared document email.
 *
 * Proves: the same template engine builds the PO subject/body (vendor name,
 * PO number, dates, total — never "undefined"), the SAME PDF renderer produces
 * the attachment (PO print == PO email), and the ONE shared dialog + PO wiring
 * are in place. Plain node (documentEmail.js is dependency-free).
 *
 *   node scripts/verify-po-email.js
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend', 'src');

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`); }
};

// Load documentEmail.js (ESM, no imports) in CJS.
function loadDocumentEmail() {
  const src = fs.readFileSync(path.join(FE, 'components', 'customers', 'shared', 'documentEmail.js'), 'utf8');
  const cjs = `${src.replace(/export const /g, 'const ').replace(/export function /g, 'function ')}
module.exports = { DEFAULT_EMAIL_TEMPLATES, selectEmailTemplateKey, buildDocumentEmail, renderTemplate, isInvoiceFullyPaid };`;
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', cjs)(mod, mod.exports);
  return mod.exports;
}
const DE = loadDocumentEmail();

console.log('\n=== template selection (Invoice/Quote unchanged, PO added) ===');
check('Invoice outstanding → invoiceOutstanding', DE.selectEmailTemplateKey({ documentType: 'Invoice', isPaid: false }) === 'invoiceOutstanding');
check('Invoice paid → invoicePaid', DE.selectEmailTemplateKey({ documentType: 'Invoice', isPaid: true }) === 'invoicePaid');
check('Quote → quote', DE.selectEmailTemplateKey({ documentType: 'Quote' }) === 'quote');
check('Purchase Order → purchaseOrder', DE.selectEmailTemplateKey({ documentType: 'Purchase Order' }) === 'purchaseOrder');
check('purchase_order alias → purchaseOrder', DE.selectEmailTemplateKey({ documentType: 'purchase_order' }) === 'purchaseOrder');

console.log('\n=== PO subject + body (TEST 3/4/8/9) ===');
const ctx = {
  companyName: 'TF Diva Solutions', companyPhone: '555-0100', companyEmail: 'hi@tfdiva.com',
  vendorName: 'ABC Supplies', poNumber: 'PO-000123', poDate: '10/01/2026', expectedDate: '10/15/2026', poTotal: '$1,234.00',
};
const built = DE.buildDocumentEmail({ documentType: 'Purchase Order', context: ctx });
check('TEST 3 subject = "Purchase Order PO-000123 - TF Diva Solutions"', built.subject === 'Purchase Order PO-000123 - TF Diva Solutions', built.subject);
check('TEST 4 body has vendor name', /Hello ABC Supplies,/.test(built.body), built.body);
check('TEST 4 body has PO number', /Purchase Order PO-000123/.test(built.body));
check('TEST 4 body has PO date', /PO Date: 10\/01\/2026/.test(built.body));
check('TEST 4 body has expected delivery', /Expected Delivery: 10\/15\/2026/.test(built.body));
check('body has company + contact', /TF Diva Solutions/.test(built.body) && /hi@tfdiva.com/.test(built.body));
check('no "undefined"/"null" anywhere', !/undefined|null/.test(built.subject + built.body));

console.log('\n=== TEST 8 company-only vendor / TEST 9 missing expected date ===');
const built2 = DE.buildDocumentEmail({ documentType: 'Purchase Order', context: { ...ctx, expectedDate: '' } });
check('missing expected date → no "undefined"', !/undefined/.test(built2.body), built2.body);
const built3 = DE.buildDocumentEmail({ documentType: 'Purchase Order', context: { ...ctx, vendorName: 'Westfield Egg Farm' } });
check('company-only vendor name used verbatim', /Hello Westfield Egg Farm,/.test(built3.body));

console.log('\n=== custom PO template override wins (settings) ===');
const custom = DE.buildDocumentEmail({ documentType: 'Purchase Order', config: { po_subject: 'PO {po_number} from {company}', po_body: 'Hi {vendor_name}, see {po_number}.' }, context: ctx });
check('override subject used', custom.subject === 'PO PO-000123 from TF Diva Solutions', custom.subject);
check('override body used', custom.body === 'Hi ABC Supplies, see PO-000123.');

console.log('\n=== static wiring (ONE shared engine, no second PO system) ===');
{
  const de = fs.readFileSync(path.join(FE, 'components', 'customers', 'shared', 'documentEmail.js'), 'utf8');
  check('documentEmail has a purchaseOrder template', /purchaseOrder:\s*\{[\s\S]*Purchase Order \{po_number\}/.test(de));
  check('documentEmail maps po/vendor tokens', /vendor_name: context\.vendorName/.test(de) && /po_number: context\.poNumber/.test(de) && /expected_date: context\.expectedDate/.test(de));

  const sem = fs.readFileSync(path.join(FE, 'components', 'customers', 'shared', 'SendEmailModal.js'), 'utf8');
  check('SendEmailModal handles Purchase Order', /const isPO =/.test(sem) && /getPurchaseOrder\?\.\(documentId\)/.test(sem));
  check('SendEmailModal attaches the SAME PO PDF', /buildPurchaseOrderPdfData/.test(sem));
  check('SendEmailModal logs PO email with document_type purchase_order', /document_type: isPO \? 'purchase_order'/.test(sem));
  check('SendEmailModal shows a no-recipient notice', /noRecipientNotice/.test(sem) && /No email address is saved for this Vendor/.test(sem));

  const po = fs.readFileSync(path.join(FE, 'components', 'vendors', 'purchasing', 'purchaseOrderPdf.js'), 'utf8');
  check('one PO PDF builder (opts + data) reused by print + email', /export function buildPurchaseOrderOpts/.test(po) && /export function buildPurchaseOrderPdfData/.test(po));
  check('PO PDF filename is sanitized Purchase_Order_<no>.pdf', /Purchase_Order_\$\{safe\}\.pdf/.test(po));
  check('PO PDF uses the shared vendor-name resolver', /getCustomerName\(vendor\)/.test(po));
  check('PO PDF uses the shared address formatter', /formatAddressLines\(vendor\)/.test(po));

  const gl = fs.readFileSync(path.join(FE, 'components', 'customers', 'shared', 'generateDocumentPDF.js'), 'utf8');
  check('shared PDF generator titles a Purchase Order', /docType === 'Purchase Order'\s*\?\s*\(T\.purchaseOrderLabel/.test(gl));
  check('shared PDF generator labels PO # / Expected Date', /T\.purchaseOrderNoLabel/.test(gl) && /T\.expectedDateLabel/.test(gl));

  const ui = fs.readFileSync(path.join(FE, 'components', 'vendors', 'purchasing', 'PurchaseOrders.js'), 'utf8');
  check('PO screen reuses the shared SendEmailModal', /import SendEmailModal from '\.\.\/\.\.\/customers\/shared\/SendEmailModal'/.test(ui) && /documentType="Purchase Order"/.test(ui));
  check('PO Print uses the shared PDF renderer (matches the email attachment)', /handleDocumentPDF\('print', buildPurchaseOrderOpts/.test(ui));
  check('PO has an Email action in the list AND detail', /onClick=\{\(\) => handleEmailPO\(r\)\}/.test(ui) && /onClick=\{\(\) => handleEmailPO\(detail\)\}/.test(ui));
  check('PO email no longer builds an ad-hoc HTML body', !/buildPoHtml/.test(ui));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
