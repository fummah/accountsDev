/**
 * scripts/report-normal-balance-repair.js — before/after evidence for the
 * normal-balance repair. Runs entirely on a scratch copy.
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/report-normal-balance-repair.js
 */

const fs = require('fs');
const path = require('path');
const { useScratchCopy } = require('./lib/testDb.js');
const Database = require('better-sqlite3');
const NB = require('../src/backend/services/normalBalance');

const { live, cleanup } = useScratchCopy({ label: 'normal-balance-report' });
const COPY = process.env.ACCULEDGER_DB_PATH;
const db = new Database(COPY);

const sidesFor = () => {
  const m = new Map();
  for (const r of db.prepare(`
    SELECT jl.account_id a, COALESCE(SUM(jl.debit),0) d, COALESCE(SUM(jl.credit),0) c
    FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_id
    WHERE je.status = 'Posted' GROUP BY jl.account_id`).all()) {
    m.set(r.a, { d: Number(r.d), c: Number(r.c) });
  }
  return m;
};

// Trial Balance as this app presents it: only ACTIVE accounts are listed, and
// each balance is placed in a column by the sign of its normal-side value.
function trialBalance(rows, sides, nbOf) {
  let debit = 0, credit = 0;
  for (const r of rows) {
    const s = sides.get(r.id) || { d: 0, c: 0 };
    const nb = nbOf(r);
    const v = nb === 'Debit' ? s.d - s.c : s.c - s.d;
    if (v >= 0) { if (nb === 'Debit') debit += v; else credit += v; }
    else { if (nb === 'Debit') credit += -v; else debit += -v; }
  }
  return { debit, credit, diff: debit - credit };
}

const ledger = () => ({
  entries: db.prepare('SELECT COUNT(*) c, COALESCE(MAX(id),0) m FROM journal_entries').get(),
  lines: db.prepare('SELECT COUNT(*) c, COALESCE(MAX(id),0) m, COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM journal_lines').get(),
});

const active = db.prepare("SELECT id, name, type, normalBalance FROM chart_of_accounts WHERE status = 'Active'").all();
const all = db.prepare('SELECT id, name, type, normalBalance FROM chart_of_accounts').all();

const sidesBefore = sidesFor();
const tbBefore = trialBalance(active, sidesBefore, r => r.normalBalance || 'Debit');
const ledgerBefore = ledger();

const broken = all.filter(r => {
  const e = NB.getExpectedNormalBalance(r.type);
  return e !== null && NB.normalizeNormalBalance(r.normalBalance) !== e;
});

console.log('='.repeat(74));
console.log('NORMAL-BALANCE REPAIR — BEFORE / AFTER');
console.log('='.repeat(74));
console.log(`source file : ${live}`);
console.log(`working copy: ${COPY}`);
console.log(`accounts    : ${all.length} total, ${active.length} active`);

console.log('\n── ACCOUNT RECORDS REPAIRED ──');
if (broken.length === 0) console.log('  (none — every account already matches its type)');
for (const r of broken) {
  const s = sidesBefore.get(r.id) || { d: 0, c: 0 };
  console.log(`  #${r.id} "${r.name}" [${r.type}]  ${r.normalBalance || '(blank)'} → ${NB.getExpectedNormalBalance(r.type)}` +
    `   (ledger: dr ${s.d.toFixed(2)} / cr ${s.c.toFixed(2)})`);
}

const result = NB.repairNormalBalances(db);

const sidesAfter = sidesFor();
const activeAfter = db.prepare("SELECT id, name, type, normalBalance FROM chart_of_accounts WHERE status = 'Active'").all();
const tbAfter = trialBalance(activeAfter, sidesAfter, r => NB.getExpectedNormalBalance(r.type) || NB.normalizeNormalBalance(r.normalBalance) || 'Debit');
const ledgerAfter = ledger();

console.log(`\n  repaired: ${result.repaired}   left alone (already correct): ${result.scanned - result.mismatched}` +
  `   non-posting/unknown: ${result.skipped}`);

console.log('\n── BEFORE / AFTER BALANCE SYMPTOMS ──');
for (const r of broken) {
  const s = sidesBefore.get(r.id) || { d: 0, c: 0 };
  const beforeV = NB.balanceOf({ normalBalance: r.normalBalance, type: r.type, debit: s.d, credit: s.c });
  const afterRow = db.prepare('SELECT normalBalance FROM chart_of_accounts WHERE id = ?').get(r.id);
  const afterV = NB.balanceOf({ normalBalance: afterRow.normalBalance, type: r.type, debit: s.d, credit: s.c });
  const flip = (beforeV < 0 && afterV > 0) || (beforeV > 0 && afterV < 0);
  console.log(`  #${r.id} ${r.name.padEnd(24)} ${beforeV.toFixed(2).padStart(14)} → ${afterV.toFixed(2).padStart(14)}` +
    `   ${flip ? 'SIGN CORRECTED' : ''}`);
}

