const db = require('./dbmgr');

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

    // Migrations for existing DBs
    try {
      const cols = new Set(db.prepare("PRAGMA table_info('payments')").all().map(r => r.name));
      const add = (col, ddl) => { if (!cols.has(col)) db.prepare(`ALTER TABLE payments ADD COLUMN ${col} ${ddl}`).run(); };
      add('customerId', 'INTEGER');
      add('memo',       'TEXT');
      add('reference',  'TEXT');
    } catch (e) { console.error('payments migration:', e); }
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

  update: (id, payment) => {
    const stmt = db.prepare(`
      UPDATE payments SET amount=?, paymentMethod=?, date=?, memo=?, reference=? WHERE id=?
    `);
    return stmt.run(payment.amount, payment.paymentMethod, payment.date, payment.memo || null, payment.reference || null, id);
  },

  delete: (id) => {
    return db.prepare('DELETE FROM payments WHERE id = ?').run(id);
  },

  getByInvoice: (invoiceId) => {
    return db.prepare('SELECT * FROM payments WHERE invoiceId = ? ORDER BY createdAt DESC').all(invoiceId);
  },

  getByCustomer: (customerId) => {
    return db.prepare(`
      SELECT p.*,
             i.number  AS invoiceNumber,
             i.status  AS invoiceStatus,
             (SELECT COALESCE(SUM(il.amount * il.quantity * (1 + i2.vat/100)),0)
              FROM invoice_lines il JOIN invoices i2 ON il.invoice_id = i2.id WHERE i2.id = p.invoiceId)
               AS invoiceTotal,
             c.display_name AS customerName
      FROM payments p
      LEFT JOIN invoices i ON p.invoiceId = i.id
      LEFT JOIN customers c ON p.customerId = c.id
      WHERE p.customerId = ?
      ORDER BY p.date DESC, p.createdAt DESC
    `).all(customerId);
  },

  getCustomerBalance: (customerId) => {
    // Total invoiced
    const invoiced = db.prepare(`
      SELECT COALESCE(SUM(il.amount * il.quantity * (1 + i.vat/100)), 0) AS total
      FROM invoice_lines il
      JOIN invoices i ON il.invoice_id = i.id
      WHERE i.customer = ? AND i.status != 'Void'
    `).get(customerId);

    // Total paid
    const paid = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE customerId = ?
    `).get(customerId);

    // Unapplied (payments with no invoiceId)
    const unapplied = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE customerId = ? AND (invoiceId IS NULL OR invoiceId = 0)
    `).get(customerId);

    const invoicedTotal  = Number(invoiced?.total  || 0);
    const paidTotal      = Number(paid?.total      || 0);
    const unappliedTotal = Number(unapplied?.total || 0);

    return {
      invoicedTotal,
      paidTotal,
      remainingBalance: invoicedTotal - paidTotal,
      unappliedCredits: unappliedTotal,
    };
  },

  getAllPayments: ({ customerId, invoiceId, from, to, limit = 200 } = {}) => {
    let where = '1=1';
    const params = [];
    if (customerId) { where += ' AND p.customerId = ?'; params.push(customerId); }
    if (invoiceId)  { where += ' AND p.invoiceId = ?';  params.push(invoiceId); }
    if (from)       { where += ' AND p.date >= ?';       params.push(from); }
    if (to)         { where += ' AND p.date <= ?';       params.push(to); }
    return db.prepare(`
      SELECT p.*,
             i.number  AS invoiceNumber,
             i.status  AS invoiceStatus,
             c.display_name AS customerName
      FROM payments p
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
