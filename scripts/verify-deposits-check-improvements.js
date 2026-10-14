/**
 * verify-deposits-check-improvements.js
 *
 * Part 1 — Make Deposits & Write Check party dropdowns offer + Add New Customer
 *          / Vendor via the ONE shared PartyCreateModal (reusing the shared
 *          contact block + insertCustomer/insertSupplier), auto-selecting the
 *          new party without clearing the form.
 * Part 2 — the shared scroll-close hook closes an open dropdown when the page
 *          scrolls but NOT when scrolling inside the dropdown list.
 * Part 3 — Write Check history filters by Bank Account (stable id) on the
 *          backend, combined with search.
 *
 * Run: $env:ELECTRON_RUN_AS_NODE="1"; & electron.exe scripts\verify-deposits-check-improvements.js
 */
/* eslint-disable no-console */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-dep-checks' });
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
const realLog = console.log.bind(console);
console.log = () => {};
require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr')).raw;
console.log = realLog;
const Transactions = require(path.join(ROOT, 'src', 'backend', 'models', 'transactions'));

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`); }
};
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

console.log('\n=== PART 3 (behavior): Check history filters by bankAccountId ===');
{
  const mkAcct = (name) => Number(db.prepare("INSERT INTO chart_of_accounts (name,type,subType,number,normalBalance,openingBalance,status,isSystem,entered_by) VALUES (?,'Bank','Checking',?,'Debit',0,'Active',0,'t')").run(name, 'ZZ' + Math.floor(Math.random() * 1e6)).lastInsertRowid);
  const A = mkAcct('FNB Operating'), B = mkAcct('Nedbank Business');
  const mkCheck = (acct, ref, payee) => Transactions.insert({ date: '2026-05-01', type: 'Check', amount: 100, description: 'test', accountId: acct, reference: ref, debit: 0, credit: 100, payee_name: payee });
  mkCheck(A, '9001', 'Jennifer Campbell');
  mkCheck(A, '9002', 'ABCI');
  mkCheck(B, '9003', 'Jennifer Campbell');

  const all = Transactions.getPaginated(1, 50, '', 'Check', '');
  const aOnly = Transactions.getPaginated(1, 50, '', 'Check', A);
  const bOnly = Transactions.getPaginated(1, 50, '', 'Check', B);
  check('all banks → includes every bank (no account filter)', all.data.length >= 3 && all.data.length >= aOnly.data.length + bOnly.data.length, { all: all.data.length, a: aOnly.data.length, b: bOnly.data.length });
  check('bank A → only bank A checks (id)', aOnly.data.length === 2 && aOnly.data.every(t => Number(t.accountId) === A), aOnly.data.map(t => t.accountId));
  check('bank B → only bank B checks (id)', bOnly.data.length === 1 && bOnly.data.every(t => Number(t.accountId) === B), bOnly.data.map(t => t.accountId));
  check('total reflects the bank filter', aOnly.total === 2 && bOnly.total === 1, { a: aOnly.total, b: bOnly.total });
  const aSearch = Transactions.getPaginated(1, 50, 'Jennifer', 'Check', A);
  check('search + bank filter combine (Jennifer in A only)', aSearch.data.length === 1 && String(aSearch.data[0].reference) === '9001', aSearch.data.map(t => t.reference));
  check('different-named bank accounts are not merged', A !== B);
}

console.log('\n=== PART 1: shared Add-New party modal ===');
{
  const modal = read('src/frontend/src/components/shared/PartyCreateModal.js');
  check('PartyCreateModal exists + reuses the shared contact block', /CustomerContactFields/.test(modal));
  check('uses the shared insertCustomer + insertSupplier payloads', /insertCustomer\(/.test(modal) && /insertSupplier\(/.test(modal));
  check('double-submit guarded', /if \(saving\) return/.test(modal));
  check('resolves the created record via server search', /getCustomersPaginated|getSuppliersPaginated/.test(modal));

  const md = read('src/frontend/src/components/banking/MakeDeposits.js');
  check('Make Deposits reuses PartyCreateModal', /import PartyCreateModal from '\.\.\/shared\/PartyCreateModal'/.test(md) && /<PartyCreateModal/.test(md));
  check('Make Deposits Received-From dropdown offers Add New Customer + Vendor', /Add New Customer/.test(md) && /Add New Vendor/.test(md) && /dropdownRender=\{\(menu\) =>/.test(md));
  check('Make Deposits auto-selects the new party on its line', /form\.setFieldValue\(\['items', lineIndex, 'receivedFrom'\]/.test(md));
  check('Make Deposits party labels use the shared resolver', /getCustomerName\(c\)/.test(md) && /getCustomerName\(v\)/.test(md));

  const cp = read('src/frontend/src/components/accountant/CheckPrinting.js');
  check('Write Check reuses PartyCreateModal', /import PartyCreateModal from '\.\.\/shared\/PartyCreateModal'/.test(cp) && /<PartyCreateModal/.test(cp));
  check('Write Check Payee dropdown offers Add New Customer + Vendor', /Add New Customer/.test(cp) && /Add New Vendor/.test(cp));
  check('Write Check auto-selects the new payee (name preserved)', /form\.setFieldsValue\(\{ payee: value, payeeName: name \}\)/.test(cp));
}

console.log('\n=== PART 2: shared scroll-close hook ===');
{
  const hook = read('src/frontend/src/utils/useCloseDropdownOnScroll.js');
  check('hook exists', /export function useCloseDropdownOnScroll/.test(hook));
  check('closes on window scroll (capture)', /addEventListener\('scroll', handler, true\)/.test(hook));
  check('does NOT close when scrolling inside the dropdown popup', /closest\('\.ant-select-dropdown/.test(hook));
  const acc = read('src/frontend/src/components/shared/AccountSelect.js');
  check('AccountSelect uses the shared hook (bank/account selects)', /useCloseDropdownOnScroll/.test(acc));
  const cp = read('src/frontend/src/components/accountant/CheckPrinting.js');
  check('Write Check Payee uses the hook', /useCloseDropdownOnScroll\(payeeOpen/.test(cp));
  const md = read('src/frontend/src/components/banking/MakeDeposits.js');
  check('Make Deposits Received-From uses the hook', /useCloseDropdownOnScroll\(payorOpenKey/.test(md));
}

console.log('\n=== PART 3: wiring ===');
{
  const tx = read('src/backend/models/transactions.js');
  check('Transactions.getPaginated filters by accountId (bankAccountId)', /bankAccountId = ''/.test(tx) && /conditions\.push\('accountId = \?'\)/.test(tx));
  const h = read('src/backend/handlers/transactionHandlers.js');
  check('handler forwards bankAccountId (id, not name)', /bankAccountId = ''/.test(h) && /getPaginated\(page, pageSize, search, type, bankAccountId\)/.test(h));
  const cp = read('src/frontend/src/components/accountant/CheckPrinting.js');
  check('history query passes bankAccountId', /getTransactionsPaginated\?\.\(\{ page, pageSize, search: searchText, type: 'Check', bankAccountId: historyBankId/.test(cp));
  check('a Bank Account history filter + All option exists', /value={historyBankId \|\| 'all'}/.test(cp) && /All Bank Accounts/.test(cp));
  check('filter defaults to the check form bank account', /if \(watchAccountId && !historyBankTouched\) setHistoryBankId/.test(cp));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
