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
    try {
      year = year || new Date().getFullYear();
      console.log('Fetching projections for year:', year);
      const stmt = db.prepare('SELECT month, inflow, outflow FROM cashflow_projections WHERE year = ? ORDER BY rowid');
      const rows = stmt.all(year);
      console.log('Found projections:', rows);
      return { success: true, data: rows };
    } catch (error) {
      console.error('Error getting projections:', error);
      return { success: false, error: error.message };
    }
  },

  saveProjections: (projections, year) => {
    year = year || new Date().getFullYear();
    
    // Get raw database instance for transaction support
    const rawDb = db.raw;
    
    const del = rawDb.prepare('DELETE FROM cashflow_projections WHERE year = ?');
    const insert = rawDb.prepare('INSERT INTO cashflow_projections (year, month, inflow, outflow) VALUES (?, ?, ?, ?)');
    
    // Create transaction function
    const transaction = rawDb.transaction((rows) => {
      del.run(year);
      for (const r of rows) {
        insert.run(year, r.month, r.inflow || 0, r.outflow || 0);
      }
    });

    try {
      // Execute transaction with data
      transaction(projections || []);
      return { success: true };
    } catch (error) {
      console.error('Error in saveProjections transaction:', error);
      return { success: false, error: error.message };
    }
  }
};

CashflowProjections.createTable();

module.exports = CashflowProjections;
