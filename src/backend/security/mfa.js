const crypto = require('crypto');
const db = require('../models/dbmgr');

// Minimal TOTP (RFC 6238) helper without external deps
function base32ToBuffer(base32) {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	let bits = '';
	for (const c of base32.replace(/=+$/,'')) {
		const val = alphabet.indexOf(c.toUpperCase());
		if (val < 0) continue;
		bits += val.toString(2).padStart(5, '0');
	}
	const bytes = [];
	for (let i = 0; i + 8 <= bits.length; i += 8) {
		bytes.push(parseInt(bits.slice(i, i+8), 2));
	}
	return Buffer.from(bytes);
}

function generateSecretBase32(length = 16) {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	let out = '';
	for (let i = 0; i < length; i++) {
		out += alphabet[Math.floor(Math.random() * alphabet.length)];
	}
	return out;
}

function totpToken(secretBase32, stepSeconds = 30, digits = 6, forTime = Date.now()) {
	const counter = Math.floor(forTime / 1000 / stepSeconds);
	const key = base32ToBuffer(secretBase32);
	const buf = Buffer.alloc(8);
	buf.writeBigUInt64BE(BigInt(counter));
	const hmac = crypto.createHmac('sha1', key).update(buf).digest();
	const offset = hmac[hmac.length - 1] & 0x0f;
	const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).toString().padStart(digits, '0');
	return code;
}

const MFA = {
	ensureColumns() {
		try { db.prepare(`ALTER TABLE users ADD COLUMN mfa_enabled INTEGER DEFAULT 0`).run(); } catch {}
		try { db.prepare(`ALTER TABLE users ADD COLUMN mfa_secret TEXT`).run(); } catch {}
	},
	enableForUser(userId) {
		this.ensureColumns();
		const secret = generateSecretBase32(20);
		db.prepare(`UPDATE users SET mfa_secret=?, mfa_enabled=1 WHERE id=?`).run(secret, userId);
		return { secret };
	},
	disableForUser(userId) {
		this.ensureColumns();
		db.prepare(`UPDATE users SET mfa_secret=NULL, mfa_enabled=0 WHERE id=?`).run(userId);
		return { ok: true };
	},
	getUserMfa(userId) {
		this.ensureColumns();
		const row = db.prepare(`SELECT mfa_enabled as enabled, mfa_secret as secret FROM users WHERE id=?`).get(userId);
		return row || { enabled: 0, secret: null };
	},
	verify(userId, token) {
		const row = this.getUserMfa(userId);
		if (!row || !row.enabled || !row.secret) return { ok: false, error: 'mfa_not_enabled' };
		// Allow small time-window tolerance
		const now = Date.now();
		const valid = [ -1, 0, 1 ].some(offset => {
			const t = now + offset * 30000;
			return totpToken(row.secret, 30, 6, t) === String(token).padStart(6,'0');
		});
		return { ok: valid };
	}
};

module.exports = MFA;


