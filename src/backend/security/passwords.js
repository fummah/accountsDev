const crypto = require('crypto');

const DEFAULT_ITERATIONS = 120000;
const KEYLEN = 64;
const DIGEST = 'sha512';

// Password policy defaults (can be overridden via Settings)
const DEFAULT_POLICY = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecial: true,
  maxLength: 128
};

function validatePasswordPolicy(password, policyOverride) {
  const policy = Object.assign({}, DEFAULT_POLICY, policyOverride || {});
  const errors = [];
  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['Password is required'] };
  }
  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters`);
  }
  if (password.length > policy.maxLength) {
    errors.push(`Password must not exceed ${policy.maxLength} characters`);
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (policy.requireDigit && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one digit');
  }
  if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  return { valid: errors.length === 0, errors };
}

function hashPassword(password, iterations = DEFAULT_ITERATIONS) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.pbkdf2Sync(password, salt, iterations, KEYLEN, DIGEST).toString('hex');
  return `pbkdf2$${iterations}$${salt}$${derived}`;
}

function verifyPassword(password, stored) {
  try {
    if (typeof stored !== 'string') return false;
    if (!stored.startsWith('pbkdf2$')) {
      // Fallback legacy: plaintext match
      return password === stored;
    }
    const parts = stored.split('$');
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const hash = parts[3];
    const derived = crypto.pbkdf2Sync(password, salt, iterations, KEYLEN, DIGEST).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
  } catch {
    return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  DEFAULT_POLICY
};


