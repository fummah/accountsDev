const db = require('./dbmgr');

const Settings = {
  createTable: () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  },

  set: (key, value) => {
    const stmt = db.prepare(`
      INSERT INTO settings (key, value, updatedAt)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updatedAt=excluded.updatedAt
    `);
    return stmt.run(key, JSON.stringify(value));
  },

  get: (key) => {
    const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  },

  getAll: () => {
    const rows = db.prepare(`SELECT key, value FROM settings`).all();
    const out = {};
    for (const r of rows) {
      try {
        out[r.key] = JSON.parse(r.value);
      } catch {
        out[r.key] = r.value;
      }
    }
    return out;
  }
};

Settings.createTable();

module.exports = Settings;


