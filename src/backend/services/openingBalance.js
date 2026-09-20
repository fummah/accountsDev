// Single source of truth for HOW AN ACCOUNT'S OPENING BALANCE PARTICIPATES in
// its balance and in the General Ledger.
//
// ── WHERE THE OPENING BALANCE LIVES ─────────────────────────────────────────
// It is a COLUMN on the account itself:
//     chart_of_accounts.openingBalance      REAL  (default 0)
//     chart_of_accounts.openingBalanceDate  TEXT  (usually NULL)
// There is NO OpeningBalance table, and an opening balance is NOT a journal
// entry. (Verified against the live file: 0 journal entries carry an opening
// source type; the 7 entries with a NULL source_type are ordinary manual
// journals — D.E.S. notes, not opening balances.) Creating a second
// representation would mean two sources of truth for the same money, so the
// ledger was missing the row rather than the data.
//
// ── THE SIGN CONVENTION (the part that is easy to get wrong) ────────────────
// `openingBalance` is stored NORMAL-BALANCE-SIGNED, i.e. already expressed
// from the account's point of view:
//     Bank account with $407.47 to start   → openingBalance = +407.47
//     Loan with $5,000 owed                → openingBalance = +5000  (Credit-normal)
// So the opening balance is ADDED to the account's normal direction. It is NOT
// a raw debit and must never be treated as one — posting it as a debit line
// would put a liability's opening balance on the wrong side.
//
//     Debit-normal  : running = openingBalance + debits - credits
//     Credit-normal : running = openingBalance + credits - debits
//
// This is exactly `balanceOf()` in services/normalBalance.js, and exactly what
// chartOfAccounts.computedBalance() does — which is why the account's balance
// card, the Trial Balance and the ledger all agree on the closing figure.
//
// ── WHY THE LEDGER SHOWS IT AS A ROW ────────────────────────────────────────
// The opening balance is already INSIDE every computed balance. The ledger was
// only rendering posted journal lines, so the arithmetic on screen started from
// zero and never visibly tied back to the account's opening figure. The fix is
// a DISPLAY row that carries the opening balance as the starting value of the
// running balance — the same number, shown one line earlier. It must never be
// added a second time (see `summarise` below: the row carries `debit: 0,
// credit: 0`, so it contributes to no debit/credit total).
//
// ── DATE FILTERING ──────────────────────────────────────────────────────────
// For a period that starts AFTER the account's inception, the first row is not
// the opening balance itself but the BALANCE BROUGHT FORWARD: the opening
// balance plus the net effect of every posted line dated before the period
// start. That is the balance immediately before the selected start date, and it
// is what stops a mid-year report from incorrectly showing zero.
//
// ── HIERARCHY ───────────────────────────────────────────────────────────────
// An opening balance belongs to ONE account. `forAccount()` reads a single row
// by id and never rolls a parent's balance into a child (or vice versa).
//
// ── POSTING ─────────────────────────────────────────────────────────────────
// Nothing here writes. `openingBalance` is metadata, not a posting, so there is
// no journal entry that could be double-counted and none is ever created.

const { getExpectedNormalBalance, normalizeNormalBalance } = require('./normalBalance');

const LABEL = {
  OPENING: 'Opening Balance',
  BROUGHT_FORWARD: 'Balance Brought Forward',
};

const normalizeDate = (v) => {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  // Accept 'YYYY-MM-DD' and 'YYYY-MM-DDTHH:mm...' — compare on the date part.
  return s.length >= 10 ? s.slice(0, 10) : s;
};

/** The account's normal side: classification first, stored value as fallback. */
function normalSideOf(account) {
  if (!account) return 'Debit';
  return getExpectedNormalBalance(account.type || account.accountType)
    || normalizeNormalBalance(account.normalBalance)
    || 'Debit';
}

/** The stored opening balance, as a number, in the account's normal direction. */
function openingBalanceOf(account) {
  if (!account) return 0;
  const v = Number(account.openingBalance);
  return Number.isFinite(v) ? v : 0;
}

