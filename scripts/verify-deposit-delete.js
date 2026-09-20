// Verifies Deposits.deleteDeposit against a COPY of the live DB.
// Run: $env:ELECTRON_RUN_AS_NODE="1"; & electron.exe scripts\verify-deposit-delete.js
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const os = require('os');

const liveDb = path.join(__dirname, '..', 'src', 'backend', 'db', 'accounts.db');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'depdel-'));
const tmpDb = path.join(tmpDir, 'accounts_copy.db');
fs.copyFileSync(liveDb, tmpDb);

const Database = require('better-sqlite3');
const real = new Database(tmpDb);

const dbmgrPath = require.resolve(path.join(__dirname, '..', 'src', 'backend', 'models', 'dbmgr.js'));
const stub = {
  raw: real, prepare: (sql) => real.prepare(sql),
  all: (sql, params) => (params === undefined ? real.prepare(sql).all() : real.prepare(sql).all(...[].concat(params))),
  get: (sql, params) => (params === undefined ? real.prepare(sql).get() : real.prepare(sql).get(...[].concat(params))),
  run: (sql, params) => (params === undefined ? real.prepare(sql).run() : real.prepare(sql).run(...[].concat(params))),
  exec: (sql) => real.exec(sql), transaction: (fn) => real.transaction(fn),
};
require.cache[dbmgrPath] = { id: dbmgrPath, filename: dbmgrPath, loaded: true, exports: stub };

const Deposits = require(path.join(__dirname, '..', 'src', 'backend', 'models', 'deposits.js'));

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== undefined ? ' -> ' + extra : ''}`); }
};

// Find a bank account
const bank = real.prepare("SELECT id, name, type FROM chart_of_accounts WHERE LOWER(type)='bank' AND status='Active' LIMIT 1").get();
if (!bank) { console.error('No bank account in copy; cannot test'); process.exit(1); }
const income = real.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type)='income' AND status='Active' LIMIT 1").get();

function makeDeposit(total, status) {
  const id = real.prepare('INSERT INTO deposits (bank_account_id, date, reference, memo, total_amount, status, created_at) VALUES (?,?,?,?,?,?,datetime(\'now\'))')
    .run(bank.id, '2026-08-01', `DEPDEL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, 'test', total, status).lastInsertRowid;
  real.prepare('INSERT INTO deposit_allocations (deposit_id, account_id, amount, description) VALUES (?,?,?,?)')
    .run(id, income ? income.id : null, total, 'Alloc');
  // posted journal entry (DR bank / CR income)
  const je = real.prepare("INSERT INTO journal_entries (date, description, source_type, source_id, status) VALUES (?,?, 'deposit', ?, 'Posted')")
    .run('2026-08-01', 'Deposit test', id).lastInsertRowid;
  real.prepare('INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES (?,?,?,?,?)').run(je, bank.id, total, 0, 'DR bank');
  real.prepare('INSERT INTO journal_lines (journal_id, account_id, debit, credit, description) VALUES (?,?,?,?,?)').run(je, income ? income.id : bank.id, 0, total, 'CR income');
  // legacy register row
  const ref = real.prepare('SELECT reference FROM deposits WHERE id=?').get(id).reference;
  const tx = real.prepare("INSERT INTO transactions (accountId, date, type, reference, description, debit, isReconciled, created_at) VALUES (?,?, 'deposit', ?, 'Bank Deposit', ?, 0, datetime('now'))")
    .run(bank.id, '2026-08-01', ref, total).lastInsertRowid;
  real.prepare('INSERT INTO deposit_items (depositId, type, reference, description, amount) VALUES (?,?,?,?,?)').run(tx, 'allocation', null, 'Alloc', total);
  return { id, je, tx };
}

function count(sql, ...p) { return real.prepare(sql).get(...p).c; }

console.log('\nTEST 7 — delete an unreconciled deposit unwinds everything');
{
  const { id, je, tx } = makeDeposit(4704.80, 'Active');
  const r = Deposits.deleteDeposit(id);
  check('returns success', r && r.success === true, JSON.stringify(r));
  check('deposit row gone', count('SELECT COUNT(*) c FROM deposits WHERE id=?', id) === 0);
  check('allocation lines gone', count('SELECT COUNT(*) c FROM deposit_allocations WHERE deposit_id=?', id) === 0);
  check('journal entry voided', real.prepare('SELECT status FROM journal_entries WHERE id=?').get(je).status === 'Void');
  check('journal still excluded from balances (not Posted)', count("SELECT COUNT(*) c FROM journal_entries WHERE id=? AND status='Posted'", je) === 0);
  check('legacy transaction deleted', count('SELECT COUNT(*) c FROM transactions WHERE id=?', tx) === 0);
  check('legacy deposit_items deleted', count('SELECT COUNT(*) c FROM deposit_items WHERE depositId=?', tx) === 0);
}

console.log('\nTEST 9 — reconciled deposit is blocked');
{
  const { id } = makeDeposit(100, 'Reconciled');
  let err = null;
  try { Deposits.deleteDeposit(id); } catch (e) { err = e; }
  check('throws for reconciled status', !!err && /reconciled/i.test(err.message), err && err.message);
  check('deposit still present', count('SELECT COUNT(*) c FROM deposits WHERE id=?', id) === 1);
}

console.log('\nTEST 9b — reconciled via bank-register row is blocked');
{
  const { id, tx } = makeDeposit(200, 'Active');
  real.prepare('UPDATE transactions SET isReconciled=1 WHERE id=?').run(tx);
  let err = null;
  try { Deposits.deleteDeposit(id); } catch (e) { err = e; }
  check('throws for reconciled register row', !!err && /reconciled/i.test(err.message), err && err.message);
  check('deposit still present', count('SELECT COUNT(*) c FROM deposits WHERE id=?', id) === 1);
}

console.log('\nMissing deposit');
{
  let err = null;
  try { Deposits.deleteDeposit(999999999); } catch (e) { err = e; }
  check('throws not found', !!err && /not found/i.test(err.message), err && err.message);
}

console.log('\nPayment unlink on delete');
{
  const cust = real.prepare('SELECT id FROM customers LIMIT 1').get();
  const inv = real.prepare('SELECT id FROM invoices LIMIT 1').get();
  const { id } = makeDeposit(50, 'Active');
  const pid = real.prepare("INSERT INTO payments (invoiceId, customerId, amount, paymentMethod, date, status, deposit_id, createdAt) VALUES (?,?,?,?,?, 'Deposited', ?, datetime('now'))")
    .run(inv ? inv.id : 0, cust ? cust.id : null, 50, 'cash', '2026-08-01', id).lastInsertRowid;
  Deposits.deleteDeposit(id);
  const p = real.prepare('SELECT deposit_id, status FROM payments WHERE id=?').get(pid);
  check('payment unlinked', p.deposit_id === null);
  check('payment status reset', p.status === 'Pending Deposit', p.status);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
try { real.close(); } catch (_) {}
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
process.exit(fail === 0 ? 0 : 1);
