const { ipcMain, shell } = require('electron');
const { Settings } = require('../models');
const Email = require('../models/email');
const Invoices = require('../models/invoices');
const Quotes = require('../models/quotes');
const MailClient = require('../services/mailClient');
const EmailErrors = require('../services/emailErrors');
const Secure = require('../services/secureSettings');
const http = require('http');

const PROVIDERS = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: 'https://mail.google.com/',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: true,
  },
  microsoft: {
    authUrl: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token',
    scopes: 'https://outlook.office.com/SMTP.Send offline_access',
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
  },
};

function buildAuthUrl(provider, clientId, redirectUri, tenantId) {
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error(`Unknown provider: ${provider}`);
  let url = cfg.authUrl;
  if (provider === 'microsoft') url = url.replace('{tenant}', tenantId || 'common');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: cfg.scopes,
    access_type: 'offline',
  });
  return `${url}?${params.toString()}`;
}

async function exchangeCode(provider, code, clientId, clientSecret, redirectUri, tenantId) {
  const cfg = PROVIDERS[provider];
  let url = cfg.tokenUrl;
  if (provider === 'microsoft') url = url.replace('{tenant}', tenantId || 'common');
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  };
}

async function refreshAccessToken(provider, refreshToken, clientId, clientSecret, tenantId) {
  const cfg = PROVIDERS[provider];
  let url = cfg.tokenUrl;
  if (provider === 'microsoft') url = url.replace('{tenant}', tenantId || 'common');
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_in: data.expires_in,
  };
}

