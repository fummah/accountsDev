const db = require('./dbmgr.js');

// Create roles table
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Seed default roles if table is empty
  const count = db.prepare('SELECT COUNT(*) as cnt FROM roles').get().cnt;
  if (count === 0) {
    const insert = db.prepare('INSERT OR IGNORE INTO roles (name, description) VALUES (?, ?)');
    insert.run('Admin', 'Full system access');
    insert.run('Manager', 'Department management access');
    insert.run('Staff', 'Standard employee access');
    insert.run('Accountant', 'Accounting and financial access');
    insert.run('HR', 'Human resources access');
  }
} catch (e) {
  console.error('Error initializing roles table:', e);
}

const Roles = {
  list: () => {
    try {
      return db.prepare('SELECT * FROM roles ORDER BY name ASC').all();
    } catch (e) {
      console.error('Error listing roles:', e);
      return [];
    }
  },

  create: (name, description = '') => {
    try {
      if (!name || !name.trim()) throw new Error('Role name is required');
      const result = db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)').run(name.trim(), description || '');
      return { success: true, id: result.lastInsertRowid };
    } catch (e) {
      console.error('Error creating role:', e);
      return { success: false, error: e.message };
    }
  },

  update: (id, name, description) => {
    try {
      if (!id) throw new Error('Role ID is required');
      if (!name || !name.trim()) throw new Error('Role name is required');
      const result = db.prepare('UPDATE roles SET name = ?, description = ? WHERE id = ?').run(name.trim(), description || '', id);
      return { success: result.changes > 0 };
    } catch (e) {
      console.error('Error updating role:', e);
      return { success: false, error: e.message };
    }
  },

  remove: (id) => {
    try {
      if (!id) throw new Error('Role ID is required');
      const result = db.prepare('DELETE FROM roles WHERE id = ?').run(id);
      return { success: result.changes > 0 };
    } catch (e) {
      console.error('Error deleting role:', e);
      return { success: false, error: e.message };
    }
  },
};

module.exports = Roles;
