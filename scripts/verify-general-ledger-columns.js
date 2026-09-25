/**
 * verify-general-ledger-columns.js
 *
 * General Ledger must stay account-focused while adding just enough context:
 *   Date | Journal | Payee / Description | Account(s) | Reference | Debit | Credit | Balance
 *
 * - Party comes from the source relationship (customer/vendor/payee), not name parsing.
 * - Account(s) is the OTHER side of the journal, excluding the viewed account,
 *   deduped by account id, summarised as "Split (N accounts)".
 * - The Journal cell opens the existing shared JournalEntryDetailModal by id.
 *
 * Backend checks run on a SCRATCH COPY; frontend checks read the source.
 */
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const Module = require('module');
const electronStub = { ipcMain: { handle: () => {} }, app: { isPackaged: true } };
const originalLoad = Module._load;
Module._load = function (request) { if (request === 'electron') return electronStub; return originalLoad.apply(this, arguments); };

require('./lib/testDb.js').useScratchCopy({ label: 'verify-general-ledger-columns' });
const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const JournalEntries = require(path.join(ROOT, 'src', 'backend', 'models', 'journalEntries.js'));
const Transactions = require(path.join(ROOT, 'src', 'backend', 'models', 'transactions.js'));
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js')).raw;

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};
const read = (rel) => fs.readFileSync(path.join(FE, rel), 'utf8');

// ── Backend: counterpart accounts + party resolution ──────────────────────
console.log('\n=== Backend: getByAccount enrichment ===');
const bank = db.prepare("SELECT id, name FROM chart_of_accounts WHERE LOWER(type) IN ('bank','cash') AND status='Active' ORDER BY id LIMIT 1").get();
const exp = db.prepare("SELECT id, name FROM chart_of_accounts WHERE LOWER(type)='expense' AND status='Active' ORDER BY id LIMIT 3").all();
check('fixtures: a bank and 3 expense accounts exist', !!(bank && exp.length >= 3), JSON.stringify({ bank, exp: exp.map(e => e.id) }));

const findRow = (rows, journalId) => rows.find(r => Number(r.journalId) === Number(journalId));

if (bank && exp.length >= 3) {
  const [e1, e2, e3] = exp;

  // TEST 3/4 — split journal: 3 different counterpart accounts
  const je = JournalEntries.postTransaction({
    id: 888001, date: '2026-06-10', amount: 350, accountId: bank.id, description: 'split check', reference: 'SPLIT-1',
    splitLines: [
      { accountId: e1.id, account: e1.name, amount: 100 },
      { accountId: e2.id, account: e2.name, amount: 200 },
      { accountId: e3.id, account: e3.name, amount: 50 },
    ],
  });
  const rows = JournalEntries.getByAccount(bank.id, { from: '2026-06-01', to: '2026-06-30' });
  const row = findRow(rows, je.id);
  const counterIds = (row?.counterAccounts || []).map(a => Number(a.id)).sort((a, b) => a - b);
  const expectIds = [e1.id, e2.id, e3.id].map(Number).sort((a, b) => a - b);
  check('TEST 4  split journal returns 3 unique counterpart accounts',
    JSON.stringify(counterIds) === JSON.stringify(expectIds), JSON.stringify(counterIds));
  check('current (viewed) account is EXCLUDED from Account(s)', !counterIds.includes(Number(bank.id)));

  // TEST 3 — single counterpart
  const je2 = JournalEntries.postTransaction({
    id: 888002, date: '2026-06-11', amount: 100, accountId: bank.id, description: 'single', reference: 'SINGLE-1',
    splitLines: [{ accountId: e1.id, account: e1.name, amount: 100 }],
  });
  const rows2 = JournalEntries.getByAccount(bank.id, { from: '2026-06-01', to: '2026-06-30' });
  const row2 = findRow(rows2, je2.id);
  check('TEST 3  single counterpart returns exactly one account',
    (row2?.counterAccounts || []).length === 1 && Number(row2.counterAccounts[0].id) === Number(e1.id),
    JSON.stringify(row2?.counterAccounts));

  // Duplicate counterpart lines to the SAME account count once
  const je3 = JournalEntries.postTransaction({
    id: 888003, date: '2026-06-12', amount: 150, accountId: bank.id, description: 'dup', reference: 'DUP-1',
    splitLines: [
      { accountId: e1.id, account: e1.name, amount: 100 },
      { accountId: e1.id, account: e1.name, amount: 50 },
    ],
  });
  const rows3 = JournalEntries.getByAccount(bank.id, { from: '2026-06-01', to: '2026-06-30' });
  const row3 = findRow(rows3, je3.id);
  check('duplicate lines to one counterpart account are counted ONCE',
    (row3?.counterAccounts || []).length === 1, JSON.stringify(row3?.counterAccounts));

  // TEST 1/2 — party resolution from the source transaction (vendor/payee)
  const ins = Transactions.insert({
    date: '2026-06-15', type: 'expense', amount: 120, description: 'Check #1 to Amanda Clark',
    reference: 'C-1', accountId: bank.id, debit: 0, credit: 120, entered_by: 'test', payee_name: 'Amanda Clark',
  });
  const txId = ins.lastInsertRowid;
  const je4 = JournalEntries.postTransaction({
    id: txId, date: '2026-06-15', amount: 120, accountId: bank.id, description: 'Check #1 to Amanda Clark',
    reference: 'C-1', splitLines: [{ accountId: e1.id, account: e1.name, amount: 120 }],
  });
  const rows4 = JournalEntries.getByAccount(bank.id, { from: '2026-06-15', to: '2026-06-15' });
  const row4 = findRow(rows4, je4.id);
  check('TEST 1/2  payee resolves from the source relationship (Amanda Clark)',
    row4?.source?.party === 'Amanda Clark', JSON.stringify(row4?.source));
}

