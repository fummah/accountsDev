/**
 * Contact identity — the FRONTEND half of the ONE rule for "who is this record?".
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
 *   The rule used to be copy-pasted inline into five separate forms, each with
 *   its own wording, and the backend had no rule at all. That is how the two
 *   sides drifted: the form refused a blank record, the API accepted it.
 *
 *   This module is the mirror of src/backend/services/contactIdentity.js and
 *   exports the same three ideas (isIdentified / deriveDisplayName /
 *   firstOrCompanyValidator). There is no schema library (zod/yup) in this
 *   project, so the frontend "schema" is antd rule factories — this is where
 *   they are defined. The two sides cannot share code across the IPC process
 *   boundary, so they are held in step by scripts/verify-contact-identity.js,
 *   which runs the SAME four cases through both and fails if they disagree.
 *
 * CONSUMERS (all of them, so none can drift again)
 *   • customers/shared/customerValidation.js  → re-exports, feeds
 *     CustomerContactFields (Add/Edit Customer, Create Invoice, Create Quote,
 *     New Lead → From Scratch)
 *   • vendors/VendorCenter.js                 → Add Vendor
 *   • vendors/SupplierVendorList.js           → Add / Edit Vendor
 *   • vendors/bills/EnterBill.js              → Add New Vendor from a bill
 *   • Inner/Customers/AddCustomer/index.js    → the inner Customers/Suppliers tab
 */

/**
 * The one string shown whenever both a first name and a company name are
 * missing — used as the field error AND as the helper note beside the fields.
 * The backend returns the identical string (IDENTITY_ERROR); the verification
 * suite asserts the two are byte-equal.
 */
export const IDENTITY_REQUIRED_MESSAGE = 'Enter either a First Name or Company Name.';

/** Trimmed string form of a value, with null/undefined folded to ''. */
export const normIdentity = (v) => String(v == null ? '' : v).trim();

/**
 * True when the record can be identified — a first name OR a company name.
 * Whitespace-only values do not count.
 *
 * `companyField` exists because one legacy form names the company field
 * `company` rather than `company_name`; everything else uses the default.
 */
export const isIdentified = (values = {}, companyField = 'company_name') =>
  Boolean(normIdentity(values.first_name) || normIdentity(values[companyField]));

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
 *
 * Byte-for-byte the same logic as the backend's deriveDisplayName.
 */
export const deriveDisplayName = ({ display_name, first_name, last_name, company_name } = {}) => {
  const explicit = normIdentity(display_name);
  if (explicit) return explicit;
  const person = `${normIdentity(first_name)} ${normIdentity(last_name)}`.trim();
  if (person) return person;
  return normIdentity(company_name);
};

/**
 * THE customer/vendor NAME shown on documents (Invoice / Quote header, PDF,
 * preview, "Bill To", selectors). One rule, used everywhere identity is shown:
 *
 *   1. personal name  → "First Last" (either part alone is fine)
 *   2. otherwise       → Company Name
 *   3. otherwise       → explicit Display Name
 *
 * This is what makes a BUSINESS customer (no First/Last, Company set) render on
 * an invoice instead of a blank heading. First/Last stay OPTIONAL.
 *
 * A lone "-" is a UI placeholder, not a real name, so it is treated as empty
 * (never produces "- -" or "- Westfield Egg Farm"). Values are trimmed, so no
 * double spaces and no stray leading/trailing space.
 */
export const getCustomerName = (customer = {}) => {
  const c = customer || {};
  const clean = (v) => { const s = normIdentity(v); return s === '-' ? '' : s; };
  const first = clean(c.first_name != null ? c.first_name : c.firstName);
  const last = clean(c.last_name != null ? c.last_name : c.lastName);
  const company = clean(c.company_name != null ? c.company_name : c.company);
  const explicit = clean(c.display_name != null ? c.display_name : c.displayName);
  const person = `${first} ${last}`.trim();
  if (person) return person;
  if (company) return company;
  if (explicit) return explicit;
  return '';
};


/**
 * antd validator factory. Attach it to the FIRST NAME field; it consults the
 * company field, so the pair is validated as a unit.
 *
 *   <Form.Item name="first_name" rules={identityRule(form)} />
 *
 * Rejects only when BOTH are blank.
 */
export const firstOrCompanyValidator = (form, companyField = 'company_name') => (_, value) => {
  const first = normIdentity(value);
  const company = normIdentity(form.getFieldValue(companyField));
  return (first || company)
    ? Promise.resolve()
    : Promise.reject(new Error(IDENTITY_REQUIRED_MESSAGE));
};

/** Convenience wrapper so a Form.Item can take the rules array directly. */
export const identityRule = (form, companyField = 'company_name') => [
  { validator: firstOrCompanyValidator(form, companyField) },
];
