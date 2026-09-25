const db = require('./dbmgr');
const JournalEntries = require('./journalEntries');
const ChartOfAccounts = require('./chartOfAccounts');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const TOLERANCE = 0.005;

/**
 * customerRefunds.js — Customer Refunds.
 *
 * A REFUND is a NEW transaction for money actually leaving the business. The
 * original payment is NEVER modified or deleted: it stays at its full amount,
 * and the refund is recorded against it. Net = payment − refunds.
 *
 * Accounting (payment refund, i.e. un-winding settlement):
 *   Dr Accounts Receivable   (re-opens the receivable / removes the credit)
 *   Cr Bank / Cash           (money paid out)
 * The credit note's own accounting (Dr Income / Cr AR) is posted by the
 * existing CreditNotes engine and is never re-posted here.
 *
 * Tables:
 *   customer_refunds              header (one per refund)
 *   customer_refund_allocations   what each refund unwound (payment allocation /
 *                                 invoice / unapplied)
 */
const CustomerRefunds = {
  createTable() {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS customer_refunds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        refund_number TEXT,
        customer_id INTEGER,
        payment_id INTEGER,
        invoice_id INTEGER,
        credit_note_id INTEGER,
        date TEXT,
        amount REAL NOT NULL,
        method TEXT,
        bank_account_id INTEGER,
        reference TEXT,
        memo TEXT,
        reason TEXT,
        status TEXT DEFAULT 'Posted',
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    db.prepare(`
      CREATE TABLE IF NOT EXISTS customer_refund_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        refund_id INTEGER NOT NULL,
        payment_id INTEGER,
        invoice_id INTEGER,
        payment_allocation_id INTEGER,
        amount REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    try {
      db.prepare('CREATE INDEX IF NOT EXISTS idx_cr_payment ON customer_refunds(payment_id)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_cra_refund ON customer_refund_allocations(refund_id)').run();
    } catch { /* indexes optional */ }
  },

  generateNumber() {
    const last = db.prepare('SELECT refund_number FROM customer_refunds ORDER BY id DESC LIMIT 1').get();
    if (!last || !last.refund_number) return 'REF-00001';
    const n = parseInt(String(last.refund_number).replace(/\D/g, ''), 10) || 0;
    return `REF-${String(n + 1).padStart(5, '0')}`;
  },

  /** Refunded total (non-reversed) and the remaining refundable amount. */
  getRefundable(paymentId) {
    const pay = db.prepare('SELECT id, amount FROM payments WHERE id = ?').get(Number(paymentId));
    if (!pay) return null;
    const refundedRow = db.prepare(
      "SELECT COALESCE(SUM(amount),0) AS total FROM customer_refunds WHERE payment_id = ? AND status != 'Reversed'"
    ).get(Number(paymentId));
    const refunded = round2(refundedRow?.total);
    return { paymentAmount: round2(pay.amount), refunded, refundable: round2(Math.max(0, pay.amount - refunded)) };
  },

  /** Refundable amount against a customer credit (credit memo). */
  getRefundableForCreditNote(creditNoteId) {
    const cn = db.prepare('SELECT id, total FROM credit_notes WHERE id = ?').get(Number(creditNoteId));
    if (!cn) return null;
    const refundedRow = db.prepare(
      "SELECT COALESCE(SUM(amount),0) AS total FROM customer_refunds WHERE credit_note_id = ? AND status != 'Reversed'"
    ).get(Number(creditNoteId));
    const refunded = round2(refundedRow?.total);
    return { creditTotal: round2(cn.total), refunded, refundable: round2(Math.max(0, cn.total - refunded)) };
  },

  /**
   * Deterministic default allocation for a refund: consume the payment's
   * UNAPPLIED portion first, then its applied invoice allocations oldest-first.
   */
  _computeAllocation(paymentId, amount) {
    const pid = Number(paymentId);
    const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(pid);
    if (!pay) return null;

    const allocs = db.prepare('SELECT * FROM payment_allocations WHERE paymentId = ? ORDER BY id ASC').all(pid);
    const appliedTotal = round2(allocs.reduce((s, a) => s + Number(a.amount || 0), 0));
    const refundedUnappliedRow = db.prepare(
      "SELECT COALESCE(SUM(amount),0) AS total FROM customer_refund_allocations WHERE payment_id = ? AND payment_allocation_id IS NULL AND refund_id IN (SELECT id FROM customer_refunds WHERE status != 'Reversed')"
    ).get(pid);
    const refundedUnapplied = round2(refundedUnappliedRow?.total);
    const unapplied = round2(Math.max(0, Number(pay.amount) - appliedTotal - refundedUnapplied));

    let remaining = round2(amount);
    const allocations = [];

    // 1. Unapplied first.
    if (remaining > TOLERANCE && unapplied > TOLERANCE) {
      const use = Math.min(remaining, unapplied);
      allocations.push({ paymentId: pid, invoiceId: null, paymentAllocationId: null, amount: round2(use) });
      remaining = round2(remaining - use);
    }

    // 2. Then applied invoice allocations, oldest first.
    for (const a of allocs) {
      if (remaining <= TOLERANCE) break;
      const avail = round2(Number(a.amount || 0));
      if (avail <= TOLERANCE) continue;
      const use = Math.min(remaining, avail);
      allocations.push({ paymentId: pid, invoiceId: Number(a.invoiceId), paymentAllocationId: Number(a.id), amount: round2(use) });
      remaining = round2(remaining - use);
    }

    return { allocations, unapplied };
  },

  /** Read-only preview used by the refund modal (no writes). */
  previewRefund(paymentId, amount) {
    const info = this.getRefundable(paymentId);
    if (!info) return { error: 'Payment not found' };
    const amt = round2(amount);
    if (amt <= TOLERANCE) return { error: 'Enter a refund amount' };
    if (amt > info.refundable + TOLERANCE) return { error: `Maximum refundable is ${info.refundable.toFixed(2)}` };
    const computed = this._computeAllocation(paymentId, amt);
    const invoices = (computed?.allocations || [])
      .filter(a => a.invoiceId)
      .map(a => {
        const inv = db.prepare('SELECT number FROM invoices WHERE id = ?').get(a.invoiceId);
        return { invoiceId: a.invoiceId, invoiceNumber: inv?.number || `#${a.invoiceId}`, refundAmount: a.amount };
      });
    const fromUnapplied = (computed?.allocations || []).filter(a => !a.invoiceId).reduce((s, a) => s + a.amount, 0);
    return { ...info, fromUnapplied: round2(fromUnapplied), invoices };
  },

  /**
   * Create a refund atomically. Re-validates the refundable amount INSIDE the
   * transaction so two users can never over-refund the same payment.
   */
  createRefund(payload = {}, ctx = {}) {
    const paymentId = payload.paymentId != null && payload.paymentId !== '' ? Number(payload.paymentId) : null;
    const creditNoteId = payload.creditNoteId != null && payload.creditNoteId !== '' ? Number(payload.creditNoteId) : null;
    const amount = round2(payload.amount);
    if (!paymentId && !creditNoteId) return { success: false, error: 'A source payment or credit note is required' };
    if (amount <= TOLERANCE) return { success: false, error: 'Refund amount must be greater than zero' };

    let customerId = payload.customerId != null ? Number(payload.customerId) : null;
    if (paymentId) {
      const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
      if (!payment) return { success: false, error: 'Payment not found' };
      if (customerId == null) customerId = payment.customerId != null ? Number(payment.customerId) : null;
      if (payment.customerId != null && customerId && Number(payment.customerId) !== customerId) {
        return { success: false, error: 'Refund customer does not match the payment customer' };
      }
    } else {
      const cn = db.prepare('SELECT * FROM credit_notes WHERE id = ?').get(creditNoteId);
      if (!cn) return { success: false, error: 'Credit note not found' };
      if (customerId == null) customerId = cn.customer_id != null ? Number(cn.customer_id) : null;
    }

    // Bank / Cash source is required — money actually leaves the business.
    const bankAccountId = Number(payload.bankAccountId);
    if (!bankAccountId) return { success: false, error: 'Select the Bank / Cash account the refund is paid from' };
    const bank = ChartOfAccounts.getAccount(bankAccountId);
    if (!bank) return { success: false, error: 'Refund Bank / Cash account not found in the Chart of Accounts' };
    const bankType = String(bank.type || bank.accountType || '').trim().toLowerCase();
    if (!['bank', 'cash'].includes(bankType)) {
      return { success: false, error: `Selected account "${bank.name || bank.accountName}" is not a Bank or Cash account` };
    }

    const ar = ChartOfAccounts.getSystemAccount('Accounts Receivable') || ChartOfAccounts.getByName('Accounts Receivable');
    if (!ar) return { success: false, error: 'Accounts Receivable account not in COA' };

    const date = payload.date || new Date().toISOString().slice(0, 10);

    let refundId = null;
    let number = null;
    try {
      const run = db.transaction(() => {
        // Re-check the refundable amount inside the transaction (concurrency).
        const info = paymentId ? this.getRefundable(paymentId) : this.getRefundableForCreditNote(creditNoteId);
        if (!info) throw new Error('Refund source not found');
        if (amount > info.refundable + TOLERANCE) {
          throw new Error(`Refund exceeds the remaining refundable amount (${info.refundable.toFixed(2)})`);
        }

        number = this.generateNumber();
        const res = db.prepare(`
          INSERT INTO customer_refunds (refund_number, customer_id, payment_id, invoice_id, credit_note_id, date, amount, method, bank_account_id, reference, memo, reason, status, created_by)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'Posted', ?)
        `).run(
          number, customerId || null, paymentId,
          payload.invoiceId != null ? Number(payload.invoiceId) : null,
          creditNoteId,
          date, amount, payload.method || null, bankAccountId,
          payload.reference || null, payload.memo || null, payload.reason || null,
          ctx.userId || 'system'
        );
        refundId = Number(res.lastInsertRowid);

        // Unwind the payment's settlement (payment refunds only).
        const affectedInvoices = new Set();
        if (paymentId) {
          const computed = this._computeAllocation(paymentId, amount);
          const insAlloc = db.prepare('INSERT INTO customer_refund_allocations (refund_id, payment_id, invoice_id, payment_allocation_id, amount) VALUES (?,?,?,?,?)');
          for (const a of (computed?.allocations || [])) {
            insAlloc.run(refundId, paymentId, a.invoiceId || null, a.paymentAllocationId || null, a.amount);
            if (a.paymentAllocationId) {
              const pa = db.prepare('SELECT * FROM payment_allocations WHERE id = ?').get(a.paymentAllocationId);
              if (pa) {
                const next = round2(Math.max(0, Number(pa.amount) - a.amount));
                db.prepare('UPDATE payment_allocations SET amount = ? WHERE id = ?').run(next, pa.id);
                if (pa.invoiceId) affectedInvoices.add(Number(pa.invoiceId));
              }
            }
          }
        }

        // Accounting: Dr AR / Cr Bank (money out).
        JournalEntries.post({
          date,
          reference: number,
          description: `Customer refund ${number}${payload.reason ? ` — ${payload.reason}` : ''}`,
          source_type: 'customer_refund',
          source_id: refundId,
          created_by: ctx.userId || 'system',
          lines: [
            { account_id: ar.id, debit: amount, credit: 0, description: 'Accounts Receivable (refund)' },
            { account_id: bank.id, debit: 0, credit: amount, description: 'Bank / Cash refund paid' },
          ],
        });

        // Recompute the affected invoices' balances/status.
        const Payments = require('./payments');
        affectedInvoices.forEach(invId => Payments.recomputeInvoice(invId));
        return { affectedInvoices: Array.from(affectedInvoices) };
      });

      const out = run();
      try {
        const AuditLog = require('./auditLog');
        AuditLog.log({
          userId: ctx.userId || 'system', action: 'create', entityType: 'customer_refund', entityId: refundId,
          details: { paymentId, creditNoteId, amount, bankAccountId, refundNumber: number, reason: payload.reason || null },
        });
      } catch { /* audit best-effort */ }
      return { success: true, id: refundId, refund_number: number, affectedInvoices: out.affectedInvoices };
    } catch (e) {
      console.error('[customerRefunds] createRefund failed:', e.message);
      return { success: false, error: e.message };
    }
  },

  /**
   * Issue a customer credit (credit memo) for an invoice, optionally returning
   * cash immediately. Reuses the existing CreditNotes engine for the credit's
   * accounting (Dr Income / Cr AR); the cash refund is a separate CustomerRefund
   * (Dr AR / Cr Bank). This keeps Invoice → Credit → Refund fully traceable.
   */
  createInvoiceRefund(payload = {}, ctx = {}) {
    const CreditNotes = require('./creditNotes');
    const invoiceId = payload.invoiceId != null ? Number(payload.invoiceId) : null;
    if (!invoiceId) return { success: false, error: 'Invoice is required' };
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
    if (!invoice) return { success: false, error: 'Invoice not found' };
    const customerId = Number(payload.customerId || invoice.customer);

    const amount = round2(payload.amount);
    if (amount <= TOLERANCE) return { success: false, error: 'Credit amount must be greater than zero' };
    const reason = payload.reason || 'Return / refund';

    // 1. Credit memo (posts its own journal via the existing engine).
    const cn = CreditNotes.insert({
      customer_id: customerId,
      customer_name: payload.customerName || null,
      invoice_id: invoiceId,
      date: payload.date || new Date().toISOString().slice(0, 10),
      reason,
      status: 'Issued',
      notes: payload.memo || null,
      entered_by: ctx.userId || 'system',
    }, [{ description: payload.description || `Credit for invoice ${invoice.number || invoiceId}`, quantity: 1, unit_price: amount, amount, tax_rate: 0 }]);

    if (!cn || cn.success === false) return { success: false, error: cn?.error || 'Failed to create credit note' };

    // 2. Optional immediate cash refund, linked to the credit memo.
    let refund = null;
    if (payload.refundCash) {
      refund = this.createRefund({
        customerId, amount, date: payload.date,
        bankAccountId: payload.bankAccountId, method: payload.method,
        reference: payload.reference, memo: payload.memo, reason,
        creditNoteId: cn.id, invoiceId,
      }, ctx);
      if (!refund.success) return { success: false, error: refund.error, creditNoteId: cn.id };
    }

    return { success: true, creditNoteId: cn.id, credit_note_number: cn.credit_note_number, refund };
  },

  getById(id) {
    const r = db.prepare(`
      SELECT r.*, c.display_name AS customerName, p.amount AS paymentAmount, p.date AS paymentDate
      FROM customer_refunds r
      LEFT JOIN customers c ON c.id = r.customer_id
      LEFT JOIN payments p ON p.id = r.payment_id
      WHERE r.id = ?
    `).get(Number(id));
    if (!r) return null;
    r.allocations = db.prepare(`
      SELECT a.*, i.number AS invoiceNumber
      FROM customer_refund_allocations a LEFT JOIN invoices i ON i.id = a.invoice_id
      WHERE a.refund_id = ? ORDER BY a.id
    `).all(Number(id));
    return r;
  },

  getByCustomer(customerId) {
    return db.prepare(`
      SELECT r.*, p.amount AS paymentAmount
      FROM customer_refunds r LEFT JOIN payments p ON p.id = r.payment_id
      WHERE r.customer_id = ? ORDER BY r.id DESC
    `).all(Number(customerId));
  },

  getByPayment(paymentId) {
    return db.prepare('SELECT * FROM customer_refunds WHERE payment_id = ? ORDER BY id DESC').all(Number(paymentId));
  },

  /** Void the refund's journal and restore the payment's settlement. */
  reverseRefund(id, ctx = {}) {
    const refund = db.prepare('SELECT * FROM customer_refunds WHERE id = ?').get(Number(id));
    if (!refund) return { success: false, error: 'Refund not found' };
    if (String(refund.status).toLowerCase() === 'reversed') return { success: true, already: true };

    const affectedInvoices = new Set();
    try {
      const run = db.transaction(() => {
        // Void the refund journal.
        const je = db.prepare("SELECT id FROM journal_entries WHERE source_type = 'customer_refund' AND source_id = ? AND status = 'Posted' LIMIT 1").get(Number(id));
        if (je) JournalEntries.voidEntry(je.id);

        // Restore the payment allocations the refund unwound.
        const allocs = db.prepare('SELECT * FROM customer_refund_allocations WHERE refund_id = ?').all(Number(id));
        for (const a of allocs) {
          if (a.payment_allocation_id) {
            const pa = db.prepare('SELECT * FROM payment_allocations WHERE id = ?').get(a.payment_allocation_id);
            if (pa) {
              db.prepare('UPDATE payment_allocations SET amount = ? WHERE id = ?').run(round2(Number(pa.amount) + Number(a.amount)), pa.id);
              if (pa.invoiceId) affectedInvoices.add(Number(pa.invoiceId));
            }
          }
        }
        db.prepare("UPDATE customer_refunds SET status = 'Reversed' WHERE id = ?").run(Number(id));

        const Payments = require('./payments');
        affectedInvoices.forEach(invId => Payments.recomputeInvoice(invId));
        return true;
      });
      run();
      try {
        const AuditLog = require('./auditLog');
        AuditLog.log({ userId: ctx.userId || 'system', action: 'reverse', entityType: 'customer_refund', entityId: Number(id), details: { refundNumber: refund.refund_number } });
      } catch { /* best-effort */ }
      return { success: true };
    } catch (e) {
      console.error('[customerRefunds] reverseRefund failed:', e.message);
      return { success: false, error: e.message };
    }
  },
};

CustomerRefunds.createTable();
module.exports = CustomerRefunds;
