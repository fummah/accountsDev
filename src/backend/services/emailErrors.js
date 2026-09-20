/**
 * services/emailErrors.js — translate raw SMTP/transport failures into short,
 * actionable user messages, while preserving the full technical detail for the
 * log.
 *
 * A renderer must NEVER show a raw provider trace to a user. The classic Gmail
 * failure ("Invalid login: 535-5.7.8 Username and Password not accepted ...
 * gsmtp") means nothing to a bookkeeper and looks like a crash. The full text is
 * still returned as `technical` (and logged by the caller) so support can
 * diagnose it, but the UI shows one sentence and, where useful, a hint.
 */

const AUTH_RE = /invalid login|badcredentials|username and password not accepted|authentication failed|5\.7\.8|invalid credentials|auth(entication)? (error|required)/i;
const TLS_RE = /wrong version number|self[- ]signed|certificate|tls|ssl|esocket|unable to verify|handshake/i;
const CONN_RE = /econnrefused|etimedout|enotfound|ehostunreach|eai_again|connection (closed|timeout|refused)|connect etimedout|getaddrinfo|network is unreachable/i;
const RECIPIENT_RE = /invalid recipient|mailbox unavailable|no such user|user unknown|relay(ing)? denied|evelope|eenvelope|recipient address rejected|5\.1\.1/i;
const SIZE_RE = /message size|too large|attachment|exceeds|5\.2\.3|5\.3\.4/i;

function classify(error) {
  if (!error) return 'unknown';
  const code = Number(error.responseCode) || null;
  const errCode = String(error.code || '').toUpperCase();
  const raw = String(error.response || error.message || error);

  if (code === 535 || code === 534 || code === 530 || code === 454 || errCode === 'EAUTH' || AUTH_RE.test(raw)) return 'auth';
  if (errCode === 'ETLS' || TLS_RE.test(raw)) return 'tls';
  if (['ECONNECTION', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ESOCKET', 'EDNS'].includes(errCode) || CONN_RE.test(raw)) return 'connection';
  if (errCode === 'EENVELOPE' || RECIPIENT_RE.test(raw)) return 'recipient';
  if (SIZE_RE.test(raw)) return 'attachment';
  return 'unknown';
}

/**
 * @param {Error} error  the raw transport error
 * @param {{host?:string}} ctx  context (used to special-case Gmail wording)
 * @returns {{code:string, kind:string, error:string, technical:string, needsSettings:boolean}}
 */
function translate(error, ctx = {}) {
  const kind = classify(error);
  const technical = String((error && (error.response || error.message)) || error || '').trim();
  const isGmail = /gmail/i.test(String(ctx.host || ''));

  switch (kind) {
    case 'auth':
      return {
        code: 'auth', kind, technical, needsSettings: true,
        error: isGmail
          ? 'Gmail rejected the login. Gmail does not accept your normal account password — create a Google App Password (Google Account → Security → 2-Step Verification → App passwords) and enter that in Email Settings.'
          : 'Email login failed. Please check your SMTP username and password in Email Settings.',
      };
    case 'tls':
      return {
        code: 'tls', kind, technical, needsSettings: true,
        error: 'Secure connection to the email server failed. Check the SMTP security setting — port 465 uses SSL/TLS, port 587 uses STARTTLS.',
      };
    case 'connection':
      return {
        code: 'connection', kind, technical, needsSettings: true,
        error: 'AccuLedger could not connect to the email server. Check the SMTP host, port and your internet connection.',
      };
    case 'recipient':
      return {
        code: 'recipient', kind, technical, needsSettings: false,
        error: 'The email server rejected the recipient address. Please check the "To" address and try again.',
      };
    case 'attachment':
      return {
        code: 'attachment', kind, technical, needsSettings: false,
        error: 'The email was rejected because of its size or attachment. Try a smaller attachment or a different mail provider.',
      };
    default:
      return {
        code: 'unknown', kind, technical, needsSettings: true,
        error: 'The email could not be sent. Please check your Email Settings and try again.',
      };
  }
}

/**
 * Validate the SMTP configuration BEFORE attempting to send (Part 10 of the
 * brief). Returns the human names of anything missing so the UI can point at it.
 */
function validateSmtpConfig(cfg = {}) {
  const missing = [];
  if (!String(cfg.host || '').trim()) missing.push('SMTP host');
  if (!Number(cfg.port)) missing.push('SMTP port');
  if (!String(cfg.user || '').trim()) missing.push('username');
  if (!cfg.oauthConnected && !cfg.passSet) missing.push('password / app password');
  if (!String(cfg.from_email || cfg.user || '').trim()) missing.push('from address');
  return { ok: missing.length === 0, missing };
}

module.exports = { classify, translate, validateSmtpConfig };
