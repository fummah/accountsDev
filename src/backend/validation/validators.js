function ensureString(v, name, { max = 255, required = true } = {}) {
  if (!required && (v === undefined || v === null || v === '')) return '';
  if (typeof v !== 'string') throw new Error(`${name} must be a string`);
  if (v.length > max) throw new Error(`${name} is too long`);
  return v;
}

function ensureNumber(v, name, { min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, required = true } = {}) {
  if (!required && (v === undefined || v === null || v === '')) return 0;
  const n = Number(v);
  if (!isFinite(n)) throw new Error(`${name} must be a number`);
  if (n < min || n > max) throw new Error(`${name} out of range`);
  return n;
}

function ensureArray(v, name, { minLen = 0, required = true } = {}) {
  if (!required && (v === undefined || v === null)) return [];
  if (!Array.isArray(v)) throw new Error(`${name} must be an array`);
  if (v.length < minLen) throw new Error(`${name} must have at least ${minLen} item(s)`);
  return v;
}

function validateTransaction(tx) {
  if (!tx) throw new Error('Transaction payload required');
  ensureString(tx.date, 'date');
  ensureString(tx.type, 'type');
  ensureString(tx.description || '', 'description', { required: false, max: 1000 });
  if (tx.debit != null && tx.credit != null && Number(tx.debit) > 0 && Number(tx.credit) > 0) {
    throw new Error('Transaction cannot have both debit and credit > 0');
  }
  return true;
}

function validateJournal(entry) {
  if (!entry) throw new Error('Journal payload required');
  ensureString(entry.date, 'date');
  ensureString(entry.description || '', 'description', { required: false, max: 1000 });
  const lines = ensureArray(entry.lines, 'lines', { minLen: 1 });
  lines.forEach((l, i) => {
    ensureString(l.account, `lines[${i}].account`);
    if (l.debit && l.credit) throw new Error(`lines[${i}] both debit and credit provided`);
    if (ensureNumber(l.debit || 0, `lines[${i}].debit`, { required: false, min: 0 }) < 0) throw new Error('Negative debit');
    if (ensureNumber(l.credit || 0, `lines[${i}].credit`, { required: false, min: 0 }) < 0) throw new Error('Negative credit');
  });
  return true;
}

function validateInvoice(inv) {
  if (!inv) throw new Error('Invoice payload required');
  ensureNumber(inv.customer, 'customer');
  ensureString(inv.start_date, 'start_date');
  ensureString(inv.last_date || '', 'last_date', { required: false });
  const lines = ensureArray(inv.lines || inv.invoiceLines || inv.quoteLines, 'lines', { required: false, minLen: 0 });
  lines.forEach((l, i) => {
    ensureNumber(l.product_id || l.product || 0, `lines[${i}].product`, { required: false });
    ensureString(l.description || '', `lines[${i}].description`, { required: false, max: 1000 });
    ensureNumber(l.quantity || 1, `lines[${i}].quantity`, { min: 0 });
    ensureNumber(l.amount || l.rate || 0, `lines[${i}].amount`, { required: false, min: 0 });
  });
  return true;
}

module.exports = {
  validateTransaction,
  validateJournal,
  validateInvoice
};


