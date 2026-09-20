// Centralized document email templates and rendering.
//
// ONE source of truth for:
//  - selecting the subject/body by document type (Quote vs Invoice)
//  - selecting the invoice template by payment state (Paid vs Outstanding)
//  - placeholder replacement
//  - newline handling (real paragraphs, never a visible literal "\n")

// Approved system defaults. Keep the wording exactly as specified.
export const DEFAULT_EMAIL_TEMPLATES = {
  quote: {
    subject: 'Quote from {company}',
    body: [
      'Dear {customer},',
      '',
      'Thank you for the opportunity to provide you with a quote. Please find your quote attached for your review.',
      '',
      "If you have any questions or would like to make any changes, please don't hesitate to contact us. We look forward to doing business with you.",
      '',
      'Thank you for considering {company}.',
      '',
      'Best regards,',
      '{company}',
      '{phone}',
      '{email}',
    ].join('\n'),
  },
  invoicePaid: {
    subject: 'Paid Invoice #{number} \u2013 {company}',
    body: [
      'Dear {customer},',
      '',
      'Thank you for your payment. Please find your paid invoice attached for your records.',
      '',
      'We sincerely appreciate your business and look forward to serving you again in the future.',
      '',
      'Thank you,',
      '{company}',
      '{phone}',
      '{email}',
    ].join('\n'),
  },
  invoiceOutstanding: {
    subject: 'Invoice #{number} \u2013 {company}',
    body: [
      'Dear {customer},',
      '',
      'Thank you for your business. Please find your invoice attached for your records. The current balance due is {balance}, with a due date of {due_date}.',
      '',
      "If you have already submitted payment, please disregard this message. If you have any questions regarding the invoice, please don't hesitate to contact us.",
      '',
      'We appreciate your business and look forward to working with you.',
      '',
      'Thank you,',
      '{company}',
      '{phone}',
      '{email}',
    ].join('\n'),
  },
};

const VOID_LIKE = ['void', 'voided', 'cancelled', 'canceled', 'draft'];

// Decide whether an invoice is fully settled, from real financial data.
// Prefers an explicit balance; falls back to the status text only if needed.
export function isInvoiceFullyPaid({ status, balance } = {}) {
  const s = String(status || '').toLowerCase();
  if (VOID_LIKE.includes(s)) return false;
  if (balance !== undefined && balance !== null && balance !== '' && Number.isFinite(Number(balance))) {
    return Number(balance) <= 0.005;
  }
  return s === 'paid';
}

// Pick the template key from document type + payment state.
export function selectEmailTemplateKey({ documentType, isPaid } = {}) {
  if (String(documentType || '').toLowerCase() === 'quote') return 'quote';
  return isPaid ? 'invoicePaid' : 'invoiceOutstanding';
}

// Turn literal escaped newlines (e.g. a value stored as "line\\nline") into
// real newlines so they can never be shown to a recipient.
export function decodeEscapedNewlines(input) {
  return String(input == null ? '' : input)
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n');
}

// Replace {token} / {{token}} placeholders from the context. Optional company
// details that resolve to empty collapse their whole line away.
export function renderTemplate(template, context = {}) {
  const map = {
    company: context.companyName,
    companyName: context.companyName,
    company_name: context.companyName,
    customer: context.customerName,
    customerName: context.customerName,
    customer_name: context.customerName,
    number: context.documentNumber,
    documentNumber: context.documentNumber,
    document_number: context.documentNumber,
    amount: context.total,
    total: context.total,
    balance: context.balanceDue,
    balanceDue: context.balanceDue,
    balance_due: context.balanceDue,
    due_date: context.dueDate,
    dueDate: context.dueDate,
    phone: context.companyPhone,
    phone_number: context.companyPhone,
    email: context.companyEmail,
    company_email: context.companyEmail,
  };
  const valueOf = (key) => {
    const v = map[key];
    return v === undefined || v === null ? '' : String(v);
  };
  const decoded = decodeEscapedNewlines(template);
  const replaced = decoded
    .replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, k) => valueOf(k))
    .replace(/\{\s*([\w]+)\s*\}/g, (_, k) => valueOf(k));
  return collapseBlankLines(replaced);
}

function collapseBlankLines(text) {
  const lines = String(text == null ? '' : text).split('\n').map(l => l.replace(/[ \t]+$/, ''));
  const out = [];
  for (const line of lines) {
    if (line.trim() === '' && out.length && out[out.length - 1].trim() === '') continue;
    out.push(line);
  }
  while (out.length && out[0].trim() === '') out.shift();
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return out.join('\n');
}

// Build the subject + body for a document.
// config = the saved email settings (per-type overrides win; empty → approved default).
export function buildDocumentEmail({ documentType = 'Invoice', isPaid = false, config = {}, context = {} } = {}) {
  const key = selectEmailTemplateKey({ documentType, isPaid });
  const override = {
    quote: { subject: config.quote_subject, body: config.quote_body },
    invoicePaid: { subject: config.invoice_paid_subject, body: config.invoice_paid_body },
    invoiceOutstanding: { subject: config.invoice_outstanding_subject, body: config.invoice_outstanding_body },
  }[key] || {};
  const def = DEFAULT_EMAIL_TEMPLATES[key];
  const subjectTemplate = override.subject && String(override.subject).trim() ? override.subject : def.subject;
  const bodyTemplate = override.body && String(override.body).trim() ? override.body : def.body;
  return {
    templateKey: key,
    subject: renderTemplate(subjectTemplate, context),
    body: renderTemplate(bodyTemplate, context),
  };
}

// Convert the plain-text body into safe HTML with real paragraph/line breaks,
// for the on-screen preview only (and available for HTML emails).
export function textToSafeHtml(text) {
  const escaped = decodeEscapedNewlines(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .split(/\n{2,}/)
    .map(block => `<p>${block.replace(/\n/g, '<br/>')}</p>`)
    .join('');
}
