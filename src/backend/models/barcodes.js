const db = require('./dbmgr');

const Barcodes = {
  createTable: () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS barcodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        itemId INTEGER NOT NULL,
        code TEXT NOT NULL UNIQUE,
        symbology TEXT, -- EAN13, UPC, CODE128, QR, etc.
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  },

  addBarcode: (itemId, code, symbology) => {
    const stmt = db.prepare(`
      INSERT INTO barcodes (itemId, code, symbology, createdAt)
      VALUES (?, ?, ?, datetime('now'))
    `);
    return stmt.run(itemId, code, symbology || null);
  },

  getByItem: (itemId) => {
    return db.prepare(`SELECT * FROM barcodes WHERE itemId = ? ORDER BY id DESC`).all(itemId);
  },

  getByCode: (code) => {
    return db.prepare(`SELECT * FROM barcodes WHERE code = ?`).get(code);
  },

  delete: (id) => {
    return db.prepare(`DELETE FROM barcodes WHERE id = ?`).run(id);
  }
};

Barcodes.createTable();

module.exports = Barcodes;


