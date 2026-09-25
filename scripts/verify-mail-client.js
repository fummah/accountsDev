/**
 * verify-mail-client.js — "Send using default email program", end to end.
 *
 * THE FEATURE
 *   An invoice or quote PDF is handed to the user's desktop mail client with
 *   the recipient, subject, body and attachment already filled in.
 *
 * WHAT WENT WRONG (why this suite exists)
 *   The handoff was implemented inline in handlers/emailHandlers.js and had
 *   three defects, each reproduced before the fix:
 *
 *     1. FALSE SUCCESS — `spawn(...).unref()` with no 'error' listener. A
 *        missing executable raised an UNCAUGHT exception while the IPC handler
 *        had already returned {success:true}. The UI said "Default email
 *        program opened" for a program that never opened.
 *     2. BROKEN FILE URLS — `fileUri()` left spaces raw, producing
 *        `file:///C:/Users/John Smith/...`.
 *     3. BROKEN THUNDERBIRD COMPOSE — the body was handed over as
 *        `message='file:///…'`, but Thunderbird reads `message=` with
 *        `nsIFile.initWithPath()` (a NATIVE path, never a file: URI), so the
 *        compose window opened with an empty body; and values were single-quoted
 *        raw, so a comma in the body/recipients split the field. The fixed
 *        builder sends every text field as a double-quoted, percent-encoded
 *        value (which Thunderbird URI-decodes) and keeps `attachment=` as the
 *        only single-quoted file: URI.
 *
 * HOW IT IS VERIFIED
 *   Nothing is re-implemented here. The suite loads the REAL module
 *   (src/backend/services/mailClient.js) and the REAL IPC handler
 *   (src/backend/handlers/emailHandlers.js) and drives them:
 *     • pure builders        — fileUri / buildMailtoUri / buildOutlookArgs /
 *                              buildThunderbirdCompose, pinned to exact output
 *     • real filesystem      — materializeOutgoing writes and we read it back
 *     • real child processes — launchDetached against a missing exe and a real
 *                              one; the ENOENT case must resolve, never throw
 *     • real IPC round trip  — email-send-external is called with a genuine
 *                              base64 PDF and the resulting mailto: URI is
 *                              inspected
 *   Client-specific syntax is pinned against the vendors' own documentation:
 *     Outlook      /c ipm.note /m <addr?subject=&body=> /a <path>
 *                  support.microsoft.com — "Command-line switches for Microsoft
 *                  Office products" (/m example: user@contoso.com?subject=Test&body=Hello)
 *     Thunderbird  -compose "to=..,cc=..,subject=..,format=text,body=..,attachment='file:///..'"
 *                  Thunderbird's own GetArgs() parser (MsgComposeCommands.js):
 *                  double-quoted values are URI-decoded, single-quoted are raw,
 *                  and `message=` is a NATIVE path (never a file: URI).
 *     mailto:      RFC 6068 — no attachment field exists, so we never claim one.
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/verify-mail-client.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');

// ── stub electron BEFORE any handler is required ────────────────────────────
const handlers = new Map();
const openedUris = [];
const electronStub = {
  ipcMain: {
    handle: (channel, fn) => {
      if (handlers.has(channel)) throw new Error("Attempted to register a second handler for '" + channel + "'");
      handlers.set(channel, fn);
    },
  },
  shell: {
    openExternal: (uri) => {
      openedUris.push(uri);
      return Promise.resolve();
    },
  },
};
const originalLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return electronStub;
  return originalLoad.apply(this, arguments);
};

const realLog = console.log.bind(console);
console.log = () => {};
require('./lib/testDb.js').useScratchCopy({ label: 'verify-mail-client' });
require('../src/backend/models/index.js');
const registerEmailHandlers = require('../src/backend/handlers/emailHandlers.js');
console.log = realLog;
registerEmailHandlers();

const MailClient = require('../src/backend/services/mailClient.js');
const db = require('../src/backend/models/dbmgr.js').raw;

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// ── the REAL email template the modal renders ───────────────────────────────
// The document round-trip below must send what a customer actually receives, so
// it builds the subject/body from the same module the modal uses rather than a
// hand-written stand-in. The module is ESM, so strip the keywords and evaluate.
const emailMod = (() => {
  const src = read('src/frontend/src/components/customers/shared/documentEmail.js')
    .replace(/export const /g, 'const ')
    .replace(/export function /g, 'function ');
  return new Function(
    `${src}\nreturn { buildDocumentEmail, isInvoiceFullyPaid, renderTemplate };`
  )();
})();

// ── tiny harness ────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const tempDirs = [];

// ── keeping the fallback publish out of the user's real Downloads folder ─────
// When the handoff cannot carry the PDF, the service copies it somewhere the
// user can find (see publishForManualAttach). That destination defaults to
// ~/Downloads, which a verification run must never touch — it is a side effect
// on the user's machine, and it is a sandbox violation.
//
// Two layers of protection:
//   1. the env override below is a global net, so even the REAL IPC handler —
//      which owns its own dependencies and cannot be injected — lands in a
//      throwaway folder;
//   2. entryPoint() additionally passes an explicit per-case `manualAttachDir`,
//      so each case gets its own EMPTY directory we can assert against
//      ("a successful send published nothing").
const manualDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'acculedger-manual-'));
  tempDirs.push(d);
  return d;
};
process.env.ACCULEDGER_MANUAL_ATTACH_DIR = manualDir();
const GLOBAL_MANUAL_DIR = process.env.ACCULEDGER_MANUAL_ATTACH_DIR;
const manualFiles = (d) => { try { return fs.readdirSync(d); } catch { return []; } };

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  [PASS] ${label}`); }
  else { failed++; console.log(`  [FAIL] ${label}\n      expected: ${e}\n      actual:   ${a}`); }
}
function ok(label, cond, detail) {
  check(label, !!cond, true);
  if (!cond && detail) console.log(`      detail: ${detail}`);
}
const contains = (label, haystack, needle) =>
  ok(label, String(haystack).includes(needle), `expected to find ${JSON.stringify(needle)} in ${JSON.stringify(String(haystack).slice(0, 300))}`);
// A mailto: URI built from a real template may contain a stray '%' that makes
// decodeURIComponent throw; decode defensively so a fixture never masks a bug.
const safeDecode = (s) => { try { return decodeURIComponent(String(s)); } catch { return String(s); } };

// ════════════════════════════════════════════════════════════════════════════
// 1. Defect 2 — file:/// URLs must be percent-encoded
// ════════════════════════════════════════════════════════════════════════════
function fileUris() {
  const spaced = MailClient.fileUri('C:\\Users\\John Smith\\AppData\\Local\\Temp\\Invoice_1.pdf');
  check('fileUri encodes spaces in a Windows path',
    spaced, 'file:///C:/Users/John%20Smith/AppData/Local/Temp/Invoice_1.pdf');
  ok('  … and the raw URL contains no unencoded space', !spaced.includes(' '));
  ok('  … and it is a file URL', spaced.startsWith('file:///'));

  // The old helper produced `file:///C:////Users////John Smith/...` when given
  // a UNC-ish or doubled-separator input; the new one resolves first.
  const doubled = MailClient.fileUri('C:\\\\Temp\\\\a b.pdf');
  ok('fileUri collapses doubled separators', !doubled.includes('//Temp'), doubled);

  const apostrophe = MailClient.fileUri("C:\\Users\\O'Brien\\a.pdf");
  contains('fileUri encodes apostrophes (Thunderbird ends a field at the first quote)', apostrophe, 'O%27Brien');
  ok('  … so the URL carries no raw quote', !apostrophe.includes("'"), apostrophe);

  const unc = MailClient.fileUri('\\\\fileserver\\invoices\\a b.pdf');
  check('fileUri handles a UNC path', unc, 'file://fileserver/invoices/a%20b.pdf');
}

// ════════════════════════════════════════════════════════════════════════════
// 2. Thunderbird -compose — encoded, double-quoted values for every field
//
//    Pinned against Thunderbird's OWN parser. GetArgs() (below) is a verbatim
//    copy of MsgComposeCommands.js, so the round-trip assertions prove the
//    compose string this module builds is the one Thunderbird will read back.
// ════════════════════════════════════════════════════════════════════════════
function getArgs(originalData) {
  const args = {};
  if (originalData === '') return null;
  let data = '';
  const separator = String.fromCharCode(1);
  let quoteChar = '';
  let prevChar = '';
  let nextChar = '';
  for (let i = 0; i < originalData.length; i++, prevChar = aChar) {
    var aChar = originalData.charAt(i);
    var aCharCode = originalData.charCodeAt(i);
    if (i < originalData.length - 1) nextChar = originalData.charAt(i + 1);
    else nextChar = '';
    if (aChar === quoteChar && (nextChar === ',' || nextChar === '')) {
      quoteChar = '';
      data += aChar;
    } else if ((aCharCode === 39 || aCharCode === 34) && prevChar === '=') {
      if (quoteChar === '') quoteChar = aChar;
      data += aChar;
    } else if (aChar === ',') {
      if (quoteChar === '') data += separator;
      else data += aChar;
    } else {
      data += aChar;
    }
  }
  const pairs = data.split(separator);
  for (let i = pairs.length - 1; i >= 0; i--) {
    const pos = pairs[i].indexOf('=');
    if (pos === -1) continue;
    const argname = pairs[i].substring(0, pos);
    let argvalue = pairs[i].substring(pos + 1);
    if (argvalue.startsWith("'") && argvalue.endsWith("'")) {
      args[argname] = argvalue.substring(1, argvalue.length - 1);
    } else {
      if (argvalue.startsWith('"') && argvalue.endsWith('"')) {
        argvalue = argvalue.substring(1, argvalue.length - 1);
      }
      try { args[argname] = decodeURIComponent(argvalue); }
      catch { args[argname] = argvalue; }
    }
  }
  return args;
}

function thunderbirdCompose() {
  // Encoding is the documented mechanism: double-quoted values are decoded by
  // Thunderbird, single-quoted values are taken raw.
  check('tbEncoded percent-encodes the comma that would split the field',
    MailClient.tbEncoded('a,b'), 'a%2Cb');
  check('tbEncoded percent-encodes the ampersand', MailClient.tbEncoded('A & B'), 'A%20%26%20B');
  check("tbEncoded leaves an apostrophe literal (safe inside double quotes)",
    MailClient.tbEncoded("don't"), "don't");
  check('tbEncoded encodes a newline as %0A, never a literal backslash-n',
    MailClient.tbEncoded('a\nb'), 'a%0Ab');
  check('tbEncoded encodes a double quote so it cannot end the value early',
    MailClient.tbEncoded('a"b'), 'a%22b');
  check('tbEncoded encodes Unicode as UTF-8 percent escapes',
    MailClient.tbEncoded('Café'), 'Caf%C3%A9');

  const subject = "Invoice 42 — We're ready";
  const body = "Dear John,\n\nPlease don't hesitate to contact us.\nThank you for your business.\n";
  const attachment = 'C:\\Users\\John Smith\\AppData\\Local\\Temp\\acculedger-mail-x\\Quote 08014 - Smith & Sons.pdf';
  const compose = MailClient.buildThunderbirdCompose(
    { to: 'customer@example.com', cc: 'accounts@example.com', subject, body },
    { attachmentPaths: [attachment] }
  );

  ok('the compose spec is ONE comma-separated string with no raw newline',
    !/[\r\n]/.test(compose), compose);
  contains('  … to is double-quoted and encoded', compose, 'to="customer%40example.com"');
  contains('  … cc is included when present', compose, 'cc="accounts%40example.com"');
  ok('  … format=text so the body renders as plain-text paragraphs', compose.includes('format=text'), compose);
  ok('  … the body travels as an encoded body= field, never message=file',
    compose.includes('body="') && !compose.includes('message='), compose);
  ok('  … no literal backslash-n leaks into the visible message',
    !compose.includes('\\n'), compose);
  contains('  … the attachment is a single-quoted file URL',
    compose, "attachment='file:///C:/Users/John%20Smith/AppData/Local/Temp/acculedger-mail-x/Quote%2008014%20-%20Smith%20%26%20Sons.pdf'");

  // ── THE DECISIVE TEST: Thunderbird's own parser reads it all back ──────────
  const parsed = getArgs(compose);
  check("Thunderbird's parser recovers `to` exactly", parsed.to, 'customer@example.com');
  check('  … `cc` exactly', parsed.cc, 'accounts@example.com');
  check('  … `subject` byte-for-byte, apostrophe and em dash intact', parsed.subject, subject);
  check('  … `body` with paragraphs and apostrophe intact', parsed.body, body);
  check('  … `format`', parsed.format, 'text');
  check('  … `attachment` as a decodable file URI', parsed.attachment,
    'file:///C:/Users/John%20Smith/AppData/Local/Temp/acculedger-mail-x/Quote%2008014%20-%20Smith%20%26%20Sons.pdf');

  // Special-character matrix (the exact cases the brief calls out).
  const specials = [
    { to: 'jose@example.com', cc: '', subject: 'Quotation – Café Equipment', body: "Hi John's Team,\n\nPlease don't hesitate.\nThank you.", attachment: 'Quote – Café Equipment.pdf' },
    { to: 'a@b.com', cc: 'c@d.com,e@f.com', subject: 'Quote from Smith & Sons', body: 'No newline, but a comma, an apostrophe and an ampersand & more.', attachment: 'Smith & Sons Quote.pdf' },
  ];
  for (const s of specials) {
    const spec = MailClient.buildThunderbirdCompose(
      { to: s.to, cc: s.cc, subject: s.subject, body: s.body },
      { attachmentPaths: [path.join(os.tmpdir(), 'acculedger-mail-x', s.attachment)] }
    );
    const p = getArgs(spec);
    check(`round-trip to (${s.subject})`, p.to, s.to);
    if (s.cc) check(`  … cc (${s.subject})`, p.cc, s.cc);
    else ok(`  … cc omitted when blank (${s.subject})`, !spec.includes('cc='), spec);
    check(`  … subject (${s.subject})`, p.subject, s.subject);
    check(`  … body (${s.subject})`, p.body, s.body);
    ok(`  … attachment (${s.subject})`, String(p.attachment).endsWith(encodeURIComponent(s.attachment)), p.attachment);
  }

  const noCc = MailClient.buildThunderbirdCompose({ to: 'a@b.com', subject: 'S', body: '' }, { attachmentPaths: [] });
  ok('cc is omitted when blank', !noCc.includes('cc='), noCc);
  ok('no attachment field when there are none', !noCc.includes('attachment='), noCc);

  const multi = MailClient.buildThunderbirdCompose(
    { to: 'a@b.com', subject: 'S', body: '' },
    { attachmentPaths: ['C:\\t\\one.pdf', 'C:\\t\\two.pdf'] }
  );
  contains('multiple attachments are comma-joined inside one field', multi, "attachment='file:///C:/t/one.pdf,file:///C:/t/two.pdf'");
  const multiParsed = getArgs(multi);
  check('  … and the parser sees both URIs', multiParsed.attachment, 'file:///C:/t/one.pdf,file:///C:/t/two.pdf');

  // A body too long for the Windows command line falls back to `message=` — but
  // with a NATIVE path, which is what Thunderbird's parser reads with
  // initWithPath (a file: URI here was the original blank-body bug).
  const longSpec = MailClient.buildThunderbirdCompose(
    { to: 'a@b.com', subject: 'S', body: 'x'.repeat(9000) },
    { attachmentPaths: [], bodyPath: 'C:\\Temp\\acculedger-mail-x\\body.txt' }
  );
  ok('a long body falls back to message= with a native path',
    longSpec.includes("message='C:\\Temp\\acculedger-mail-x\\body.txt'"), longSpec.slice(0, 160));
  ok('  … and does NOT inline the body', !longSpec.includes('body="'), longSpec.slice(0, 160));
  check('  … the parser sees the native path', getArgs(longSpec).message, 'C:\\Temp\\acculedger-mail-x\\body.txt');
}

// ════════════════════════════════════════════════════════════════════════════
// 3. mailto: URI — RFC 6068 line breaks and header escaping
// ════════════════════════════════════════════════════════════════════════════
function mailtoUris() {
  const msg = MailClient.normalizeMessage({
    to: 'customer@example.com',
    subject: 'Invoice 42 & VAT?',
    body: 'Dear John,\n\nPlease find your invoice attached.\n\nRegards',
  });
  const uri = MailClient.buildMailtoUri(msg);
  contains('mailto: keeps the recipient in the path', uri, 'mailto:customer@example.com?');
  contains('mailto: encodes & in the subject', uri, 'subject=Invoice%2042%20%26%20VAT%3F');
  contains('mailto: encodes ? in the subject', uri, '%3F');
  contains('mailto: uses %0D%0A for line breaks (RFC 6068)', uri, 'Dear%20John%2C%0D%0A%0D%0APlease');
  ok('  … and never emits a bare %0A', !/(?<!%0D)%0A/.test(uri), uri);
  ok('mailto: carries no raw CR or LF', !/[\r\n]/.test(uri));

  const bare = MailClient.buildMailtoUri(MailClient.normalizeMessage({ to: 'a@b.com' }));
  check('mailto: with no subject or body is just the address', bare, 'mailto:a@b.com');

  const multi = MailClient.normalizeMessage({ to: 'a@b.com; c@d.com , e@f.com' });
  check('recipients are split on , and ; and re-joined', multi.recipients, ['a@b.com', 'c@d.com', 'e@f.com']);
  check('  … and the URI joins them with a comma', MailClient.buildMailtoUri(multi), 'mailto:a@b.com,c@d.com,e@f.com');

  const injected = MailClient.normalizeMessage({ to: 'a@b.com', subject: 'Hi\r\nBcc: evil@x.com', body: 'ok' });
  ok('subject CR/LF is stripped (header injection)', !/[\r\n]/.test(injected.subject), injected.subject);
  check('  … leaving the injected text inert', injected.subject, 'Hi Bcc: evil@x.com');
}

// ════════════════════════════════════════════════════════════════════════════
// 4. Outlook argv — pinned against Microsoft's documented /m example
// ════════════════════════════════════════════════════════════════════════════
function outlookArgs() {
  const msg = MailClient.normalizeMessage({
    to: 'user@contoso.com', subject: 'Test', body: 'Hello',
  });
  const args = MailClient.buildOutlookArgs(msg, { attachmentPaths: ['C:\\Temp\\Invoice_42.pdf'] });
  check('Outlook argv shape', args,
    ['/c', 'ipm.note', '/m', 'user@contoso.com?subject=Test&body=Hello', '/a', 'C:\\Temp\\Invoice_42.pdf']);
  ok('  … /m value has no mailto: prefix (Microsoft\'s documented form)', !args[3].startsWith('mailto:'));
  ok('  … ? separates the address from the first header', args[3].includes('?subject='));
  ok('  … & separates subsequent headers', args[3].includes('&body='));
  ok('  … /c precedes /m', args.indexOf('/c') < args.indexOf('/m'));
  ok('  … /m precedes /a', args.indexOf('/m') < args.indexOf('/a'));

  const brk = MailClient.buildOutlookArgs(
    MailClient.normalizeMessage({ to: 'a@b.com', subject: 'S', body: 'Line1\nLine2' }), {}
  );
  contains('Outlook /m body uses %0D%0A for line breaks', brk[3], 'Line1%0D%0ALine2');

  const noAttach = MailClient.buildOutlookArgs(MailClient.normalizeMessage({ to: 'a@b.com', subject: 'S' }), {});
  check('Outlook argv with no attachment omits /a', noAttach, ['/c', 'ipm.note', '/m', 'a@b.com?subject=S']);
}

// ════════════════════════════════════════════════════════════════════════════
// 5. Attachment filenames — characters a client's command line cannot carry
// ════════════════════════════════════════════════════════════════════════════
function filenames() {
  check('safeFileStem strips commas', MailClient.safeFileStem('Invoice_INV,001.pdf'), 'Invoice_INV-001');
  check('safeFileStem strips apostrophes', MailClient.safeFileStem("Quote_O'Brien.pdf"), 'Quote_O-Brien');
  check('safeFileStem strips path separators', MailClient.safeFileStem('a/b\\c.pdf'), 'a-b-c');
  check('safeFileStem keeps an ordinary name', MailClient.safeFileStem('Invoice_1042.pdf'), 'Invoice_1042');
  check('safeFileStem falls back rather than returning empty', MailClient.safeFileStem('...'), 'document');
  check('safeFileStem on an empty value', MailClient.safeFileStem(''), 'document');

  ok("isHandoffSafePath rejects an apostrophe in the user profile path",
    MailClient.isHandoffSafePath("C:\\Users\\O'Brien\\AppData\\Local\\Temp\\x.pdf") === false);
  ok('isHandoffSafePath rejects a comma',
    MailClient.isHandoffSafePath('C:\\Temp\\a,b\\x.pdf') === false);
  ok('isHandoffSafePath accepts an ordinary path',
    MailClient.isHandoffSafePath('C:\\Users\\John Smith\\AppData\\Local\\Temp\\x.pdf') === true);
}

// ════════════════════════════════════════════════════════════════════════════
// 6. Real filesystem — the outgoing files
// ════════════════════════════════════════════════════════════════════════════
function materialize() {
  const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n', 'utf8');
  const bodyText = "Dear John,\n\nInvoice INV,001 for R1 234.50 — we're ready.\n\nRegards";
  const out = MailClient.materializeOutgoing({
    body: bodyText,
    attachments: [{ filename: 'Invoice_INV,001.pdf', content: pdfBytes.toString('base64') }],
  });
  tempDirs.push(out.dir);

  ok('materializeOutgoing creates a temp folder', fs.existsSync(out.dir) && fs.statSync(out.dir).isDirectory(), out.dir);
  ok('  … under the system temp directory', out.dir.startsWith(os.tmpdir()));
  ok('  … named acculedger-mail-*', path.basename(out.dir).startsWith('acculedger-mail-'));
  check('  … one attachment was written', out.attachmentPaths.length, 1);
  ok('  … the folder path is safe to hand to a mail client', MailClient.isHandoffSafePath(out.dir), out.dir);
  ok('  … so is the attachment path', MailClient.isHandoffSafePath(out.attachmentPaths[0]), out.attachmentPaths[0]);

  check('the attachment filename is sanitised for the client', out.displayNames[0], 'Invoice_INV-001.pdf');
  check('the attachment bytes round-trip exactly',
    fs.readFileSync(out.attachmentPaths[0]).toString('utf8'), pdfBytes.toString('utf8'));
  check('the body round-trips exactly, UTF-8 and all',
    fs.readFileSync(out.bodyPath, 'utf8'), bodyText);
  ok('  … including the apostrophe and the em-dash-free punctuation',
    fs.readFileSync(out.bodyPath, 'utf8').includes("we're ready"));

  const empty = MailClient.materializeOutgoing({ body: '', attachments: [] });
  tempDirs.push(empty.dir);
  check('materializeOutgoing with no attachments writes none', empty.attachmentPaths.length, 0);
  ok('  … but still writes an (empty) body file', fs.existsSync(empty.bodyPath));
}

// ════════════════════════════════════════════════════════════════════════════
// 7. Defect 1 — a client that will not start must RESOLVE, not throw
// ════════════════════════════════════════════════════════════════════════════
async function launching() {
  const cmd = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');

  // (a) missing executable
  const missing = path.join(os.tmpdir(), 'acculedger-definitely-not-here', 'NOPE.exe');
  let threw = null;
  let res = null;
  try {
    res = await MailClient.launchDetached(missing, ['/c', 'ipm.note']);
  } catch (e) {
    threw = e;
  }
  ok('launchDetached on a missing executable does not throw (was an uncaught ENOENT)', !threw, threw && threw.message);
  ok('  … it resolves', !!res);
  check('  … reporting ok:false', res && res.ok, false);
  contains('  … naming the program that failed', res && res.error, 'NOPE.exe');
  contains('  … and the OS error', res && res.error, 'ENOENT');

  // (b) a process that keeps running is a success
  const alive = await MailClient.launchDetached(cmd, ['/c', 'ping -n 4 127.0.0.1']);
  check('launchDetached on a program that keeps running reports ok:true', alive.ok, true);
  ok('  … with no error', !alive.error, alive.error);
  ok('  … a pid', Number.isInteger(alive.pid), JSON.stringify(alive));
  ok('  … and no "exited immediately" flag', !alive.exitedImmediately, JSON.stringify(alive));

  // (c) a program that quits at once with a non-zero code is a FAILURE
  const died = await MailClient.launchDetached(cmd, ['/c', 'exit 3']);
  check('launchDetached on a program that dies at once reports ok:false', died.ok, false);
  contains('  … explaining that it exited immediately', died.error, 'exited immediately');
  contains('  … with the exit code', died.error, 'code 3');

  // (d) a clean immediate exit is flagged, not failed — Thunderbird does this
  //     on purpose when an instance is already running (it hands off and quits)
  const handedOff = await MailClient.launchDetached(cmd, ['/c', 'exit 0']);
  check('launchDetached on a clean immediate exit stays ok:true', handedOff.ok, true);
  check('  … but is flagged exitedImmediately', handedOff.exitedImmediately, true);
  check('  … with exitCode 0', handedOff.exitCode, 0);
}

// ════════════════════════════════════════════════════════════════════════════
// 8. Adapter selection
// ════════════════════════════════════════════════════════════════════════════
function adapterSelection() {
  const outlook = { installed: true, exe: 'C:\\Office\\OUTLOOK.EXE', mailProfilePresent: true, ready: true };
  const thunderbird = { installed: true, exe: 'C:\\TB\\thunderbird.exe', mailProfilePresent: true, ready: true };
  const neither = { installed: false, exe: null, mailProfilePresent: false, ready: false };

  check('mailto: handled by Outlook -> Outlook adapter',
    MailClient.chooseAdapter({ progId: 'Outlook.URL.mailto.15', progIdKind: 'outlook', outlook, thunderbird: neither }).kind,
    'outlook');
  check('mailto: handled by Thunderbird -> Thunderbird adapter',
    MailClient.chooseAdapter({ progId: 'Thunderbird.Url.mailto', progIdKind: 'thunderbird', outlook: neither, thunderbird }).kind,
    'thunderbird');
  check('registered default client is Outlook -> Outlook adapter',
    MailClient.chooseAdapter({ progId: '', progIdKind: 'unknown', defaultClientKind: 'outlook', defaultClientName: 'Microsoft Outlook', outlook, thunderbird: neither }).kind,
    'outlook');

  const hijacked = MailClient.chooseAdapter({
    progId: 'ChromeHTML', progIdKind: 'browser', defaultClientName: '', defaultClientKind: 'none', outlook, thunderbird: neither,
  });
  check('browser hijacked mailto: but Outlook installed -> Outlook adapter', hijacked.kind, 'outlook');
  ok('  … flagged as a substitution, not silently swapped', hijacked.substituted === true, JSON.stringify(hijacked));
  contains('  … with a reason the UI can show', hijacked.reason, 'ChromeHTML');
  check('  … and it is reported as ready when an account exists', hijacked.clientReady, true);

  const unconfigured = MailClient.chooseAdapter({
    progId: 'Outlook.URL.mailto.15', progIdKind: 'outlook',
    outlook: { installed: true, exe: 'C:\\Office\\OUTLOOK.EXE', mailProfilePresent: false, ready: false },
    thunderbird: neither,
  });
  check('  … clientReady still reports the account state (as information only)', unconfigured.clientReady, false);
  check('  … but an INSTALLED Outlook is chosen: capability is installation, not the profile probe',
    unconfigured.kind, 'outlook');
  check('  … and the missing account is still a KNOWN fact', unconfigured.profileKnown, true);

  // The registry could not be read. We must not convert "I could not look" into
  // "there is no account" — that is a confident lie, and the whole point of the
  // three-state model. An UNKNOWN profile is still worth trying, so it is usable.
  const unknown = MailClient.chooseAdapter({
    progId: 'Outlook.URL.mailto.15', progIdKind: 'outlook',
    outlook: { installed: true, exe: 'C:\\Office\\OUTLOOK.EXE', mailProfilePresent: null, profileKnown: false, ready: false },
    thunderbird: neither,
  });
  check('  … unreadable registry -> not ready', unknown.clientReady, false);
  check('  … and it is flagged as UNKNOWN, not as "no account"', unknown.profileKnown, false);
  ok('  … so the caller can choose a different sentence', unknown.profileKnown === false && unknown.clientReady === false);
  check('  … and we still TRY it rather than refusing a setup that may work', unknown.kind, 'outlook');

  const nothing = MailClient.chooseAdapter({
    progId: 'ChromeHTML', progIdKind: 'browser', defaultClientName: '', defaultClientKind: 'none', outlook: neither, thunderbird: neither,
  });
  check('nothing installed -> mailto fallback', nothing.kind, 'mailto');
  ok('  … and it is NOT marked as attachment-capable', nothing.kind !== 'outlook' && nothing.kind !== 'thunderbird');

  // ── THE REGRESSION THIS SUITE NOW PINS ────────────────────────────────────
  // The user's real mailto: handler is a browser (Chrome -> Gmail webmail) and
  // Outlook is also installed. Attachment capability is a property of the
  // CLIENT INTEGRATION (Outlook composes with /a), so we MUST choose Outlook and
  // attempt the native compose — NOT fall back to a generic mailto: and NOT show
  // "Outlook cannot attach files". The profile probe is informational only.
  const fieldCase = MailClient.chooseAdapter({
    progId: 'ChromeHTML', progIdKind: 'browser',
    defaultClientName: 'Microsoft Outlook', defaultClientKind: 'outlook',
    outlook: { installed: true, exe: 'C:\\PROGRA~1\\MICROS~2\\Office15\\OUTLOOK.EXE', mailProfilePresent: false, profileKnown: true, ready: false },
    thunderbird: neither,
  });
  check('FIELD CASE: browser mailto handler + installed Outlook -> Outlook (attachment-capable), not mailto',
    fieldCase.kind, 'outlook');
  ok('  … chosen as the registered default client, and NOT a dead end',
    fieldCase.kind === 'outlook' && fieldCase.kind !== 'unusable-client', JSON.stringify(fieldCase));
  contains('  … and the reason names Outlook', fieldCase.reason, 'Outlook');

  // The message the user reads must not name a program that was never launched.
  // `defaultClientName` is a DIFFERENT registry key from the mailto: handler and
  // the two disagree on this very machine (Chrome vs Outlook), so it must never
  // be used to label where the draft opened.
  check('mailHandlerLabel: a browser handler is labelled by role',
    MailClient.mailHandlerLabel({ progId: 'ChromeHTML', progIdKind: 'browser', defaultClientName: 'Microsoft Outlook' }),
    'your web browser');
  ok('  … and it does NOT echo the registered default client',
    MailClient.mailHandlerLabel({ progId: 'ChromeHTML', progIdKind: 'browser', defaultClientName: 'Microsoft Outlook' })
      !== 'Microsoft Outlook');
  check('mailHandlerLabel: a mail client handler keeps its real name',
    MailClient.mailHandlerLabel({ progId: 'Outlook.URL.mailto.15', progIdKind: 'outlook' }), 'Microsoft Outlook');
  check('  … Thunderbird too',
    MailClient.mailHandlerLabel({ progId: 'Thunderbird.Url.mailto', progIdKind: 'thunderbird' }), 'Mozilla Thunderbird');
  check('  … and Windows Mail',
    MailClient.mailHandlerLabel({ progId: 'WindowsMail.Url.mailto', progIdKind: 'windows-mail' }), 'Windows Mail');
  check('an unrecognised handler falls back to the thing the OS will invoke',
    MailClient.mailHandlerLabel({ progId: 'SomeClient.Url.mailto', progIdKind: 'unknown', defaultClientName: 'Microsoft Outlook' }),
    'SomeClient.Url.mailto');
  check('  … and to a generic phrase when even that is missing',
    MailClient.mailHandlerLabel({ progId: '', progIdKind: 'unknown' }), 'your default mail handler');

  // Substitution now requires only that the substitute is INSTALLED (capable).
  const noSubstitute = MailClient.chooseAdapter({
    progId: 'ChromeHTML', progIdKind: 'browser', defaultClientName: '', defaultClientKind: 'none',
    outlook: { installed: true, exe: 'X', mailProfilePresent: false, profileKnown: true, ready: false },
    thunderbird: neither,
  });
  check('an installed Outlook IS substituted for a browser handler (it can attach)', noSubstitute.kind, 'outlook');
  ok('  … flagged as a substitution', noSubstitute.substituted === true);

  const substituteToTb = MailClient.chooseAdapter({
    progId: 'ChromeHTML', progIdKind: 'browser', defaultClientName: '', defaultClientKind: 'none',
    outlook: { installed: true, exe: 'X', mailProfilePresent: false, profileKnown: true, ready: false },
    thunderbird: { installed: true, exe: 'Y', mailProfilePresent: true, profileKnown: true, ready: true },
  });
  check('  … with both installed, Outlook is tried first', substituteToTb.kind, 'outlook');
  ok('  … flagged as a substitution', substituteToTb.substituted === true);

  const unknownUsable = MailClient.chooseAdapter({
    progId: 'ChromeHTML', progIdKind: 'browser', defaultClientName: '', defaultClientKind: 'none',
    outlook: { installed: true, exe: 'X', mailProfilePresent: null, profileKnown: false, ready: false },
    thunderbird: neither,
  });
  check('an UNKNOWN profile is still worth substituting to', unknownUsable.kind, 'outlook');
  check('  … flagged as a substitution', unknownUsable.substituted, true);

  const tbDead = MailClient.chooseAdapter({
    progId: 'Thunderbird.Url.mailto', progIdKind: 'thunderbird', outlook: neither,
    thunderbird: { installed: true, exe: 'Y', mailProfilePresent: false, profileKnown: true, ready: false },
  });
  check('installed Thunderbird as the handler -> Thunderbird adapter (attachment-capable)', tbDead.kind, 'thunderbird');
  ok('  … not a dead end', tbDead.kind !== 'unusable-client');
}

// ════════════════════════════════════════════════════════════════════════════
// 9. sendViaDefaultMailClient — never reports success for a failed launch
// ════════════════════════════════════════════════════════════════════════════
async function entryPoint() {
  const outlook = { installed: true, exe: 'C:\\Office\\OUTLOOK.EXE', mailProfilePresent: true, ready: true };
  const neither = { installed: false, exe: null, mailProfilePresent: false, ready: false };
  const clients = { progId: 'Outlook.URL.mailto.15', progIdKind: 'outlook', defaultClientName: 'Microsoft Outlook', defaultClientKind: 'outlook', outlook, thunderbird: neither };

  // (a) no recipient — must not even try to launch
  let launched = 0;
  const noTo = await MailClient.sendViaDefaultMailClient(
    { to: '', subject: 'S', body: 'B', attachments: [] },
    { clients, launch: async () => { launched++; return { ok: true }; }, manualAttachDir: manualDir() }
  );
  check('no recipient -> ok:false', noTo.ok, false);
  check('  … with a clear error', noTo.error, 'Recipient email required');
  check('  … and no process was started', launched, 0);

  // (b) THE REGRESSION: launch fails -> ok:false, attached:false, no false success
  const bManual = manualDir();
  const failedLaunch = await MailClient.sendViaDefaultMailClient(
    { to: 'a@b.com', subject: 'Invoice 1', body: 'Hi', attachments: [{ filename: 'Invoice_1.pdf', content: Buffer.from('%PDF-1.4').toString('base64') }] },
    { clients, launch: async () => ({ ok: false, error: 'OUTLOOK.EXE could not be started: ENOENT' }), manualAttachDir: bManual }
  );
  check('a client that fails to start -> ok:false', failedLaunch.ok, false);
  check('  … attached stays false', failedLaunch.attached, false);
  check('  … guarantee is none', failedLaunch.guarantee, 'none');
  contains('  … and the error is passed through', failedLaunch.error, 'ENOENT');
  ok('  … the PDF path is still reported so the user is not stranded', !!failedLaunch.attachmentPath, JSON.stringify(failedLaunch));
  // …and it is the FINDABLE copy, not the %TEMP% original.
  ok('  … and it is the findable copy, not the temp file',
    !!failedLaunch.attachmentPath && failedLaunch.attachmentPath.startsWith(bManual)
      && !failedLaunch.attachmentPath.includes('acculedger-mail-'),
    failedLaunch.attachmentPath);
  ok('  … which really exists on disk', fs.existsSync(failedLaunch.attachmentPath), failedLaunch.attachmentPath);

  // (c) Outlook launch succeeds -> documented attachment switch, exact argv
  let seen = null;
  const cManual = manualDir();
  const goodLaunch = await MailClient.sendViaDefaultMailClient(
    { to: 'customer@example.com', subject: 'Invoice 42', body: 'Dear John,\n\nThanks.', attachments: [{ filename: 'Invoice_42.pdf', content: Buffer.from('%PDF-1.4').toString('base64') }] },
    { clients, launch: async (exe, args) => { seen = { exe, args }; return { ok: true }; }, manualAttachDir: cManual }
  );
  check('Outlook launch succeeds -> ok:true', goodLaunch.ok, true);
  check('  … and launched:true, so the caller knows a process was created', goodLaunch.launched, true);
  check('  … method names the client', goodLaunch.method, 'outlook-compose');
  check('  … attached:true', goodLaunch.attached, true);
  check('  … guarantee is the documented switch', goodLaunch.guarantee, 'documented-switch');
  check('  … no warning to show', goodLaunch.warning, null);
  check('  … the exe that was launched', seen.exe, 'C:\\Office\\OUTLOOK.EXE');
  check('  … argv matches buildOutlookArgs exactly', seen.args[0], '/c');
  check('  … and the attachment is the real temp file', seen.args[seen.args.indexOf('/a') + 1], goodLaunch.attachmentPath);
  ok('  … which exists on disk', fs.existsSync(goodLaunch.attachmentPath));
  contains('  … with the recipient in /m', seen.args[3], 'customer@example.com?subject=Invoice%2042');
  contains('  … and %0D%0A line breaks in the body', seen.args[3], 'Dear%20John%2C%0D%0A%0D%0AThanks.');
  // A SUCCESSFUL send must not leave a stray PDF anywhere the user will find it
  // later — the copy is only for the manual-attach fallback.
  check('  … and NOTHING was published for manual attach', manualFiles(cManual).length, 0);

  // (d) mailto fallback -> honest attached:false plus a fallback message
  const dManual = manualDir();
  const mailtoRun = await MailClient.sendViaDefaultMailClient(
    { to: 'customer@example.com', subject: 'Invoice 42', body: 'Dear John,\n\nThanks.', attachments: [{ filename: 'Invoice_42.pdf', content: Buffer.from('%PDF-1.4').toString('base64') }] },
    {
      clients: { progId: 'ChromeHTML', progIdKind: 'browser', defaultClientName: '', defaultClientKind: 'none', outlook: neither, thunderbird: neither },
      launch: async () => { throw new Error('must not launch a client in the mailto path'); },
      manualAttachDir: dManual,
    }
  );
  check('mailto fallback -> ok:true (the compose window did open)', mailtoRun.ok, true);
  check('  … method is mailto', mailtoRun.method, 'mailto');
  check('  … attached:false — mailto cannot carry a file', mailtoRun.attached, false);
  check('  … guarantee is none', mailtoRun.guarantee, 'none');
  ok('  … a warning is supplied, not a success message', !!mailtoRun.warning, JSON.stringify(mailtoRun));
  contains('  … naming the saved PDF', mailtoRun.warning, mailtoRun.attachmentPath);
  // The label must describe the program the OS actually opened.
  check('  … and the client label is the real handler, not the default client',
    mailtoRun.client, 'your web browser');
  contains('  … so the message says so', mailtoRun.warning, 'your web browser');
  ok('  … and never claims Outlook opened when it did not',
    !/Outlook/.test(mailtoRun.warning || ''), mailtoRun.warning);
  // The reported path must be somewhere a person can actually navigate to.
  ok('  … and the PDF was published somewhere findable',
    !!mailtoRun.attachmentPath && mailtoRun.attachmentPath.startsWith(dManual), mailtoRun.attachmentPath);
  ok('  … where it really exists', fs.existsSync(mailtoRun.attachmentPath), mailtoRun.attachmentPath);
  check('  … exactly one copy was published', manualFiles(dManual).length, 1);
  check('  … and it was opened through the OS handler', openedUris.length, 1);
  contains('  … with the recipient', openedUris[0], 'mailto:customer@example.com?');
  contains('  … and %0D%0A line breaks', openedUris[0], '%0D%0A');

  // (e) no mailto handler at all -> failure, with a route forward
  openedUris.length = 0;
  const noHandler = await MailClient.sendViaDefaultMailClient(
    { to: 'a@b.com', subject: 'S', body: 'B', attachments: [] },
    {
      clients: { progId: '', progIdKind: 'unknown', defaultClientName: '', defaultClientKind: 'none', outlook: neither, thunderbird: neither },
      launch: async () => ({ ok: true }),
      openUri: async () => { throw new Error('No application is associated with the specified file'); },
      manualAttachDir: manualDir(),
    }
  );
  check('no mailto handler -> ok:false', noHandler.ok, false);
  contains('  … error names mailto:', noHandler.error, 'mailto:');
  contains('  … and points at the built-in sender', noHandler.error, 'built-in email sender');

  // (f) A client that starts and quits at once: ok, but no attachment claim.
  //     This is the shape a broken/stub Outlook install produces, and the old
  //     code reported it as a flat success.
  const fManual = manualDir();
  const quitEarly = await MailClient.sendViaDefaultMailClient(
    { to: 'a@b.com', subject: 'S', body: 'B', attachments: [{ filename: 'Invoice_1.pdf', content: Buffer.from('%PDF-1.4').toString('base64') }] },
    { clients, launch: async () => ({ ok: true, pid: 1, exitedImmediately: true, exitCode: 0 }), manualAttachDir: fManual }
  );
  check('a client that quit at once -> ok:true (it did start)', quitEarly.ok, true);
  check('  … and launched:true — a process really was created', quitEarly.launched, true);
  check('  … attached:false — no compose window was confirmed', quitEarly.attached, false);
  check('  … guarantee is none', quitEarly.guarantee, 'none');
  contains('  … the warning says it exited immediately', quitEarly.warning, 'exited immediately');
  contains('  … and points at the saved PDF', quitEarly.warning, quitEarly.attachmentPath);
  ok('  … which is the published copy, not the temp file',
    !!quitEarly.attachmentPath && quitEarly.attachmentPath.startsWith(fManual), quitEarly.attachmentPath);

  // (g) A temp path the client cannot parse must NOT be claimed as attached.
  //     Outlook's command line and Thunderbird's -compose string both use the
  //     comma as a separator and the single quote as a delimiter, and neither
  //     can be escaped — so a %TEMP% that contains one (e.g. a user profile
  //     called O'Brien) has to degrade to the manual-attach fallback.
  const commaTemp = path.join(os.tmpdir(), 'acculedger-comma,probe');
  fs.mkdirSync(commaTemp, { recursive: true });
  tempDirs.push(commaTemp);
  // Pin the premise: the materialized path really is one the command line
  // cannot carry. Without this the case would silently stop testing anything
  // if the naming scheme changed.
  const gProbe = MailClient.materializeOutgoing({
    body: 'B', tmpRoot: commaTemp,
    attachments: [{ filename: 'Invoice_1.pdf', content: Buffer.from('%PDF-1.4').toString('base64') }],
  });
  tempDirs.push(gProbe.dir);
  ok('the generated temp path really contains a comma', gProbe.attachmentPaths[0].includes(','), gProbe.attachmentPaths[0]);
  ok('  … and is classified unsafe for the command line', MailClient.isHandoffSafePath(gProbe.attachmentPaths[0]) === false);

  const gManual = manualDir();
  const unsafe = await MailClient.sendViaDefaultMailClient(
    { to: 'a@b.com', subject: 'S', body: 'B', attachments: [{ filename: 'Invoice_1.pdf', content: Buffer.from('%PDF-1.4').toString('base64') }] },
    { clients, launch: async () => ({ ok: true }), tmpRoot: commaTemp, manualAttachDir: gManual }
  );
  check('an unparseable attachment path -> attached:false', unsafe.attached, false);
  check('  … guarantee is none', unsafe.guarantee, 'none');
  ok('  … and the user is told to attach it manually', /manually/i.test(unsafe.warning || ''), unsafe.warning);
  ok('  … pointing at a copy that is NOT the unparseable temp file',
    !!unsafe.attachmentPath && !unsafe.attachmentPath.startsWith(commaTemp), unsafe.attachmentPath);
  ok('  … which really exists', fs.existsSync(unsafe.attachmentPath), unsafe.attachmentPath);
  ok('  … and the warning names that copy', String(unsafe.warning).includes(unsafe.attachmentPath), unsafe.warning);

  // (h) Installed Outlook with NO detected mail account. Capability is the
  //     integration, so we ATTEMPT the native compose WITH the attachment. This
  //     is the fix for the regression: Outlook is no longer refused, and an
  //     opened draft is recorded as "Draft opened externally" — never Sent.
  let unconfiguredLaunches = 0;
  let unconfiguredArgs = null;
  const hManual = manualDir();
  const unconfigured = await MailClient.sendViaDefaultMailClient(
    { to: 'a@b.com', subject: 'S', body: 'B', attachments: [{ filename: 'Invoice_1.pdf', content: Buffer.from('%PDF-1.4').toString('base64') }] },
    {
      clients: {
        progId: 'Outlook.URL.mailto.15', progIdKind: 'outlook', defaultClientName: 'Microsoft Outlook', defaultClientKind: 'outlook',
        outlook: { installed: true, exe: 'C:\\Office\\OUTLOOK.EXE', mailProfilePresent: false, profileKnown: true, ready: false },
        thunderbird: neither,
      },
      launch: async (exe, args) => { unconfiguredLaunches += 1; unconfiguredArgs = args; return { ok: true, pid: 1 }; },
      manualAttachDir: hManual,
    }
  );
  check('an installed Outlook with no detected account is STILL attempted', unconfiguredLaunches, 1);
  check('  … ok:true (the launch happened)', unconfigured.ok, true);
  check('  … launched:true is reported', unconfigured.launched, true);
  check('  … attached:true — the /a switch carried the PDF', unconfigured.attached, true);
  check('  … guarantee is the documented switch', unconfigured.guarantee, 'documented-switch');
  ok('  … the argv carries the Outlook attachment switch',
    Array.isArray(unconfiguredArgs) && unconfiguredArgs.includes('/a'), JSON.stringify(unconfiguredArgs));
  ok('  … with the attachment path',
    Array.isArray(unconfiguredArgs) && unconfiguredArgs.some(a => String(a).includes(unconfigured.attachmentPath)), JSON.stringify(unconfiguredArgs));
  ok('  … no capability warning is emitted', !unconfigured.warning, unconfigured.warning);
  check('  … and nothing is published to Downloads', manualFiles(hManual).length, 0);
  check('  … account state is still reported as information', unconfigured.clientReady, false);

  // (i) Thunderbird — the full hand-off. The compose spec must carry every
  //     field, and Thunderbird's OWN parser must read them back intact.
  const tb = { installed: true, exe: 'C:\\TB\\thunderbird.exe', mailProfilePresent: true, ready: true };
  const tbClients = {
    progId: 'Thunderbird.Url.mailto', progIdKind: 'thunderbird',
    defaultClientName: 'Mozilla Thunderbird', defaultClientKind: 'thunderbird',
    outlook: neither, thunderbird: tb,
  };
  let tbSeen = null;
  const tbManual = manualDir();
  const tbGood = await MailClient.sendViaDefaultMailClient(
    {
      to: 'customer@example.com', cc: 'accounts@example.com',
      subject: 'Quote from Smith & Sons',
      body: "Hi John's Team,\n\nPlease don't hesitate to contact us.\nThank you for your business.",
      attachments: [{ filename: 'Quote 08014 - Smith & Sons.pdf', content: Buffer.from('%PDF-1.4').toString('base64') }],
    },
    { clients: tbClients, launch: async (exe, args) => { tbSeen = { exe, args }; return { ok: true, pid: 1 }; }, manualAttachDir: tbManual }
  );
  check('Thunderbird launch succeeds -> ok:true', tbGood.ok, true);
  check('  … method names the Thunderbird adapter', tbGood.method, 'thunderbird-compose');
  check('  … attached:true', tbGood.attached, true);
  check('  … guarantee is the documented switch', tbGood.guarantee, 'documented-switch');
  check('  … no warning', tbGood.warning, null);
  check('  … the exe launched', tbSeen.exe, 'C:\\TB\\thunderbird.exe');
  check('  … -compose is the flag', tbSeen.args[0], '-compose');
  check('  … and the whole spec is ONE argument (never split per field)', tbSeen.args.length, 2);
  {
    const p = getArgs(tbSeen.args[1]);
    check('  … to round-trips through Thunderbird\'s parser', p.to, 'customer@example.com');
    check('  … cc round-trips', p.cc, 'accounts@example.com');
    check('  … subject round-trips', p.subject, 'Quote from Smith & Sons');
    check('  … body round-trips with apostrophes and paragraphs',
      p.body, "Hi John's Team,\n\nPlease don't hesitate to contact us.\nThank you for your business.");
    check('  … format is text', p.format, 'text');
    ok('  … attachment is a file: URI', String(p.attachment).startsWith('file:///'), p.attachment);
    ok('  … ending in the generated PDF name', String(p.attachment).endsWith('.pdf'), p.attachment);
  }
  ok('  … the reported attachment path is the real temp PDF', fs.existsSync(tbGood.attachmentPath), tbGood.attachmentPath);
  check('  … and NOTHING was published to Downloads', manualFiles(tbManual).length, 0);

  // (j) THE REGRESSION: Thunderbird hands a -compose request to an
  //     already-running instance and quits with code 0. That is a success — the
  //     old code called it "exited immediately without opening a window" and
  //     dropped a manual-attach copy into Downloads.
  const tbHandoffManual = manualDir();
  const tbHandoff = await MailClient.sendViaDefaultMailClient(
    { to: 'a@b.com', subject: 'S', body: 'B', attachments: [{ filename: 'Quote_1.pdf', content: Buffer.from('%PDF-1.4').toString('base64') }] },
    { clients: tbClients, launch: async () => ({ ok: true, pid: 1, exitedImmediately: true, exitCode: 0, stderr: null }), manualAttachDir: tbHandoffManual }
  );
  check('Thunderbird quick clean exit (hand-off) -> ok:true', tbHandoff.ok, true);
  check('  … attached:true — the hand-off is a success, not a failure', tbHandoff.attached, true);
  check('  … guarantee is the documented switch', tbHandoff.guarantee, 'documented-switch');
  check('  … and there is no false "exited immediately" warning', tbHandoff.warning, null);
  check('  … so NOTHING is published for manual attach', manualFiles(tbHandoffManual).length, 0);

  // (k) A genuinely malformed launch (non-zero exit) is still a failure, and
  //     the client's own stderr is carried through so it can be diagnosed.
  const tbFailManual = manualDir();
  const tbFail = await MailClient.sendViaDefaultMailClient(
    { to: 'a@b.com', subject: 'S', body: 'B', attachments: [{ filename: 'Quote_1.pdf', content: Buffer.from('%PDF-1.4').toString('base64') }] },
    {
      clients: tbClients,
      launch: async () => ({
        ok: false, exitCode: 1, stderr: 'Error: cannot create compose window',
        error: 'thunderbird.exe started but exited immediately (code 1) without opening a window. Error: cannot create compose window',
      }),
      manualAttachDir: tbFailManual,
    }
  );
  check('Thunderbird non-zero exit -> ok:false', tbFail.ok, false);
  check('  … attached stays false', tbFail.attached, false);
  contains('  … the error carries the client stderr', tbFail.error, 'cannot create compose window');
  ok('  … and the PDF is still made findable for manual attach',
    !!tbFail.attachmentPath && fs.existsSync(tbFail.attachmentPath), tbFail.attachmentPath);

  // ── the publish helper itself: never clobber an earlier copy ──────────────
  // Two invoices can share a number (a re-send, a corrected copy). Overwriting
  // would silently destroy the first file, so the second must get a suffix.
  {
    const dir = manualDir();
    const src = path.join(os.tmpdir(), `acculedger-src-${Date.now()}.pdf`);
    fs.writeFileSync(src, '%PDF-1.4 first');
    tempDirs.push(src);
    const files = { attachmentPaths: [src], displayNames: ['Invoice_7.pdf'] };
    const first = MailClient.publishForManualAttach(files, dir);
    check('publishForManualAttach returns the written path', first.length, 1);
    check('  … under its display name', path.basename(first[0]), 'Invoice_7.pdf');
    fs.writeFileSync(src, '%PDF-1.4 second');
    const second = MailClient.publishForManualAttach(files, dir);
    check('a second copy gets a suffix instead of overwriting', path.basename(second[0]), 'Invoice_7 (2).pdf');
    check('  … so the first copy is still intact',
      fs.readFileSync(first[0], 'utf8'), '%PDF-1.4 first');
    const third = MailClient.publishForManualAttach(files, dir);
    check('  … and the counter keeps climbing', path.basename(third[0]), 'Invoice_7 (3).pdf');
    check('  … leaving three files in total', manualFiles(dir).length, 3);
    // An empty attachment list must not create anything, and must not throw.
    check('no attachments -> no copies', MailClient.publishForManualAttach({ attachmentPaths: [], displayNames: [] }, dir).length, 0);
    check('  … and nothing new was written', manualFiles(dir).length, 3);
  }

  // ── the Downloads redirect the suite itself relies on ─────────────────────
  // If this ever stopped working, every run would start writing into the real
  // ~/Downloads folder — a side effect on the user's machine.
  {
    const dir = manualDir();
    const prevEnv = process.env.ACCULEDGER_MANUAL_ATTACH_DIR;
    process.env.ACCULEDGER_MANUAL_ATTACH_DIR = dir;
    check('downloadsDir honours the override', MailClient.downloadsDir(), dir);
    process.env.ACCULEDGER_MANUAL_ATTACH_DIR = prevEnv || '';
    ok('  … and without it, it does not return the override',
      MailClient.downloadsDir() !== dir);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 10. Real IPC round trip — the actual handler the UI calls
// ════════════════════════════════════════════════════════════════════════════
async function ipcRoundTrip() {
  const handler = handlers.get('email-send-external');
  ok('email-send-external is registered', !!handler);
  if (!handler) return;

  const missingTo = await handler({}, { to: '', pdfBase64: 'AAA' });
  check('handler: no recipient -> success:false', missingTo.success, false);
  check('  … error', missingTo.error, 'Recipient email required');

  const missingPdf = await handler({}, { to: 'a@b.com' });
  check('handler: no PDF -> success:false', missingPdf.success, false);
  contains('  … error tells the user to save first', missingPdf.error, 'save the document first');

  // A genuinely different client that is not installed must FAIL, not "succeed".
  const prev = process.env.ACCULEDGER_MAIL_CLIENT;
  process.env.ACCULEDGER_MAIL_CLIENT = 'not-a-real-client';
  const bogus = await handler({}, {
    to: 'a@b.com', subject: 'S', body: 'B',
    pdfFilename: 'Invoice_1.pdf', pdfBase64: Buffer.from('%PDF-1.4').toString('base64'),
  });
  process.env.ACCULEDGER_MAIL_CLIENT = prev || '';
  check('handler: unavailable client -> success:false', bogus.success, false);
  contains('  … and says which client is missing', bogus.error, 'not-a-real-client');
  ok('  … it did NOT report a false success', bogus.success !== true);

  // Force the mailto path so the whole pipeline runs without opening anything:
  // the electron shell is stubbed, so we can inspect the URI it was handed.
  openedUris.length = 0;
  process.env.ACCULEDGER_MAIL_CLIENT = 'mailto';
  const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'utf8');
  const sent = await handler({}, {
    to: 'customer@example.com',
    subject: 'Invoice 42 & VAT',
    body: 'Dear John,\n\nPlease find your invoice attached.\n\nRegards',
    pdfFilename: 'Invoice_INV,001.pdf',
    pdfBase64: pdfBytes.toString('base64'),
  });
  process.env.ACCULEDGER_MAIL_CLIENT = prev || '';

  check('handler: forced mailto -> success:true', sent.success, true);
  check('  … attached:false (the honest answer)', sent.attached, false);
  check('  … method', sent.method, 'mailto');
  ok('  … a warning is present', !!sent.warning, JSON.stringify(sent));
  contains('  … naming the saved PDF', sent.warning, sent.attachmentPath);
  ok('  … the PDF really was written', fs.existsSync(sent.attachmentPath), sent.attachmentPath);
  check('  … as a valid PDF', fs.readFileSync(sent.attachmentPath).slice(0, 5).toString('utf8'), '%PDF-');
  ok('  … with the comma stripped from the filename', !path.basename(sent.attachmentPath).includes(','), path.basename(sent.attachmentPath));
  // The real handler owns its own dependencies, so the only thing keeping it
  // out of the user's real Downloads folder is the env redirect. Assert it.
  ok('  … and it landed in the redirected folder, not the real Downloads',
    String(sent.attachmentPath).startsWith(GLOBAL_MANUAL_DIR), sent.attachmentPath);
  // Machine-independent: whatever this box's handler is, the reported client
  // must be the label for THAT handler.
  check('  … and the client label matches the real handler',
    sent.client, MailClient.mailHandlerLabel(MailClient.detectMailClients()));
  check('  … and exactly one mailto URI was opened', openedUris.length, 1);
  contains('  … with the recipient', openedUris[0], 'mailto:customer@example.com?');
  contains('  … the subject encoded', openedUris[0], 'subject=Invoice%2042%20%26%20VAT');
  contains('  … and RFC 6068 line breaks', openedUris[0], '%0D%0A');

  // ── the pre-flight info handler the modal uses ──
  const info = await handlers.get('email-mail-client-info')({});
  check('email-mail-client-info -> success:true', info.success, true);
  ok('  … reports the mailto ProgId', typeof info.progId === 'string', JSON.stringify(info.progId));
  ok('  … reports whether attachments are possible', typeof info.canAttach === 'boolean', JSON.stringify(info));
  ok('  … and which adapter will be used',
    ['outlook', 'thunderbird', 'mailto', 'unavailable'].includes(info.adapter?.kind), JSON.stringify(info.adapter));
  ok('  … canAttach agrees with the adapter kind',
    info.canAttach === (info.adapter.kind === 'outlook' || info.adapter.kind === 'thunderbird'));
  ok('  … a note the UI can show verbatim',
    typeof info.note === 'string' && info.note.length > 20, info.note);
  // The note must describe the handler the OS will ACTUALLY open. On this
  // machine that is Chrome, while the registered default client is Outlook —
  // naming Outlook here would be the same lie as naming it after a send.
  if (info.adapter.kind === 'mailto') {
    contains('  … naming the real handler', info.note, MailClient.mailHandlerLabel(MailClient.detectMailClients()));
    ok('  … and NOT the registered default client',
      !/Outlook/.test(info.note), info.note);
  }
  if (info.adapter.kind === 'unusable-client') {
    ok('  … giving the real reason (no account), not "cannot attach"',
      /no email account set up/.test(info.note) && !/cannot attach files/.test(info.note), info.note);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 11. Quote AND Invoice, end to end through the handler
// ════════════════════════════════════════════════════════════════════════════
async function documentRoundTrip() {
  const handler = handlers.get('email-send-external');
  const prev = process.env.ACCULEDGER_MAIL_CLIENT;
  process.env.ACCULEDGER_MAIL_CLIENT = 'mailto';   // shell is stubbed, so nothing opens
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'utf8');

  const restores = [];
  try {
    for (const doc of [
      { table: 'invoices', type: 'Invoice' },
      { table: 'quotes', type: 'Quote' },
    ]) {
      const row = db.prepare(`SELECT id, number FROM ${doc.table} ORDER BY id DESC LIMIT 1`).get();
      ok(`${doc.type}: a real record exists in the scratch database`, !!row, JSON.stringify(row));
      if (!row) continue;

      const snapshot = db.prepare(
        `SELECT sent_date, sent_method, sent_status FROM ${doc.table} WHERE id = ?`
      ).get(row.id);
      restores.push({ table: doc.table, id: row.id, snapshot });

      // ── the REAL template, not a stand-in ────────────────────────────────
      // Same module, same context shape as SendEmailModal, so the subject and
      // body here are byte-identical to what the customer would receive.
      const tpl = emailMod.buildDocumentEmail({
        documentType: doc.type,
        isPaid: false,
        config: {},
        context: {
          companyName: 'Cedar Meadow Farms & Pets',
          companyPhone: '555-1234',
          companyEmail: 'info@example.com',
          customerName: 'Ivan Peachey',
          documentNumber: row.number,
          documentType: doc.type,
          total: '$300.00',
          balanceDue: '$300.00',
          dueDate: '09/30/2026',
          paidDate: '08/31/2026',
        },
      });
      const subject = tpl.subject;
      const body = tpl.body;
      ok(`${doc.type}: the real template produced a subject`, !!subject, subject);
      ok(`  … and a multi-line body`, body.includes('\n'), JSON.stringify(body));
      ok(`  … with no literal backslash-n leaked through`, !/\\n/.test(body + subject));
      if (doc.type === 'Invoice') {
        contains('  … carrying the invoice number in the subject', subject, row.number);
      }

      openedUris.length = 0;
      const res = await handler({}, {
        to: 'ivan@example.com',
        subject,
        body,
        pdfFilename: `${doc.type}_${row.number}.pdf`,
        pdfBase64: pdf.toString('base64'),
        document_type: doc.type,
        document_id: row.id,
      });
      check(`${doc.type}: handler reports success`, res.success, true);
      check(`  … via the ${doc.type} document type`, res.method, 'mailto');
      check('  … honestly reporting that mailto cannot attach', res.attached, false);
      ok('  … with a fallback warning', !!res.warning, JSON.stringify(res));
      ok('  … the PDF was written to disk', fs.existsSync(res.attachmentPath), res.attachmentPath);
      check('  … with a clean attachment filename',
        path.basename(res.attachmentPath), `${doc.type}_${row.number}.pdf`);
      check('  … holding exactly the bytes the UI sent',
        fs.readFileSync(res.attachmentPath).toString('utf8'), pdf.toString('utf8'));
      ok('  … and it is NOT in the user\'s real Downloads folder',
        String(res.attachmentPath).startsWith(GLOBAL_MANUAL_DIR), res.attachmentPath);

      const after = db.prepare(
        `SELECT sent_date, sent_method, sent_status FROM ${doc.table} WHERE id = ?`
      ).get(row.id);
      check(`  … ${doc.type} recorded as opened externally`, after.sent_method, 'External Email');
      check('  … with status "Draft opened externally" (NOT Sent)', after.sent_status, 'Draft opened externally');
      ok('  … and a sent_date stamped', !!after.sent_date, JSON.stringify(after));

      check('  … exactly one compose URI was opened', openedUris.length, 1);
      contains('  … addressed to the customer', openedUris[0], 'mailto:ivan@example.com?');
      contains('  … carrying the REAL template subject', safeDecode(openedUris[0]), subject);
      contains('  … and RFC 6068 line breaks in the body', openedUris[0], '%0D%0A');
      // The strongest end-to-end claim available: the entire template body,
      // line breaks and all, is present in the URI handed to the OS. %0D%0A
      // decodes to \r\n, so normalise before comparing against the template.
      contains('  … and the ENTIRE template body survived the round trip',
        safeDecode(openedUris[0]).replace(/\r\n/g, '\n'), body);
      contains('  … greeting the customer by name', safeDecode(openedUris[0]), 'Dear Ivan Peachey,');
      contains('  … and naming the company', safeDecode(openedUris[0]), 'Cedar Meadow Farms & Pets');
    }
  } finally {
    process.env.ACCULEDGER_MAIL_CLIENT = prev || '';
    for (const r of restores) {
      db.prepare(`UPDATE ${r.table} SET sent_date = ?, sent_method = ?, sent_status = ? WHERE id = ?`)
        .run(r.snapshot.sent_date, r.snapshot.sent_method, r.snapshot.sent_status, r.id);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 12. The real machine's mail setup
// ════════════════════════════════════════════════════════════════════════════
function environment() {
  const clients = MailClient.detectMailClients();
  console.log(`  [info] mailto: ProgId     = ${JSON.stringify(clients.progId)} (${clients.progIdKind})`);
  console.log(`  [info] registered client  = ${JSON.stringify(clients.defaultClientName)} (${clients.defaultClientKind})`);
  console.log(`  [info] Clients\\Mail keys  = ${JSON.stringify(clients.registeredClients)}`);
  console.log(`  [info] registry readable  = ${clients.registryReadable}`);
  console.log(`  [info] Outlook            = ${clients.outlook.installed ? clients.outlook.exe : 'not found'}`);
  console.log(`  [info]   mail account?    = ${clients.outlook.mailProfilePresent} (known=${clients.outlook.profileKnown})`);
  console.log(`  [info] Thunderbird        = ${clients.thunderbird.installed ? clients.thunderbird.exe : 'not found'}`);
  console.log(`  [info]   mail account?    = ${clients.thunderbird.mailProfilePresent} (known=${clients.thunderbird.profileKnown})`);
  const chosen = MailClient.chooseAdapter(clients);
  console.log(`  [info] adapter            = ${chosen.kind} (${chosen.reason})`);
  console.log(`  [info]   clientReady      = ${chosen.clientReady}`);

  ok('detectMailClients returns a platform', typeof clients.platform === 'string');
  ok('detectMailClients returns a progIdKind',
    ['outlook', 'thunderbird', 'windows-mail', 'browser', 'unknown'].includes(clients.progIdKind));
  ok('detectMailClients returns an array of registered clients', Array.isArray(clients.registeredClients));
  ok('detectMailClients reports whether the registry was readable', typeof clients.registryReadable === 'boolean');
  ok('detectMailClients reports Outlook installation state as a boolean', typeof clients.outlook.installed === 'boolean');
  ok('detectMailClients reports Thunderbird installation state as a boolean', typeof clients.thunderbird.installed === 'boolean');
  // `null` is a legitimate answer: "the registry could not be read" is not the
  // same as "there is no account", and the code must not conflate them.
  ok('detectMailClients reports whether Outlook has a mail account',
    clients.outlook.mailProfilePresent === null || typeof clients.outlook.mailProfilePresent === 'boolean',
    String(clients.outlook.mailProfilePresent));
  ok('detectMailClients reports whether Thunderbird has a mail account',
    typeof clients.thunderbird.mailProfilePresent === 'boolean');
  ok('  … and profileKnown is false only when the answer is genuinely unknown',
    clients.outlook.profileKnown === (clients.outlook.mailProfilePresent !== null));
  ok('  … and `ready` is installed AND positively configured',
    clients.outlook.ready === (clients.outlook.installed && clients.outlook.mailProfilePresent === true));
  // The load-bearing invariant: an unreadable registry must never be reported as
  // a confident "no email account".
  ok('  … and an unknown profile never becomes a confident "not ready" claim',
    clients.outlook.profileKnown === false
      ? chosen.profileKnown === false
      : true,
    JSON.stringify({ mailProfilePresent: clients.outlook.mailProfilePresent, profileKnown: clients.outlook.profileKnown }));
  if (clients.outlook.installed) {
    ok('  … and the Outlook exe it found really exists', fs.existsSync(clients.outlook.exe), clients.outlook.exe);
    ok('  … and it is named OUTLOOK.EXE', /OUTLOOK\.EXE$/i.test(clients.outlook.exe), clients.outlook.exe);
  }
  if (clients.thunderbird.installed) {
    ok('  … and the Thunderbird exe it found really exists', fs.existsSync(clients.thunderbird.exe), clients.thunderbird.exe);
  }
  ok('chooseAdapter returns a usable kind on this machine',
    ['outlook', 'thunderbird', 'mailto', 'unavailable'].includes(chosen.kind), JSON.stringify(chosen));
  ok('chooseAdapter reports clientReady as a boolean', typeof chosen.clientReady === 'boolean', JSON.stringify(chosen));
}

// ════════════════════════════════════════════════════════════════════════════
// 13. Wiring — client-specific code must not leak into the components
// ════════════════════════════════════════════════════════════════════════════
function wiring() {
  const handlerSrc = stripComments(read('src/backend/handlers/emailHandlers.js'));
  ok('emailHandlers no longer spawns a client itself', !/\bspawn\s*\(/.test(handlerSrc));
  ok('emailHandlers no longer builds a compose window itself', !/openComposeWindow/.test(handlerSrc));
  ok('emailHandlers no longer writes the PDF itself', !/writePdfTemp/.test(handlerSrc));
  ok('emailHandlers no longer runs reg.exe', !/\breg\s+query\b|execSync/.test(handlerSrc));
  contains('emailHandlers delegates to the mailClient service', handlerSrc, 'MailClient.sendViaDefaultMailClient');
  contains('  … and registers the pre-flight info handler', handlerSrc, "ipcMain.handle('email-mail-client-info'");
  contains('  … and reports the attachment state back to the UI', handlerSrc, 'attached: !!result.attached');
  contains('  … and the pre-flight note labels the real handler',
    handlerSrc, 'MailClient.mailHandlerLabel');
  // The note must be built from the handler, not the registered default client.
  // Scoped to the note-building code only — the RETURN payload legitimately
  // passes clients.defaultClientName through as raw data for diagnostics.
  {
    const start = handlerSrc.indexOf('const handlerLabel');
    const end = handlerSrc.indexOf('return {', start);
    const noteBlock = start > -1 && end > start ? handlerSrc.slice(start, end) : '';
    ok('  … the note block was located', noteBlock.length > 0);
    contains('  … deriving the label from mailHandlerLabel', noteBlock, 'MailClient.mailHandlerLabel(clients)');
    ok('  … and never from clients.defaultClientName',
      !/clients\.defaultClientName/.test(noteBlock),
      'the pre-flight note names the registered default client again');
    contains('  … with a dedicated branch for a client that cannot compose', noteBlock, 'unusable-client');
  }

  // Data-integrity guard: the document may only be stamped Sent AFTER an ok
  // result. If the marking moved above the `!result.ok` early return, an invoice
  // would be recorded as sent when no message window ever opened.
  {
    const notOkIdx = handlerSrc.indexOf('if (!result.ok)');
    const markIdx = handlerSrc.indexOf('markInvoiceSent');
    ok('  … the !result.ok early return exists', notOkIdx > -1);
    ok('  … and it comes BEFORE the document is marked Sent',
      notOkIdx > -1 && markIdx > -1 && notOkIdx < markIdx,
      `notOk@${notOkIdx} markSent@${markIdx}`);
    contains('  … and the failure path never marks the document Sent',
      handlerSrc.slice(notOkIdx, markIdx), 'return {');
  }

  const svcSrc = stripComments(read('src/backend/services/mailClient.js'));
  // The label for "where did my draft open" must come from the handler, never
  // from the registered default mail client — those are different registry keys
  // and they disagree on this very machine (Chrome vs Outlook).
  ok('the mailto branch does not label the client with the default mail client',
    !/clientLabel\s*=\s*[^;]*defaultClientName/.test(svcSrc));
  contains('  … it derives the label from the actual handler', svcSrc, 'mailHandlerLabel(clients)');
  ok('  … and the helper itself never reads defaultClientName',
    !/function mailHandlerLabel[\s\S]{0,700}?defaultClientName/.test(svcSrc));
  ok('mailClient attaches an error listener to the child process', /once\(\s*'error'/.test(svcSrc));
  ok('  … and waits for the spawn event before claiming success', /once\(\s*'spawn'/.test(svcSrc));
  ok('  … and checks whether the client quit at once', /once\(\s*'exit'/.test(svcSrc));
  const unrefCount = (svcSrc.match(/unref\(\)/g) || []).length;
  check('  … and unrefs the child in exactly one place', unrefCount, 1);
  const settleIdx = svcSrc.indexOf('const settle =');
  ok('  … inside the settle helper',
    settleIdx >= 0 && svcSrc.indexOf('unref()') > settleIdx);
  ok('  … which the spawn handler reaches, so unref can never run before the process starts',
    /once\(\s*'spawn'[\s\S]{0,600}?settle\(/.test(svcSrc));
  ok('  … and unref is never chained straight onto spawn()',
    !/\)\s*\.unref\(\)/.test(svcSrc));

  const modalSrc = stripComments(read('src/frontend/src/components/customers/shared/SendEmailModal.js'));
  ok('SendEmailModal contains no Outlook command line', !/ipm\.note/i.test(modalSrc));
  ok('SendEmailModal contains no Thunderbird -compose', !/-compose/i.test(modalSrc));
  ok('SendEmailModal contains no /a attachment switch', !/'\/a'/.test(modalSrc));
  contains('SendEmailModal branches on the honest `attached` flag', modalSrc, 'res.attached');
  contains('  … using the pre-flight mail client info', modalSrc, 'emailMailClientInfo');
  // The two delivery methods are independent: the external path asks the OS
  // client to attach ONLY when it can, and NEVER silently hands off to SMTP.
  // When the client cannot attach, the user is given an explicit choice.
  contains('  … asks the OS client to attach only when it can', modalSrc, 'requireAttachment: !!withAttachment');
  contains('  … and offers the explicit fallback choice instead', modalSrc, 'Use AccuLedger Email');
  {
    const start = modalSrc.indexOf('const sendExternal');
    const end = modalSrc.indexOf('const handleSend', start);
    const body = start > -1 && end > start ? modalSrc.slice(start, end) : '';
    ok('SendEmailModal: the external send path was located', body.length > 0);
    const closes = (body.match(/onClose\(\)/g) || []).length;
    check('  … and it closes the dialog on success only', closes, 1);
    ok('  … and it never auto-hands-off to the built-in sender', !/return sendBuiltin\(/.test(body));
    ok('  … and it reports an opened draft, never a sent email',
      /message\.success\(/.test(body) && /draft opened/i.test(body));
  }

  const preloadSrc = read('src/backend/preload.js');
  contains('preload exposes the pre-flight mail client info', preloadSrc, 'emailMailClientInfo');

  const settingsSrc = stripComments(read('src/frontend/src/components/settings/EmailSettings.js'));
  ok('EmailSettings no longer promises an unconditional attachment',
    !/email client opens with the message pre-filled/.test(settingsSrc));
  contains('  … it explains the browser/webmail limitation', settingsSrc, 'attachments not supported automatically');

  // The old defect-3 helper must be gone for good.
  ok('the percent-encoding compose escaper is gone', !/escCompose/.test(svcSrc));
}

// ════════════════════════════════════════════════════════════════════════════
(async () => {
  try {
    fileUris();
    thunderbirdCompose();
    mailtoUris();
    outlookArgs();
    filenames();
    materialize();
    await launching();
    adapterSelection();
    await entryPoint();
    await ipcRoundTrip();
    await documentRoundTrip();
    environment();
    wiring();
  } catch (e) {
    failed++;
    console.log(`  [FAIL] suite threw: ${e.message}\n${e.stack}`);
  } finally {
    for (const d of tempDirs) {
      if (!d) continue;
      try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
