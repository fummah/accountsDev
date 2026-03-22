const { ipcMain } = require('electron');
const { setContext, clearContext, getContext, checkLoginRateLimit, recordLoginFailure, recordLoginSuccess } = require('../security/authz');
const Users = require('../models/users');
const MFA = require('../security/mfa');
const AuditLog = require('../models/auditLog');

const MAX_LOGIN_ATTEMPTS = 5;

function registerAuthHandlers() {
  ipcMain.handle('auth-set-context', async (event, context) => {
    try {
      setContext(event.sender.id, context || {});
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('auth-clear-context', async (event) => {
    try {
      clearContext(event.sender.id);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('auth-get-context', async (event) => {
    try {
      const ctx = getContext(event);
      return { success: true, context: ctx };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Local login using users table (hashed passwords)
  ipcMain.handle('auth-login-local', async (event, { email, password }) => {
    try {
      if (!email || !password) throw new Error('Email and password are required');
      // Rate limiting check
      const rateCheck = checkLoginRateLimit(email);
      if (!rateCheck.allowed) {
        AuditLog.log({ userId: 'anonymous', action: 'loginBlocked', entityType: 'auth', entityId: email, details: { reason: rateCheck.reason } });
        return { success: false, error: rateCheck.reason };
      }
      const user = Users.findByEmail(email);
      if (!user || !Users.verifyPasswordForUser(user, password)) {
        const failInfo = recordLoginFailure(email);
        AuditLog.log({ userId: 'anonymous', action: 'loginFailed', entityType: 'auth', entityId: email, details: { attempts: failInfo.attempts, locked: failInfo.locked } });
        const remaining = MAX_LOGIN_ATTEMPTS - failInfo.attempts;
        const msg = failInfo.locked ? 'Account temporarily locked due to too many failed attempts' : `Invalid credentials${remaining > 0 ? ` (${remaining} attempts remaining)` : ''}`;
        return { success: false, error: msg };
      }
      recordLoginSuccess(email);
      // If MFA enabled for user, require second step
      const mfa = MFA.getUserMfa(user.id);
      if (mfa && mfa.enabled) {
        setContext(event.sender.id, { mfaPendingUserId: String(user.id) });
        return { success: true, mfaRequired: true, userId: String(user.id) };
      }
      const ctx = {
        userId: String(user.id),
        role: user.role || 'Staff',
        permissions: []
      };
      setContext(event.sender.id, ctx);
      AuditLog.log({ userId: String(user.id), action: 'loginSuccess', entityType: 'auth', entityId: email, details: { role: ctx.role } });
      return { success: true, user: { id: user.id, first_name: user.first_name, last_name: user.last_name, email: user.email, role: ctx.role } };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('auth-logout', async (event) => {
    try {
      clearContext(event.sender.id);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('auth-get-me', async (event) => {
    try {
      const ctx = getContext(event);
      if (!ctx || !ctx.userId) return { success: true, user: null };
      const user = Users.getAllUsers().find(u => String(u.id) === String(ctx.userId));
      if (!user) return { success: true, user: null };
      return { success: true, user: { id: user.id, first_name: user.first_name, last_name: user.last_name, email: user.email, role: user.role } };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // MFA endpoints
  ipcMain.handle('auth-mfa-setup', async (event, { userId }) => {
    try {
      const res = MFA.enableForUser(userId);
      return { success: true, secret: res.secret };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle('auth-mfa-disable', async (_e, { userId }) => {
    try {
      MFA.disableForUser(userId);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle('auth-mfa-verify', async (event, { userId, token }) => {
    try {
      const res = MFA.verify(userId, token);
      if (!res.ok) return { success: false, error: 'invalid_token' };
      // Promote pending context to full session
      const ctx = { userId: String(userId), role: 'Staff', permissions: [] };
      setContext(event.sender.id, ctx);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = registerAuthHandlers;


