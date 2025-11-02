const db = require('./dbmgr.js');

const ChartOfAccounts = {
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS chart_of_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        number TEXT,
        balance REAL DEFAULT 0,
        status TEXT DEFAULT 'Active',
        entered_by TEXT,
        date_entered DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    db.prepare(stmt).run();
  },

  getAllAccounts: () => {
    const stmt = db.prepare('SELECT id, name, type, number, balance, status FROM chart_of_accounts ORDER BY id DESC');
    return stmt.all();
  },

  insertAccount: (name, type, number, entered_by) => {
    const stmt = db.prepare('INSERT INTO chart_of_accounts (name, type, number, entered_by) VALUES (?, ?, ?, ?)');
    const res = stmt.run(name, type, number, entered_by || null);
    return { success: res.changes > 0, id: res.lastInsertRowid };
  },

  getCount: () => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM chart_of_accounts');
    return stmt.get().count;
  }
};

ChartOfAccounts.createTable();

module.exports = ChartOfAccounts;
