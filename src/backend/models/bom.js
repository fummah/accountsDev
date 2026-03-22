const db = require('./dbmgr');

const BOM = {
  createTables: () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS boms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parentItemId INTEGER NOT NULL,
        name TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS bom_components (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bomId INTEGER NOT NULL,
        componentItemId INTEGER NOT NULL,
        quantity REAL NOT NULL
      )
    `).run();
  },

  createBom: (parentItemId, name) => {
    const stmt = db.prepare(`
      INSERT INTO boms (parentItemId, name, createdAt) VALUES (?, ?, datetime('now'))
    `);
    return stmt.run(parentItemId, name || null);
  },

  addComponent: (bomId, componentItemId, quantity) => {
    const stmt = db.prepare(`
      INSERT INTO bom_components (bomId, componentItemId, quantity) VALUES (?, ?, ?)
    `);
    return stmt.run(bomId, componentItemId, quantity);
  },

  removeComponent: (componentId) => {
    return db.prepare(`DELETE FROM bom_components WHERE id = ?`).run(componentId);
  },

  getBomWithComponents: (bomId) => {
    const bom = db.prepare(`SELECT * FROM boms WHERE id = ?`).get(bomId);
    if (!bom) return null;
    const components = db.prepare(`
      SELECT c.*, i.code AS componentCode, i.name AS componentName
      FROM bom_components c
      LEFT JOIN items i ON i.id = c.componentItemId
      WHERE c.bomId = ?
      ORDER BY c.id ASC
    `).all(bomId);
    return { ...bom, components };
  },

  listAssemblies: (searchTerm) => {
    if (searchTerm) {
      return db.prepare(`
        SELECT b.*, p.code AS parentCode, p.name AS parentName
        FROM boms b
        LEFT JOIN items p ON p.id = b.parentItemId
        WHERE p.name LIKE ? OR p.code LIKE ?
        ORDER BY b.createdAt DESC
      `).all(`%${searchTerm}%`, `%${searchTerm}%`);
    }
    return db.prepare(`
      SELECT b.*, p.code AS parentCode, p.name AS parentName
      FROM boms b
      LEFT JOIN items p ON p.id = b.parentItemId
      ORDER BY b.createdAt DESC
    `).all();
  }
};

BOM.createTables();

module.exports = BOM;


