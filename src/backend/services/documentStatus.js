// Single source of truth for the Invoice and Quote status vocabularies.
//
// Business rules (see the AccuLedger Invoice/Quote workflow spec):
//
//   INVOICE — the *financial* status is NEVER user chosen. It is always derived
//   from real money (invoice total vs. valid payment allocations):
//        Open  →  Partially Paid  →  Paid
//   and it may move backwards when payments are reversed / removed.
//
//   Invoices also carry a small set of *document lifecycle* states that are NOT
//   financial and must survive payment derivation untouched:
//        Draft, Void/Voided, Cancelled/Canceled
//
//   QUOTE — the status is NEVER user chosen. It only changes through explicit
//   workflow actions: acceptQuote / declineQuote / convertQuoteToInvoice:
//        Pending  →  Accepted | Declined | Converted
//        Accepted →  Converted
//
// Both models import these constants so the vocabulary can never drift apart.

// ── Invoice: automatic financial states ────────────────────────────────────
const INVOICE_STATUS = {
  OPEN: 'Open',
  PARTIALLY_PAID: 'Partially Paid',
  PAID: 'Paid',
};

// Canonical order used by filters / pickers.
const INVOICE_FINANCIAL_STATUSES = [
  INVOICE_STATUS.OPEN,
  INVOICE_STATUS.PARTIALLY_PAID,
  INVOICE_STATUS.PAID,
];

// Document lifecycle states — never overwritten by the payment derivation.
const INVOICE_DOCUMENT_STATES = ['draft', 'void', 'voided', 'cancelled', 'canceled'];
const INVOICE_DOCUMENT_STATUSES = ['Draft', 'Void', 'Cancelled'];

// Legacy financial labels that must be normalised away (they described the same
// financial reality as Open / Partially Paid / Paid).
const INVOICE_LEGACY_FINANCIAL = ['pending', 'unpaid', 'sent', 'overdue', 'open', 'partially paid', 'paid'];

// ── Quote: workflow states ─────────────────────────────────────────────────
const QUOTE_STATUS = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  CONVERTED: 'Converted',
};

const QUOTE_STATUSES = [
  QUOTE_STATUS.PENDING,
  QUOTE_STATUS.ACCEPTED,
  QUOTE_STATUS.DECLINED,
  QUOTE_STATUS.CONVERTED,
];

// Legacy active labels that all mean "not yet accepted/declined/converted".
const QUOTE_ACTIVE_LEGACY = ['pending', 'open', 'active', 'sent', 'draft', 'expired', 'new', ''];

// Legacy label used by the old convert-to-invoice flow.
const QUOTE_LEGACY_CONVERTED = ['converted', 'invoiced', 'invoiced/closed'];

// Money is compared to the cent; a sub-cent residue is treated as zero.
const MONEY_TOLERANCE = 0.005;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const lower = (v) => String(v == null ? '' : v).trim().toLowerCase();

const isInvoiceDocumentState = (status) => INVOICE_DOCUMENT_STATES.includes(lower(status));

/**
 * Derive the automatic invoice financial status from real money.
 * Document lifecycle states (Draft / Void / Cancelled) are preserved verbatim.
 *
 * @param {object} p
 * @param {string} p.currentStatus  the currently stored status (may be legacy)
 * @param {number} p.invoiceTotal   invoice total incl. VAT
 * @param {number} p.paidToDate     sum of valid payment allocations applied
 * @returns {string} Open | Partially Paid | Paid | (preserved document state)
 */
function deriveInvoiceStatus({ currentStatus, invoiceTotal, paidToDate } = {}) {
  const current = String(currentStatus == null ? '' : currentStatus).trim();
  if (isInvoiceDocumentState(current)) return current || 'Draft';

  const total = round2(invoiceTotal);
  const paid = round2(paidToDate);
  const balance = round2(total - paid);

  // Outstanding balance → Open (nothing applied) or Partially Paid (something
  // applied). A settled / overpaid invoice (balance <= 0) is always Paid.
  if (balance > MONEY_TOLERANCE) {
    return paid <= MONEY_TOLERANCE ? INVOICE_STATUS.OPEN : INVOICE_STATUS.PARTIALLY_PAID;
  }
  return INVOICE_STATUS.PAID;
}

/**
 * Normalise any stored/legacy quote status onto the canonical workflow values.
 * Active-ish legacy labels collapse onto Pending.
 */
function normalizeQuoteStatus(status) {
  const low = lower(status);
  if (QUOTE_LEGACY_CONVERTED.includes(low)) return QUOTE_STATUS.CONVERTED;
  if (low === 'accepted') return QUOTE_STATUS.ACCEPTED;
  if (low === 'declined' || low === 'rejected') return QUOTE_STATUS.DECLINED;
  if (QUOTE_ACTIVE_LEGACY.includes(low)) return QUOTE_STATUS.PENDING;
  // Unknown → treat as the active default rather than inventing a state.
  return QUOTE_STATUS.PENDING;
}

/** True when a quote is still actionable (accept / decline / convert). */
function isQuoteActive(status) {
  return normalizeQuoteStatus(status) === QUOTE_STATUS.PENDING;
}

/** True when a quote may be converted to an invoice. */
function isQuoteConvertible(status) {
  const s = normalizeQuoteStatus(status);
  return s === QUOTE_STATUS.PENDING || s === QUOTE_STATUS.ACCEPTED;
}

/**
 * Is this document state FINANCIALLY EFFECTIVE — should it post to the General
 * Ledger AND move stock?
 *
 * Draft / Void / Voided / Cancelled / Canceled are a non-financial lifecycle:
 * they contribute $0 to the register and must move no inventory. Everything else
 * (Open, Unpaid, Partially Paid, Paid, Sent, Overdue, …) is effective. An empty
 * status is NOT effective, matching the original truthiness check.
 *
 * THE shared guard for "posting happens on save". It is deliberately used by the
 * invoice GL post, the invoice stock issue AND the bill stock receipt so the
 * three cannot drift: the code this replaces had the same five-way string
 * comparison copy-pasted inline in four places, which is exactly how a new
 * lifecycle state ends up honoured by one path and ignored by another.
 *
 * NOT to be confused with `deriveInvoiceStatus`, which is DERIVED from money and
 * is recomputed on every balance change including a payment — using that as the
 * posting trigger would re-post on every payment.
 */
function isFinanciallyEffective(status) {
  const s = lower(status);
  return s !== '' && !isInvoiceDocumentState(s);
}

module.exports = {
  INVOICE_STATUS,
  INVOICE_FINANCIAL_STATUSES,
  INVOICE_DOCUMENT_STATES,
  INVOICE_DOCUMENT_STATUSES,
  INVOICE_LEGACY_FINANCIAL,
  QUOTE_STATUS,
  QUOTE_STATUSES,
  QUOTE_ACTIVE_LEGACY,
  QUOTE_LEGACY_CONVERTED,
  MONEY_TOLERANCE,
  round2,
  isInvoiceDocumentState,
  isFinanciallyEffective,
  deriveInvoiceStatus,
  normalizeQuoteStatus,
  isQuoteActive,
  isQuoteConvertible,
};
