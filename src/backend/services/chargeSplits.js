/**
 * chargeSplits.js — ONE place that derives a Credit Card Charge total from its
 * expense split lines.
 *
 * The split lines are the accounting source of truth: the charge total is the
 * SUM of the meaningful lines (a real account + a positive amount). The backend
 * derives this itself so a malformed request can never persist a `transactions`
 * total — or post a journal credit — that disagrees with the lines it is split
 * across. Blank convenience rows are ignored.
 *
 * Money is summed in integer cents (via the shared round2 helper) so repeated
 * addition cannot drift.
 */
const { round2, MONEY_TOLERANCE } = require('./documentStatus');

const lineAmount = (l) => Number(l && (l.amount != null ? l.amount : l.line_amount)) || 0;
const lineAccount = (l) => (l && (l.account || l.category || l.accountName)) || '';
const lineAccountId = (l) => (l && (l.account_id != null ? l.account_id : l.accountId));

/** A line counts toward the charge only when it names an account AND has a positive amount. */
const isMeaningfulSplitLine = (l) =>
  (Boolean(lineAccount(l)) || lineAccountId(l) != null) && lineAmount(l) > 0;

/** Sum split-line amounts with integer-cent arithmetic. */
const sumSplitLines = (lines) => {
  const cents = (Array.isArray(lines) ? lines : []).reduce(
    (s, l) => s + Math.round(lineAmount(l) * 100),
    0
  );
  return cents / 100;
};

/**
 * The charge total implied by the split lines, or null when no line carries a
 * meaningful amount (caller then falls back to its own amount / stored record).
 */
const deriveSplitTotal = (lines) => {
  const meaningful = (Array.isArray(lines) ? lines : []).filter(isMeaningfulSplitLine);
  if (!meaningful.length) return null;
  return sumSplitLines(meaningful);
};

/**
 * Parse a stored `transactions.categories` value back into split lines. Handles
 * the current JSON array of { account, account_id, description, amount } objects
 * and the legacy comma-separated account-name string (which carries no amounts,
 * so it yields no derived total and the stored amount is preserved).
 */
const parseStoredSplits = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t.startsWith('[') || t.startsWith('{')) {
      try {
        const parsed = JSON.parse(t);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
  }
  return [];
};

module.exports = {
  isMeaningfulSplitLine,
  sumSplitLines,
  deriveSplitTotal,
  parseStoredSplits,
  round2,
  MONEY_TOLERANCE,
};
