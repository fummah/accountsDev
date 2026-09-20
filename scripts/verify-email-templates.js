// Verifies the shared document email templates + PDF stamp rules.
// Run: node scripts\verify-email-templates.js
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`); }
};

// ── Load documentEmail.js (strip ESM keywords, eval) ────────────────────────
const emailSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'frontend', 'src', 'components', 'customers', 'shared', 'documentEmail.js'),
  'utf8'
);
const stripped = emailSrc.replace(/export const /g, 'const ').replace(/export function /g, 'function ');
const mod = new Function(`${stripped}\nreturn { DEFAULT_EMAIL_TEMPLATES, isInvoiceFullyPaid, selectEmailTemplateKey, decodeEscapedNewlines, renderTemplate, buildDocumentEmail, textToSafeHtml };`)();
const { DEFAULT_EMAIL_TEMPLATES, isInvoiceFullyPaid, selectEmailTemplateKey, renderTemplate, buildDocumentEmail, textToSafeHtml } = mod;

const COMPANY = 'Cedar Meadow Farms & Pets';
const baseCtx = {
  companyName: COMPANY, companyPhone: '555-1234', companyEmail: 'info@example.com',
  customerName: 'Ivan Peachey', documentNumber: 'QUO-00001',
  total: '$300.00', balanceDue: '$300.00', dueDate: '09/30/2026', paidDate: '08/31/2026',
};

console.log('\nQUOTE — subject/body/wording');
{
  const r = buildDocumentEmail({ documentType: 'Quote', isPaid: false, config: {}, context: baseCtx });
  check('uses quote template key', r.templateKey === 'quote', r.templateKey);
  check('subject says Quote', r.subject === `Quote from ${COMPANY}`, r.subject);
  check('body greets customer', r.body.startsWith('Dear Ivan Peachey,'), r.body.slice(0, 40));
  check('body mentions quote', /provide you with a quote/.test(r.body));
  check('body attaches quote', /find your quote attached/.test(r.body));
  check('body does NOT say invoice', !/invoice/i.test(r.body));
  check('body has company + phone + email', r.body.includes(COMPANY) && r.body.includes('555-1234') && r.body.includes('info@example.com'));
  check('no literal backslash-n', !/\\n/.test(r.body) && !/\\n/.test(r.subject));
}

console.log('\nPAID INVOICE');
{
  const ctx = { ...baseCtx, documentNumber: 'INV-00004', balanceDue: '$0.00' };
  const r = buildDocumentEmail({ documentType: 'Invoice', isPaid: true, config: {}, context: ctx });
  check('uses paid key', r.templateKey === 'invoicePaid', r.templateKey);
  check('subject is Paid Invoice', r.subject === `Paid Invoice #INV-00004 \u2013 ${COMPANY}`, r.subject);
  check('body thanks for payment', /Thank you for your payment/.test(r.body));
  check('body attaches paid invoice', /find your paid invoice attached/.test(r.body));
  check('no literal backslash-n', !/\\n/.test(r.body));
}

console.log('\nOUTSTANDING INVOICE');
{
  const ctx = { ...baseCtx, documentNumber: 'INV-00005', balanceDue: '$300.00', dueDate: '09/30/2026' };
  const r = buildDocumentEmail({ documentType: 'Invoice', isPaid: false, config: {}, context: ctx });
  check('uses outstanding key', r.templateKey === 'invoiceOutstanding', r.templateKey);
  check('subject is Invoice #number', r.subject === `Invoice #INV-00005 \u2013 ${COMPANY}`, r.subject);
  check('body has balance + due date sentence',
    r.body.includes('The current balance due is $300.00, with a due date of 09/30/2026.'),
    r.body.split('\n').find(l => /balance due/.test(l)));
  check('body does NOT say paid', !/paid invoice attached/.test(r.body));
}

console.log('\nPARTIALLY PAID INVOICE');
{
  const ctx = { ...baseCtx, documentNumber: 'INV-00006', balanceDue: '$200.00', dueDate: '09/30/2026' };
  const r = buildDocumentEmail({ documentType: 'Invoice', isPaid: false, config: {}, context: ctx });
  check('treated as outstanding', r.templateKey === 'invoiceOutstanding', r.templateKey);
  check('balance is $200 not $300', r.body.includes('$200.00') && !r.body.includes('$300.00'));
  check('does NOT use paid wording', !/Thank you for your payment/.test(r.body));
}

console.log('\nPLACEHOLDER / NEWLINE HANDLING');
{
  const withEscapes = 'Dear {customer},\\n\\nLine two {company}.\\n{phone}';
  const out = renderTemplate(withEscapes, { customerName: 'Ivan', companyName: 'Acme', companyPhone: '' });
  check('decodes escaped \\n to real newlines', out === 'Dear Ivan,\n\nLine two Acme.', JSON.stringify(out));
  check('drops empty optional line', !/undefined/.test(out) && !out.includes('\n\n\n'));
  const missing = renderTemplate('{company}\n{phone}\n{email}', { companyName: 'Acme', companyPhone: '', companyEmail: '' });
  check('omits blank phone/email lines', missing === 'Acme', JSON.stringify(missing));
  const html = textToSafeHtml('Dear Ivan,\n\nThank you.');
  check('html has paragraphs', html === '<p>Dear Ivan,</p><p>Thank you.</p>', html);
}

console.log('\nTEMPLATE SELECTION + PAID LOGIC');
{
  check('quote key', selectEmailTemplateKey({ documentType: 'Quote', isPaid: true }) === 'quote');
  check('invoice paid key', selectEmailTemplateKey({ documentType: 'Invoice', isPaid: true }) === 'invoicePaid');
  check('invoice outstanding key', selectEmailTemplateKey({ documentType: 'Invoice', isPaid: false }) === 'invoiceOutstanding');
  check('balance 0 => paid', isInvoiceFullyPaid({ status: 'Paid', balance: 0 }) === true);
  check('balance 200 => not paid', isInvoiceFullyPaid({ status: 'Partially Paid', balance: 200 }) === false);
  check('void never paid', isInvoiceFullyPaid({ status: 'Void', balance: 0 }) === false);
  check('fallback to status text', isInvoiceFullyPaid({ status: 'Paid' }) === true);
}

console.log('\nSYSTEM DEFAULTS CLEAN');
{
  const all = Object.values(DEFAULT_EMAIL_TEMPLATES).map(t => t.subject + '\n' + t.body).join('\n');
  check('no "Pay up!"', !/pay up/i.test(all));
  check('no literal \\n', !/\\n/.test(all));
  check('no hard-coded company', !/Cedar Meadow/.test(all));
}

// ── PDF stamp rules (static) ────────────────────────────────────────────────
console.log('\nPDF STAMP RULES');
{
  const pdf = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'frontend', 'src', 'components', 'customers', 'shared', 'generateDocumentPDF.js'),
    'utf8'
  );
  check('no UNPAID stamp label', !/UNPAID/.test(pdf));
  check('no PARTIAL stamp label', !/'PARTIAL'/.test(pdf));
  check('no old stampForStatus', !/stampForStatus/.test(pdf));
  check('has isFullyPaidInvoice gate', /function isFullyPaidInvoice/.test(pdf));
  check('quote excluded from stamp', /!== 'invoice'\) return false/.test(pdf));
  check('positive angle (rises lower-left->upper-right)', /const angle = 18;/.test(pdf));
  check('no negative angle stamp', !/angle: -28/.test(pdf));
  check('stamp uses header.paidDate only', /header\.paidDate \? String\(header\.paidDate\)/.test(pdf));
  check('PAID label present', /doc\.text\('PAID'/.test(pdf));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
