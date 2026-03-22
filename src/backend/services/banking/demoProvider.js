const db = require('../../models/dbmgr');

module.exports = {
	id: 'demo',
	name: 'Demo (Offline Parsed Statements)',
	async connect(_opts) {
		// No real connection; always succeeds
		return { connected: true };
	},
	async disconnect() { return { disconnected: true }; },
	async listAccounts() {
		// Derive pseudo accounts from parsed_statements banks
		const rows = db.prepare(`SELECT DISTINCT COALESCE(bankName,'Demo Bank') AS bankName FROM parsed_statements`).all();
		return (rows.length ? rows : [{ bankName: 'Demo Bank' }]).map((r, i) => ({
			accountId: `demo-${i+1}`,
			name: `${r.bankName} - Account ${i+1}`,
			balance: null,
			currency: 'USD'
		}));
	},
	async fetchTransactions({ startDate, endDate }) {
		// Map statement_transactions into a bank feed-like shape
		let sql = `SELECT date, description, amount, type, reference FROM statement_transactions WHERE 1=1`;
		const params = [];
		if (startDate) { sql += ` AND date >= ?`; params.push(startDate); }
		if (endDate) { sql += ` AND date <= ?`; params.push(endDate); }
		sql += ` ORDER BY date ASC LIMIT 1000`;
		const rows = db.prepare(sql).all(...params);
		return rows.map(r => ({
			date: r.date,
			description: r.description,
			amount: r.amount,
			type: r.type || (r.amount >= 0 ? 'credit' : 'debit'),
			reference: r.reference || null
		}));
	}
};


