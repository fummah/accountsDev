const express = require('express');
const bodyParser = require('body-parser');
const Settings = require('../models/settings');
const { Invoices, Expenses, Transactions, Projects, Timesheets } = require('../models');
const fs = require('fs');
const path = require('path');
const { ipcMain } = require('electron');
const syncEngine = require('../services/syncEngine');
const db = require('../models/dbmgr');

let serverInstance = null;
let startedPort = null;

function authMiddleware(req, res, next) {
	const cfg = Settings.get('api.server') || {};
	if (!cfg.apiKey) return next();
	const key = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ','');
	if (key && key === cfg.apiKey) return next();
	return res.status(401).json({ error: 'Unauthorized' });
}

async function startServer() {
	const cfg = Settings.get('api.server') || { enabled: false, port: 0 };
	if (!cfg.enabled) return { started: false, reason: 'disabled' };
	if (serverInstance) return { started: true, port: startedPort };
	const app = express();
	app.use(bodyParser.json({ limit: '20mb' }));
	app.use(authMiddleware);

	app.get('/health', (_req, res) => res.json({ ok: true }));
	app.get('/api/invoices', (_req, res) => {
		try { res.json(Invoices.getAllInvoices()); } catch (e) { res.status(500).json({ error: e.message }); }
	});
	app.get('/api/expenses', (_req, res) => {
		try { res.json(Expenses.getAllExpenses()); } catch (e) { res.status(500).json({ error: e.message }); }
	});
	app.get('/api/transactions', (_req, res) => {
		try { res.json(Transactions.getTransactions ? Transactions.getTransactions() : []); } catch (e) { res.status(500).json({ error: e.message }); }
	});
	app.get('/api/projects', (_req, res) => {
		try { res.json(Projects.list()); } catch (e) { res.status(500).json({ error: e.message }); }
	});
	app.get('/api/projects/:id/timesheets', (req, res) => {
		try { res.json(Timesheets.listByProject(Number(req.params.id))); } catch (e) { res.status(500).json({ error: e.message }); }
	});

	// ── Sync relay endpoints for VPN peers ──
	app.post('/sync/push', (req, res) => {
		try {
			const { deviceId, changes } = req.body || {};
			if (!Array.isArray(changes)) return res.status(400).json({ error: 'changes array required' });
			// Store incoming changes in change_log so other peers can pull them
			const insert = db.prepare(`
				INSERT INTO change_log (tableName, recordId, op, payload, deviceId, updatedAt)
				VALUES (?, ?, ?, ?, ?, datetime('now'))
			`);
			const tx = db.transaction((batch) => {
				for (const ch of batch) {
					// Enrich payload with row snapshot if missing
					let payload = ch.payload || null;
					if (!payload && ch.op !== 'delete') {
						try {
							const row = db.prepare(`SELECT * FROM ${ch.tableName} WHERE id=?`).get(ch.recordId);
							if (row) payload = JSON.stringify({ row });
						} catch {}
					}
					insert.run(ch.tableName, String(ch.recordId), ch.op || 'update', 
						typeof payload === 'string' ? payload : (payload ? JSON.stringify(payload) : null),
						deviceId || ch.deviceId || 'unknown');
				}
			});
			tx(changes);
			// Also apply changes locally on the server node
			try { syncEngine.applyChanges(changes); } catch {}
			res.json({ ok: true, received: changes.length });
		} catch (e) { res.status(500).json({ error: e.message }); }
	});

	app.get('/sync/pull', (req, res) => {
		try {
			const since = req.query.since || '1970-01-01T00:00:00.000Z';
			const requestingDevice = req.query.deviceId || req.headers['x-device-id'] || null;
			let query = `
				SELECT id, tableName, recordId, op, payload, deviceId, updatedAt
				FROM change_log
				WHERE updatedAt > ?
			`;
			const params = [since];
			// Don't send back changes the requesting device originally made
			if (requestingDevice) {
				query += ` AND deviceId != ?`;
				params.push(requestingDevice);
			}
			query += ` ORDER BY updatedAt ASC, id ASC LIMIT 5000`;
			const changes = db.prepare(query).all(...params);
			// Enrich with row snapshots for inserts/updates without payload
			for (const ch of changes) {
				if (ch.op !== 'delete' && !ch.payload) {
					try {
						const row = db.prepare(`SELECT * FROM ${ch.tableName} WHERE id=?`).get(ch.recordId);
						if (row) ch.payload = JSON.stringify({ row });
					} catch {}
				}
			}
			res.json({ ok: true, changes });
		} catch (e) { res.status(500).json({ error: e.message }); }
	});

	app.get('/sync/status', (_req, res) => {
		try { res.json(syncEngine.getStatus()); } catch (e) { res.status(500).json({ error: e.message }); }
	});

	app.get('/sync/conflicts', (req, res) => {
		try { res.json(syncEngine.getConflicts(req.query.status || null)); } catch (e) { res.status(500).json({ error: e.message }); }
	});

	// Simple report run
	app.post('/api/report/run', (req, res) => {
		try {
			const { entity, fields, filters, dateField, startDate, endDate, limit } = req.body || {};
			const db = require('../models/dbmgr');
			const table = String(entity||'');
			const cols = Array.isArray(fields) && fields.length ? fields.map(String) : ['*'];
			let sql = `SELECT ${cols.join(', ')} FROM ${table} WHERE 1=1`;
			const params = [];
			for (const [k,v] of Object.entries(filters||{})) { sql += ` AND ${k} = ?`; params.push(v); }
			if (dateField && (startDate||endDate)) {
				if (startDate) { sql += ` AND ${dateField} >= ?`; params.push(startDate); }
				if (endDate) { sql += ` AND ${dateField} <= ?`; params.push(endDate); }
			}
			sql += ` LIMIT ${Math.max(1, Math.min(5000, Number(limit)||500))}`;
			return res.json(db.prepare(sql).all(...params));
		} catch (e) { res.status(500).json({ error: e.message }); }
	});

	// Plugin SDK loader: plugins/*.js should export function register(app){}
	try {
		const pluginsDir = path.join(__dirname, '..', 'plugins');
		if (fs.existsSync(pluginsDir)) {
			for (const f of fs.readdirSync(pluginsDir)) {
				if (!f.endsWith('.js')) continue;
				try {
					const mod = require(path.join(pluginsDir, f));
					if (mod && typeof mod.register === 'function') {
						mod.register(app);
						console.log(`[apiServer] plugin loaded: ${f}`);
					}
				} catch (e) { console.error('[apiServer] plugin error', f, e.message); }
			}
		}
	} catch {}

	const port = Number(cfg.port) || 4578;
	serverInstance = app.listen(port, () => {
		startedPort = port;
		console.log(`[apiServer] listening on http://localhost:${port}`);
	});
	return { started: true, port };
}

