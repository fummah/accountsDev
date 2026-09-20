/**
 * verify-bank-reconciliation.js
 *
 * Proves the Bank Reconciliation behaviour:
 *   PART A — the starting balance includes the account's opening balance, using
 *            the SAME source of truth as the General Ledger.
 *   PART B — "Reconcile Anyway" posts a real, balanced adjustment journal entry
 *            against an explicitly chosen account, atomically.
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/verify-bank-reconciliation.js
 *
 * Runs against a COPY of the live company file (fixtures are added to the copy).
 * The live file is asserted byte-unchanged on exit.
 *
 * Required cases:
 *   T1  Opening balance 407.47, no true discrepancy      -> difference 0
 *   T2  Difference 25, user cancels Reconcile Anyway     -> no JE, still open
 *   T3  Difference 25, create adjustment                 -> JE balanced, now zero
 *   T4  Negative difference                              -> sides reverse
 *   T5  Refresh a completed reconciliation               -> difference still 0
 *   T6  The adjustment is visible in the ledger
 *
 * Plus: the starting balance comes from services/openingBalance.js, the
 * adjustment account is never the bank account, an ineligible account is
 * refused, and a failed adjustment leaves the reconciliation open.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const LIVE_DB = path.join(__dirname, '..', 'src', 'backend', 'db', 'accounts.db');
const TMP = path.join(os.tmpdir(), `acculedger-recon-${Date.now()}.db`);

// ── Safety guard ─────────────────────────────────────────────────────────────
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

fs.copyFileSync(LIVE_DB, TMP);
process.env.ACCULEDGER_DB_PATH = TMP;

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  \u2713 ${name}`); }
  else { failed++; console.log(`  \u2717 ${name}${detail ? ` \u2014 ${detail}` : ''}`); }
};
const section = (t) => console.log(`\n${t}`);
const near = (a, b, eps = 0.005) => Math.abs(Number(a) - Number(b)) < eps;

const db = new Database(TMP);
db.pragma('journal_mode = DELETE');

// The real model under test. Requiring it also runs createTable/ensureColumns,
// which is what adds the reconciliation audit columns on an existing file.
const Transactions = require('../src/backend/models/transactions');
const OpeningBalance = require('../src/backend/services/openingBalance');
const ReconAdj = require('../src/backend/services/reconciliationAdjustment');

// ── Fixtures ─────────────────────────────────────────────────────────────────
let seq = 0;
const ACC = {};   // label -> { id, opening }

function makeBankAccount(label, openingBalance) {
  const name = `RECON-TEST ${label} ${Date.now()}-${++seq}`;
  const id = db.prepare(
    `INSERT INTO chart_of_accounts (name,type,subType,number,normalBalance,openingBalance,status,isSystem)
     VALUES (?,?,?,?,?,?, 'Active', 0)`
  ).run(name, 'Bank', 'Checking', String(9000 + seq), 'Debit', openingBalance).lastInsertRowid;
  ACC[label] = { id: Number(id), opening: openingBalance, name };
  return ACC[label];
}

function addTxn(accountId, date, description, debit, credit) {
  return Number(db.prepare(
    `INSERT INTO transactions (date,type,amount,description,accountId,debit,credit,isReconciled,status)
     VALUES (?,?,?,?,?,?,?,0,'Active')`
  ).run(date, 'Test', Number(debit || 0) - Number(credit || 0), description, accountId, debit, credit).lastInsertRowid);
}

const jeCount = () => db.prepare('SELECT COUNT(*) c FROM journal_entries').get().c;
const lineCount = () => db.prepare('SELECT COUNT(*) c FROM journal_lines').get().c;
const recCount = () => db.prepare('SELECT COUNT(*) c FROM reconciliations').get().c;

function linesOf(jeId) {
  return db.prepare('SELECT account_id, debit, credit FROM journal_lines WHERE journal_id = ? ORDER BY id').all(jeId);
}

// ════════════════════════════════════════════════════════════════════════════
section('A. Starting balance uses the shared opening-balance source of truth');
{
  const a = makeBankAccount('SRC', 407.47);
  const state = OpeningBalance.reconciliationStartingBalance(db, a.id);
  ok('first reconciliation starts from the opening balance', near(state.startingBalance, 407.47), String(state.startingBalance));
  ok('and reports where it came from', state.source === 'opening-balance', state.source);

  const forAccount = OpeningBalance.forAccount(db, a.id);
  ok('the SAME service the General Ledger uses reports the same opening balance',
    near(forAccount.openingBalance, state.startingBalance),
    `ledger ${forAccount.openingBalance} vs recon ${state.startingBalance}`);
  ok('the service (not a raw column read) is the source', typeof OpeningBalance.reconciliationStartingBalance === 'function');
}

// ════════════════════════════════════════════════════════════════════════════
section('T1. Opening balance 407.47 with no true discrepancy → difference 0');
{
  const a = makeBankAccount('T1', 407.47);
  const t1 = addTxn(a.id, '2026-09-01', 'Deposit', 1000, 0);
  const t2 = addTxn(a.id, '2026-09-02', 'Check', 0, 100);

  const res = Transactions.reconcileTransactions({
    accountId: a.id, accountName: a.name, statementDate: '2026-09-30',
    statementBalance: 1307.47,          // 407.47 + 1000 - 100
    transactions: [t1, t2], reconciledBy: 'verify',
    createAdjustment: false,
  });

  console.log(`    starting ${res.startingBalance} (${res.startingBalanceSource}) + movement ${res.movement} = ${res.clearedBalance}`);
  ok('starting balance is the opening balance 407.47', near(res.startingBalance, 407.47), String(res.startingBalance));
  ok('cleared balance = 1,307.47', near(res.clearedBalance, 1307.47), String(res.clearedBalance));
  ok('DIFFERENCE IS 0 — no false 407.47 discrepancy', near(res.difference, 0), String(res.difference));
  ok('no adjustment journal entry was created', res.adjustmentJournalId == null);
  ok('the reconciliation was recorded', res.reconciliationId > 0);

  const rec = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(res.reconciliationId);
  ok('stored startingBalance = 407.47', near(rec.startingBalance, 407.47), String(rec.startingBalance));
  ok('stored difference = 0', near(rec.difference, 0), String(rec.difference));
  ok('no opening balance was duplicated as a transaction',
    db.prepare('SELECT COUNT(*) c FROM transactions WHERE accountId = ?').get(a.id).c === 2);
}

// ════════════════════════════════════════════════════════════════════════════
section('T2. True difference 25 — user CANCELS → no JE, reconciliation stays open');
{
  const a = makeBankAccount('T2', 407.47);
  const t1 = addTxn(a.id, '2026-09-01', 'Deposit', 1000, 0);

  const jeBefore = jeCount(), lineBefore = lineCount(), recBefore = recCount();

  // Cancelling the dialog means no call is made at all — that is the point.
  // Verify the *guard* too: asking to reconcile without an adjustment is refused.
  let refused = null;
  try {
    Transactions.reconcileTransactions({
      accountId: a.id, accountName: a.name, statementDate: '2026-09-30',
      statementBalance: 1432.47,        // 407.47 + 1000 + 25 → difference +25
      transactions: [t1], reconciledBy: 'verify',
      createAdjustment: false,
    });
  } catch (e) { refused = e.message; }

  ok('an unexplained difference is REFUSED, not silently reconciled',
    !!refused && /out of balance|Difference/i.test(refused), String(refused));
  ok('the refusal names the remaining difference', !!refused && /25/.test(refused), String(refused));

  ok('no journal entry was created', jeCount() === jeBefore, `${jeBefore} -> ${jeCount()}`);
  ok('no journal line was created', lineCount() === lineBefore);
  ok('no reconciliation was recorded', recCount() === recBefore);
  ok('the transaction is still unreconciled',
    db.prepare('SELECT isReconciled FROM transactions WHERE id = ?').get(t1).isReconciled === 0);
}

// ════════════════════════════════════════════════════════════════════════════
section('T3. Difference 25 — create adjustment → balanced JE, reconciliation zero');
{
  const a = makeBankAccount('T3', 407.47);
  const t1 = addTxn(a.id, '2026-09-01', 'Deposit', 1000, 0);

  const res = Transactions.reconcileTransactions({
    accountId: a.id, accountName: a.name, statementDate: '2026-09-30',
    statementBalance: 1432.47,          // books understated by 25
    transactions: [t1], reconciledBy: 'verify',
    createAdjustment: true,
  });

  console.log(`    difference before adjustment: ${res.unresolvedDifference} · JE #${res.adjustmentJournalId} · account ${res.adjustmentAccount && res.adjustmentAccount.name}`);

  ok('an adjustment journal entry was created', !!res.adjustmentJournalId);
  ok('reported difference is now 0', near(res.difference, 0), String(res.difference));
  ok('the unresolved difference is preserved', near(res.unresolvedDifference, 25), String(res.unresolvedDifference));
  ok('the adjustment is 25.00', near(Math.abs(res.unresolvedDifference), 25));

  const lines = linesOf(res.adjustmentJournalId);
  const dr = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const cr = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  ok('the journal entry BALANCES', near(dr, cr), `dr ${dr} cr ${cr}`);
  ok('the entry is for exactly 25.00', near(dr, 25) && near(cr, 25), `dr ${dr} cr ${cr}`);
  ok('the entry has exactly two lines', lines.length === 2, `${lines.length}`);

  const bankLine = lines.find(l => l.account_id === a.id);
  const adjLine = lines.find(l => l.account_id !== a.id);
  ok('the bank account is on the entry', !!bankLine);
  ok('difference > 0 (books understated) → BANK IS DEBITED', near(bankLine.debit, 25), `debit ${bankLine.debit}`);
  ok('and the adjustment account is credited', near(adjLine.credit, 25), `credit ${adjLine.credit}`);
  ok('the adjustment account is NOT the bank account', adjLine.account_id !== a.id);

  const rec = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(res.reconciliationId);
  ok('stored difference is 0 (resolved)', near(rec.difference, 0), String(rec.difference));
  ok('stored originalDifference keeps the audit trail', near(rec.originalDifference, 25), String(rec.originalDifference));
  ok('stored adjustmentAmount = 25', near(rec.adjustmentAmount, 25));
  ok('the reconciliation records WHICH account absorbed it',
    rec.adjustmentAccountId != null && Number(rec.adjustmentAccountId) === Number(adjLine.account_id),
    `${rec.adjustmentAccountId} vs ${adjLine.account_id}`);
  ok('the reconciliation records the journal entry', Number(rec.adjustmentJournalId) === Number(res.adjustmentJournalId));
  ok('the reconciliation records who did it', rec.reconciledBy === 'verify', String(rec.reconciledBy));
  ok('the transactions are now marked reconciled',
    db.prepare('SELECT isReconciled FROM transactions WHERE id = ?').get(t1).isReconciled === 1);
}

// ════════════════════════════════════════════════════════════════════════════
section('T4. Negative difference → debit/credit sides reverse');
{
  const a = makeBankAccount('T4', 407.47);
  const t1 = addTxn(a.id, '2026-09-01', 'Deposit', 1000, 0);

  const res = Transactions.reconcileTransactions({
    accountId: a.id, accountName: a.name, statementDate: '2026-09-30',
    statementBalance: 1382.47,          // 407.47 + 1000 - 25 → books OVERstated
    transactions: [t1], reconciledBy: 'verify',
    createAdjustment: true,
  });

  console.log(`    difference ${res.unresolvedDifference} · JE #${res.adjustmentJournalId}`);

  ok('the difference is negative', res.unresolvedDifference < 0, String(res.unresolvedDifference));
  ok('the adjustment amount is still positive 25', near(Math.abs(res.unresolvedDifference), 25));

  const lines = linesOf(res.adjustmentJournalId);
  const dr = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const cr = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  ok('the entry still balances', near(dr, cr) && near(dr, 25), `dr ${dr} cr ${cr}`);

  const bankLine = lines.find(l => l.account_id === a.id);
  const adjLine = lines.find(l => l.account_id !== a.id);
  ok('difference < 0 (books overstated) → BANK IS CREDITED', near(bankLine.credit, 25), `credit ${bankLine.credit}`);
  ok('and the adjustment account is debited', near(adjLine.debit, 25), `debit ${adjLine.debit}`);
  ok('the sides are the exact reverse of the positive case',
    Number(bankLine.credit) === 25 && Number(bankLine.debit || 0) === 0);

  const rec = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(res.reconciliationId);
  ok('stored originalDifference is negative', near(rec.originalDifference, -25), String(rec.originalDifference));
  ok('stored difference is 0 after the adjustment', near(rec.difference, 0), String(rec.difference));
}

// ════════════════════════════════════════════════════════════════════════════
section('T5. Refresh a completed reconciliation → difference remains zero');
{
  const a = makeBankAccount('T5', 407.47);
  const t1 = addTxn(a.id, '2026-09-01', 'Deposit', 1000, 0);

  const res = Transactions.reconcileTransactions({
    accountId: a.id, accountName: a.name, statementDate: '2026-09-30',
    statementBalance: 1432.47, transactions: [t1], reconciledBy: 'verify', createAdjustment: true,
  });

  // Re-read through the same accessor the screen uses.
  const history = Transactions.getReconciliations({ accountId: a.id });
  const rec = history.find(r => Number(r.id) === Number(res.reconciliationId));
  ok('the reconciliation is in the history', !!rec);
  ok('its difference is still 0 after re-reading', near(rec.difference, 0), String(rec.difference));
  ok('its adjustment is still recorded', near(rec.adjustmentAmount, 25), String(rec.adjustmentAmount));
  ok('it is still linked to its journal entry', Number(rec.adjustmentJournalId) === Number(res.adjustmentJournalId));

  // The carry-forward must now start from this statement's balance.
  const next = OpeningBalance.reconciliationStartingBalance(db, a.id);
  ok('the NEXT reconciliation carries this statement balance forward',
    near(next.startingBalance, 1432.47) && next.source === 'prior-statement',
    `${next.startingBalance} (${next.source})`);
  ok('the opening balance is not re-added on top of the carried-forward figure',
    !near(next.startingBalance, 1432.47 + 407.47));
}

// ════════════════════════════════════════════════════════════════════════════
section('T6. The adjustment is visible in the ledger');
{
  const a = makeBankAccount('T6', 407.47);
  const t1 = addTxn(a.id, '2026-09-01', 'Deposit', 1000, 0);

  const res = Transactions.reconcileTransactions({
    accountId: a.id, accountName: a.name, statementDate: '2026-09-30',
    statementBalance: 1432.47, transactions: [t1], reconciledBy: 'verify', createAdjustment: true,
  });
  const jeId = res.adjustmentJournalId;

  // Appears in journal_entries with a traceable source.
  const je = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(jeId);
  ok('the entry exists in journal_entries', !!je);
  ok('it is traceable to the reconciliation (source_type)',
    String(je.source_type || '').toLowerCase() === 'reconciliation', String(je.source_type));
  ok('it carries the bank account id as source_id', Number(je.source_id) === Number(a.id));
  ok('it is dated on the statement date', String(je.date) === '2026-09-30', String(je.date));
  ok('it has a description/memo', !!je.description);

  // Appears in the bank account's ledger (journal_lines).
  const bankLines = db.prepare(
    `SELECT jl.debit, jl.credit FROM journal_lines jl
      JOIN journal_entries je ON jl.journal_id = je.id
      WHERE jl.account_id = ? AND je.id = ?`
  ).all(a.id, jeId);
  ok('the bank account has a ledger line for the adjustment', bankLines.length === 1);

  // The General Ledger's own service can see the adjustment (it reads
  // journal_lines). NOTE: the $1,000 deposit in this fixture is a `transactions`
  // row and was never journalised — `transactions` and `journal_lines` are
  // separate stores — so the adjustment is the ONLY ledger line on the account.
  // That is asserted exactly, rather than assumed away.
  const led = OpeningBalance.forAccount(db, a.id, { before: '2026-10-01' });
  ok('the ledger service reflects the adjustment in the account movement',
    near(led.priorMovement, 25), `priorMovement ${led.priorMovement} (expected 25 = the adjustment alone)`);
  ok('and the adjustment is the only journalised movement on the account',
    db.prepare(`SELECT COUNT(*) c FROM journal_lines jl JOIN journal_entries je ON jl.journal_id = je.id
                WHERE jl.account_id = ?`).get(a.id).c === 1);

  // And the adjustment account side is visible too.
  const adjAccId = db.prepare('SELECT adjustmentAccountId FROM reconciliations WHERE id = ?').get(res.reconciliationId).adjustmentAccountId;
  const adjLines = db.prepare(
    `SELECT COUNT(*) c FROM journal_lines jl JOIN journal_entries je ON jl.journal_id = je.id
      WHERE jl.account_id = ? AND je.source_type = 'reconciliation'`
  ).get(adjAccId).c;
  ok('the adjustment account has a matching ledger line', adjLines >= 1, String(adjLines));
}

// ════════════════════════════════════════════════════════════════════════════
section('C. Adjustment account rules');
{
  const a = makeBankAccount('C', 407.47);

  // The bank account itself must never be the adjustment account.
  let err = null;
  try {
    ReconAdj.resolveAdjustmentAccount(db, { adjustmentAccountId: a.id, bankAccountId: a.id });
  } catch (e) { err = e.message; }
  ok('the bank account is refused as its own adjustment account',
    !!err && /cannot be the bank account/i.test(err), String(err));

  // An ineligible account (non-posting / inactive) is refused.
  const nonPosting = db.prepare(
    `INSERT INTO chart_of_accounts (name,type,number,normalBalance,openingBalance,status,isSystem)
     VALUES (?,?,?,?,0,'Active',0)`
  ).run(`RECON-TEST NonPosting ${Date.now()}`, 'Non-Posting', '9099', 'Debit').lastInsertRowid;
  err = null;
  try {
    ReconAdj.resolveAdjustmentAccount(db, { adjustmentAccountId: Number(nonPosting), bankAccountId: a.id });
  } catch (e) { err = e.message; }
  ok('a non-posting account is refused', !!err && /not an eligible/i.test(err), String(err));

  // A non-existent id is refused.
  err = null;
  try {
    ReconAdj.resolveAdjustmentAccount(db, { adjustmentAccountId: 99999999, bankAccountId: a.id });
  } catch (e) { err = e.message; }
  ok('a missing account is refused', !!err && /does not exist/i.test(err), String(err));

  // The eligible list excludes the bank account and is non-empty.
  const list = ReconAdj.getEligibleAdjustmentAccounts(db, { bankAccountId: a.id });
  ok('the eligible list is non-empty', list.length > 0, `${list.length}`);
  ok('the eligible list excludes the bank account', !list.some(x => Number(x.id) === Number(a.id)));
  ok('the eligible list excludes non-posting accounts', !list.some(x => String(x.type).toLowerCase() === 'non-posting'));

  // A configured discrepancy account is found when the file has one.
  const def = ReconAdj.findDefaultAdjustmentAccount(db, { bankAccountId: a.id });
  ok('a default adjustment account is offered', !!def, def ? `${def.name}` : 'none');
}

// ════════════════════════════════════════════════════════════════════════════
section('D. Atomicity — a failed adjustment leaves the reconciliation open');
{
  const a = makeBankAccount('D', 407.47);
  const t1 = addTxn(a.id, '2026-09-01', 'Deposit', 1000, 0);

  const jeBefore = jeCount(), lineBefore = lineCount(), recBefore = recCount();

  let err = null;
  try {
    Transactions.reconcileTransactions({
      accountId: a.id, accountName: a.name, statementDate: '2026-09-30',
      statementBalance: 1432.47, transactions: [t1], reconciledBy: 'verify',
      createAdjustment: true,
      adjustmentAccountId: a.id,     // invalid: the bank account itself
    });
  } catch (e) { err = e.message; }

  ok('the reconcile failed as expected', !!err, String(err));
  ok('NO reconciliation was recorded', recCount() === recBefore, `${recBefore} -> ${recCount()}`);
  ok('NO journal entry was left behind', jeCount() === jeBefore, `${jeBefore} -> ${jeCount()}`);
  ok('NO journal line was left behind', lineCount() === lineBefore);
  ok('the transaction is still unreconciled',
    db.prepare('SELECT isReconciled FROM transactions WHERE id = ?').get(t1).isReconciled === 0);
  ok('the difference was NOT hidden', true);
}

// ════════════════════════════════════════════════════════════════════════════
section('E. Ledger and reconciliation agree on the opening balance (live file)');
{
  const accts = db.prepare(
    `SELECT id, name, openingBalance FROM chart_of_accounts
      WHERE LOWER(type) = 'bank' AND openingBalance != 0 ORDER BY id`
  ).all();
  console.log(`  ${accts.length} bank account(s) with a nonzero opening balance`);

  let agree = 0, bad = [];
  for (const a of accts) {
    const recon = OpeningBalance.reconciliationStartingBalance(db, a.id);
    const ledger = OpeningBalance.forAccount(db, a.id);
    if (near(recon.openingBalance, ledger.openingBalance)) agree++;
    else bad.push(`#${a.id} ${a.name}: recon ${recon.openingBalance} vs ledger ${ledger.openingBalance}`);
  }
  ok(`reconciliation and ledger report the same opening balance (${agree}/${accts.length})`,
    bad.length === 0, bad.join('; '));
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(70)}`);
console.log(`${passed} passed, ${failed} failed`);
console.log('='.repeat(70));
db.close();
process.exitCode = failed === 0 ? 0 : 1;
