// Single source of truth for an account's NORMAL BALANCE (normal side).
//
// The normal balance is a property of the account's *accounting
// classification* — its Type — and nothing else. It is never inferred from the
// account's name, its current balance sign, or from state (e.g. whether the
// bank feed auto-populates it). Deriving it from state is exactly how the
// original defect was introduced: accounts whose balance happened to sit on the
// credit side were stamped 'Credit' even though a Bank account is always
// Debit-normal.
//
// How the value is used (all four readers agree — see balanceOf below):
//     Debit-normal  : balance = debits - credits
//     Credit-normal : balance = credits - debits
// The sign of the *displayed* balance therefore follows from this one field.
// A Bank account mis-stamped 'Credit' displays a positive ledger balance as a
// negative number, and — because it then has to be shown in the opposite
// column — makes the Trial Balance appear out of balance by twice the amount.
//
// The classification table below MUST stay in sync with:
//   • src/backend/models/chartOfAccounts.js  → NORMAL_BALANCE (canonical type vocabulary)
//   • src/frontend/src/components/accountant/ChartOfAccounts.js → ACCOUNT_TYPES[].normalBalance
//   • src/backend/services/accountEligibility.js → ACCOUNT_TYPE_FAMILY
//
// Legacy vocabulary: real company databases contain rows whose `type` column
// holds a *sub-type* ('Other Current Liability', 'Fixed Asset', …) because an
// older build stored it there. Those are mapped to their correct normal side
// too, so existing files are repaired by classification rather than by guesswork.

// Canonical type → normal balance.
const NORMAL_BALANCE = {
  // ── Debit-normal ────────────────────────────────────────────────────────
  'Asset':              'Debit',
  'Bank':               'Debit',
  'Cash':               'Debit',
  'Cost of Goods Sold': 'Debit',
  'Expense':            'Debit',
  'Other Expense':      'Debit',
  // ── Credit-normal ───────────────────────────────────────────────────────
  'Liability':          'Credit',
  'Credit Card':        'Credit',
  'Loan':               'Credit',
  'Equity':             'Credit',
  'Income':             'Credit',
  'Other Income':       'Credit',
};

// Legacy / sub-type values seen in the `type` column of existing databases.
// Mapped straight onto the correct normal side so no account is left behind.
const LEGACY_TYPE_NORMAL_BALANCE = {
  // Asset family (debit-normal)
  'Fixed Asset':             'Debit',
  'Other Current Asset':     'Debit',
  'Other Asset':             'Debit',
  'Inventory':               'Debit',
  'Accounts Receivable':     'Debit',
  'Prepaid Expenses':        'Debit',
  'Undeposited Funds':       'Debit',
  // Liability family (credit-normal) — note these are LIABILITIES despite the
  // word "Current"/"Liability" combinations that older builds stored here.
  'Other Current Liability': 'Credit',
  'Long Term Liability':     'Credit',
  'Other Liability':         'Credit',
  'Accounts Payable':        'Credit',
  'Deferred Revenue':        'Credit',
  'Payroll Liability':       'Credit',
  // Income family (credit-normal)
  'Revenue':                 'Credit',
  'Sales':                   'Credit',
  // Expense family (debit-normal)
  'Purchases':               'Debit',
  'Direct Labor':            'Debit',
};

// Memorandum / non-posting accounts never reach the ledger, so neither side is
// "normal" for them. They are DERIVED rows: repairing them would just be
// rewritten on the next read, so repairNormalBalances() leaves them alone.
const NON_POSTING_TYPES = new Set(['non-posting', 'non posting', 'nonposting', 'memo', 'memorandum']);

// Accounting family, used to sort/group and to validate.
const TYPE_FAMILY = {
  'Asset': 'Asset', 'Bank': 'Asset', 'Cash': 'Asset',
  'Liability': 'Liability', 'Credit Card': 'Liability', 'Loan': 'Liability',
  'Equity': 'Equity',
  'Income': 'Income', 'Other Income': 'Income',
  'Cost of Goods Sold': 'Expense', 'Expense': 'Expense', 'Other Expense': 'Expense',
};

const normalizeType = (type) => String(type == null ? '' : type).trim();

const titleCase = (s) => normalizeType(s).toLowerCase()
  .replace(/(^|\s|\/)([a-z])/g, (m, p, c) => p + c.toUpperCase());

/**
 * The authoritative account-type → normal-balance rule.
 *
 * @param {string|object} typeOrAccount  account type, or an account object
 *        (accepts `type` / `accountType`).
 * @returns {'Debit'|'Credit'|null}  null when the classification is unknown or
 *          the account is non-posting — callers must then leave the stored
 *          value untouched rather than overwrite it with a guess.
 */
function getExpectedNormalBalance(typeOrAccount) {
  const raw = (typeOrAccount && typeof typeOrAccount === 'object')
    ? (typeOrAccount.type || typeOrAccount.accountType || '')
    : typeOrAccount;

  const t = normalizeType(raw);
  if (!t) return null;

  const key = t.toLowerCase();
  if (NON_POSTING_TYPES.has(key)) return null;

  // Exact canonical match first.
  if (NORMAL_BALANCE[t]) return NORMAL_BALANCE[t];

  // Case-insensitive canonical match.
  const canonical = Object.keys(NORMAL_BALANCE).find(k => k.toLowerCase() === key);
  if (canonical) return NORMAL_BALANCE[canonical];

  // Legacy / sub-type vocabulary.
  const legacy = Object.keys(LEGACY_TYPE_NORMAL_BALANCE).find(k => k.toLowerCase() === key);
  if (legacy) return LEGACY_TYPE_NORMAL_BALANCE[legacy];

  // Unknown classification — do not guess.
  return null;
}

