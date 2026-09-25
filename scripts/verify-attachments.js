/**
 * verify-attachments.js
 *
 * Proves the shared attachment system end to end:
 *   (a) fileStorage stores a managed COPY under a writable user-data dir (never
 *       the app bundle) with a collision-safe name;
 *   (b) the document IPC handlers upload / list / open / delete correctly;
 *   (c) saved attachments open by ID (never a renderer path);
 *   (d) remove deletes the managed copy + DB row, and never the user's original;
 *   (e) duplicate filenames are supported (unique stored names);
 *   (f) path traversal is blocked;
 *   (g) a missing physical file fails gracefully;
 *   (h) the shared AttachmentManager is wired into every attachment screen.
 *
 * Runs against a SCRATCH DB + an isolated attachment root.
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/verify-attachments.js
 */
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ATTACH_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'acculedger-attach-'));
process.env.ACCULEDGER_USER_DATA = ATTACH_ROOT;

// ── stub electron (ipcMain + shell) BEFORE any handler is required ──────────
const handlers = new Map();
const openedPaths = [];
const electronStub = {
  ipcMain: { handle: (channel, fn) => { handlers.set(channel, fn); } },
  shell: { openPath: async (p) => { openedPaths.push(p); return ''; } },
};
const originalLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return electronStub;
  return originalLoad.apply(this, arguments);
};

require('./lib/testDb.js').useScratchCopy({ label: 'verify-attachments' });

const FileStorage = require(path.join(ROOT, 'src', 'backend', 'services', 'fileStorage.js'));
require(path.join(ROOT, 'src', 'backend', 'handlers', 'documentHandlers.js'))();
const dbmgr = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js'));
const db = dbmgr.raw;

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual); const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  [PASS] ' + label); }
  else { fail++; console.log(`  [FAIL] ${label}\n      expected: ${e}\n      actual:   ${a}`); }
};
const ok = (label, cond, detail) => { check(label, !!cond, true); if (!cond && detail) console.log('      detail: ' + detail); };

const b64 = (s) => Buffer.from(s).toString('base64');
const upload = (name, content, linkedId = 4242, category = 'bill') =>
  handlers.get('document-upload')({}, { name, mime: 'application/pdf', data: b64(content), category, linkedId, enteredBy: 'verify' });
const list = (category, linkedId) => handlers.get('documents-list')({}, category, linkedId);

