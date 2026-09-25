/**
 * verify-deposit-account-eligibility.js
 *
 * Proves the Make Deposits account rules against the LIVE chart of accounts and
 * a scratch copy of the database:
 *
 *   (a) "Deposit To" offers BANK accounts only.
 *   (b) Manual "Deposit Lines" offer the INCOME family only
 *       (Type 'Income' + 'Other Income'), including children/sub-accounts.
 *   (c) The two sets are disjoint — a bank account can never appear as a
 *       deposit-line account.
 *   (d) Classification is type-driven, never name-driven.
 *   (e) The shared AccountSelect's `allowedTypes` filter agrees with the
 *       eligibility helper (no drift between the component and the util).
 *   (f) Manual deposit posting is DR Bank / CR each allocation's income account,
 *       balanced; the account is stored by ID; an edit voids the old journal
 *       and reposts with the new account.
 *   (g) The screen wiring is correct (Deposits.js no longer fetches a
 *       Bank-only list; both selectors declare their own types).
 *
 * Runs against a SCRATCH COPY of the live DB (never the real file).
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/verify-deposit-account-eligibility.js
 */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-deposit-account-eligibility' });

const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const dbmgr = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js'));
const Deposits = require(path.join(ROOT, 'src', 'backend', 'models', 'deposits.js'));
const Settings = require(path.join(ROOT, 'src', 'backend', 'models', 'settings.js'));
const db = dbmgr.raw;

// Frontend util is plain ESM — copy to .mjs so Node can import it.
const feSrc = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'src', 'utils', 'accounts.js'), 'utf8');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'depacct-'));
const tmpMjs = path.join(tmpDir, 'accounts.mjs');
fs.writeFileSync(tmpMjs, feSrc);

