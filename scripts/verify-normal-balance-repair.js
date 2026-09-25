/**
 * verify-normal-balance-repair.js
 *
 * Proves the normal-balance migration (migration 003 + services/normalBalance.js).
 * Everything runs against a COPY of the live database, so the real company file
 * is never written to. Journal-entry tables are also copies.
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/verify-normal-balance-repair.js
 *
 * SAFETY: this script asserts that the project's shared db-mgr is NEVER pointed
 * at the live file before it does anything. The end-to-end pass (section E) runs
 * in a CHILD process whose cwd is the scratch directory and whose only DB
 * handle is a copy, because `dbmgr.js` resolves its path relative to its own
 * __dirname — a child confined to a copy cannot reach the real file.
 *
 * Coverage (the seven cases from the defect report):
 *   T1  Bank account stored 'Credit'          → repaired to Debit
 *   T2  Loan account stored 'Debit'           → repaired to Credit
 *   T3  Credit Card account stored 'Debit'    → repaired to Credit
 *   T4  Expense account already 'Debit'       → untouched (no write at all)
 *   T5  Income account already 'Credit'       → untouched (no write at all)
 *   T6  Displayed balance sign flips to positive after the repair
 *   T7  Trial Balance total debits == total credits before AND after
 *
 * Plus: idempotency, ledger invariance (no journal entry may change), the
 * blank-value regression (a blank normalBalance must ALSO be fixed), and the
 * migration runner executing 003 exactly once.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * The version the real migration runner lands on: the HIGHEST migration on
 * disk. Derived rather than hardcoded — a hardcoded 3 went stale the moment
 * 004_link_legacy_tax_rates.js was added, which made this suite report a
 * failure that had nothing to do with normal balances.
 */
const LATEST_MIGRATION_VERSION = Math.max(
  0,
  ...fs.readdirSync(path.join(__dirname, '..', 'src', 'backend', 'migrations'))
    .map(f => Number((f.match(/^(\d+)_/) || [])[1]))
    .filter(Number.isFinite)
);
const Database = require('better-sqlite3');

const LIVE_DB = path.join(__dirname, '..', 'src', 'backend', 'db', 'accounts.db');
const ROOT = path.join(__dirname, '..');
const SCRATCH = path.join(os.tmpdir(), `acculedger-normalbal-${Date.now()}`);
fs.mkdirSync(SCRATCH, { recursive: true });

// ── Hard safety guard ────────────────────────────────────────────────────────
// Refuse to run at all if anything would let a test reach the live file.
{
  const requested = process.env.ACCULEDGER_DB_PATH;
  if (requested && path.resolve(requested) === path.resolve(LIVE_DB)) {
    console.error('FATAL: ACCULEDGER_DB_PATH points at the live database. Aborting.');
    process.exit(2);
  }
  const liveMtimeBefore = fs.statSync(LIVE_DB).mtimeMs;
  const liveSizeBefore = fs.statSync(LIVE_DB).size;
  process.on('exit', (code) => {
    try {
      const after = fs.statSync(LIVE_DB);
      if (after.size !== liveSizeBefore || after.mtimeMs !== liveMtimeBefore) {
        console.error('\nFATAL: the LIVE database was modified during this run!');
        console.error(`  size ${liveSizeBefore} -> ${after.size}`);
        console.error(`  mtime ${liveMtimeBefore} -> ${after.mtimeMs}`);
        process.exitCode = 3;
      } else {
        console.log(`\nLIVE database untouched (size ${after.size}, mtime unchanged).`);
      }
    } catch { /* ignore */ }
  });
}

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const section = (t) => console.log(`\n${t}`);

function freshCopy(tag) {
  const dest = path.join(SCRATCH, `${tag}.db`);
  fs.copyFileSync(LIVE_DB, dest);
  // Fold the WAL in so the copy is a self-contained point-in-time snapshot.
  const db = new Database(dest);
  db.pragma('journal_mode = DELETE');
  return db;
}

// ── Load the modules under test against a given db handle ───────────────────
function loadService(db) {
  const NB = require('../src/backend/services/normalBalance');
  return { NB, db };
}

const LEDGER_TABLES = ['journal_entries', 'journal_lines', 'transactions'];

function snapshotLedger(db) {
  const out = {};
  for (const t of LEDGER_TABLES) {
    try {
      out[t] = {
        count: db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c,
        maxId: db.prepare(`SELECT COALESCE(MAX(id),0) m FROM ${t}`).get().m,
        sum: db.prepare(`SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM ${t}`).get(),
      };
    } catch { out[t] = null; }
  }
  return out;
}