/**
 * Signed effect of one posted line on a normal side.
 * Positive = moves the account further along its normal direction.
 */
function lineEffect(debit, credit, normalSide) {
  const d = Number(debit) || 0;
  const c = Number(credit) || 0;
  return normalSide === 'Credit' ? c - d : d - c;
}

/**
 * True when a line is included in the ledger at all.
 * Mirrors JournalEntries.getByAccount, which excludes only voided entries:
 * NULL/Posted/anything-else is included, 'Void'/'Voided' is not.
 */
function isPostedLine(row) {
  const s = String((row && row.status) == null ? '' : row.status).trim().toLowerCase();
  return s !== 'void' && s !== 'voided';
}

/**
 * The balance immediately BEFORE `fromDate` — i.e. the starting point of a
 * period — built purely from the account's own opening balance plus every
 * posted line dated strictly before `fromDate`.
 *
 * @param {object} account  chart_of_accounts row
 * @param {Array<{date?:string,debit?:number,credit?:number,status?:string}>} priorLines
 *        posted lines dated before the period start
 * @returns {{openingBalance:number, priorMovement:number, balance:number,
 *            normalSide:'Debit'|'Credit', isOpening:boolean, label:string}}
 */
function summarise(account, priorLines = []) {
  const normalSide = normalSideOf(account);
  const openingBalance = openingBalanceOf(account);
  const priorMovement = (Array.isArray(priorLines) ? priorLines : [])
    .filter(isPostedLine)
    .reduce((s, l) => s + lineEffect(l.debit, l.credit, normalSide), 0);
  const balance = openingBalance + priorMovement;
  // "Opening Balance" only when nothing was posted before the period; once
  // earlier activity is folded in it is a brought-forward figure instead.
  const isOpening = Math.abs(priorMovement) < 0.005;
  return {
    openingBalance,
    priorMovement,
    balance,
    normalSide,
    isOpening,
    label: isOpening ? LABEL.OPENING : LABEL.BROUGHT_FORWARD,
  };
}

/**
 * Read the opening / brought-forward state for ONE account from the database.
 * Read-only: performs no writes and creates no posting.
 *
 * @param {object} db  better-sqlite3 db (or the dbmgr wrapper)
 * @param {number|string} accountId
 * @param {{before?:string}} [opts]  period start; omit for the account's inception
 * @returns {null | {accountId:number, accountName:string, accountType:string,
 *          normalBalance:'Debit'|'Credit', openingBalance:number,
 *          openingBalanceDate:string|null, priorMovement:number, balance:number,
 *          isOpening:boolean, label:string, beforeDate:string}}
 */
function forAccount(db, accountId, opts = {}) {
  const id = Number(accountId);
  if (!Number.isFinite(id) || id <= 0) return null;

  let account;
  try {
    account = db.prepare(
      `SELECT id, name, type, normalBalance, openingBalance, openingBalanceDate, status
         FROM chart_of_accounts WHERE id = ?`
    ).get(id);
  } catch {
    return null;
  }
  if (!account) return null;

  const beforeDate = normalizeDate(opts.before);

  // Posted lines dated strictly before the period start, against just this
  // account's id — a parent's child balances are never folded in here.
  let priorLines = [];
  try {
    const sql = `
      SELECT jl.debit, jl.credit, je.date, je.status
      FROM journal_lines jl
      JOIN journal_entries je ON jl.journal_id = je.id
      WHERE jl.account_id = ?
        AND je.status != 'Void'
        ${beforeDate ? 'AND je.date < ?' : ''}
    `;
    priorLines = beforeDate
      ? db.prepare(sql).all(id, beforeDate)
      : db.prepare(sql).all(id);
  } catch {
    priorLines = [];
  }

  const state = summarise(account, priorLines);

  return {
    accountId: id,
    accountName: account.name,
    accountType: account.type,
    normalBalance: state.normalSide,
    openingBalance: state.openingBalance,
    openingBalanceDate: account.openingBalanceDate || null,
    priorMovement: Number(state.priorMovement.toFixed(2)),
    balance: Number(state.balance.toFixed(2)),
    isOpening: state.isOpening,
    label: state.label,
    beforeDate: beforeDate || '',
  };
}

