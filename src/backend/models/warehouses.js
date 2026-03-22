const db = require('./dbmgr');

const Warehouses = {
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS warehouses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        name TEXT NOT NULL,
        location TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME
      )
    `;
    db.prepare(stmt).run();
  },

  getAll: () => {
    return db.prepare('SELECT * FROM warehouses ORDER BY name ASC').all();
  },

  getById: (id) => {
    return db.prepare('SELECT * FROM warehouses WHERE id = ?').get(id);
  },

  create: (warehouse) => {
    const stmt = db.prepare(`
      INSERT INTO warehouses (code, name, location, createdAt)
      VALUES (?, ?, ?, datetime('now'))
    `);
    return stmt.run(warehouse.code || null, warehouse.name, warehouse.location || null);
  },

  update: (warehouse) => {
    const stmt = db.prepare(`
      UPDATE warehouses
      SET code = ?, name = ?, location = ?, updatedAt = datetime('now')
      WHERE id = ?
    `);
    return stmt.run(warehouse.code || null, warehouse.name, warehouse.location || null, warehouse.id);
  },

  delete: (id) => {
    return db.prepare('DELETE FROM warehouses WHERE id = ?').run(id);
  }
};

Warehouses.createTable();

module.exports = Warehouses;


