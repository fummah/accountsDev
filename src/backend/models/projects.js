const db = require('./dbmgr');

const Projects = {
  createTables: () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        code TEXT,
        description TEXT,
        customerId INTEGER,
        status TEXT DEFAULT 'active', -- active, on_hold, completed, cancelled
        budget REAL DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME
      )
    `).run();

    // Safe migration: add description if missing
    try {
      const cols = new Set(db.prepare(`PRAGMA table_info('projects')`).all().map(r => r.name));
      if (!cols.has('description')) {
        db.prepare(`ALTER TABLE projects ADD COLUMN description TEXT`).run();
      }
    } catch {}

    db.prepare(`
      CREATE TABLE IF NOT EXISTS project_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projectId INTEGER NOT NULL,
        linkType TEXT NOT NULL, -- transaction|invoice|expense|timesheet|other
        linkedId INTEGER NOT NULL,
        direction TEXT NOT NULL, -- revenue|expense
        amount REAL NOT NULL,
        costType TEXT, -- labour|material|overhead|null
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Safe migration: add costType if missing
    try {
      const cols = new Set(db.prepare(`PRAGMA table_info('project_links')`).all().map(r => r.name));
      if (!cols.has('costType')) {
        db.prepare(`ALTER TABLE project_links ADD COLUMN costType TEXT`).run();
      }
    } catch {}
  },

  list: () => {
    return db.prepare(`SELECT * FROM projects ORDER BY createdAt DESC`).all();
  },

  getById: (id) => {
    return db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
  },

  create: (project) => {
    const stmt = db.prepare(`
      INSERT INTO projects (name, code, description, customerId, status, budget, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    return stmt.run(project.name, project.code || null, project.description || null, project.customerId || null, project.status || 'active', project.budget || 0);
  },

  update: (project) => {
    const stmt = db.prepare(`
      UPDATE projects SET name=?, code=?, description=?, customerId=?, status=?, budget=?, updatedAt=datetime('now') WHERE id=?
    `);
    return stmt.run(project.name, project.code || null, project.description || null, project.customerId || null, project.status || 'active', project.budget || 0, project.id);
  },

  delete: (id) => {
    db.prepare('BEGIN').run();
    try {
      db.prepare(`DELETE FROM project_links WHERE projectId = ?`).run(id);
      db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
      db.prepare('COMMIT').run();
      return { success: true };
    } catch (e) {
      db.prepare('ROLLBACK').run();
      return { success: false, error: e.message };
    }
  },

  addLink: (projectId, linkType, linkedId, direction, amount, costType) => {
    const stmt = db.prepare(`
      INSERT INTO project_links (projectId, linkType, linkedId, direction, amount, costType, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    return stmt.run(projectId, linkType, linkedId, direction, amount, costType || null);
  },

  listLinks: (projectId) => {
    return db.prepare(`SELECT * FROM project_links WHERE projectId = ? ORDER BY createdAt DESC`).all(projectId);
  },

  getProfitability: (projectId) => {
    const sums = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN direction='revenue' THEN amount ELSE 0 END),0) AS totalRevenue,
        COALESCE(SUM(CASE WHEN direction='expense' THEN amount ELSE 0 END),0) AS totalExpense,
        COALESCE(SUM(CASE WHEN direction='expense' AND costType='labour' THEN amount ELSE 0 END),0) AS labourCost,
        COALESCE(SUM(CASE WHEN direction='expense' AND costType='material' THEN amount ELSE 0 END),0) AS materialCost,
        COALESCE(SUM(CASE WHEN direction='expense' AND costType='overhead' THEN amount ELSE 0 END),0) AS overheadCost
      FROM project_links WHERE projectId = ?
    `).get(projectId);
    const profit = sums.totalRevenue - sums.totalExpense;
    return { ...sums, profit };
  }
};

Projects.createTables();

module.exports = Projects;


