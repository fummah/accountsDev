// Expose pull/push endpoints for peer sync via the built-in API server
// This assumes the API server's auth middleware already protects these routes (x-api-key / Bearer)
const syncEngine = require('../services/syncEngine');
const Settings = require('../models/settings');

function register(app) {
	// Pull local changes since a timestamp
	app.get('/sync/pull', (req, res) => {
		try {
			const since = String(req.query.since || '1970-01-01T00:00:00.000Z');
			const db = require('../models/dbmgr');
			const rows = db.prepare(`
				SELECT id, tableName, recordId, op, payload, deviceId, updatedAt
				FROM change_log
				WHERE updatedAt > ?
				ORDER BY updatedAt ASC, id ASC
				LIMIT 5000
			`).all(since);
			return res.json({ deviceId: syncEngine.deviceId, changes: rows });
		} catch (e) {
			return res.status(500).json({ error: e.message });
		}
	});

	// Push remote changes to this node
	app.post('/sync/push', async (req, res) => {
		try {
			const body = req.body || {};
			const changes = Array.isArray(body.changes) ? body.changes : [];
			const result = syncEngine.applyChanges(changes);
			return res.json(result);
		} catch (e) {
			return res.status(500).json({ error: e.message });
		}
	});
}

module.exports = { register };


