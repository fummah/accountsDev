const db = require('./dbmgr');

// ── Sales Register ────────────────────────────────────────────────────────
// A read-only chronological audit trail of every sales document:
// Quotes, Invoices, Payments, Credit Notes (refunds), and Recurring templates.
// Internal accounting reversal/void journal entries are intentionally excluded —
// each invoice/document appears once (voided invoices show $0.00 / Void).
// Each row carries source_type/source_id so the UI can drill down.
const SalesRegister = {
  // Build the UNION ALL subqueries (one per source table). All must emit the
  // same column set: date, type, number, customer, memo, amount, status,
  // source_type, source_id, rid.
  unionSql() {
    return `
      SELECT
        q.start_date AS date,
        'Quote' AS type,
        q.number,
        COALESCE(NULLIF(c.display_name, ''), c.first_name || ' ' || c.last_name, '') AS customer,
        q.message AS memo,
        ROUND(COALESCE(SUM(ql.amount), 0) * (1 + COALESCE(q.vat, 0) / 100.0), 2) AS amount,
        q.status,
        'quote' AS source_type,
        q.id AS source_id,
        q.id AS rid
      FROM quotes q
      LEFT JOIN quote_lines ql ON ql.quote_id = q.id
      LEFT JOIN customers c ON c.id = q.customer
      GROUP BY q.id

      UNION ALL

      SELECT
        i.start_date AS date,
        'Invoice' AS type,
        i.number,
        COALESCE(NULLIF(c.display_name, ''), c.first_name || ' ' || c.last_name, '') AS customer,
        i.message AS memo,
        CASE WHEN LOWER(COALESCE(i.status, '')) IN ('void', 'voided') THEN 0
             ELSE ROUND(COALESCE(SUM(il.amount), 0) * (1 + COALESCE(i.vat, 0) / 100.0), 2)
        END AS amount,
        i.status,
        'invoice' AS source_type,
        i.id AS source_id,
        i.id AS rid
      FROM invoices i
      LEFT JOIN invoice_lines il ON il.invoice_id = i.id
      LEFT JOIN customers c ON c.id = i.customer
      GROUP BY i.id

      UNION ALL

      SELECT
        COALESCE(p.date, p.createdAt) AS date,
        'Payment' AS type,
        COALESCE(p.reference, i.number) AS number,
        COALESCE(NULLIF(c.display_name, ''), c.first_name || ' ' || c.last_name, '') AS customer,
        p.memo,
        p.amount AS amount,
        COALESCE(p.status, 'Posted') AS status,
        'payment' AS source_type,
        p.id AS source_id,
        p.id AS rid
      FROM payments p
      LEFT JOIN invoices i ON p.invoiceId = i.id
      LEFT JOIN customers c ON c.id = COALESCE(p.customerId, i.customer)

      UNION ALL

      SELECT
        cn.date AS date,
        'Credit Note' AS type,
        cn.credit_note_number AS number,
        cn.customer_name AS customer,
        cn.reason AS memo,
        -cn.total AS amount,
        cn.status,
        'credit_note' AS source_type,
        cn.id AS source_id,
        cn.id AS rid
      FROM credit_notes cn

      UNION ALL

      SELECT
        rt.nextDate AS date,
        'Recurring' AS type,
        'REC-' || rt.id AS number,
        COALESCE(rt.kind, '') AS customer,
        rt.description AS memo,
        rt.amount AS amount,
        rt.status,
        'recurring' AS source_type,
        rt.id AS source_id,
        rt.id AS rid
      FROM recurring_transactions rt
    `;
  },

  // Wrap the union and apply filters + pagination.
  getRegister({ page = 1, pageSize = 25, search = '', type = '', dateFrom = '', dateTo = '' } = {}) {
    try {
      const offset = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(pageSize));
      const limit = Math.max(1, Math.min(500, Number(pageSize)));

      const whereParts = [];
      const params = [];
      if (type && type.trim()) {
        whereParts.push('type = ?');
        params.push(type.trim());
      }
      if (dateFrom) {
        whereParts.push('date >= ?');
        params.push(dateFrom);
      }
      if (dateTo) {
        whereParts.push('date <= ?');
        params.push(dateTo);
      }
      const s = search && search.trim() ? search.trim() : '';
      if (s) {
        whereParts.push('(number LIKE ? OR customer LIKE ? OR memo LIKE ? OR type LIKE ? OR status LIKE ?)');
        const p = `%${s}%`;
        params.push(p, p, p, p, p);
      }
      const where = whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : '';

      const wrapped = `SELECT * FROM (${this.unionSql()}) AS reg${where}`;
      const total = db.prepare(`SELECT COUNT(*) AS total FROM (${wrapped})`).get(...params).total || 0;

      const rows = db.prepare(`${wrapped} ORDER BY date DESC, rid DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

      // Summary aggregates over the full filtered set (ignoring pagination)
      const summaryRow = db.prepare(`
        SELECT
          ROUND(COALESCE(SUM(CASE WHEN type = 'Quote' THEN amount ELSE 0 END), 0), 2) AS quotesAmount,
          ROUND(COALESCE(SUM(CASE WHEN type = 'Invoice' THEN amount ELSE 0 END), 0), 2) AS invoicesAmount,
          ROUND(COALESCE(SUM(CASE WHEN type = 'Payment' THEN amount ELSE 0 END), 0), 2) AS paymentsAmount,
          ROUND(COALESCE(SUM(CASE WHEN type = 'Credit Note' THEN amount ELSE 0 END), 0), 2) AS creditNotesAmount,
          COUNT(*) AS count
        FROM (${wrapped})
      `).get(...params);

      return {
        data: rows,
        total,
        summary: {
          quotesAmount: Number(summaryRow?.quotesAmount || 0),
          invoicesAmount: Number(summaryRow?.invoicesAmount || 0),
          paymentsAmount: Number(summaryRow?.paymentsAmount || 0),
          creditNotesAmount: Number(summaryRow?.creditNotesAmount || 0),
          count: Number(summaryRow?.count || 0),
        },
      };
    } catch (e) {
      console.error('[salesRegister] getRegister error:', e.message);
      return { data: [], total: 0, summary: { quotesAmount: 0, invoicesAmount: 0, paymentsAmount: 0, creditNotesAmount: 0, count: 0 }, error: e.message };
    }
  },
};

module.exports = SalesRegister;
