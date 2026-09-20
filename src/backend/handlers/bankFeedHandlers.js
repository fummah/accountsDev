const { ipcMain } = require('electron');
const Settings = require('../models/settings');
const BankRules = require('../models/bankRules');
const demoProvider = require('../services/banking/demoProvider');
const plaidProvider = require('../services/banking/plaidProvider');

const PROVIDERS = {
	demo: demoProvider,
	plaid: plaidProvider,
	yodlee: { id: 'yodlee', name: 'Yodlee (configure API keys in settings)', connect: async () => ({ connected: false, needsConfig: true }) },
	saltedge: { id: 'saltedge', name: 'SaltEdge (configure API keys in settings)', connect: async () => ({ connected: false, needsConfig: true }) },
};

function getActiveConnection() {
	const cfg = Settings.get('bankFeed.connection') || null;
	if (!cfg || !cfg.providerId) return null;
	const provider = PROVIDERS[cfg.providerId];
	return provider ? { provider, cfg } : null;
}

async function register() {
	ipcMain.handle('bank-providers', async () => {
		const active = Settings.get('bankFeed.connection');
		return Object.values(PROVIDERS).map(p => ({
			id: p.id,
			name: p.name,
			active: active && active.providerId === p.id
		}));
	});

	ipcMain.handle('bank-connect', async (_e, { providerId, options }) => {
		const provider = PROVIDERS[providerId];
		if (!provider) throw new Error('Unknown provider');
		const res = await provider.connect(options || {});
		Settings.set('bankFeed.connection', { providerId, options: options || {}, connectedAt: new Date().toISOString() });
		return res;
	});

	ipcMain.handle('bank-disconnect', async () => {
		const active = getActiveConnection();
		if (active && active.provider.disconnect) await active.provider.disconnect();
		Settings.set('bankFeed.connection', null);
		return { disconnected: true };
	});

	// List accounts from active provider (safe)
	ipcMain.handle('bank-list-accounts', async () => {
		const active = getActiveConnection();
		if (!active) return [];
		const fn = active.provider && active.provider.listAccounts;
		if (typeof fn !== 'function') {
			return [];
		}
		// Some providers accept an options/context argument
		if (fn.length >= 1) {
			return fn((active.cfg && active.cfg.options) ? active.cfg.options : {});
		}
		return fn();
	});

	// Fetch transactions from active provider (safe)
	ipcMain.handle('bank-fetch-transactions', async (_e, { startDate, endDate }) => {
		const active = getActiveConnection();
		if (!active) return { error: 'No active bank feed connection. Connect a provider first.' };
		const fn = active.provider && active.provider.fetchTransactions;
		if (typeof fn !== 'function') return { error: 'Selected provider does not support fetching transactions.' };
		let txs;
		try {
			if (fn.length >= 2) {
				txs = await fn({ startDate, endDate }, (active.cfg && active.cfg.options) ? active.cfg.options : {});
			} else {
				txs = await fn({ startDate, endDate });
			}
		} catch (e) {
			return { error: (e && e.message) ? e.message : String(e) };
		}
		// Apply rules
		return BankRules.applyToTransactions(txs || []);
	});

	// Rules management
	ipcMain.handle('bank-rules-list', async () => BankRules.list());
	ipcMain.handle('bank-rules-save', async (_e, rule) => BankRules.save(rule));
	ipcMain.handle('bank-rules-delete', async (_e, id) => BankRules.delete(id));
	ipcMain.handle('bank-rules-apply', async (_e, transactions) => BankRules.applyToTransactions(transactions || []));

	// Suggest internal matches for reconciliation
	ipcMain.handle('bank-reconcile-suggest', async (_e, { txs = [], windowDays = 3, amountTolerance = 0.01 } = {}) => {
		const db = require('../models/dbmgr');
		const results = [];
		for (const t of txs) {
			const amt = Number(t.amount) || 0;
			const signed = (String(t.type || '').toLowerCase() === 'debit') ? -Math.abs(amt) : Math.abs(amt);
			const date = new Date(t.date || Date.now());
			const start = new Date(date); start.setDate(start.getDate() - Number(windowDays));
			const end = new Date(date); end.setDate(end.getDate() + Number(windowDays));
			const startStr = start.toISOString().slice(0,10);
			const endStr = end.toISOString().slice(0,10);

			const candidates = db.prepare(`
				SELECT id, date, description, IFNULL(debit,0) AS debit, IFNULL(credit,0) AS credit
				FROM transactions
				WHERE date >= ? AND date <= ?
				  AND ABS((debit - credit) - ?) <= ?
				LIMIT 25
			`).all(startStr, endStr, signed, Math.abs(amountTolerance));

			const scored = candidates.map(c => {
				const net = c.debit - c.credit;
				const dateDiff = Math.abs((new Date(c.date) - date) / (1000*60*60*24));
				const desc = String(c.description || '').toLowerCase();
				const feedDesc = String(t.description || '').toLowerCase();
				const textScore = (desc && feedDesc) ? (desc.includes(feedDesc) || feedDesc.includes(desc) ? 1 : 0) : 0;
				const amountScore = Math.max(0, 1 - (Math.abs(net - signed) / Math.max(1, Math.abs(signed))));
				const dateScore = Math.max(0, 1 - (dateDiff / Math.max(1, windowDays)));
				const score = 0.6*amountScore + 0.3*dateScore + 0.1*textScore;
				return { txId: c.id, date: c.date, description: c.description, net, score: Number(score.toFixed(3)) };
			}).sort((a,b)=>b.score-a.score);

			results.push({ feed: t, matches: scored.slice(0,5) });
		}
		return results;
	});

	// Apply best suggestions: reconcile matched transactions against a real
	// reconciliation record (never a bare isReconciled=1 UPDATE). This keeps the
	// audit trail, the reconciliation_transactions junction, and the ability to
	// un-reconcile by deleting the record. Suggestions are grouped per account,
	// and the statement balance is set to the cleared balance so the record
	// balances (difference = 0, no adjustment journal needed).
	ipcMain.handle('bank-apply-suggestions', async (_e, { suggestions = [], minScore = 0.9 } = {}) => {
		try {
			const db = require('../models/dbmgr');
			const Transactions = require('../models/transactions');
			const matchedIds = [];
			for (const s of suggestions) {
				if (!s || !Array.isArray(s.matches) || s.matches.length === 0) continue;
				const best = s.matches[0];
				if (!best || typeof best.txId !== 'number') continue;
				if (typeof best.score === 'number' && best.score < Number(minScore)) continue;
				matchedIds.push(best.txId);
			}
			if (matchedIds.length === 0) return { success: true, updated: 0 };

			// Group the matched transactions by their bank account.
			const placeholders = matchedIds.map(() => '?').join(',');
			const rows = db.prepare(
				`SELECT id, accountId, IFNULL(debit,0) AS debit, IFNULL(credit,0) AS credit
				 FROM transactions WHERE id IN (${placeholders}) AND IFNULL(isReconciled,0) = 0`
			).all(...matchedIds);

			const byAccount = {};
			for (const r of rows) {
				const key = Number(r.accountId) || 0;
				byAccount[key] = byAccount[key] || { txIds: [], movement: 0 };
				byAccount[key].txIds.push(r.id);
				byAccount[key].movement += (Number(r.debit) || 0) - (Number(r.credit) || 0);
			}

			let updated = 0;
			const recDate = new Date().toISOString().slice(0, 10);
			for (const key of Object.keys(byAccount)) {
				const grp = byAccount[key];
				const accountId = Number(key);
				if (!accountId) continue; // skip transactions not linked to an account
				const accountName = db.prepare('SELECT name FROM chart_of_accounts WHERE id = ?').get(accountId)?.name || null;
				// statementBalance = cleared balance => difference 0, no adjustment.
				Transactions.reconcileTransactions({
					accountId,
					accountName,
					statementDate: recDate,
					statementBalance: grp.movement,
					transactions: grp.txIds,
					reconciledBy: 'bank-feed',
				});
				updated += grp.txIds.length;
			}
			const AuditLog = require('../models/auditLog');
			AuditLog.log({ userId: 'system', action: 'bankApplySuggestions', entityType: 'bank', entityId: 'reconcile', details: { updated } });
			return { success: true, updated };
		} catch (e) {
			return { success: false, error: e?.message || String(e) };
		}
	});
}

module.exports = register;


