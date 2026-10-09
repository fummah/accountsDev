/**
 * Contact identity — the ONE rule for "who is this record?".
 *
 * A customer or vendor must be identifiable either as a PERSON (First Name) or
 * as a BUSINESS (Company Name). Neither is required on its own; at least one is:
 *
 *     First Name = John    Company = ''        -> valid
 *     First Name = ''      Company = Amazon    -> valid
 *     First Name = John    Company = ABC Ltd   -> valid
 *     First Name = ''      Company = ''        -> INVALID
 *
 * WHY THIS FILE EXISTS
 *   The frontend already had this rule (`firstOrCompanyValidator` in
 *   src/frontend/src/components/customers/shared/customerValidation.js) but the
 *   backend had NO validation at all, so the API happily stored a record with
 *   neither field set. The two sides could therefore disagree — the exact class
 *   of drift this codebase keeps getting bitten by.
 *
 *   There is no schema library (zod/yup/class-validator) in this project. The
 *   frontend expresses its schema as antd rule factories; the backend expresses
 *   the same rule as this module. That is the "schema" on each side of the IPC
 *   boundary. They cannot share code across the process boundary, so they are
 *   held in step by `scripts/verify-contact-identity.js`, which runs the SAME
 *   four cases through both and fails if they ever disagree.
 *
 * NOTE ON `first_name`
 *   Both tables declare `first_name TEXT NOT NULL`. That is NOT what blocks a
 *   company-only record — an empty string satisfies NOT NULL, and the model
 *   writes `''`. The constraint is deliberately left alone: dropping it would
 *   let NULL reach expressions such as
 *   `first_name || ' ' || COALESCE(last_name,'')` in the search/sort SQL, where
 *   NULL propagates and would make the row unsearchable. `''` is the safe
 *   representation of "no first name".
 */

/** The message shown in the UI and returned by the API — one string, both sides. */
const IDENTITY_ERROR = 'Enter either a First Name or Company Name.';

/** Trimmed string form of a value, with null/undefined folded to ''. */
const norm = (v) => String(v == null ? '' : v).trim();

/**
 * True when the record can be identified — a first name OR a company name.
 * Whitespace-only values do not count.
 */
function isIdentified({ first_name, company_name } = {}) {
  return Boolean(norm(first_name) || norm(company_name));
}

/**
 * Throw unless the record is identifiable. The error carries a stable `code`
 * so callers can distinguish it from a database failure.
 */
function assertIdentified(fields = {}) {
  if (!isIdentified(fields)) {
    const err = new Error(IDENTITY_ERROR);
    err.code = 'CONTACT_IDENTITY_REQUIRED';
    throw err;
  }
  return true;
}

/**
 * Display name — the ONE derivation rule, in priority order:
 *
 *   1. an explicit Display Name always wins
 *   2. otherwise the personal name, "First Last"
 *   3. otherwise the Company Name
 *
 * Step 3 is what makes a company-only record render everywhere instead of
 * showing as blank. An individual keeps generating from the personal name, so
 * existing behaviour is preserved.
 */
function deriveDisplayName({ display_name, first_name, last_name, company_name } = {}) {
  const explicit = norm(display_name);
  if (explicit) return explicit;
  const person = `${norm(first_name)} ${norm(last_name)}`.trim();
  if (person) return person;
  return norm(company_name);
}

/**
 * THE document/list NAME rule — identical to the frontend `getCustomerName`
 * (src/frontend/src/utils/contactIdentity.js) and to the SQL produced by
 * `customerNameSql` below. Priority:
 *
 *   1. the personal name, "First Last" (either part alone is fine)
 *   2. otherwise the Company Name
 *   3. otherwise an explicit Display Name
 *
 * This is what makes a BUSINESS customer (no First/Last, Company set) show as
 * "Westfield Egg Farm" on a quote/invoice list instead of a blank cell.
 * First/Last stay OPTIONAL. A lone "-" is a UI placeholder, treated as empty,
 * so it never yields "- -" or "- Westfield Egg Farm".
 *
 * NOTE: this intentionally REVERSES the display_name-first order of the legacy
 * `deriveDisplayName` above (which is kept for the customer form's own
 * derivation). The three implementations are held in step by
 * scripts/verify-customer-name.js.
 */
function getCustomerName({ first_name, last_name, company_name, display_name } = {}) {
  const clean = (v) => { const s = norm(v); return s === '-' ? '' : s; };
  const person = `${clean(first_name)} ${clean(last_name)}`.trim();
  if (person) return person;
  const company = clean(company_name);
  if (company) return company;
  return clean(display_name);
}

/**
 * SQL expression producing EXACTLY the same string as getCustomerName, for
 * SELECT lists (which cannot call JS). `alias` is the joined customers table
 * alias (default `c`). Each raw column is trimmed and a lone "-" folded to
 * NULL, then COALESCE picks person → company → display_name.
 */
function customerNameSql(alias = 'c') {
  const clean = (col) => `NULLIF(NULLIF(TRIM(COALESCE(${alias}.${col}, '')), ''), '-')`;
  const person = `NULLIF(TRIM(COALESCE(${clean('first_name')}, '') || ' ' || COALESCE(${clean('last_name')}, '')), '')`;
  return `COALESCE(${person}, ${clean('company_name')}, ${clean('display_name')}, '')`;
}

module.exports = {
  IDENTITY_ERROR,
  isIdentified,
  assertIdentified,
  deriveDisplayName,
  getCustomerName,
  customerNameSql,
  norm,
};
