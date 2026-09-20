/**
 * verify-email-workflow.js — the delivery-method contract:
 *
 *   • the two methods are independent and never silently override each other
 *   • raw SMTP errors are translated, never shown
 *   • the SMTP password is not returned to the renderer and is stored encrypted
 *   • an externally-opened draft is NOT recorded as Sent
 *
 * Runs against a SCRATCH COPY (scripts/lib/testDb.js). The live DB is untouched.
 */
const path = require('path');
const fs = require('fs');
const Module = require('module');

// ── stub electron BEFORE any handler module is required ─────────────────────
const handlers = new Map();
const electronStub = {
  ipcMain: { handle: (channel, fn) => { handlers.set(channel, fn); } },
  shell: { openExternal: async () => {} },
};
const originalLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return electronStub;
  return originalLoad.apply(this, arguments);
};

const realLog = console.log.bind(console);
console.log = () => {};
require('./lib/testDb.js').useScratchCopy({ label: 'verify-email-workflow' });

const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
require(path.join(ROOT, 'src', 'backend', 'handlers', 'emailHandlers.js'))();
console.log = realLog;

const EmailErrors = require(path.join(ROOT, 'src', 'backend', 'services', 'emailErrors.js'));
const Secure = require(path.join(ROOT, 'src', 'backend', 'services', 'secureSettings.js'));

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};
const contains = (name, hay, needle) => check(name, String(hay).includes(needle), `missing ${JSON.stringify(needle)}`);