/** True when the classification is known (and therefore repairable). */
function isKnownType(typeOrAccount) {
  return getExpectedNormalBalance(typeOrAccount) !== null;
}

/** The accounting family of a type ('Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense' | ''). */
function accountFamily(typeOrAccount) {
  const raw = (typeOrAccount && typeof typeOrAccount === 'object')
    ? (typeOrAccount.type || typeOrAccount.accountType || '')
    : typeOrAccount;
  const t = normalizeType(raw);
  if (TYPE_FAMILY[t]) return TYPE_FAMILY[t];
  const hit = Object.keys(TYPE_FAMILY).find(k => k.toLowerCase() === t.toLowerCase());
  if (hit) return TYPE_FAMILY[hit];
  // Legacy values follow their family.
  const nb = getExpectedNormalBalance(raw);
  if (nb === 'Debit') return 'AssetOrExpense';
  if (nb === 'Credit') return 'LiabilityOrIncome';
  return '';
}

/** Canonicalise a stored normal balance ('debit' → 'Debit'); null when absent. */
const normalizeNormalBalance = (value) => {
  const v = normalizeType(value).toLowerCase();
  if (v === 'debit' || v === 'dr') return 'Debit';
  if (v === 'credit' || v === 'cr') return 'Credit';
  return null;
};

/**
 * Balance of an account from its raw ledger sides.
 * Positive means "on this account's normal side".
 *
 * @param {{normalBalance?:string, type?:string, debit?:number, credit?:number,
 *          openingBalance?:number}} a
 */
function balanceOf({ normalBalance, type, debit = 0, credit = 0, openingBalance = 0 } = {}) {
  // Stored value wins (single source of truth); fall back to the classification
  // only for rows that have never been stamped.
  const nb = normalizeNormalBalance(normalBalance) || getExpectedNormalBalance(type) || 'Debit';
  const base = Number(openingBalance) || 0;
  const d = Number(debit) || 0;
  const c = Number(credit) || 0;
  return nb === 'Debit' ? base + d - c : base + c - d;
}

/**
 * Repair stored `normalBalance` values that contradict the account's type.
 *
 * Semantics (design notes, so this can never silently regress):
 *   • The expected side is a pure function of the account's TYPE — never of its
 *     stored value, its balance sign, or its name.
 *   • NULL / blank is NOT the test. A row holding 'Credit' on a Bank account is
 *     just as wrong as a blank one, and both are written. (The previous
 *     back-fill only looked at blank rows, which is why existing files were
 *     skipped: they already held a value — the *wrong* value.)
 *   • Unknown classifications and non-posting accounts are left untouched.
 *   • Only `chart_of_accounts.normalBalance` is written. Journal entries,
 *     journal lines, transactions, payments and opening balances are never
 *     touched — the ledger data was already correct; only the metadata was not.
 *   • Idempotent: a second run finds zero mismatches and writes nothing.
 *
 * @param {object} db  better-sqlite3 database (or the dbmgr wrapper)
 * @param {{dryRun?:boolean}} [opts]
 * @returns {{scanned:number, mismatched:number, repaired:number, skipped:number,
 *            unknownTypes:number, rows:Array<object>}}
 */
function repairNormalBalances(db, opts = {}) {
  const dryRun = !!opts.dryRun;
  const result = {
    scanned: 0,
    mismatched: 0,
    repaired: 0,
    skipped: 0,       // non-posting / unknown classification — deliberately untouched
    unknownTypes: 0,  // distinct unknown type vocabulary
    rows: [],         // [{ id, name, type, from, to }] for changed (or would-change) rows
  };

  let rows;
  try {
    rows = db.prepare(
      'SELECT id, name, type, normalBalance FROM chart_of_accounts ORDER BY id'
    ).all();
  } catch {
    // No chart_of_accounts table yet (fresh DB created later in bootstrap).
    return result;
  }

  const unknownSeen = new Set();
  const updates = [];

  for (const r of rows) {
    result.scanned++;
    const expected = getExpectedNormalBalance(r.type);

    if (expected === null) {
      result.skipped++;
      const t = normalizeType(r.type);
      if (t) unknownSeen.add(t);
      continue;
    }

    const current = normalizeNormalBalance(r.normalBalance);

    // Already authoritative (only the casing differs at most) → leave it be.
    if (current === expected) continue;

    result.mismatched++;
    updates.push({ id: r.id, name: r.name, type: r.type, from: r.normalBalance, to: expected });
  }

  result.unknownTypes = unknownSeen.size;
  result.rows = updates;

  if (dryRun || updates.length === 0) return result;

  const stmt = db.prepare('UPDATE chart_of_accounts SET normalBalance = ? WHERE id = ?');
  const apply = db.transaction
    ? db.transaction(() => { for (const u of updates) stmt.run(u.to, u.id); })
    : () => { for (const u of updates) stmt.run(u.to, u.id); };
  apply();

  result.repaired = updates.length;
  return result;
}

module.exports = {
  NORMAL_BALANCE,
  LEGACY_TYPE_NORMAL_BALANCE,
  NON_POSTING_TYPES,
  TYPE_FAMILY,
  getExpectedNormalBalance,
  isKnownType,
  accountFamily,
  normalizeNormalBalance,
  balanceOf,
  repairNormalBalances,
};
