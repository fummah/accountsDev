const { ipcMain } = require('electron');
const Depreciation = require('../models/depreciation');

async function register() {
	ipcMain.handle('depr-generate', async (_e, payload) => {
		return Depreciation.generateSchedule(payload || {});
	});
	ipcMain.handle('depr-list', async (_e, assetId) => {
		return Depreciation.listForAsset(assetId);
	});
	ipcMain.handle('depr-clear', async (_e, assetId) => {
		return Depreciation.clearForAsset(assetId);
	});
}

module.exports = register;


