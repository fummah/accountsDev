const path = require('path');
const fs = require('fs');
const db = require('./dbmgr');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

let _lastResult = null;

function ensureAppMetadata() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_metadata (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      schema_version INTEGER NOT NULL DEFAULT 0,
      initialized INTEGER NOT NULL DEFAULT 0,
      installed_at TEXT,
      last_updated TEXT
    )
  `);
}

function getMeta() {
  return db.get('SELECT * FROM app_metadata WHERE id = 1') || null;
}

function upsertMeta(version, initialized) {
  const now = new Date().toISOString();
  const existing = db.get('SELECT id FROM app_metadata WHERE id = 1');
  if (existing) {
    const sets = ['schema_version = ?', 'last_updated = ?'];
    const vals = [version, now];
    if (initialized !== null) {
      sets.push('initialized = ?');
      vals.push(initialized ? 1 : 0);
    }
    db.run(`UPDATE app_metadata SET ${sets.join(', ')} WHERE id = 1`, vals);
  } else {
    db.run(`INSERT INTO app_metadata (id, schema_version, initialized, installed_at, last_updated) VALUES (1, ?, ?, ?, ?)`,
      [version, initialized ? 1 : 0, now, now]);
  }
}

function loadMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.js'))
    .sort();

  const migrations = files.map(f => {
    try {
      const m = require(path.join(MIGRATIONS_DIR, f));
      return { version: m.version, description: m.description, up: m.up };
    } catch (err) {
      console.error(`[migration] Failed to load ${f}:`, err.message);
      return null;
    }
  }).filter(Boolean);

  migrations.sort((a, b) => a.version - b.version);
  return migrations;
}

function runMigrations() {
  ensureAppMetadata();

  const meta = getMeta();
  const migrations = loadMigrations();
  const latestVersion = migrations.length > 0 ? migrations[migrations.length - 1].version : 0;
  const currentVersion = meta ? meta.schema_version : 0;

  let isFirstInstall = false;
  let isUpdate = false;
  let previousVersion = currentVersion;

  if (!meta) {
    isFirstInstall = !!db.isNewDatabase;

    if (isFirstInstall) {
      console.log('[migration] First install detected - fresh database');
    } else {
      console.log('[migration] Existing database detected - upgrading to migration system');
    }

    for (const m of migrations) {
      if (m.version > currentVersion) {
        console.log(`[migration]   Running v${m.version}: ${m.description}`);
        m.up(db);
        upsertMeta(m.version, null);
      }
    }

    const now = new Date().toISOString();
    db.run(`INSERT INTO app_metadata (id, schema_version, initialized, installed_at, last_updated) VALUES (1, ?, 1, ?, ?)`,
      [latestVersion, now, now]);

    _lastResult = { isFirstInstall, isUpdate: false, previousVersion: 0, currentVersion: latestVersion };
    console.log(`[migration] Initialized at v${latestVersion} (${isFirstInstall ? 'fresh install' : 'existing DB upgrade'})`);
    return _lastResult;
  }

  if (!meta.initialized) {
    console.log('[migration] Found uninitialized app_metadata - completing initialization');
    for (const m of migrations) {
      if (m.version > currentVersion) {
        console.log(`[migration]   Running v${m.version}: ${m.description}`);
        m.up(db);
        upsertMeta(m.version, null);
      }
    }
    const now = new Date().toISOString();
    db.run(`UPDATE app_metadata SET schema_version = ?, initialized = 1, last_updated = ? WHERE id = 1`,
      [latestVersion, now]);
    _lastResult = { isFirstInstall: false, isUpdate: false, previousVersion: currentVersion, currentVersion: latestVersion };
    return _lastResult;
  }

  if (currentVersion < latestVersion) {
    isUpdate = true;
    console.log(`[migration] Schema update detected: v${currentVersion} -> v${latestVersion}`);

    for (const m of migrations) {
      if (m.version > currentVersion) {
        console.log(`[migration]   Running v${m.version}: ${m.description}`);
        m.up(db);
      }
    }

    const now = new Date().toISOString();
    db.run(`UPDATE app_metadata SET schema_version = ?, last_updated = ? WHERE id = 1`,
      [latestVersion, now]);

    _lastResult = { isFirstInstall: false, isUpdate: true, previousVersion: currentVersion, currentVersion: latestVersion };
    console.log(`[migration] Update complete: v${previousVersion} -> v${latestVersion}`);
    return _lastResult;
  }

  console.log(`[migration] Schema up to date at v${currentVersion}`);
  _lastResult = { isFirstInstall: false, isUpdate: false, previousVersion: currentVersion, currentVersion };
  return _lastResult;
}

function getResult() {
  return _lastResult;
}

module.exports = { runMigrations, getResult };
