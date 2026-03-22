const db = require('./dbmgr');

const Locations = {
  createTable() {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        code TEXT,
        status TEXT DEFAULT 'Active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  },
  list() {
    return db.prepare(`SELECT * FROM locations WHERE status IS NULL OR status='Active' ORDER BY name`).all();
  },
  create({ name, code }) {
    if (!name) throw new Error('name required');
    const res = db.prepare(`INSERT INTO locations (name, code) VALUES (?, ?)`)
      .run(name, code || null);
    return { success: true, id: res.lastInsertRowid };
  }
};

Locations.createTable();
module.exports = Locations;


