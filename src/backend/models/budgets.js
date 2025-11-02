const db = require('./dbmgr.js');

const Budgets = {
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        department TEXT NOT NULL,
        period TEXT NOT NULL,
        amount REAL DEFAULT 0,
        forecast REAL DEFAULT 0,
        entered_by TEXT,
        date_entered DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    db.prepare(stmt).run();
  },

  getBudgets: () => {
    const stmt = db.prepare('SELECT id, department, period, amount, forecast, entered_by, date_entered FROM budgets ORDER BY id DESC');
    return stmt.all();
  },

  insertBudget: (department, period, amount, forecast, entered_by) => {
    const stmt = db.prepare('INSERT INTO budgets (department, period, amount, forecast, entered_by) VALUES (?, ?, ?, ?, ?)');
    const result = stmt.run(department, period, amount || 0, forecast || 0, entered_by || null);
    if (result.changes > 0) {
      return { success: true, id: result.lastInsertRowid };
    }
    return { success: false };
  }
};

Budgets.createTable();

module.exports = Budgets;
