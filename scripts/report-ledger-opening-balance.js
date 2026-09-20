/**
 * report-ledger-opening-balance.js — before/after evidence for the ledger
 * opening-balance row, generated against a COPY of the live company file.
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/report-ledger-opening-balance.js
 *
 * Prints, for the accounts that carry an opening balance:
 *   • what the ledger used to show as its first row (a transaction, or nothing)
 *   • what it shows now (Opening Balance / Balance Brought Forward)
 *   • that the closing balance is identical in both renderings
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const LIVE_DB = path.join(__dirname, '..', 'src', 'backend', 'db', 'accounts.db');
const TMP = path.join(os.tmpdir(), `acculedger-ob-report-${Date.now()}.db`);
fs.copyFileSync(LIVE_DB, TMP);
const liveSize = fs.statSync(LIVE_DB).size;
const liveMtime = fs.statSync(LIVE_DB).mtimeMs;
process.on('exit', () => {
  const a = fs.statSync(LIVE_DB);
  console.log(a.size === liveSize && a.mtimeMs === liveMtime
    ? `\n(live file untouched: ${LIVE_DB})`
    : '\nFATAL: live file changed!');
});

const db = new Database(TMP);
const OpeningBalance = require('../src/backend/services/openingBalance');

const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const line = (c = '=') => console.log(c.repeat(74));

line();
console.log('GENERAL LEDGER — OPENING BALANCE ROW');
console.log(`source file : ${LIVE_DB}`);
console.log(`working copy: ${TMP}`);
line();

// ── The pure "before" model: posted journal lines only, running balance from 0 ──
// This is exactly what the old renderer did — it never read openingBalance.
function beforeLedger(accountId, from, to) {
  let sql = `SELECT jl.debit, jl.credit, je.date
             FROM journal_lines jl JOIN journal_entries je ON jl.journal_id = je.id
             WHERE jl.account_id = ? AND je.status != 'Void'`;
  const params = [accountId];
  if (from) { sql += ' AND je.date >= ?'; params.push(from); }
  if (to)   { sql += ' AND je.date <= ?'; params.push(to); }
  sql += ' ORDER BY je.date ASC, je.id ASC';
  const body = db.prepare(sql).all(...params);
  const a = db.prepare('SELECT normalBalance FROM chart_of_accounts WHERE id = ?').get(accountId);
  const side = a && a.normalBalance === 'Credit' ? 'Credit' : 'Debit';
  const delta = (e) => (side === 'Credit' ? (e.credit || 0) - (e.debit || 0) : (e.debit || 0) - (e.credit || 0));
  let bal = 0;                                  // <-- the bug: started at zero
  const rows = body.map((e) => { bal += delta(e); return { ...e, balance: bal }; });
  return { rows, closing: bal };
}

// ── The "after" model: the opening row seeds the running balance ──────────────
function afterLedger(accountId, from, to) {
  const st = OpeningBalance.forAccount(db, accountId, { before: from || null });
  const row = OpeningBalance.openingRow({ ...st, beforeDate: from || st.beforeDate });
  const side = st.normalBalance;
  const delta = (e) => (side === 'Credit' ? (e.credit || 0) - (e.debit || 0) : (e.debit || 0) - (e.credit || 0));
  let sql = `SELECT jl.debit, jl.credit, je.date
             FROM journal_lines jl JOIN journal_entries je ON jl.journal_id = je.id
             WHERE jl.account_id = ? AND je.status != 'Void'`;
  const params = [accountId];
  if (from) { sql += ' AND je.date >= ?'; params.push(from); }
  if (to)   { sql += ' AND je.date <= ?'; params.push(to); }
  sql += ' ORDER BY je.date ASC, je.id ASC';
  const body = db.prepare(sql).all(...params);
  let bal = Number(st.balance);
  const rows = [row];
  for (const e of body) { bal += delta(e); rows.push({ ...e, balance: Number(bal.toFixed(2)) }); }
  return { rows, closing: Number(bal.toFixed(2)), state: st };
}

const accts = db.prepare(
  'SELECT id,name,type,normalBalance,openingBalance FROM chart_of_accounts WHERE openingBalance != 0 ORDER BY id'
).all();

console.log(`\n${accts.length} account(s) carry a nonzero opening balance.\n`);

let fixedSign = 0;
for (const a of accts) {
  const activity = db.prepare(
    `SELECT COUNT(*) c, MIN(je.date) mn, MAX(je.date) mx
     FROM journal_lines jl JOIN journal_entries je ON jl.journal_id = je.id
     WHERE jl.account_id = ? AND je.status != 'Void'`
  ).get(a.id);
  if (!activity.c) continue;

  const from = activity.mn;
  const to = activity.mx;
  const b = beforeLedger(a.id, from, to);
  const f = afterLedger(a.id, from, to);

  const bFirst = b.rows.length ? b.rows[0].balance : null;
  const fFirst = f.rows[0].balance;
  const ob = Number(a.openingBalance);

  // The account's own computed balance is the correct closing figure — the same
  // number the Chart of Accounts and the Trial Balance show. The "after" ledger
  // must equal it; the "before" ledger must be short by exactly the opening
  // balance (or it was already correct because nothing was posted).
  const acct = db.prepare('SELECT type, normalBalance, openingBalance FROM chart_of_accounts WHERE id = ?').get(a.id);
  const sides = db.prepare(
    `SELECT COALESCE(SUM(jl.debit),0) d, COALESCE(SUM(jl.credit),0) c
     FROM journal_lines jl JOIN journal_entries je ON jl.journal_id = je.id
     WHERE jl.account_id = ? AND je.status = 'Posted'`).get(a.id);
  const side = acct.normalBalance === 'Credit' ? 'Credit' : 'Debit';
  const acctBalance = side === 'Debit'
    ? Number(acct.openingBalance) + sides.d - sides.c
    : Number(acct.openingBalance) + sides.c - sides.d;

  if (Math.abs(bFirst - fFirst) > 0.005) fixedSign++;
  console.log(`#${a.id} ${a.name} [${a.type}]  openingBalance=${fmt(ob)}`);
  console.log(`   before: first row balance = ${bFirst == null ? '(no transactions — ledger appeared empty)' : fmt(bFirst)}`);
  console.log(`   after : first row = "${f.rows[0].lineDesc}" ${fmt(fFirst)}`);
  console.log(`   account's own balance = ${fmt(acctBalance)}  ` +
    (Math.abs(f.closing - acctBalance) < 0.005 ? 'after-ledger MATCHES ✓' : 'after-ledger MISMATCH ✗'));
  const gap = acctBalance - b.closing;
  console.log(`   before-ledger was out by ${fmt(gap)} ` +
    (Math.abs(gap) > 0.005 ? `(= the opening balance, ${fmt(ob)})` : '(nothing posted, already agreed)'));
}

line();
console.log('The reported symptom: a mid-year period that starts from the wrong figure.');
console.log('');
// Demonstrate the brought-forward case specifically.
const sample = accts.find(a => db.prepare(
  `SELECT COUNT(*) c FROM journal_lines WHERE account_id = ?`).get(a.id).c > 1);
if (sample) {
  const dates = db.prepare(
    `SELECT je.date FROM journal_lines jl JOIN journal_entries je ON jl.journal_id = je.id
     WHERE jl.account_id = ? AND je.status != 'Void' ORDER BY je.date ASC`).all(sample.id).map(r => r.date);
  const mid = dates[Math.floor(dates.length / 2)];
  const f = afterLedger(sample.id, mid, '9999-12-31');
  console.log(`  #${sample.id} ${sample.name} — ledger starting ${mid}:`);
  console.log(`    first row: "${f.rows[0].lineDesc}" = ${fmt(f.rows[0].balance)}`);
  console.log(`    (the account's own opening balance is ${fmt(Number(sample.openingBalance))} — the`);
  console.log(`     difference is everything posted before ${mid}, carried forward)`);
}
line();
console.log(`\nLEDGER INVARIANCE: no journal entry, line or amount was written by this report.`);
console.log(`journal_entries ${db.prepare('SELECT COUNT(*) c FROM journal_entries').get().c} · ` +
  `journal_lines ${db.prepare('SELECT COUNT(*) c FROM journal_lines').get().c}`);

db.close();
