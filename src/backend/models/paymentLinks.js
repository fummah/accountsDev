const db = require('./dbmgr');

const PaymentLinks = {
	createTable() {
		db.prepare(`
			CREATE TABLE IF NOT EXISTS payment_links (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				invoiceId INTEGER,
				amount REAL,
				provider TEXT,         -- 'authorizeNet' | 'tesla' | 'demo' | others
				token TEXT UNIQUE,     -- random token to build link
				status TEXT DEFAULT 'pending', -- pending|paid|cancelled
				createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
				paidAt DATETIME,
				remoteId TEXT,         -- provider token/id for hosted checkout
				redirectUrl TEXT,      -- provider hosted payment URL
				FOREIGN KEY (invoiceId) REFERENCES invoices(id)
			)
		`).run();
		// Lightweight migrations for older installs
		try { db.prepare(`ALTER TABLE payment_links ADD COLUMN remoteId TEXT`).run(); } catch {}
		try { db.prepare(`ALTER TABLE payment_links ADD COLUMN redirectUrl TEXT`).run(); } catch {}
	},
	create({ invoiceId, amount, provider, token, remoteId, redirectUrl }) {
		const res = db.prepare(`INSERT INTO payment_links (invoiceId, amount, provider, token, remoteId, redirectUrl) VALUES (?, ?, ?, ?, ?, ?)`)
			.run(invoiceId, amount, provider, token, remoteId || null, redirectUrl || null);
		return { id: res.lastInsertRowid, token };
	},
	getByToken(token) {
		return db.prepare(`SELECT * FROM payment_links WHERE token=?`).get(token);
	},
	markPaid(token) {
		return db.prepare(`UPDATE payment_links SET status='paid', paidAt=datetime('now') WHERE token=?`).run(token);
	}
};

PaymentLinks.createTable();

module.exports = PaymentLinks;


