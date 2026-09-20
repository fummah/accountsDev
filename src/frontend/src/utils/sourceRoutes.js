// Shared mapping between a journal entry's source_type and the application
// route for the original source transaction. Used by the Journal Entry
// detail modal, the General Ledger, the Journal Entries list, and the
// transaction modules for bidirectional drill-down navigation.
//
// Returns the EXACT route for a known source transaction, or null when there
// is no dedicated screen for it. Source types that only have a full-list
// screen (payment, transfer, check, credit_note, vendor_credit, payroll,
// reconciliation, …) deep-link to the SPECIFIC journal entry via
// `/main/accountant/journal-entries?journal=<id>` when a journalId is known,
// so "Open in original" never dumps the user on a full list page.

export const SOURCE_LABELS = {
  invoice: 'Invoice',
  expense: 'Bill',
  bill_payment: 'Bill Payment',
  payment: 'Payment',
  deposit: 'Deposit',
  transaction: 'Transaction',
  check: 'Check',
  transfer: 'Transfer',
  intercompany_transfer: 'Intercompany Transfer',
  credit_note: 'Credit Note',
  vendor_credit: 'Vendor Credit',
  reversal: 'Reversal',
  reconciliation: 'Reconciliation',
  quote: 'Quote',
  recurring: 'Recurring',
  payroll: 'Payroll',
  seed: 'Seed',
};

export const SOURCE_COLORS = {
  invoice: 'blue', payment: 'green', expense: 'orange', bill: 'volcano',
  bill_payment: 'magenta', deposit: 'cyan', transaction: 'geekblue',
  check: 'purple', transfer: 'lime', intercompany_transfer: 'lime',
  payroll: 'gold', manual: 'default', reconciliation: 'cyan',
  quote: 'geekblue', vendor_credit: 'volcano', credit_note: 'blue',
  reversal: 'red', recurring: 'gold', seed: 'default',
};

// Deep-link to the specific journal entry inside the Journal Entries page.
// The page opens the entry's detail modal from the ?journal= query param.
const journalEntryRoute = (journalId) =>
  journalId != null ? `/main/accountant/journal-entries?journal=${journalId}` : null;

export const getSourceTransactionRoute = (sourceType, sourceId, sourceDetail = {}, journalId) => {
  const id = sourceId;
  switch (sourceType) {
    case 'invoice':
      return id != null ? `/main/customers/invoices/edit/${id}` : null;
    case 'expense':
    case 'bill_payment':
      return id != null ? `/main/vendors/bills/edit/${id}` : null;
    case 'deposit':
      // The deposits page accepts ?deposit=<id> to open that specific deposit.
      return id != null ? `/main/banking/deposits?deposit=${id}` : null;
    case 'payment':
      // Payments have no single-record screen — open the specific journal entry.
      return journalEntryRoute(journalId) || '/main/customers/payments';
    case 'transaction': {
      const kind = String(sourceDetail.kind || sourceDetail.label || '').toLowerCase();
      if (kind.includes('check')) return journalEntryRoute(journalId) || '/main/accountant/check-printing';
      if (kind.includes('credit card')) return journalEntryRoute(journalId) || '/main/expenses/credit-cards';
      if (sourceDetail.kind === 'bill' && sourceDetail.id) return `/main/vendors/bills/edit/${sourceDetail.id}`;
      return journalEntryRoute(journalId);
    }
    case 'check':
      return journalEntryRoute(journalId) || '/main/accountant/check-printing';
    case 'transfer':
    case 'intercompany_transfer':
      return journalEntryRoute(journalId) || '/main/banking/transfers';
    case 'credit_note':
      return journalEntryRoute(journalId) || '/main/customers/credit-notes';
    case 'vendor_credit':
      return journalEntryRoute(journalId) || '/main/vendors/credits';
    case 'quote':
      return id != null ? `/main/customers/quotes/edit/${id}` : null;
    case 'payroll':
      return journalEntryRoute(journalId) || '/main/employees/payroll';
    case 'reconciliation':
      return journalEntryRoute(journalId) || '/main/banking/reconcile';
    default:
      // reversal, seed, manual, recurring, unknown → the original is the
      // journal entry itself, so deep-link to it when the entry id is known.
      return journalEntryRoute(journalId);
  }
};