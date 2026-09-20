// Explicit Quote workflow operations.
//
// Quote status is never edited directly. These channels are the ONLY way a
// quote can move between Pending → Accepted / Declined / Converted, and each
// one validates the current state on the backend before transitioning.
//
//   accept-quote            Pending → Accepted
//   decline-quote           Pending → Declined
//   convert-quote-to-invoice Pending | Accepted → Converted (+ new Invoice, Open)
//
// The legacy `convertquote` channel (registered in accountingHandlers) delegates
// to the same model method, so both entry points share one implementation.

const { ipcMain } = require('electron');
const Quotes = require('../models/quotes');
const AuditLog = require('../models/auditLog');
const { authorize } = require('../security/authz');

const registerQuoteHandlers = () => {
  // Skip duplicate registrations instead of throwing (mirrors ipcHandlers).
  const safeHandle = (channel, handler) => {
    try {
      ipcMain.handle(channel, handler);
    } catch (e) {
      if (e && e.message && e.message.includes('second handler')) return;
      throw e;
    }
  };

  const logTransition = (ctx, quoteId, details) => {
    try {
      AuditLog.log({ userId: ctx?.userId, action: 'update', entityType: 'quote', entityId: quoteId, details });
    } catch (auditErr) {
      console.warn('Audit log failed (non-fatal):', auditErr.message);
    }
  };

  // ── Accept Quote ────────────────────────────────────────────────────────
  safeHandle('accept-quote', async (event, quoteId) => {
    try {
      const ctx = authorize(event, { permissions: 'write:quotes' });
      const res = await Quotes.acceptQuote(quoteId);
      if (res?.success && !res.alreadyAccepted) {
        logTransition(ctx, quoteId, { status: res.status, transition: `${res.previousStatus} → ${res.status}`, quoteNumber: res.quoteNumber });
      }
      return res;
    } catch (error) {
      console.error('Error accepting quote:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Decline Quote ───────────────────────────────────────────────────────
  safeHandle('decline-quote', async (event, quoteId) => {
    try {
      const ctx = authorize(event, { permissions: 'write:quotes' });
      const res = await Quotes.declineQuote(quoteId);
      if (res?.success && !res.alreadyDeclined) {
        logTransition(ctx, quoteId, { status: res.status, transition: `${res.previousStatus} → ${res.status}`, quoteNumber: res.quoteNumber });
      }
      return res;
    } catch (error) {
      console.error('Error declining quote:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Convert Quote to Invoice ────────────────────────────────────────────
  safeHandle('convert-quote-to-invoice', async (event, quoteId) => {
    try {
      const ctx = authorize(event, { permissions: 'write:quotes' });
      const res = await Quotes.convertQuoteToInvoice(quoteId);
      if (res?.success) {
        logTransition(ctx, quoteId, {
          status: res.quoteStatus,
          transition: `→ Converted`,
          createdInvoiceId: res.invoiceId,
          createdInvoiceNumber: res.invoiceNumber,
          invoiceStatus: res.invoiceStatus,
        });
      }
      return res;
    } catch (error) {
      console.error('Error converting quote to invoice:', error);
      return { success: false, error: error.message };
    }
  });
};

module.exports = registerQuoteHandlers;