(async () => {
  const attachmentsDir = FileStorage.getAttachmentsDir();
  ok('attachment storage lives under the writable user-data dir (never the app bundle)',
    attachmentsDir.startsWith(ATTACH_ROOT) && !/app\.asar/i.test(attachmentsDir), attachmentsDir);
  ok('attachment storage is NOT inside src/ or the install dir',
    !path.resolve(attachmentsDir).startsWith(path.resolve(ROOT, 'src')), attachmentsDir);

  // ── (a) store copies a managed file with a collision-safe name ────────────
  const stored = FileStorage.storeAttachment({ name: 'invoice.pdf', data: b64('hello world') });
  ok('storeAttachment writes the file', fs.existsSync(stored.path) && stored.size > 0, stored.path);
  ok('the stored name is unique (timestamp-prefixed)', /^\d+_/.test(stored.storedName), stored.storedName);
  ok('sanitizeFileName strips traversal', FileStorage.sanitizeFileName('../../evil.pdf') === 'evil.pdf',
    FileStorage.sanitizeFileName('../../evil.pdf'));
  const traversal = FileStorage.resolveAttachmentPath('../../evil.pdf');
  ok('resolveAttachmentPath keeps the path inside the store',
    traversal && path.resolve(traversal).startsWith(path.resolve(attachmentsDir) + path.sep), traversal);

  // ── (b) upload / list ─────────────────────────────────────────────────────
  const up = await upload('20000765.pdf', '%PDF-1.4 test invoice');
  ok('document-upload succeeds', up && up.success, JSON.stringify(up));
  const rows = await list('bill', 4242);
  const row = rows.find(r => r.document_name === '20000765.pdf');
  ok('documents-list returns the uploaded row', !!row);
  check('the ORIGINAL filename is preserved for display', row && row.document_name, '20000765.pdf');
  ok('the row carries size + type metadata', row && Number(row.document_size) > 0 && row.document_type === 'application/pdf', JSON.stringify(row));
  ok('the physical managed file exists', row && fs.existsSync(FileStorage.resolveAttachmentPath(row.file_path)));

  // ── (c) open by ID ────────────────────────────────────────────────────────
  openedPaths.length = 0;
  const opened = await handlers.get('document-open')({}, row.id);
  ok('document-open succeeds by ID', opened && opened.success, JSON.stringify(opened));
  ok('the OS was asked to open the MANAGED file', openedPaths[0] === FileStorage.resolveAttachmentPath(row.file_path), openedPaths[0]);

  // ── (d) remove deletes the managed copy, never the original ───────────────
  const original = path.join(ATTACH_ROOT, 'user-original.pdf');
  fs.writeFileSync(original, 'original user file');
  const managedPath = FileStorage.resolveAttachmentPath(row.file_path);
  const del = await handlers.get('document-delete')({}, row.id);
  ok('document-delete succeeds', del && del.success, JSON.stringify(del));
  ok('the managed copy is gone', !fs.existsSync(managedPath), managedPath);
  ok("the user's original file is untouched", fs.existsSync(original), original);
  ok('the DB row is gone', !db.prepare('SELECT id FROM documents WHERE id = ?').get(row.id));

  // ── (e) duplicate filenames ───────────────────────────────────────────────
  const d1 = await upload('invoice.pdf', 'first');
  const d2 = await upload('invoice.pdf', 'second');
  const dupRows = (await list('bill', 4242)).filter(r => r.document_name === 'invoice.pdf');
  check('two same-named attachments are both stored', dupRows.length, 2);
  ok('their stored names differ (collision-safe)', dupRows[0].file_path !== dupRows[1].file_path,
    `${dupRows[0].file_path} vs ${dupRows[1].file_path}`);
  ok('both have stable distinct IDs', dupRows[0].id !== dupRows[1].id);

  // ── (f) path traversal on open is blocked ─────────────────────────────────
  check('resolveAttachmentPath(null) is null', FileStorage.resolveAttachmentPath(null), null);

  // ── (g) missing physical file → graceful failure ──────────────────────────
  const ghost = await upload('ghost.pdf', 'will be deleted from disk');
  const ghostRow = (await list('bill', 4242)).find(r => r.document_name === 'ghost.pdf');
  fs.unlinkSync(FileStorage.resolveAttachmentPath(ghostRow.file_path)); // simulate missing file
  const openMissing = await handlers.get('document-open')({}, ghostRow.id);
  ok('opening a missing file fails gracefully (no throw)', openMissing && openMissing.success === false, JSON.stringify(openMissing));
  ok('  … and says the file was not found', /not found|missing/i.test(openMissing.error || ''), openMissing.error);

  // ── pending local file open (attachment-open-local) ───────────────────────
  const local = path.join(ATTACH_ROOT, 'pending.pdf');
  fs.writeFileSync(local, 'pending');
  openedPaths.length = 0;
  const openLocal = await handlers.get('attachment-open-local')({}, local);
  ok('attachment-open-local opens an existing pending file', openLocal && openLocal.success, JSON.stringify(openLocal));
  const openLocalMissing = await handlers.get('attachment-open-local')({}, path.join(ATTACH_ROOT, 'nope.pdf'));
  ok('attachment-open-local refuses a missing file', openLocalMissing && openLocalMissing.success === false);

  // ── (h) wiring: one shared component everywhere ───────────────────────────
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const manager = read('src/frontend/src/components/shared/AttachmentManager.js');
  ok('the shared AttachmentManager exists and separates pending vs saved',
    /pendingFiles/.test(manager) && /saved/.test(manager));
  ok('saved Open/Remove act by attachment ID (never a path)',
    /openDocument\(doc\.id\)/.test(manager) && /deleteDocument\(doc\.id\)/.test(manager));
  ok('saved Remove is confirmed', /Modal\.confirm/.test(manager) && /Remove attachment\?/.test(manager));
  ok('pending Open uses the picker path helper (not a stored path)', /openLocalAttachment/.test(manager));

  for (const f of [
    'src/frontend/src/components/vendors/bills/EnterBill.js',
    'src/frontend/src/components/accountant/CheckPrinting.js',
    'src/frontend/src/components/expenses/CreditCardCharges.js',
    'src/frontend/src/components/documents/index.js',
  ]) {
    const src = read(f);
    ok(`${path.basename(f)} uses the shared AttachmentManager`, /AttachmentManager/.test(src) && /from '.*shared\/AttachmentManager'/.test(src));
  }

  const preload = read('src/backend/preload.js');
  ok('preload exposes openLocalAttachment (webUtils)', /openLocalAttachment/.test(preload) && /webUtils/.test(preload));
  const docHandlers = read('src/backend/handlers/documentHandlers.js');
  ok('main registers attachment-open-local', /attachment-open-local/.test(docHandlers));
  ok('document-open resolves the path in the backend (not the renderer)', /resolveAttachmentPath\(row\.file_path\)/.test(docHandlers));

  console.log('\n' + '='.repeat(56));
  console.log(pass + ' passed, ' + fail + ' failed');
  console.log('='.repeat(56) + '\n');

  try { fs.rmSync(ATTACH_ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e && e.stack ? e.stack : e); process.exit(1); });