let pass = 0, fail = 0;
const results = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; results.push(`  PASS  ${name}`); }
  else { fail++; results.push(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;
const money = (v) => Math.round((Number(v) || 0) * 100) / 100;

(async () => {
  const fe = await import('file://' + tmpMjs.replace(/\\/g, '/'));

  const rows = db.prepare(`
    SELECT id, name, type, subType, number, parentId, status
    FROM chart_of_accounts ORDER BY id
  `).all();
  const accounts = rows.map(r => ({
    id: r.id, accountName: r.name, name: r.name,
    accountType: r.type, type: r.type,
    accountSubType: r.subType, subType: r.subType,
    accountNumber: r.number, status: r.status, parentId: r.parentId,
  }));

  const active = accounts.filter(a => String(a.status || 'Active').toLowerCase() === 'active');
  const typeOf = (a) => String(a.accountType || a.type || '').trim().toLowerCase();
  const isIncome = (a) => typeOf(a) === 'income' || typeOf(a) === 'other income';
  const isBank = (a) => typeOf(a) === 'bank';

  // Mirror AccountSelect's allowedTypes filter exactly.
  const filterAllowed = (list, types) => {
    if (!Array.isArray(types) || types.length === 0) return list;
    const allow = new Set(types.map(t => String(t).trim().toLowerCase()));
    return list.filter(a => allow.has(typeOf(a)));
  };

  // ── (a) Deposit To = Bank only ─────────────────────────────────────────
  const bankTo = filterAllowed(active, fe.BANK_ACCOUNT_TYPE_NAMES);
  check('Deposit To offers exactly the active Bank accounts',
    bankTo.length === active.filter(isBank).length && bankTo.every(isBank),
    `bankTo=${bankTo.length} activeBank=${active.filter(isBank).length}`);
  check('Deposit To contains no Income account', bankTo.every(a => !isIncome(a)));

  // ── (b) Deposit Lines = Income family only ─────────────────────────────
  const incomeLines = filterAllowed(active, fe.INCOME_ACCOUNT_TYPE_NAMES);
  const feIncome = fe.getIncomeAccounts(active);
  check('the helper and the AccountSelect filter agree on the income list',
    incomeLines.length === feIncome.length && incomeLines.every(a => feIncome.some(b => b.id === a.id)),
    `filter=${incomeLines.length} helper=${feIncome.length}`);
  check('the live DB contains active Income accounts (so the test is meaningful)',
    active.filter(isIncome).length > 0, `count=${active.filter(isIncome).length}`);
  check('Deposit Lines offers EVERY active Income / Other Income account',
    active.filter(isIncome).every(a => incomeLines.some(b => b.id === a.id)),
    active.filter(isIncome).filter(a => !incomeLines.some(b => b.id === a.id)).map(a => `${a.id}:${a.name}`).join(', '));
  check('Deposit Lines contains no Bank account', incomeLines.every(a => !isBank(a)));
  check('Deposit Lines contains no Asset/Liability/Equity/Expense account',
    incomeLines.every(a => {
      const t = typeOf(a);
      return t === 'income' || t === 'other income';
    }));

  // ── (c) Disjoint ───────────────────────────────────────────────────────
  const bankIds = new Set(bankTo.map(a => a.id));
  check('no account is offered as BOTH a deposit destination and an income line',
    incomeLines.every(a => !bankIds.has(a.id)));

  // ── (b2) Children / sub-accounts are included ──────────────────────────
  const incomeChildren = active.filter(a => isIncome(a) && a.parentId != null);
  if (incomeChildren.length) {
    check('an active Income CHILD account is offered on a deposit line',
      incomeChildren.every(a => incomeLines.some(b => b.id === a.id)),
      incomeChildren.filter(a => !incomeLines.some(b => b.id === a.id)).map(a => `${a.id}:${a.name}`).join(', '));
  } else {
    results.push('  SKIP  no active Income account with a parent in this DB');
  }

  // ── (d) Type-driven, not name-driven ───────────────────────────────────
  const incomeNoName = active.filter(a => isIncome(a) && !/income/i.test(a.name));
  if (incomeNoName.length) {
    check('an Income-typed account whose name omits "income" is still offered',
      incomeNoName.every(a => incomeLines.some(b => b.id === a.id)),
      incomeNoName.map(a => `${a.id}:${a.name}`).join(', '));
  } else {
    results.push('  SKIP  no Income-typed account without "income" in its name');
  }
  const namedIncomeNotIncome = active.filter(a => !isIncome(a) && /income/i.test(a.name));
  if (namedIncomeNotIncome.length) {
    check('a non-Income account whose NAME contains "income" is NOT offered',
      namedIncomeNotIncome.every(a => !incomeLines.some(b => b.id === a.id)),
      namedIncomeNotIncome.filter(a => incomeLines.some(b => b.id === a.id)).map(a => `${a.id}:${a.name}[${a.type}]`).join(', '));
  } else {
    results.push('  SKIP  no non-Income account with "income" in its name');
  }

  // ── (d2) Synthetic fixtures (independent of the live data) ─────────────
  // Child/sub-accounts, duplicate child names under different parents, and the
  // name-vs-type rule, exercised on a fixed chart so the contract is pinned even
  // when the company file has no such accounts.
  const synthetic = [
    { id: 9001, name: 'Farm Income', type: 'Income', parentId: null, status: 'Active' },
    { id: 9002, name: 'Sales', type: 'Income', parentId: 9001, status: 'Active' },
    { id: 9003, name: 'Consulting Income', type: 'Other Income', parentId: null, status: 'Active' },
    { id: 9004, name: 'Sales', type: 'Other Income', parentId: 9003, status: 'Active' },
    { id: 9005, name: 'Business Checking', type: 'Bank', parentId: null, status: 'Active' },
    { id: 9006, name: 'Income Tax Expense', type: 'Expense', parentId: null, status: 'Active' },
    { id: 9007, name: 'Owner Draw', type: 'Equity', parentId: null, status: 'Active' },
  ];
  const synIncome = fe.getIncomeAccounts(synthetic);
  check('synthetic: Income + Other Income parents AND children are all offered',
    [9001, 9002, 9003, 9004].every(id => synIncome.some(a => a.id === id)),
    JSON.stringify(synIncome.map(a => a.id)));
  check('synthetic: two child accounts named "Sales" under different parents are both kept (id-keyed)',
    synIncome.filter(a => a.name === 'Sales').length === 2);
  check('synthetic: a Bank account is never offered on a deposit line',
    !synIncome.some(a => a.id === 9005));
  check('synthetic: an Expense named "Income Tax Expense" is excluded (type-driven)',
    !synIncome.some(a => a.id === 9006));
  check('synthetic: Equity is excluded', !synIncome.some(a => a.id === 9007));
  const synAllowed = filterAllowed(synthetic, fe.INCOME_ACCOUNT_TYPE_NAMES);
  check('synthetic: the AccountSelect filter matches the helper exactly',
    synAllowed.length === synIncome.length && synAllowed.every(a => synIncome.some(b => b.id === a.id)));
  const synBank = filterAllowed(synthetic, fe.BANK_ACCOUNT_TYPE_NAMES);
  check('synthetic: Deposit To picks only the Bank account',
    synBank.length === 1 && synBank[0].id === 9005);

  // ── (g) Wiring ─────────────────────────────────────────────────────────
  const depositsSrc = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'src', 'components', 'banking', 'Deposits.js'), 'utf8');
  check('Deposits.js no longer requests a Bank-only account list',
    !/getChartOfAccounts\(\s*\{\s*type:\s*['"]Bank['"]/.test(depositsSrc));
  check('Deposits.js declares Bank-only types for "Deposit To"',
    /allowedTypes=\{BANK_ACCOUNT_TYPE_NAMES\}/.test(depositsSrc));
  check('Deposits.js declares Income types for the deposit line selector',
    /allowedTypes=\{INCOME_ACCOUNT_TYPE_NAMES\}/.test(depositsSrc));
  check('the deposit line selector explains an empty list',
    /No eligible income accounts found\./.test(depositsSrc));

  const selectSrc = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'src', 'components', 'shared', 'AccountSelect.js'), 'utf8');
  check('the shared AccountSelect supports a configurable allowedTypes prop',
    /allowedTypes/.test(selectSrc) && /allow\.has\(/.test(selectSrc));

  const makeSrc = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'src', 'components', 'banking', 'MakeDeposits.js'), 'utf8');
  check('MakeDeposits.js derives its line accounts from the Income helper',
    /getIncomeAccounts\(/.test(makeSrc));

  const utilSrc = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'src', 'utils', 'accounts.js'), 'utf8');
  check('utils/accounts.js exposes getIncomeAccounts / isIncomeAccount',
    /export const getIncomeAccounts/.test(utilSrc) && /export const isIncomeAccount/.test(utilSrc));

  // ── (f) Manual deposit posting ─────────────────────────────────────────
  const bank = active.find(isBank);
  const incomes = active.filter(isIncome);
  check('a Bank account and at least two Income accounts exist for the posting test',
    !!bank && incomes.length >= 2, `bank=${bank && bank.id} incomes=${incomes.length}`);

  if (bank && incomes.length >= 2) {
    const closingDate = Settings.get('closingDate');
    const today = new Date().toISOString().slice(0, 10);
    const POST_DATE = closingDate && today <= closingDate
      ? new Date(new Date(closingDate).getTime() + 86400000).toISOString().slice(0, 10)
      : today;
    const [inc1, inc2] = incomes;

    const customer = db.prepare('SELECT id FROM customers ORDER BY id LIMIT 1').get();

    const created = Deposits.create({
      bankAccountId: bank.id,
      date: POST_DATE,
      reference: 'VERIFY-DEP-1',
      memo: 'verify manual deposit',
      allocations: [
        { accountId: inc1.id, amount: 400, description: 'Sales portion', partyType: customer ? 'customer' : null, partyId: customer ? customer.id : null },
        { accountId: inc2.id, amount: 200, description: 'Service portion' },
      ],
      createdBy: 'verify',
    });
    check('creating a manual deposit succeeds', !!(created && created.success), JSON.stringify(created));
    const depId = created.id;

    const je = db.prepare("SELECT id FROM journal_entries WHERE source_type = 'deposit' AND source_id = ? AND status = 'Posted'").get(depId);
    check('a posted deposit journal entry exists', !!je);
    const lines = je ? db.prepare('SELECT account_id, debit, credit FROM journal_lines WHERE journal_id = ?').all(je.id) : [];
    const debitTotal = money(lines.reduce((s, l) => s + Number(l.debit || 0), 0));
    const creditTotal = money(lines.reduce((s, l) => s + Number(l.credit || 0), 0));
    check('the deposit journal is balanced', near(debitTotal, creditTotal) && near(debitTotal, 600), `${debitTotal}/${creditTotal}`);
    check('the bank account is DEBITED 600 (money in)', lines.some(l => Number(l.account_id) === Number(bank.id) && near(l.debit, 600)),
      JSON.stringify(lines));
    check('income account #1 is CREDITED 400', lines.some(l => Number(l.account_id) === Number(inc1.id) && near(l.credit, 400)),
      JSON.stringify(lines));
    check('income account #2 is CREDITED 200', lines.some(l => Number(l.account_id) === Number(inc2.id) && near(l.credit, 200)),
      JSON.stringify(lines));

    const allocRows = db.prepare('SELECT account_id, amount, party_type, party_id FROM deposit_allocations WHERE deposit_id = ? ORDER BY id').all(depId);
    check('allocations store the account ID (never the name)',
      allocRows.length === 2 && allocRows.every(r => Number.isFinite(Number(r.account_id))),
      JSON.stringify(allocRows));
    check('allocations store the Customer/Vendor type + id',
      !customer || (allocRows[0].party_type === 'customer' && Number(allocRows[0].party_id) === Number(customer.id)),
      JSON.stringify(allocRows[0]));

    // ── Edit: change inc1 → inc2, amount 600 ─────────────────────────────
    const upd = Deposits.update(depId, {
      bankAccountId: bank.id,
      date: POST_DATE,
      reference: 'VERIFY-DEP-1',
      memo: 'verify manual deposit (edited)',
      allocations: [{ accountId: inc2.id, amount: 600, description: 'Service portion' }],
    });
    check('updating the deposit succeeds', !!(upd && upd.success), JSON.stringify(upd));

    const oldStatus = je ? db.prepare('SELECT status FROM journal_entries WHERE id = ?').get(je.id) : null;
    check('the OLD deposit journal was voided on edit', oldStatus && oldStatus.status === 'Void', JSON.stringify(oldStatus));

    const newJe = db.prepare("SELECT id FROM journal_entries WHERE source_type = 'deposit' AND source_id = ? AND status = 'Posted'").get(depId);
    const newLines = newJe ? db.prepare('SELECT account_id, debit, credit FROM journal_lines WHERE journal_id = ?').all(newJe.id) : [];
    check('a NEW posted deposit journal exists after edit', !!newJe);
    check('the new journal credits only the new income account (600)',
      newLines.some(l => Number(l.account_id) === Number(inc2.id) && near(l.credit, 600)) &&
      !newLines.some(l => Number(l.account_id) === Number(inc1.id) && Number(l.credit || 0) > 0),
      JSON.stringify(newLines));
    check('the edited journal is balanced', near(
      money(newLines.reduce((s, l) => s + Number(l.debit || 0), 0)),
      money(newLines.reduce((s, l) => s + Number(l.credit || 0), 0))), JSON.stringify(newLines));
  }

  console.log('\n=== Deposit account eligibility ===');
  console.log(results.join('\n'));
  console.log(`\n  active accounts:      ${active.length}`);
  console.log(`  Deposit To (Bank):    ${bankTo.length}`);
  console.log(`  Deposit Lines (Inc):  ${incomeLines.length}`);
  console.log(`\n  ${pass} passed, ${fail} failed\n`);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\nFATAL:', e && e.stack ? e.stack : e);
  console.log(`\n  ${pass} passed, ${fail + 1} failed\n`);
  process.exit(1);
});
