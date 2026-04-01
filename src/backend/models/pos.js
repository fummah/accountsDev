const db = require('./dbmgr');

const POS = {
  createTables: () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS pos_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        openedBy TEXT,
        openedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        openingAmount REAL DEFAULT 0,
        closedAt DATETIME,
        closingAmount REAL,
        status TEXT DEFAULT 'open' -- open, closed
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS pos_sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sessionId INTEGER NOT NULL,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        customerId INTEGER,
        subtotal REAL DEFAULT 0,
        tax REAL DEFAULT 0,
        total REAL DEFAULT 0,
        paymentType TEXT, -- cash, card, mobile
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS pos_sale_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        saleId INTEGER NOT NULL,
        itemId INTEGER NOT NULL,
        quantity REAL NOT NULL,
        price REAL NOT NULL,
        lineTotal REAL GENERATED ALWAYS AS (quantity * price) VIRTUAL
      )
    `).run();
  },

  openSession: (openedBy, openingAmount) => {
    const stmt = db.prepare(`
      INSERT INTO pos_sessions (openedBy, openingAmount, openedAt, status)
      VALUES (?, ?, datetime('now'), 'open')
    `);
    return stmt.run(openedBy || null, openingAmount || 0);
  },

  closeSession: (sessionId, closingAmount) => {
    const stmt = db.prepare(`
      UPDATE pos_sessions SET closingAmount = ?, closedAt = datetime('now'), status='closed' WHERE id = ? AND status='open'
    `);
    return stmt.run(closingAmount || 0, sessionId);
  },

  getOpenSession: () => {
    return db.prepare(`SELECT * FROM pos_sessions WHERE status='open' ORDER BY openedAt DESC LIMIT 1`).get();
  },

  createSale: (sale, lines) => {
    db.prepare('BEGIN').run();
    try {
      const saleStmt = db.prepare(`
        INSERT INTO pos_sales (sessionId, date, customerId, subtotal, tax, total, paymentType, createdAt)
        VALUES (?, datetime('now'), ?, ?, ?, ?, ?, datetime('now'))
      `);
      const saleRes = saleStmt.run(sale.sessionId, sale.customerId || null, sale.subtotal || 0, sale.tax || 0, sale.total || 0, sale.paymentType || null);
      const saleId = saleRes.lastInsertRowid;

      const lineStmt = db.prepare(`
        INSERT INTO pos_sale_lines (saleId, itemId, quantity, price) VALUES (?, ?, ?, ?)
      `);
      for (const l of lines || []) {
        lineStmt.run(saleId, l.itemId, l.quantity, l.price);
      }

      db.prepare('COMMIT').run();
      return { success: true, id: saleId };
    } catch (e) {
      db.prepare('ROLLBACK').run();
      return { success: false, error: e.message };
    }
  },

  listSales: (sessionId) => {
    if (sessionId) {
      return db.prepare(`SELECT * FROM pos_sales WHERE sessionId = ? ORDER BY date DESC`).all(sessionId);
    }
    return db.prepare(`SELECT * FROM pos_sales ORDER BY date DESC`).all();
  },

  listSessions: (limit) => {
    return db.prepare(`SELECT * FROM pos_sessions ORDER BY openedAt DESC LIMIT ?`).all(limit || 50);
  },

  getSaleWithLines: (saleId) => {
    const sale = db.prepare(`SELECT * FROM pos_sales WHERE id = ?`).get(saleId);
    if (!sale) return null;
    const lines = db.prepare(`
      SELECT l.*, i.code AS itemCode, i.name AS itemName
      FROM pos_sale_lines l
      LEFT JOIN items i ON i.id = l.itemId
      WHERE l.saleId = ?
    `).all(saleId);
    return { ...sale, lines };
  }
};

POS.createTables();

module.exports = POS;


