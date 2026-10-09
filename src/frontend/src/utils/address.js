import { getCustomerName } from './contactIdentity';

/**
 * THE shared customer address formatter for documents (Quote / Invoice screen,
 * BILL TO / DELIVERY blocks, PDF, print, email attachments).
 *
 * Output order is fixed:
 *
 *     Customer Name
 *     Street Address          (address1, then address2)
 *     City State, PostalCode  (email NEVER goes above the address)
 *     Email Address           (last, and omitted entirely when empty)
 *
 * The US city line is "Lykens PA, 17048" — city and state joined by a SPACE,
 * a COMMA before the postal code. Missing parts collapse cleanly (no
 * "undefined", "null", double commas or empty lines).
 *
 * The name uses the shared getCustomerName rule (First+Last → Company →
 * Display), so a business customer is never a blank first line, and First/Last
 * stay optional.
 *
 * Accepts either structured fields (a customer row or a document header) or a
 * free-text snapshot string (quotes/invoices store `billing_address`), so ONE
 * rule formats both live data and historical snapshots.
 */

const clean = (v) => {
  const s = String(v == null ? '' : v).trim();
  return /^null$/i.test(s) ? '' : s;
};

// Is this a bare postal / ZIP code? (US 12345, 12345-6789, or UK/CA style)
const looksLikePostal = (v) => {
  const t = clean(v);
  if (!t) return false;
  if (/^\d{4,10}(-\d{4})?$/.test(t)) return true;
  if (/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(t)) return true;
  return false;
};

/** "City State, Postal" — the ONE city/state/postal line format. */
export function formatCityStatePostal(city, state, postal) {
  const c = clean(city);
  const s = clean(state);
  const p = clean(postal);
  const cs = [c, s].filter(Boolean).join(' ');
  if (cs && p) return `${cs}, ${p}`;
  if (cs) return cs;
  return p;
}

/** Address-only lines from STRUCTURED fields (address1, address2, city..., country). */
export function structuredAddressLines(source = {}) {
  const lines = [];
  const a1 = clean(source.address1 || source.address || source.street || source.street1 || source.line1);
  const a2 = clean(source.address2 || source.suite || source.line2);
  if (a1) lines.push(a1);
  if (a2) lines.push(a2);
  const csz = formatCityStatePostal(
    source.city || source.town,
    source.state || source.province || source.region,
    source.postal_code || source.postalCode || source.zip || source.postcode
  );
  if (csz) lines.push(csz);
  const country = clean(source.country);
  if (country) lines.push(country);
  return lines;
}

/** Address-only lines from a free-text snapshot string. */
export function textAddressLines(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return [];

  // One logical part per line; a single comma-separated line is split on commas.
  let tokens = text.split(/\r?\n/).map(clean).filter(Boolean);
  if (tokens.length === 1 && tokens[0].includes(',')) {
    tokens = tokens[0].split(',').map(clean).filter(Boolean);
  }

  let postal = '';
  let state = '';
  let city = '';

  // 1. Trailing postal — either a bare token, or embedded at the end of the last part.
  if (tokens.length && looksLikePostal(tokens[tokens.length - 1])) {
    postal = clean(tokens.pop());
  } else if (tokens.length) {
    const m = clean(tokens[tokens.length - 1]).match(/^(.*?)[\s,]+(\d{5}(?:-\d{4})?|[A-Z]\d[A-Z]\s?\d[A-Z]\d)$/i);
    if (m) {
      postal = clean(m[2]);
      const rest = clean(m[1]);
      if (rest) tokens[tokens.length - 1] = rest; else tokens.pop();
    }
  }

  // 2. Trailing 2-letter state — as its own token, or at the end of the last part.
  if (tokens.length) {
    const last = clean(tokens[tokens.length - 1]);
    if (/^[A-Za-z]{2}$/.test(last) && tokens.length >= 2) {
      state = last.toUpperCase();
      tokens.pop();
    } else {
      const sm = last.match(/^(.*?)[\s,]+([A-Za-z]{2})$/);
      if (sm && clean(sm[1])) {
        state = sm[2].toUpperCase();
        tokens[tokens.length - 1] = clean(sm[1]);
      }
    }
  }

  // 3. City is the last remaining part once a state/postal was found.
  if ((state || postal) && tokens.length) {
    city = clean(tokens.pop());
  }

  const out = tokens.filter(Boolean);
  const csz = formatCityStatePostal(city, state, postal);
  if (csz) out.push(csz);
  return out;
}

/**
 * Address-only lines from either structured fields or a snapshot string.
 * An object that carries structured address fields wins; otherwise it is
 * treated as a plain string.
 */
export function formatAddressLines(address) {
  if (address == null) return [];
  if (typeof address === 'object') return structuredAddressLines(address);
  return textAddressLines(address);
}

/**
 * The full document block as an array of non-empty lines:
 *   [Customer Name, ...addressLines, Email?]
 *
 * `source` accepts a customer row, a document header, or
 * { name, email, address }. Historical snapshots are respected: when an
 * `address`/`billingAddress`/`billing_address` value is supplied it is used
 * verbatim (re-formatted only); the current customer object is never
 * substituted over it.
 */
export function formatCustomerAddress(source = {}, { includeEmail = true } = {}) {
  const src = source || {};
  const name = clean(src.name) || clean(src.customerName) || getCustomerName(src);
  const email = clean(src.email || src.customer_email);

  const address = src.address != null ? src.address
    : (src.billingAddress != null ? src.billingAddress
      : (src.billing_address != null ? src.billing_address : undefined));

  let lines = address !== undefined ? formatAddressLines(address) : [];
  if (!lines.length) lines = structuredAddressLines(src);

  const out = [];
  if (name) out.push(name);
  lines.forEach(l => out.push(l));
  if (includeEmail && email) out.push(email);
  return out;
}
