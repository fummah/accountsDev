const db = require('./dbmgr');

const Items = {
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT,
        name TEXT,
        description TEXT,
        category TEXT,
        unitPrice REAL DEFAULT 0,
        stock INTEGER DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME
      )
    `;
    db.prepare(stmt).run();
  },

  getAll: () => {
    const stmt = db.prepare('SELECT * FROM items ORDER BY code ASC');
    return stmt.all();
  },

  getById: (id) => {
    const stmt = db.prepare('SELECT * FROM items WHERE id = ?');
    return stmt.get(id);
  },

  create: (item) => {
    const stmt = db.prepare(`INSERT INTO items (code, name, description, category, unitPrice, stock, createdAt) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`);
    return stmt.run(item.code, item.name, item.description, item.category, item.unitPrice || 0, item.stock || 0);
  },

  update: (item) => {
    const stmt = db.prepare(`UPDATE items SET code = ?, name = ?, description = ?, category = ?, unitPrice = ?, stock = ?, updatedAt = datetime('now') WHERE id = ?`);
    return stmt.run(item.code, item.name, item.description, item.category, item.unitPrice || 0, item.stock || 0, item.id);
  },

  delete: (id) => {
    const stmt = db.prepare('DELETE FROM items WHERE id = ?');
    return stmt.run(id);
  }
};

// Ensure table exists on require
Items.createTable();

module.exports = Items;
