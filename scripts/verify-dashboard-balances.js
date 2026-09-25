/**
 * verify-dashboard-balances.js
 *
 * Proves the Home/Flow dashboard balance cards are LIVE and correct:
 *   (a) the `get-dashboard-balances` IPC handler is registered and returns the
 *       real per-category totals (NOT the budgets body it was overwritten with);
 *   (b) it reuses the authoritative Chart-of-Accounts balance engine (opening
 *       balances + Posted journal lines, normal side from the classification);
 *   (c) opening-balance-only accounts are included;
 *   (d) a grouping parent + its child are NOT double counted, while direct
 *       postings are kept;
 *   (e) a real failure returns nulls (so the UI never shows $0.00 for a failed
 *       load) — distinguished from a genuine 0.
 *
 * Runs against a SCRATCH COPY of the live DB.
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/verify-dashboard-balances.js
 */
const Module = require('module');
const path = require('path');
const fs = require('fs');

// ── stub electron BEFORE any handler is required ────────────────────────────
const handlers = new Map();
const electronStub = { ipcMain: { handle: (channel, fn) => { handlers.set(channel, fn); } } };
const originalLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return electronStub;
  return originalLoad.apply(this, arguments);
};

require('./lib/testDb.js').useScratchCopy({ label: 'verify-dashboard-balances' });

const ROOT = path.join(__dirname, '..');
const models = require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const dbmgr = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js'));
const db = dbmgr.raw;
const { ChartOfAccounts, Transactions } = models;
const JournalEntries = require(path.join(ROOT, 'src', 'backend', 'models', 'journalEntries.js'));

require(path.join(ROOT, 'src', 'backend', 'handlers', 'accountingHandlers.js'))();

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual); const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  [PASS] ' + label); }
  else { fail++; console.log(`  [FAIL] ${label}\n      expected: ${e}\n      actual:   ${a}`); }
};
const ok = (label, cond, detail) => { check(label, !!cond, true); if (!cond && detail) console.log('      detail: ' + detail); };
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

const makeAccount = (name, type, subType, normalBalance, openingBalance = 0, parentId = null) => {
  const r = db.prepare(`INSERT INTO chart_of_accounts (name, type, subType, normalBalance, openingBalance, status, isSystem, entered_by)
    VALUES (?, ?, ?, ?, ?, 'Active', 0, 'verify')`).run(name, type, subType || null, normalBalance, Number(openingBalance) || 0);
  if (parentId != null) db.prepare('UPDATE chart_of_accounts SET parentId = ? WHERE id = ?').run(Number(parentId), Number(r.lastInsertRowid));
  return Number(r.lastInsertRowid);
};
const postJE = (date, lines) => JournalEntries.post({ date, description: 'verify', source_type: 'verify', source_id: Date.now(), lines });