function stopServer() {
	if (serverInstance) {
		try { serverInstance.close(); } catch {}
		serverInstance = null;
		startedPort = null;
		return { stopped: true };
	}
	return { stopped: false };
}

async function register() {
	// Always register control IPC
	try {
		ipcMain.handle('api-server-status', async () => {
			const cfg = Settings.get('api.server') || { enabled: false, port: 0 };
			return { enabled: !!cfg.enabled, port: cfg.port || 0, running: !!serverInstance, runningPort: startedPort || null };
		});
	} catch {}
	try {
		ipcMain.handle('api-server-start', async () => startServer());
	} catch {}
	try {
		ipcMain.handle('api-server-stop', async () => stopServer());
	} catch {}
	try {
		ipcMain.handle('api-server-health', async () => {
			const cfg = Settings.get('api.server') || { enabled: false, port: 0, apiKey: null };
			if (!cfg.enabled) return { ok: false, error: 'disabled' };
			const url = `http://localhost:${cfg.port || 4577}/health`;
			try {
				const doFetch = global.fetch || require('node-fetch');
				const res = await doFetch(url, { headers: cfg.apiKey ? { 'x-api-key': cfg.apiKey } : {} });
				return { ok: res.ok, status: res.status };
			} catch (e) {
				return { ok: false, error: e.message };
			}
		});
	} catch {}

	// Auto-start if enabled
	const cfg = (Settings.get('api.server') || { enabled: false, port: 0 });
	if (!cfg.enabled) return;
	return startServer();
}

// keep backwards-compatible export
module.exports = register;


