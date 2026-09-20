/**
 * mailClient.js — hand a composed message (recipient, subject, body,
 * attachments) to the user's desktop mail client.
 *
 * ── WHY THIS MODULE EXISTS ──────────────────────────────────────────────────
 *
 * "Send using default email program" used to be implemented inline in
 * handlers/emailHandlers.js. Three defects, all reproduced before the fix:
 *
 *   1. FALSE SUCCESS. The client was started with `spawn(...).unref()` and no
 *      'error' listener. If the executable was missing, Node raised an
 *      UNCAUGHT exception while the IPC handler had ALREADY returned
 *      `{success:true}`. The UI said "Default email program opened" for a
 *      program that never opened.
 *   2. BROKEN FILE URLS. `fileUri()` did not encode spaces, so
 *      `C:\Users\John Smith\...` became `file:///C:/Users/John Smith/...`.
 *   3. BROKEN ESCAPING. `escCompose()` percent-encoded apostrophes
 *      (`We're` -> `We%27re`) in Thunderbird's -compose string, but
 *      Thunderbird does not percent-decode -compose values, so the recipient
 *      saw `We%27re` literally.
 *
 * On top of that, every mail client takes a DIFFERENT attachment syntax, so
 * the client-specific code cannot live in an Invoice/Quote component:
 *
 *   • Outlook      /c ipm.note /m <addr?subject=&body=> /a <path>
 *                  https://support.microsoft.com/en-us/office/lifecycle/command-line-switches-for-microsoft-office-products
 *   • Thunderbird  -compose "to='..',subject='..',message='file:///..',attachment='file:///..'"
 *                  https://kb.mozillazine.org/Command_line_arguments_(Thunderbird)
 *   • everything else (webmail, Windows Mail, browsers) — mailto:, which
 *     CANNOT carry an attachment at all. RFC 6068 has no attachment field.
 *
 * ── THE ONE ENTRY POINT ────────────────────────────────────────────────────
 *
 *   await sendViaDefaultMailClient({ to, subject, body, attachments })
 *     -> { ok, method, client, exe, attached, attachmentPath,
 *          guarantee, warning, error }
 *
 *   ok: true            the client process actually started. Verified by
 *                       awaiting the child's 'spawn' event, not by assuming.
 *   clientReady         the client is installed AND has a mail account, so it
 *                       can actually open a message window. An installed but
 *                       unconfigured Outlook starts, stays running on its "add
 *                       an account" wizard, and never composes anything —
 *                       which is why liveness alone is not enough.
 *   attached: true      the client was launched with its DOCUMENTED attachment
 *                       switch, is configured, and was still running a moment
 *                       later, so a compose window is expected. It does not
 *                       mean we inspected that window — see `guarantee`.
 *   attached: false     the handoff could not carry the file (mailto client,
 *                       an unconfigured client, a path the client cannot parse,
 *                       or a client that quit instantly). The caller MUST NOT
 *                       show a plain success message in this case. The file is
 *                       copied into the user's Downloads folder and
 *                       `attachmentPath` points at THAT copy, because
 *                       `%TEMP%\acculedger-mail-XXXX\` is not somewhere a person
 *                       can be expected to find.
 *   guarantee           'documented-switch' | 'none'
 *
 * ── WHICH CLIENT GETS CHOSEN (the rule that used to be wrong) ───────────────
 *
 * A desktop client is only chosen when it can actually COMPOSE — see
 * `chooseAdapter`. Preferring any merely-*installed* client over the user's real
 * handler produced a total failure in the field: the handler was a browser
 * (Chrome → Gmail webmail), Outlook was also installed but had no account, so
 * the code substituted Outlook and then refused to launch it. Nothing opened at
 * all, and the error named a program the user had not chosen. The real handler
 * was never tried. When no client can compose we now fall back to the actual
 * mailto: handler and say plainly that the PDF must be attached by hand.
 *
 * Nothing here is allowed to report success for a launch that failed.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

// ── Windows registry probing ────────────────────────────────────────────────
// execFileSync (not execSync with a template string) so registry key names are
// passed as argv and never reach a shell.

function regQuery(key, value) {
  try {
    const args = value ? ['query', key, '/v', value] : ['query', key, '/ve'];
    const out = execFileSync('reg', args, {
      encoding: 'utf8', windowsHide: true, timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const m = out.match(/REG_\w+\s+([^\r\n]*)/);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

/**
 * Sub-key names of a registry key.
 *
 * Returns:
 *   string[]  — the key was read successfully (empty array = key has no sub-keys)
 *   null      — the registry could NOT be read at all (reg.exe missing, blocked,
 *               or timed out). Callers MUST distinguish this from `[]`: "I could
 *               not look" is not the same answer as "there is nothing there",
 *               and conflating them produces a confident, wrong message.
 */
