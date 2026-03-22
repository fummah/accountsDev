const { ipcMain } = require('electron');
const scheduler = require('../services/scheduler');

async function register() {
	// Return built-in registry
	ipcMain.handle('scheduler-list-registered', async () => {
		return scheduler.listRegistered();
	});

	// Return configured tasks (enabled + intervals)
	ipcMain.handle('scheduler-list', async () => {
		return scheduler.listConfigured();
	});

	// Overwrite configured tasks
	ipcMain.handle('scheduler-set', async (_event, tasks) => {
		return scheduler.setConfigured(tasks);
	});

	// Reload timers from settings
	ipcMain.handle('scheduler-reload', async () => {
		scheduler.reload();
		return { ok: true };
	});

	// Initialize timers on startup if any config exists
	try {
		scheduler.reload();
	} catch {}
}

module.exports = register;