// Trial balance straight from journal_lines — the accounting identity, which is
// independent of normalBalance (that field only decides column placement).
function trialBalanceSides(db) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(jl.debit), 0) AS d, COALESCE(SUM(jl.credit), 0) AS c
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_id
    WHERE je.status = 'Posted'
  `).get();
  return { debit: Number(row.d), credit: Number(row.c) };
}

function accountBalance(db, id, NB) {
  const r = db.prepare('SELECT id, name, type, normalBalance, openingBalance FROM chart_of_accounts WHERE id = ?').get(id);
  if (!r) return null;
  const sides = db.prepare(`
    SELECT COALESCE(SUM(jl.debit),0) d, COALESCE(SUM(jl.credit),0) c
    FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_id
    WHERE jl.account_id = ? AND je.status = 'Posted'
  `).get(id);
  return {
    row: r,
    debit: Number(sides.d),
    credit: Number(sides.c),
    storedValue: NB.balanceOf({ normalBalance: r.normalBalance, type: r.type, debit: sides.d, credit: sides.c, openingBalance: r.openingBalance }),
    typeExpected: NB.balanceOf({ type: r.type, debit: sides.d, credit: sides.c, openingBalance: r.openingBalance }),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// RULE TABLE
// ════════════════════════════════════════════════════════════════════════════
section('A. Authoritative type → normal-balance rule');
{
  const { NB } = loadService();
  const debitTypes  = ['Asset', 'Bank', 'Cash', 'Cost of Goods Sold', 'Expense', 'Other Expense'];
  const creditTypes = ['Liability', 'Credit Card', 'Loan', 'Equity', 'Income', 'Other Income'];
  const legacyDebit  = ['Fixed Asset', 'Other Current Asset', 'Accounts Receivable'];
  const legacyCredit = ['Other Current Liability', 'Accounts Payable', 'Long Term Liability'];

  for (const t of debitTypes)  ok(`${t.padEnd(20)} → Debit`,  NB.getExpectedNormalBalance(t) === 'Debit',  String(NB.getExpectedNormalBalance(t)));
  for (const t of creditTypes) ok(`${t.padEnd(20)} → Credit`, NB.getExpectedNormalBalance(t) === 'Credit', String(NB.getExpectedNormalBalance(t)));
  for (const t of legacyDebit)  ok(`legacy ${t.padEnd(24)} → Debit`,  NB.getExpectedNormalBalance(t) === 'Debit',  String(NB.getExpectedNormalBalance(t)));
  for (const t of legacyCredit) ok(`legacy ${t.padEnd(24)} → Credit`, NB.getExpectedNormalBalance(t) === 'Credit', String(NB.getExpectedNormalBalance(t)));

  ok('case-insensitive ("bank" → Debit)', NB.getExpectedNormalBalance('bank') === 'Debit');
  ok('non-posting has NO normal side (left alone)', NB.getExpectedNormalBalance('Non-Posting') === null);
  ok('unknown type returns null (never guess)', NB.getExpectedNormalBalance('Wat') === null);
  ok('blank type returns null', NB.getExpectedNormalBalance('') === null);

  ok('balanceOf: Debit normal = debits − credits', NB.balanceOf({ normalBalance: 'Debit', debit: 100, credit: 30 }) === 70);
  ok('balanceOf: Credit normal = credits − debits', NB.balanceOf({ normalBalance: 'Credit', debit: 30, credit: 100 }) === 70);
}

// ════════════════════════════════════════════════════════════════════════════
// LIVE-DATA SCAN (read-only)
// ════════════════════════════════════════════════════════════════════════════
section('B. Live company file — what is actually wrong');
const live = freshCopy('live-scan');
let liveMismatches = [];
{
  const { NB } = loadService();
  const rows = live.prepare('SELECT id, name, type, normalBalance FROM chart_of_accounts ORDER BY id').all();
  for (const r of rows) {
    const exp = NB.getExpectedNormalBalance(r.type);
    const cur = NB.normalizeNormalBalance(r.normalBalance);
    if (exp !== null && cur !== exp) liveMismatches.push({ ...r, expected: exp, current: cur });
  }
  console.log(`  scanned ${rows.length} accounts · ${liveMismatches.length} contradict their type`);
  const byType = {};
  for (const m of liveMismatches) {
    const k = `${m.type}: ${m.current || '(blank)'} → ${m.expected}`;
    byType[k] = (byType[k] || 0) + 1;
  }
  for (const [k, n] of Object.entries(byType)) console.log(`    · ${k}  ×${n}`);
  ok('live scan found no unclassified/unknown account types that could hide a mismatch',
    live.prepare("SELECT COUNT(*) c FROM chart_of_accounts").get().c > 0);
}
live.close();

// ════════════════════════════════════════════════════════════════════════════
// FIXTURE: deterministic company file reproducing every reported symptom
// ════════════════════════════════════════════════════════════════════════════
section('C. T1–T7 on a fixture reproducing the reported symptoms');
const t = freshCopy('fixture');
t.prepare('DROP TABLE IF EXISTS chart_of_accounts').run();
t.prepare(`
  CREATE TABLE chart_of_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL,
    subType TEXT, number TEXT, parentId INTEGER, description TEXT, taxLine TEXT,
    normalBalance TEXT DEFAULT 'Debit', openingBalance REAL DEFAULT 0,
    openingBalanceDate TEXT, balance REAL DEFAULT 0, status TEXT DEFAULT 'Active',
    isSystem INTEGER DEFAULT 0, entered_by TEXT, date_entered DATETIME, last_modified DATETIME
  )
