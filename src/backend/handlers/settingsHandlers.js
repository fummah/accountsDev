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

  // Invoice Template Customization
  ipcMain.handle('get-invoice-template', async () => {
    try {
      return Settings.get('invoiceTemplate') || {};
    } catch (e) {
      console.error('Error getting invoice template:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('save-invoice-template', async (_event, templateSettings) => {
    try {
      Settings.set('invoiceTemplate', templateSettings || {});
      return { success: true };
    } catch (e) {
      console.error('Error saving invoice template:', e);
      return { error: e.message };
    }
  });

  // Quote Template Customization (kept separate from the invoice template so
  // quotes keep their own branding / topology settings).
  ipcMain.handle('get-quote-template', async () => {
    try {
      return Settings.get('quoteTemplate') || {};
    } catch (e) {
      console.error('Error getting quote template:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('save-quote-template', async (_event, templateSettings) => {
    try {
      Settings.set('quoteTemplate', templateSettings || {});
      return { success: true };
    } catch (e) {
      console.error('Error saving quote template:', e);
      return { error: e.message };
    }
  });

  // Preprinted-check alignment (physical, in inches). Different printers feed
  // stock differently, so the CHECK body's vertical/horizontal offset is a
  // single persisted calibration instead of hard-coded pixels.
  ipcMain.handle('get-check-print-settings', async () => {
    try {
      const s = Settings.get('checkPrintSettings') || {};
      return {
        offsetYIn: s.offsetYIn != null && s.offsetYIn !== '' ? Number(s.offsetYIn) : 0.5,
        offsetXIn: s.offsetXIn != null && s.offsetXIn !== '' ? Number(s.offsetXIn) : 0,
      };
    } catch (e) {
      console.error('Error getting check print settings:', e);
      return { offsetYIn: 0.5, offsetXIn: 0 };
    }
  });

  ipcMain.handle('save-check-print-settings', async (_event, cfg) => {
    try {
      const cur = Settings.get('checkPrintSettings') || {};
      const next = {
        offsetYIn: cfg && cfg.offsetYIn != null ? Number(cfg.offsetYIn) : (cur.offsetYIn != null ? Number(cur.offsetYIn) : 0.5),
        offsetXIn: cfg && cfg.offsetXIn != null ? Number(cfg.offsetXIn) : (cur.offsetXIn != null ? Number(cur.offsetXIn) : 0),
      };
      Settings.set('checkPrintSettings', next);
      return { success: true, ...next };
    } catch (e) {
      console.error('Error saving check print settings:', e);
      return { error: e.message };
    }
  });
}

module.exports = registerSettingsHandlers;


