const db = require('./dbmgr');

const Notifications = {
  createTables() {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS emails_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        toAddress TEXT,
        subject TEXT,
        body TEXT,
        status TEXT DEFAULT 'queued',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        sentAt DATETIME
      )
    `).run();
  },

  queueEmail({ to, subject, body }) {
    const stmt = db.prepare(`INSERT INTO emails_outbox (toAddress, subject, body) VALUES (?, ?, ?)`);
    return stmt.run(to || null, subject || '', body || '');
  },

  listOutbox(limit = 100) {
    return db.prepare(`SELECT * FROM emails_outbox ORDER BY id DESC LIMIT ?`).all(limit);
  }
};

Notifications.createTables();
module.exports = Notifications;


