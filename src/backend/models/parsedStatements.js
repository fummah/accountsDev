const db = require('./dbmgr');

const ParsedStatements = {
  createTables: () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS parsed_statements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bankName TEXT,
        periodStart DATE,
        periodEnd DATE,
        currency TEXT,
        uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS statement_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parsedStatementId INTEGER NOT NULL,
        date DATE NOT NULL,
        description TEXT,
        amount REAL NOT NULL,
        type TEXT, -- debit|credit
        reference TEXT
      )
    `).run();
  },

  createStatement: (meta) => {
    const stmt = db.prepare(`
      INSERT INTO parsed_statements (bankName, periodStart, periodEnd, currency, uploadedAt)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);
    const res = stmt.run(meta.bankName || null, meta.periodStart || null, meta.periodEnd || null, meta.currency || null);
    return { id: res.lastInsertRowid };
  },

  insertTransactions: (parsedStatementId, rows) => {
    const stmt = db.prepare(`
      INSERT INTO statement_transactions (parsedStatementId, date, description, amount, type, reference)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    db.prepare('BEGIN').run();
    try {
      for (const r of rows) {
        stmt.run(parsedStatementId, r.date, r.description || null, r.amount, r.type || null, r.reference || null);
      }
      db.prepare('COMMIT').run();
      return { success: true };
    } catch (e) {
      db.prepare('ROLLBACK').run();
      return { success: false, error: e.message };
    }
  },

  listStatements: () => {
    return db.prepare(`SELECT * FROM parsed_statements ORDER BY uploadedAt DESC`).all();
  },

  getStatementWithTransactions: (id) => {
    const st = db.prepare(`SELECT * FROM parsed_statements WHERE id = ?`).get(id);
    if (!st) return null;
    const txs = db.prepare(`SELECT * FROM statement_transactions WHERE parsedStatementId = ? ORDER BY date ASC`).all(id);
    return { ...st, transactions: txs };
  }
};

ParsedStatements.createTables();

module.exports = ParsedStatements;


