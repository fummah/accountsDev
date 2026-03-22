const db = require('./dbmgr');

const BankRules = {
	createTable() {
		db.prepare(`
			CREATE TABLE IF NOT EXISTS bank_rules (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT,
				description_contains TEXT,     -- substring to match on description
				min_amount REAL,               -- optional
				max_amount REAL,               -- optional
				type TEXT,                     -- debit|credit|null
				category TEXT,                 -- e.g. 'Utilities'
				accountId INTEGER,             -- optional link to COA account
				createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
				updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
	},
	list() {
		return db.prepare(`SELECT * FROM bank_rules ORDER BY createdAt DESC`).all();
	},
	save(rule) {
		if (rule.id) {
			return db.prepare(`
				UPDATE bank_rules SET name=?, description_contains=?, min_amount=?, max_amount=?, type=?, category=?, accountId=?, updatedAt=datetime('now')
				WHERE id=?
			`).run(rule.name || null, rule.description_contains || null, rule.min_amount ?? null, rule.max_amount ?? null, rule.type || null, rule.category || null, rule.accountId ?? null, rule.id);
		}
		return db.prepare(`
			INSERT INTO bank_rules (name, description_contains, min_amount, max_amount, type, category, accountId)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`).run(rule.name || null, rule.description_contains || null, rule.min_amount ?? null, rule.max_amount ?? null, rule.type || null, rule.category || null, rule.accountId ?? null);
	},
	delete(id) {
		return db.prepare(`DELETE FROM bank_rules WHERE id=?`).run(id);
	},
	applyToTransactions(transactions = []) {
		const rules = this.list();
		return transactions.map(tx => {
			const match = rules.find(r => {
				if (r.type && r.type.toLowerCase() !== String(tx.type || '').toLowerCase()) return false;
				if (r.description_contains && !String(tx.description || '').toLowerCase().includes(String(r.description_contains).toLowerCase())) return false;
				if (r.min_amount != null && Math.abs(tx.amount) < Number(r.min_amount)) return false;
				if (r.max_amount != null && Math.abs(tx.amount) > Number(r.max_amount)) return false;
				return true;
			});
			return {
				...tx,
				matchedRuleId: match ? match.id : null,
				matchedCategory: match ? match.category : null,
				matchedAccountId: match ? match.accountId : null
			};
		});
	}
};

BankRules.createTable();

module.exports = BankRules;


