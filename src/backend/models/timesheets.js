const db = require('./dbmgr');

const Timesheets = {
  createTable: () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS timesheets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projectId INTEGER NOT NULL,
        employeeId INTEGER,
        workDate DATE NOT NULL,
        hours REAL NOT NULL,
        hourlyRate REAL DEFAULT 0,
        amount REAL GENERATED ALWAYS AS (hours * hourlyRate) VIRTUAL,
        notes TEXT,
        billed INTEGER DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    // Safe migration: ensure billed exists
    try {
      const cols = new Set(db.prepare(`PRAGMA table_info('timesheets')`).all().map(r => r.name));
      if (!cols.has('billed')) {
        db.prepare(`ALTER TABLE timesheets ADD COLUMN billed INTEGER DEFAULT 0`).run();
      }
    } catch {}
  },

  logTime: (entry) => {
    const stmt = db.prepare(`
      INSERT INTO timesheets (projectId, employeeId, workDate, hours, hourlyRate, notes, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    const res = stmt.run(entry.projectId, entry.employeeId || null, entry.workDate, entry.hours, entry.hourlyRate || 0, entry.notes || null);
    try {
      const amount = Number(entry.hours || 0) * Number(entry.hourlyRate || 0);
      if (amount > 0) {
        const Projects = require('./projects');
        Projects.addLink(entry.projectId, 'timesheet', res.lastInsertRowid, 'expense', amount, 'labour');
      }
    } catch {}
    return res;
  },

  listByProject: (projectId) => {
    return db.prepare(`
      SELECT t.*, e.first_name || ' ' || e.last_name AS employeeName
      FROM timesheets t
      LEFT JOIN employees e ON e.id = t.employeeId
      WHERE t.projectId = ?
      ORDER BY t.workDate DESC
    `).all(projectId);
  },

  delete: (id) => {
    return db.prepare('DELETE FROM timesheets WHERE id = ?').run(id);
  }
};

Timesheets.createTable();

module.exports = Timesheets;


