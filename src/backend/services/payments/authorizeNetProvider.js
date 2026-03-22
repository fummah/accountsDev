const Settings = require('../../models/settings');

function getEnvConfig(cfg) {
	const env = (cfg?.environment || 'sandbox').toLowerCase();
	if (env === 'production' || env === 'live') {
		return {
			apiUrl: 'https://api2.authorize.net/xml/v1/request.api',
			hostedUrl: 'https://accept.authorize.net/payment/payment'
		};
	}
	return {
		apiUrl: 'https://apitest.authorize.net/xml/v1/request.api',
		hostedUrl: 'https://test.authorize.net/payment/payment'
	};
}

async function createHostedPaymentLink({ amount, invoiceNumber, returnUrl, cancelUrl, description }) {
	const cfg = Settings.get('payments.config') || {};
	const auth = cfg.authorizeNet || cfg.tesla || {};
	const { apiLoginId, transactionKey, environment } = auth;
	if (!apiLoginId || !transactionKey) {
		throw new Error('Authorize.Net credentials missing (apiLoginId/transactionKey)');
	}
	const { apiUrl, hostedUrl } = getEnvConfig({ environment });
	const body = {
		getHostedPaymentPageRequest: {
			merchantAuthentication: {
				name: apiLoginId,
				transactionKey: transactionKey
			},
			transactionRequest: {
				transactionType: 'authCaptureTransaction',
				amount: Number(amount || 0).toFixed(2),
				order: {
					invoiceNumber: String(invoiceNumber || ''),
					description: description || `Invoice ${invoiceNumber}`
				}
			},
			hostedPaymentSettings: {
				setting: [
					{
						settingName: 'hostedPaymentReturnOptions',
						settingValue: JSON.stringify({
							showReceipt: false,
							url: returnUrl || 'https://return.local/',
							urlText: 'Return',
							cancelUrl: cancelUrl || 'https://cancel.local/',
							cancelUrlText: 'Cancel'
						})
					},
					{
						settingName: 'hostedPaymentPaymentOptions',
						settingValue: JSON.stringify({
							cardCodeRequired: true
						})
					}
				]
			}
		}
	};
	const doFetch = global.fetch || require('node-fetch');
	const res = await doFetch(apiUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		throw new Error(`Authorize.Net request failed (HTTP ${res.status})`);
	}
	const json = await res.json();
	const token = json?.token;
	if (!token) {
		const messages = json?.messages?.message?.map(m => m.text).join('; ') || 'No token';
		throw new Error(`Authorize.Net error: ${messages}`);
	}
	return {
		remoteId: token,
		redirectUrl: `${hostedUrl}?token=${encodeURIComponent(token)}`
	};
}

module.exports = {
	createHostedPaymentLink
};


