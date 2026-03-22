const { ipcMain } = require('electron');
const Settings = require('../models/settings');
const syncEngine = require('../services/syncEngine');
const scheduler = require('../services/scheduler');

async function register() {
	// Ensure triggers if configured
	try {
		const cfg = Settings.get('sync') || {};
		// Provide sensible defaults for tracked tables on first run
		if (!Array.isArray(cfg.tables) || cfg.tables.length === 0) {
			const defaultTables = [
				'customers',
				'suppliers',
				'employees',
				'invoices',
				'invoice_lines',
				'expenses',
				'expense_lines',
				'transactions',
				'journal_entries',
				'journal_lines',
				'items',
				'documents',
				'notes'
			];
			const nextCfg = Object.assign({ enabled: false, url: null, token: null }, cfg, { tables: defaultTables });
			Settings.set('sync', nextCfg);
		}
		const finalCfg = Settings.get('sync') || {};
		if (Array.isArray(finalCfg.tables) && finalCfg.tables.length > 0) {
			try { syncEngine.ensureTriggersForTables(finalCfg.tables); } catch {}
		}
		// Ensure scheduler has a sync task configured
		try {
			const tasks = Array.isArray(Settings.get('scheduler.tasks')) ? Settings.get('scheduler.tasks') : [];
			const exists = tasks.some(t => String(t.id) === 'sync:run');
			if (!exists) {
				tasks.push({ id: 'sync:run', enabled: true, intervalSec: 60, lastRunAt: null });
				Settings.set('scheduler.tasks', tasks);
				try { scheduler.reload(); } catch {}
			}
		} catch {}
	} catch {}
	// Basic status
	try {
		ipcMain.handle('sync-status', async () => {
			return syncEngine.getStatus();
		});
	} catch {}

	// Device identity helpers
	try {
		ipcMain.handle('sync-get-device', async () => {
			return { deviceId: syncEngine.deviceId, config: Settings.get('sync') || {} };
		});
		ipcMain.handle('sync-set-config', async (_e, cfg) => {
			const safe = Object.assign({}, cfg || {});
			Settings.set('sync', safe);
			return { ok: true, config: safe };
		});
	} catch {}

	// Record-level locks
	try {
		ipcMain.handle('sync-lock-acquire', async (_e, tableName, recordId, ownerUserId, ttlSec) => {
			return syncEngine.acquireLock(tableName, recordId, ownerUserId, ttlSec);
		});
		ipcMain.handle('sync-lock-release', async (_e, tableName, recordId) => {
			return syncEngine.releaseLock(tableName, recordId);
		});
		ipcMain.handle('sync-lock-heartbeat', async (_e, tableName, recordId, ttlSec) => {
			return syncEngine.heartbeatLock(tableName, recordId, ttlSec);
		});
	} catch {}

	// Change-log management and triggers
	try {
		ipcMain.handle('sync-ensure-triggers', async (_e, tables) => {
			const arr = Array.isArray(tables) ? tables : [];
			return syncEngine.ensureTriggersForTables(arr);
		});
	} catch {}

	// Manual sync run
	try {
		ipcMain.handle('sync-run', async () => {
			return await syncEngine.runOnce();
		});
	} catch {}

	// Conflict resolution
	try {
		ipcMain.handle('sync-conflicts-list', async (_e, status) => {
			return syncEngine.getConflicts(status || null);
		});
		ipcMain.handle('sync-conflict-resolve', async (_e, conflictId, resolution, resolvedBy) => {
			return syncEngine.resolveConflict(conflictId, resolution, resolvedBy);
		});
		ipcMain.handle('sync-set-conflict-strategy', async (_e, strategy) => {
			return syncEngine.setConflictStrategy(strategy);
		});
	} catch {}
}

module.exports = register;


