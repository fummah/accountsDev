const db = require('./dbmgr.js');

const ExpenseCategories = {
  createTable: () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS expense_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        color TEXT DEFAULT '#1890ff',
        status TEXT DEFAULT 'Active',
        date_entered DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Seed default categories if table is empty
    const count = db.prepare('SELECT COUNT(*) AS cnt FROM expense_categories').get().cnt;
    if (count === 0) {
      const defaults = [
        ['Advertising & Marketing', 'Ads, promotions, marketing materials', '#fa8c16'],
        ['Bank Fees & Charges', 'Bank service charges, transaction fees', '#f5222d'],
        ['Insurance', 'Business insurance premiums', '#722ed1'],
        ['Legal & Professional', 'Legal, accounting, consulting fees', '#1890ff'],
        ['Meals & Entertainment', 'Business meals and entertainment', '#eb2f96'],
        ['Office Supplies', 'Stationery, printer ink, supplies', '#52c41a'],
        ['Rent & Lease', 'Office/warehouse rent, equipment lease', '#13c2c2'],
        ['Repairs & Maintenance', 'Equipment and building maintenance', '#faad14'],
        ['Salaries & Wages', 'Employee compensation', '#2f54eb'],
        ['Telephone & Internet', 'Phone, internet, communication costs', '#a0d911'],
        ['Travel & Transport', 'Business travel, fuel, parking', '#ff7a45'],
        ['Utilities', 'Electricity, water, gas', '#597ef7'],
        ['Depreciation', 'Asset depreciation', '#8c8c8c'],
        ['Other Expense', 'Miscellaneous expenses', '#bfbfbf'],
      ];
      const ins = db.prepare('INSERT OR IGNORE INTO expense_categories (name, description, color) VALUES (?, ?, ?)');
      for (const [name, desc, color] of defaults) {
        ins.run(name, desc, color);
      }
    }
  },

  getAll: () => {
    return db.prepare('SELECT * FROM expense_categories ORDER BY name ASC').all();
  },

  getActive: () => {
    return db.prepare("SELECT * FROM expense_categories WHERE status = 'Active' ORDER BY name ASC").all();
  },

  insert: (name, description, color) => {
    try {
      const res = db.prepare('INSERT INTO expense_categories (name, description, color) VALUES (?, ?, ?)').run(name, description || '', color || '#1890ff');
      return { success: true, id: res.lastInsertRowid };
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE')) return { success: false, error: 'Category already exists' };
      return { success: false, error: e.message };
    }
  },

  update: (id, name, description, color, status) => {
    try {
      db.prepare('UPDATE expense_categories SET name = ?, description = ?, color = ?, status = ? WHERE id = ?').run(name, description || '', color || '#1890ff', status || 'Active', id);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  remove: (id) => {
    try {
      db.prepare('DELETE FROM expense_categories WHERE id = ?').run(id);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
};

ExpenseCategories.createTable();

module.exports = ExpenseCategories;
