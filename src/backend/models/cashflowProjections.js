const db = require('./dbmgr.js');

const CashflowProjections = {
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS cashflow_projections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        month TEXT NOT NULL,
        inflow REAL DEFAULT 0,
        outflow REAL DEFAULT 0,
        date_entered DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    db.prepare(stmt).run();
    // add index for lookup
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_cashflow_year_month ON cashflow_projections(year, month)').run();
  },

  getProjections: (year) => {
    year = year || new Date().getFullYear();
    const stmt = db.prepare('SELECT month, inflow, outflow FROM cashflow_projections WHERE year = ? ORDER BY rowid');
    const rows = stmt.all(year);
    return rows;
  },

  saveProjections: (projections, year) => {
    year = year || new Date().getFullYear();
    const del = db.prepare('DELETE FROM cashflow_projections WHERE year = ?');
    const insert = db.prepare('INSERT INTO cashflow_projections (year, month, inflow, outflow) VALUES (?, ?, ?, ?)');
    const transaction = db.transaction((rows) => {
      del.run(year);
      for (const r of rows) {
        insert.run(year, r.month, r.inflow || 0, r.outflow || 0);
      }
    });
    transaction(projections || []);
    return { success: true };
  }
};

CashflowProjections.createTable();

module.exports = CashflowProjections;
