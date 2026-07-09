const db = require('./dbmgr');

const Email = {
  createTable: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS email_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        recipient TEXT NOT NULL,
        subject TEXT,
        status TEXT NOT NULL DEFAULT 'success',
        error_message TEXT,
        document_type TEXT,
        document_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS oauth_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        email TEXT NOT NULL,
        client_id TEXT,
        client_secret TEXT,
        tenant_id TEXT,
        access_token TEXT,
        refresh_token TEXT,
        expiry_date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  },

  logSend: ({ recipient, subject, status, error_message, document_type, document_id }) => {
    const stmt = db.prepare(`
      INSERT INTO email_log (date, recipient, subject, status, error_message, document_type, document_id)
      VALUES (datetime('now'), ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(recipient, subject, status, error_message, document_type, document_id);
  },

  getLogs: (limit = 50) => {
    return db.prepare(`
      SELECT * FROM email_log ORDER BY created_at DESC LIMIT ?
    `).all(limit);
  },

  getOAuthTokens: (provider) => {
    if (provider) return db.prepare('SELECT * FROM oauth_tokens WHERE provider = ? ORDER BY id DESC LIMIT 1').get(provider);
    return db.prepare('SELECT * FROM oauth_tokens ORDER BY id DESC LIMIT 1').get();
  },

  saveOAuthTokens: ({ provider, email, client_id, client_secret, tenant_id, access_token, refresh_token, expiry_date }) => {
    const existing = db.prepare('SELECT id FROM oauth_tokens WHERE provider = ?').get(provider);
    if (existing) {
      const stmt = db.prepare(`
        UPDATE oauth_tokens SET email=?, client_id=?, client_secret=?, tenant_id=?,
          access_token=?, refresh_token=?, expiry_date=?, updated_at=datetime('now')
        WHERE id=?
      `);
      return stmt.run(email, client_id, client_secret, tenant_id, access_token, refresh_token, expiry_date, existing.id);
    }
    const stmt = db.prepare(`
      INSERT INTO oauth_tokens (provider, email, client_id, client_secret, tenant_id, access_token, refresh_token, expiry_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(provider, email, client_id, client_secret, tenant_id, access_token, refresh_token, expiry_date);
  },

  deleteOAuthTokens: (provider) => {
    return db.prepare('DELETE FROM oauth_tokens WHERE provider = ?').run(provider);
  },
};

Email.createTable();

module.exports = Email;
