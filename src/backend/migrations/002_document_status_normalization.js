// Migration 002 — normalise Invoice & Quote statuses onto the automatic
// workflow vocabulary.
//
// INVOICE
//   The stored status is now always derived from real money:
//       Open  →  Partially Paid  →  Paid
//   Document lifecycle states (Draft / Void / Cancelled) are preserved.
//   Legacy financial labels (Pending / Sent / Unpaid / Overdue / paid …) are
//   replaced with the value the financials actually imply. Payment history is
//   NEVER touched — only invoices.status / invoices.balance are written.
//
// QUOTE
//   Legacy active labels (Open / Sent / Draft / Expired / Pending) collapse to
//   Pending; Invoiced collapses to Converted; Accepted / Declined are preserved.
//
// The migration is idempotent (re-running produces the same result, because the
// invoice status is derived from data, not from the previous label) and it writes
// every changed row to `status_backfill_backup` first so the change is reversible.

const { deriveInvoiceStatus, normalizeQuoteStatus, round2, MONEY_TOLERANCE } = require('../services/documentStatus');

const version = 2;
const description = 'Normalise invoice/quote statuses to the automatic workflow vocabulary';

function tableExists(db, name) {
  try {
    return !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  } catch {
    return false;
  }
}

function columnExists(db, table, column) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
  } catch {
    return false;
  }
}

function ensureBackupTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS status_backfill_backup (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      old_status TEXT,
      new_status TEXT,
      migrated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

// One aggregated pass: every invoice with its computed total and applied payments.
function loadInvoiceFinancialRows(db) {
  return db.prepare(`
    SELECT
      i.id AS id,
      i.status AS status,
      ROUND(COALESCE(t.total, 0) * (1 + COALESCE(i.vat, 0) / 100.0), 2) AS total,
      ROUND(COALESCE(p.paid, 0), 2) AS paid
    FROM invoices i
    LEFT JOIN (
      SELECT invoice_id, SUM(amount) AS total
      FROM invoice_lines
      GROUP BY invoice_id
    ) t ON t.invoice_id = i.id
    LEFT JOIN (
      SELECT x.invoiceId AS invoiceId, SUM(x.amount) AS paid
      FROM (
        SELECT invoiceId, amount FROM payment_allocations
        UNION ALL
        SELECT p2.invoiceId AS invoiceId, p2.amount AS amount
        FROM payments p2
        WHERE p2.invoiceId IS NOT NULL AND p2.invoiceId != 0
          AND NOT EXISTS (SELECT 1 FROM payment_allocations a2 WHERE a2.paymentId = p2.id)
      ) x
      GROUP BY x.invoiceId
    ) p ON p.invoiceId = i.id
  `).all();
}

function backfillInvoices(db, result) {
  if (!tableExists(db, 'invoices')) return;
  const rows = loadInvoiceFinancialRows(db);
  const backup = db.prepare(
    'INSERT INTO status_backfill_backup (entity_type, entity_id, old_status, new_status) VALUES (?, ?, ?, ?)'
  );
  const update = db.prepare('UPDATE invoices SET status = ?, balance = ? WHERE id = ?');

  const counts = {};
  const tx = db.transaction(() => {
    for (const row of rows) {
      const total = round2(row.total);
      const paid = round2(row.paid);
      const newStatus = deriveInvoiceStatus({ currentStatus: row.status, invoiceTotal: total, paidToDate: paid });
      const balance = Math.max(0, round2(total - paid));
      const oldStatus = row.status == null ? null : String(row.status);

      counts[newStatus] = (counts[newStatus] || 0) + 1;

      if (oldStatus !== newStatus) {
        backup.run('invoice', row.id, oldStatus, newStatus);
        result.invoicesChanged++;
      }
      update.run(newStatus, balance, row.id);
    }
  });
  tx();

  result.invoicesScanned = rows.length;
  result.invoiceStatusCounts = counts;
}

function backfillQuotes(db, result) {
  if (!tableExists(db, 'quotes')) return;
  const rows = db.prepare('SELECT id, status, linked_invoice FROM quotes').all();
  const backup = db.prepare(
    'INSERT INTO status_backfill_backup (entity_type, entity_id, old_status, new_status) VALUES (?, ?, ?, ?)'
  );
  const update = db.prepare('UPDATE quotes SET status = ? WHERE id = ?');

  const counts = {};
  const tx = db.transaction(() => {
    for (const row of rows) {
      const oldStatus = row.status == null ? null : String(row.status);
      const hasInvoice = row.linked_invoice != null && row.linked_invoice !== '' && Number(row.linked_invoice) !== 0;
      // A quote that already produced an invoice is Converted regardless of label.
      const newStatus = hasInvoice ? 'Converted' : normalizeQuoteStatus(oldStatus);
      counts[newStatus] = (counts[newStatus] || 0) + 1;

      if (oldStatus !== newStatus) {
        backup.run('quote', row.id, oldStatus, newStatus);
        result.quotesChanged++;
      }
      update.run(newStatus, row.id);
    }
  });
  tx();

  result.quotesScanned = rows.length;
  result.quoteStatusCounts = counts;
}

function up(db) {
  const result = {
    invoicesScanned: 0,
    invoicesChanged: 0,
    quotesScanned: 0,
    quotesChanged: 0,
    invoiceStatusCounts: {},
    quoteStatusCounts: {},
  };

  ensureBackupTable(db);

  // Make sure the lifecycle timestamp columns exist before normalising.
  if (tableExists(db, 'quotes')) {
    for (const [col, ddl] of [['accepted_at', 'TEXT'], ['declined_at', 'TEXT'], ['converted_at', 'TEXT']]) {
      if (!columnExists(db, 'quotes', col)) {
        try { db.prepare(`ALTER TABLE quotes ADD COLUMN ${col} ${ddl}`).run(); } catch { /* best effort */ }
      }
    }
  }

  backfillInvoices(db, result);
  backfillQuotes(db, result);

  console.log(
    `[migration 002] invoices: ${result.invoicesChanged}/${result.invoicesScanned} normalised ` +
    `${JSON.stringify(result.invoiceStatusCounts)} · quotes: ${result.quotesChanged}/${result.quotesScanned} normalised ` +
    `${JSON.stringify(result.quoteStatusCounts)}`
  );

  // Expose the summary for callers/tests (harmless extra key on the migration module).
  up.lastResult = result;
  return result;
}

module.exports = { version, description, up, MONEY_TOLERANCE };
