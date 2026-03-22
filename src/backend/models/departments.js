const db = require('./dbmgr');

const Departments = {
  createTable() {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        code TEXT,
        status TEXT DEFAULT 'Active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  },
  list() {
    return db.prepare(`SELECT * FROM departments WHERE status IS NULL OR status='Active' ORDER BY name`).all();
  },
  create({ name, code }) {
    if (!name) throw new Error('name required');
    const res = db.prepare(`INSERT INTO departments (name, code) VALUES (?, ?)`)
      .run(name, code || null);
    return { success: true, id: res.lastInsertRowid };
  }
};

Departments.createTable();
module.exports = Departments;


