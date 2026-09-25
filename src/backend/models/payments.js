const db = require('./dbmgr');
const { recalcInvoiceFinancials } = require('../services/invoiceFinancials');

const Payments = {
  createTable: () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceId INTEGER,
        customerId INTEGER,
        amount REAL NOT NULL,
        paymentMethod TEXT,
        date TEXT,
        memo TEXT,
        reference TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoiceId) REFERENCES invoices(id)
      )
    `).run();

    // Allocations: which invoices a payment is applied to (0..n). A payment's
    // "applied" amount is the sum of these; the remainder is an unapplied credit.
    db.prepare(`
      CREATE TABLE IF NOT EXISTS payment_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        paymentId INTEGER NOT NULL,
        invoiceId INTEGER NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (paymentId) REFERENCES payments(id),
        FOREIGN KEY (invoiceId) REFERENCES invoices(id)
      )
    `).run();
    try {
      db.prepare('CREATE INDEX IF NOT EXISTS idx_pa_payment ON payment_allocations(paymentId)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_pa_invoice ON payment_allocations(invoiceId)').run();
    } catch (e) { console.error('payment_allocations indexes:', e); }

    // Migrations for existing DBs
    try {
      const cols = new Set(db.prepare("PRAGMA table_info('payments')").all().map(r => r.name));
      const add = (col, ddl) => { if (!cols.has(col)) db.prepare(`ALTER TABLE payments ADD COLUMN ${col} ${ddl}`).run(); };
      add('customerId', 'INTEGER');
      add('memo',       'TEXT');
      add('reference',  'TEXT');
      add('status',     "TEXT DEFAULT 'Pending Deposit'");
      add('deposit_id', 'INTEGER');
      add('deposit_to', 'TEXT');
    } catch (e) { console.error('payments migration:', e); }

    // Backfill allocations from legacy single-invoice payments
    try {
      const legacy = db.prepare(
        `SELECT p.id, p.invoiceId, p.amount
         FROM payments p
         WHERE p.invoiceId IS NOT NULL AND p.invoiceId != 0
           AND NOT EXISTS (SELECT 1 FROM payment_allocations a WHERE a.paymentId = p.id)`
      ).all();
      const ins = db.prepare(
        'INSERT INTO payment_allocations (paymentId, invoiceId, amount, createdAt) VALUES (?, ?, ?, datetime(\'now\'))'
      );
      const tx = db.transaction((rows) => rows.forEach(r => ins.run(r.id, r.invoiceId, r.amount)));
      tx(legacy);
    } catch (e) { console.error('payment_allocations backfill:', e); }
  },

  create: (payment) => {
    // Resolve customerId from invoice if not provided
    let customerId = payment.customerId || null;
    if (!customerId && payment.invoiceId) {
      const inv = db.prepare('SELECT customer FROM invoices WHERE id = ?').get(payment.invoiceId);
      if (inv) customerId = inv.customer;
    }
    const stmt = db.prepare(`
      INSERT INTO payments (invoiceId, customerId, amount, paymentMethod, date, memo, reference, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    return stmt.run(
      payment.invoiceId || null,
      customerId,
      payment.amount,
      payment.paymentMethod || null,
      payment.date || null,
      payment.memo || null,
      payment.reference || null
    );
  },

  // Invoice total (line items incl. VAT) and how much of it is covered by
  // allocations (payments applied to this invoice).
  invoiceTotals: (invoiceId) => {
    const lineTotal = db.prepare(`
      SELECT COALESCE(SUM(l.amount), 0) AS total, COALESCE(i.vat, 0) AS vat
      FROM invoice_lines l
      JOIN invoices i ON i.id = l.invoice_id
      WHERE l.invoice_id = ?
    `).get(invoiceId);
    const invoiceTotal = (Number(lineTotal?.total) || 0) * (1 + (Number(lineTotal?.vat) || 0) / 100);
    const appliedRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM payment_allocations WHERE invoiceId = ?
    `).get(invoiceId);
    const applied = Number(appliedRow?.total) || 0;
    return { invoiceTotal, applied, remaining: invoiceTotal - applied };
  },

  // Recompute an invoice's balance/status from payments applied to it.
  //
  // This is a thin wrapper around the shared financial-state service so there is
  // exactly ONE implementation of the Open → Partially Paid → Paid rule. It runs
  // on every payment event (create / apply / edit / resize / delete) and on
  // invoice edits, which is what makes the invoice status move backwards when a
  // payment is reversed or removed.
  recomputeInvoice: (invoiceId) => {
    if (!invoiceId) return null;
    const f = recalcInvoiceFinancials(Number(invoiceId));
    if (!f) return null;
    return {
      balance: f.balance,
      status: f.status,
      invoiceTotal: f.invoiceTotal,
      paidToDate: f.paidToDate,
      overpayment: f.overpayment,
    };
  },

  // Create a payment with explicit allocations (0..n invoices). Creates the
  // payment row + allocation rows, then refreshes each invoice balance/status.
  createWithAllocations: (payment, allocations = []) => {
    const amount = Number(payment.amount) || 0;
    const allocs = (allocations || [])
      .filter(a => a && a.invoiceId && Number(a.amount) > 0)
      .map(a => ({ invoiceId: Number(a.invoiceId), amount: Number(a.amount) }));
    const applied = allocs.reduce((s, a) => s + a.amount, 0);
    if (applied > amount + 0.005) {
      const err = new Error(`Applied amount (${applied.toFixed(2)}) exceeds payment amount (${amount.toFixed(2)})`);
      err.appliedExceeds = true;
      throw err;
    }

    // Single allocation → store on legacy invoiceId column for backward compat
    const invoiceId = allocs.length === 1 ? allocs[0].invoiceId : null;

    const tx = db.transaction(() => {
      const res = db.prepare(`
        INSERT INTO payments (invoiceId, customerId, amount, paymentMethod, date, memo, reference, status, deposit_to, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending Deposit', ?, datetime('now'))
      `).run(
        invoiceId,
        payment.customerId || null,
        amount,
        payment.paymentMethod || null,
        payment.date || null,
        payment.memo || null,
        payment.reference || null,
        payment.depositTo || null
      );
      const paymentId = res.lastInsertRowid;
      const ins = db.prepare(
        'INSERT INTO payment_allocations (paymentId, invoiceId, amount) VALUES (?, ?, ?)'
      );
      allocs.forEach(a => ins.run(paymentId, a.invoiceId, a.amount));
      allocs.forEach(a => Payments.recomputeInvoice(a.invoiceId));
      return paymentId;
    });
    const paymentId = tx();
    return { success: true, id: paymentId, applied, unapplied: amount - applied };
  },

  // Apply part of an unapplied payment (credit) to an invoice. No new GL entry:
  // the cash was already booked when the payment was recorded.
  applyCredit: (paymentId, invoiceId, amount) => {
    const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
    if (!pay) return { success: false, error: 'Payment not found' };

    const existing = db.prepare(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM payment_allocations WHERE paymentId = ?'
    ).get(paymentId);
    const alreadyApplied = Number(existing?.total) || 0;
    const amt = Number(amount) || 0;
    if (amt <= 0) return { success: false, error: 'Amount must be greater than zero' };
    if (alreadyApplied + amt > Number(pay.amount) + 0.005) {
      return { success: false, error: 'Amount exceeds the unapplied balance' };
    }

    // Cap at the invoice's remaining balance
    const { invoiceTotal, remaining } = Payments.invoiceTotals(invoiceId);
    const apply = Math.min(amt, Math.max(0, remaining));
    if (apply <= 0) return { success: false, error: 'Invoice has no remaining balance' };

    const tx = db.transaction(() => {
      const ins = db.prepare(
        'INSERT INTO payment_allocations (paymentId, invoiceId, amount) VALUES (?, ?, ?)'
      );
      ins.run(paymentId, invoiceId, apply);
      // If the whole payment was a single-invoice legacy record, keep invoiceId in sync
      const allocs = db.prepare('SELECT * FROM payment_allocations WHERE paymentId = ?').all(paymentId);
      if (allocs.length === 1) {
        db.prepare('UPDATE payments SET invoiceId = ? WHERE id = ?').run(allocs[0].invoiceId, paymentId);
      } else {
        db.prepare('UPDATE payments SET invoiceId = NULL WHERE id = ?').run(paymentId);
      }
      Payments.recomputeInvoice(invoiceId);
    });
    tx();

    const after = db.prepare(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM payment_allocations WHERE paymentId = ?'
    ).get(paymentId);
    return {
      success: true,
      applied: Number(after?.total) || 0,
      unapplied: Number(pay.amount) - (Number(after?.total) || 0),
    };
  },

  // A payment's allocations joined with invoice info.
  getAllocations: (paymentId) => {
    return db.prepare(`
      SELECT a.id, a.invoiceId, a.amount,
             i.number AS invoiceNumber,
             i.status AS invoiceStatus,
             COALESCE((SELECT SUM(il.amount * (1 + i2.vat/100))
                       FROM invoice_lines il JOIN invoices i2 ON il.invoice_id = i2.id
                       WHERE i2.id = a.invoiceId), 0) AS invoiceTotal,
             COALESCE((SELECT SUM(x.amount) FROM payment_allocations x WHERE x.invoiceId = a.invoiceId), 0) AS appliedTotal
      FROM payment_allocations a
      LEFT JOIN invoices i ON a.invoiceId = i.id
      WHERE a.paymentId = ?
      ORDER BY a.id ASC
    `).all(paymentId);
  },

  // Find the posted GL entry for a payment (if any) so edit/delete can void it.
  postingId: (paymentId) => {
    const row = db.prepare(
      "SELECT id FROM journal_entries WHERE source_type = 'payment' AND source_id = ? AND status = 'Posted' LIMIT 1"
    ).get(paymentId);
    return row ? row.id : null;
  },

  update: (id, payment) => {
    const prev = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
    if (!prev) return { success: false, error: 'Payment not found' };
    const amount = Number(payment.amount) || 0;

    // Affected invoices: existing ones first (before we resize allocations) so
    // their balances are recomputed afterwards.
    const affected = new Set();
    db.prepare('SELECT invoiceId FROM payment_allocations WHERE paymentId = ?').all(id).forEach(a => { if (a.invoiceId) affected.add(a.invoiceId); });
    if (prev.invoiceId && prev.invoiceId !== 0) affected.add(prev.invoiceId);

    db.prepare(`
      UPDATE payments SET amount=?, paymentMethod=?, date=?, memo=?, reference=?,
             deposit_to=COALESCE(?, deposit_to) WHERE id=?
    `).run(amount, payment.paymentMethod, payment.date, payment.memo || null, payment.reference || null, payment.depositTo || null, id);

    // Keep applied amounts consistent — a payment can never be applied for more
    // than its new amount. Resize allocations proportionally when it is.
    const allocRows = db.prepare('SELECT * FROM payment_allocations WHERE paymentId = ?').all(id);
    const totalApplied = allocRows.reduce((s, a) => s + Number(a.amount), 0);
    if (allocRows.length && totalApplied > amount + 0.005) {
      const ratio = amount / totalApplied;
      const upd = db.prepare('UPDATE payment_allocations SET amount = ? WHERE id = ?');
      const tx = db.transaction(() => allocRows.forEach(a => upd.run(Number(a.amount) * ratio, a.id)));
      tx();
    }

    // Void + re-post the payment GL so amount/date/reference stay in sync.
    const JournalEntries = require('./journalEntries');
    const postingId = Payments.postingId(id);
    if (postingId) JournalEntries.voidEntry(postingId);
    if (amount > 0) {
      const cust = prev.customerId
        ? db.prepare('SELECT display_name, first_name, last_name, company_name FROM customers WHERE id = ?').get(prev.customerId)
        : null;
      JournalEntries.postPayment({
        id,
        amount,
        date: payment.date || prev.date,
        reference: payment.reference || prev.reference,
        bankAccountName: payment.depositTo || prev.deposit_to || null,
        customerName: cust
          ? (cust.display_name || [cust.first_name, cust.last_name].filter(Boolean).join(' ') || cust.company_name || '')
          : '',
      });
    }

    affected.forEach(invoiceId => { if (invoiceId) Payments.recomputeInvoice(invoiceId); });
    return { success: true };
  },

  delete: (id) => {
    const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
    if (!pay) return { success: false, error: 'Payment not found' };
    const affected = new Set();
    db.prepare('SELECT invoiceId FROM payment_allocations WHERE paymentId = ?').all(id).forEach(a => { if (a.invoiceId) affected.add(a.invoiceId); });
    if (pay.invoiceId && pay.invoiceId !== 0) affected.add(pay.invoiceId);

    const JournalEntries = require('./journalEntries');
    const postingId = Payments.postingId(id);
    if (postingId) JournalEntries.voidEntry(postingId);

    db.prepare('DELETE FROM payment_allocations WHERE paymentId = ?').run(id);
    db.prepare('DELETE FROM payments WHERE id = ?').run(id);

    affected.forEach(invoiceId => { if (invoiceId) Payments.recomputeInvoice(invoiceId); });
    return { success: true };
  },

  getByInvoice: (invoiceId) => {
    return db.prepare(`
      SELECT p.*,
             COALESCE(app.applied, CASE WHEN p.invoiceId IS NOT NULL AND p.invoiceId != 0 THEN p.amount ELSE 0 END) AS applied,
             p.amount - COALESCE(app.applied, CASE WHEN p.invoiceId IS NOT NULL AND p.invoiceId != 0 THEN p.amount ELSE 0 END) AS unapplied,
             c.display_name AS customerName
      FROM payments p
      LEFT JOIN (SELECT paymentId, SUM(amount) AS applied FROM payment_allocations GROUP BY paymentId) app ON app.paymentId = p.id
      LEFT JOIN customers c ON p.customerId = c.id
      WHERE p.invoiceId = ? OR EXISTS (SELECT 1 FROM payment_allocations a WHERE a.paymentId = p.id AND a.invoiceId = ?)
      ORDER BY p.date DESC, p.createdAt DESC
    `).all(invoiceId, invoiceId);
  },

  getByCustomer: (customerId) => {
    return db.prepare(`
      SELECT p.*,
             i.number  AS invoiceNumber,
             i.status  AS invoiceStatus,
             (SELECT COALESCE(SUM(il.amount * (1 + i2.vat/100)),0)
              FROM invoice_lines il JOIN invoices i2 ON il.invoice_id = i2.id WHERE i2.id = p.invoiceId)
               AS invoiceTotal,
             COALESCE(app.applied, CASE WHEN p.invoiceId IS NOT NULL AND p.invoiceId != 0 THEN p.amount ELSE 0 END) AS applied,
             p.amount - COALESCE(app.applied, CASE WHEN p.invoiceId IS NOT NULL AND p.invoiceId != 0 THEN p.amount ELSE 0 END) AS unapplied,
             c.display_name AS customerName
      FROM payments p
      LEFT JOIN (SELECT paymentId, SUM(amount) AS applied FROM payment_allocations GROUP BY paymentId) app ON app.paymentId = p.id
      LEFT JOIN invoices i ON p.invoiceId = i.id
      LEFT JOIN customers c ON p.customerId = c.id
      WHERE p.customerId = ?
      ORDER BY p.date DESC, p.createdAt DESC
    `).all(customerId);
  },

  getCustomerBalance: (customerId) => {
    // Total invoiced
    const invoiced = db.prepare(`
      SELECT COALESCE(SUM(il.amount * (1 + i.vat/100)), 0) AS total
      FROM invoice_lines il
      JOIN invoices i ON il.invoice_id = i.id
      WHERE i.customer = ? AND i.status != 'Void'
    `).get(customerId);

    // Total paid (all payment amounts)
    const paid = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE customerId = ?
    `).get(customerId);

    // Total applied to invoices via allocations
    const applied = db.prepare(`
      SELECT COALESCE(SUM(a.amount), 0) AS total
      FROM payment_allocations a
      JOIN payments p ON a.paymentId = p.id
      WHERE p.customerId = ?
    `).get(customerId);

    const invoicedTotal  = Number(invoiced?.total  || 0);
    const paidTotal      = Number(paid?.total      || 0);
    const appliedTotal   = Number(applied?.total   || 0);

    // Refunds reduce the customer's NET payments (the original payments remain).
    let refundedTotal = 0;
    try {
      refundedTotal = Number(db.prepare(
        "SELECT COALESCE(SUM(amount),0) AS total FROM customer_refunds WHERE customer_id = ? AND status != 'Reversed'"
      ).get(customerId)?.total || 0);
    } catch { refundedTotal = 0; }

    return {
      invoicedTotal,
      paidTotal,
      appliedTotal,
      refundedTotal,
      netPaidTotal: paidTotal - refundedTotal,
      remainingBalance: invoicedTotal - appliedTotal,
      unappliedCredits: Math.max(0, (paidTotal - refundedTotal) - appliedTotal),
    };
  },

  getAllPayments: ({ customerId, invoiceId, from, to, limit = 200 } = {}) => {
    let where = '1=1';
    const params = [];
    if (customerId) { where += ' AND p.customerId = ?'; params.push(customerId); }
    if (invoiceId)  { where += ' AND (p.invoiceId = ? OR EXISTS (SELECT 1 FROM payment_allocations a WHERE a.paymentId = p.id AND a.invoiceId = ?))'; params.push(invoiceId, invoiceId); }
    if (from)       { where += ' AND p.date >= ?';       params.push(from); }
    if (to)         { where += ' AND p.date <= ?';       params.push(to); }
    return db.prepare(`
      SELECT p.*,
             i.number  AS invoiceNumber,
             i.status  AS invoiceStatus,
             c.display_name AS customerName,
             COALESCE(app.applied, CASE WHEN p.invoiceId IS NOT NULL AND p.invoiceId != 0 THEN p.amount ELSE 0 END) AS applied,
             p.amount - COALESCE(app.applied, CASE WHEN p.invoiceId IS NOT NULL AND p.invoiceId != 0 THEN p.amount ELSE 0 END) AS unapplied
      FROM payments p
      LEFT JOIN (SELECT paymentId, SUM(amount) AS applied FROM payment_allocations GROUP BY paymentId) app ON app.paymentId = p.id
      LEFT JOIN invoices i ON p.invoiceId = i.id
      LEFT JOIN customers c ON p.customerId = c.id
      WHERE ${where}
      ORDER BY p.date DESC, p.createdAt DESC
      LIMIT ${Number(limit)}
    `).all(...params);
  },
};

Payments.createTable();

module.exports = Payments;
