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
        date_entered DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_modified DATETIME
      )
    `;
    db.prepare(stmt).run();

    // Lightweight migrations for older databases: ensure expected columns exist
    try {
      const cols = new Set(db.prepare("PRAGMA table_info('chart_of_accounts')").all().map(r => r.name));
      const addCol = (name, ddl) => { if (!cols.has(name)) db.prepare(`ALTER TABLE chart_of_accounts ADD COLUMN ${name} ${ddl}`).run(); };
      addCol('name', 'TEXT');
      addCol('type', "TEXT DEFAULT 'Bank'");
      addCol('number', 'TEXT');
      addCol('balance', 'REAL DEFAULT 0');
      addCol('status', "TEXT DEFAULT 'Active'");
      addCol('entered_by', 'TEXT');
      addCol('date_entered', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
      addCol('last_modified', 'DATETIME');
    } catch (e) {
      console.error('chart_of_accounts migration failed:', e);
    }
  },

  getAllAccounts: () => {
    const stmt = db.prepare('SELECT id, name, type, number, balance, status FROM chart_of_accounts ORDER BY id DESC');
    const rows = stmt.all();
    // map DB fields to frontend-friendly keys used across the app
    return rows.map(r => ({
      id: r.id,
      accountName: r.name,
      accountType: r.type,
      accountNumber: r.number,
      accountCode: r.number,
      number: r.number,
      balance: r.balance || 0,
      status: r.status
    }));
  },

  insertAccount: (name, type, number, entered_by) => {
    const safeName = (name || '').toString().trim();
    const safeType = (type || 'Bank').toString().trim();
    const safeNumber = (number === undefined || number === null) ? null : number.toString().trim();
    if (!safeName) {
      return { success: false, error: 'Account name is required' };
    }
    const stmt = db.prepare('INSERT INTO chart_of_accounts (name, type, number, entered_by) VALUES (?, ?, ?, ?)');
    const res = stmt.run(safeName, safeType, safeNumber, entered_by || null);
    return { success: res.changes > 0, id: res.lastInsertRowid };
  },

  updateAccount: (accountData) => {
    try {
      const stmt = db.prepare(`
        UPDATE chart_of_accounts 
        SET name = ?,
            type = ?,
            number = ?,
            status = ?,
            last_modified = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      
      const res = stmt.run(
        accountData.accountName,
        accountData.accountType,
        accountData.accountNumber,
        accountData.status,
        accountData.id
      );
      
      return { 
        success: res.changes > 0,
        message: res.changes > 0 ? 'Account updated successfully' : 'No changes made'
      };
    } catch (error) {
      console.error('Error updating account:', error);
      throw error;
    }
  },

  deleteAccount: (id) => {
    try {
      // First check if account has any transactions
      const checkStmt = db.prepare(`
        SELECT COUNT(*) as count 
        FROM transactions 
        WHERE accountId = ?
      `);
      const { count } = checkStmt.get(id);
      
      if (count > 0) {
        return {
          success: false,
          message: 'Cannot delete account with existing transactions. Consider marking it as inactive instead.'
        };
      }

      const stmt = db.prepare('DELETE FROM chart_of_accounts WHERE id = ?');
      const res = stmt.run(id);
      
      return {
        success: res.changes > 0,
        message: res.changes > 0 ? 'Account deleted successfully' : 'Account not found'
      };
    } catch (error) {
      console.error('Error deleting account:', error);
      throw error;
    }
  },

  getCount: () => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM chart_of_accounts');
    return stmt.get().count;
  }
};

ChartOfAccounts.createTable();

module.exports = ChartOfAccounts;