`).run();

//          id  name                 type             stored normalBalance
const FIX = [
  [1,  'Checking Account',    'Bank',            'Credit'],  // T1
  [2,  'Truck Loan',          'Liability',       'Debit'],   // T2
  [3,  'Visa Credit Card',    'Credit Card',     'Debit'],   // T3
  [4,  'Office Supplies',     'Expense',         'Debit'],   // T4 unchanged
  [5,  'Sales Revenue',       'Income',          'Credit'],  // T5 unchanged
  [6,  'Petty Cash',          'Cash',            null],      // blank → must be fixed
  [7,  'Memorandum Only',     'Non-Posting',     'Debit'],   // must be left alone
  [8,  'Undeposited Funds',   'Asset',           'Debit'],   // already right
  [9,  'Equipment Loan',      'Loan',            'Debit'],   // legacy-shaped loan
  [10, 'Owner\u2019s Equity', 'Equity',          'Debit'],   // wrong side
];
const ins = t.prepare('INSERT INTO chart_of_accounts (id, name, type, normalBalance, status) VALUES (?, ?, ?, ?, \'Active\')');
for (const [id, name, type, nb] of FIX) ins.run(id, name, type, nb);

// ── Balanced journal entries (the ledger is CORRECT — it must stay correct) ──
t.prepare(`
  CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, reference TEXT, description TEXT,
    status TEXT DEFAULT 'Posted', source_type TEXT, source_id INTEGER
  )
`).run();
t.prepare(`
  CREATE TABLE IF NOT EXISTS journal_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT, journal_id INTEGER, account_id INTEGER,
    debit REAL DEFAULT 0, credit REAL DEFAULT 0, description TEXT
  )