/**
 * The DISPLAY row the General Ledger renders as its first line.
 *
 * `debit` and `credit` are deliberately zero: the opening balance is not a
 * posting, and keeping them at zero is what guarantees the row cannot be
 * counted into any debit/credit total (so totals and the closing balance are
 * byte-identical with and without it).
 *
 * `date` is the period start when a period is selected (the moment the
 * brought-forward balance is true as of). With no period it uses the account's
 * own openingBalanceDate, and falls back to null — never today's date, which
 * would invent a fact.
 */
function openingRow(state) {
  if (!state) return null;
  return {
    id: 'opening',
    journalId: null,
    date: state.beforeDate || state.openingBalanceDate || null,
    reference: '',
    lineDesc: state.label,
    description: state.label,
    debit: 0,
    credit: 0,
    // The running balance STARTS here; the caller seeds its accumulator with it.
    balance: state.balance,
    isOpening: true,
    accountId: state.accountId,
    _idx: -1,
  };
}

/**
 * The starting (book) balance for a BANK RECONCILIATION.
 *
 * The convention (unchanged, and deliberately so):
 *   • A later reconciliation carries forward the previous statement's ending
 *     balance — that figure already contains every earlier cleared movement
 *     AND the opening balance, so the opening balance is never added twice.
 *   • The FIRST reconciliation has nothing to carry forward, so it starts from
 *     the account's opening balance — resolved through THIS service so the
 *     reconciliation and the General Ledger can never disagree about what the
 *     opening balance is.
 *
 * Reading `chart_of_accounts.openingBalance` directly here (as the
 * reconciliation screen used to) is what made it a second, drifting copy of the
 * rule: any change to how an opening balance is interpreted would have to be
 * made in two places.
 *
 * @param {object} db  better-sqlite3 db (or the dbmgr wrapper)
 * @param {number|string} accountId
 * @param {{excludeReconciliationId?:number}} [opts]
 * @returns {{startingBalance:number, source:'prior-statement'|'opening-balance',
 *            priorReconciliationId:number|null, openingBalance:number,
 *            normalSide:'Debit'|'Credit'}}
 */
function reconciliationStartingBalance(db, accountId, opts = {}) {
  const id = Number(accountId);
  const fallback = { startingBalance: 0, source: 'opening-balance', priorReconciliationId: null, openingBalance: 0, normalSide: 'Debit' };
  if (!Number.isFinite(id) || id <= 0) return fallback;

  const state = forAccount(db, id);
  const openingBalance = state ? state.openingBalance : 0;
  const normalSide = state ? state.normalBalance : 'Debit';

  // The most recent PRIOR reconciliation for this account.
  let prior = null;
  try {
    const exclude = Number(opts.excludeReconciliationId);
    prior = db.prepare(
      `SELECT id, statementBalance
         FROM reconciliations
        WHERE accountId = ?
          ${Number.isFinite(exclude) && exclude > 0 ? 'AND id != ?' : ''}
        ORDER BY statementDate DESC, id DESC
        LIMIT 1`
    ).get(...(Number.isFinite(exclude) && exclude > 0 ? [id, exclude] : [id]));
  } catch {
    prior = null;
  }

  if (prior && prior.statementBalance != null) {
    return {
      startingBalance: Number(prior.statementBalance) || 0,
      source: 'prior-statement',
      priorReconciliationId: prior.id,
      openingBalance,
      normalSide,
    };
  }

  return {
    startingBalance: openingBalance,
    source: 'opening-balance',
    priorReconciliationId: null,
    openingBalance,
    normalSide,
  };
}

module.exports = {
  LABEL,
  normalSideOf,
  openingBalanceOf,
  lineEffect,
  isPostedLine,
  summarise,
  forAccount,
  openingRow,
  reconciliationStartingBalance,
};
