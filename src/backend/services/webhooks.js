const db = require('../models/dbmgr');
const Settings = require('../models/settings');

const Webhooks = {
  ensureTable() {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS webhooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        events TEXT NOT NULL,
        secret TEXT,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_triggered_at DATETIME,
        failure_count INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`
      CREATE TABLE IF NOT EXISTS webhook_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        webhook_id INTEGER,
        event TEXT NOT NULL,
        payload TEXT,
        response_status INTEGER,
        response_body TEXT,
        success INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
      )
    `).run();
  },

  list() {
    return db.prepare(`SELECT * FROM webhooks ORDER BY created_at DESC`).all();
  },

  getById(id) {
    return db.prepare(`SELECT * FROM webhooks WHERE id = ?`).get(id);
  },

  create({ url, events, secret, active }) {
    if (!url) throw new Error('URL is required');
    const eventsStr = Array.isArray(events) ? events.join(',') : (events || '*');
    const result = db.prepare(`INSERT INTO webhooks (url, events, secret, active) VALUES (?, ?, ?, ?)`).run(
      url, eventsStr, secret || null, active !== false ? 1 : 0
    );
    return { success: true, id: result.lastInsertRowid };
  },

  update(id, { url, events, secret, active }) {
    const existing = db.prepare(`SELECT * FROM webhooks WHERE id = ?`).get(id);
    if (!existing) return { success: false, error: 'Webhook not found' };
    const eventsStr = Array.isArray(events) ? events.join(',') : (events || existing.events);
    db.prepare(`UPDATE webhooks SET url=?, events=?, secret=?, active=? WHERE id=?`).run(
      url || existing.url, eventsStr, secret !== undefined ? secret : existing.secret,
      active !== undefined ? (active ? 1 : 0) : existing.active, id
    );
    return { success: true };
  },

  delete(id) {
    db.prepare(`DELETE FROM webhook_logs WHERE webhook_id = ?`).run(id);
    db.prepare(`DELETE FROM webhooks WHERE id = ?`).run(id);
    return { success: true };
  },

  getLogs(webhookId, limit = 50) {
    if (webhookId) {
      return db.prepare(`SELECT * FROM webhook_logs WHERE webhook_id = ? ORDER BY created_at DESC LIMIT ?`).all(webhookId, limit);
    }
    return db.prepare(`SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT ?`).all(limit);
  },

  async dispatch(event, payload) {
    const hooks = db.prepare(`SELECT * FROM webhooks WHERE active = 1`).all();
    const results = [];
    for (const hook of hooks) {
      const events = (hook.events || '*').split(',').map(e => e.trim());
      if (!events.includes('*') && !events.includes(event)) continue;

      const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
      const headers = { 'Content-Type': 'application/json' };
      if (hook.secret) {
        const crypto = require('crypto');
        const sig = crypto.createHmac('sha256', hook.secret).update(body).digest('hex');
        headers['X-Webhook-Signature'] = sig;
      }

      let status = 0, responseBody = '', success = false;
      try {
        const doFetch = global.fetch || require('node-fetch');
        const res = await doFetch(hook.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) });
        status = res.status;
        responseBody = await res.text().catch(() => '');
        success = res.ok;
      } catch (e) {
        responseBody = e.message;
      }

      db.prepare(`INSERT INTO webhook_logs (webhook_id, event, payload, response_status, response_body, success) VALUES (?, ?, ?, ?, ?, ?)`).run(
        hook.id, event, body, status, responseBody.slice(0, 2000), success ? 1 : 0
      );
      db.prepare(`UPDATE webhooks SET last_triggered_at=datetime('now'), failure_count=? WHERE id=?`).run(
        success ? 0 : (hook.failure_count || 0) + 1, hook.id
      );

      results.push({ webhookId: hook.id, success, status });
    }
    return results;
  }
};

Webhooks.ensureTable();
module.exports = Webhooks;
