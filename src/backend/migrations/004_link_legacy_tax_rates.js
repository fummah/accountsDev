// Migration 004 — Link legacy numeric tax rates to VAT rate IDs.
//
// CONTEXT
//   Before the Default Tax Rate dropdown was implemented, customers stored a
//   manually typed percentage in `default_tax_rate` (a REAL column). The new
//   system stores a reference to a VAT rate's unique ID in
//   `default_tax_rate_id` (an INTEGER column), so renaming a rate propagates
//   automatically and the relationship is by reference, not by a typed number.
//
// WHAT THIS DOES
//   Finds every customer whose `default_tax_rate` is not NULL but whose
//   `default_tax_rate_id` IS NULL (i.e. a legacy record that was never
//   linked). For each, it looks up the `vat` table for rates whose
//   `vat_percentage` matches the stored number.
//
//     • Exactly one match  → link it (set `default_tax_rate_id`)
//     • Multiple matches    → preserve the legacy value, do NOT choose
//                             arbitrarily. The "fix on edit" logic in the
//                             frontend will present the ambiguous case to
//                             the user when the record is opened.
//     • No match            → preserve the legacy value. The numeric
//                             percentage remains in `default_tax_rate` for
//                             display; the user can select a rate when editing.
//
// WHAT THIS DOES NOT DO
//   It never deletes or overwrites the `default_tax_rate` column. The numeric
//   value is always preserved as a fallback snapshot.
//
// IDEMPOTENCY
//   A second run finds zero records with `default_tax_rate_id IS NULL`
//   (assuming all were linked), so it writes nothing.

const version = 4;
const description = 'Link legacy numeric tax rates to VAT rate IDs where the match is unique';

function tableExists(db, name) {
  try {
    return !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  } catch {
    return false;
  }
}

function up(db) {
  const result = { scanned: 0, linked: 0, ambiguous: 0, unmatched: 0, report: [] };

  // The vat table is created by the Vat model, which loads before migrations
  // run. If it's somehow missing, there's nothing to link.
  if (!tableExists(db, 'vat')) {
    console.log('[migration 004] vat table not found — skipping tax rate linking');
    up.lastResult = result;
    return result;
  }

  // Find customers with a numeric rate but no ID
  const unmatchedCustomers = db.prepare(
    "SELECT id, default_tax_rate FROM customers WHERE default_tax_rate IS NOT NULL AND default_tax_rate_id IS NULL"
  ).all();

  result.scanned = unmatchedCustomers.length;

  if (result.scanned === 0) {
    console.log('[migration 004] No legacy tax rates to link');
    up.lastResult = result;
    return result;
  }

  const matchStmt = db.prepare(
    "SELECT id, vat_name, vat_percentage FROM vat WHERE vat_percentage = ?"
  );
  const linkStmt = db.prepare(
    "UPDATE customers SET default_tax_rate_id = ? WHERE id = ?"
  );

  for (const rec of unmatchedCustomers) {
    const matches = matchStmt.all(Number(rec.default_tax_rate));

    if (matches.length === 1) {
      // Unique match — link it safely
      linkStmt.run(matches[0].id, rec.id);
      result.linked++;
      result.report.push({
        table: 'customers', id: rec.id, rate: rec.default_tax_rate,
        action: 'linked', vatId: matches[0].id, vatName: matches[0].vat_name,
      });
    } else if (matches.length > 1) {
      // Ambiguous — preserve legacy value, do not choose arbitrarily
      result.ambiguous++;
      result.report.push({
        table: 'customers', id: rec.id, rate: rec.default_tax_rate,
        action: 'ambiguous', candidates: matches.length,
      });
    } else {
      // No match — the numeric rate doesn't correspond to any saved VAT rate
      result.unmatched++;
      result.report.push({
        table: 'customers', id: rec.id, rate: rec.default_tax_rate,
        action: 'unmatched',
      });
    }
  }

  console.log(
    `[migration 004] Legacy tax rate backfill: ${result.linked} linked, ` +
    `${result.ambiguous} ambiguous, ${result.unmatched} unmatched ` +
    `out of ${result.scanned} customer record(s). ` +
    (result.ambiguous + result.unmatched > 0
      ? 'Ambiguous/unmatched records preserved — resolved on edit.'
      : 'All records linked.')
  );

  up.lastResult = result;
  return result;
}

module.exports = { version, description, up };
