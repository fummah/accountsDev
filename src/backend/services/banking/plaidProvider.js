// Minimal Plaid provider using HTTPS API calls.
// Expects options: { clientId, secret, accessToken, publicToken, env }
// For real usage, generate a link_token on the server side and exchange public tokens for access tokens.

const PLAID_HOSTS = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com'
};

async function postJson(url, body) {
  const fetchFn = (global.fetch ? global.fetch : null) || require('node-fetch');
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

module.exports = {
  id: 'plaid',
  name: 'Plaid',
  async connect(opts) {
    const env = (opts?.env || 'sandbox');
    const host = PLAID_HOSTS[env] || PLAID_HOSTS.sandbox;
    const client_id = opts?.clientId;
    const secret = opts?.secret;
    let access_token = opts?.accessToken || null;

    if (!client_id || !secret) {
      return { connected: false, needsConfig: true, message: 'Missing clientId/secret' };
    }
    if (!access_token && opts?.publicToken) {
      // Exchange public token for access token
      const data = await postJson(`${host}/item/public_token/exchange`, {
        client_id, secret, public_token: opts.publicToken
      });
      access_token = data.access_token;
    }
    if (!access_token) {
      return { connected: false, needsLink: true, message: 'No access token; provide publicToken from Plaid Link' };
    }
    // Store is handled by caller in Settings
    return { connected: true, accessToken: access_token, env };
  },

  async listAccounts(ctx = {}) {
    const env = (ctx?.env || 'sandbox');
    const host = PLAID_HOSTS[env] || PLAID_HOSTS.sandbox;
    const client_id = ctx?.clientId;
    const secret = ctx?.secret;
    const access_token = ctx?.accessToken;
    if (!client_id || !secret || !access_token) return [];
    const data = await postJson(`${host}/accounts/balance/get`, { client_id, secret, access_token });
    return (data.accounts || []).map(a => ({
      accountId: a.account_id,
      name: `${a.name} (${a.official_name || a.subtype || ''})`,
      balance: a.balances?.current ?? null,
      currency: a.balances?.iso_currency_code || 'USD'
    }));
  },

  async fetchTransactions({ startDate, endDate }, ctx = {}) {
    const env = (ctx?.env || 'sandbox');
    const host = PLAID_HOSTS[env] || PLAID_HOSTS.sandbox;
    const client_id = ctx?.clientId;
    const secret = ctx?.secret;
    const access_token = ctx?.accessToken;
    if (!client_id || !secret || !access_token) return [];
    const data = await postJson(`${host}/transactions/get`, {
      client_id, secret, access_token,
      start_date: startDate || '2020-01-01',
      end_date: endDate || new Date().toISOString().slice(0,10),
      options: { count: 250, offset: 0 }
    });
    const txs = data.transactions || [];
    return txs.map(t => ({
      date: t.date,
      description: t.name,
      amount: t.amount * (t.transaction_type === 'special' ? 1 : 1), // Plaid amounts are positive; map later if needed
      type: (t.amount < 0 ? 'credit' : 'debit'),
      reference: t.transaction_id
    }));
  }
};


