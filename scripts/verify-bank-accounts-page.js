/**
 * verify-bank-accounts-page.js
 *
 * The Bank Accounts page must list ONLY real Chart of Accounts Type = Bank
 * accounts (classification is the authority, never the account name), and
 * clicking an account must open the current General Ledger filtered by that
 * account's unique ID.
 */
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
const read = (rel) => fs.readFileSync(path.join(FE, rel), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

// Load the pure ESM frontend account utils (no imports).
const loadPure = (rel, names) => {
  let code = fs.readFileSync(path.join(FE, rel), 'utf8');
  code = code.replace(/^\s*export\s+/gm, '');
  // eslint-disable-next-line no-new-func
  return new Function(`${code}\n;return { ${names.join(', ')} };`)();
};
const { isBankAccount, getBankAccounts } = loadPure('utils/accounts.js', ['isBankAccount', 'getBankAccounts']);

// ── The classification rule ────────────────────────────────────────────────
console.log('\n=== Bank classification is by Type, never by name ===');
const COA = [
  { id: 1, accountName: 'Bank Fees', accountType: 'Expense' },
  { id: 2, accountName: 'Bank Service Charges', accountType: 'Expense' },
  { id: 3, accountName: 'US Bank', accountType: 'Credit Card' },
  { id: 4, accountName: 'Transfer From Savings Account', accountType: 'Other Income' },
  { id: 5, accountName: 'Transfer From savings account', accountType: 'Other Asset' },
  { id: 6, accountName: 'Farm Checking', accountType: 'Bank', balance: 424.93 },
  { id: 7, accountName: 'Ivan & Ruth Peachey', accountType: 'Bank', balance: -2210.00 },
  { id: 8, accountName: 'Savings', accountType: 'Bank', balance: 0 },
  { id: 9, accountName: 'Petty Cash', accountType: 'Cash' },
];
const banks = getBankAccounts(COA);
const ids = banks.map(a => a.id).sort((a, b) => a - b);

check('TEST 1  Bank Fees (Expense) is excluded', !ids.includes(1));
check('TEST 2  Bank Service Charges (Expense) is excluded', !ids.includes(2));
check('TEST 3  US Bank (Credit Card) is excluded', !ids.includes(3));
check('TEST 4  Transfer From Savings (Other Income/Asset) is excluded', !ids.includes(4) && !ids.includes(5));
check('TEST 5  Farm Checking (Bank) is included', ids.includes(6));
check('TEST 6  Savings (Bank) is included despite its name', ids.includes(8));
check('TEST 6b Ivan & Ruth Peachey (Bank) is included', ids.includes(7));
check('Cash accounts are excluded (Type must be Bank)', !ids.includes(9));
check('TEST 7  account count is exactly the 3 Bank accounts', banks.length === 3, String(banks.length));
check('TEST 8  total balance = sum of ONLY the 3 Bank accounts',
  Math.abs(banks.reduce((s, a) => s + Number(a.balance || 0), 0) - (-1785.07)) < 0.005,
  String(banks.reduce((s, a) => s + Number(a.balance || 0), 0)));
check('isBankAccount is driven by accountType, not the name',
  isBankAccount({ accountName: 'Bank Fees', accountType: 'Expense' }) === false &&
  isBankAccount({ accountName: 'Savings', accountType: 'Bank' }) === true);

// ── The page wiring ────────────────────────────────────────────────────────
console.log('\n=== Bank Accounts page wiring ===');
const page = read('components/banking/BankAccounts.js');
check('uses the shared getBankAccounts helper', /getBankAccounts/.test(page) && /from '\.\.\/\.\.\/utils\/accounts'/.test(page));
check('queries the DB server-side for Type = Bank', /getChartOfAccounts\?\.\(\{\s*type:\s*'Bank'\s*\}\)/.test(page));
check('no name-based matching remains (bank/checking/savings in a name)',
  !/n\.includes\('bank'\)/.test(page) && !/n\.includes\('checking'\)/.test(page) &&
  !/n\.includes\('savings'\)/.test(page) && !/name.*includes\('bank'\)/i.test(page));
check('summary totals derive from the filtered bank list',
  /bankAccounts\.reduce/.test(page) && /totalAccounts\s*=\s*bankAccounts\.length/.test(page));
check('transaction count / last activity match by account ID only',
  /String\(t\.accountId\)\s*===\s*String\(accId\)/.test(page) && !/t\.account\).*toLowerCase\(\)\s*===\s*accName/.test(page));