function regSubkeys(key) {
  let out;
  try {
    out = execFileSync('reg', ['query', key], {
      encoding: 'utf8', windowsHide: true, timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (e) {
    // A numeric status means reg.exe RAN and exited non-zero: the key genuinely
    // does not exist, so "no sub-keys" is a real answer.
    if (e && typeof e.status === 'number') return [];
    // Anything else (ENOENT, EACCES, killed/timeout) means we never got to ask.
    return null;
  }
  return out.split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/REG_\w+/.test(l))          // drop value rows
    .filter((l) => l.split('\\').length > key.split('\\').length) // drop header
    .map((l) => l.split('\\').pop().trim())
    .filter(Boolean);
}

const REG_MAILTO_USERCHOICE =
  'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\mailto\\UserChoice';

/**
 * The ProgId that currently handles `mailto:`. This is frequently a BROWSER
 * (e.g. ChromeHTML) even when a real mail client is installed and registered
 * as the OS mail client — which is exactly why we cannot treat it as
 * authoritative on its own.
 */
function mailtoProgId() {
  const fromUserChoice = regQuery(REG_MAILTO_USERCHOICE, 'ProgId');
  if (fromUserChoice) return fromUserChoice;
  return regQuery('HKCR\\mailto\\shell\\open\\command', null) || '';
}

/**
 * Name of the client registered under HKLM/HKCU\SOFTWARE\Clients\Mail.
 * HKCU often holds the literal "(value not set)" — treat that as unset.
 */
function defaultMailClientName() {
  const clean = (v) => (v && !/^\(value not set\)$/i.test(v) && !/^\(default\)$/i.test(v)) ? v : '';
  return clean(regQuery('HKCU\\SOFTWARE\\Clients\\Mail', null))
    || clean(regQuery('HKLM\\SOFTWARE\\Clients\\Mail', null))
    || '';
}

/** 'outlook' | 'thunderbird' | 'windows-mail' | 'browser' | 'unknown' */
function classifyProgId(progId) {
  const p = String(progId || '').toLowerCase();
  if (!p) return 'unknown';
  if (p.includes('outlook') || p.includes('msoffice')) return 'outlook';
  if (p.includes('thunderbird') || p.includes('mozilla')) return 'thunderbird';
  if (p.includes('windowsmail') || p.includes('windows mail')) return 'windows-mail';
  if (p.includes('chrome') || p.includes('firefox') || p.includes('edge') ||
      p.includes('opera') || p.includes('brave') || p.includes('vivaldi') ||
      p.includes('html') || p.includes('safari')) return 'browser';
  return 'unknown';
}

const OUTLOOK_PATHS = [
  'C:\\Program Files\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE',
  'C:\\Program Files (x86)\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE',
  'C:\\Program Files\\Microsoft Office\\Office16\\OUTLOOK.EXE',
  'C:\\Program Files (x86)\\Microsoft Office\\Office16\\OUTLOOK.EXE',
  'C:\\Program Files\\Microsoft Office\\Office15\\OUTLOOK.EXE',
  'C:\\Program Files (x86)\\Microsoft Office\\Office15\\OUTLOOK.EXE',
  'C:\\Program Files\\Microsoft Office\\Office14\\OUTLOOK.EXE',
  'C:\\Program Files (x86)\\Microsoft Office\\Office14\\OUTLOOK.EXE',
];

const THUNDERBIRD_PATHS = [
  'C:\\Program Files\\Mozilla Thunderbird\\thunderbird.exe',
  'C:\\Program Files (x86)\\Mozilla Thunderbird\\thunderbird.exe',
];

const firstExisting = (candidates) => candidates.filter(Boolean).find((p) => fs.existsSync(p)) || null;

/**
 * App Paths values are usually plain REG_SZ paths, but a REG_EXPAND_SZ entry
 * (e.g. `%ProgramFiles%\Microsoft Office\root\Office16\OUTLOOK.EXE`) would
 * never satisfy existsSync as written.
 */
const expandEnv = (v) => String(v || '').replace(/%([^%]+)%/g, (m, name) => {
  const hit = process.env[name] || process.env[name.toUpperCase()];
  return hit === undefined ? m : hit;
});

/**
 * Does Outlook have a usable mail profile?
 *
 * A configured Outlook registers its profile in the Windows MAPI profile store,
 * `HKCU\Software\Microsoft\Windows NT\CurrentVersion\Windows Messaging
 * Subsystem\Profiles\<name>`. An *unconfigured* Outlook still creates
 * `HKCU\Software\Microsoft\Office\16.0\Outlook\Profiles\Outlook` — so that key
 * is NOT a usable signal, and checking it would wrongly report "ready".
 *
 * This matters: with no account, `outlook.exe /c ipm.note` cannot open a
 * message window at all. It sits on the "Add an Email Account" wizard instead.
 * Verified on this machine by screenshotting the desktop mid-handoff.
 *
 * @returns {true|false|null} true = has a profile, false = definitely none,
 *   null = the registry could not be read, so we do not know. Never claim
 *   "no account" from a null — that would be a confident lie.
 */
function outlookMailProfilePresent() {
  const keys = regSubkeys('HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows Messaging Subsystem\\Profiles');
  if (keys === null) return null;
  return keys.length > 0;
}

/** Does Thunderbird have at least one profile with an account in it? */
function thunderbirdMailProfilePresent() {
  try {
    const root = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Thunderbird');
    const ini = path.join(root, 'profiles.ini');
    if (fs.existsSync(ini)) {
      const text = fs.readFileSync(ini, 'utf8');
      if (/^\s*\[Profile\d+\]/m.test(text)) return true;
    }
    const dir = path.join(root, 'Profiles');
    return fs.existsSync(dir) && fs.readdirSync(dir).some((n) => fs.statSync(path.join(dir, n)).isDirectory());
  } catch { return false; }
}

function outlookCandidate() {
  const exe = firstExisting([
    expandEnv(regQuery('HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\OUTLOOK.EXE', null)),
    expandEnv(regQuery('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\OUTLOOK.EXE', null)),
    ...OUTLOOK_PATHS,
  ]);
  const mailProfilePresent = outlookMailProfilePresent();   // true | false | null
  return {
    installed: !!exe,
    exe,
    mailProfilePresent,
    // false when we could not read the registry — the UI must not assert
    // "no email account" in that case.
    profileKnown: mailProfilePresent !== null,
    ready: !!exe && mailProfilePresent === true,
  };
}

function thunderbirdCandidate() {
  const exe = firstExisting([
    expandEnv(regQuery('HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\thunderbird.exe', null)),
    expandEnv(regQuery('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\thunderbird.exe', null)),
    ...THUNDERBIRD_PATHS,
  ]);
  const mailProfilePresent = thunderbirdMailProfilePresent();
  return {
    installed: !!exe,
    exe,
    mailProfilePresent,
    // This one reads the filesystem, so the answer is always knowable.
    profileKnown: true,
    ready: !!exe && mailProfilePresent,
  };
}

/** Everything we know about this machine's mail setup. Never throws. */
function detectMailClients() {
  const progId = mailtoProgId();
  const defaultClientName = defaultMailClientName();
  const name = defaultClientName.toLowerCase();
  const registered = regSubkeys('HKLM\\SOFTWARE\\Clients\\Mail');
  return {
    platform: process.platform,
    progId,
    progIdKind: classifyProgId(progId),
    defaultClientName,
    defaultClientKind: name.includes('outlook') ? 'outlook'
      : (name.includes('thunderbird') || name.includes('mozilla')) ? 'thunderbird'
        : name.includes('windows mail') || name.includes('mail app') ? 'windows-mail'
          : defaultClientName ? 'unknown' : 'none',
    // [] when the key is empty OR unreadable; `registryReadable` tells the two apart.
    registeredClients: registered || [],
    registryReadable: registered !== null,
    outlook: outlookCandidate(),
    thunderbird: thunderbirdCandidate(),
  };
}

// ── message shaping (pure) ──────────────────────────────────────────────────

/** RFC 6068: header fields must not contain CR/LF, and line breaks are %0D%0A. */
const stripCrLf = (v) => String(v == null ? '' : v).replace(/[\r\n]+/g, ' ');

function normalizeMessage({ to, subject, body, attachments } = {}) {
  const recipients = String(to == null ? '' : to)
    .split(/[;,]/)
    .map((s) => s.replace(/\s+/g, ''))
    .filter(Boolean);
  return {
    to: recipients.join(','),
    recipients,
    subject: stripCrLf(subject == null ? '' : subject),
    // Normalise CRLF/CR to LF, then to the wire form for mailto.
    body: String(body == null ? '' : body).replace(/\r\n?/g, '\n'),
    attachments: Array.isArray(attachments) ? attachments.filter(Boolean) : [],
  };
}

/**
 * Percent-encode everything encodeURIComponent leaves alone but a URI must not
 * carry raw: `!'()*`. The apostrophe matters most — Thunderbird's -compose
 * parser ends a field value at the first `'`, and `encodeURIComponent` happily
 * passes it through.
 */
const encodeStrict = (s) => encodeURIComponent(s)
  .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

/**
 * An address in the mailto: path. `@`, `.`, `_`, `-` and `+` are legal path
 * characters and are what every mail handler expects to see literally;
 * `%40` is permitted by RFC 6068 but some handlers show it verbatim.
 */
const encodeAddress = (addr) => String(addr)
  .replace(/[%?#&]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

/**
 * mailto: URI. `?` separates the path from the header, `&` separates headers,
 * and both are literal — so `?` and `&` inside a value must be percent-encoded,
 * which encodeURIComponent does. Line breaks become %0D%0A.
 */
function buildMailtoUri(msg) {
  const q = (s) => encodeStrict(s).replace(/%0A/g, '%0D%0A');
  const params = [];
  if (msg.subject) params.push(`subject=${q(msg.subject)}`);
  if (msg.body) params.push(`body=${q(msg.body)}`);
  return `mailto:${msg.recipients.map(encodeAddress).join(',')}`
    + (params.length ? `?${params.join('&')}` : '');
}

/**
 * file:/// URL with every path segment percent-encoded.
 *
 * The old helper was `'file:///' + p.replace(/\\/g, '/')`, which left spaces
 * raw and produced `file:///C:/Users/John Smith/...` — not a valid URL.
 * Apostrophes need encoding too: Thunderbird terminates a -compose value at
 * the first `'`, so `C:\Users\O'Brien\...` would truncate the field.
 */
function fileUri(p) {
  const normalized = path.resolve(String(p)).replace(/\\/g, '/');

  // UNC: \\server\share\file -> file://server/share/file
  if (normalized.startsWith('//')) {
    const [host, ...segs] = normalized.replace(/^\/+/, '').split('/');
    return `file://${host}/${segs.map(encodeStrict).join('/')}`;
  }

  const segs = normalized.split('/');
  const encoded = segs.map((s, i) => (i === 0 ? s : encodeStrict(s))).join('/');
  return `file:///${encoded}`.replace(/^file:\/\/\/+/, 'file:///');
}

/**
 * Thunderbird cannot escape a single quote inside a -compose value, and it does
 * NOT percent-decode values (bug 900117), so `%27` would reach the reader as
 * literal text. The only safe move is to swap the character. A typographic
 * apostrophe is what a human would have typed anyway.
 */
const tbValue = (v) => String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').replace(/'/g, '\u2019');

/**
 * Thunderbird -compose string.
 *
 * Layout rules that are easy to get wrong:
 *   • double quotes wrap the WHOLE comma-separated list (handled by spawn argv)
 *   • single quotes group the value of one field
 *   • the body is delivered through `message=<file>` (a UTF-8 text file) rather
 *     than `body='...'`, which removes newline-encoding and comma/apostrophe
 *     ambiguity from the longest, most human field entirely
 *   • `attachment` must not be the first field (bug 627999, TB <= 3.1.9)
 */
function buildThunderbirdCompose(msg, { bodyPath, attachmentPaths } = {}) {
  const fields = [
    `to='${tbValue(msg.to)}'`,
    `subject='${tbValue(msg.subject)}'`,
  ];
  if (bodyPath) {
    fields.push('format=text');
    fields.push(`message='${fileUri(bodyPath)}'`);
  }
  const files = (attachmentPaths || []).map((p) => fileUri(p));
  if (files.length) fields.push(`attachment='${files.join(',')}'`);
  return fields.join(',');
}

/**
 * Outlook argv. Microsoft documents the /m value as
 * `user@contoso.com?subject=Test&body=Hello` — `?` before the first header,
 * `&` between headers, and NO `mailto:` prefix.
 */
function buildOutlookArgs(msg, { attachmentPaths } = {}) {
  const q = (s) => encodeURIComponent(s).replace(/%0A/g, '%0D%0A');
  const params = [];
  if (msg.subject) params.push(`subject=${q(msg.subject)}`);
  if (msg.body) params.push(`body=${q(msg.body)}`);
  const mValue = msg.to + (params.length ? `?${params.join('&')}` : '');
  const args = ['/c', 'ipm.note', '/m', mValue];
  for (const p of attachmentPaths || []) args.push('/a', p);
  return args;
}

// ── temp files ──────────────────────────────────────────────────────────────

/**
 * Characters Thunderbird's -compose parser cannot handle inside a path:
 * a comma separates attachments, a single quote ends the value. Neither can be
 * escaped (bug 900117), so a path containing one is not safe to hand over.
 */
const isHandoffSafePath = (p) => !/[,']/.test(String(p || ''));

/** Strip anything that would break a mail client's argument parsing. */
const safeFileStem = (name) => {
  const stem = String(name || 'document')
    .replace(/[\\/:*?"<>|,';]/g, '-')
    .replace(/\.pdf$/i, '')
    .replace(/^[-.]+|[-.]+$/g, '')
    .trim();
  return stem || 'document';
};

/** Remove temp folders from previous sends once they are a day old. */
function sweepOldTempDirs() {
  try {
    const root = os.tmpdir();
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const entry of fs.readdirSync(root)) {
      if (!entry.startsWith('acculedger-mail-')) continue;
      const full = path.join(root, entry);
      try {
        if (fs.statSync(full).mtimeMs < cutoff) fs.rmSync(full, { recursive: true, force: true });
      } catch { /* locked by a mail client — leave it */ }
    }
  } catch { /* %TEMP% unreadable — nothing to sweep */ }
}

/**
 * Write the message body and every attachment into ONE fresh temp folder whose
 * path is safe for the client to parse. Returns
 * `{ dir, bodyPath, attachmentPaths, displayNames }`.
 *
 * The folder is deliberately NOT deleted after launch: the client reads the
 * files asynchronously and may still be loading them. sweepOldTempDirs()
 * clears them on a later send instead.
 */
function materializeOutgoing({ body, attachments, tmpRoot } = {}) {
  sweepOldTempDirs();
  const dir = fs.mkdtempSync(path.join(tmpRoot || os.tmpdir(), 'acculedger-mail-'));

  const bodyPath = path.join(dir, 'body.txt');
  fs.writeFileSync(bodyPath, Buffer.from(String(body == null ? '' : body), 'utf8'));

  const attachmentPaths = [];
  const displayNames = [];
  for (const a of attachments || []) {
    if (!a) continue;
    const name = `${safeFileStem(a.filename || 'document')}.pdf`;
    const target = path.join(dir, name);
    if (a.content != null) {
      fs.writeFileSync(target, Buffer.from(String(a.content), 'base64'), { flag: 'wx' });
    } else if (a.path) {
      fs.copyFileSync(a.path, target);
    } else {
      continue;
    }
    attachmentPaths.push(target);
    displayNames.push(name);
  }
  return { dir, bodyPath, attachmentPaths, displayNames };
}

// ── making a non-attachable PDF findable ────────────────────────────────────

/**
 * The user's Downloads folder, or null.
 *
 * When the handoff cannot carry the file we have to tell the user where it is
 * and ask them to attach it by hand. `%TEMP%\acculedger-mail-XXXX\` is not
 * somewhere a person navigates to, so a manual fallback that points there is
 * barely better than one that points nowhere.
 *
 * Resolution order: `ACCULEDGER_MANUAL_ATTACH_DIR` → Electron's downloads path
 * → `~/Downloads`. The env override exists so tests (and a locked-down
 * deployment) never have to write into the user's real Downloads folder.
 */
function downloadsDir() {
  // An explicit override wins. This exists so the fallback destination is
  // testable (and so a deployment can point it somewhere else) — without it,
  // every verification run would drop a copy into the real Downloads folder.
  const override = process.env.ACCULEDGER_MANUAL_ATTACH_DIR;
  if (override) {
    try { fs.mkdirSync(override, { recursive: true }); return override; } catch { /* fall through */ }
  }
  try {
    const { app } = require('electron');
    const p = app && typeof app.getPath === 'function' ? app.getPath('downloads') : null;
    if (p) { fs.mkdirSync(p, { recursive: true }); return p; }
  } catch { /* not running inside Electron — fall through */ }
  try {
    const guess = path.join(os.homedir(), 'Downloads');
    fs.mkdirSync(guess, { recursive: true });
    return guess;
  } catch { return null; }
}

/**
 * Copy the generated PDF(s) to a place the user can find, and return the new
 * paths. Only called when the attachment could NOT be handed to a client, so a
 * successful send never litters the Downloads folder.
 *
 * `dir` is injectable so tests never write to the real Downloads folder.
 */
function publishForManualAttach(files, dir) {
  if (!files || !Array.isArray(files.attachmentPaths) || !files.attachmentPaths.length) return [];
  const target = dir === undefined ? downloadsDir() : dir;
  if (!target) return [];
  const out = [];
  for (let i = 0; i < files.attachmentPaths.length; i++) {
    const src = files.attachmentPaths[i];
    const name = files.displayNames[i] || path.basename(src);
    try {
      let dest = path.join(target, name);
      // Never clobber a previous copy — an earlier invoice of the same number
      // is more useful intact than overwritten.
      if (fs.existsSync(dest)) {
        const stem = name.replace(/\.pdf$/i, '');
        let n = 2;
        while (fs.existsSync(path.join(target, `${stem} (${n}).pdf`))) n++;
        dest = path.join(target, `${stem} (${n}).pdf`);
      }
      fs.copyFileSync(src, dest);
      out.push(dest);
    } catch { /* folder unwritable — the temp path is still valid */ }
  }
  return out;
}

// ── launching ───────────────────────────────────────────────────────────────

/**
 * Start a detached process and WAIT for the OS to tell us whether it worked.
 *
 * The old code called `.unref()` immediately and returned. With no 'error'
 * listener, a missing executable produced an uncaught ENOENT while the caller
 * had already reported success. Resolving on 'spawn' / 'error' is the whole
 * point of this helper.
 *
 * `settleMs` covers a third case that the first two miss: the executable
 * exists, starts, and then dies at once — a stub, a broken install, or a
 * launcher that hands off and quits. A GUI client cannot show a compose window
 * in a second, so an immediate NON-ZERO exit is reported as a failure rather
 * than a success. A clean (code 0) immediate exit is reported as
 * `exitedImmediately`, because Thunderbird legitimately does exactly that when
 * an instance is already running: it passes the command on and quits.
 */
function launchDetached(exe, args, { settleMs = 1500 } = {}) {
  return new Promise((resolve) => {
    const name = path.basename(String(exe));
    let settled = false;
    let child;
    try {
      child = spawn(exe, args, { detached: true, stdio: 'ignore' });
    } catch (e) {
      resolve({ ok: false, error: `${name} could not be started: ${e.message}` });
      return;
    }

    const settle = (payload) => {
      if (settled) return;
      settled = true;
      try { child.unref(); } catch { /* already gone */ }
      resolve(payload);
    };

    child.once('error', (err) => settle({
      ok: false,
      error: `${name} could not be started: ${err.code || err.message}`,
    }));

    child.once('spawn', () => {
      const pid = child.pid;
      const timer = setTimeout(() => settle({ ok: true, pid }), settleMs);
      child.once('exit', (code, signal) => {
        if (settled) return;
        clearTimeout(timer);
        if (code === 0) {
          settle({ ok: true, pid, exitedImmediately: true, exitCode: 0 });
        } else {
          settle({
            ok: false,
            pid,
            exitCode: code,
            error: `${name} started but exited immediately (${signal ? `signal ${signal}` : `code ${code}`}) without opening a window`,
          });
        }
      });
    });
  });
}

const openExternal = (uri) => {
  const { shell } = require('electron');
  return shell.openExternal(uri);
};

// ── adapter selection ───────────────────────────────────────────────────────

/**
 * Which adapter to use, and why.
 *
 * ── THE RULE THAT MATTERS ──────────────────────────────────────────────────
 * Attachment capability is a property of the CLIENT INTEGRATION, not of whether
 * we happened to detect a mail profile:
 *
 *   Outlook (desktop)  → attachment-compose capable  (`outlook.exe /c ipm.note /a`)
 *   Thunderbird        → attachment-compose capable  (`-compose …,attachment=…`)
 *   anything else      → generic `mailto:` only, no reliable attachment
 *
 * So when a capable desktop client is INSTALLED we choose it — even when the
 * system `mailto:` handler is a browser (Chrome → Gmail webmail is the common
 * case) and even when the mail-profile probe returns false. The probe is
 * unreliable across Office builds and New vs Classic Outlook, and refusing to
 * try is exactly what produced the regression where Outlook was wrongly labelled
 * "cannot attach files". We ATTEMPT the documented attachment switch; if the
 * client genuinely cannot start, that is reported as a real failure.
 *
 * Account state (`ready` / `profileKnown`) is still computed and surfaced to the
 * UI as INFORMATION, but it no longer decides capability.
 *
 * The system's `mailto:` handler still wins when it IS a capable client; if
 * nothing on the machine is capable we hand off to the real `mailto:` handler
 * (recipient/subject/body still beat nothing) and flag that the PDF must be
 * attached by hand.
 */
function chooseAdapter(clients) {
  const forced = String(process.env.ACCULEDGER_MAIL_CLIENT || '').trim().toLowerCase();
  const c = clients || {};
  const candidate = (kind, exe, installed, ready, profileKnown) => ({
    kind,
    exe,
    clientReady: ready === true,
    profileKnown: profileKnown !== false,
    // Capability is INSTALLATION: the client supports attachment compose.
    usable: !!installed,
    installed: !!installed,
  });

  const outlook = candidate('outlook', c.outlook?.exe, c.outlook?.installed, c.outlook?.ready, c.outlook?.profileKnown);
  const thunderbird = candidate('thunderbird', c.thunderbird?.exe, c.thunderbird?.installed, c.thunderbird?.ready, c.thunderbird?.profileKnown);

  if (forced && forced !== 'auto') {
    // An explicit override is honoured even when the client is not ready: the
    // operator asked for it, and the outcome will say what happened.
    if (forced === 'outlook' && c.outlook?.installed) return { ...outlook, reason: 'forced by ACCULEDGER_MAIL_CLIENT' };
    if (forced === 'thunderbird' && c.thunderbird?.installed) return { ...thunderbird, reason: 'forced by ACCULEDGER_MAIL_CLIENT' };
    if (forced === 'mailto') return { kind: 'mailto', clientReady: true, reason: 'forced by ACCULEDGER_MAIL_CLIENT' };
    return { kind: 'unavailable', requested: forced, reason: `ACCULEDGER_MAIL_CLIENT=${forced} but that client is not installed` };
  }

  // 1. The mailto: handler itself, when it is a client that can compose.
  if (c.progIdKind === 'outlook' && outlook.usable) {
    return { ...outlook, reason: 'mailto: handler is Outlook' };
  }
  if (c.progIdKind === 'thunderbird' && thunderbird.usable) {
    return { ...thunderbird, reason: 'mailto: handler is Thunderbird' };
  }

  // 2. The registered default mail client, when it can compose.
  if (c.defaultClientKind === 'outlook' && outlook.usable) {
    return { ...outlook, reason: 'registered default mail client is Outlook' };
  }
  if (c.defaultClientKind === 'thunderbird' && thunderbird.usable) {
    return { ...thunderbird, reason: 'registered default mail client is Thunderbird' };
  }

  // 3. The handler cannot compose (a browser/webmail handler, an unknown
  //    program, or a client we know has no account). Substitute to one that
  //    CAN, so the PDF is genuinely attached.
  const handlerCannotCompose = c.progIdKind !== 'outlook' && c.progIdKind !== 'thunderbird';
  const substituteReason = `mailto: is handled by ${c.progId || 'an unknown program'}, which cannot attach files`;
  if (outlook.usable) return { ...outlook, substituted: true, reason: substituteReason };
  if (thunderbird.usable) return { ...thunderbird, substituted: true, reason: substituteReason };

  // 4. Nothing on this machine can compose a message with an attachment.
  //    If the OS handler is a client we have POSITIVELY established cannot
  //    compose, launching it would only pop its "Add an Email Account" wizard —
  //    a modal interruption from an action that was supposed to send an
  //    invoice. Report it as the dead end it is.
  const handlerIsKnownUnusableClient =
    (c.progIdKind === 'outlook' && c.outlook?.installed && c.outlook?.ready === false && c.outlook?.profileKnown !== false) ||
    (c.progIdKind === 'thunderbird' && c.thunderbird?.installed && c.thunderbird?.ready === false && c.thunderbird?.profileKnown !== false);

  if (handlerIsKnownUnusableClient) {
    const isOutlook = c.progIdKind === 'outlook';
    return {
      kind: 'unusable-client',
      clientKind: isOutlook ? 'outlook' : 'thunderbird',
      exe: isOutlook ? c.outlook?.exe : c.thunderbird?.exe,
      clientReady: false,
      profileKnown: true,
      reason: `${isOutlook ? 'Outlook' : 'Thunderbird'} is the mailto: handler but has no email account set up`,
    };
  }

  // 5. Fall back to the user's REAL handler. It cannot attach, but it can still
  //    open a compose window with the recipient, subject and body — which is
  //    strictly better than opening nothing, provided we say the PDF did not go
  //    along. This is the browser/webmail case.
  return {
    kind: 'mailto',
    clientReady: true,
    reason: handlerCannotCompose
      ? `mailto: is handled by ${c.progId || 'an unknown program'}, which cannot attach files`
      : 'no desktop mail client that can compose a message was found',
  };
}

// ── entry point ─────────────────────────────────────────────────────────────

/**
 * A human label for whatever the OS will ACTUALLY open for a `mailto:` link.
 *
 * This must not be the registered default mail client: that is a different
 * registry key from the `mailto:` handler, and on the machine this was debugged
 * on the two disagreed — `mailto:` went to Chrome (`ChromeHTML`), while the
 * registered client was Microsoft Outlook. Labelling the result "Microsoft
 * Outlook" told the user their draft had opened in a program that was never
 * launched — the same class of untruth as reporting a false success, and the
 * very complaint this module was fixed for.
 *
 * `defaultClientName` is therefore deliberately NOT used here.
 */
function mailHandlerLabel(clients) {
  const c = clients || {};
  if (c.progIdKind === 'browser') return 'your web browser';
  if (c.progIdKind === 'windows-mail') return 'Windows Mail';
  if (c.progIdKind === 'outlook') return 'Microsoft Outlook';
  if (c.progIdKind === 'thunderbird') return 'Mozilla Thunderbird';
  // An unrecognised handler: name the thing the OS will actually invoke, rather
  // than a default client that may never be launched at all.
  return c.progId || 'your default mail handler';
}

/**
 * The client is installed, and we have POSITIVELY established that it cannot
 * compose because it has no mail account.
 *
 * In that case we do NOT launch it. Two reasons, and the second is the serious
 * one:
 *   1. Launching it just pops its "Add an Email Account" wizard at the user —
 *      a modal interruption produced by an action that was supposed to send an
 *      invoice.
 *   2. The caller marks the document as Sent when `ok` is true. Returning a
 *      success here would stamp an invoice "Sent (External Email)" when no
 *      message window ever opened and nothing was sent. That is a false success
 *      written into the database, not merely a misleading toast.
 *
 * Only used when the account state is KNOWN. If it is unknown we still launch —
 * refusing would block a setup that might work perfectly.
 */
function knownUnusableOutcome({ base, adapter, manualPrimary, files, safeFiles, substituteNote, method, client }) {
  const warnings = [];
  if (substituteNote) warnings.push(substituteNote);
  const dropped = files.attachmentPaths.length - safeFiles.length;
  if (dropped) {
    warnings.push(`${dropped} attachment(s) could not be handed over (the file path contains a comma or apostrophe, which the client's command line cannot carry).`);
  }
  warnings.push(`${client} is installed but has no email account set up, so it cannot open a message window. Nothing was opened.`);
  const primary = manualPrimary();
  if (primary) warnings.push(`The PDF was saved to ${primary} — attach it manually, or switch to the built-in email sender.`);

  return {
    ...base,
    ok: false,
    launched: false,
    method,
    client,
    exe: adapter.exe,
    clientReady: false,
    attached: false,
    attachmentPath: primary,
    guarantee: 'none',
    warning: warnings.join(' '),
    error: primary
      ? `${client} is installed but has no email account set up, so no message window could be opened and nothing was sent. `
        + `Set up an account in ${client}, or send with the built-in email sender. The PDF is saved at ${primary}.`
      : `${client} is installed but has no email account set up, so no message window could be opened and nothing was sent. `
        + `Set up an account in ${client}, or send with the built-in email sender.`,
  };
}

/**
 * Turn one launch result into the single honest answer both desktop adapters
 * return. Kept in one place so Outlook and Thunderbird cannot drift apart on
 * what "attached" and "guarantee" mean.
 */
function desktopOutcome({
  base, adapter, res, manualPrimary, files, safeFiles, substituteNote,
  method, client, pathAdvice, extraWarnings = [],
}) {
  if (!res.ok) {
    // We tried and the OS refused — no process was created. The user still
    // needs the PDF, so make it findable rather than leaving it in %TEMP%.
    return {
      ...base,
      launched: false,
      method,
      client,
      exe: adapter.exe,
      attachmentPath: manualPrimary(),
      error: res.error,
    };
  }

  const warnings = [];
  if (substituteNote) warnings.push(substituteNote);
  warnings.push(...extraWarnings);

  const dropped = files.attachmentPaths.length - safeFiles.length;
  if (dropped) {
    warnings.push(`${dropped} attachment(s) could not be handed over (the file path contains a comma or apostrophe, which ${pathAdvice} them).`);
  }

  // The documented attachment switch was handed to a capable client and the
  // process started: the PDF went along. Account-profile state is NOT required
  // for this claim — the switch attaches the file regardless, and gating on the
  // (unreliable) profile probe is what wrongly reported Outlook as unable to
  // attach. The one thing we cannot claim is a launch that died at once.
  const confirmed = safeFiles.length > 0 && !res.exitedImmediately;
  if (res.exitedImmediately) {
    warnings.push(`${client} started and exited immediately, so a compose window could not be confirmed.`);
  }

  // Only publish a findable copy when the file did NOT go along — a successful
  // handoff must not leave a stray PDF in the user's Downloads folder.
  const primary = confirmed ? (files.attachmentPaths[0] || null) : manualPrimary();
  if (!confirmed && primary) {
    warnings.push(`Attach the PDF manually: ${primary}`);
  }

  return {
    ...base,
    ok: true,
    launched: true,
    method,
    client,
    exe: adapter.exe,
    clientReady: !!adapter.clientReady,
    attached: confirmed,
    attachmentPath: primary,
    guarantee: confirmed ? 'documented-switch' : 'none',
    warning: warnings.length ? warnings.join(' ') : null,
  };
}

/**
 * @param {{to:string, subject:string, body:string, attachments?:Array<{filename:string, content?:string, path?:string}>}} message
 * @param {{clients?:object, launch?:Function, openUri?:Function, tmpRoot?:string}} [deps] injectable for tests
 * @returns {Promise<{ok:boolean, method:string, client:string, exe:string|null,
 *                    clientReady:boolean, attached:boolean,
 *                    attachmentPath:string|null,
 *                    guarantee:'documented-switch'|'none', warning:string|null, error:string|null}>}
 */
async function sendViaDefaultMailClient(message, deps = {}) {
  const msg = normalizeMessage(message);
  const launch = deps.launch || launchDetached;
  const openUri = deps.openUri || openExternal;
  const clients = deps.clients || detectMailClients();

  const base = {
    ok: false, launched: false, method: null, client: null, exe: null, clientReady: false,
    attached: false, attachmentPath: null, guarantee: 'none',
    warning: null, error: null,
  };

  // When the caller REQUIRES the attachment (Save/Update & Email), we must never
  // open an attachment-less draft, and must never publish a manual-attach copy
  // to Downloads. The caller falls back to the built-in sender instead.
  const requireAttachment = deps.requireAttachment === true;

  if (msg.recipients.length === 0) {
    return { ...base, error: 'Recipient email required' };
  }

  let files;
  try {
    files = materializeOutgoing({ body: msg.body, attachments: msg.attachments, tmpRoot: deps.tmpRoot });
  } catch (e) {
    return { ...base, error: `Could not write the outgoing files: ${e.message}` };
  }
  const primary = files.attachmentPaths[0] || null;

  // Resolved LAZILY: a findable copy is only made when the attachment could not
  // be handed over, so a successful send never writes into the Downloads folder.
  let manualPaths = null;
  const manualPrimary = () => {
    // A mandatory-attachment flow never drops a duplicate into Downloads.
    if (requireAttachment) return primary;
    if (manualPaths === null) manualPaths = publishForManualAttach(files, deps.manualAttachDir);
    return manualPaths[0] || primary;
  };

  const adapter = chooseAdapter(clients);
  const substituteNote = adapter.substituted
    ? `${adapter.reason}. Used ${adapter.kind === 'outlook' ? 'Microsoft Outlook' : 'Thunderbird'} instead so the PDF can be attached.`
    : null;

  // ── Outlook ───────────────────────────────────────────────────────────────
  if (adapter.kind === 'outlook') {
    const safeFiles = files.attachmentPaths.filter(isHandoffSafePath);
    const res = await launch(adapter.exe, buildOutlookArgs(msg, { attachmentPaths: safeFiles }));
    return desktopOutcome({
      base, adapter, res, manualPrimary, files, safeFiles, substituteNote,
      method: 'outlook-compose',
      client: 'Microsoft Outlook',
      pathAdvice: "Outlook's command line cannot carry",
    });
  }

  // ── Thunderbird ───────────────────────────────────────────────────────────
  if (adapter.kind === 'thunderbird') {
    const safeFiles = files.attachmentPaths.filter(isHandoffSafePath);
    const bodySafe = isHandoffSafePath(files.bodyPath);
    const compose = buildThunderbirdCompose(msg, {
      bodyPath: bodySafe ? files.bodyPath : null,
      attachmentPaths: safeFiles,
    });
    const res = await launch(adapter.exe, ['-compose', compose]);
    return desktopOutcome({
      base, adapter, res, manualPrimary, files, safeFiles, substituteNote,
      method: 'thunderbird-compose',
      client: 'Mozilla Thunderbird',
      pathAdvice: "Thunderbird's -compose string cannot carry",
      extraWarnings: bodySafe ? [] : ['The message body could not be passed on the command line; the compose window opens empty — paste the message in.'],
    });
  }

  // ── the OS handler is a client we know cannot compose ─────────────────────
  // A genuine dead end: the only handler is a client with no mail account, and
  // nothing else on the machine can compose. We do NOT launch it (it would only
  // show its "Add an Email Account" wizard) and we do NOT pretend to have sent.
  if (adapter.kind === 'unusable-client') {
    const isOutlook = adapter.clientKind === 'outlook';
    return knownUnusableOutcome({
      base,
      adapter: { ...adapter, exe: adapter.exe },
      manualPrimary,
      files,
      safeFiles: files.attachmentPaths,
      substituteNote: null,
      method: isOutlook ? 'outlook-compose' : 'thunderbird-compose',
      client: isOutlook ? 'Microsoft Outlook' : 'Mozilla Thunderbird',
    });
  }

  // ── mailto: — cannot carry an attachment ─────────────────────────────────
  if (adapter.kind === 'mailto') {
    const clientLabel = mailHandlerLabel(clients);

    // Mandatory-attachment flow: do NOT open an attachment-less draft. Report a
    // hard failure so the caller can fall back to the built-in sender.
    if (requireAttachment) {
      return {
        ...base,
        method: 'mailto',
        client: clientLabel,
        attached: false,
        canAttach: false,
        fallback: 'builtin',
        error: `${clientLabel} cannot attach files automatically. The PDF must be sent with the built-in email sender instead.`,
      };
    }

    try {
      await openUri(buildMailtoUri(msg));
    } catch (e) {
      return {
        ...base, method: 'mailto', attachmentPath: manualPrimary(),
        error: `No default email program is installed or configured to handle mailto: links (${e.message}). `
          + 'Install a mail client such as Outlook or Thunderbird, or configure the built-in email sender in Settings.',
      };
    }
    // The draft DID open — that part is true and worth saying. What is not true
    // is that the PDF went with it, so the message names the file and where it
    // landed rather than leaving the user to hunt for it in %TEMP%.
    const saved = manualPrimary();
    const bits = [
      `Your email draft has been opened in ${clientLabel} with the recipient, subject and message filled in.`,
      `It cannot attach files automatically from this application, so the PDF was saved to ${saved} — attach it before sending.`,
    ];
    if (files.displayNames.length > 1) bits.push(`(${files.displayNames.length} files were generated.)`);
    bits.push('The built-in email sender can send the PDF as a real attachment if you would rather not attach it by hand.');
    return {
      ...base,
      ok: true,
      method: 'mailto',
      client: clientLabel,
      attached: false,
      attachmentPath: saved,
      guarantee: 'none',
      warning: bits.join(' '),
    };
  }

  // ── forced client that is not installed ──────────────────────────────────
  return { ...base, attachmentPath: manualPrimary(), error: `${adapter.reason}. Install it, or set ACCULEDGER_MAIL_CLIENT=auto.` };
}

module.exports = {
  sendViaDefaultMailClient,
  detectMailClients,
  chooseAdapter,
  // pure helpers — exported so the verification suite can pin their output
  normalizeMessage,
  mailHandlerLabel,
  buildMailtoUri,
  buildThunderbirdCompose,
  buildOutlookArgs,
  fileUri,
  tbValue,
  safeFileStem,
  isHandoffSafePath,
  materializeOutgoing,
  publishForManualAttach,
  downloadsDir,
  launchDetached,
};
