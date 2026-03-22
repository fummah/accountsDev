const { ipcMain } = require('electron');
const Webhooks = require('../services/webhooks');

async function register() {
  ipcMain.handle('webhooks-list', async () => {
    try { return Webhooks.list(); } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('webhook-get', async (_e, id) => {
    try { return Webhooks.getById(id); } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('webhook-create', async (_e, data) => {
    try { return Webhooks.create(data || {}); } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('webhook-update', async (_e, id, data) => {
    try { return Webhooks.update(id, data || {}); } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('webhook-delete', async (_e, id) => {
    try { return Webhooks.delete(id); } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('webhook-logs', async (_e, webhookId, limit) => {
    try { return Webhooks.getLogs(webhookId, limit); } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle('webhook-test', async (_e, id) => {
    try {
      const hook = Webhooks.getById(id);
      if (!hook) return { success: false, error: 'Webhook not found' };
      const results = await Webhooks.dispatch('test', { message: 'Test webhook from accounting system', webhookId: id });
      return { success: true, results };
    } catch (e) { return { success: false, error: e.message }; }
  });
}

module.exports = register;