console.log('\n=== Click an account -> current General Ledger, filtered by id ===');
check('account name is a clickable control', /type="link"/.test(page) && /onClick=\{\(\)\s*=>\s*openLedger\(r\.id\)\}/.test(page));
check('navigates to the CURRENT General Ledger route',
  /\/main\/accountant\/general-ledger\?accountId=\$\{accountId\}/.test(page));
check('passes the unique account ID (not the name)', /openLedger\s*=\s*\(accountId\)/.test(page) && !/accountName=\$\{/.test(page));
check('Reconcile opens the selected account (?accountId=)', /\/main\/banking\/reconcile\?accountId=\$\{r\.id\}/.test(page));

const gl = read('components/accountant/GeneralLedger.js');
check('General Ledger reads ?accountId (and legacy ?account)',
  /params\.get\('accountId'\)\s*\|\|\s*params\.get\('account'\)/.test(gl));
check('General Ledger drives its AccountSelect from selectedAccount', /value=\{selectedAccount\}/.test(gl));

const rec = read('components/banking/BankReconciliation.js');
check('Reconciliation reads ?accountId to preselect the account',
  /params\.get\('accountId'\)\s*\|\|\s*params\.get\('account'\)/.test(rec) && /setSelectedAccount\(Number\(id\)\)/.test(rec));
check('Reconciliation still filters to real Bank accounts only',
  /getBankAccounts\(accs\)/.test(rec));

console.log('\n=== Search filter ===');
check('renders a search input', /<Input\.Search/.test(page));
check('has search state', /const \[searchText, setSearchText\] = useState\(''\)/.test(page));
check('filters by name, account number and type (case-insensitive)',
  /filteredAccounts\s*=\s*useMemo/.test(page) &&
  /accountName \|\| ''\)\.toLowerCase\(\)\.includes\(q\)/.test(page) &&
  /accountNumber \|\| ''\)\.toLowerCase\(\)\.includes\(q\)/.test(page) &&
  /accountType \|\| ''\)\.toLowerCase\(\)\.includes\(q\)/.test(page));
check('table renders the filtered list', /dataSource=\{filteredAccounts\}/.test(page));
check('account summary also follows the filter', /filteredAccounts\.map\(acc =>/.test(page));
check('empty state reflects an active search', /No bank accounts match your search/.test(page));

console.log('\n=== Modern UI ===');
const css = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'public', 'css', 'custom.css'), 'utf8');
check('page wrapper uses the shared modern-page class', /className="al-modern-page"/.test(page));
check('header uses the modern gradient badge + title block',
  /className="al-modern-head"/.test(page) && /className="al-modern-badge"/.test(page) && /<h3[^>]*>Bank Accounts<\/h3>/.test(page));
check('header is a single aligned row (al-page-head)',
  /className="al-page-head"/.test(page));
check('search + refresh live in an aligned toolbar', /className="al-list-toolbar"/.test(page));
check('summary cards use the modern stat-card class', (page.match(/className="al-stat-card"/g) || []).length >= 4);
check('Account Summary has a modern section heading (no bare Divider)',
  /Account Summary<\/h3>/.test(page) && !/<Divider/.test(page));
check('custom.css defines the modern page system',
  /\.al-modern-page\b/.test(css) && /\.al-stat-card\b/.test(css) && /\.al-modern-head\b/.test(css));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
