const crypto = require('crypto');
const Settings = require('../models/settings');
const AuditLog = require('../models/auditLog');
const db = require('../models/dbmgr');

// Simple helper to get or create a unique device id
function getDeviceId() {
	const existing = Settings.get('device.id');
	if (existing && typeof existing === 'string' && existing.length > 0) return existing;
	const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
	Settings.set('device.id', id);
	return id;
}

function nowIso() {
	return new Date().toISOString();
}

class SyncEngine {
	constructor() {
		this.deviceId = getDeviceId();
		this._ensureSchema();
		this._conflictStrategy = 'auto-merge'; // auto-merge | last-writer-wins | manual
	}

	_ensureSchema() {
		// Record-level locks
		db.prepare(`
			CREATE TABLE IF NOT EXISTS record_locks (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				tableName TEXT NOT NULL,
				recordId TEXT NOT NULL,
				ownerDeviceId TEXT NOT NULL,
				ownerUserId TEXT,
				expiresAt DATETIME NOT NULL,
				createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
				updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
				UNIQUE(tableName, recordId)
			)
		`).run();
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_record_locks_table_record ON record_locks(tableName, recordId)`).run();

		// Change log for sync (append only)
		db.prepare(`
			CREATE TABLE IF NOT EXISTS change_log (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				tableName TEXT NOT NULL,
				recordId TEXT NOT NULL,
				op TEXT NOT NULL,                -- insert|update|delete
				payload TEXT,                    -- JSON snapshot or diff
				deviceId TEXT NOT NULL,
				updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_change_log_table ON change_log(tableName, recordId)`).run();
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_change_log_time ON change_log(updatedAt)`).run();

		// Sync state checkpoints per remote endpoint
		db.prepare(`
			CREATE TABLE IF NOT EXISTS sync_state (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				endpoint TEXT NOT NULL,
				lastPushedAt DATETIME,
				lastPulledAt DATETIME,
				UNIQUE(endpoint)
			)
		`).run();

		// Conflict log for manual resolution
		db.prepare(`
			CREATE TABLE IF NOT EXISTS sync_conflicts (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				tableName TEXT NOT NULL,
				recordId TEXT NOT NULL,
				localData TEXT,
				remoteData TEXT,
				conflictingFields TEXT,
				resolution TEXT DEFAULT 'pending',
				resolvedBy TEXT,
				deviceId TEXT,
				createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
				resolvedAt DATETIME
			)
		`).run();
		db.prepare(`CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status ON sync_conflicts(resolution)`).run();
	}

	getStatus() {
		const locks = db.prepare(`SELECT COUNT(1) as cnt FROM record_locks`).get().cnt;
		const pending = db.prepare(`SELECT COUNT(1) as cnt FROM change_log`).get().cnt;
		const conflicts = db.prepare(`SELECT COUNT(1) as cnt FROM sync_conflicts WHERE resolution='pending'`).get().cnt;
		return {
			deviceId: this.deviceId,
			locks,
			pendingChanges: pending,
			pendingConflicts: conflicts,
			conflictStrategy: this._conflictStrategy,
		};
	}

	setConflictStrategy(strategy) {
		const valid = ['auto-merge', 'last-writer-wins', 'manual'];
		if (valid.includes(strategy)) this._conflictStrategy = strategy;
		return { ok: true, strategy: this._conflictStrategy };
	}

