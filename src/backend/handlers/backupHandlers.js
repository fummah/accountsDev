const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { authorize } = require('../security/authz');
const Settings = require('../models/settings');
const AuditLog = require('../models/auditLog');

const ALGO = 'aes-256-cbc';
const IV_LEN = 16;
const SALT_LEN = 32;
const KEY_ITERATIONS = 100000;
const KEY_LEN = 32;

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, KEY_ITERATIONS, KEY_LEN, 'sha512');
}

function encryptFile(srcPath, destPath, password) {
  const salt = crypto.randomBytes(SALT_LEN);
  const key = deriveKey(password, salt);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const input = fs.readFileSync(srcPath);
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  // Format: SALT(32) + IV(16) + ENCRYPTED_DATA
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, Buffer.concat([salt, iv, encrypted]));
}

function decryptFile(srcPath, destPath, password) {
  const data = fs.readFileSync(srcPath);
  const salt = data.subarray(0, SALT_LEN);
  const iv = data.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const encrypted = data.subarray(SALT_LEN + IV_LEN);
  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, decrypted);
}

function copyFileSafe(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function getBackupDir() {
  const custom = Settings.get('backup.directory');
  if (custom && typeof custom === 'string') return custom;
  return path.join(__dirname, '..', 'db', 'backups');
}

function getBackupPassword() {
  return Settings.get('backup.encryptionKey') || 'default-backup-key-change-me';
}

function listBackups() {
  const dir = getBackupDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.bak') || f.endsWith('.enc'))
    .map(f => {
      const stat = fs.statSync(path.join(dir, f));
      return { name: f, size: stat.size, createdAt: stat.mtime.toISOString(), encrypted: f.endsWith('.enc') };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function registerBackupHandlers() {
  const dbPath = path.join(__dirname, '..', 'db', 'accounts.db');

  // Encrypted backup
  ipcMain.handle('backup-db', async (event, destinationPath) => {
    try {
      authorize(event, { roles: ['Admin'] });
      const useEncryption = Settings.get('backup.encrypt') !== false;
      const password = getBackupPassword();
      const dir = getBackupDir();
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const dest = destinationPath || path.join(dir, `backup-${ts}${useEncryption ? '.enc' : '.bak'}`);

      if (useEncryption) {
        encryptFile(dbPath, dest, password);
      } else {
        copyFileSafe(dbPath, dest);
      }

      AuditLog.log({ userId: 'system', action: 'backupCreated', entityType: 'system', entityId: 'backup', details: { path: dest, encrypted: useEncryption } });

      // Prune old backups (keep last N)
      const maxBackups = Number(Settings.get('backup.maxBackups')) || 30;
      const existing = listBackups();
      if (existing.length > maxBackups) {
        for (const old of existing.slice(maxBackups)) {
          try { fs.unlinkSync(path.join(dir, old.name)); } catch {}
        }
      }

      return { success: true, path: dest, encrypted: useEncryption };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Restore from backup
  ipcMain.handle('restore-db', async (event, sourcePath) => {
    try {
      authorize(event, { roles: ['Admin'] });
      if (!sourcePath || typeof sourcePath !== 'string') throw new Error('sourcePath is required');
      if (!fs.existsSync(sourcePath)) throw new Error('Backup file not found');

      if (sourcePath.endsWith('.enc')) {
        const password = getBackupPassword();
        decryptFile(sourcePath, dbPath, password);
      } else {
        copyFileSafe(sourcePath, dbPath);
      }

      AuditLog.log({ userId: 'system', action: 'backupRestored', entityType: 'system', entityId: 'restore', details: { path: sourcePath } });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // List available backups
  ipcMain.handle('backup-list', async () => {
    try {
      return { success: true, backups: listBackups(), directory: getBackupDir() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Get/set backup settings
  ipcMain.handle('backup-settings-get', async () => {
    return {
      encrypt: Settings.get('backup.encrypt') !== false,
      directory: getBackupDir(),
      maxBackups: Number(Settings.get('backup.maxBackups')) || 30,
      scheduledIntervalHours: Number(Settings.get('backup.intervalHours')) || 24,
      hasCustomKey: !!(Settings.get('backup.encryptionKey')),
    };
  });

  ipcMain.handle('backup-settings-set', async (event, cfg) => {
    try {
      authorize(event, { roles: ['Admin'] });
      if (cfg.encrypt !== undefined) Settings.set('backup.encrypt', !!cfg.encrypt);
      if (cfg.directory) Settings.set('backup.directory', cfg.directory);
      if (cfg.maxBackups) Settings.set('backup.maxBackups', Number(cfg.maxBackups) || 30);
      if (cfg.intervalHours) Settings.set('backup.intervalHours', Number(cfg.intervalHours) || 24);
      if (cfg.encryptionKey) Settings.set('backup.encryptionKey', cfg.encryptionKey);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Download database file (raw or encrypted) for sharing
  ipcMain.handle('db-download', async (event, options) => {
    try {
      authorize(event, { roles: ['Admin'] });
      const { encrypted, destDir } = options || {};
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const dir = destDir || require('os').homedir();
      if (encrypted) {
        const password = getBackupPassword();
        const dest = path.join(dir, `accounts-share-${ts}.enc`);
        encryptFile(dbPath, dest, password);
        return { success: true, path: dest, encrypted: true, size: fs.statSync(dest).size };
      } else {
        const dest = path.join(dir, `accounts-share-${ts}.db`);
        copyFileSafe(dbPath, dest);
        return { success: true, path: dest, encrypted: false, size: fs.statSync(dest).size };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Get raw database file as base64 for in-app download
  ipcMain.handle('db-get-file-base64', async (event) => {
    try {
      authorize(event, { roles: ['Admin'] });
      const data = fs.readFileSync(dbPath);
      return { success: true, data: data.toString('base64'), size: data.length, name: 'accounts.db' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Import/replace database from a file path (for receiving shared databases)
  ipcMain.handle('db-import-file', async (event, sourcePath) => {
    try {
      authorize(event, { roles: ['Admin'] });
      if (!sourcePath || !fs.existsSync(sourcePath)) throw new Error('Source file not found');
      // Auto-backup current before replacing
      const autoBackup = path.join(getBackupDir(), `pre-import-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`);
      copyFileSafe(dbPath, autoBackup);
      if (sourcePath.endsWith('.enc')) {
        const password = getBackupPassword();
        decryptFile(sourcePath, dbPath, password);
      } else {
        copyFileSafe(sourcePath, dbPath);
      }
      AuditLog.log({ userId: 'system', action: 'databaseImported', entityType: 'system', entityId: 'import', details: { source: sourcePath, autoBackup } });
      return { success: true, autoBackup };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Get database info (size, tables, record counts)
  ipcMain.handle('db-info', async () => {
    try {
      const dbModule = require('../models/dbmgr');
      const stat = fs.statSync(dbPath);
      const tables = dbModule.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all();
      const info = tables.map(t => {
        try {
          const cnt = dbModule.prepare(`SELECT COUNT(*) as cnt FROM ${t.name}`).get();
          return { table: t.name, records: cnt?.cnt || 0 };
        } catch { return { table: t.name, records: 0 }; }
      });
      return { success: true, path: dbPath, sizeBytes: stat.size, sizeMB: (stat.size / 1048576).toFixed(2), tables: info, totalTables: tables.length };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Export table to CSV
  ipcMain.handle('export-table-csv', async (event, tableName) => {
    try {
      authorize(event, { roles: ['Admin', 'Manager'] });
      if (!tableName || !/^[a-zA-Z_]+$/.test(tableName)) throw new Error('Invalid table name');
      const db = require('../models/dbmgr');
      const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
      if (!rows.length) return { success: true, csv: '' };
      const headers = Object.keys(rows[0]);
      const escape = v => `"${(v ?? '').toString().replace(/"/g, '""')}"`;
      const csvRows = [headers.join(',')].concat(rows.map(r => headers.map(h => escape(r[h])).join(',')));
      return { success: true, csv: csvRows.join('\n') };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

// Export the runBackup function so the scheduler can call it directly
registerBackupHandlers.runBackupNow = function() {
  const dbPath = path.join(__dirname, '..', 'db', 'accounts.db');
  const useEncryption = Settings.get('backup.encrypt') !== false;
  const password = getBackupPassword();
  const dir = getBackupDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `backup-${ts}${useEncryption ? '.enc' : '.bak'}`);
  if (useEncryption) {
    encryptFile(dbPath, dest, password);
  } else {
    copyFileSafe(dbPath, dest);
  }
  AuditLog.log({ userId: 'system', action: 'scheduledBackup', entityType: 'system', entityId: 'backup', details: { path: dest, encrypted: useEncryption } });
  // Prune
  const maxBackups = Number(Settings.get('backup.maxBackups')) || 30;
  const existing = listBackups();
  if (existing.length > maxBackups) {
    for (const old of existing.slice(maxBackups)) {
      try { fs.unlinkSync(path.join(dir, old.name)); } catch {}
    }
  }
  return { success: true, path: dest };
};

module.exports = registerBackupHandlers;


