const db = require('./dbmgr');
const crypto = require('crypto');
const Settings = require('./settings');

const AuditAnchors = {
	createTables() {
		db.prepare(`
			CREATE TABLE IF NOT EXISTS audit_anchors (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				refType TEXT NOT NULL,  -- e.g., 'journal'
				refId INTEGER NOT NULL,
				hash TEXT NOT NULL,
				provider TEXT DEFAULT 'none',
				txId TEXT,
				status TEXT DEFAULT 'pending',
				anchoredAt DATETIME
			)
		`).run();
	},

	listPending() {
		return db.prepare(`SELECT * FROM audit_anchors WHERE status='pending' ORDER BY id ASC LIMIT 100`).all();
	},

	computeJournalHash(entryId) {
		const entry = db.prepare(`SELECT * FROM journal_entries WHERE id=?`).get(entryId);
		if (!entry) throw new Error('Entry not found');
		const lines = db.prepare(`SELECT * FROM journal_lines WHERE entry_id=? ORDER BY id ASC`).all(entryId);
		const payload = JSON.stringify({ entry, lines });
		return crypto.createHash('sha256').update(payload).digest('hex');
	},

	ensureAnchorForJournal(entryId) {
		const h = this.computeJournalHash(entryId);
		const exists = db.prepare(`SELECT id FROM audit_anchors WHERE refType='journal' AND refId=?`).get(entryId);
		if (exists) return exists.id;
		const res = db.prepare(`INSERT INTO audit_anchors (refType, refId, hash) VALUES ('journal', ?, ?)`)
			.run(entryId, h);
		return res.lastInsertRowid;
	},

	async anchorPending() {
		const providerUrl = Settings.get('blockchain.anchorUrl');
		const token = Settings.get('blockchain.token');
		const rows = this.listPending();
		for (const r of rows) {
			if (!providerUrl) {
				db.prepare(`UPDATE audit_anchors SET status='anchored', provider='none', anchoredAt=datetime('now') WHERE id=?`).run(r.id);
				continue;
			}
			try {
				const resp = await (global.fetch ? fetch(providerUrl, {
					method: 'POST', headers: { 'Content-Type': 'application/json', ...(token?{ 'Authorization': `Bearer ${token}` }:{}) }, body: JSON.stringify({ hash: r.hash, refType: r.refType, refId: r.refId })
				}) : require('node-fetch')(providerUrl, { method:'POST', headers: { 'Content-Type': 'application/json', ...(token?{ 'Authorization': `Bearer ${token}` }:{}) }, body: JSON.stringify({ hash: r.hash, refType: r.refType, refId: r.refId }) }));
				let txId = '';
				try { const j = await resp.json(); txId = j.txId || j.id || ''; } catch {}
				db.prepare(`UPDATE audit_anchors SET status='anchored', provider='http', txId=?, anchoredAt=datetime('now') WHERE id=?`).run(txId, r.id);
			} catch (e) {
				db.prepare(`UPDATE audit_anchors SET status='error' WHERE id=?`).run(r.id);
			}
		}
	}
};

AuditAnchors.createTables();

module.exports = AuditAnchors;
