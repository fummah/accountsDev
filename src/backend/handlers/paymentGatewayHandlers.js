const { ipcMain } = require('electron');
const crypto = require('crypto');
const Settings = require('../models/settings');
const PaymentLinks = require('../models/paymentLinks');
const Payments = require('../models/payments');
const db = require('../models/dbmgr');

function randomToken() {
	return crypto.randomBytes(16).toString('hex');
}

async function register() {
	// Config get/set
	ipcMain.handle('pay-config-get', async () => {
		const cfg = Settings.get('payments.config') || {
			provider: 'demo',
			authorizeNet: { apiLoginId: null, transactionKey: null, environment: 'sandbox' },
			tesla: { apiLoginId: null, transactionKey: null, environment: 'sandbox' }
		};
		// mask secrets
		const safe = { ...cfg };
		if (safe.authorizeNet?.transactionKey) safe.authorizeNet = { ...safe.authorizeNet, transactionKey: '••••' };
		if (safe.tesla?.transactionKey) safe.tesla = { ...safe.tesla, transactionKey: '••••' };
		return safe;
	});
	ipcMain.handle('pay-config-set', async (_e, cfg) => {
		Settings.set('payments.config', cfg || {});
		return { ok: true };
	});

	// Create a payment link for an invoice
	ipcMain.handle('pay-link-create', async (_e, { invoiceId, amount }) => {
		const token = randomToken();
		const cfg = Settings.get('payments.config') || { provider: 'demo' };
		const provider = (cfg.provider || 'demo').toString();

		// By default, create a local tokenized link
		let redirectUrl = null;
		let remoteId = null;

		// Authorize.Net or Tesla (Authorize.Net compatible)
		if (provider === 'authorizeNet' || provider === 'tesla') {
			try {
				const { createHostedPaymentLink } = require('../services/payments/authorizeNetProvider');
				// Fetch invoice number to pass through
				let invoiceNumber = String(invoiceId);
				try {
					const row = db.prepare(`SELECT number FROM invoices WHERE id=?`).get(invoiceId);
					if (row && row.number) invoiceNumber = String(row.number);
				} catch {}
				const result = await createHostedPaymentLink({
					amount,
					invoiceNumber,
					description: `Invoice ${invoiceNumber}`
				});
				redirectUrl = result?.redirectUrl || null;
				remoteId = result?.remoteId || null;
			} catch (e) {
				// Fall back to local link if provider failed
				console.error('[payments] authorizeNet/tesla create link failed:', e?.message || e);
			}
		}

		const link = PaymentLinks.create({ invoiceId, amount, provider, token, remoteId, redirectUrl });
		return { token: link.token, provider, redirectUrl };
	});

	// Simulate provider callback to mark invoice paid
	ipcMain.handle('pay-link-complete', async (_e, { token, paymentMethod = 'online' }) => {
		const row = PaymentLinks.getByToken(token);
		if (!row) return { success: false, error: 'invalid_token' };
		PaymentLinks.markPaid(token);
		// record payment and update invoice balance/status
		try {
			db.prepare('BEGIN').run();
			Payments.create({ invoiceId: row.invoiceId, amount: row.amount, paymentMethod, date: new Date().toISOString().slice(0,10) });
			db.prepare(`UPDATE invoices SET balance = MAX(0, COALESCE(balance,0) - ?), status = CASE WHEN MAX(0, COALESCE(balance,0) - ?) <= 0 THEN 'Paid' ELSE status END WHERE id = ?`)
				.run(row.amount, row.amount, row.invoiceId);
			db.prepare('COMMIT').run();
		} catch (e) {
			db.prepare('ROLLBACK').run();
			return { success: false, error: e.message };
		}
		return { success: true };
	});
}

module.exports = register;


