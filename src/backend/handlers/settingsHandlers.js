const { ipcMain } = require('electron');
const { Settings } = require('../models');

function registerSettingsHandlers() {
  ipcMain.handle('settings-get-all', async () => {
    try {
      return Settings.getAll();
    } catch (e) {
      console.error('Error getting settings:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('settings-get', async (event, key) => {
    try {
      return Settings.get(key);
    } catch (e) {
      console.error('Error getting setting:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('settings-set', async (event, key, value) => {
    try {
      const { authorize } = require('../security/authz');
      const AuditLog = require('../models/auditLog');
      const ctx = authorize(event, { roles: ['Admin'] });
      const res = Settings.set(key, value);
      try {
        AuditLog.log({
          userId: ctx.userId,
          action: 'update',
          entityType: 'setting',
          entityId: key,
          details: value
        });
      } catch (e) {
        // ignore audit failures
      }
      return res;
    } catch (e) {
      console.error('Error setting value:', e);
      return { error: e.message };
    }
  });

  // Regional preferences helpers
  ipcMain.handle('regional-prefs-get', async () => {
    try {
      return Settings.get('regionalPreferences') || {};
    } catch (e) {
      console.error('Error getting regional preferences:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('regional-prefs-set', async (event, prefs) => {
    try {
      const { authorize } = require('../security/authz');
      const AuditLog = require('../models/auditLog');
      const ctx = authorize(event, { roles: ['Admin', 'Manager'] });
      const res = Settings.set('regionalPreferences', prefs || {});
      try {
        AuditLog.log({
          userId: ctx.userId,
          action: 'update',
          entityType: 'setting',
          entityId: 'regionalPreferences',
          details: prefs || {}
        });
      } catch {}
      return res;
    } catch (e) {
      console.error('Error setting regional preferences:', e);
      return { error: e.message };
    }
  });
}

module.exports = registerSettingsHandlers;


