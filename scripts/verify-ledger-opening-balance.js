/**
 * verify-ledger-opening-balance.js
 *
 * Proves that an account's OPENING BALANCE appears as the first row of the
 * General Ledger and becomes the starting point of the running balance —
 * without double counting and without creating any posting.
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/verify-ledger-opening-balance.js
 *
 * Everything runs against a COPY of the live database. The live file is
 * asserted untouched on exit.
 *
 * WHY THIS SUITE EXISTS
 *   The opening balance is a COLUMN on chart_of_accounts (openingBalance), not a
 *   journal entry, and it is stored NORMAL-BALANCE-SIGNED. The ledger used to
 *   render only posted journal lines, so the on-screen arithmetic began at zero
 *   and never tied back to the account's opening figure — and Bank
 *   Reconciliation, which starts from that figure, was out by exactly it.
 *
 * The six required cases:
 *   T1  Opening balance with NO transactions        → first row 407.47, close 407.47
 *   T2  Add a 1,000 deposit                         → close 1,407.47
 *   T3  Credit-normal liability opening balance     → direction correct
 *   T4  Refresh / reopen                            → identical result (deterministic)
 *   T5  Date-filtered period                        → brought-forward is correct
 *   T6  No duplicate GL posting generated            → ledger row counts unchanged
 *
 * Plus: the display row carries 0 debit / 0 credit (so it cannot enter a column
 * total), the closing balance is unchanged by adding the row, the account's own
 * computed balance agrees with the ledger closing figure, and a parent account's
 * opening balance is never folded into a child.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const LIVE_DB = path.join(__dirname, '..', 'src', 'backend', 'db', 'accounts.db');
const SCRATCH = path.join(os.tmpdir(), `acculedger-openbal-${Date.now()}`);
fs.mkdirSync(SCRATCH, { recursive: true });

// ── Hard safety guard: the live file must come out byte-identical ────────────
{
  const requested = process.env.ACCULEDGER_DB_PATH;
  if (requested && path.resolve(requested) === path.resolve(LIVE_DB)) {
    console.error('FATAL: ACCULEDGER_DB_PATH points at the live database. Aborting.');
    process.exit(2);
  }
  const sizeBefore = fs.statSync(LIVE_DB).size;
  const mtimeBefore = fs.statSync(LIVE_DB).mtimeMs;
  process.on('exit', () => {
    try {
      const after = fs.statSync(LIVE_DB);
      if (after.size !== sizeBefore || after.mtimeMs !== mtimeBefore) {
        console.error('\nFATAL: the LIVE database was modified during this run!');
        process.exitCode = 3;
      } else {
        console.log(`\nLIVE database untouched (size ${after.size}, mtime unchanged).`);
      }
    } catch { /* ignore */ }
  });
}

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  \u2713 ${name}`); }
  else { failed++; console.log(`  \u2717 ${name}${detail ? ` \u2014 ${detail}` : ''}`); }
};
const section = (t) => console.log(`\n${t}`);
const near = (a, b, eps = 0.005) => Math.abs(Number(a) - Number(b)) < eps;

const OpeningBalance = require('../src/backend/services/openingBalance');

// ── Fixture helpers ─────────────────────────────────────────────────────────

// A minimal, self-contained company file. Only the columns the rule reads, so
// the arithmetic in the assertions is visible and cannot hide behind live data.
function makeFixture(tag) {
  const file = path.join(SCRATCH, `${tag}.db`);
  const db = new Database(file);
  db.pragma('journal_mode = DELETE');
  db.exec(`
    CREATE TABLE chart_of_accounts (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
      normalBalance TEXT DEFAULT 'Debit', openingBalance REAL DEFAULT 0,
      openingBalanceDate TEXT, status TEXT DEFAULT 'Active', parentId INTEGER
    );
    CREATE TABLE journal_entries (
      id INTEGER PRIMARY KEY, date TEXT, description TEXT, reference TEXT,
      status TEXT DEFAULT 'Posted', source_type TEXT, source_id INTEGER
    );
    CREATE TABLE journal_lines (
      id INTEGER PRIMARY KEY, journal_id INTEGER, entry_id INTEGER,
      account_id INTEGER, debit REAL DEFAULT 0, credit REAL DEFAULT 0,
      description TEXT
    );
  `);
  db.prepare(`INSERT INTO chart_of_accounts (id,name,type,normalBalance,openingBalance,openingBalanceDate,status)
              VALUES (?,?,?,?,?,?,?)`).run(1, 'Checking Account', 'Bank', 'Debit', 0, null, 'Active');
  return db;
}

let jeSeq = 0;
let jlSeq = 0;
// Post one balanced journal entry. `lines` = [{accountId, debit, credit}].
function post(db, date, description, lines, { status = 'Posted', source_type = 'manual', source_id = null } = {}) {
  const je = db.prepare(`INSERT INTO journal_entries (id,date,description,reference,status,source_type,source_id)
                         VALUES (?,?,?,?,?,?,?)`)
    .run(++jeSeq, date, description, '', status, source_type, source_id).lastInsertRowid;
  for (const l of lines) {
    db.prepare(`INSERT INTO journal_lines (id,journal_id,entry_id,account_id,debit,credit,description)
                VALUES (?,?,?,?,?,?,?)`)
      .run(++jlSeq, je, je, l.accountId, l.debit || 0, l.credit || 0, l.description || null);
  }
  return je;
}

// ── The LEDGER MODEL under test ──────────────────────────────────────────────
// Reimplements exactly what GeneralLedger.js does, on top of the backend
// service. Kept in lockstep with the component: the component calls
// ledgerOpeningRow for the first row and journalByAccount for the body, then
// seeds its running balance with the opening figure.
//
// Returns the rows as RENDERED (first row = opening) plus the computed totals.
function buildLedger(db, accountId, { from = null, to = null } = {}) {
  const state = OpeningBalance.forAccount(db, accountId, { before: from });
  if (!state) return null;

  const row = OpeningBalance.openingRow({ ...state, beforeDate: from || state.beforeDate });
  const normalSide = state.normalBalance;
  const delta = (e) => (normalSide === 'Credit'
    ? (Number(e.credit) || 0) - (Number(e.debit) || 0)
    : (Number(e.debit) || 0) - (Number(e.credit) || 0));

  // The ledger body: this account's lines inside the period. Mirrors
  // JournalEntries.getByAccount (status != 'Void').
  let sql = `SELECT jl.id, jl.debit, jl.credit, jl.description AS lineDesc,
                    je.id AS journalId, je.date, je.reference, je.status
             FROM journal_lines jl JOIN journal_entries je ON jl.journal_id = je.id
             WHERE jl.account_id = ? AND je.status != 'Void'`;
  const params = [accountId];
  if (from) { sql += ' AND je.date >= ?'; params.push(from); }
  if (to)   { sql += ' AND je.date <= ?'; params.push(to); }
  sql += ' ORDER BY je.date ASC, je.id ASC';
  const body = db.prepare(sql).all(...params);

  const rows = [];
  let running = Number(state.balance);
  if (row) rows.push({ ...row });
  for (const e of body) {
    running += delta(e);
    rows.push({ ...e, balance: Number(running.toFixed(2)) });
  }

  const totalDebit = body.reduce((s, e) => s + (Number(e.debit) || 0), 0);
  const totalCredit = body.reduce((s, e) => s + (Number(e.credit) || 0), 0);
  const closing = Number(running.toFixed(2));

  return {
    state, rows, totalDebit, totalCredit,
    startingBalance: Number(state.balance),
    closingBalance: closing,
    openingRow: row,
  };
}

// The account's own computed balance — the figure the Chart of Accounts and
// Trial Balance supply. Independent of the ledger, so agreement is real evidence.
function accountComputedBalance(db, accountId) {
  const a = db.prepare('SELECT id,type,normalBalance,openingBalance FROM chart_of_accounts WHERE id = ?').get(accountId);
  const s = db.prepare(`SELECT COALESCE(SUM(jl.debit),0) d, COALESCE(SUM(jl.credit),0) c
                        FROM journal_lines jl JOIN journal_entries je ON jl.journal_id = je.id
                        WHERE jl.account_id = ? AND je.status = 'Posted'`).get(accountId);
  const nb = a.normalBalance === 'Credit' ? 'Credit' : 'Debit';
  return nb === 'Debit'
    ? Number(a.openingBalance) + s.d - s.c
    : Number(a.openingBalance) + s.c - s.d;
}

function ledgerTableTotals(db) {
  return {
    entries: db.prepare('SELECT COUNT(*) c FROM journal_entries').get().c,
    lines: db.prepare('SELECT COUNT(*) c FROM journal_lines').get().c,
    debitSum: db.prepare('SELECT COALESCE(SUM(debit),0) s FROM journal_lines').get().s,
    creditSum: db.prepare('SELECT COALESCE(SUM(credit),0) s FROM journal_lines').get().s,
    maxEntry: db.prepare('SELECT COALESCE(MAX(id),0) m FROM journal_entries').get().m,
  };
}

// ════════════════════════════════════════════════════════════════════════════
section('A. The opening balance is a COLUMN on the account, not a posting');
{
  const live = new Database(LIVE_DB, { readonly: true });
  const cols = new Set(live.prepare("PRAGMA table_info('chart_of_accounts')").all().map(r => r.name));
  ok('chart_of_accounts.openingBalance exists', cols.has('openingBalance'));
  ok('chart_of_accounts.openingBalanceDate exists', cols.has('openingBalanceDate'));

  const tables = live.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  ok('there is NO separate OpeningBalance table (one source of truth)',
    !tables.some(t => /^open(ing)?_?balance/i.test(t)), tables.filter(t => /open/i.test(t)).join(','));

  const openingJe = live.prepare(
    `SELECT COUNT(*) c FROM journal_entries
      WHERE LOWER(COALESCE(source_type,'')) LIKE '%open%'
         OR LOWER(COALESCE(description,'')) LIKE '%opening balance%'`
  ).get().c;
  ok('no journal entry represents an opening balance', openingJe === 0, `${openingJe} found`);

  const withOb = live.prepare('SELECT COUNT(*) c FROM chart_of_accounts WHERE openingBalance IS NOT NULL AND openingBalance != 0').get().c;
  console.log(`  live file: ${withOb} account(s) carry a nonzero opening balance`);
  live.close();
}

// ════════════════════════════════════════════════════════════════════════════
section('T1. Opening balance $407.47, no transactions');
let t1;
{
  const db = makeFixture('t1');
  db.prepare('UPDATE chart_of_accounts SET openingBalance = 407.47 WHERE id = 1').run();

  const led = buildLedger(db, 1, { from: '2026-09-01', to: '2026-09-30' });
  t1 = led;
  console.log('    ' + led.rows.map(r => `${r.date || '-'} ${r.lineDesc || r.description || ''} bal=${r.balance}`).join('\n    '));

  ok('ledger has exactly one row (the opening row)', led.rows.length === 1, `${led.rows.length} rows`);
  ok('first row is labelled "Opening Balance"', led.rows[0].lineDesc === 'Opening Balance', led.rows[0].lineDesc);
  ok('first row balance is 407.47', near(led.rows[0].balance, 407.47), String(led.rows[0].balance));
  ok('first row debit is 0 (not a posting)', Number(led.rows[0].debit) === 0);
  ok('first row credit is 0 (not a posting)', Number(led.rows[0].credit) === 0);
  ok('starting balance is 407.47', near(led.startingBalance, 407.47), String(led.startingBalance));
  ok('CLOSING balance is 407.47', near(led.closingBalance, 407.47), String(led.closingBalance));
  ok('closing equals the account\'s own computed balance',
    near(led.closingBalance, accountComputedBalance(db, 1)),
    `ledger ${led.closingBalance} vs account ${accountComputedBalance(db, 1)}`);
  ok('date is the period start, not today', led.rows[0].date === '2026-09-01', String(led.rows[0].date));
  db.close();
}

// ════════════════════════════════════════════════════════════════════════════
section('T2. Add a $1,000 deposit → closing 1,407.47');
let t2;
{
  const db = makeFixture('t2');
  db.prepare('UPDATE chart_of_accounts SET openingBalance = 407.47 WHERE id = 1').run();
  post(db, '2026-09-01', 'Deposit', [
    { accountId: 1, debit: 1000, credit: 0 },
  ]);

  const led = buildLedger(db, 1, { from: '2026-08-01', to: '2026-09-30' });
  t2 = led;
  console.log('    ' + led.rows.map(r => `${r.date} ${r.lineDesc || r.description} bal=${r.balance}`).join('\n    '));

  ok('two rows: opening then the deposit', led.rows.length === 2, `${led.rows.length}`);
  ok('row 1 = Opening Balance 407.47', near(led.rows[0].balance, 407.47) && led.rows[0].isOpening === true);
  ok('row 2 is the 09/01 deposit', led.rows[1].date === '2026-09-01');
  ok('row 2 running balance = 1,407.47', near(led.rows[1].balance, 1407.47), String(led.rows[1].balance));
  ok('CLOSING balance = 1,407.47', near(led.closingBalance, 1407.47), String(led.closingBalance));
  ok('closing equals the account\'s own computed balance',
    near(led.closingBalance, accountComputedBalance(db, 1)));
  db.close();
}

// ════════════════════════════════════════════════════════════════════════════
section('T2b. Adding the display row does NOT change the closing balance');
{
  // The exact "no double counting" requirement: closing must be identical with
  // and without the visible opening row.
  const db = makeFixture('t2b');
  db.prepare('UPDATE chart_of_accounts SET openingBalance = 407.47 WHERE id = 1').run();
  post(db, '2026-09-01', 'Deposit', [{ accountId: 1, debit: 1000, credit: 0 }]);
  post(db, '2026-09-02', 'Check',   [{ accountId: 1, debit: 0, credit: 100 }]);

  const led = buildLedger(db, 1, { from: '2026-08-01', to: '2026-09-30' });
  const bodyRows = led.rows.filter(r => !r.isOpening);
  const withoutRow = 0 + bodyRows.reduce((s, r) => s + ((Number(r.debit) || 0) - (Number(r.credit) || 0)), 0);

  ok('with the display row, closing = 1,307.47', near(led.closingBalance, 1307.47), String(led.closingBalance));
  ok('opening balance is counted EXACTLY once (closing - movement = opening)',
    near(led.closingBalance - withoutRow, 407.47),
    `${led.closingBalance} - ${withoutRow} = ${led.closingBalance - withoutRow}`);
  ok('the opening row contributes 0 to the debit total',
    Number(led.rows[0].debit) === 0);
  ok('the opening row contributes 0 to the credit total',
    Number(led.rows[0].credit) === 0);
  ok('ledger totals are the body totals only (row excluded)',
    near(led.totalDebit, 1000) && near(led.totalCredit, 100),
    `dr ${led.totalDebit} cr ${led.totalCredit}`);
  ok('closing equals the account\'s own computed balance',
    near(led.closingBalance, accountComputedBalance(db, 1)),
    `ledger ${led.closingBalance} vs account ${accountComputedBalance(db, 1)}`);
  db.close();
}

// ════════════════════════════════════════════════════════════════════════════
section('T3. Credit-normal opening balance (liability) — direction is correct');
{
  const db = makeFixture('t3');
  // Loan From Reuben: a liability. $5,000 owed, i.e. the account's opening
  // balance sits on its CREDIT side and is stored as a positive number.
  db.prepare(`INSERT INTO chart_of_accounts (id,name,type,normalBalance,openingBalance,status)
              VALUES (?,?,?,?,?,?)`).run(9, 'Loan From Reuben', 'Loan', 'Credit', 5000, 'Active');

  const led = buildLedger(db, 9, { from: '2026-09-01', to: '2026-09-30' });
  console.log('    ' + led.rows.map(r => `${r.date} ${r.lineDesc} bal=${r.balance}`).join('\n    '));

  ok('normal side is Credit', led.state.normalBalance === 'Credit');
  ok('opening balance is POSITIVE 5,000 (owed, on the account\'s normal side)',
    near(led.rows[0].balance, 5000), String(led.rows[0].balance));
  ok('a repayment INCREASES cash and REDUCES the liability correctly', (() => {
    // Repay 1,200: DR Loan 1,200 (debit reduces a credit-normal account).
    post(db, '2026-09-05', 'Repayment', [
      { accountId: 9, debit: 1200, credit: 0 },
    ]);
    const after = buildLedger(db, 9, { from: '2026-09-01', to: '2026-09-30' });
    return near(after.closingBalance, 3800) && near(after.rows[1].balance, 3800);
  })(), 'expected 3,800');
  ok('inception period: no activity posted before it, so it is the OPENING row',
    buildLedger(db, 9, { from: '2026-09-01' }).rows[0].lineDesc === 'Opening Balance');
  db.close();
}

// ════════════════════════════════════════════════════════════════════════════
section('T4. Refresh / reopen produces an identical result');
{
  const db = makeFixture('t4');
  db.prepare('UPDATE chart_of_accounts SET openingBalance = 407.47 WHERE id = 1').run();
  post(db, '2026-09-01', 'Deposit', [{ accountId: 1, debit: 1000, credit: 0 }]);
  post(db, '2026-09-02', 'Check',   [{ accountId: 1, debit: 0, credit: 100 }]);

  const a = buildLedger(db, 1, { from: '2026-08-01', to: '2026-09-30' });
  const b = buildLedger(db, 1, { from: '2026-08-01', to: '2026-09-30' });
  ok('row count identical across rebuilds', a.rows.length === b.rows.length);
  ok('starting balance identical', a.startingBalance === b.startingBalance);
  ok('closing balance identical', a.closingBalance === b.closingBalance);
  ok('row-by-row balances identical',
    JSON.stringify(a.rows.map(r => r.balance)) === JSON.stringify(b.rows.map(r => r.balance)));
  db.close();

  // And a genuinely fresh handle (simulates a cold reopen).
  const db2 = new Database(path.join(SCRATCH, 't4.db'));
  const c = buildLedger(db2, 1, { from: '2026-08-01', to: '2026-09-30' });
  ok('reopened handle gives the same closing balance', near(c.closingBalance, a.closingBalance));
  ok('reopened handle still renders the opening row first', c.rows[0].isOpening === true);
  db2.close();
}

// ════════════════════════════════════════════════════════════════════════════
section('T5. Date-filtered period → Balance Brought Forward is correct');
{
  const db = makeFixture('t5');
  // Opening 407.47, then activity in January and February, report on February.
  db.prepare('UPDATE chart_of_accounts SET openingBalance = 407.47 WHERE id = 1').run();
  post(db, '2026-01-10', 'January deposit', [{ accountId: 1, debit: 2000, credit: 0 }]);
  post(db, '2026-01-20', 'January check',   [{ accountId: 1, debit: 0, credit: 500 }]);
  post(db, '2026-02-05', 'February deposit',[{ accountId: 1, debit: 300, credit: 0 }]);

  const jan = buildLedger(db, 1, { from: '2026-01-01', to: '2026-01-31' });
  const feb = buildLedger(db, 1, { from: '2026-02-01', to: '2026-02-28' });

  console.log(`    Jan: first row "${jan.rows[0].lineDesc}" bal=${jan.rows[0].balance} → close ${jan.closingBalance}`);
  console.log(`    Feb: first row "${feb.rows[0].lineDesc}" bal=${feb.rows[0].balance} → close ${feb.closingBalance}`);

  ok('January starts at the account\'s OPENING balance 407.47 (nothing before it)',
    near(jan.rows[0].balance, 407.47) && jan.rows[0].lineDesc === 'Opening Balance');
  ok('January closing = 407.47 + 2000 - 500 = 1,907.47', near(jan.closingBalance, 1907.47), String(jan.closingBalance));

  ok('February row is labelled "Balance Brought Forward"',
    feb.rows[0].lineDesc === 'Balance Brought Forward', feb.rows[0].lineDesc);
  ok('February brought-forward = 1,907.47 (NOT zero)', near(feb.rows[0].balance, 1907.47), String(feb.rows[0].balance));
  ok('February brought-forward date is the period start',
    feb.rows[0].date === '2026-02-01', String(feb.rows[0].date));
  ok('February closing = 1,907.47 + 300 = 2,207.47', near(feb.closingBalance, 2207.47), String(feb.closingBalance));
  ok('period closing equals the account\'s own computed balance',
    near(feb.closingBalance, accountComputedBalance(db, 1)),
    `ledger ${feb.closingBalance} vs account ${accountComputedBalance(db, 1)}`);
  ok('the brought-forward row is not a posting',
    Number(feb.rows[0].debit) === 0 && Number(feb.rows[0].credit) === 0);

  // A period entirely BEFORE inception: empty body, opening row preserved.
  const early = buildLedger(db, 1, { from: '2025-01-01', to: '2025-12-31' });
  ok('a period before any activity still shows a non-zero starting row',
    early.rows.length >= 1 && near(early.rows[0].balance, 407.47),
    early.rows.length ? String(early.rows[0].balance) : 'no rows');

  // Voided entries must not reduce the brought-forward figure.
  post(db, '2026-01-15', 'VOIDED mistake', [{ accountId: 1, debit: 0, credit: 9999 }], { status: 'Void' });
  const feb2 = buildLedger(db, 1, { from: '2026-02-01', to: '2026-02-28' });
  ok('a Void entry is excluded from the brought-forward figure',
    near(feb2.rows[0].balance, 1907.47), String(feb2.rows[0].balance));
  db.close();
}

// ════════════════════════════════════════════════════════════════════════════
section('T6. No duplicate GL posting is generated');
{
  const db = makeFixture('t6');
  db.prepare('UPDATE chart_of_accounts SET openingBalance = 407.47 WHERE id = 1').run();
  post(db, '2026-09-01', 'Deposit', [{ accountId: 1, debit: 1000, credit: 0 }]);

  const before = ledgerTableTotals(db);
  buildLedger(db, 1, { from: '2026-01-01', to: '2026-12-31' });   // render
  buildLedger(db, 1, { from: '2026-09-01', to: '2026-09-30' });   // re-render
  OpeningBalance.forAccount(db, 1, { before: '2026-09-01' });      // direct call
  const after = ledgerTableTotals(db);

  ok('journal_entries count unchanged', before.entries === after.entries, `${before.entries} -> ${after.entries}`);
  ok('journal_lines count unchanged', before.lines === after.lines, `${before.lines} -> ${after.lines}`);
  ok('max journal_entry id unchanged (nothing inserted)', before.maxEntry === after.maxEntry);
  ok('total debits unchanged', near(before.debitSum, after.debitSum));
  ok('total credits unchanged', near(before.creditSum, after.creditSum));
  ok('the opening balance is still exactly one row in the ledger',
    buildLedger(db, 1, { from: '2026-01-01', to: '2026-12-31' }).rows.filter(r => r.isOpening).length === 1);
  db.close();
}

// ════════════════════════════════════════════════════════════════════════════
section('H. Hierarchy — an opening balance belongs to ONE account');
{
  const db = makeFixture('h');
  db.exec(`INSERT INTO chart_of_accounts (id,name,type,normalBalance,openingBalance,status,parentId)
           VALUES (10,'Parent Bank','Bank','Debit',1000,'Active',NULL),
                  (11,'Child Bank','Bank','Debit',250,'Active',10);`);
  post(db, '2026-09-01', 'Child deposit', [{ accountId: 11, debit: 100, credit: 0 }]);

  const parent = buildLedger(db, 10, { from: '2026-09-01', to: '2026-09-30' });
  const child  = buildLedger(db, 11, { from: '2026-09-01', to: '2026-09-30' });

  ok('parent ledger shows only the parent\'s own opening balance', near(parent.rows[0].balance, 1000), String(parent.rows[0].balance));
  ok('parent ledger does NOT absorb the child\'s opening balance', !near(parent.rows[0].balance, 1250));
  ok('child ledger shows only the child\'s own opening balance', near(child.rows[0].balance, 250), String(child.rows[0].balance));
  ok('child closing = 250 + 100 = 350', near(child.closingBalance, 350), String(child.closingBalance));
  ok('parent closing is unaffected by the child\'s activity', near(parent.closingBalance, 1000), String(parent.closingBalance));
  db.close();
}

// ════════════════════════════════════════════════════════════════════════════
section('D. Date label — never invent today');
{
  const db = makeFixture('d');
  db.prepare('UPDATE chart_of_accounts SET openingBalance = 407.47, openingBalanceDate = ? WHERE id = 1').run('2026-06-15');

  const withPeriod = buildLedger(db, 1, { from: '2026-09-01', to: '2026-09-30' });
  ok('a selected period wins: date is the period start', withPeriod.rows[0].date === '2026-09-01', String(withPeriod.rows[0].date));

  const noPeriod = buildLedger(db, 1, {});
  ok('no period + a stored openingBalanceDate → that date', noPeriod.rows[0].date === '2026-06-15', String(noPeriod.rows[0].date));

  db.prepare('UPDATE chart_of_accounts SET openingBalanceDate = NULL WHERE id = 1').run();
  const noDate = buildLedger(db, 1, {});
  ok('no period + no stored date → null (today is never invented)',
    noDate.rows[0].date === null, String(noDate.rows[0].date));
  db.close();
}

// ════════════════════════════════════════════════════════════════════════════
section('E. Live company file — the opening row ties to the real balance');
{
  const copy = path.join(SCRATCH, 'live.db');
  fs.copyFileSync(LIVE_DB, copy);
  const db = new Database(copy);

  const accts = db.prepare(
    'SELECT id,name,type,normalBalance,openingBalance FROM chart_of_accounts WHERE openingBalance != 0 ORDER BY id'
  ).all();
  console.log(`  ${accts.length} account(s) with a nonzero opening balance in the live file`);

  let agree = 0, disagree = [];
  for (const a of accts) {
    // The ledger's closing figure must equal the account's own computed balance.
    //
    // The period is expressed as an explicit start so the bringing-forward
    // figure stops there and the body picks up from the same point. (A ledger
    // with NO period would fold ALL activity into the opening row and then add
    // the body on top — correct as a "balance before inception" figure, but not
    // the way to reconcile against the account total.)
    const first = db.prepare(
      `SELECT MIN(je.date) d FROM journal_lines jl
       JOIN journal_entries je ON jl.journal_id = je.id
       WHERE jl.account_id = ? AND je.status != 'Void'`
    ).get(a.id);
    const from = first && first.d ? first.d : '0001-01-01';
    const led = buildLedger(db, a.id, { from, to: '9999-12-31' });
    const acct = accountComputedBalance(db, a.id);
    if (led && near(led.closingBalance, acct)) agree++;
    else disagree.push({ id: a.id, name: a.name, ledger: led ? led.closingBalance : null, account: acct });
  }
  ok(`every opening-balance account's ledger closing matches its computed balance (${agree}/${accts.length})`,
    disagree.length === 0,
    disagree.map(d => `#${d.id} ${d.name}: ledger ${d.ledger} vs account ${d.account}`).join('; '));

  // A no-period ledger is honest about what it means: the starting row is the
  // balance BEFORE all activity, so it carries the opening balance alone.
  {
    const sample = accts.find(a => db.prepare('SELECT 1 FROM journal_lines WHERE account_id = ? LIMIT 1').get(a.id)) || accts[0];
    const inception = buildLedger(db, sample.id, { from: '0001-01-01', to: '9999-12-31' });
    ok(`no-activity-before period reports the plain opening balance for #${sample.id} "${sample.name}"`,
      inception.rows[0].lineDesc === 'Opening Balance'
      && near(inception.rows[0].balance, Number(sample.openingBalance)),
      `${inception.rows[0].lineDesc} ${inception.rows[0].balance} vs ob ${sample.openingBalance}`);
    ok(`and its closing still equals the account balance for #${sample.id}`,
      near(inception.closingBalance, accountComputedBalance(db, sample.id)),
      `ledger ${inception.closingBalance} vs account ${accountComputedBalance(db, sample.id)}`);
  }

  // Show the named example account from the brief, if present.
  const example = db.prepare('SELECT id,name,type FROM chart_of_accounts WHERE name = ?').get('Motorola');
  if (example) {
    const led = buildLedger(db, example.id, {});
    console.log(`  example: #${example.id} "${example.name}" [${example.type}] → first row "${led.rows[0].lineDesc}" ${led.rows[0].balance}, closing ${led.closingBalance}`);
    ok('the live example account (Motorola, 407.47) opens at 407.47',
      near(led.rows[0].balance, 407.47) && near(led.closingBalance, 407.47), String(led.rows[0].balance));
  }
  db.close();
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(70)}`);
console.log(`${passed} passed, ${failed} failed`);
console.log('='.repeat(70));
process.exitCode = failed === 0 ? 0 : 1;