	// Conflict resolution: detect and handle field-level conflicts
	_resolveConflict(tableName, recordId, localRow, remoteRow, remoteDeviceId) {
		if (!localRow || !remoteRow) return { action: 'apply', mergedData: remoteRow };

		const localData = typeof localRow === 'string' ? JSON.parse(localRow) : localRow;
		const remoteData = typeof remoteRow === 'string' ? JSON.parse(remoteRow) : remoteRow;

		// Find fields that differ
		const allKeys = new Set([...Object.keys(localData), ...Object.keys(remoteData)]);
		const conflictingFields = [];
		const merged = { ...localData };
		let hasConflict = false;

		for (const key of allKeys) {
			if (key === 'id') continue;
			const localVal = localData[key];
			const remoteVal = remoteData[key];
			if (localVal === remoteVal) continue;

			// If only remote changed (local is null/undefined or same as before), accept remote
			if (localVal === null || localVal === undefined) {
				merged[key] = remoteVal;
				continue;
			}
			// If only local has value and remote is null, keep local
			if (remoteVal === null || remoteVal === undefined) {
				continue;
			}
			// Both changed to different values - true conflict
			conflictingFields.push({ field: key, local: localVal, remote: remoteVal });
			hasConflict = true;
		}

		if (!hasConflict) {
			// Auto-merge: no true conflicts, just apply merged data
			return { action: 'apply', mergedData: merged };
		}

		switch (this._conflictStrategy) {
			case 'last-writer-wins':
				// Remote wins for all conflicting fields
				for (const cf of conflictingFields) merged[cf.field] = cf.remote;
				return { action: 'apply', mergedData: merged };

			case 'manual':
				// Log conflict for manual resolution, don't apply
				this._logConflict(tableName, recordId, localData, remoteData, conflictingFields, remoteDeviceId);
				return { action: 'skip', conflictingFields };

			case 'auto-merge':
			default:
				// Auto-merge non-conflicting fields, log true conflicts for review but apply remote
				for (const cf of conflictingFields) merged[cf.field] = cf.remote;
				this._logConflict(tableName, recordId, localData, remoteData, conflictingFields, remoteDeviceId);
				AuditLog.log({
					userId: 'system', action: 'syncConflictAutoMerged',
					entityType: tableName, entityId: String(recordId),
					details: { fields: conflictingFields.map(f => f.field), strategy: 'auto-merge' }
				});
				return { action: 'apply', mergedData: merged, hadConflicts: true };
		}
	}

	_logConflict(tableName, recordId, localData, remoteData, conflictingFields, deviceId) {
		db.prepare(`
			INSERT INTO sync_conflicts (tableName, recordId, localData, remoteData, conflictingFields, resolution, deviceId)
			VALUES (?, ?, ?, ?, ?, 'pending', ?)
		`).run(
			tableName, String(recordId),
			JSON.stringify(localData), JSON.stringify(remoteData),
			JSON.stringify(conflictingFields),
			deviceId || 'unknown'
		);
	}

	getConflicts(status) {
		const filter = status ? `WHERE resolution=?` : `WHERE 1=1`;
		const rows = status
			? db.prepare(`SELECT * FROM sync_conflicts ${filter} ORDER BY createdAt DESC LIMIT 200`).all(status)
			: db.prepare(`SELECT * FROM sync_conflicts ORDER BY createdAt DESC LIMIT 200`).all();
		return rows.map(r => ({
			...r,
			localData: r.localData ? JSON.parse(r.localData) : null,
			remoteData: r.remoteData ? JSON.parse(r.remoteData) : null,
			conflictingFields: r.conflictingFields ? JSON.parse(r.conflictingFields) : [],
		}));
	}