// ── Frontend: columns + wiring ────────────────────────────────────────────
console.log('\n=== Frontend: General Ledger columns ===');
const gl = read('components/accountant/GeneralLedger.js');
for (const h of ['Date', 'Journal', 'Payee / Description', 'Account(s)', 'Reference', 'Debit', 'Credit', 'Balance']) {
  check(`column "${h}" present`, new RegExp(`title:\\s*'${h.replace(/[()/]/g, m => '\\' + m)}'`).test(gl));
}
check('generic "Type" column removed', !/title:\s*'Type'/.test(gl));
check('uses the shared account-path helper', /buildAccountLabelMap/.test(gl));
check('counterpart accounts exclude the viewed account (from backend)', /counterAccounts/.test(gl));
check('Split (N accounts) label is rendered', /Split \(\$\{labels\.length\} accounts\)/.test(gl));
check('counterpart list shown in a Tooltip', /<Tooltip title=\{<div>\{labels\.map/.test(gl));
check('Payee/Description falls back to description/memo', /r\.lineDesc \|\| r\.description \|\| r\.memo/.test(gl));
check('Journal cell is a keyboard-focusable control opening the shared detail',
  /type="link"[\s\S]{0,200}openJournal\(v\)/.test(gl) && /<JournalEntryDetailModal/.test(gl));
check('opening row shows no counterpart account', /counterAccounts:\s*\[\]/.test(gl));
check('search matches party, journal and counterpart account',
  /e\.source\.party/.test(gl) && /e\.journalId/.test(gl) && /e\.counterAccounts/.test(gl));

console.log('\n=== Export / Print use the improved schema ===');
check('print header has Payee / Description + Account(s)',
  /<th>Payee \/ Description<\/th>/.test(gl) && /<th>Account\(s\)<\/th>/.test(gl));
check('export header has Journal + Payee / Description + Account(s)',
  /\['Date', 'Journal', 'Payee \/ Description', 'Account\(s\)', 'Reference', 'Debit', 'Credit', 'Balance'\]/.test(gl));

// ── Width / layout: all 8 columns fit the desktop width ────────────────────
console.log('\n=== Width / layout (no horizontal scrollbar on desktop) ===');
const widthOf = (title) => {
  const m = gl.match(new RegExp(`title:\\s*'${title.replace(/[()/]/g, m => '\\' + m)}'[^}]*?width:\\s*(\\d+)`));
  return m ? Number(m[1]) : null;
};
const w = {
  date: widthOf('Date'), journal: widthOf('Journal'), payee: widthOf('Payee / Description'),
  accounts: widthOf('Account(s)'), reference: widthOf('Reference'),
  debit: widthOf('Debit'), credit: widthOf('Credit'), balance: widthOf('Balance'),
};
check('Date is compact (80-110px)', w.date >= 80 && w.date <= 110, String(w.date));
check('Journal is compact (70-95px)', w.journal >= 70 && w.journal <= 95, String(w.journal));
check('Payee / Description is narrower (160-240px)', w.payee >= 160 && w.payee <= 240, String(w.payee));
check('Account(s) is narrower (120-180px)', w.accounts >= 120 && w.accounts <= 180, String(w.accounts));
check('Reference is narrower (100-160px)', w.reference >= 100 && w.reference <= 160, String(w.reference));
check('Debit keeps a readable min width (100-125px)', w.debit >= 100 && w.debit <= 125, String(w.debit));
check('Credit keeps a readable min width (100-125px)', w.credit >= 100 && w.credit <= 125, String(w.credit));
check('Balance keeps a readable min width (105-140px)', w.balance >= 105 && w.balance <= 140, String(w.balance));
const sumW = Object.values(w).reduce((s, v) => s + (v || 0), 0);
check('column widths sum to <= 1000px (fits desktop)', sumW <= 1000, String(sumW));
check('uses tableLayout="fixed"', /tableLayout="fixed"/.test(gl));
const scrollM = gl.match(/scroll=\{\{\s*x:\s*(\d+)\s*\}\}/);
check('scroll.x is only the narrow-screen floor (<= 1000)', !!scrollM && Number(scrollM[1]) <= 1000, scrollM ? scrollM[1] : 'missing');
check('table carries the scoped class', /className="gl-ledger-table"/.test(gl));
check('descriptive columns truncate with ellipsis + title',
  /ellipsis:\s*true/.test(gl) && /title=\{label\}/.test(gl) && /title=\{labels\[0\]\}/.test(gl) && /title=\{v\}/.test(gl));
check('money cells never wrap', (gl.match(/whiteSpace:\s*'nowrap'/g) || []).length >= 3);
check('scoped CSS exists for the ledger table',
  /\.gl-ledger-table\b/.test(fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'public', 'css', 'custom.css'), 'utf8')));
check('export uses the FULL values (no ellipsis helper)', /q\(partyOf\(r\)\)/.test(gl) && /q\(counterText\(r\)\)/.test(gl));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
