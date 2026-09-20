// Verifies the shared attachment storage service.
//   node scripts/verify-attachment-storage.js
// (runs in plain Node; the service falls back to a temp data root, overridden
//  here via ACCULEDGER_USER_DATA so nothing touches real user data)
/* eslint-disable no-console */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'acculedger-attach-'));
process.env.ACCULEDGER_USER_DATA = tmpRoot;

const FileStorage = require(path.join(ROOT, 'src', 'backend', 'services', 'fileStorage.js'));

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`); }
};

const attDir = FileStorage.getAttachmentsDir();

console.log('\nDirectory resolution');
check('attachments dir is under the app data root (not the source tree)',
  path.resolve(attDir) === path.resolve(path.join(tmpRoot, 'attachments')), attDir);
check('attachments dir is NOT inside src/backend/db', !attDir.includes(path.join('src', 'backend', 'db', 'attachments')));
FileStorage.ensureAttachmentsDir();
check('ensureAttachmentsDir creates the folder', fs.existsSync(attDir));

console.log('\nSanitisation');
check('strips directory traversal', FileStorage.sanitizeFileName('../../Windows/system32/evil.pdf') === 'evil.pdf',
  FileStorage.sanitizeFileName('../../Windows/system32/evil.pdf'));
check('strips backslash traversal', FileStorage.sanitizeFileName('..\\..\\evil.pdf') === 'evil.pdf');
check('replaces Windows-illegal chars', FileStorage.sanitizeFileName('a<b>c:d"e|f?g*h.pdf') === 'a_b_c_d_e_f_g_h.pdf',
  FileStorage.sanitizeFileName('a<b>c:d"e|f?g*h.pdf'));
check('keeps a normal human name', FileStorage.sanitizeFileName('Erik Francois De Bruto - Consent.pdf') === 'Erik Francois De Bruto - Consent.pdf');
check('handles special chars test filename', FileStorage.sanitizeFileName('ABC & Sons (Invoice #123) - 09-16-2026.pdf') === 'ABC & Sons (Invoice #123) - 09-16-2026.pdf');

console.log('\nPath traversal guard (resolveAttachmentPath)');
check('resolves a plain stored name inside the dir',
  FileStorage.resolveAttachmentPath('123_x.pdf') === path.join(path.resolve(attDir), '123_x.pdf'));
check('legacy full path resolves to basename inside the dir',
  FileStorage.resolveAttachmentPath('src/backend/db/attachments/123_x.pdf') === path.join(path.resolve(attDir), '123_x.pdf'));
check('traversal is neutralised (stays inside)',
  FileStorage.resolveAttachmentPath('../../../../etc/passwd') === path.join(path.resolve(attDir), 'passwd'));
check('empty ref -> null', FileStorage.resolveAttachmentPath('') === null && FileStorage.resolveAttachmentPath(null) === null);

console.log('\nStore + uniqueness');
{
  const a = FileStorage.storeAttachment({ name: 'Consent.pdf', data: Buffer.from('hello').toString('base64') });
  const b = FileStorage.storeAttachment({ name: 'Consent.pdf', data: Buffer.from('world').toString('base64') });
  check('file written to disk', fs.existsSync(a.path));
  check('size reported', a.size === 5, a.size);
  check('two uploads of the same name do not collide', a.storedName !== b.storedName, [a.storedName, b.storedName]);
  check('both files exist', fs.existsSync(a.path) && fs.existsSync(b.path));
  check('stored name is sanitized + prefixed', /^\d+_Consent\.pdf$/.test(a.storedName), a.storedName);
  const c = FileStorage.storeAttachment({ name: 'ABC & Sons (Invoice #123) - 09-16-2026.pdf', data: 'QQ==' });
  check('special-char filename stored safely', fs.existsSync(c.path), c.storedName);
}

console.log('\nLegacy migration');
{
  const legacyDir = path.join(ROOT, 'src', 'backend', 'db', 'attachments');
  const hadDir = fs.existsSync(legacyDir);
  let created = null;
  if (!hadDir) { fs.mkdirSync(legacyDir, { recursive: true }); }
  created = path.join(legacyDir, '__verify_legacy__.pdf');
  fs.writeFileSync(created, 'legacy');
  const res = FileStorage.migrateLegacyAttachments();
  check('reports a migration', res.migrated >= 1, res);
  check('legacy file copied into the persistent store', fs.existsSync(path.join(attDir, '__verify_legacy__.pdf')));
  // cleanup legacy file only if we created it
  try { fs.unlinkSync(created); } catch (_) {}
  if (!hadDir) { try { fs.rmdirSync(legacyDir); } catch (_) {} }
}

console.log('\nNo source-tree / asar references');
{
  const raw = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'services', 'fileStorage.js'), 'utf8');
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); // strip comments
  // The source-tree db/attachments path may appear ONLY as the read-only legacy
  // migration source — never as a write target.
  const legacyHits = code.split("'db', 'attachments'").length - 1;
  check('source db/attachments referenced only by the legacy migration reader', legacyHits === 1, legacyHits);
  check('legacy source is only used via migrateLegacyAttachments (read+copy)',
    /const legacyDir = path\.join\(__dirname, '\.\.', 'db', 'attachments'\)/.test(code));
  check('service never uses process.resourcesPath', !/resourcesPath/.test(code));
  check('service never uses app.asar', !/app\.asar/.test(code));
  check('service uses app.getPath(userData)', /getPath\('userData'\)/.test(code));
}

// cleanup
try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
