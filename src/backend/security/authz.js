const Users = require('../models/users');

// In-memory auth context per webContents id
const authContextBySenderId = new Map();

// Session timeout tracking: { senderId -> lastActivityTimestamp }
const sessionActivity = new Map();
const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Login rate limiting: { email -> { attempts, lockedUntil } }
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginRateLimit(email) {
  const key = (email || '').toLowerCase().trim();
  const record = loginAttempts.get(key);
  if (!record) return { allowed: true };
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remainingSec = Math.ceil((record.lockedUntil - Date.now()) / 1000);
    return { allowed: false, remainingSec, reason: `Account locked. Try again in ${remainingSec}s` };
  }
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    loginAttempts.delete(key);
    return { allowed: true };
  }
  return { allowed: true };
}

function recordLoginFailure(email) {
  const key = (email || '').toLowerCase().trim();
  const record = loginAttempts.get(key) || { attempts: 0, lockedUntil: null };
  record.attempts += 1;
  if (record.attempts >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
  }
  loginAttempts.set(key, record);
  return { attempts: record.attempts, locked: !!record.lockedUntil };
}

function recordLoginSuccess(email) {
  const key = (email || '').toLowerCase().trim();
  loginAttempts.delete(key);
}

function touchSession(senderId) {
  sessionActivity.set(senderId, Date.now());
}

function isSessionExpired(senderId, timeoutMs) {
  const last = sessionActivity.get(senderId);
  if (!last) return false; // no tracking yet, allow
  const timeout = timeoutMs || DEFAULT_SESSION_TIMEOUT_MS;
  return (Date.now() - last) > timeout;
}

function setContext(senderId, context) {
  authContextBySenderId.set(senderId, sanitizeContext(context));
  touchSession(senderId);
}

function clearContext(senderId) {
  authContextBySenderId.delete(senderId);
  sessionActivity.delete(senderId);
}

function sanitizeContext(context) {
  const c = context || {};
  return {
    userId: c.userId != null ? String(c.userId) : null,
    role: c.role || 'Staff',
    permissions: Array.isArray(c.permissions) ? c.permissions : [],
    mfaPendingUserId: c.mfaPendingUserId || null
  };
}

function getContext(event) {
  const senderId = event && event.sender && event.sender.id;
  if (!senderId) return null;
  const ctx = authContextBySenderId.get(senderId) || null;
  if (ctx && isSessionExpired(senderId)) {
    clearContext(senderId);
    return null;
  }
  if (ctx) touchSession(senderId);
  return ctx;
}

// Basic role -> permissions mapping
const ROLE_PERMISSIONS = {
  Admin: ['*'],
  Manager: [
    'read:*',
    'write:transactions',
    'write:invoices',
    'write:journal',
    'write:reconcile',
    'write:fixed-assets'
  ],
  Staff: ['read:*']
};

function hasPermission(ctx, permission) {
  if (!ctx) return false;
  const effective = new Set([...(ROLE_PERMISSIONS[ctx.role] || []), ...(ctx.permissions || [])]);
  if (effective.has('*')) return true;
  if (effective.has(permission)) return true;
  // wildcard read:* match
  if (permission.startsWith('read:') && effective.has('read:*')) return true;
  return false;
}

function authorize(event, { roles, permissions }) {
  const ctx = getContext(event);
  // Backward-compatible fallback: if no context, allow but log warning
  // Caller should wire setAuthContext after login for enforcement.
  if (!ctx) {
    return { userId: null, role: 'Unknown', permissions: [] };
  }
  if (roles && roles.length && !roles.includes(ctx.role)) {
    throw new Error('Not authorized: insufficient role');
  }
  if (permissions) {
    const reqs = Array.isArray(permissions) ? permissions : [permissions];
    for (const p of reqs) {
      if (!hasPermission(ctx, p)) {
        throw new Error('Not authorized: missing permission');
      }
    }
  }
  return ctx;
}

module.exports = {
  setContext,
  clearContext,
  getContext,
  authorize,
  checkLoginRateLimit,
  recordLoginFailure,
  recordLoginSuccess,
  touchSession,
  isSessionExpired
};


