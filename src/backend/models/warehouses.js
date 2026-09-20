const db = require('./dbmgr');

const Warehouses = {
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS warehouses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        name TEXT NOT NULL,
        location TEXT,
        isDefault INTEGER DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME
      )
    `;
    db.prepare(stmt).run();

    // Migration for existing databases: isDefault marks the warehouse that
    // documents use when the user has not picked one. Without it a multi-
    // warehouse install would have to force an explicit choice on every line.
    try { db.prepare("ALTER TABLE warehouses ADD COLUMN isDefault INTEGER DEFAULT 0").run(); } catch {}

    // Exactly one warehouse should be the default. If none is flagged (fresh
    // install, or a pre-migration database), promote the lowest id so that
    // single-warehouse installs resolve automatically.
    try {
      const flagged = db.prepare('SELECT COUNT(*) AS c FROM warehouses WHERE isDefault = 1').get();
      if (!flagged || !flagged.c) {
        const first = db.prepare('SELECT id FROM warehouses ORDER BY id ASC LIMIT 1').get();
        if (first) db.prepare('UPDATE warehouses SET isDefault = 1 WHERE id = ?').run(first.id);
      }
    } catch (e) {
      console.error('warehouses isDefault backfill failed:', e);
    }
  },

  getDefault: () => {
    return db.prepare('SELECT * FROM warehouses ORDER BY isDefault DESC, id ASC LIMIT 1').get() || null;
  },

  /**
   * The default warehouse, creating one if the install has none.
   *
   * `createTable()` only PROMOTES an existing row, so a brand-new install has
   * an empty `warehouses` table. Documents that must put stock somewhere (a
   * vendor bill's inventory line) would then have no valid target and the save
   * would have to fail — leaving the user unable to record a bill until they
   * happened to visit a warehouse screen. Creating the one row they would have
   * created anyway removes that dead end.
   *
   * Idempotent: returns the existing default when there is one.
   */
  getOrCreateDefault: () => {
    const existing = Warehouses.getDefault();
    if (existing) return existing;
    db.prepare(`
      INSERT INTO warehouses (code, name, location, isDefault, createdAt)
      VALUES ('MAIN', 'Main Warehouse', NULL, 1, datetime('now'))
    `).run();
    return Warehouses.getDefault();
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