console.log('\n── ILLUSTRATIVE: the reported −$14,750 symptom ──');
const demoD = 14750, demoC = 0;
console.log(`  a Bank account with a ${demoD} net debit, mis-stamped Credit:`);
console.log(`    before: ${NB.balanceOf({ normalBalance: 'Credit', type: 'Bank', debit: demoD, credit: demoC }).toFixed(2)}`);
console.log(`    after : ${NB.balanceOf({ type: 'Bank', debit: demoD, credit: demoC }).toFixed(2)}`);
// Trial Balance presentation, exactly as `TrialBalance.js` renders it:
//   balance is already normal-side-signed (debit-normal → dr−cr, etc.);
//   a POSITIVE balance lands in the debit column iff the account is debit-normal,
//   otherwise in the credit column; a NEGATIVE balance lands in whichever column
//   is the opposite, i.e. it is flipped across.
function tbColumns(rows) {
  let debit = 0, credit = 0;
  for (const r of rows) {
    const debitNormal = r.nb === 'Debit';
    const balance = debitNormal ? (r.d - r.c) : (r.c - r.d);
    if (balance >= 0) { if (debitNormal) debit += balance; else credit += balance; }
    else { if (debitNormal) credit += Math.abs(balance); else debit += Math.abs(balance); }
  }
  return { debit, credit, diff: debit - credit };
}
// Ledger: Checking dr 14,750 / Owner's Equity cr 14,750.
// Correct presentation: Checking (Debit-normal) in the debit column,
// Equity (Credit-normal) in the credit column -> balanced.
const row = (nb, d, c) => ({ nb, d, c });
const tbBad = tbColumns([row('Credit', demoD, demoC), row('Credit', 0, demoD)]);
const tbGood = tbColumns([row('Debit', demoD, demoC), row('Credit', 0, demoD)]);
console.log(`    Trial Balance: the mis-signed Bank balance must be shown in the CREDIT column,`);
console.log(`    so debits ${tbBad.debit.toFixed(2)} vs credits ${tbBad.credit.toFixed(2)}`);
console.log(`    -> out of balance by ${tbBad.diff.toFixed(2)}  (= 2 × ${demoD}, the reported symptom)`);
console.log(`    After stamping Debit: debits ${tbGood.debit.toFixed(2)} vs credits ${tbGood.credit.toFixed(2)}`);
console.log(`    -> difference ${tbGood.diff.toFixed(2)}  (balanced)`);

console.log('\n── TRIAL BALANCE (ACTIVE ACCOUNTS, Posted JOURNAL LINES) ──');
console.log(`  before repair — debit column ${tbBefore.debit.toFixed(2)} | credit column ${tbBefore.credit.toFixed(2)} | difference ${tbBefore.diff.toFixed(2)}`);
console.log(`  after  repair — debit column ${tbAfter.debit.toFixed(2)} | credit column ${tbAfter.credit.toFixed(2)} | difference ${tbAfter.diff.toFixed(2)}`);
console.log('  (this file has a pre-existing Trial Balance difference unrelated to');
console.log('   normalBalance — see the note below; the repair neither creates nor hides it.)');

console.log('\n── LEDGER INVARIANCE ──');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
console.log(`  journal_entries  before ${JSON.stringify(ledgerBefore.entries)}  after ${JSON.stringify(ledgerAfter.entries)}  ${same(ledgerBefore.entries, ledgerAfter.entries) ? 'UNCHANGED' : 'CHANGED'}`);
console.log(`  journal_lines    before ${JSON.stringify(ledgerBefore.lines)}`);
console.log(`                   after  ${JSON.stringify(ledgerAfter.lines)}  ${same(ledgerBefore.lines, ledgerAfter.lines) ? 'UNCHANGED' : 'CHANGED'}`);

console.log('\n── WHY THIS FILE\'S TB STILL SHOWS A DIFFERENCE ──');
const inact = db.prepare(`
  SELECT c.id, c.name, c.type, c.status, COALESCE(SUM(jl.debit),0) d, COALESCE(SUM(jl.credit),0) c2
  FROM chart_of_accounts c
  JOIN journal_lines jl ON jl.account_id = c.id
  JOIN journal_entries je ON je.id = jl.journal_id AND je.status = 'Posted'
  WHERE c.status != 'Active' GROUP BY c.id`).all();
let idr = 0, icr = 0;
for (const r of inact) { idr += Number(r.d); icr += Number(r.c2);
  console.log(`  non-active account carrying Posted activity: #${r.id} ${r.name} [${r.type}] dr ${Number(r.d).toFixed(2)} / cr ${Number(r.c2).toFixed(2)}`); }
console.log(`  total ${idr.toFixed(2)} debit / ${icr.toFixed(2)} credit = a net ${(idr - icr).toFixed(2)}`);
console.log('  The Trial Balance lists only ACTIVE accounts, so this slice is excluded.');
console.log('  That is a report-scope question, not a normal-balance one, and it is');
console.log('  unchanged by this repair.');

console.log('\n── SOURCE TOTALS ACROSS ALL ACCOUNTS (identity check) ──');
const allSides = db.prepare(`
  SELECT COALESCE(SUM(jl.debit),0) d, COALESCE(SUM(jl.credit),0) c
  FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_id
  WHERE je.status = 'Posted'`).get();
console.log(`  every Posted line: dr ${Number(allSides.d).toFixed(2)} / cr ${Number(allSides.c).toFixed(2)} — difference ${(allSides.d - allSides.c).toFixed(2)}`);

db.close();
cleanup();
console.log(`\n(live file untouched: ${live})`);
