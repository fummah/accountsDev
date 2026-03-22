const db = require('./dbmgr');
const crypto = require('crypto');

const AuditLog = {
  createTable() {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        userId TEXT,
        action TEXT NOT NULL,
        entityType TEXT NOT NULL,
        entityId TEXT,
        details TEXT,
        prev_hash TEXT,
        entry_hash TEXT
      )
    `).run();
    // Lightweight index for query speed
    try {
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entityType, entityId)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(timestamp)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_hash ON audit_logs(entry_hash)`).run();
    } catch (e) {
      // ignore index failures
    }

    // Backfill missing columns for existing installs (SQLite allows ADD COLUMN)
    try { db.prepare(`ALTER TABLE audit_logs ADD COLUMN prev_hash TEXT`).run(); } catch {}
    try { db.prepare(`ALTER TABLE audit_logs ADD COLUMN entry_hash TEXT`).run(); } catch {}
  },

  _computeHash(payload) {
    const h = crypto.createHash('sha256');
    h.update(JSON.stringify(payload));
    return h.digest('hex');
  },

  _getLastHash() {
    const row = db.prepare(`SELECT entry_hash FROM audit_logs ORDER BY id DESC LIMIT 1`).get();
    return row && row.entry_hash ? row.entry_hash : null;
  },

  log({ userId, action, entityType, entityId, details }) {
    const payload = details ? JSON.stringify(details) : null;
    const prevHash = AuditLog._getLastHash();
    const entryHash = AuditLog._computeHash({
      userId: userId || null,
      action,
      entityType,
      entityId: entityId != null ? String(entityId) : null,
      details: payload,
      prevHash: prevHash || ''
    });

    const stmt = db.prepare(`
      INSERT INTO audit_logs (userId, action, entityType, entityId, details, prev_hash, entry_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      userId || null,
      action,
      entityType,
      entityId != null ? String(entityId) : null,
      payload,
      prevHash,
      entryHash
    );
  },
  list({ entityType, entityId, limit = 200 }) {
    if (entityType && entityId != null) {
      return db.prepare(`
        SELECT * FROM audit_logs
        WHERE entityType = ? AND entityId = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(entityType, String(entityId), limit);
    }
    return db.prepare(`
      SELECT * FROM audit_logs
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit);
  },
  search({ action, entityType, userId, startDate, endDate, limit = 500 }) {
    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];
    if (action) { sql += ' AND action=?'; params.push(action); }
    if (entityType) { sql += ' AND entityType=?'; params.push(entityType); }
    if (userId) { sql += ' AND userId=?'; params.push(userId); }
    if (startDate) { sql += ' AND timestamp>=?'; params.push(startDate); }
    if (endDate) { sql += ' AND timestamp<=?'; params.push(endDate); }
    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);
    return db.prepare(sql).all(...params);
  },
  stats() {
    const total = db.prepare('SELECT COUNT(*) as c FROM audit_logs').get()?.c || 0;
    const actions = db.prepare('SELECT action, COUNT(*) as c FROM audit_logs GROUP BY action ORDER BY c DESC').all();
    const entities = db.prepare('SELECT entityType, COUNT(*) as c FROM audit_logs GROUP BY entityType ORDER BY c DESC').all();
    const users = db.prepare('SELECT userId, COUNT(*) as c FROM audit_logs WHERE userId IS NOT NULL GROUP BY userId ORDER BY c DESC').all();
    return { total, actions, entities, users };
  },
  verifyChain(limit = 100) {
    const rows = db.prepare('SELECT * FROM audit_logs ORDER BY id ASC LIMIT ?').all(limit);
    let prevHash = null;
    const broken = [];
    for (const row of rows) {
      if (row.prev_hash !== prevHash) broken.push({ id: row.id, expected: prevHash, got: row.prev_hash });
      prevHash = row.entry_hash;
    }
    return { total: rows.length, broken: broken.length, details: broken.slice(0, 10) };
  }
};

AuditLog.createTable();

module.exports = AuditLog;


