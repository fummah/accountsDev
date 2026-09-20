// Single source of truth for WHICH ACCOUNT a bank-reconciliation adjustment may
// post to.
//
// A "Reconcile Anyway" adjustment exists to capture a difference the user could
// not explain. It must land somewhere a bookkeeper can find and review later —
// never on the bank account itself (a journal entry that debits and credits the
// same account is a no-op that hides the problem rather than recording it).
//
// The rule, in priority order:
//   1. a CONFIGURED reconciliation-discrepancy account, if the company file has
//      one (by name — the app has no settings key for it), else
//   2. whatever the user picks from the eligible list, else
//   3. the first eligible account, as a last-resort default so a caller that
//      predates the picker still works.
//
// "Eligible" is decided by the account's CLASSIFICATION, never by its name:
//   • Active, and a real posting account (not Non-Posting / memo);
//   • not the bank account being reconciled;
//   • not an AR/AP control account (a bank difference is not a customer or
//     vendor balance).
// Expense/Other Expense/Income/Other Income are the natural homes for a
// discrepancy; Asset/Liability/Equity are permitted so a user who prefers to
// book it elsewhere is not blocked.
//
// Mirrors the classification approach in services/accountEligibility.js and
// services/normalBalance.js — keep the vocabulary in step with those.

const { getExpectedNormalBalance } = require('./normalBalance');

// The name the app looks for when no account has been explicitly configured.
const DEFAULT_DISCREPANCY_NAME = 'Reconciliation Discrepancies';

// Control accounts that must never receive a reconciliation difference.
const EXCLUDED_TYPES = new Set(['accounts receivable', 'accounts payable']);

// Memorandum / non-posting accounts never reach the ledger.
const EXCLUDED_FAMILIES = new Set(['NonPosting']);

const typeKey = (account = {}) =>
  String(account.accountType || account.type || '').trim().toLowerCase();

/**
 * True when an account may be used as the adjustment side of a reconciliation.
 *
 * @param {object} account
 * @param {{bankAccountId?:number|string}} [opts]
 */
function isEligibleAdjustmentAccount(account, opts = {}) {
  if (!account) return false;
  const t = typeKey(account);
  if (!t) return false;
  if (EXCLUDED_TYPES.has(t)) return false;

  // Non-posting / memo accounts have no normal side — they cannot be posted to.
  if (getExpectedNormalBalance(account) === null) return false;
  if (EXCLUDED_FAMILIES.has(familyOf(t))) return false;

  const status = String(account.status == null ? 'Active' : account.status).trim().toLowerCase();
  if (status && status !== 'active') return false;

  // The bank account can never be its own adjustment.
  const bankId = Number(opts.bankAccountId);
  if (Number.isFinite(bankId) && bankId > 0 && Number(account.id) === bankId) return false;

  return true;
}

// Local family lookup so this module does not need the frontend table.
function familyOf(typeKeyLower) {
  if (typeKeyLower === 'non-posting' || typeKeyLower === 'non posting' || typeKeyLower === 'nonposting'
      || typeKeyLower === 'memo' || typeKeyLower === 'memorandum') return 'NonPosting';
  return '';
}

/** Every account the user may choose as an adjustment account, best first. */
function getEligibleAdjustmentAccounts(db, opts = {}) {
  let rows = [];
  try {
    rows = db.prepare(
      `SELECT id, name, type, subType, number, status, normalBalance
         FROM chart_of_accounts
        WHERE (status IS NULL OR LOWER(status) = 'active')
        ORDER BY CAST(number AS INTEGER) ASC, name ASC`
    ).all();
  } catch {
    return [];
  }
  const eligible = rows.filter(a => isEligibleAdjustmentAccount(a, opts));

  // Expense-family accounts first (the natural home for a discrepancy), then
  // income, then everything else — each group alphabetically.
  const rank = (a) => {
    const t = typeKey(a);
    if (t === 'expense' || t === 'other expense' || t === 'cost of goods sold') return 0;
    if (t === 'other income' || t === 'income') return 1;
    if (t === 'equity') return 2;
    return 3;
  };
  return eligible.sort((a, b) => rank(a) - rank(b) || String(a.name || '').localeCompare(String(b.name || '')));
}

/**
 * The account to default the picker to: the configured discrepancy account if
 * one exists, otherwise the first eligible account (or null).
 */
function findDefaultAdjustmentAccount(db, opts = {}) {
  let configured = null;
  try {
    configured = db.prepare(
      `SELECT id, name, type, subType, number, status, normalBalance
         FROM chart_of_accounts
        WHERE LOWER(name) LIKE '%reconcil%discrep%'
           OR LOWER(name) LIKE '%discrep%reconcil%'
        ORDER BY id ASC LIMIT 1`
    ).get();
  } catch {
    configured = null;
  }
  if (configured && isEligibleAdjustmentAccount(configured, opts)) return configured;

  // A user may name it simply "Reconciliation Discrepancies"; also accept an
  // exact-name match before falling back to the ranked list.
  try {
    const exact = db.prepare(
      'SELECT id, name, type, subType, number, status, normalBalance FROM chart_of_accounts WHERE name = ? LIMIT 1'
    ).get(DEFAULT_DISCREPANCY_NAME);
    if (exact && isEligibleAdjustmentAccount(exact, opts)) return exact;
  } catch { /* ignore */ }

  const list = getEligibleAdjustmentAccounts(db, opts);
  return list.length ? list[0] : null;
}

/**
 * Resolve the adjustment account for a reconciliation.
 *
 * @returns {null | object}  the chosen account row, or null when nothing is
 *          eligible (the caller must then refuse to adjust rather than guess).
 * @throws  when an explicit id was supplied but is not eligible.
 */
function resolveAdjustmentAccount(db, { adjustmentAccountId, bankAccountId } = {}) {
  const id = Number(adjustmentAccountId);
  if (Number.isFinite(id) && id > 0) {
    const row = db.prepare(
      'SELECT id, name, type, subType, number, status, normalBalance FROM chart_of_accounts WHERE id = ?'
    ).get(id);
    if (!row) throw new Error(`Adjustment account #${id} does not exist`);
    if (Number(row.id) === Number(bankAccountId)) {
      throw new Error('The adjustment account cannot be the bank account being reconciled');
    }
    if (!isEligibleAdjustmentAccount(row, { bankAccountId })) {
      throw new Error(`"${row.name}" is not an eligible adjustment account`);
    }
    return row;
  }
  return findDefaultAdjustmentAccount(db, { bankAccountId });
}

module.exports = {
  DEFAULT_DISCREPANCY_NAME,
  EXCLUDED_TYPES,
  isEligibleAdjustmentAccount,
  getEligibleAdjustmentAccounts,
  findDefaultAdjustmentAccount,
  resolveAdjustmentAccount,
};
