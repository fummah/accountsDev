/**
 * scripts/lib/testDb.js — pin a verification script to a SCRATCH COPY of the
 * company database.
 *
 * WHY THIS EXISTS
 *   `src/backend/models/dbmgr.js` resolves the database path from its own
 *   __dirname. Loading ANY model — even just `require('./models/dbmgr')` —
 *   therefore opens the real company file, and loading `models/index.js` also
 *   runs every model's createTable() plus the versioned migration runner.
 *   A verification script that merely *inspects* the app can silently upgrade
 *   and rewrite the user's live bookkeeping data.
 *
 *   Usage — put this FIRST, before any model is required:
 *
 *       require('./lib/testDb.js').useScratchCopy({
 *         label: 'verify-status-workflow',
 *       });
 *
 *   It copies the live file (+ its -wal/-shm sidecars) to a scratch path,
 *   points ACCULEDGER_DB_PATH at the copy, and registers an exit handler that
 *   asserts the live file was never modified. It returns an object with the
 *   copy path, the live path, and a `close()` to remove the scratch files.
 *
 *   If a script already produces its own copy, it may pass { copy: path } to
 *   reuse it instead of making a second one.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const LIVE_DB = path.join(__dirname, '..', '..', 'src', 'backend', 'db', 'accounts.db');

function useScratchCopy({ label = 'verify', copy = null } = {}) {
  if (!fs.existsSync(LIVE_DB)) {
    throw new Error(`live database not found: ${LIVE_DB}`);
  }

  const statBefore = fs.statSync(LIVE_DB);

  // Refuse to run if something upstream already pinned us to the live file.
  const requested = process.env.ACCULEDGER_DB_PATH;
  if (requested && path.resolve(requested) === path.resolve(LIVE_DB)) {
    throw new Error('refusing to run: ACCULEDGER_DB_PATH points at the live database');
  }

  const scratch = copy || path.join(os.tmpdir(), `acculedger-${label}-${Date.now()}.db`);
  for (const f of [scratch, scratch + '-wal', scratch + '-shm']) {
    try { if (fs.existsSync(f)) fs.rmSync(f, { force: true }); } catch { /* ignore */ }
  }
  fs.copyFileSync(LIVE_DB, scratch);
  for (const ext of ['-wal', '-shm']) {
    if (fs.existsSync(LIVE_DB + ext)) fs.copyFileSync(LIVE_DB + ext, scratch + ext);
  }

  // Every subsequent model require resolves against the copy.
  process.env.ACCULEDGER_DB_PATH = scratch;

  const cleanup = () => {
    for (const f of [scratch, scratch + '-wal', scratch + '-shm']) {
      try { if (fs.existsSync(f)) fs.rmSync(f, { force: true }); } catch { /* ignore */ }
    }
  };

  // The live file must be bit-for-bit untouched when the process ends.
  process.on('exit', (code) => {
    try {
      const after = fs.statSync(LIVE_DB);
      if (after.size !== statBefore.size || after.mtimeMs !== statBefore.mtimeMs) {
        console.error(
          `\nFATAL [${label}]: the LIVE database was modified during this run! ` +
          `size ${statBefore.size} -> ${after.size}, ` +
          `mtime ${statBefore.mtimeMs} -> ${after.mtimeMs}`
        );
        process.exitCode = 3;
      }
    } catch { /* ignore */ }
  });

  return { scratch, live: LIVE_DB, cleanup };
}

module.exports = { useScratchCopy, LIVE_DB };
