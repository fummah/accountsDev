const db = require('./dbmgr');

const CRM = {
  createTables: () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS crm_leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        company TEXT,
        email TEXT,
        phone TEXT,
        status TEXT DEFAULT 'new', -- new, contacted, qualified, won, lost
        source TEXT,
        owner TEXT,
        notes TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS crm_activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        leadId INTEGER,
        customerId INTEGER,
        type TEXT, -- call, meeting, task, note
        subject TEXT,
        details TEXT,
        dueDate DATETIME,
        status TEXT, -- open, done, canceled
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME
      )
    `).run();
  },

  // Leads
  listLeads: () => {
    return db.prepare(`SELECT * FROM crm_leads ORDER BY createdAt DESC`).all();
  },
  getLead: (id) => {
    return db.prepare(`SELECT * FROM crm_leads WHERE id = ?`).get(id);
  },
  createLead: (lead) => {
    const stmt = db.prepare(`
      INSERT INTO crm_leads (name, company, email, phone, status, source, owner, notes, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    return stmt.run(lead.name, lead.company || null, lead.email || null, lead.phone || null, lead.status || 'new', lead.source || null, lead.owner || null, lead.notes || null);
  },
  updateLead: (lead) => {
    const stmt = db.prepare(`
      UPDATE crm_leads SET name=?, company=?, email=?, phone=?, status=?, source=?, owner=?, notes=?, updatedAt=datetime('now') WHERE id=?
    `);
    return stmt.run(lead.name, lead.company || null, lead.email || null, lead.phone || null, lead.status || 'new', lead.source || null, lead.owner || null, lead.notes || null, lead.id);
  },
  deleteLead: (id) => {
    db.prepare('BEGIN').run();
    try {
      db.prepare(`DELETE FROM crm_activities WHERE leadId = ?`).run(id);
      db.prepare(`DELETE FROM crm_leads WHERE id = ?`).run(id);
      db.prepare('COMMIT').run();
      return { success: true };
    } catch (e) {
      db.prepare('ROLLBACK').run();
      return { success: false, error: e.message };
    }
  },

  // Activities
  listActivities: (params = {}) => {
    if (params.leadId) {
      return db.prepare(`SELECT * FROM crm_activities WHERE leadId = ? ORDER BY createdAt DESC`).all(params.leadId);
    }
    if (params.customerId) {
      return db.prepare(`SELECT * FROM crm_activities WHERE customerId = ? ORDER BY createdAt DESC`).all(params.customerId);
    }
    return db.prepare(`SELECT * FROM crm_activities ORDER BY createdAt DESC`).all();
  },
  createActivity: (activity) => {
    const stmt = db.prepare(`
      INSERT INTO crm_activities (leadId, customerId, type, subject, details, dueDate, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    return stmt.run(activity.leadId || null, activity.customerId || null, activity.type || null, activity.subject || null, activity.details || null, activity.dueDate || null, activity.status || 'open');
  },
  updateActivity: (activity) => {
    const stmt = db.prepare(`
      UPDATE crm_activities SET leadId=?, customerId=?, type=?, subject=?, details=?, dueDate=?, status=?, updatedAt=datetime('now') WHERE id=?
    `);
    return stmt.run(activity.leadId || null, activity.customerId || null, activity.type || null, activity.subject || null, activity.details || null, activity.dueDate || null, activity.status || 'open', activity.id);
  },
  deleteActivity: (id) => {
    return db.prepare(`DELETE FROM crm_activities WHERE id = ?`).run(id);
  }
};

CRM.createTables();

module.exports = CRM;


