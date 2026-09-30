// Minimal Salt Edge provider adapter.
// Expects options: { baseUrl, appId, secret, customerSecret, accessToken }
// For production, implement full connection flow to create a customer, connect an account, and obtain access_token.

async function httpGet(url, headers = {}) {
  const fetchFn = (global.fetch ? global.fetch : null) || require('node-fetch');
  const res = await fetchFn(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

function seHeaders(ctx = {}) {
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'App-id': ctx.appId || ctx.clientId || '',
    'Secret': ctx.secret || ''
  };
  if (ctx.customerSecret) headers['Customer-Secret'] = ctx.customerSecret;
  if (ctx.accessToken) headers['Authorization'] = `Bearer ${ctx.accessToken}`;
  return headers;
}

module.exports = {
  id: 'saltedge',
  name: 'SaltEdge',

  async connect(opts = {}) {
    if (!opts.baseUrl || !opts.appId || !opts.secret) {
      return { connected: false, needsConfig: true, message: 'Provide baseUrl, appId, secret (and optionally customerSecret/accessToken)' };
    }
    return { connected: !!opts.accessToken, needsConnection: !opts.accessToken };
  },

  async listAccounts(ctx = {}) {
    const baseUrl = (ctx.baseUrl || '').replace(/\/$/, '');
    if (!baseUrl) return [];
    const url = `${baseUrl}/accounts`;
    const data = await httpGet(url, seHeaders(ctx));
    const accounts = data.data || data.accounts || [];
    return accounts.map(a => ({
      accountId: a.id ? String(a.id) : a.identifier || 'account',
      name: a.name || a.nature || 'Account',
      balance: a.balance ? Number(a.balance) : null,
      currency: a.currency_code || 'USD'
    }));
  },

  async fetchTransactions({ startDate, endDate } = {}, ctx = {}) {
    const baseUrl = (ctx.baseUrl || '').replace(/\/$/, '');
    if (!baseUrl) return [];
    const params = [];
    if (startDate) params.push(`from=${encodeURIComponent(startDate)}`);
    if (endDate) params.push(`to=${encodeURIComponent(endDate)}`);
    const qs = params.length ? `?${params.join('&')}` : '';
    const url = `${baseUrl}/transactions${qs}`;
    const data = await httpGet(url, seHeaders(ctx));
    const txs = data.data || data.transactions || [];
    return txs.map(t => ({
      date: t.made_on || t.booking_date || t.created_at,
      description: t.description || t.merchant_name || '',
      amount: Number(t.amount) || 0,
      type: (t.amount < 0 ? 'debit' : 'credit'),
      reference: t.id ? String(t.id) : undefined
    }));
  }
};
