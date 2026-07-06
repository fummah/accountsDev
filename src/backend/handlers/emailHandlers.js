const { ipcMain } = require('electron');
const { Settings } = require('../models');

function registerEmailHandlers() {
  // Get SMTP settings
  ipcMain.handle('email-settings-get', async () => {
    try {
      return {
        host: Settings.get('smtp_host') || '',
        port: parseInt(Settings.get('smtp_port') || '587', 10),
        secure: Settings.get('smtp_secure') === 'true',
        user: Settings.get('smtp_user') || '',
        pass: Settings.get('smtp_pass') || '',
        from_name: Settings.get('smtp_from_name') || '',
        from_email: Settings.get('smtp_from_email') || '',
        default_subject: Settings.get('email_default_subject') || 'Invoice from {company}',
        default_body: Settings.get('email_default_body') || 'Please find attached invoice #{number} for {amount}.\n\nThank you for your business.',
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  // Save SMTP settings
  ipcMain.handle('email-settings-set', async (_e, cfg) => {
    try {
      if (cfg.host !== undefined) Settings.set('smtp_host', cfg.host);
      if (cfg.port !== undefined) Settings.set('smtp_port', String(cfg.port));
      if (cfg.secure !== undefined) Settings.set('smtp_secure', String(cfg.secure));
      if (cfg.user !== undefined) Settings.set('smtp_user', cfg.user);
      if (cfg.pass !== undefined) Settings.set('smtp_pass', cfg.pass);
      if (cfg.from_name !== undefined) Settings.set('smtp_from_name', cfg.from_name);
      if (cfg.from_email !== undefined) Settings.set('smtp_from_email', cfg.from_email);
      if (cfg.default_subject !== undefined) Settings.set('email_default_subject', cfg.default_subject);
      if (cfg.default_body !== undefined) Settings.set('email_default_body', cfg.default_body);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Test SMTP connection
  ipcMain.handle('email-test-connection', async (_e) => {
    try {
      const nodemailer = require('nodemailer');
      const host = Settings.get('smtp_host');
      const port = parseInt(Settings.get('smtp_port') || '587', 10);
      const secure = Settings.get('smtp_secure') === 'true';
      const user = Settings.get('smtp_user');
      const pass = Settings.get('smtp_pass');

      if (!host || !user) return { success: false, error: 'SMTP not configured' };

      const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
      await transporter.verify();
      return { success: true, message: 'Connection successful' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Send an email (invoice/quote)
  ipcMain.handle('email-send', async (_e, payload) => {
    try {
      const nodemailer = require('nodemailer');
      const { to, subject, body, attachments, cc, bcc } = payload || {};
      if (!to) return { success: false, error: 'Recipient email required' };

      const host = Settings.get('smtp_host');
      const port = parseInt(Settings.get('smtp_port') || '587', 10);
      const secure = Settings.get('smtp_secure') === 'true';
      const user = Settings.get('smtp_user');
      const pass = Settings.get('smtp_pass');
      const fromName = Settings.get('smtp_from_name') || 'Accounts';
      const fromEmail = Settings.get('smtp_from_email') || user;

      if (!host || !user) return { success: false, error: 'SMTP not configured. Please set up email settings first.' };

      const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });

      const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject: subject || 'Invoice',
        text: body || '',
        html: payload.html || undefined,
      };
      if (cc) mailOptions.cc = cc;
      if (bcc) mailOptions.bcc = bcc;

      // Attachments: expect array of { filename, content (base64), encoding }
      if (attachments && Array.isArray(attachments)) {
        mailOptions.attachments = attachments.map(a => ({
          filename: a.filename || 'document.pdf',
          content: a.content,
          encoding: a.encoding || 'base64',
        }));
      }

      const info = await transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = registerEmailHandlers;
