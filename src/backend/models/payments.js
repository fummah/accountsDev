const db = require('./dbmgr');

const Payments = {
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoiceId INTEGER,
        amount REAL NOT NULL,
        paymentMethod TEXT,
        date TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoiceId) REFERENCES invoices(id)
      )
    `;
    db.prepare(stmt).run();
  },

  create: (payment) => {
    const stmt = db.prepare('INSERT INTO payments (invoiceId, amount, paymentMethod, date, createdAt) VALUES (?, ?, ?, ?, datetime("now"))');
    return stmt.run(payment.invoiceId, payment.amount, payment.paymentMethod, payment.date);
  },

  getByInvoice: (invoiceId) => {
    const stmt = db.prepare('SELECT * FROM payments WHERE invoiceId = ? ORDER BY createdAt DESC');
    return stmt.all(invoiceId);
  }
};

Payments.createTable();

module.exports = Payments;
