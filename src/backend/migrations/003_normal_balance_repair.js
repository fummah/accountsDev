// Migration 003 — repair the NORMAL BALANCE metadata on existing company files.
//
// THE DEFECT
//   `chart_of_accounts.normalBalance` decides the sign of every displayed
//   account balance (Debit-normal → debits − credits; Credit-normal →
//   credits − debits) and which Trial Balance column an account lands in.
//   Existing company files hold accounts whose stored normal side contradicts
//   their own accounting classification, e.g.
//       Checking Account  Type Bank        stored 'Credit'  (should be Debit)
//       Truck Loan        Type Loan        stored 'Debit'   (should be Credit)
//       Visa Credit Card  Type Credit Card stored 'Debit'   (should be Credit)
//   The journal entries behind them are balanced and correct — only the
//   metadata is wrong. Symptoms are cosmetic-but-alarming: a bank account
//   showing −$14,750, a Trial Balance out by twice the mis-signed balance, and
//   credit-card balances with reversed signs.
//
// WHY EARLIER BUILDS DID NOT FIX IT
//   New files are stamped correctly at creation (insertAccount derives the side
//   from the type). The only back-fill that existed only looked at rows where
//   `normalBalance IS NULL OR = ''`. Real existing files do not have blanks —
//   they have a *wrong value* — so every affected account was skipped.
//
// WHAT THIS DOES
//   One pass over `chart_of_accounts` using the single authoritative rule in
//   services/normalBalance.js (type → normal side). Every row whose stored side
//   disagrees with its type is corrected; rows that are already right are not
//   written at all; unknown classifications and non-posting/memo accounts are
//   left untouched.
//
// WHAT THIS DOES NOT DO
//   It never touches `journal_entries`, `journal_lines`, `transactions`,
//   `payments`, opening balances, amounts or dates. The ledger was already
//   correct. Only the account metadata is rewritten.
//
// REVERSIBILITY
//   Every change is journalled to `normal_balance_backfill_backup` (old value,
//   new value, account name/type, timestamp) before the UPDATE runs.
//
// IDEMPOTENCY
//   The expected side is derived from immutable data (the account's type), so a
//   second run always finds zero mismatches and writes nothing.

const { repairNormalBalances, getExpectedNormalBalance } = require('../services/normalBalance');

const version = 3;
const description = 'Repair incorrect chart_of_accounts.normalBalance values on existing company files';

function tableExists(db, name) {
  try {
    return !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  } catch {
    return false;
  }
}

function ensureBackupTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS normal_balance_backfill_backup (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id    INTEGER NOT NULL,
      account_name  TEXT,
      account_type  TEXT,
      old_normal_balance TEXT,
      new_normal_balance TEXT,
      migrated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

function up(db) {
  const result = {
    scanned: 0,
    mismatched: 0,
    repaired: 0,
    skipped: 0,
    unknownTypes: 0,
    rows: [],
  };

  if (!tableExists(db, 'chart_of_accounts')) {
    console.log('[migration 003] chart_of_accounts not present — nothing to repair.');
    up.lastResult = result;
    return result;
  }

  ensureBackupTable(db);

  // Pass 1 — dry run, so the backup rows can be written inside the same
  // transaction as the repair and the report can show before/after safely.
  const plan = repairNormalBalances(db, { dryRun: true });
  result.scanned = plan.scanned;
  result.mismatched = plan.mismatched;
  result.skipped = plan.skipped;
  result.unknownTypes = plan.unknownTypes;
  result.rows = plan.rows;

  if (plan.rows.length === 0) {
    console.log(`[migration 003] normalBalance already correct on all ${result.scanned} account(s) — no changes.`);
    up.lastResult = result;
    return result;
  }

  const backup = db.prepare(`
    INSERT INTO normal_balance_backfill_backup
      (account_id, account_name, account_type, old_normal_balance, new_normal_balance)
    VALUES (?, ?, ?, ?, ?)
  `);
  const apply = db.transaction(() => {
    for (const r of plan.rows) backup.run(r.id, r.name, r.type, r.from, r.to);
    repairNormalBalances(db);
  });
  apply();

  result.repaired = plan.rows.length;

  const bySide = result.rows.reduce((acc, r) => {
    const key = `${r.from || '(blank)'} → ${r.to}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  console.log(
    `[migration 003] normalBalance repaired on ${result.repaired}/${result.scanned} account(s) ` +
    `${JSON.stringify(bySide)} · ${result.skipped} non-posting/unknown left untouched. ` +
    `No journal entries, lines or transaction amounts were modified.`
  );

  up.lastResult = result;
  return result;
}

module.exports = { version, description, up, getExpectedNormalBalance };
