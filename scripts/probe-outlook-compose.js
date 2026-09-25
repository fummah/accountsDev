/**
 * probe-outlook-compose.js — drive the REAL handoff once on THIS machine and
 * record exactly what the OS did with it.
 *
 * This is not a regression suite (that is scripts/verify-mail-client.js). It is
 * the one test that needs the actual desktop: it reads the real registry, picks
 * the real adapter, builds a real PDF, and reports where the PDF went and what
 * URI (if any) was handed to the OS.
 *
 * WHY IT INJECTS openUri
 *   Electron's `shell.openExternal` only exists in the main process. Under
 *   ELECTRON_RUN_AS_NODE=1 `require('electron')` resolves to the binary path, so
 *   `shell` is undefined and the mailto branch would throw — which looks like
 *   "no default mail program is configured" when in fact nothing was tried.
 *   The probe therefore injects an openUri that (a) always RECORDS the URI so
 *   the recipient/subject/body encoding can be inspected, and (b) only really
 *   opens it when --open is passed, so a diagnostic run does not pop windows.
 *
 * WHERE THE PDF LANDS
 *   A successful handoff never copies the PDF anywhere — the temp file is what
 *   the client opens. A copy is only made when the attachment could NOT be
 *   handed over, and it goes to ACCULEDGER_MANUAL_ATTACH_DIR (defaulted here to
 *   .workbuddy-ai/tmp/manual-attach so a probe run does not litter the user's
 *   real Downloads folder). Pass --real-downloads to exercise the production
 *   destination instead.
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe \
 *     scripts/probe-outlook-compose.js [--force=outlook|thunderbird|mailto|auto]
 *                                       [--open] [--hold=20000] [--real-downloads]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
const flag = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const has = (name) => args.includes(`--${name}`);

const FORCE = String(flag('force', 'auto')).toLowerCase();
const REALLY_OPEN = has('open');
const HOLD_MS = Number(flag('hold', '0')) || 0;

const PDF = Buffer.from(
  '%PDF-1.4\n'
  + '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
  + '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'
  + '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] >>\nendobj\n'
  + 'trailer\n<< /Root 1 0 R >>\n%%EOF\n',
  'utf8'
);

// ── where a manual-attach copy would go ─────────────────────────────────────
const SCRATCH_ATTACH = path.join(__dirname, '..', '.workbuddy-ai', 'tmp', 'manual-attach');
if (has('real-downloads')) {
  delete process.env.ACCULEDGER_MANUAL_ATTACH_DIR;
} else {
  fs.mkdirSync(SCRATCH_ATTACH, { recursive: true });
  process.env.ACCULEDGER_MANUAL_ATTACH_DIR = SCRATCH_ATTACH;
}

if (FORCE && FORCE !== 'auto') process.env.ACCULEDGER_MAIL_CLIENT = FORCE;

const MailClient = require('../src/backend/services/mailClient.js');

// ── a faithful stand-in for shell.openExternal ──────────────────────────────
const openedUris = [];
let openError = null;
const openUri = async (uri) => {
  openedUris.push(uri);
  if (!REALLY_OPEN) return;
  const { execFile } = require('child_process');
  const cmd = process.platform === 'win32'
    ? { exe: 'cmd', argv: ['/c', 'start', '', uri] }
    : { exe: process.platform === 'darwin' ? 'open' : 'xdg-open', argv: [uri] };
  await new Promise((resolve, reject) => {
    execFile(cmd.exe, cmd.argv, { windowsHide: true }, (err) => (err ? reject(err) : resolve()));
  });
};

const MESSAGE = {
  to: 'accueledger.probe@example.com',
  subject: 'AccuLedger probe — Invoice INV-PROBE-001',
  body: [
    'Dear Test Customer,',
    '',
    'Please find invoice INV-PROBE-001 attached.',
    'Line two after a blank line — and an apostrophe: we\'re ready.',
    '',
    'Regards,',
    'AccuLedger probe',
  ].join('\n'),
  attachments: [{ filename: 'Invoice_INV-PROBE-001.pdf', content: PDF.toString('base64') }],
};

(async () => {
  const clients = MailClient.detectMailClients();
  const adapter = MailClient.chooseAdapter(clients);

  let result;
  try {
    result = await MailClient.sendViaDefaultMailClient(MESSAGE, { openUri });
  } catch (e) {
    openError = e.message;
    result = { ok: false, error: `threw: ${e.message}` };
  }

  const msg = MailClient.normalizeMessage(MESSAGE);
  const report = {
    when: new Date().toISOString(),
    node: process.version,
    electronRunAsNode: process.env.ELECTRON_RUN_AS_NODE === '1',
    forced: FORCE,
    reallyOpened: REALLY_OPEN,
    platform: clients.platform,
    progId: clients.progId,
    progIdKind: clients.progIdKind,
    defaultClientName: clients.defaultClientName,
    defaultClientKind: clients.defaultClientKind,
    registeredClients: clients.registeredClients,
    registryReadable: clients.registryReadable,
    outlook: clients.outlook,
    thunderbird: clients.thunderbird,
    adapter,
    // What the OS would have been handed, byte for byte.
    mailtoUri: MailClient.buildMailtoUri(msg),
    openedUris,
    openError,
    // The exact argv a desktop client would receive, when one was chosen.
    argv: adapter.kind === 'outlook'
      ? MailClient.buildOutlookArgs(msg, { attachmentPaths: [path.join(SCRATCH_ATTACH, 'Invoice_INV-PROBE-001.pdf')] })
      : adapter.kind === 'thunderbird'
        ? ['-compose', MailClient.buildThunderbirdCompose(msg, { attachmentPaths: [path.join(SCRATCH_ATTACH, 'Invoice_INV-PROBE-001.pdf')] })]
        : null,
    manualAttachDir: process.env.ACCULEDGER_MANUAL_ATTACH_DIR || path.join(os.homedir(), 'Downloads'),
    result,
    bodyText: MESSAGE.body,
  };

  const outDir = path.join(__dirname, '..', '.workbuddy-ai', 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, 'mail-handoff-probe.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');

  const line = (k, v) => console.log(`${k.padEnd(20)} ${v}`);
  console.log('');
  line('forced', FORCE);
  line('mailto ProgId', `${JSON.stringify(clients.progId)} (${clients.progIdKind})`);
  line('registered client', `${JSON.stringify(clients.defaultClientName)} (${clients.defaultClientKind})`);
  line('Outlook', clients.outlook.installed
    ? `${clients.outlook.exe}  account=${clients.outlook.mailProfilePresent} known=${clients.outlook.profileKnown}`
    : 'not installed');
  line('Thunderbird', clients.thunderbird.installed
    ? `${clients.thunderbird.exe}  account=${clients.thunderbird.mailProfilePresent} known=${clients.thunderbird.profileKnown}`
    : 'not installed');
  console.log('  ─────────────────────────────────────────────');
  line('adapter', `${adapter.kind}  (${adapter.reason})`);
  line('clientReady', adapter.clientReady);
  line('ok', result.ok);
  line('method', result.method);
  line('attached', result.attached);
  line('guarantee', result.guarantee);
  line('exe', result.exe);
  line('attachmentPath', result.attachmentPath);
  line('uri handed to OS', openedUris.length ? openedUris[0] : '(none — no mailto adapter)');
  line('really opened', REALLY_OPEN);
  if (openError) line('openError', openError);
  if (result.warning) line('warning', result.warning);
  if (result.error) line('error', result.error);
  line('report', out);
  console.log('');

  // --hold=<ms>: keep this process alive so an external observer can inspect
  // the compose window. Without it, a supervisor that kills the process tree
  // takes the freshly launched client down with it, which looks like the client
  // "exited immediately" when in fact it never got the chance to run.
  if (HOLD_MS > 0) {
    console.log(`holding for ${HOLD_MS} ms so the compose window can be inspected…`);
    await new Promise((r) => setTimeout(r, HOLD_MS));
    console.log('hold finished');
  }
})();
