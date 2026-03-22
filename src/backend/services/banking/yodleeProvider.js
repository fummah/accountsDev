// Minimal Yodlee provider adapter.
// Expects options in Settings bankFeed.connection.options:
// { baseUrl, accessToken } OR more advanced fields if you extend this module.
// For production, implement proper cobrand/user auth flows.

async function httpGet(url, headers = {}) {
  const fetchFn = (global.fetch ? global.fetch : null) || require('node-fetch');
  const res = await fetchFn(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

module.exports = {
  id: 'yodlee',
  name: 'Yodlee',

  async connect(opts = {}) {
    if (!opts.baseUrl || !opts.accessToken) {
      return { connected: false, needsConfig: true, message: 'Provide baseUrl and accessToken for Yodlee' };
    }
    // Simply store; caller persists in Settings
    return { connected: true };
  },

  async listAccounts(ctx = {}) {
    const baseUrl = ctx.baseUrl;
    const token = ctx.accessToken;
    if (!baseUrl || !token) return [];
    // Yodlee typical endpoint: /ysl/accounts
    const url = `${baseUrl.replace(/\\/$/, '')}/ysl/accounts`;
    const data = await httpGet(url, { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' });
    const accounts = data.account || data.accounts || [];
    return accounts.map((a, idx) => ({
      accountId: String(a.id ?? idx + 1),
      name: `${a.accountName || a.nickname || a.providerName || 'Account'}${a.accountType ? ' - ' + a.accountType : ''}`,
      balance: (a.balance && a.balance.amount) ? Number(a.balance.amount) : (a.balance ?? null),
      currency: (a.currency || (a.balance && a.balance.currency)) || 'USD'
    }));
  },

  async fetchTransactions({ startDate, endDate } = {}, ctx = {}) {
    const baseUrl = ctx.baseUrl;
    const token = ctx.accessToken;
    if (!baseUrl || !token) return [];
    const params = [];
    if (startDate) params.push(`fromDate=${encodeURIComponent(startDate)}`);
    if (endDate) params.push(`toDate=${encodeURIComponent(endDate)}`);
    const qs = params.length ? `?${params.join('&')}` : '';
    // Yodlee typical endpoint: /ysl/transactions
    const url = `${baseUrl.replace(/\\/$/, '')}/ysl/transactions${qs}`;
    const data = await httpGet(url, { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' });
    const txs = data.transaction || data.transactions || [];
    return txs.map(t => ({
      date: t.postDate || t.transactionDate || t.date,
      description: t.description && t.description.simple ? t.description.simple : (t.description || t.merchant?.name || ''),
      amount: Number(t.amount && t.amount.amount ? t.amount.amount : t.amount),
      type: (String(t.baseType || '').toLowerCase() === 'credit' || (t.amount < 0)) ? 'credit' : 'debit',
      reference: t.id ? String(t.id) : undefined
    }));
  }
};