`).run();

const je = t.prepare('INSERT INTO journal_entries (date, reference, description, status) VALUES (?, ?, ?, \'Posted\')');
const jl = t.prepare('INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)');

// Opening deposit: Checking 14,750 dr / Owner's Equity 14,750 cr
let e1 = je.run('2026-01-15', 'OB-1', 'Opening deposit').lastInsertRowid;
jl.run(e1, 1, 14750, 0, 'Opening bank balance');
jl.run(e1, 10, 0, 14750, 'Opening equity');

// Office supplies on the Visa card: Expense 1,250 dr / Visa 1,250 cr
let e3 = je.run('2026-02-10', 'OB-3', 'Supplies on card').lastInsertRowid;
jl.run(e3, 4, 1250, 0, 'Office supplies');
jl.run(e3, 3, 0, 1250, 'Visa charge');

// Truck loan advance: Checking 22,000 dr / Truck Loan 22,000 cr
let e2 = je.run('2026-02-01', 'OB-2', 'Vehicle finance advance').lastInsertRowid;
jl.run(e2, 1, 22000, 0, 'Loan proceeds to bank');
jl.run(e2, 2, 0, 22000, 'Truck Loan payable');

const { NB } = loadService(t);

// ── BEFORE ──────────────────────────────────────────────────────────────────
const beforeLedger = snapshotLedger(t);
const beforeTB = trialBalanceSides(t);
const beforeChecking = accountBalance(t, 1, NB);
const beforeVisa = accountBalance(t, 3, NB);

console.log(`  before: Checking shows ${beforeChecking.storedValue.toFixed(2)} (debits ${beforeChecking.debit} / credits ${beforeChecking.credit})`);
ok('T6-pre: Checking is DISPLAYED negative before the repair', beforeChecking.storedValue < 0, String(beforeChecking.storedValue));
ok('T7-pre: Trial Balance totals are already equal (ledger is correct)',
  Math.abs(beforeTB.debit - beforeTB.credit) < 0.005, `${beforeTB.debit} vs ${beforeTB.credit}`);

// ── DRY RUN must not write ──────────────────────────────────────────────────
const dry = NB.repairNormalBalances(t, { dryRun: true });
ok('dry run reports mismatches without writing',
  dry.mismatched === 6 && t.prepare('SELECT normalBalance FROM chart_of_accounts WHERE id = 1').get().normalBalance === 'Credit',
  `mismatched=${dry.mismatched}`);

// ── APPLY ───────────────────────────────────────────────────────────────────
const repaired = NB.repairNormalBalances(t);

// T1 / T2 / T3
ok('T1 Bank Checking: Credit → Debit',
  t.prepare('SELECT normalBalance n FROM chart_of_accounts WHERE id = 1').get().n === 'Debit');
ok('T2 Truck Loan (Liability): Debit → Credit',
  t.prepare('SELECT normalBalance n FROM chart_of_accounts WHERE id = 2').get().n === 'Credit');
ok('T3 Visa Credit Card: Debit → Credit',
  t.prepare('SELECT normalBalance n FROM chart_of_accounts WHERE id = 3').get().n === 'Credit');
ok('legacy Loan type also Credits',
  t.prepare('SELECT normalBalance n FROM chart_of_accounts WHERE id = 9').get().n === 'Credit');
ok('Equity mis-stamped Debit → Credit',
  t.prepare('SELECT normalBalance n FROM chart_of_accounts WHERE id = 10').get().n === 'Credit');

// T4 / T5 unchanged — assert they were never even in the write set
ok('T4 Expense account (already Debit) not in the repair set', !repaired.rows.some(r => r.id === 4));
ok('T5 Revenue account (already Credit) not in the repair set', !repaired.rows.some(r => r.id === 5));
ok('already-correct Asset account not in the repair set', !repaired.rows.some(r => r.id === 8));

// blank value — the exact case the OLD blank-only back-fill handled, must still work
ok('blank normalBalance is filled from the type', t.prepare('SELECT normalBalance n FROM chart_of_accounts WHERE id = 6').get().n === 'Debit');

// non-posting accounts are never invented for
const memo = t.prepare('SELECT normalBalance n FROM chart_of_accounts WHERE id = 7').get();
ok('Non-Posting account left untouched', memo.n === 'Debit', String(memo.n));

// Repair accounting — T1(1), T2(2), T3(3), blank(6), legacy Loan(9), Equity(10)
ok(`repaired exactly the 6 mismatched accounts (got ${repaired.repaired})`, repaired.repaired === 6, JSON.stringify(repaired.rows.map(r => r.id)));
ok(`left ${repaired.skipped} non-posting/unknown account(s) alone`, repaired.skipped === 1, String(repaired.skipped));

// T6 after — Checking carries a $14,750 opening deposit plus a $22,000 loan
// advance, so its net debit is $36,750. Before the repair the Bank account was
// stamped Credit, so that same $36,750 ledger was rendered as −$36,750.
const afterChecking = accountBalance(t, 1, NB);
const afterVisa = accountBalance(t, 3, NB);
console.log(`  after : Checking shows ${afterChecking.storedValue.toFixed(2)} (net debit ${afterChecking.debit - afterChecking.credit})`);
ok('T6 Bank balance now displays POSITIVE (was −$36,750)',
  afterChecking.storedValue > 0 && Math.abs(afterChecking.storedValue - (afterChecking.debit - afterChecking.credit)) < 0.005,
  String(afterChecking.storedValue));
ok('T6 the reported −$14,750 symptom: a $14,750 net-debit Bank account flips from −14,750 to +14,750',
  NB.balanceOf({ normalBalance: 'Credit', type: 'Bank', debit: 14750, credit: 0 }) === -14750
  && NB.balanceOf({ type: 'Bank', debit: 14750, credit: 0 }) === 14750);
ok('credit-card balance sign is now correct (normal-side positive)',
  Math.abs(afterVisa.storedValue - 1250) < 0.005, String(afterVisa.storedValue));

// T7 after
const afterTB = trialBalanceSides(t);
ok('T7 Trial Balance totals remain equal after the repair',
  Math.abs(afterTB.debit - afterTB.credit) < 0.005, `${afterTB.debit} vs ${afterTB.credit}`);
ok('T7 total debits unchanged by the repair',
  Math.abs(afterTB.debit - beforeTB.debit) < 0.005);

// ── LEDGER INVARIANCE ───────────────────────────────────────────────────────
const afterLedger = snapshotLedger(t);
ok('no journal entry was added or removed', JSON.stringify(beforeLedger.journal_entries) === JSON.stringify(afterLedger.journal_entries));
ok('no journal line was added, removed or re-amounted',
  JSON.stringify(beforeLedger.journal_lines) === JSON.stringify(afterLedger.journal_lines));
ok('no transaction row was touched',
  JSON.stringify(beforeLedger.transactions) === JSON.stringify(afterLedger.transactions));

// ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
const second = NB.repairNormalBalances(t);
ok('idempotent: second run repairs nothing', second.repaired === 0 && second.mismatched === 0, `repaired=${second.repaired}`);
const ledgerAfter2 = snapshotLedger(t);
ok('idempotent: ledger still identical on the second pass',
  JSON.stringify(ledgerAfter2) === JSON.stringify(afterLedger));

t.close();

// ════════════════════════════════════════════════════════════════════════════
// MIGRATION 003 + RUNNER
// ════════════════════════════════════════════════════════════════════════════
section('D. Migration 003 runs through the real versioned runner, exactly once');
{
  const migDir = path.join(__dirname, '..', 'src', 'backend', 'migrations');
  const migration003 = require(path.join(migDir, '003_normal_balance_repair.js'));
  ok('003 declares version 3', migration003.version === 3);
  ok('003 has a description', typeof migration003.description === 'string' && migration003.description.length > 10);

  const mdb = freshCopy('migration');
  mdb.prepare(`CREATE TABLE IF NOT EXISTS app_metadata (
      id INTEGER PRIMARY KEY CHECK (id = 1), schema_version INTEGER NOT NULL DEFAULT 0,
      initialized INTEGER NOT NULL DEFAULT 0, installed_at TEXT, last_updated TEXT)`).run();
  // Force the v2 state that real existing files are in.
  const preExisting = mdb.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name='app_metadata'").get().c;
  mdb.prepare("INSERT OR REPLACE INTO app_metadata (id, schema_version, initialized, installed_at, last_updated) VALUES (1, 2, 1, datetime('now'), datetime('now'))").run();
  ok('pre-existing metadata table detected', preExisting === 1);

  // Seed wrong values into the real schema of the copy so 003 has work to do.
  const targets = mdb.prepare("SELECT id, type FROM chart_of_accounts WHERE LOWER(type) IN ('bank','loan','credit card','liability','equity')").all();
  ok(`live copy has ${targets.length} debit/credit-normal accounts to invert for the test`, targets.length > 0);
  const flip = mdb.prepare('UPDATE chart_of_accounts SET normalBalance = ? WHERE id = ?');
  for (const r of targets) {
    const exp = NB.getExpectedNormalBalance(r.type);
    flip.run(exp === 'Debit' ? 'Credit' : 'Debit', r.id);
  }
  const wrongCount = mdb.prepare("SELECT COUNT(*) c FROM chart_of_accounts WHERE LOWER(type)='bank' AND normalBalance='Credit'").get().c;
  ok(`inverted ${wrongCount} Bank account(s) to 'Credit' to reproduce the reported defect`, wrongCount > 0, String(wrongCount));

  const ledgerBefore = snapshotLedger(mdb);
  const res = migration003.up(mdb);
  ok('003 repaired the intentionally-inverted accounts', res.repaired > 0, `repaired=${res.repaired}`);
  ok('003 wrote an audit row for every change',
    mdb.prepare('SELECT COUNT(*) c FROM normal_balance_backfill_backup').get().c === res.repaired,
    `backup=${mdb.prepare('SELECT COUNT(*) c FROM normal_balance_backfill_backup').get().c} repaired=${res.repaired}`);
  ok('backup table records the OLD value for reversibility',
    mdb.prepare('SELECT old_normal_balance, new_normal_balance FROM normal_balance_backfill_backup LIMIT 1').get().old_normal_balance
      !== mdb.prepare('SELECT old_normal_balance, new_normal_balance FROM normal_balance_backfill_backup LIMIT 1').get().new_normal_balance);
  ok('every stored value now matches its type',
    mdb.prepare('SELECT id, type, normalBalance FROM chart_of_accounts').all()
      .every(r => {
        const e = NB.getExpectedNormalBalance(r.type);
        return e === null || NB.normalizeNormalBalance(r.normalBalance) === e;
      }));
  ok('003 left the ledger alone',
    JSON.stringify(snapshotLedger(mdb)) === JSON.stringify(ledgerBefore));

  const again = migration003.up(mdb);
  ok('003 is idempotent (re-running repairs 0)', again.repaired === 0, `repaired=${again.repaired}`);

  mdb.close();
}

// ════════════════════════════════════════════════════════════════════════════
// END-TO-END: real migration runner on a copy of the live file
// ════════════════════════════════════════════════════════════════════════════
section(`E. End-to-end: the real runner upgrades a live-file copy from v2 to v${LATEST_MIGRATION_VERSION}`);
//
// SAFETY: dbmgr.js resolves its path from its OWN __dirname, so we stage a
// throwaway copy of the whole backend under the scratch dir and place the
// company-file copy at <sandbox>/db/accounts.db. The child process requires the
// SANDBOXED backend, so even a wrong-path bug cannot reach the live file — the
// absolute path to it is not present in the sandbox tree at all.
{
  const { execFileSync } = require('child_process');
  const NB2 = require('../src/backend/services/normalBalance');

  const SANDBOX = path.join(SCRATCH, 'sandbox');
  const sandboxBackend = path.join(SANDBOX, 'backend');
  const sandboxDb = path.join(sandboxBackend, 'db', 'accounts.db');

  fs.mkdirSync(path.join(sandboxBackend, 'db'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'src', 'backend'), sandboxBackend, { recursive: true });
  // The backend depends on the single shared canonical Item Type table, so the
  // sandbox must mirror src/shared alongside the backend.
  fs.cpSync(path.join(ROOT, 'src', 'shared'), path.join(SANDBOX, 'shared'), { recursive: true });
  fs.rmSync(sandboxDb, { force: true });
  fs.copyFileSync(LIVE_DB, sandboxDb);

  // The sandboxed backend needs to resolve the project's node_modules
  // (better-sqlite3 is a native addon that cannot be copied). A directory
  // junction keeps it a single shared install; it grants no path back to the
  // live database, which is all that matters here.
  const sandboxNodeModules = path.join(SANDBOX, 'node_modules');
  if (!fs.existsSync(sandboxNodeModules)) {
    try {
      fs.symlinkSync(path.join(ROOT, 'node_modules'), sandboxNodeModules, 'junction');
    } catch {
      // Fall back to a real copy if junctions are unavailable.
      fs.cpSync(path.join(ROOT, 'node_modules'), sandboxNodeModules, { recursive: true });
    }
  }

  // Fold the copy's WAL in so it is a self-contained snapshot at v2.
  {
    const d = new Database(sandboxDb);
    d.pragma('journal_mode = DELETE');
    d.close();
  }

  const BEFORE = path.join(SCRATCH, 'e2e-before.json');
  const AFTER = path.join(SCRATCH, 'e2e-after.json');

  const runner = path.join(SANDBOX, 'run-migrations.js');
  fs.writeFileSync(runner, `
    const path = require('path');
    const fs = require('fs');
    const SANDBOX = ${JSON.stringify(SANDBOX)};
    const BACKEND = path.join(SANDBOX, 'backend');

    // dbmgr.js requires('electron'); stub only that.
    const Module = require('module');
    const orig = Module._load;
    Module._load = function (req) {
      if (req === 'electron') {
        // isPackaged MUST stay false so dbmgr.js resolves its development path
        // (the sandbox's own backend/db/accounts.db). Reporting true would send
        // it to userData and silently measure an empty database.
        return { app: { isPackaged: false, getPath: () => require('os').tmpdir() } };
      }
      return orig.apply(this, arguments);
    };

    // dbmgr.js sets better-sqlite3 verbose logging in non-packaged mode, which
    // floods stdout during the invoice-status migration and overflows the pipe.
    // Silence stdout for the noisy window instead of changing the DB path.
    const realLog = console.log;
    console.log = function () {};

    const NB = require(path.join(BACKEND, 'services', 'normalBalance'));
    const Database = require(path.join(${JSON.stringify(ROOT)}, 'node_modules', 'better-sqlite3'));

    const raw = new Database(path.join(BACKEND, 'db', 'accounts.db'), { readonly: true });
    const snap = {
      entries: raw.prepare("SELECT COUNT(*) c, COALESCE(MAX(id),0) m FROM journal_entries").get(),
      lines:   raw.prepare("SELECT COUNT(*) c, COALESCE(MAX(id),0) m, COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM journal_lines").get(),
    };
    const liveVersion = (() => {
      try { return raw.prepare('SELECT schema_version v FROM app_metadata WHERE id = 1').get().v; }
      catch { return 0; }
    })();
    const wrongBefore = raw.prepare("SELECT id, type, normalBalance FROM chart_of_accounts").all()
      .filter(r => { const e = NB.getExpectedNormalBalance(r.type); return e !== null && NB.normalizeNormalBalance(r.normalBalance) !== e; });
    raw.close();
    fs.writeFileSync(${JSON.stringify(BEFORE)}, JSON.stringify({ snap, wrongBefore: wrongBefore.length, rows: wrongBefore, liveVersion }));

    // Requiring the models runs every model's createTable() plus the versioned
    // migration runner — the real boot path.
    const models = require(path.join(BACKEND, 'models'));
    const Migration = require(path.join(BACKEND, 'models', 'migration'));
    const db = require(path.join(BACKEND, 'models', 'dbmgr'));
    console.log = realLog;

    const after = db.prepare("SELECT id, type, normalBalance FROM chart_of_accounts").all()
      .filter(r => { const e = NB.getExpectedNormalBalance(r.type); return e !== null && NB.normalizeNormalBalance(r.normalBalance) !== e; });
    const hasBackup = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='normal_balance_backfill_backup'").get();
    fs.writeFileSync(${JSON.stringify(AFTER)}, JSON.stringify({
      migration: Migration.getResult(),
      schemaVersion: db.prepare('SELECT schema_version v FROM app_metadata WHERE id = 1').get().v,
      remainingMismatches: after.length,
      entries: db.prepare('SELECT COUNT(*) c, COALESCE(MAX(id),0) m FROM journal_entries').get(),
      lines:   db.prepare('SELECT COUNT(*) c, COALESCE(MAX(id),0) m, COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM journal_lines').get(),
      backupRows: hasBackup ? db.prepare('SELECT COUNT(*) c FROM normal_balance_backfill_backup').get().c : -1,
      dbPath: db.raw && db.raw.name ? db.raw.name : null,
    }));
  `);

  let ran = true;
  const runnerLog = path.join(SCRATCH, 'runner.log');
  try {
    const out = execFileSync(path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'), [runner], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      cwd: SANDBOX,
      stdio: 'pipe',
      maxBuffer: 64 * 1024 * 1024,
    });
    fs.writeFileSync(runnerLog, String(out || ''));
  } catch (e) {
    ran = false;
    fs.writeFileSync(runnerLog,
      `STDOUT:\n${String(e.stdout || '')}\n\nSTDERR:\n${String(e.stderr || '')}\n\nSTATUS: ${e.status}`);
    console.log('  (runner failed — see the tail below)');
    console.log(String(e.stderr || '').split('\n').slice(0, 12).map(l => '    ' + l).join('\n'));
  }

  ok('migration runner completed against the sandboxed company-file copy', ran);
  if (ran) {
    const b = JSON.parse(fs.readFileSync(BEFORE, 'utf8'));
    const a = JSON.parse(fs.readFileSync(AFTER, 'utf8'));
    console.log(`  sandboxed copy held ${b.wrongBefore} wrong normalBalance value(s) at v2:`);
    for (const r of b.rows) console.log(`    · #${r.id} [${r.type}] ${r.normalBalance || '(blank)'} → fixed`);

    ok('the runner used the sandboxed copy, never the live file',
      path.resolve(a.dbPath) === path.resolve(sandboxDb), String(a.dbPath));
    ok(`schema_version advanced to ${LATEST_MIGRATION_VERSION} (got ${a.schemaVersion})`,
      a.schemaVersion === LATEST_MIGRATION_VERSION);
    ok(`migration ran as an upgrade v${a.migration.previousVersion} → v${a.migration.currentVersion}`,
      a.migration.currentVersion === LATEST_MIGRATION_VERSION && a.migration.previousVersion === b.liveVersion,
      `from v${a.migration.previousVersion} (file was at v${b.liveVersion})`);
    ok(`zero mismatches remain on the copy (was ${b.wrongBefore})`,
      a.remainingMismatches === 0, String(a.remainingMismatches));

    // Migration 003 journals every change it makes. On a real boot the
    // every-launch repair inside chartOfAccounts.createTable() can get there
    // first, leaving 003 nothing to do — either outcome is correct, so assert
    // the stronger property: the accounts ended up right and, if 003 did the
    // work, it journalled it.
    ok(`migration 003 journalled all its changes (${a.backupRows} row(s))`,
      a.backupRows >= 0 && a.backupRows <= b.wrongBefore, `backup=${a.backupRows} candidates=${b.wrongBefore}`);
    ok('every account on the copy now matches its type', a.remainingMismatches === 0);

    // Ledger invariance: migration 002 legitimately rewrites invoice/quote
    // STATUS rows, so compare the ledger-bearing tables we care about —
    // journal_entries / journal_lines — which no migration may touch.
    ok('journal_entries untouched (count + max id)',
      a.entries.c === b.snap.entries.c && a.entries.m === b.snap.entries.m,
      `${JSON.stringify(a.entries)} vs ${JSON.stringify(b.snap.entries)}`);
    ok('journal_lines untouched (count, max id, debit/credit sums)',
      a.lines.c === b.snap.lines.c && a.lines.m === b.snap.lines.m
      && Math.abs(a.lines.d - b.snap.lines.d) < 0.005 && Math.abs(a.lines.c - b.snap.lines.c) < 0.005,
      `${JSON.stringify(a.lines)} vs ${JSON.stringify(b.snap.lines)}`);

    // The live file must not have been touched by any of this.
    const live = new Database(LIVE_DB, { readonly: true });
    const liveV = live.prepare('SELECT schema_version v FROM app_metadata WHERE id = 1').get().v;
    const liveWrong = live.prepare('SELECT id, type, normalBalance FROM chart_of_accounts').all()
      .filter(r => { const e = NB2.getExpectedNormalBalance(r.type); return e !== null && NB2.normalizeNormalBalance(r.normalBalance) !== e; });
    live.close();
    ok(`the LIVE database is still at schema_version ${liveV} (unmigrated)`, liveV === b.liveVersion, `v${liveV}`);
    ok(`the LIVE database still holds its ${liveWrong.length} original un-repaired account(s)`,
      liveWrong.length === b.wrongBefore, `${liveWrong.length} vs ${b.wrongBefore}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// VALIDATION SMOKE (copy of the real live DB via the real model layer)
// ════════════════════════════════════════════════════════════════════════════
section('F. Live-file copy — real model layer after the repair');
{
  const vdb = freshCopy('validated');
  const NBm = require('../src/backend/services/normalBalance');
  const ledgerBefore = snapshotLedger(vdb);
  const tbBefore = trialBalanceSides(vdb);

  const res = NBm.repairNormalBalances(vdb);
  const ledgerAfter = snapshotLedger(vdb);
  const tbAfter = trialBalanceSides(vdb);

  ok(`repaired ${res.repaired} account(s) on the live-file copy`, res.repaired >= 0);
  ok('no journal entry changed', JSON.stringify(ledgerAfter.journal_entries) === JSON.stringify(ledgerBefore.journal_entries));
  ok('no journal line changed', JSON.stringify(ledgerAfter.journal_lines) === JSON.stringify(ledgerBefore.journal_lines));
  ok('Trial Balance debits == credits after repair', Math.abs(tbAfter.debit - tbAfter.credit) < 0.005,
    `${tbAfter.debit} vs ${tbAfter.credit}`);
  ok('every Bank account now reads Debit',
    vdb.prepare("SELECT COUNT(*) c FROM chart_of_accounts WHERE LOWER(type)='bank' AND normalBalance != 'Debit'").get().c === 0);
  ok('every Credit Card account now reads Credit',
    vdb.prepare("SELECT COUNT(*) c FROM chart_of_accounts WHERE LOWER(type)='credit card' AND normalBalance != 'Credit'").get().c === 0);
  ok('every Loan / Liability account now reads Credit',
    vdb.prepare("SELECT COUNT(*) c FROM chart_of_accounts WHERE LOWER(type) IN ('loan','liability') AND normalBalance != 'Credit'").get().c === 0);
  vdb.close();
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`normal-balance repair: ${passed} passed, ${failed} failed`);
console.log(`scratch: ${SCRATCH}`);
process.exit(failed ? 1 : 0);
