// Verifies the "Save/Update & Email requires the PDF attachment" behavior.
//   node scripts/verify-email-attachment.js
/* eslint-disable no-console */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend');
const MailClient = require(path.join(ROOT, 'src', 'backend', 'services', 'mailClient.js'));

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`); }
};

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'email-attach-'));
const downloads = path.join(tmpRoot, 'downloads');
fs.mkdirSync(downloads, { recursive: true });
const tmpA = path.join(tmpRoot, 'a'); fs.mkdirSync(tmpA, { recursive: true });
const tmpB = path.join(tmpRoot, 'b'); fs.mkdirSync(tmpB, { recursive: true });
const pdfBase64 = Buffer.from('%PDF-1.4 test invoice').toString('base64');
const message = { to: 'customer@example.com', subject: 'Invoice #INV-1 - Co', body: 'Hi', attachments: [{ filename: 'Invoice_INV-1.pdf', content: pdfBase64 }] };

(async () => {
  // Force the "mailto" adapter (the case that cannot attach).
  process.env.ACCULEDGER_MAIL_CLIENT = 'mailto';

  console.log('\nDefault behavior (no mandatory attachment) - legacy mailto');
  {
    const opened = [];
    const res = await MailClient.sendViaDefaultMailClient(message, {
      openUri: (u) => { opened.push(u); return Promise.resolve(); },
      tmpRoot: tmpA,
      manualAttachDir: downloads,
    });
    check('draft opened (openUri called)', opened.length === 1, opened.length);
    check('reports ok but not attached', res.ok === true && res.attached === false, { ok: res.ok, attached: res.attached });
    check('published a manual-attach copy to Downloads', fs.readdirSync(downloads).length >= 1, fs.readdirSync(downloads));
  }

  console.log('\nrequireAttachment:true - Save/Update & Email');
  {
    const before = fs.readdirSync(downloads).length;
    const opened = [];
    const res = await MailClient.sendViaDefaultMailClient(message, {
      requireAttachment: true,
      openUri: (u) => { opened.push(u); return Promise.resolve(); },
      tmpRoot: tmpB,
      manualAttachDir: downloads,
    });
    check('did NOT open an attachment-less draft', opened.length === 0, opened.length);
    check('reports failure (not ok)', res.ok === false, { ok: res.ok });
    check('does not claim an attachment', res.attached === false);
    check('signals fallback to built-in', res.fallback === 'builtin', res.fallback);
    check('canAttach false', res.canAttach === false);
    check('error is clear and mentions built-in', /built-in/i.test(res.error || ''), res.error);
    check('no duplicate PDF written to Downloads', fs.readdirSync(downloads).length === before, fs.readdirSync(downloads));
  }

  console.log('\nSource wiring');
  {
    const modal = fs.readFileSync(path.join(FE, 'src', 'components', 'customers', 'shared', 'SendEmailModal.js'), 'utf8');
    check('modal asks the client to attach only when it can', /requireAttachment:\s*!!withAttachment/.test(modal));
    check('modal does NOT auto-fall back from external to the built-in sender',
      !/built-in email sender is used instead/i.test(modal) && !/return sendBuiltin\(vals, pdfData\)/.test(modal));
    check('modal offers the explicit choice instead',
      /Use AccuLedger Email/.test(modal) && /Open Without Attachment/.test(modal));
    check('modal dispatches strictly on the selected method', /if \(sendMethod === 'builtin'\)/.test(modal));
    check('modal refuses to send when the PDF is missing',
      /could not be prepared\. The email was not sent/.test(modal));
    check('modal shows the attachment (PaperClip + filename)',
      /PaperClipOutlined/.test(modal) && /pdfAttachment\.filename/.test(modal));
    check('modal still uses the shared PDF renderer', /generateDocumentPDF/.test(modal));
    check('external button is "Open in Email Program" (AccuLedger does not press Send)', /Open in Email Program/.test(modal));
    check('built-in button is "Send Email"', /'Send Email'/.test(modal));
    check('modal does not publish to Downloads for this flow', !/Downloads/.test(modal));

    const handlers = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'handlers', 'emailHandlers.js'), 'utf8');
    check('handler passes requireAttachment through', /requireAttachment:\s*requireAttachment === true/.test(handlers));
    check('built-in email maps contentType on attachments', /contentType:\s*a\.contentType/.test(handlers));
    check('handler returns canAttach/fallback on failure', /canAttach:\s*result\.canAttach/.test(handlers) && /fallback:\s*result\.fallback/.test(handlers));
    check('external open is NOT recorded as Sent',
      /status:\s*'opened'/.test(handlers) && /Draft opened externally/.test(handlers));
    check('SMTP errors are translated, never shown raw', /EmailErrors\.translate/.test(handlers));

    const mc = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'services', 'mailClient.js'), 'utf8');
    check('mailClient has the requireAttachment mailto guard', /if \(requireAttachment\) \{/.test(mc));
  }

  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