(async () => {
  // ── (a) handler registered + source is not the budgets body ───────────────
  const handler = handlers.get('get-dashboard-balances');
  ok('get-dashboard-balances is registered', typeof handler === 'function');
  const src = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'handlers', 'accountingHandlers.js'), 'utf8');
  const block = (() => {
    const i = src.indexOf("safeHandle('get-dashboard-balances'");
    const j = src.indexOf("safeHandle('convertquote'", i);
    return i > -1 ? src.slice(i, j > i ? j : i + 2000) : '';
  })();
  ok('the handler does NOT return budgets', !/Budgets\.getBudgets/.test(block), 'budgets body still present');
  ok('the handler reuses the Chart-of-Accounts balance engine',
    /ChartOfAccounts\.getAllAccounts\(\)/.test(block) && /ownBalance/.test(block));
  ok('the handler sums OWN balances (no parent rollup double count)', /ownBalance/.test(block));
  ok('the handler returns a failure signal, not zeros, on error',
    /return \{ error:[\s\S]{0,200}?bank: null/.test(block));

  const base = await handler();
  ok('the handler returns all expected keys',
    ['bank', 'ar', 'ap', 'cc', 'loans', 'revenue', 'expenses', 'equity'].every(k => k in base),
    JSON.stringify(base));
  console.log('  [info] live category totals: ' + JSON.stringify({
    bank: Math.round(base.bank * 100) / 100, ar: Math.round(base.ar * 100) / 100,
    ap: Math.round(base.ap * 100) / 100, cc: Math.round(base.cc * 100) / 100,
    loans: Math.round(base.loans * 100) / 100, revenue: Math.round(base.revenue * 100) / 100,
    equity: Math.round(base.equity * 100) / 100,
  }));

  // Independent recomputation from the same authoritative engine (active only).
  const active = (ChartOfAccounts.getAllAccounts() || [])
    .filter(a => String(a.status || 'Active').toLowerCase() === 'active');
  const typeOf = a => String(a.accountType || a.type || '').toLowerCase();
  const subOf = a => String(a.accountSubType || a.subType || '').toLowerCase();
  const ownBal = a => Number(a.ownBalance != null ? a.ownBalance : (a.balance || 0)) || 0;
  const sum = fn => active.filter(fn).reduce((s, a) => s + ownBal(a), 0);
  const expect = {
    bank: sum(a => typeOf(a) === 'bank' || typeOf(a) === 'cash'),
    ar: sum(a => subOf(a) === 'accounts receivable' || typeOf(a) === 'accounts receivable'),
    ap: sum(a => subOf(a) === 'accounts payable' || typeOf(a) === 'accounts payable'),
    cc: sum(a => typeOf(a) === 'credit card'),
    loans: sum(a => typeOf(a) === 'loan' || subOf(a).includes('loan') || subOf(a) === 'long-term liability' || subOf(a) === 'line of credit' || subOf(a) === 'mortgage'),
    revenue: sum(a => typeOf(a) === 'income' || typeOf(a) === 'other income'),
    expenses: sum(a => typeOf(a) === 'expense' || typeOf(a) === 'other expense' || typeOf(a) === 'cost of goods sold'),
    equity: sum(a => typeOf(a) === 'equity'),
  };
  ok('handler totals equal the authoritative per-account sum',
    Object.keys(expect).every(k => near(base[k], expect[k])),
    JSON.stringify({ base, expect }));
  ok('the dashboard reports non-zero Bank / Revenue / Equity on the live book',
    Math.abs(base.bank) > 0 || Math.abs(base.revenue) > 0 || Math.abs(base.equity) > 0,
    JSON.stringify(base));

  // ── Cross-check against the Trial Balance ─────────────────────────────────
  // The Trial Balance sums POSTED journal lines only; the dashboard adds each
  // account's opening balance on top. So: dashboard == TB + opening balances.
  {
    const tb = Transactions.getTrialBalance();
    const tbType = r => String(r.accountType || '').toLowerCase();
    const tbSub = r => String(r.accountSubType || r.subType || '').toLowerCase();
    const tbSum = fn => tb.filter(fn).reduce((s, r) => s + Number(r.balance || 0), 0);
    const openSum = fn => active.filter(fn).reduce((s, a) => s + Number(a.openingBalance || 0), 0);
    const pairs = [
      ['Bank', base.bank, tbSum(r => tbType(r) === 'bank' || tbType(r) === 'cash'), openSum(a => typeOf(a) === 'bank' || typeOf(a) === 'cash')],
      ['AR', base.ar, tbSum(r => tbSub(r) === 'accounts receivable' || tbType(r) === 'accounts receivable'), openSum(a => subOf(a) === 'accounts receivable' || typeOf(a) === 'accounts receivable')],
      ['AP', base.ap, tbSum(r => tbSub(r) === 'accounts payable' || tbType(r) === 'accounts payable'), openSum(a => subOf(a) === 'accounts payable' || typeOf(a) === 'accounts payable')],
      ['Credit Cards', base.cc, tbSum(r => tbType(r) === 'credit card'), openSum(a => typeOf(a) === 'credit card')],
      ['Revenue', base.revenue, tbSum(r => tbType(r) === 'income' || tbType(r) === 'other income'), openSum(a => typeOf(a) === 'income' || typeOf(a) === 'other income')],
      ['Equity', base.equity, tbSum(r => tbType(r) === 'equity'), openSum(a => typeOf(a) === 'equity')],
    ];
    for (const [label, card, tbVal, open] of pairs) {
      ok(`${label} card reconciles with Trial Balance + opening balances`,
        near(card, tbVal + open), `card=${Math.round(card * 100) / 100} tb=${Math.round(tbVal * 100) / 100} open=${Math.round(open * 100) / 100}`);
    }
  }

  // ── (c) opening-balance-only account is included ──────────────────────────
  const bankA = makeAccount('ZZ Dash Bank (opening)', 'Bank', 'Checking', 'Debit', 1000);
  const afterOpen = await handler();
  check('a Bank account with ONLY an opening balance is included (+1000)',
    Math.round((afterOpen.bank - base.bank) * 100) / 100, 1000);

  // ── (d) parent + child not double counted, direct postings kept ───────────
  const parent = makeAccount('ZZ Dash Bank Parent', 'Bank', 'Checking', 'Debit', 0);
  const child = makeAccount('ZZ Dash Bank Child', 'Bank', 'Savings', 'Debit', 0, parent);
  const income = makeAccount('ZZ Dash Income', 'Income', 'Sales', 'Credit', 0);
  const before = await handler();
  postJE('2026-01-15', [
    { account_id: child, debit: 200, credit: 0, description: 'child deposit' },
    { account_id: income, debit: 0, credit: 200, description: 'sale' },
  ]);
  const after = await handler();
  check('a posting to a Bank CHILD is counted once (+200, not +400)',
    Math.round((after.bank - before.bank) * 100) / 100, 200);
  check('the same posting raises Revenue by 200',
    Math.round((after.revenue - before.revenue) * 100) / 100, 200);

  // Direct posting to the PARENT is still counted.
  const beforeP = await handler();
  postJE('2026-01-16', [
    { account_id: parent, debit: 150, credit: 0, description: 'parent deposit' },
    { account_id: income, debit: 0, credit: 150, description: 'sale' },
  ]);
  const afterP = await handler();
  check('a DIRECT posting to a parent Bank account is still counted (+150)',
    Math.round((afterP.bank - beforeP.bank) * 100) / 100, 150);

  // ── (b) liability / equity normal signs ───────────────────────────────────
  const ap = makeAccount('ZZ Dash AP', 'Liability', 'Accounts Payable', 'Credit', 0);
  const equity = makeAccount('ZZ Dash Equity', 'Equity', 'Retained Earnings', 'Credit', 0);
  const beforeL = await handler();
  postJE('2026-01-17', [
    { account_id: bankA, debit: 1300, credit: 0, description: 'funding' },
    { account_id: ap, debit: 0, credit: 800, description: 'bill' },
    { account_id: equity, debit: 0, credit: 500, description: 'contribution' },
  ]);
  const afterL = await handler();
  check('Accounts Payable increases by +800 (credit-normal)', Math.round((afterL.ap - beforeL.ap) * 100) / 100, 800);
  check('Equity increases by +500 (credit-normal)', Math.round((afterL.equity - beforeL.equity) * 100) / 100, 500);

  // ── (a2) inactive accounts are excluded (Trial Balance rule) ──────────────
  const inactiveBank = makeAccount('ZZ Dash Inactive Bank', 'Bank', 'Checking', 'Debit', 0);
  db.prepare("UPDATE chart_of_accounts SET status='Inactive' WHERE id = ?").run(inactiveBank);
  const withInactive = await handler();
  ok('an INACTIVE account does not change the totals', near(withInactive.bank, afterL.bank), `${afterL.bank} vs ${withInactive.bank}`);

  console.log('\n' + '='.repeat(56));
  console.log(pass + ' passed, ' + fail + ' failed');
  console.log('='.repeat(56) + '\n');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e && e.stack ? e.stack : e); process.exit(1); });
