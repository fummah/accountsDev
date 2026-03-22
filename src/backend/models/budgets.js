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
  },

  updateBudget: (id, department, period, amount, forecast) => {
    const stmt = db.prepare('UPDATE budgets SET department=?, period=?, amount=?, forecast=? WHERE id=?');
    return stmt.run(department, period, amount || 0, forecast || 0, id);
  },

  deleteBudget: (id) => {
    return db.prepare('DELETE FROM budgets WHERE id=?').run(id);
  },

  getVsActual: (period) => {
    const budgets = period
      ? db.prepare('SELECT * FROM budgets WHERE period=? ORDER BY department').all(period)
      : db.prepare('SELECT * FROM budgets ORDER BY period DESC, department').all();

    const results = budgets.map(b => {
      let actual = 0;
      try {
        const row = db.prepare(`
          SELECT COALESCE(SUM(amount),0) as total FROM expenses
          WHERE category=? AND strftime('%Y-%m', date)=?
        `).get(b.department, b.period);
        actual = row?.total || 0;
      } catch {}
      const variance = b.amount - actual;
      const variancePct = b.amount > 0 ? ((variance / b.amount) * 100) : 0;
      return { ...b, actual, variance, variancePct, status: variance >= 0 ? 'under' : 'over' };
    });
    return results;
  },

  getPeriods: () => {
    try {
      return db.prepare('SELECT DISTINCT period FROM budgets ORDER BY period DESC').all().map(r => r.period);
    } catch { return []; }
  }
};

Budgets.createTable();

module.exports = Budgets;
