/**
 * services/secureSettings.js — store secrets (the SMTP / app password) ENCRYPTED
 * at rest using Electron's `safeStorage`, which is backed by the OS keystore
 * (DPAPI on Windows, Keychain on macOS, libsecret on Linux).
 *
 * The email settings screen must never write the SMTP password in plaintext into
 * the company database when the OS can protect it. Values written here carry an
 * `enc:v1:` prefix; a value WITHOUT the prefix is a legacy plaintext secret and
 * is returned as-is so existing installs keep working (and are upgraded to
 * encrypted on their next save).
 *
 * This module NEVER throws: failing to encrypt must not stop the user saving
 * their settings. It falls back to plaintext only when the OS keystore is
 * genuinely unavailable (e.g. a headless test process), and logs that fact.
 */

const Settings = require('../models/settings');

const ENC_PREFIX = 'enc:v1:';

const safeStorage = () => {
  try { return require('electron').safeStorage; } catch { return null; }
};

const encryptionAvailable = () => {
  try {
    const s = safeStorage();
    return !!(s && typeof s.isEncryptionAvailable === 'function' && s.isEncryptionAvailable());
  } catch {
    return false;
  }
};

function setSecret(key, plain) {
  const value = String(plain == null ? '' : plain);
  if (!value) return Settings.set(key, '');
  if (encryptionAvailable()) {
    try {
      const buf = safeStorage().encryptString(value);
      return Settings.set(key, ENC_PREFIX + buf.toString('base64'));
    } catch (e) {
      console.error(`[secureSettings] encryption failed for "${key}"; storing unencrypted:`, e.message);
    }
  }
  return Settings.set(key, value);
}

function getSecret(key) {
  const stored = Settings.get(key);
  if (stored == null || stored === '') return '';
  const s = String(stored);
  if (!s.startsWith(ENC_PREFIX)) return s; // legacy plaintext
  try {
    const buf = Buffer.from(s.slice(ENC_PREFIX.length), 'base64');
    return safeStorage().decryptString(buf);
  } catch (e) {
    console.error(`[secureSettings] could not decrypt "${key}":`, e.message);
    return '';
  }
}

const hasSecret = (key) => !!getSecret(key);
const clearSecret = (key) => Settings.set(key, '');

module.exports = { setSecret, getSecret, hasSecret, clearSecret, encryptionAvailable, ENC_PREFIX };
