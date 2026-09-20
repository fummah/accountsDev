/**
 * fileStorage — the ONE place that decides where uploaded attachments live.
 *
 * WHY THIS EXISTS
 *   Attachments used to be written to `path.join(__dirname, '..', 'db',
 *   'attachments')`. In development that resolves to `src/backend/db/attachments`
 *   and works. In the packaged app `__dirname` is inside `resources/app.asar`,
 *   so the same path points INTO the read-only archive and every upload fails
 *   with ENOENT (`... not found in ...resources\app.asar`).
 *
 *   Persistent, user-generated files must never live in the install directory or
 *   the asar. They belong in Electron's writable per-user data directory:
 *
 *       app.getPath('userData')/attachments
 *
 *   The same location is used in development AND production, so behaviour is
 *   identical and survives rebuild / reinstall / auto-update.
 *
 * The database stores only the portable STORED FILE NAME (never an absolute
 * install-specific path); the absolute path is resolved here at runtime.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

// `require('electron')` is the API in the Electron main process, but is a plain
// path string under ELECTRON_RUN_AS_NODE / bare Node (verification scripts), so
// guard the access and fall back to a temp dir when there is no Electron app.
function electronApp() {
  try {
    const electron = require('electron');
    return electron && electron.app && typeof electron.app.getPath === 'function'
      ? electron.app
      : null;
  } catch (_) {
    return null;
  }
}

const getAppDataDir = () => {
  // Optional override so a dev build (or a test) can use an isolated root while
  // still going through the exact same storage abstraction.
  if (process.env.ACCULEDGER_USER_DATA) return process.env.ACCULEDGER_USER_DATA;
  const app = electronApp();
  if (app) return app.getPath('userData');
  return path.join(os.tmpdir(), 'acculedger-dev');
};

const getAttachmentsDir = () => path.join(getAppDataDir(), 'attachments');

/** Create the attachments directory (recursive) and return it. */
const ensureAttachmentsDir = () => {
  const dir = getAttachmentsDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

/**
 * Make a user-supplied name safe to use as a single file-system component.
 * Strips any directory part (and therefore `../` traversal), Windows-illegal
 * characters, control characters, and leading/trailing dots/spaces.
 */
const sanitizeFileName = (name) => {
  let n = String(name == null ? '' : name);
  n = n.replace(/^.*[\\/]/, '');                     // drop any directory / traversal
  n = n.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');  // illegal on Windows
  n = n.replace(/\s+/g, ' ').trim();
  n = n.replace(/^\.+/, '').replace(/[. ]+$/, '');   // no leading/trailing dots/spaces
  if (!n) n = 'file';
  if (n.length > 180) {
    const ext = path.extname(n).slice(0, 20);
    n = n.slice(0, Math.max(1, 180 - ext.length)) + ext;
  }
  return n;
};

/** Collision-safe stored name: `<timestamp>_<sanitized original>`. */
const buildStoredName = (originalName) => {
  const safe = sanitizeFileName(originalName);
  const dir = ensureAttachmentsDir();
  let candidate = `${Date.now()}_${safe}`;
  let i = 1;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${Date.now()}_${i++}_${safe}`;
  }
  return candidate;
};

/**
 * Resolve a stored reference (a stored file name, or a legacy path such as
 * `src/backend/db/attachments/name.pdf`) to an absolute path INSIDE the
 * attachments directory. Returns null if it would escape the directory.
 */
const resolveAttachmentPath = (storedRef) => {
  if (storedRef == null || String(storedRef).trim() === '') return null;
  const base = path.resolve(getAttachmentsDir());
  const name = sanitizeFileName(String(storedRef));
  const full = path.resolve(base, name);
  if (full !== base && !full.startsWith(base + path.sep)) return null; // traversal guard
  return full;
};

/** Write base64 (or Buffer) data into persistent storage. */
const storeAttachment = ({ name, data }) => {
  const dir = ensureAttachmentsDir();
  const storedName = buildStoredName(name);
  const full = path.join(dir, storedName);
  const base64 = typeof data === 'string' ? data.split(',').pop() : data;
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(base64, 'base64');
  fs.writeFileSync(full, buffer);
  return { storedName, size: buffer.length, path: full };
};

/**
 * Copy legacy attachments from the old source-relative directory
 * (`src/backend/db/attachments`) into the persistent store, so existing
 * development records keep working after the move. Never deletes the source.
 */
const migrateLegacyAttachments = () => {
  const legacyDir = path.join(__dirname, '..', 'db', 'attachments');
  let dest;
  try { dest = ensureAttachmentsDir(); } catch (_) { return { migrated: 0 }; }
  if (path.resolve(legacyDir) === path.resolve(dest)) return { migrated: 0 };
  if (!fs.existsSync(legacyDir)) return { migrated: 0 };
  let migrated = 0;
  try {
    for (const f of fs.readdirSync(legacyDir)) {
      const src = path.join(legacyDir, f);
      const dst = path.join(dest, f);
      try {
        if (fs.statSync(src).isFile() && !fs.existsSync(dst)) {
          fs.copyFileSync(src, dst);
          migrated++;
        }
      } catch (_) { /* skip unreadable entry */ }
    }
  } catch (_) { /* unreadable legacy dir */ }
  return { migrated };
};

module.exports = {
  getAppDataDir,
  getAttachmentsDir,
  ensureAttachmentsDir,
  sanitizeFileName,
  buildStoredName,
  resolveAttachmentPath,
  storeAttachment,
  migrateLegacyAttachments,
};
