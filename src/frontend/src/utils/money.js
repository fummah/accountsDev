/**
 * money.js — accounting-safe money helpers shared by line-based forms.
 *
 * Every amount is summed in integer CENTS so repeated addition can never drift
 * (0.1 + 0.2 !== 0.3 in binary floating point). Values are only converted back
 * to a 2-decimal currency number at the very end. This mirrors the backend's
 * `round2` / `MONEY_TOLERANCE` (src/backend/services/documentStatus.js) so a
 * form total and the ledger it posts always agree to the cent.
 */

export const MONEY_TOLERANCE = 0.005;

/** Convert a currency value to whole cents (the unit all math happens in). */
export const toCents = (value) => Math.round((Number(value) || 0) * 100);

/** Convert whole cents back to a currency value. */
export const fromCents = (cents) => (Number(cents) || 0) / 100;

/** Round a currency value to 2 decimals. */
export const round2 = (value) => fromCents(toCents(value));

/**
 * Sum a list of currency values with integer-cent arithmetic. Non-numeric and
 * blank entries contribute 0, so empty convenience rows are ignored.
 */
export const sumMoney = (values) =>
  fromCents((Array.isArray(values) ? values : []).reduce((cents, v) => cents + toCents(v), 0));

/** True when two currency values are equal to the cent. */
export const moneyEquals = (a, b) => toCents(a) === toCents(b);
