const db = require('./dbmgr');

const Entities = {
  createTables() {
    // Entities (companies/branches/departments)
    db.prepare(`
      CREATE TABLE IF NOT EXISTS entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        code TEXT,
        parent_id INTEGER,
        type TEXT,            -- Company | Branch | Department (free text)
        status TEXT DEFAULT 'Active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // User-to-entity access mapping
    db.prepare(`
      CREATE TABLE IF NOT EXISTS entity_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        entityId INTEGER NOT NULL,
        role TEXT,            -- Admin | Manager | Viewer
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    try {
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_entity_users_user ON entity_users(userId)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_entity_users_entity ON entity_users(entityId)`).run();
    } catch {}
  },

  listEntities() {
    return db.prepare(`SELECT * FROM entities WHERE status IS NULL OR status='Active' ORDER BY name`).all();
  },

  createEntity({ name, code, parent_id, type }) {
    if (!name) throw new Error('Entity name is required');
    const res = db.prepare(`INSERT INTO entities (name, code, parent_id, type) VALUES (?, ?, ?, ?)`)
      .run(name, code || null, parent_id || null, type || null);
    return { success: true, id: res.lastInsertRowid };
  },

  assignUserToEntity({ userId, entityId, role }) {
    if (!userId || !entityId) throw new Error('userId and entityId are required');
    const exists = db.prepare(`SELECT id FROM entity_users WHERE userId=? AND entityId=?`).get(userId, entityId);
    if (exists) {
      db.prepare(`UPDATE entity_users SET role=? WHERE id=?`).run(role || null, exists.id);
      return { success: true, id: exists.id, updated: true };
    }
    const res = db.prepare(`INSERT INTO entity_users (userId, entityId, role) VALUES (?, ?, ?)`)
      .run(userId, entityId, role || null);
    return { success: true, id: res.lastInsertRowid, created: true };
  },

  listUserEntities(userId) {
    if (!userId) return [];
    const rows = db.prepare(`
      SELECT e.*
      FROM entity_users eu
      JOIN entities e ON e.id = eu.entityId
      WHERE eu.userId = ? AND (e.status IS NULL OR e.status='Active')
      ORDER BY e.name
    `).all(userId);
    return rows;
  },

  userHasAccess(userId, entityId) {
    if (!userId || !entityId) return false;
    const row = db.prepare(`SELECT 1 FROM entity_users WHERE userId=? AND entityId=? LIMIT 1`).get(userId, entityId);
    return !!row;
  }
};

Entities.createTables();

module.exports = Entities;