	resolveConflict(conflictId, resolution, resolvedBy) {
		// resolution: 'accept-local' | 'accept-remote' | 'custom'
		const conflict = db.prepare(`SELECT * FROM sync_conflicts WHERE id=?`).get(conflictId);
		if (!conflict) return { ok: false, error: 'Conflict not found' };

		const localData = conflict.localData ? JSON.parse(conflict.localData) : {};
		const remoteData = conflict.remoteData ? JSON.parse(conflict.remoteData) : {};

		let finalData;
		if (resolution === 'accept-local') {
			finalData = localData;
		} else if (resolution === 'accept-remote') {
			finalData = remoteData;
		} else {
			// For 'custom', caller should pass the merged data
			finalData = resolvedBy?.customData || remoteData;
		}

		// Apply the resolved data to the table
		const t = conflict.tableName;
		const id = conflict.recordId;
		const keys = Object.keys(finalData).filter(k => k !== 'id');
		if (keys.length > 0) {
			const setClause = keys.map(k => `${k}=?`).join(',');
			const values = keys.map(k => finalData[k]);
			values.push(id);
			try { db.prepare(`UPDATE ${t} SET ${setClause} WHERE id=?`).run(...values); } catch {}
		}

		db.prepare(`
			UPDATE sync_conflicts SET resolution=?, resolvedBy=?, resolvedAt=datetime('now')
			WHERE id=?
		`).run(resolution, typeof resolvedBy === 'string' ? resolvedBy : (resolvedBy?.userId || 'system'), conflictId);

		AuditLog.log({
			userId: typeof resolvedBy === 'string' ? resolvedBy : (resolvedBy?.userId || 'system'),
			action: 'syncConflictResolved',
			entityType: t, entityId: String(id),
			details: { conflictId, resolution }
		});

		return { ok: true, conflictId, resolution };
	}

	// Record-level locking
	acquireLock(tableName, recordId, ownerUserId, ttlSec = 120) {
		const now = new Date();
		const expiresAt = new Date(now.getTime() + Math.max(15, ttlSec) * 1000).toISOString();
		const existing = db.prepare(`SELECT * FROM record_locks WHERE tableName=? AND recordId=?`).get(tableName, String(recordId));
		if (existing) {
			// If expired, we can take over
			const isExpired = new Date(existing.expiresAt).getTime() < Date.now();
			if (!isExpired && existing.ownerDeviceId !== this.deviceId) {
				return { ok: false, reason: 'locked', lock: existing };
			}
			// update lock
			db.prepare(`
				UPDATE record_locks
				SET ownerDeviceId=?, ownerUserId=?, expiresAt=?, updatedAt=datetime('now')
				WHERE tableName=? AND recordId=?
			`).run(this.deviceId, ownerUserId || null, expiresAt, tableName, String(recordId));
			return { ok: true, tableName, recordId, expiresAt };
		}
		db.prepare(`
			INSERT INTO record_locks (tableName, recordId, ownerDeviceId, ownerUserId, expiresAt)
			VALUES (?, ?, ?, ?, ?)
		`).run(tableName, String(recordId), this.deviceId, ownerUserId || null, expiresAt);
		return { ok: true, tableName, recordId, expiresAt };
	}

	releaseLock(tableName, recordId) {
		const existing = db.prepare(`SELECT * FROM record_locks WHERE tableName=? AND recordId=?`).get(tableName, String(recordId));
		if (!existing) return { ok: true };
		// Allow release by same device or expired
		const isExpired = new Date(existing.expiresAt).getTime() < Date.now();
		if (existing.ownerDeviceId !== this.deviceId && !isExpired) {
			return { ok: false, reason: 'notOwner' };
		}
		db.prepare(`DELETE FROM record_locks WHERE tableName=? AND recordId=?`).run(tableName, String(recordId));
		return { ok: true };
	}

	heartbeatLock(tableName, recordId, ttlSec = 120) {
		const existing = db.prepare(`SELECT * FROM record_locks WHERE tableName=? AND recordId=?`).get(tableName, String(recordId));
		if (!existing) return { ok: false, reason: 'notFound' };
		if (existing.ownerDeviceId !== this.deviceId) return { ok: false, reason: 'notOwner' };
		const expiresAt = new Date(Date.now() + Math.max(15, ttlSec) * 1000).toISOString();
		db.prepare(`
			UPDATE record_locks SET expiresAt=?, updatedAt=datetime('now')
			WHERE tableName=? AND recordId=?
		`).run(expiresAt, tableName, String(recordId));
		return { ok: true, expiresAt };
	}

	// Change logging (can be used in addition to or instead of triggers)
	logChange(tableName, recordId, op, payloadObj) {
		const payload = payloadObj ? JSON.stringify(payloadObj) : null;
		db.prepare(`
			INSERT INTO change_log (tableName, recordId, op, payload, deviceId, updatedAt)
			VALUES (?, ?, ?, ?, ?, datetime('now'))
		`).run(tableName, String(recordId), String(op || 'update'), payload, this.deviceId);
	}

