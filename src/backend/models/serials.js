const db = require('./dbmgr');

const Serials = {
  createTable: () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS serial_numbers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        itemId INTEGER NOT NULL,
        serial TEXT NOT NULL UNIQUE,
        warehouseId INTEGER,
        status TEXT DEFAULT 'in_stock', -- in_stock, allocated, sold, returned
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME
      )
    `).run();
  },

  addSerial: (itemId, serial, warehouseId) => {
    const stmt = db.prepare(`
      INSERT INTO serial_numbers (itemId, serial, warehouseId, createdAt)
      VALUES (?, ?, ?, datetime('now'))
    `);
    return stmt.run(itemId, serial, warehouseId || null);
  },

  assignToWarehouse: (serial, warehouseId) => {
    const stmt = db.prepare(`
      UPDATE serial_numbers SET warehouseId = ?, updatedAt = datetime('now') WHERE serial = ?
    `);
    return stmt.run(warehouseId || null, serial);
  },

  updateStatus: (serial, status) => {
    const stmt = db.prepare(`
      UPDATE serial_numbers SET status = ?, updatedAt = datetime('now') WHERE serial = ?
    `);
    return stmt.run(status, serial);
  },

  listByItem: (itemId) => {
    return db.prepare(`SELECT * FROM serial_numbers WHERE itemId = ? ORDER BY createdAt DESC`).all(itemId);
  },

  getBySerial: (serial) => {
    return db.prepare(`SELECT * FROM serial_numbers WHERE serial = ?`).get(serial);
  }
};

Serials.createTable();

module.exports = Serials;


