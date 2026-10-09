// src/backend/models/Quotes.js
const db = require('./dbmgr.js');
const { recalcInvoiceFinancials } = require('../services/invoiceFinancials');
const { filterDocumentLines } = require('../services/documentLines');
const {
  QUOTE_STATUS,
  INVOICE_STATUS,
  normalizeQuoteStatus,
} = require('../services/documentStatus');
const {
  getCustomerName,
  customerNameSql,
} = require('../services/contactIdentity');

// ─────────────────────────────────────────────────────────────────────────────
// Quote status is SYSTEM CONTROLLED.
//
// A quote is created Pending (active) and may only move through explicit
// workflow operations:
//
//     acceptQuote(id)            Pending            → Accepted
//     declineQuote(id)           Pending            → Declined
//     convertQuoteToInvoice(id)  Pending | Accepted → Converted (+ new Invoice)
//
// updateQuote() deliberately ignores any client-supplied status: the normal
// edit form can never rewrite the lifecycle state.
// ─────────────────────────────────────────────────────────────────────────────

const Quotes = {
  // Create the Quotes table if it doesn't exist
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS quotes (
    id	INTEGER,
    status	TEXT NOT NULL,
	customer	INTEGER NOT NULL,
    customer_email	TEXT,
	islater	TEXT,
    billing_address	TEXT,
    start_date	TEXT,
    last_date TEXT,
    message TEXT,
    statement_message TEXT,
    number TEXT,
    linked_invoice TEXT,
    vat REAL NOT NULL DEFAULT 0,
	entered_by	TEXT,
	date_entered DATETIME DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(id AUTOINCREMENT),
  FOREIGN KEY (customer) REFERENCES customers(id)
      )
    `;


    db.prepare(stmt).run();
    // Best-effort DB-level uniqueness on quote numbers. Silently skipped if
    // legacy data already contains duplicates (model-level guards still apply).
    try {
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_number_unique ON quotes(number) WHERE number IS NOT NULL AND number != \'\'').run();
    } catch (e) { /* leave enforcement to the model guards */ }
    try {
      const colNames = db.prepare("PRAGMA table_info(quotes)").all().map(c => c.name);
      if (!colNames.includes('sent_date'))   db.prepare("ALTER TABLE quotes ADD COLUMN sent_date TEXT").run();
      if (!colNames.includes('sent_method')) db.prepare("ALTER TABLE quotes ADD COLUMN sent_method TEXT DEFAULT 'Not Sent'").run();
      if (!colNames.includes('sent_status')) db.prepare("ALTER TABLE quotes ADD COLUMN sent_status TEXT DEFAULT 'Not Sent'").run();
      // Lifecycle audit timestamps (best effort — old DBs get them added here).
      if (!colNames.includes('linked_invoice')) db.prepare("ALTER TABLE quotes ADD COLUMN linked_invoice INTEGER").run();
      // Source-lead traceability: a quote created from a Lead stores lead_id so
      // Customer → Lead → Quote is a stable ID relationship (not a note).
      if (!colNames.includes('lead_id')) db.prepare("ALTER TABLE quotes ADD COLUMN lead_id INTEGER").run();
      if (!colNames.includes('accepted_at'))  db.prepare("ALTER TABLE quotes ADD COLUMN accepted_at TEXT").run();
      if (!colNames.includes('declined_at'))  db.prepare("ALTER TABLE quotes ADD COLUMN declined_at TEXT").run();
      if (!colNames.includes('converted_at')) db.prepare("ALTER TABLE quotes ADD COLUMN converted_at TEXT").run();
    } catch {}
  },
  createQuoteItem: () => {
    const stmt = `
     CREATE TABLE IF NOT EXISTS quote_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id INTEGER,
    product Integer NOT NULL,
    description TEXT,
    quantity INTEGER,
    rate TEXT,    
    amount REAL NOT NULL,
    date_entered DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quote_id) REFERENCES quotes(id)
  )`;
    db.prepare(stmt).run();
    // Line-level sales-tax snapshot (defaults from the Item's Sales Tax Code).
    try {
      const cols = new Set(db.prepare("PRAGMA table_info('quote_lines')").all().map(r => r.name));
      const add = (c, ddl) => { if (!cols.has(c)) db.prepare(`ALTER TABLE quote_lines ADD COLUMN ${c} ${ddl}`).run(); };
      add('item_type', 'TEXT');
      add('tax_rate_id', 'INTEGER');
      add('tax_rate', 'REAL DEFAULT 0');
      add('tax_amount', 'REAL DEFAULT 0');
    } catch (e) { console.error('[quotes] quote_lines tax migration failed:', e); }
  },

  /** The item accounting/tax snapshot written onto a quote line at creation. */
  productSnapshot: (productId) => {
    const empty = { item_type: null, tax_rate_id: null, tax_rate: 0 };
    const pid = Number(productId);
    if (!pid) return empty;
    try {
      const p = db.prepare(`
        SELECT p.type, p.sales_tax_rate_id, v.vat_percentage
        FROM products p LEFT JOIN vat v ON v.id = p.sales_tax_rate_id
        WHERE p.id = ?`).get(pid);
      if (!p) return empty;
      return {
        item_type: p.type || null,
        tax_rate_id: p.sales_tax_rate_id != null ? Number(p.sales_tax_rate_id) : null,
        tax_rate: Number(p.vat_percentage) || 0,
      };
    } catch { return empty; }
  },
  
  // Insert a new Quote.
  //
  // `status` is accepted for signature compatibility but ignored — a new quote
  // always starts in the active state (Pending). The user never chooses it.
  insertQuote: (status,customer,customer_email, islater, billing_address,start_date,last_date,message,statement_message,number,entered_by,vat,quoteLines) => {
    try {
    // Quote numbers must be unique; reject duplicates before the insert.
    if (number && String(number).trim() !== '') {
      const dup = db.prepare('SELECT id FROM quotes WHERE number = ? AND id != 0 LIMIT 1').get(String(number).trim());
      if (dup) {
        return { success: false, error: `Quote number "${number}" already exists (quote #${dup.id}). Quote numbers must be unique.` };
      }
    }
    const stmt = db.prepare('INSERT INTO quotes (status,customer,customer_email, islater, billing_address,start_date,last_date,message,statement_message,number,entered_by,vat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = stmt.run(
      QUOTE_STATUS.PENDING,
      Number(customer) || 0,
      String(customer_email || ''),
      islater ? 1 : 0,
      String(billing_address || ''),
      String(start_date || ''),
      String(last_date || ''),
      String(message || ''),
      String(statement_message || ''),
      String(number || ''),
      entered_by != null ? String(entered_by) : null,
      Number(vat) || 0
    );

    if (result.changes > 0) {
      const quoteId = result.lastInsertRowid;
      // Never persist the empty convenience row (or a legacy blank row).
      const linesArr = filterDocumentLines(quoteLines);
      if (linesArr.length > 0) {
        const quoteLineStmt = db.prepare('INSERT INTO quote_lines (quote_id, product, description,quantity,rate, amount, item_type, tax_rate_id, tax_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (const line of linesArr) {
          const snap = Quotes.productSnapshot(line.product_id || line.product);
          quoteLineStmt.run(
            quoteId,
            line.product_id || line.product || null,
            String(line.description || ''),
            Number(line.quantity) || 1,
            Number(line.rate) || 0,
            Number(line.amount) || 0,
            snap.item_type,
            line.taxRateId != null ? Number(line.taxRateId) : snap.tax_rate_id,
            Number.isFinite(Number(line.taxRate)) && Number(line.taxRate) !== 0 ? Number(line.taxRate) : snap.tax_rate
          );
        }
      }
      // Auto-generate quote number if not provided
      if (!number || number === '') {
        const formattedNumber = `QUO-${String(Number(quoteId)).padStart(5, '0')}`;
        db.prepare('UPDATE quotes SET number = ? WHERE id = ?').run(formattedNumber, quoteId);
      }
      return { success: true, quoteId: Number(quoteId), status: QUOTE_STATUS.PENDING }; 
    } 
      else {
        return { success: false };
      }
    } catch (error) {
      console.error("Error inserting Quote:", error);
      return { success: false, error: error.message || String(error) };
    }
  },

  // Retrieve all Quotes
  getAllQuotes: () => {
    const stmt = db.prepare(`
      SELECT 
          quotes.id, 
          quotes.number,
          quotes.customer, 
          ${customerNameSql('customers')} AS customer_name, 
          customers.first_name, customers.last_name, customers.company_name, customers.display_name,
          quotes.status, 
          quotes.start_date, 
          quotes.last_date, 
          COALESCE(SUM(quote_lines.amount), 0) AS amount, 
          quotes.vat,
          quotes.customer_email, 
          quotes.message, 
          quotes.statement_message, 
          quotes.billing_address,
          quotes.linked_invoice,
          (SELECT number FROM invoices WHERE invoices.id = quotes.linked_invoice) AS linked_invoice_number
      FROM 
          quotes 
      LEFT JOIN 
          quote_lines 
      ON 
          quote_lines.quote_id = quotes.id 
      LEFT JOIN 
          customers 
      ON 
          quotes.customer = customers.id 
      GROUP BY 
          quotes.id
      ORDER BY 
          quotes.id DESC
  `);
  
    return stmt.all();
  },

  getPaginated: (page = 1, pageSize = 25, search = '', status = '', dateFrom = '', dateTo = '', expFrom = '', expTo = '') => {
    const offset = (Math.max(1, page) - 1) * Math.max(1, pageSize);
    const limit = Math.max(1, Math.min(500, pageSize));
    const baseSql = `SELECT quotes.id, quotes.number, quotes.customer, ${customerNameSql('customers')} AS customer_name, customers.first_name, customers.last_name, customers.company_name, customers.display_name, quotes.status, quotes.start_date, quotes.last_date, COALESCE(SUM(quote_lines.amount), 0) AS amount, quotes.vat, quotes.customer_email, quotes.message, quotes.statement_message, quotes.billing_address, quotes.linked_invoice, (SELECT number FROM invoices WHERE invoices.id = quotes.linked_invoice) AS linked_invoice_number FROM quotes LEFT JOIN quote_lines ON quote_lines.quote_id = quotes.id LEFT JOIN customers ON quotes.customer = customers.id`;
    const searchParam = search && search.trim() ? `%${search.trim()}%` : null;
    const whereParts = [];
    const params = [];
    if (searchParam) {
      whereParts.push(`(${customerNameSql('customers')} LIKE ? OR quotes.number LIKE ? OR quotes.billing_address LIKE ?)`);
      params.push(searchParam, searchParam, searchParam);
    }
    // Status filter: normalise legacy labels so "Open" still finds Pending quotes.
    if (status && String(status).trim()) {
      const requested = String(status).split(',').map(s => s.trim()).filter(Boolean);
      const wanted = Array.from(new Set(requested.map(normalizeQuoteStatus)));
      if (wanted.length) {
        whereParts.push(`quotes.status COLLATE NOCASE IN (${wanted.map(() => '?').join(',')})`);
        params.push(...wanted);
      }
    }
    if (dateFrom) {
      whereParts.push(`quotes.start_date >= ?`);
      params.push(dateFrom);
    }
    if (dateTo) {
      whereParts.push(`quotes.start_date <= ?`);
      params.push(dateTo);
    }
    if (expFrom) {
      whereParts.push(`quotes.last_date >= ?`);
      params.push(expFrom);
    }
    if (expTo) {
      whereParts.push(`quotes.last_date <= ?`);
      params.push(expTo);
    }
    const whereClause = whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : '';
    const groupOrder = ` GROUP BY quotes.id ORDER BY quotes.id DESC`;
    const total = params.length
      ? db.prepare(`SELECT COUNT(*) AS total FROM (${baseSql}${whereClause}${groupOrder})`).get(...params).total
      : db.prepare('SELECT COUNT(*) AS total FROM quotes').get().total;
    const dataSql = `${baseSql}${whereClause}${groupOrder} LIMIT ? OFFSET ?`;
    const data = params.length
      ? db.prepare(dataSql).all(...params, limit, offset)
      : db.prepare(baseSql + groupOrder + ' LIMIT ? OFFSET ?').all(limit, offset);
    return { data, total };
  },

  getSingleQuote: (quote_id) => {
    const stmt = db.prepare(`SELECT quotes.id as quote_id, quotes.customer as customer_id,
        customers.first_name, customers.last_name, customers.company_name, customers.display_name,
        ${customerNameSql('customers')} AS customer_name,
        customers.phone_number, customers.mobile_number,
        quotes.status, quotes.customer_email, quotes.islater, quotes.billing_address,
        quotes.start_date, quotes.last_date, quotes.message, quotes.statement_message,
        quotes.number, quotes.vat, quotes.entered_by, quotes.date_entered,
        quotes.linked_invoice,
        (SELECT number FROM invoices WHERE invoices.id = quotes.linked_invoice) AS linked_invoice_number,
        quotes.accepted_at, quotes.declined_at, quotes.converted_at,
        quote_lines.id AS line_id, quote_lines.amount, quote_lines.description,
        quote_lines.product, quote_lines.quantity, quote_lines.rate
      FROM quotes
      LEFT JOIN quote_lines ON quote_lines.quote_id = quotes.id
      LEFT JOIN customers ON quotes.customer = customers.id
      WHERE quotes.id = ?`);
  
    const rows = stmt.all(quote_id);
    if (!rows || rows.length === 0) return null;
  
    const first = rows[0];
    const linkedInvoiceId = first.linked_invoice != null && first.linked_invoice !== '' ? Number(first.linked_invoice) : null;
    // Canonical lifecycle status (legacy labels normalised, e.g. Invoiced → Converted).
    let status = normalizeQuoteStatus(first.status);
    if (linkedInvoiceId) status = QUOTE_STATUS.CONVERTED;
    const result = {
      quote_id: first.quote_id,
      customer_id: first.customer_id,
      customer: first.customer_id,
      customer_name: first.customer_name || '',
      company_name: first.company_name,
      display_name: first.display_name,
      first_name: first.first_name,
      last_name: first.last_name,
      phone_number: first.phone_number,
      mobile_number: first.mobile_number,
      status,
      statusStored: first.status,
      vat: first.vat,
      customer_email: first.customer_email,
      islater: first.islater,
      billing_address: first.billing_address,
      start_date: first.start_date,
      last_date: first.last_date,
      message: first.message,
      statement_message: first.statement_message,
      number: first.number,
      entered_by: first.entered_by,
      date_entered: first.date_entered,
      linkedInvoiceId,
      convertedInvoiceId: linkedInvoiceId,
      linkedInvoiceNumber: first.linked_invoice_number || null,
      acceptedAt: first.accepted_at || null,
      declinedAt: first.declined_at || null,
      convertedAt: first.converted_at || null,
      lines: [],
    };
    for (const row of rows) {
      if (row.line_id) {
        result.lines.push({ id: row.line_id, amount: row.amount, description: row.description, quantity: row.quantity, product_id: row.product, rate: row.rate });
      }
    }
    return result;
  },

  // Update a quote's editable content.
  //
  // The status is intentionally NOT written: quote status changes only through
  // the explicit lifecycle operations below. Any status in `quoteData` is
  // discarded, and the stored lifecycle value is preserved untouched.
  updateQuote : async (quoteData) => {
    const { id, lines, quoteLines, ...quoteDetails } = quoteData;
    // Drop empty convenience rows before they are re-inserted.
    const lineItems = filterDocumentLines(lines || quoteLines || []);

    try {
      db.prepare(
        `UPDATE quotes
         SET customer = ?, customer_email = ?, islater = ?, billing_address = ?, 
             start_date = ?, last_date = ?, number = ?, vat = ?, 
             message = ?, statement_message = ?
         WHERE id = ?`).run(
          Number(quoteDetails.customer) || 0,
          String(quoteDetails.customer_email || ''),
          quoteDetails.islater ? 1 : 0,
          String(quoteDetails.billing_address || ''),
          String(quoteDetails.start_date || ''),
          String(quoteDetails.last_date || ''),
          String(quoteDetails.number || ''),
          Number(quoteDetails.vat) || 0,
          String(quoteDetails.message || ''),
          String(quoteDetails.statement_message || ''),
          Number(id)
      );
  
      // Delete existing lines for the quote
      db.prepare(`DELETE FROM quote_lines WHERE quote_id = ?`).run(Number(id));
  
      // Insert updated lines
      const insertLine = db.prepare(
        `INSERT INTO quote_lines (quote_id, product, description, quantity, rate, amount, item_type, tax_rate_id, tax_rate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const line of lineItems) {
        const snap = Quotes.productSnapshot(line.product_id || line.product);
        insertLine.run(
          Number(id),
          line.product_id || line.product || null,
          String(line.description || ''),
          Number(line.quantity) || 1,
          Number(line.rate) || 0,
          Number(line.amount) || 0,
          snap.item_type,
          line.taxRateId != null ? Number(line.taxRateId) : snap.tax_rate_id,
          Number.isFinite(Number(line.taxRate)) && Number(line.taxRate) !== 0 ? Number(line.taxRate) : snap.tax_rate
        );
      }
  
      const stored = db.prepare('SELECT status FROM quotes WHERE id = ?').get(Number(id));
      return { success: true, message: 'Quote updated successfully.', status: normalizeQuoteStatus(stored?.status) };
    } catch (error) {
      console.error('Error updating quote:', error);
      throw error;
    }
  },

  deleteQuote: async (id) => {
    try {
      const transaction = db.transaction((quoteId) => {
        db.prepare(`DELETE FROM quote_lines WHERE quote_id = ?`).run(quoteId);
        const res = db.prepare(`DELETE FROM quotes WHERE id = ?`).run(quoteId);
        return res.changes;
      });
      const changes = transaction(id);
      return { success: changes > 0 };
    } catch (error) {
      console.error('Error deleting quote:', error);
      return { success: false, error: error.message };
    }
  },

  // ── Lifecycle: Accept ────────────────────────────────────────────────────
  // Valid from: Pending. Already-Accepted is idempotent. Declined/Converted are
  // rejected so a stale client cannot force an inconsistent state.
  acceptQuote: (quote_id) => {
    const id = Number(quote_id);
    try {
      const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
      if (!quote) return { success: false, error: `Quote #${quote_id} not found.` };

      const current = quote.linked_invoice ? QUOTE_STATUS.CONVERTED : normalizeQuoteStatus(quote.status);
      if (current === QUOTE_STATUS.ACCEPTED) {
        return { success: true, alreadyAccepted: true, status: QUOTE_STATUS.ACCEPTED, quoteNumber: quote.number, previousStatus: current };
      }
      if (current === QUOTE_STATUS.CONVERTED) {
        return { success: false, invalidTransition: true, currentStatus: current, error: `Quote ${quote.number || id} has already been converted to an invoice and can no longer be accepted.` };
      }
      if (current === QUOTE_STATUS.DECLINED) {
        return { success: false, invalidTransition: true, currentStatus: current, error: `Quote ${quote.number || id} was declined and cannot be accepted.` };
      }

      const tx = db.transaction(() => {
        // Re-read inside the transaction: reject a transition based on stale state.
        const fresh = db.prepare('SELECT status, linked_invoice FROM quotes WHERE id = ?').get(id);
        const s = fresh && fresh.linked_invoice ? QUOTE_STATUS.CONVERTED : normalizeQuoteStatus(fresh?.status);
        if (s !== QUOTE_STATUS.PENDING) throw Object.assign(new Error('INVALID_TRANSITION'), { code: 'INVALID_TRANSITION', currentStatus: s });
        db.prepare("UPDATE quotes SET status = ?, accepted_at = datetime('now') WHERE id = ?").run(QUOTE_STATUS.ACCEPTED, id);
      });
      tx();

      return { success: true, status: QUOTE_STATUS.ACCEPTED, quoteNumber: quote.number, previousStatus: current };
    } catch (error) {
      if (error?.code === 'INVALID_TRANSITION') {
        return { success: false, invalidTransition: true, currentStatus: error.currentStatus, error: `This quote is now ${error.currentStatus} and can no longer be accepted. Please reload the quote.` };
      }
      console.error('Error accepting quote:', error);
      return { success: false, error: error.message };
    }
  },

  // ── Lifecycle: Decline ───────────────────────────────────────────────────
  declineQuote: (quote_id) => {
    const id = Number(quote_id);
    try {
      const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
      if (!quote) return { success: false, error: `Quote #${quote_id} not found.` };

      const current = quote.linked_invoice ? QUOTE_STATUS.CONVERTED : normalizeQuoteStatus(quote.status);
      if (current === QUOTE_STATUS.DECLINED) {
        return { success: true, alreadyDeclined: true, status: QUOTE_STATUS.DECLINED, quoteNumber: quote.number, previousStatus: current };
      }
      if (current === QUOTE_STATUS.CONVERTED) {
        return { success: false, invalidTransition: true, currentStatus: current, error: `Quote ${quote.number || id} has already been converted to an invoice and cannot be declined.` };
      }
      if (current === QUOTE_STATUS.ACCEPTED) {
        return { success: false, invalidTransition: true, currentStatus: current, error: `Quote ${quote.number || id} is already accepted and cannot be declined.` };
      }

      const tx = db.transaction(() => {
        const fresh = db.prepare('SELECT status, linked_invoice FROM quotes WHERE id = ?').get(id);
        const s = fresh && fresh.linked_invoice ? QUOTE_STATUS.CONVERTED : normalizeQuoteStatus(fresh?.status);
        if (s !== QUOTE_STATUS.PENDING) throw Object.assign(new Error('INVALID_TRANSITION'), { code: 'INVALID_TRANSITION', currentStatus: s });
        db.prepare("UPDATE quotes SET status = ?, declined_at = datetime('now') WHERE id = ?").run(QUOTE_STATUS.DECLINED, id);
      });
      tx();

      return { success: true, status: QUOTE_STATUS.DECLINED, quoteNumber: quote.number, previousStatus: current };
    } catch (error) {
      if (error?.code === 'INVALID_TRANSITION') {
        return { success: false, invalidTransition: true, currentStatus: error.currentStatus, error: `This quote is now ${error.currentStatus} and can no longer be declined. Please reload the quote.` };
      }
      console.error('Error declining quote:', error);
      return { success: false, error: error.message };
    }
  },

  // ── Lifecycle: Convert to Invoice ────────────────────────────────────────
  // Valid from: Pending (direct conversion is supported) or Accepted.
  // Declined and already-Converted quotes are rejected, and the whole thing runs
  // in a transaction that re-checks the quote so a double-click / stale client
  // can never create a duplicate invoice.
  //
  // The new invoice is NOT given a client-supplied status: it runs through the
  // normal invoice financial calculation, which yields Open for a positive
  // outstanding balance.
  convertQuoteToInvoice: (quote_id) => {
    const id = Number(quote_id);
    let quoteNumber = String(quote_id);
    try {
      const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
      if (!quote) return { success: false, error: `Quote #${quote_id} not found.` };
      quoteNumber = quote.number || String(id);

      const current = quote.linked_invoice ? QUOTE_STATUS.CONVERTED : normalizeQuoteStatus(quote.status);
      if (current === QUOTE_STATUS.CONVERTED || quote.linked_invoice) {
        return {
          success: false, alreadyConverted: true, currentStatus: QUOTE_STATUS.CONVERTED,
          invoiceId: quote.linked_invoice ? Number(quote.linked_invoice) : null,
          error: `Quote ${quoteNumber} has already been converted to an invoice.`,
        };
      }
      if (current === QUOTE_STATUS.DECLINED) {
        return { success: false, invalidTransition: true, currentStatus: current, error: `Quote ${quoteNumber} was declined and cannot be converted.` };
      }

      const quote_lines = db.prepare('SELECT * FROM quote_lines WHERE quote_id = ?').all(id);

      const tx = db.transaction(() => {
        // Concurrency guard: re-read and re-validate inside the transaction.
        const fresh = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
        if (!fresh) throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' });
        const s = fresh.linked_invoice ? QUOTE_STATUS.CONVERTED : normalizeQuoteStatus(fresh.status);
        if (s === QUOTE_STATUS.CONVERTED || fresh.linked_invoice) throw Object.assign(new Error('ALREADY_CONVERTED'), { code: 'ALREADY_CONVERTED', invoiceId: fresh.linked_invoice || null });
        if (s === QUOTE_STATUS.DECLINED) throw Object.assign(new Error('DECLINED'), { code: 'DECLINED' });

        // Reuse the CENTRAL invoice engine — NOT a raw INSERT. A raw insert
        // bypassed the line accounting snapshots, the stock reconciliation and
        // the GL posting, so a converted quote produced an invoice that never
        // reduced inventory. insertInvoice() now owns all of that atomically,
        // so a quote → invoice behaves exactly like a hand-entered invoice.
        const Invoices = require('./invoices');
        const invoiceLines = quote_lines.map((l) => ({
          product_id: l.product, product: l.product,
          description: l.description, quantity: l.quantity, rate: l.rate, amount: l.amount,
        }));
        const invRes = Invoices.insertInvoice(
          Number(fresh.customer) || 0,
          String(fresh.customer_email || ''),
          fresh.islater ? 1 : 0,
          String(fresh.billing_address || ''),
          String(fresh.terms || ''),
          new Date().toISOString().split('T')[0],
          String(fresh.last_date || ''),
          String(fresh.message || ''),
          String(fresh.statement_message || ''),
          '',
          fresh.entered_by != null ? String(fresh.entered_by) : null,
          Number(fresh.vat) || 0,
          undefined, // financial status is derived by the engine
          invoiceLines
        );
        if (!invRes || invRes.success === false || !(invRes.invoiceId || invRes.id)) {
          throw new Error((invRes && invRes.error) || 'Invoice creation failed');
        }
        const invoice_id = Number(invRes.invoiceId || invRes.id);
        const formatted_invoice_number = `INV-${String(invoice_id).padStart(5, '0')}`;
        db.prepare('UPDATE invoices SET linked_quote = ? WHERE id = ?').run(Number(fresh.id), invoice_id);

        const financials = recalcInvoiceFinancials(invoice_id);

        db.prepare(`UPDATE quotes SET linked_invoice = ?, status = ?, converted_at = datetime('now') WHERE id = ?`)
          .run(invoice_id, QUOTE_STATUS.CONVERTED, Number(fresh.id));

        return { invoice_id, formatted_invoice_number, financials };
      });

      const out = tx();

      console.log(`Quote ${id} successfully converted to Invoice ${out.formatted_invoice_number}.`);
      return {
        success: true,
        message: 'Quote converted to invoice.',
        invoiceId: out.invoice_id,
        invoiceNumber: out.formatted_invoice_number,
        invoiceStatus: out.financials ? out.financials.status : INVOICE_STATUS.OPEN,
        quoteStatus: QUOTE_STATUS.CONVERTED,
        quoteNumber,
      };
    } catch (error) {
      if (error?.code === 'ALREADY_CONVERTED') {
        return { success: false, alreadyConverted: true, currentStatus: QUOTE_STATUS.CONVERTED, invoiceId: error.invoiceId || null, error: `Quote ${quoteNumber} has already been converted to an invoice.` };
      }
      if (error?.code === 'DECLINED') {
        return { success: false, invalidTransition: true, currentStatus: QUOTE_STATUS.DECLINED, error: `Quote ${quoteNumber} was declined and cannot be converted.` };
      }
      console.error('Error converting quote to invoice:', error);
      return { success: false, error: error.message };
    }
  },

  // Backwards-compatible alias for the original model API / IPC channel.
  convertToInvoice: (quote_id) => Quotes.convertQuoteToInvoice(quote_id),

  markQuoteSent: (id, method, status) => {
    const date = new Date().toISOString().slice(0, 19).replace('T', ' ');
    return db.prepare('UPDATE quotes SET sent_date=?, sent_method=?, sent_status=? WHERE id=?').run(date, method, status, id);
  },
};

// Ensure the Quotes table is created
Quotes.createTable();
Quotes.createQuoteItem();

module.exports = Quotes;