	// Create lightweight triggers for a set of tables.
	// These will append to change_log and enforce lock checks on UPDATE/DELETE.
	ensureTriggersForTables(tables) {
		const tableNames = Array.isArray(tables) ? tables : [];
		for (const t of tableNames) {
			const name = String(t);
			// We assume integer PK column named 'id' as per existing models; skip if table missing
			try {
				const exists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name);
				if (!exists) continue;
			} catch {
				continue;
			}
			// Change-log triggers
			try {
				// Drop old versions so we can safely update the definition
				db.prepare(`DROP TRIGGER IF EXISTS trg_${name}_ai_change`).run();
			} catch {}
			try {
				db.prepare(`
					CREATE TRIGGER IF NOT EXISTS trg_${name}_ai_change AFTER INSERT ON ${name}
					BEGIN
						INSERT INTO change_log(tableName, recordId, op, payload, deviceId, updatedAt)
						VALUES ('${name}', NEW.id, 'insert', NULL, '${this.deviceId}', datetime('now'));
					END;
				`).run();
			} catch {}
			try {
				db.prepare(`DROP TRIGGER IF EXISTS trg_${name}_au_change`).run();
			} catch {}
			try {
				db.prepare(`
					CREATE TRIGGER IF NOT EXISTS trg_${name}_au_change AFTER UPDATE ON ${name}
					BEGIN
						INSERT INTO change_log(tableName, recordId, op, payload, deviceId, updatedAt)
						VALUES ('${name}', NEW.id, 'update', NULL, '${this.deviceId}', datetime('now'));
					END;
				`).run();
			} catch {}
			try {
				db.prepare(`DROP TRIGGER IF EXISTS trg_${name}_ad_change`).run();
			} catch {}
			try {
				db.prepare(`
					CREATE TRIGGER IF NOT EXISTS trg_${name}_ad_change AFTER DELETE ON ${name}
					BEGIN
						INSERT INTO change_log(tableName, recordId, op, payload, deviceId, updatedAt)
						VALUES ('${name}', OLD.id, 'delete', NULL, '${this.deviceId}', datetime('now'));
					END;
				`).run();
			} catch {}

			// Lock enforcement triggers (prevent update/delete if record is locked by another device)
			try {
				db.prepare(`
					CREATE TRIGGER IF NOT EXISTS trg_${name}_bu_lock BEFORE UPDATE ON ${name}
					BEGIN
						SELECT
							CASE
								WHEN EXISTS (
									SELECT 1 FROM record_locks rl
									WHERE rl.tableName='${name}'
									  AND rl.recordId=CAST(OLD.id AS TEXT)
									  AND rl.ownerDeviceId!='${this.deviceId}'
									  AND datetime(rl.expiresAt) > datetime('now')
								)
								THEN RAISE(ABORT, 'Record is locked')
							END;
					END;
				`).run();
			} catch {}
			try {
				db.prepare(`
					CREATE TRIGGER IF NOT EXISTS trg_${name}_bd_lock BEFORE DELETE ON ${name}
					BEGIN
						SELECT
							CASE
								WHEN EXISTS (
									SELECT 1 FROM record_locks rl
									WHERE rl.tableName='${name}'
									  AND rl.recordId=CAST(OLD.id AS TEXT)
									  AND rl.ownerDeviceId!='${this.deviceId}'
									  AND datetime(rl.expiresAt) > datetime('now')
								)
								THEN RAISE(ABORT, 'Record is locked')
							END;
					END;
				`).run();
			} catch {}
		}
		return { ok: true, tables: tableNames };
	}

	// Push local changes since last checkpoint to a remote endpoint
	async push(remoteUrl, token) {
		if (!remoteUrl) return { ok: true, pushed: 0 };
		const state = db.prepare(`SELECT * FROM sync_state WHERE endpoint=?`).get(remoteUrl) || { lastPushedAt: null };
		const since = state.lastPushedAt || '1970-01-01T00:00:00.000Z';
		const changes = db.prepare(`
			SELECT id, tableName, recordId, op, payload, deviceId, updatedAt
			FROM change_log
			WHERE updatedAt > ?
			ORDER BY updatedAt ASC, id ASC
			LIMIT 5000
		`).all(since);
		if (changes.length === 0) return { ok: true, pushed: 0 };
		// Enrich with row snapshots for inserts/updates missing payload
		for (const ch of changes) {
			if (ch.op !== 'delete' && !ch.payload) {
				try {
					const row = db.prepare(`SELECT * FROM ${ch.tableName} WHERE id=?`).get(ch.recordId);
					if (row) ch.payload = JSON.stringify({ row });
				} catch {}
			}
		}
		const body = { deviceId: this.deviceId, changes };
		const headers = { 'Content-Type': 'application/json' };
		if (token) headers['Authorization'] = `Bearer ${token}`;
		const doFetch = global.fetch || require('node-fetch');
		const res = await doFetch(remoteUrl.replace(/\/+$/,'') + '/sync/push', {
			method: 'POST',
			headers,
			body: JSON.stringify(body)
		});
		if (!res.ok) throw new Error(`Push failed: HTTP ${res.status}`);
		db.prepare(`
			INSERT INTO sync_state (endpoint, lastPushedAt, lastPulledAt)
			VALUES (?, ?, COALESCE((SELECT lastPulledAt FROM sync_state WHERE endpoint=?), NULL))
			ON CONFLICT(endpoint) DO UPDATE SET lastPushedAt=excluded.lastPushedAt
		`).run(remoteUrl, nowIso(), remoteUrl);
		return { ok: true, pushed: changes.length };
	}

	// Pull remote changes and apply locally with conflict resolution
	async pull(remoteUrl, token) {
		if (!remoteUrl) return { ok: true, pulled: 0, conflicts: 0 };
		const state = db.prepare(`SELECT * FROM sync_state WHERE endpoint=?`).get(remoteUrl) || { lastPulledAt: null };
		const since = state.lastPulledAt || '1970-01-01T00:00:00.000Z';
		const headers = {};
		if (token) headers['Authorization'] = `Bearer ${token}`;
		const doFetch = global.fetch || require('node-fetch');
		const res = await doFetch(remoteUrl.replace(/\/+$/,'') + `/sync/pull?since=${encodeURIComponent(since)}`, { headers });
		if (!res.ok) throw new Error(`Pull failed: HTTP ${res.status}`);
		const payload = await res.json();
		const changes = Array.isArray(payload?.changes) ? payload.changes : [];
		let applied = 0;
		let conflictCount = 0;
		const self = this;
		const tx = db.transaction((batch) => {
			for (const ch of batch) {
				const t = String(ch.tableName);
				const id = String(ch.recordId);
				const op = String(ch.op || 'update');
				const row = ch.payload ? (typeof ch.payload === 'string' ? JSON.parse(ch.payload) : ch.payload) : null;
				if (op === 'delete') {
					try { db.prepare(`DELETE FROM ${t} WHERE id=?`).run(id); applied++; } catch {}
					continue;
				}
				if (row && row.row) {
					const remoteData = typeof row.row === 'string' ? JSON.parse(row.row) : row.row;
					// Check if record exists locally for conflict detection
					let localRow = null;
					try { localRow = db.prepare(`SELECT * FROM ${t} WHERE id=?`).get(id); } catch {}

					if (!localRow) {
						// New record, just insert
						const keys = Object.keys(remoteData);
						if (!keys.includes('id')) keys.push('id');
						const placeholders = keys.map(() => '?').join(',');
						const values = keys.map(k => (k === 'id' ? id : remoteData[k]));
						try { db.prepare(`INSERT INTO ${t} (${keys.join(',')}) VALUES (${placeholders})`).run(...values); applied++; } catch {}
					} else {
						// Record exists — run conflict resolution
						const result = self._resolveConflict(t, id, localRow, remoteData, ch.deviceId);
						if (result.action === 'apply' && result.mergedData) {
							const merged = result.mergedData;
							const keys = Object.keys(merged).filter(k => k !== 'id');
							if (keys.length > 0) {
								const setClause = keys.map(k => `${k}=?`).join(',');
								const values = keys.map(k => merged[k]);
								values.push(id);
								try { db.prepare(`UPDATE ${t} SET ${setClause} WHERE id=?`).run(...values); applied++; } catch {}
							}
							if (result.hadConflicts) conflictCount++;
						} else if (result.action === 'skip') {
							conflictCount++;
						}
					}
				}
			}
		});
		try {
			tx.immediate(changes);
		} catch (e) {
			AuditLog.log({ userId: 'system', action: 'syncApplyError', entityType: 'sync', entityId: 'pull', details: { error: e.message } });
			throw e;
		}
		db.prepare(`
			INSERT INTO sync_state (endpoint, lastPulledAt, lastPushedAt)
			VALUES (?, ?, COALESCE((SELECT lastPushedAt FROM sync_state WHERE endpoint=?), NULL))
			ON CONFLICT(endpoint) DO UPDATE SET lastPulledAt=excluded.lastPulledAt
		`).run(remoteUrl, nowIso(), remoteUrl);
		return { ok: true, pulled: applied, conflicts: conflictCount };
	}

	applyChanges(changes) {
		if (!Array.isArray(changes) || changes.length === 0) return { ok: true, applied: 0 };
		let applied = 0;
		const tx = db.transaction((batch) => {
			for (const ch of batch) {
				const t = String(ch.tableName);
				const id = String(ch.recordId);
				const op = String(ch.op || 'update');
				const row = ch.payload ? (typeof ch.payload === 'string' ? JSON.parse(ch.payload) : ch.payload) : null;
				if (op === 'delete') {
					try { db.prepare(`DELETE FROM ${t} WHERE id=?`).run(id); applied++; } catch {}
					continue;
				}
				if (row && row.row) {
					const data = typeof row.row === 'string' ? JSON.parse(row.row) : row.row;
					const keys = Object.keys(data || {});
					if (!keys.includes('id')) keys.push('id');
					const placeholders = keys.map(() => '?').join(',');
					const values = keys.map(k => (k === 'id' ? id : data[k]));
					try {
						db.prepare(`INSERT INTO ${t} (${keys.join(',')}) VALUES (${placeholders})`).run(...values);
						applied++;
					} catch {
						const setClause = keys.filter(k => k !== 'id').map(k => `${k}=?`).join(',');
						const updValues = keys.filter(k => k !== 'id').map(k => data[k]);
						updValues.push(id);
						try { db.prepare(`UPDATE ${t} SET ${setClause} WHERE id=?`).run(...updValues); applied++; } catch {}
					}
				}
			}
		});
		try {
			tx.immediate(changes);
		} catch (e) {
			AuditLog.log({ userId: 'system', action: 'syncApplyError', entityType: 'sync', entityId: 'apply', details: { error: e.message } });
			throw e;
		}
		return { ok: true, applied };
	}

	async runOnce() {
		const cfg = Settings.get('sync') || {};
		const remote = cfg.url || Settings.get('cloudSync.url') || null;
		const token = cfg.token || Settings.get('cloudSync.token') || null;
		const enabled = Boolean(cfg.enabled);
		if (!enabled || !remote) return { ok: true, skipped: true };
		const out = { ok: true, results: {} };
		try { out.results.push = await this.push(remote, token); } catch (e) { out.results.push = { ok: false, error: e.message }; }
		try { out.results.pull = await this.pull(remote, token); } catch (e) { out.results.pull = { ok: false, error: e.message }; }
		return out;
	}
}

const syncEngine = new SyncEngine();
module.exports = syncEngine;


