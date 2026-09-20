const db = require('./dbmgr');

const COAVersions = {
  createTable() {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS coa_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        note TEXT,
        snapshot_json TEXT NOT NULL
      )
    `).run();
  },

  createFromCurrent(note) {
    const rows = db.prepare(`SELECT id, name, type, number, balance, status FROM chart_of_accounts ORDER BY id`).all();
    const res = db.prepare(`INSERT INTO coa_versions (note, snapshot_json) VALUES (?, ?)`)
      .run(note || null, JSON.stringify(rows || []));
    return { success: true, id: res.lastInsertRowid };
  },

  list(limit = 50) {
    return db.prepare(`SELECT id, created_at, note, length(snapshot_json) as bytes FROM coa_versions ORDER BY id DESC LIMIT ?`).all(limit);
  },

  get(id) {
    const row = db.prepare(`SELECT * FROM coa_versions WHERE id = ?`).get(id);
    if (!row) return null;
    try { row.snapshot = JSON.parse(row.snapshot_json || '[]'); } catch { row.snapshot = []; }
    return row;
  },

  restore(id) {
    const ver = COAVersions.get(id);
    if (!ver) throw new Error('version not found');
    const snapshot = ver.snapshot || [];
    // Balances are computed live from journal_lines (computedBalance), so a
    // stored balance is never restored — inserting a stale number here would
    // conflict with the live ledger. Only account definitions are restored.
    const insert = db.prepare(`INSERT INTO chart_of_accounts (name, type, number, balance, status) VALUES (?, ?, ?, 0, ?)`);
    const existsByNum = db.prepare(`SELECT 1 FROM chart_of_accounts WHERE number = ? LIMIT 1`);
    const existsByName = db.prepare(`SELECT 1 FROM chart_of_accounts WHERE name = ? LIMIT 1`);
    const tx = db.transaction(() => {
      // Append-only restore: skip accounts already present by number or name.
      for (const acc of snapshot) {
        if (acc.number && existsByNum.get(String(acc.number))) continue;
        if (acc.name && existsByName.get(String(acc.name))) continue;
        insert.run(acc.name, acc.type, acc.number || null, acc.status || 'Active');
      }
    });
    tx();
    return { success: true };
  }
};

COAVersions.createTable();
module.exports = COAVersions;