(async () => {
  const H = (n) => handlers.get(n);
  const ev = { sender: { id: 'verify-email-workflow' } };
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

  console.log('\n1. Error translation — no raw provider traces');
  {
    const gmail = Object.assign(new Error('Invalid login: 535-5.7.8 Username and Password not accepted. For more information, go to https://support.google.com/mail/?p=BadCredentials abc-123 - gsmtp'), { responseCode: 535, code: 'EAUTH' });
    const t = EmailErrors.translate(gmail, { host: 'smtp.gmail.com' });
    check('535 classifies as an auth error', t.code === 'auth', t.code);
    check('the Gmail message mentions the App Password', /App Password/i.test(t.error), t.error);
    check('the friendly message does NOT contain the raw 535 trace', !/535|gsmtp|BadCredentials/i.test(t.error));
    check('the raw trace is preserved as `technical`', /535/.test(t.technical));
    check('an auth error points at Settings', t.needsSettings === true);

    const conn = EmailErrors.translate(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:465'), { code: 'ECONNECTION' }), { host: 'smtp.example.com' });
    check('connection errors get the connection message', /could not connect/i.test(conn.error), conn.error);
    const tls = EmailErrors.translate(Object.assign(new Error('wrong version number'), { code: 'ESOCKET' }), { host: 'smtp.example.com' });
    check('TLS errors get the security message', /Secure connection/i.test(tls.error), tls.error);
    const rcpt = EmailErrors.translate(Object.assign(new Error('550 5.1.1 recipient address rejected'), { code: 'EENVELOPE' }), {});
    check('recipient errors get the recipient message', /recipient address/i.test(rcpt.error), rcpt.error);

    const v = EmailErrors.validateSmtpConfig({ host: '', port: 0, user: '', passSet: false, from_email: '' });
    check('validation lists every missing field', v.ok === false && v.missing.length >= 4, JSON.stringify(v.missing));
    const okCfg = EmailErrors.validateSmtpConfig({ host: 'smtp.gmail.com', port: 465, user: 'a@b.com', passSet: true, from_email: 'a@b.com' });
    check('a complete config validates', okCfg.ok === true, JSON.stringify(okCfg));
  }

  console.log('\n2. Secure password storage');
  {
    check('secrets are encrypted through safeStorage', /safeStorage\(\)\.encryptString/.test(read('src/backend/services/secureSettings.js')));
    check('legacy plaintext secrets still read', /startsWith\(ENC_PREFIX\)/.test(read('src/backend/services/secureSettings.js')));

    Secure.setSecret('zz_test_secret', 'super-secret-value');
    check('a saved secret round-trips', Secure.getSecret('zz_test_secret') === 'super-secret-value', Secure.getSecret('zz_test_secret'));
    check('hasSecret reflects a saved secret', Secure.hasSecret('zz_test_secret') === true);
    Secure.clearSecret('zz_test_secret');
    check('clearSecret removes it', Secure.hasSecret('zz_test_secret') === false);
  }

  console.log('\n3. Settings handler never leaks the password');
  {
    const get = H('email-settings-get');
    const set = H('email-settings-set');
    await set(ev, { host: 'smtp.gmail.com', port: 465, secure: true, user: 'u@gmail.com', pass: 'app-password-1234', from_name: 'X', from_email: 'u@gmail.com' });
    const cfg = await get(ev);
    check('email-settings-get returns an EMPTY password', cfg.pass === '', JSON.stringify(cfg.pass));
    check('email-settings-get reports pass_set: true', cfg.pass_set === true);
    check('the stored secret is the one that was set', Secure.getSecret('smtp_pass') === 'app-password-1234');

    // Re-saving without touching the password must NOT wipe it.
    await set(ev, { host: 'smtp.gmail.com', port: 465, secure: true, user: 'u@gmail.com' });
    check('an empty password on save keeps the stored secret', Secure.getSecret('smtp_pass') === 'app-password-1234');

    await set(ev, { clear_pass: true });
    check('clear_pass removes the stored secret', Secure.hasSecret('smtp_pass') === false);
  }

  console.log('\n4. Test-connection + send return friendly, actionable errors');
  {
    // No config at all → incomplete, points at Settings, no network attempt.
    await H('email-settings-set')(ev, { host: '', port: 587, secure: false, user: '', clear_pass: true, from_email: '' });
    const test = await H('email-test-connection')(ev);
    check('an unconfigured test fails without a raw trace', test.success === false && /incomplete/i.test(test.error), JSON.stringify(test));
    check('  … and asks the user to open Settings', test.needsSettings === true);

    const send = await H('email-send')(ev, { to: 'a@b.com', subject: 's', body: 'b' });
    check('sending with no SMTP config is blocked (no attempt)', send.success === false && send.needsSettings === true, JSON.stringify(send));
    check('  … with a friendly message', /incomplete|Settings/i.test(send.error), send.error);
  }

  console.log('\n5. Method independence (source contract)');
  {
    const modal = read('src/frontend/src/components/customers/shared/SendEmailModal.js');
    check('the dialog dispatches strictly on the chosen method', /if \(sendMethod === 'builtin'\)/.test(modal));
    check('the external path never auto-hands-off to SMTP', !/return sendBuiltin\(/.test(modal.slice(modal.indexOf('const sendExternal'), modal.indexOf('const handleSend'))));
    check('the fallback is an explicit user choice', /Use AccuLedger Email/.test(modal) && /Open Without Attachment/.test(modal));
    check('no "built-in sender will be used" banner remains', !/built-in email sender is used instead/i.test(modal) && !/The built-in email sender will be used/.test(modal));
    check('the external button does not claim to Send', /Open in Email Program/.test(modal) && !/Send via Default Email Program/.test(modal));
    check('the built-in button says Send Email', /'Send Email'/.test(modal));

    const handlersSrc = read('src/backend/handlers/emailHandlers.js');
    check('external open is recorded as a draft, not Sent', /status:\s*'opened'/.test(handlersSrc) && /Draft opened externally/.test(handlersSrc));
    check('external open does not mark the document Sent', !/markInvoiceSent\(document_id, 'External Email', 'Sent'\)/.test(handlersSrc));
    check('SMTP errors go through the translator', /EmailErrors\.translate/.test(handlersSrc));
    check('the password is read through secureSettings', /Secure\.getSecret\('smtp_pass'\)/.test(handlersSrc));
  }

  console.log('\n6. Email Settings UI');
  {
    const s = read('src/frontend/src/components/settings/EmailSettings.js');
    check('offers the two delivery methods', /Default Email Program/.test(s) && /Built-in Email \(SMTP\)/.test(s));
    check('offers provider presets', /PROVIDER_PRESETS/.test(s) && /smtp\.gmail\.com/.test(s));
    check('Gmail preset is 465 + SSL', /gmail:[\s\S]{0,80}port:\s*465[\s\S]{0,40}secure:\s*true/.test(s));
    check('Outlook preset is 587 + STARTTLS', /outlook:[\s\S]{0,80}port:\s*587[\s\S]{0,40}secure:\s*false/.test(s));
    check('never sends an empty password on save', /if \(!payload\.pass\) delete payload\.pass/.test(s));
    check('can remove the saved password', /clear_pass/.test(s));
    check('shows the detected default email program', /emailMailClientInfo/.test(s));
  }

  console.log('\n7. Default Email Program attaches natively (regression guard)');
  {
    const MailClient = require(path.join(ROOT, 'src', 'backend', 'services', 'mailClient.js'));
    const neither = { installed: false, exe: null, mailProfilePresent: false, profileKnown: true, ready: false };
    // The exact machine shape that regressed: Chrome is the mailto handler, and
    // Outlook is installed but the profile probe says false.
    const clients = {
      progId: 'ChromeHTML', progIdKind: 'browser',
      defaultClientName: 'Microsoft Outlook', defaultClientKind: 'outlook',
      outlook: { installed: true, exe: 'C:\\Office\\OUTLOOK.EXE', mailProfilePresent: false, profileKnown: true, ready: false },
      thunderbird: neither,
    };
    const adapter = MailClient.chooseAdapter(clients);
    check('Outlook is chosen even though the mailto handler is a browser', adapter.kind === 'outlook', adapter.kind);
    check('capability does not depend on the mail-profile probe', adapter.usable === true && adapter.clientReady === false);

    let args = null;
    const res = await MailClient.sendViaDefaultMailClient({
      to: 'customer@example.com', subject: 'Quote from Co', body: 'Dear Customer,',
      attachments: [{ filename: 'Quote_QUO-08014.pdf', content: Buffer.from('%PDF-1.4').toString('base64') }],
    }, { clients, launch: async (exe, a) => { args = a; return { ok: true }; }, openUri: async () => {}, manualAttachDir: path.join(require('os').tmpdir(), 'acculedger-noop') });
    check('the native handoff reports attached:true', res.attached === true, JSON.stringify({ attached: res.attached, warning: res.warning }));
    check('  … via the documented Outlook switch', res.guarantee === 'documented-switch');
    check('  … the argv carries /a', Array.isArray(args) && args.includes('/a'), JSON.stringify(args));
    check('  … and the PDF path', Array.isArray(args) && args.some(x => String(x).includes('Quote_QUO-08014.pdf')), JSON.stringify(args));

    const modal = read('src/frontend/src/components/customers/shared/SendEmailModal.js');
    check('the modal gates on capability, not clientReady', /externalCanAttach = !!\(mailClient && mailClient\.canAttach\)/.test(modal));
    check('  … and the send path uses info.canAttach', /if \(info && info\.canAttach\)/.test(modal));
    check('the false "cannot attach" path is only the generic fallback',
      /This email app cannot attach files automatically/.test(modal) && /Open Without Attachment/.test(modal));

    const handlersSrc = read('src/backend/handlers/emailHandlers.js');
    check('the capability signal counts an installed Outlook/Thunderbird',
      /clients\.outlook && clients\.outlook\.installed/.test(handlersSrc) && /clients\.thunderbird && clients\.thunderbird\.installed/.test(handlersSrc));
    const mailSrc = read('src/backend/services/mailClient.js');
    check('capability is installation-based in chooseAdapter', /usable: !!installed/.test(mailSrc));
    check('there is no launch refusal for a detected-but-unconfigured client',
      !/clientReady === false && adapter\.profileKnown !== false/.test(mailSrc));
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('\nFATAL:', e && e.stack ? e.stack : e);
  process.exit(1);
});