function registerEmailHandlers() {
  // ── SMTP settings ───────────────────────────────────────────────────
  ipcMain.handle('email-settings-get', async () => {
    try {
      const oauthTokens = Email.getOAuthTokens();
      return {
        host: Settings.get('smtp_host') || '',
        port: parseInt(Settings.get('smtp_port') || '587', 10),
        secure: Settings.get('smtp_secure') === 'true',
        user: Settings.get('smtp_user') || '',
        // NEVER return the stored password to the renderer. The UI only needs to
        // know whether one exists; it sends a new value only when the user types
        // one, and never receives the current one back.
        pass: '',
        pass_set: Secure.hasSecret('smtp_pass'),
        pass_encrypted: Secure.encryptionAvailable(),
        from_name: Settings.get('smtp_from_name') || '',
        from_email: Settings.get('smtp_from_email') || '',
        default_subject: Settings.get('email_default_subject') || 'Invoice from {company}',
        default_body: Settings.get('email_default_body') || 'Please find attached invoice #{number} for {amount}.\n\nThank you for your business.',
        // Document-type / payment-status aware templates. Empty means "use the
        // built-in approved default" (resolved in the shared email service).
        quote_subject: Settings.get('email_quote_subject') || '',
        quote_body: Settings.get('email_quote_body') || '',
        invoice_paid_subject: Settings.get('email_invoice_paid_subject') || '',
        invoice_paid_body: Settings.get('email_invoice_paid_body') || '',
        invoice_outstanding_subject: Settings.get('email_invoice_outstanding_subject') || '',
        invoice_outstanding_body: Settings.get('email_invoice_outstanding_body') || '',
        oauth_provider: Settings.get('oauth_provider') || '',
        oauth_client_id: Settings.get('oauth_client_id') || '',
        oauth_client_secret: Settings.get('oauth_client_secret') || '',
        oauth_tenant_id: Settings.get('oauth_tenant_id') || '',
        oauth_connected: !!oauthTokens,
        oauth_email: oauthTokens?.email || '',
        email_send_method: Settings.get('email_send_method') || 'prompt',
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('email-settings-set', async (_e, cfg) => {
    try {
      if (cfg.host !== undefined) Settings.set('smtp_host', cfg.host);
      if (cfg.port !== undefined) Settings.set('smtp_port', String(cfg.port));
      if (cfg.secure !== undefined) Settings.set('smtp_secure', String(cfg.secure));
      if (cfg.user !== undefined) Settings.set('smtp_user', cfg.user);
      // The password is a SECRET: encrypt it at rest. An empty/omitted value
      // means "keep what is already saved" so re-saving the form (or running a
      // Test) never wipes the stored password. `clear_pass` removes it.
      if (cfg.clear_pass === true) Secure.clearSecret('smtp_pass');
      else if (typeof cfg.pass === 'string' && cfg.pass.length > 0) Secure.setSecret('smtp_pass', cfg.pass);
      if (cfg.from_name !== undefined) Settings.set('smtp_from_name', cfg.from_name);
      if (cfg.from_email !== undefined) Settings.set('smtp_from_email', cfg.from_email);
      if (cfg.default_subject !== undefined) Settings.set('email_default_subject', cfg.default_subject);
      if (cfg.default_body !== undefined) Settings.set('email_default_body', cfg.default_body);
      if (cfg.quote_subject !== undefined) Settings.set('email_quote_subject', cfg.quote_subject);
      if (cfg.quote_body !== undefined) Settings.set('email_quote_body', cfg.quote_body);
      if (cfg.invoice_paid_subject !== undefined) Settings.set('email_invoice_paid_subject', cfg.invoice_paid_subject);
      if (cfg.invoice_paid_body !== undefined) Settings.set('email_invoice_paid_body', cfg.invoice_paid_body);
      if (cfg.invoice_outstanding_subject !== undefined) Settings.set('email_invoice_outstanding_subject', cfg.invoice_outstanding_subject);
      if (cfg.invoice_outstanding_body !== undefined) Settings.set('email_invoice_outstanding_body', cfg.invoice_outstanding_body);
      if (cfg.oauth_provider !== undefined) Settings.set('oauth_provider', cfg.oauth_provider);
      if (cfg.oauth_client_id !== undefined) Settings.set('oauth_client_id', cfg.oauth_client_id);
      if (cfg.oauth_client_secret !== undefined) Settings.set('oauth_client_secret', cfg.oauth_client_secret);
      if (cfg.oauth_tenant_id !== undefined) Settings.set('oauth_tenant_id', cfg.oauth_tenant_id);
      if (cfg.email_send_method !== undefined) Settings.set('email_send_method', cfg.email_send_method);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── Test SMTP connection ────────────────────────────────────────────
  // Validates authentication BEFORE the user relies on Save & Email, and
  // returns a friendly message instead of a raw provider trace. The full error
  // is logged server-side only.
  ipcMain.handle('email-test-connection', async () => {
    try {
      const nodemailer = require('nodemailer');
      const host = Settings.get('smtp_host');
      const port = parseInt(Settings.get('smtp_port') || '587', 10);
      const secure = Settings.get('smtp_secure') === 'true';
      const user = Settings.get('smtp_user');
      const pass = Secure.getSecret('smtp_pass');

      const check = EmailErrors.validateSmtpConfig({ host, port, user, passSet: !!pass });
      if (!check.ok) {
        return { success: false, error: `Email settings are incomplete — missing ${check.missing.join(', ')}.`, needsSettings: true };
      }

      const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
      await transporter.verify();
      return { success: true, message: 'SMTP connection successful.' };
    } catch (e) {
      const t = EmailErrors.translate(e, { host: Settings.get('smtp_host') });
      console.error('[email] SMTP test failed:', t.technical);
      return { success: false, error: t.error, technical: t.technical, code: t.code, needsSettings: t.needsSettings };
    }
  });

  // ── Send email (SMTP or OAuth2) with logging ────────────────────────
  ipcMain.handle('email-send', async (_e, payload) => {
    const { to, subject, body, attachments, cc, bcc, document_type, document_id } = payload || {};
    let status = 'success';
    let errorMsg = null;
    try {
      const nodemailer = require('nodemailer');
      if (!to) return { success: false, error: 'Recipient email required' };

      const fromName = Settings.get('smtp_from_name') || 'Accounts';
      const user = Settings.get('smtp_user');
      const pass = Secure.getSecret('smtp_pass');
      const fromEmail = Settings.get('smtp_from_email') || user;
      const oauthProvider = Settings.get('oauth_provider');
      let transporter;

      if (oauthProvider && Email.getOAuthTokens(oauthProvider)) {
        // ── OAuth2 auth ──
        const tokens = Email.getOAuthTokens(oauthProvider);
        const clientId = Settings.get('oauth_client_id');
        const clientSecret = Settings.get('oauth_client_secret');
        const tenantId = Settings.get('oauth_tenant_id');
        const cfg = PROVIDERS[oauthProvider];
        if (!cfg) throw new Error(`Unknown OAuth provider: ${oauthProvider}`);
        if (!tokens.refresh_token) throw new Error('No refresh token available — re-authorize the provider');

        // Refresh token if expired
        let accessToken = tokens.access_token;
        if (tokens.expiry_date && new Date(tokens.expiry_date) <= new Date()) {
          const refreshed = await refreshAccessToken(oauthProvider, tokens.refresh_token, clientId, clientSecret, tenantId);
          const newExpiry = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString();
          Email.saveOAuthTokens({
            provider: oauthProvider, email: tokens.email,
            client_id: clientId, client_secret: clientSecret, tenant_id: tenantId,
            access_token: refreshed.access_token, refresh_token: refreshed.refresh_token,
            expiry_date: newExpiry,
          });
          accessToken = refreshed.access_token;
        }

        transporter = nodemailer.createTransport({
          host: cfg.smtpHost, port: cfg.smtpPort, secure: cfg.smtpSecure,
          auth: { type: 'OAuth2', user: tokens.email, clientId, clientSecret, refreshToken: tokens.refresh_token, accessToken },
        });
      } else {
        // ── Regular SMTP ──
        const host = Settings.get('smtp_host');
        const port = parseInt(Settings.get('smtp_port') || '587', 10);
        const secure = Settings.get('smtp_secure') === 'true';
        // Validate BEFORE attempting: a missing field must open Settings, not
        // produce a confusing transport error.
        const check = EmailErrors.validateSmtpConfig({ host, port, user, passSet: !!pass });
        if (!check.ok) {
          return {
            success: false,
            error: `Email settings are incomplete — missing ${check.missing.join(', ')}. Open Settings → Email to finish the setup.`,
            needsSettings: true,
            code: 'config',
          };
        }
        transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
      }

      const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to, subject: subject || 'Invoice', text: body || '',
        html: payload.html || undefined,
      };
      if (cc) mailOptions.cc = cc;
      if (bcc) mailOptions.bcc = bcc;
      if (attachments && Array.isArray(attachments)) {
        mailOptions.attachments = attachments.map(a => ({
          filename: a.filename || 'document.pdf',
          content: a.content,
          encoding: a.encoding || 'base64',
          contentType: a.contentType || undefined,
        }));
      }

      const info = await transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (e) {
      status = 'failed';
      // Friendly message to the user, full trace to the log (never the password).
      const t = EmailErrors.translate(e, { host: Settings.get('smtp_host') });
      errorMsg = t.technical;
      console.error('[email] send failed:', t.technical);
      return { success: false, error: t.error, technical: t.technical, code: t.code, needsSettings: t.needsSettings };
    } finally {
      try {
        Email.logSend({ recipient: to, subject, status, error_message: errorMsg, document_type, document_id });
      } catch {}
    }
  });

  // ── Email log ─────────────────────────────────────────────────────
  ipcMain.handle('email-log-list', async () => {
    try { return Email.getLogs(); }
    catch (e) { return { error: e.message }; }
  });

  // ── OAuth: start flow ────────────────────────────────────────────
  ipcMain.handle('email-oauth-start', async (_e, { provider, clientId, clientSecret, tenantId }) => {
    try {
      const tokens = await new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
          const url = new URL(req.url, 'http://localhost');
          const code = url.searchParams.get('code');
          const err = url.searchParams.get('error');
          if (err) { res.writeHead(400); res.end(`Error: ${err}`); server.close(); reject(new Error(err)); return; }
          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#f0f2f5;"><div style="text-align:center;padding:40px;background:white;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);"><h1 style="color:#52c41a;">&#10003; Connected!</h1><p>You can close this window now.</p></div></body></html>');
            server.close();
            exchangeCode(provider, code, clientId, clientSecret, `http://localhost:${server.address().port}/callback`, tenantId)
              .then(resolve).catch(reject);
          } else {
            res.writeHead(400); res.end('No code received'); server.close();
            reject(new Error('No authorization code received'));
          }
        });
        const timeout = setTimeout(() => { server.close(); reject(new Error('OAuth timeout — no response received within 5 minutes')); }, 300000);
        server.on('close', () => clearTimeout(timeout));
        server.listen(0, () => {
          const port = server.address().port;
          const redirectUri = `http://localhost:${port}/callback`;
          const authUrl = buildAuthUrl(provider, clientId, redirectUri, tenantId);
          shell.openExternal(authUrl).catch(() => {});
        });
      });

      const expiryDate = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
      const tokenEmail = provider === 'microsoft' ? (Settings.get('smtp_user') || '') : (Settings.get('smtp_user') || '');
      Email.saveOAuthTokens({
        provider, email: tokenEmail, client_id: clientId, client_secret: clientSecret, tenant_id: tenantId,
        access_token: tokens.access_token, refresh_token: tokens.refresh_token, expiry_date: expiryDate,
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── OAuth: status ────────────────────────────────────────────────
  ipcMain.handle('email-oauth-status', async (_e, provider) => {
    try {
      const tokens = Email.getOAuthTokens(provider);
      if (!tokens) return { connected: false };
      const expired = tokens.expiry_date && new Date(tokens.expiry_date) <= new Date();
      return { connected: true, email: tokens.email, expired, provider: tokens.provider };
    } catch (e) {
      return { connected: false, error: e.message };
    }
  });

  // ── OAuth: revoke ────────────────────────────────────────────────
  ipcMain.handle('email-oauth-revoke', async (_e, provider) => {
    try {
      Email.deleteOAuthTokens(provider);
      Settings.set('oauth_provider', '');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── Send via default email program (opens a compose/write window) ──
  //
  // All client-specific knowledge lives in services/mailClient.js. This handler
  // only adapts the IPC payload and records the outcome. It reports `success`
  // strictly from what the OS told us — a client that fails to start is a
  // failure, not a success with a warning.
  ipcMain.handle('email-send-external', async (_e, payload) => {
    const { to, subject, body, pdfFilename, pdfBase64, document_type, document_id, requireAttachment } = payload || {};
    try {
      if (!to) return { success: false, error: 'Recipient email required' };
      if (!pdfBase64) return { success: false, error: 'Missing PDF data — save the document first' };

      const attachments = pdfBase64
        ? [{ filename: pdfFilename || 'document.pdf', content: pdfBase64 }]
        : [];

      const result = await MailClient.sendViaDefaultMailClient({
        to, subject: subject || 'Document', body: body || '', attachments,
        // Save/Update & Email requires the document attachment: never open an
        // attachment-less draft, fall back to the built-in sender instead.
        requireAttachment: requireAttachment === true,
      });

      if (!result.ok) {
        try {
          Email.logSend({ recipient: to, subject, status: 'failed', error_message: result.error, document_type, document_id });
        } catch {}
        return {
          success: false,
          error: result.error,
          method: result.method,
          client: result.client,
          launched: !!result.launched,
          clientReady: !!result.clientReady,
          attached: false,
          canAttach: result.canAttach,
          fallback: result.fallback || null,
          guarantee: 'none',
          attachmentPath: result.attachmentPath,
          // Present when we deliberately did not launch (known-unusable client),
          // so the UI can show the fuller explanation rather than just the error.
          warning: result.warning || null,
        };
      }

      // The draft opened in the user's own mail client — AccuLedger did NOT send
      // it, so the document is recorded as an externally-opened DRAFT, never as
      // Sent. Marking it Sent here would falsify the communication history.
      Email.logSend({ recipient: to, subject, status: 'opened', error_message: null, document_type, document_id });

      try {
        if (document_type === 'Invoice' && document_id) Invoices.markInvoiceSent(document_id, 'External Email', 'Draft opened externally');
        else if (document_type === 'Quote' && document_id) Quotes.markQuoteSent(document_id, 'External Email', 'Draft opened externally');
      } catch {}

      return {
        success: true,
        method: result.method,
        client: result.client,
        exe: result.exe || null,
        launched: !!result.launched,
        clientReady: !!result.clientReady,
        attached: !!result.attached,
        guarantee: result.guarantee || 'none',
        attachmentPath: result.attachmentPath || null,
        warning: result.warning || null,
      };
    } catch (e) {
      try { Email.logSend({ recipient: to, subject, status: 'failed', error_message: e.message, document_type, document_id }); } catch {}
      return { success: false, error: e.message };
    }
  });

  // ── What will actually happen if the user picks "Default Email Program" ──
  // Lets the UI warn BEFORE the user sends, instead of reporting a false
  // success afterwards. Never throws.
  ipcMain.handle('email-mail-client-info', async () => {
    try {
      const clients = MailClient.detectMailClients();
      const adapter = MailClient.chooseAdapter(clients);
      // Attachment capability is a property of the client integration: Outlook
      // and Thunderbird compose with an attachment; a generic mailto handler
      // cannot. It is NOT gated on the (unreliable) mail-profile probe — that is
      // what wrongly classified Outlook as unable to attach.
      const canAttach = adapter.kind === 'outlook' || adapter.kind === 'thunderbird'
        || !!(clients.outlook && clients.outlook.installed)
        || !!(clients.thunderbird && clients.thunderbird.installed);
      const clientReady = adapter.clientReady === true;
      // False only when the client IS installed but its mail account could not
      // be determined — we must not then assert "no account".
      const profileKnown = adapter.profileKnown !== false;

      // One sentence the UI can show verbatim, so the user is never promised
      // something the chosen client cannot do.
      const clientName = adapter.kind === 'outlook' ? 'Microsoft Outlook'
        : adapter.kind === 'thunderbird' ? 'Mozilla Thunderbird' : null;
      // Label the handler the OS will ACTUALLY open — never the registered
      // default mail client, which is a different registry key and may name a
      // program that is never launched (they disagree on this very machine).
      const handlerLabel = MailClient.mailHandlerLabel(clients);
      let note;
      if (adapter.kind === 'unusable-client') {
        // The handler IS a desktop client, but one we positively know has no
        // mail account. Saying "cannot attach files" would be the wrong reason.
        const dead = adapter.clientKind === 'outlook' ? 'Microsoft Outlook' : 'Mozilla Thunderbird';
        note = `${dead} is the mail handler but has no email account set up, so it cannot open a message window. Set up an account in ${dead}, or use built-in email.`;
      } else if (!canAttach) {
        note = `Your email will open in ${handlerLabel}, which cannot attach files, so the PDF would have to be attached by hand. Built-in email is recommended.`;
      } else if (!clientReady && !profileKnown) {
        note = `Could not check whether ${clientName} has an email account set up, so the attachment cannot be guaranteed. Built-in email sends it as a real attachment.`;
      } else if (!clientReady) {
        note = `${clientName} is installed but has no email account set up, so it cannot open a message window. Set up an account in ${clientName}, or use built-in email.`;
      } else {
        note = `${clientName} is ready — the PDF will be attached automatically.`;
      }

      return {
        success: true,
        platform: clients.platform,
        progId: clients.progId,
        progIdKind: clients.progIdKind,
        defaultClientName: clients.defaultClientName,
        registeredClients: clients.registeredClients,
        registryReadable: clients.registryReadable !== false,
        outlook: clients.outlook,
        thunderbird: clients.thunderbird,
        adapter: { kind: adapter.kind, exe: adapter.exe || null, substituted: !!adapter.substituted, reason: adapter.reason || null },
        canAttach,
        clientReady,
        profileKnown,
        note,
      };
    } catch (e) {
      return { success: false, error: e.message, canAttach: false, adapter: { kind: 'unknown' } };
    }
  });

  // ── Mark invoice/quote as sent ──────────────────────────────────
  ipcMain.handle('email-mark-sent', async (_e, { document_type, document_id, method, status }) => {
    try {
      if (document_type === 'Invoice') Invoices.markInvoiceSent(document_id, method || 'Built-in', status || 'Sent');
      else if (document_type === 'Quote') Quotes.markQuoteSent(document_id, method || 'Built-in', status || 'Sent');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = registerEmailHandlers;
