/**
 * Default Tax Rate — the ONE rule for turning a form's tax fields into the two
 * columns the `customers` / `suppliers` tables actually store.
 *
 * The record keeps TWO values:
 *
 *   default_tax_rate_id  INTEGER  the VAT rate's unique id — the RELATIONSHIP
 *   default_tax_rate     REAL     the percentage at save time — a SNAPSHOT
 *
 * The id is what the app reads back (so renaming a rate updates every contact
 * automatically); the percentage is a denormalised fallback for rows written
 * before the dropdown existed. Only the id decides what is displayed — the
 * snapshot is only consulted when the id is absent (see the display fallback in
 * CustomerDetails / SupplierVendorList).
 *
 * WHY THIS FILE EXISTS
 *   Every contact form worked out those two values itself, inline, and they
 *   disagreed. CustomerCenter and CustomerList sent `null` when the dropdown
 *   was empty; CustomerDetails sent `undefined`. The backend reads `undefined`
 *   as "field not supplied" and keeps the stored value, so clearing the Default
 *   Tax Rate on the Customer edit form left the OLD percentage on the row — and
 *   because the display falls back to the snapshot when the id is null, the
 *   cleared rate reappeared as soon as the modal closed. One form's typo, shown
 *   as a tax rate the user had just removed.
 *
 *   This module is the single definition of that mapping. All five forms call
 *   it, so they cannot disagree again.
 *
 * THE FOUR CASES (all covered by scripts/verify-tax-rate-dropdown.js)
 *
 *   1. Non-taxable        -> clear BOTH. A non-taxable contact cannot carry a
 *                            rate reference; this is the rule TaxSettingsSection
 *                            already applies in the UI, enforced again here so a
 *                            direct caller cannot bypass it.
 *   2. Nothing selected   -> clear BOTH. Covers "never set" and "user cleared
 *                            the dropdown" — the case that used to leave the
 *                            stale snapshot behind.
 *   3. Rate resolves      -> store the id, snapshot its percentage.
 *   4. Rate does NOT      -> keep the id (do NOT silently drop a reference the
 *      resolve               user never touched — a deleted rate must not turn
 *                            an unrelated edit into data loss), and leave the
 *                            snapshot alone by returning `undefined` for it,
 *                            which the backend reads as "keep what's stored".
 */

/** Trimmed string form of a value, with null/undefined folded to ''. */
const norm = (v) => String(v == null ? '' : v).trim();

/**
 * True unless the caller explicitly set taxable to a falsey value.
 * `undefined` means "not supplied" and is treated as taxable, matching the
 * column default (`taxable INTEGER DEFAULT 1`).
 */
const isTaxable = (taxable) => (taxable == null ? true : Boolean(taxable));

/**
 * Map a form's values to the pair of columns to persist.
 *
 * @param   {object} values    the antd form values (needs `taxable` and
 *                             `default_tax_rate_id`)
 * @param   {Array}  vatRates  saved rates from getAllVat() —
 *                             [{ id, vat_name, vat_percentage }]
 * @returns {{ default_tax_rate: (number|null|undefined), default_tax_rate_id: (number|null) }}
 *          `undefined` for `default_tax_rate` means "leave the stored snapshot
 *          as it is"; `null` means "clear it".
 */
export const resolveTaxRateFields = (values = {}, vatRates = []) => {
  // 1. Non-taxable contacts never carry a rate.
  if (!isTaxable(values.taxable)) {
    return { default_tax_rate: null, default_tax_rate_id: null };
  }

  // 2. Nothing selected — never set, or cleared by the user.
  const rawId = values.default_tax_rate_id;
  if (rawId == null || norm(rawId) === '') {
    return { default_tax_rate: null, default_tax_rate_id: null };
  }

  // 3. Resolve the selection against the saved rates.
  const id = Number(rawId);
  const rate = (vatRates || []).find(r => Number(r.id) === id);

  if (!rate) {
    // 4. Dangling reference (the rate was deleted). Preserve the id and the
    //    snapshot — an edit to some other field must not erase a tax rate the
    //    user never touched. The UI shows this as "Deleted rate #N".
    return { default_tax_rate: undefined, default_tax_rate_id: id };
  }

  return {
    default_tax_rate: Number(rate.vat_percentage),
    default_tax_rate_id: Number(rate.id),
  };
};

/**
 * The label shown for a saved rate — the ONE place the display format lives,
 * so a dropdown option and a read-only detail row can never disagree.
 *
 *   { vat_name: 'PA Sales Tax', vat_percentage: 6 }  ->  "PA Sales Tax (6%)"
 */
export const taxRateLabel = (rate) =>
  rate ? `${rate.vat_name} (${rate.vat_percentage}%)` : '';

/**
 * Resolve a STORED record to the value the dropdown should show — the inverse
 * of resolveTaxRateFields, used when opening an edit form.
 *
 * The stored id is the relationship, so it is used directly. Only when a row
 * has no id (written before the dropdown existed) is the typed percentage
 * consulted — and then only if it matches exactly ONE saved rate. An ambiguous
 * percentage returns `undefined` rather than picking a winner, so the form
 * shows blank instead of silently claiming the record is on a rate it may not
 * be on; the legacy number itself is never destroyed.
 *
 * @returns {number|undefined}  the id to select, or undefined for "no selection"
 */
export const taxRateFormValue = (record = {}, vatRates = []) => {
  if (record.default_tax_rate_id != null) return Number(record.default_tax_rate_id);

  if (record.default_tax_rate == null) return undefined;

  const matches = (vatRates || []).filter(
    v => Number(v.vat_percentage) === Number(record.default_tax_rate)
  );
  return matches.length === 1 ? Number(matches[0].id) : undefined;
};

/**
 * Resolve what to DISPLAY for a stored contact record.
 *
 * The id wins; the numeric snapshot is only a fallback for rows written before
 * the dropdown existed. Returns a plain string for read-only rows.
 *
 * @param   {object} record    a customers/suppliers row
 * @param   {Array}  vatRates  saved rates from getAllVat()
 * @returns {string}           e.g. "VAT (15%)", "6%", "Deleted rate #5", "None"
 */
export const describeTaxRate = (record = {}, vatRates = []) => {
  const byId = (id) => (vatRates || []).find(v => Number(v.id) === Number(id));

  if (record.default_tax_rate_id != null) {
    const rate = byId(record.default_tax_rate_id);
    // The id points at a rate that no longer exists.
    return rate ? taxRateLabel(rate) : `Deleted rate #${record.default_tax_rate_id}`;
  }

  if (record.default_tax_rate != null) {
    // Legacy row: no id, only a typed percentage.
    const match = (vatRates || []).find(
      v => Number(v.vat_percentage) === Number(record.default_tax_rate)
    );
    return match
      ? `${match.vat_name} (${record.default_tax_rate}%)`
      : `${record.default_tax_rate}%`;
  }

  return 'None';
};
