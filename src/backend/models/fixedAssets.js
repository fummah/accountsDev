const db = require('./dbmgr.js');

const FixedAssets = {
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS fixed_assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT,
        value REAL DEFAULT 0,
        status TEXT DEFAULT 'Active',
        entered_by TEXT,
        date_entered DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    db.prepare(stmt).run();
  },

  getAllAssets: () => {
    const stmt = db.prepare('SELECT id, name, category, value, status FROM fixed_assets ORDER BY id DESC');
    return stmt.all();
  },

  insertAsset: (name, category, value, entered_by) => {
    const stmt = db.prepare('INSERT INTO fixed_assets (name, category, value, entered_by) VALUES (?, ?, ?, ?)');
    const res = stmt.run(name, category, value || 0, entered_by || null);
    return { success: res.changes > 0, id: res.lastInsertRowid };
  },

  getCount: () => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM fixed_assets');
    return stmt.get().count;
  }
};

FixedAssets.createTable();

module.exports = FixedAssets;
