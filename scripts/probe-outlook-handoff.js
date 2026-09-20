/**
 * probe-outlook-handoff.js — prove the DEFAULT EMAIL PROGRAM handoff now uses
 * the attachment-capable native switch, WITHOUT launching a client.
 *
 * It injects `launch` and `openUri` so nothing opens; it records the exact argv
 * that would be handed to Outlook/Thunderbird and asserts the PDF path is in it.
 *
 *   node scripts/probe-outlook-handoff.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const MailClient = require('../src/backend/services/mailClient.js');

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'utf8');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'acculedger-handoff-'));

const launched = [];
const launch = async (exe, args) => { launched.push({ exe, args }); return { ok: true, exitedImmediately: false }; };
const openUri = async (uri) => { launched.push({ uri }); };

(async () => {
  const clients = MailClient.detectMailClients();
  const adapter = MailClient.chooseAdapter(clients);

  const result = await MailClient.sendViaDefaultMailClient({
    to: 'customer@example.com',
    subject: 'Quote from TF Diva Solutions',
    body: 'Dear Customer,\n\nPlease find your quote attached.',
    attachments: [{ filename: 'Quote_QUO-08014.pdf', content: PDF.toString('base64') }],
  }, { launch, openUri, tmpRoot });

  const att = result.attachmentPath;
  const exists = att ? fs.existsSync(att) : false;
  const size = exists ? fs.statSync(att).size : 0;

  console.log('');
  console.log('adapter            ', `${adapter.kind} (${adapter.reason})`);
  console.log('canAttach          ', adapter.kind === 'outlook' || adapter.kind === 'thunderbird');
  console.log('ok                 ', result.ok);
  console.log('method             ', result.method);
  console.log('attached           ', result.attached);
  console.log('guarantee          ', result.guarantee);
  console.log('attachmentPath     ', att);
  console.log('  exists / size    ', `${exists} / ${size}`);
  console.log('launched argv      ', JSON.stringify(launched[0] || null));
  console.log('warning            ', result.warning || '(none)');
  console.log('error              ', result.error || '(none)');
  console.log('');

  const args = (launched[0] && launched[0].args) || [];
  const problems = [];
  if (!(adapter.kind === 'outlook' || adapter.kind === 'thunderbird')) problems.push('no attachment-capable adapter chosen');
  if (!result.attached) problems.push('result.attached is not true');
  if (!exists || size <= 0) problems.push('attachment file missing/empty');
  if (!args.some((a) => String(a).includes(att))) problems.push('attachment path not present in the launch argv');
  if (adapter.kind === 'outlook' && !args.includes('/a')) problems.push('Outlook argv is missing the /a attachment switch');

  if (problems.length) { console.log('PROBLEMS:\n  - ' + problems.join('\n  - ')); process.exitCode = 1; }
  else console.log('handoff ok — attachment-capable argv built, nothing launched');

  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
})();
