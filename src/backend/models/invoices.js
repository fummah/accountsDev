// src/backend/models/Invoices.js
const db = require('./dbmgr.js');
const { getInvoiceFinancials, recalcInvoiceFinancials } = require('../services/invoiceFinancials');
const { filterDocumentLines } = require('../services/documentLines');
const { INVOICE_STATUS, isInvoiceDocumentState, isFinanciallyEffective } = require('../services/documentStatus');
const { getExpectedNormalBalance, normalizeNormalBalance } = require('../services/normalBalance');

/**
 * The inventory lines of an invoice, in the shape
 * services/documentInventory.js expects.
 *
 * Read back from the DATABASE rather than from the caller's array, so the stock
 * reconciliation always sees exactly what was persisted — which matters most on
 * an edit, where the lines have just been deleted and re-inserted.
 *
 * Two deliberate differences from the bill equivalent:
 *
 *  • The filter is the CLASSIFICATION of the product, not a `line_type` column.
 *    `invoice_lines` has no line-type column, and an invoice line for a Service
 *    product must never move stock — so the rule is `tracksInventory(type)`,
 *    the same one the renderer uses. This also fails safe: an unknown product
 *    type is NOT inventory, so a mystery row cannot silently empty a shelf.
 *
 *  • `unitCost` is deliberately NULL. On a bill the line rate is a purchase
 *    cost; here it is a SELLING price, and recording it as a cost would quietly
 *    invent a margin. Decision D1 defers valuation anyway — the GL uses the line
 *    amount, and the movement records no cost for an issue.
 *
 * The warehouse is left unset: `invoice_lines` has no warehouse column, so the
 * reconciler places every line in the default warehouse.
 */
const readInvoiceItemLines = (invoiceId) => {
  let rows = [];
  try {
    rows = db.prepare(
      `SELECT id, product, description, quantity, rate, amount
         FROM invoice_lines WHERE invoice_id = ? ORDER BY id`
    ).all(Number(invoiceId));
  } catch { return []; }

  const Classification = require('../services/productClassification');
  const lines = [];
  for (const r of rows) {
    const prod = db.prepare('SELECT id, type FROM products WHERE id = ?').get(Number(r.product));
    if (!prod || !Classification.tracksInventory(prod.type)) continue;
    lines.push({
      lineId: r.id,
      productId: r.product,
      quantity: r.quantity,
      warehouseId: null, // invoice_lines has no warehouse — use the default
      unitCost: null,    // a selling price is not a cost (D1)
    });
  }
  return lines;
};

/**
 * The accounting snapshot written onto an invoice line when it is created:
 * the item's type and its COGS / Inventory Asset accounts AT THAT MOMENT.
 * Posting reads these back, never today's Item Master (Phase 12).
 */
const productSnapshot = (productId) => {
  const empty = { item_type: null, cogs_account_id: null, inventory_asset_account_id: null, tax_rate_id: null, tax_rate: 0 };
  const pid = Number(productId);
  if (!pid) return empty;
  try {
    const p = db.prepare(`
      SELECT p.type, p.cogs_account_id, p.inventory_asset_account_id,
             p.sales_tax_rate_id, v.vat_percentage
      FROM products p LEFT JOIN vat v ON v.id = p.sales_tax_rate_id
      WHERE p.id = ?`).get(pid);
    if (!p) return empty;
    return {
      item_type: p.type || null,
      cogs_account_id: p.cogs_account_id != null ? Number(p.cogs_account_id) : null,
      inventory_asset_account_id: p.inventory_asset_account_id != null ? Number(p.inventory_asset_account_id) : null,
      tax_rate_id: p.sales_tax_rate_id != null ? Number(p.sales_tax_rate_id) : null,
      tax_rate: Number(p.vat_percentage) || 0,
    };
  } catch { return empty; }
};

const Invoices = {
  // Create the Invoices table if it doesn't exist
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS invoices (
    id	INTEGER,
	customer	INTEGER NOT NULL,
    customer_email	TEXT,
	islater	TEXT,
    billing_address	TEXT,
    terms	TEXT,
    start_date	TEXT,
    last_date TEXT,
    message TEXT,
    statement_message TEXT,
    status TEXT DEFAULT 'Pending',
    number TEXT,
    vat REAL NOT NULL DEFAULT 0,
    balance REAL DEFAULT 0,
    linked_invoice TEXT,
	entered_by	TEXT,
	date_entered DATETIME DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(id AUTOINCREMENT),
  FOREIGN KEY (customer) REFERENCES customers(id)
      )
    `;
    db.prepare(stmt).run();
    // Best-effort DB-level uniqueness on invoice numbers. Silently skipped if
    // legacy data already contains duplicates (model-level guards still apply).
    try {
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_number_unique ON invoices(number) WHERE number IS NOT NULL AND number != \'\'').run();
    } catch (e) { /* leave enforcement to the model guards */ }
    // Migration: ensure additional columns exist on older DBs
    try {
      const colInfo = db.prepare("PRAGMA table_info(invoices)").all();
      const colNames = colInfo.map(c => c.name);
      if (!colNames.includes('sent_date'))   db.prepare("ALTER TABLE invoices ADD COLUMN sent_date TEXT").run();
      if (!colNames.includes('sent_method')) db.prepare("ALTER TABLE invoices ADD COLUMN sent_method TEXT DEFAULT 'Not Sent'").run();
      if (!colNames.includes('sent_status')) db.prepare("ALTER TABLE invoices ADD COLUMN sent_status TEXT DEFAULT 'Not Sent'").run();
      const hasBalance = colInfo.some(c => c.name === 'balance');
      const hasCurrency = colInfo.some(c => c.name === 'currency');
      const hasFx = colInfo.some(c => c.name === 'fxRate');
      if (!hasBalance) {
        console.log('[invoices] Adding missing column `balance` to invoices table');
        db.prepare('ALTER TABLE invoices ADD COLUMN balance REAL DEFAULT 0').run();

        // Populate balance from invoice_lines - payments if possible
        try {
          const invoicesRows = db.prepare('SELECT id FROM invoices').all();
          for (const row of invoicesRows) {
            const sumLines = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM invoice_lines WHERE invoice_id = ?').get(row.id).total;
            const sumPayments = db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE invoiceId = ?').get(row.id).total;
            const bal = (sumLines || 0) - (sumPayments || 0);
            db.prepare('UPDATE invoices SET balance = ? WHERE id = ?').run(bal, row.id);
          }
        } catch (err) {
          console.error('[invoices] Error populating balance values:', err);
        }
      }
      if (!hasCurrency) {
        db.prepare('ALTER TABLE invoices ADD COLUMN currency TEXT').run();
      }
      if (!hasFx) {
        db.prepare('ALTER TABLE invoices ADD COLUMN fxRate REAL DEFAULT 1.0').run();
      }
      const hasLinkedQuote = colInfo.some(c => c.name === 'linked_quote');
      if (!hasLinkedQuote) {
        console.log('[invoices] Adding missing column `linked_quote` to invoices table');
        db.prepare('ALTER TABLE invoices ADD COLUMN linked_quote INTEGER').run();
      }
    } catch (err) {
      console.error('[invoices] Migration check failed:', err);
    }
  }, 
  createInvoiceItem: () => {
    const stmt = `
     CREATE TABLE IF NOT EXISTS invoice_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER,
    product Integer NOT NULL,
    description TEXT,
    quantity INTEGER,
    rate TEXT,    
    amount REAL NOT NULL,
    date_entered DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id)
  )`;
    db.prepare(stmt).run();
    // ── Accounting snapshot columns (migration) ──────────────────────────────
    // The Item Master supplies DEFAULTS; each line stores the configuration that
    // applied WHEN IT WAS CREATED, so editing an old invoice never silently
    // moves historical revenue/COGS to a newly-configured account.
    try {
      const cols = new Set(db.prepare("PRAGMA table_info('invoice_lines')").all().map(r => r.name));
      const add = (c, ddl) => { if (!cols.has(c)) db.prepare(`ALTER TABLE invoice_lines ADD COLUMN ${c} ${ddl}`).run(); };
      add('item_type', 'TEXT');
      add('cogs_account_id', 'INTEGER');
      add('inventory_asset_account_id', 'INTEGER');
      add('unit_cost', 'REAL');
      // Line-level sales-tax snapshot (defaults from the Item's Sales Tax Code).
      add('tax_rate_id', 'INTEGER');
      add('tax_rate', 'REAL DEFAULT 0');
      add('tax_amount', 'REAL DEFAULT 0');
    } catch (e) { console.error('[invoices] invoice_lines snapshot migration failed:', e); }
  }, 
  
  // Insert a new Invoices
  //
  // `status` is accepted for backward compatibility but is NOT authoritative:
  // the only values honoured are document lifecycle states (Draft / Void /
  // Cancelled) chosen through explicit actions. Any financial status supplied by
  // a caller (Paid / Open / Pending …) is ignored — the stored status is derived
  // from the invoice total and the (empty) payment history right after insert.
  insertInvoice: (customer,customer_email,islater, billing_address, terms,start_date,last_date,message,statement_message,number,entered_by,vat,status,invoiceLines) => {
    try {
    // Invoice numbers must be unique; reject duplicates before the insert.
    if (number && String(number).trim() !== '') {
      const dup = db.prepare('SELECT id FROM invoices WHERE number = ? AND id != 0 LIMIT 1').get(String(number).trim());
      if (dup) {
        return { success: false, error: `Invoice number "${number}" already exists (invoice #${dup.id}). Invoice numbers must be unique.` };
      }
    }
    const requestedStatus = String(status || '').trim();
    const initialStatus = isInvoiceDocumentState(requestedStatus) ? requestedStatus : INVOICE_STATUS.OPEN;

    // ── ONE transaction around header + lines + number + financials + STOCK ──
    //
    // Two reasons this lives here rather than in the IPC handler:
    //
    //  • The insert was not atomic at all before. It was a bare sequence of
    //    .run() calls inside a try/catch, so a failure part-way through the
    //    line loop left an invoice holding half of its lines.
    //
    //  • FIVE callers create invoices — the `insert-invoice` handler, a
    //    recurring run (`recurring-run-now`), the scheduler, project timesheets
    //    and the bulk importer. With the reconcile in the handler, the other
    //    four silently never moved stock: the Part 1 bug again, on paths the
    //    handler-driven suite could not reach. Keeping it in the model means
    //    there is exactly one place an invoice becomes real.
    //
    // Everything inside MUST be synchronous. `db.transaction()` commits when
    // the callback RETURNS, so an `await` here would end the transaction early
    // and silently destroy the atomicity this exists to provide.
    const tx = db.transaction(() => {
      const stmt = db.prepare('INSERT INTO invoices (customer,customer_email,islater, billing_address, terms,start_date,last_date,message,statement_message,number,entered_by, vat, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const result = stmt.run(
        Number(customer) || 0,
        String(customer_email || ''),
        islater ? 1 : 0,
        String(billing_address || ''),
        String(terms || ''),
        String(start_date || ''),
        String(last_date || ''),
        String(message || ''),
        String(statement_message || ''),
        String(number || ''),
        entered_by != null ? String(entered_by) : null,
        Number(vat) || 0,
        initialStatus
      );

      if (!(result.changes > 0)) return { success: false };

      const invoiceId = result.lastInsertRowid;
      // Never persist the empty convenience row (or a legacy blank row).
      const linesArr = filterDocumentLines(invoiceLines);
      if (linesArr.length > 0) {
        const invoiceLineStmt = db.prepare('INSERT INTO invoice_lines (invoice_id, product, description,quantity,rate, amount, item_type, cogs_account_id, inventory_asset_account_id, tax_rate_id, tax_rate, tax_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (const line of linesArr) {
          const snap = productSnapshot(line.product_id || line.product);
          invoiceLineStmt.run(
            invoiceId,
            line.product_id || line.product || null,
            String(line.description || ''),
            Number(line.quantity) || 1,
            Number(line.rate) || 0,
            Number(line.amount) || 0,
            snap.item_type,
            snap.cogs_account_id,
            snap.inventory_asset_account_id,
            line.taxRateId != null ? Number(line.taxRateId) : snap.tax_rate_id,
            Number.isFinite(Number(line.taxRate)) && Number(line.taxRate) !== 0 ? Number(line.taxRate) : snap.tax_rate,
            Number(line.taxAmount) || 0
          );
        }
      }
      // Auto-generate invoice number if not provided
      if (!number || number === '') {
        const formattedNumber = `INV-${String(Number(invoiceId)).padStart(5, '0')}`;
        db.prepare('UPDATE invoices SET number = ? WHERE id = ?').run(formattedNumber, invoiceId);
      }
      // Authoritative financial state: derive balance + status from the persisted
      // lines and payment history (there is none yet on a brand-new invoice, so a
      // normal invoice with an outstanding balance lands on "Open").
      const financials = recalcInvoiceFinancials(Number(invoiceId));

      // ── Issue the stock, behind the SAME predicate the GL posting uses ────
      // A Draft / Void / Cancelled invoice is a non-financial lifecycle state and
      // moves nothing — the same rule the bill path applies.
      //
      // An unresolvable line THROWS, so the whole invoice rolls back. That is
      // deliberate and matches the bill: an invoice that claims to have shipped
      // goods but moved no stock is precisely the silent inconsistency this
      // integration exists to prevent. It cannot fire on a low stock count —
      // Inventory.issueStock deliberately allows a negative balance (the count
      // may simply be wrong) and reports it as `negative` for the UI to surface.
      //
      // The failure modes are otherwise unreachable: readInvoiceItemLines only
      // returns lines whose product EXISTS and tracks inventory, and
      // resolveInventoryItem cannot return null for such a product.
      const effectiveStatus = (financials && financials.status) || initialStatus;
      if (isFinanciallyEffective(effectiveStatus)) {
        const DocumentInventory = require('../services/documentInventory');
        const stock = DocumentInventory.reconcileInvoiceStock(
          Number(invoiceId), readInvoiceItemLines(Number(invoiceId))
        );
        if (stock && stock.errors && stock.errors.length) {
          throw new Error(`Invoice stock could not be issued — ${stock.errors.join('; ')}`);
        }

        // ── Post the GL in the SAME transaction: an ATOMIC sale + stock + GL ──
        // The handler used to post this AFTER the insert returned, so a GL
        // failure left the invoice and its stock movement committed with no
        // journal entry — a half-posted sale. Posting here means the header,
        // its lines, the stock issue and the journal entry commit or roll back
        // together. The handler's later postInvoice() is now a no-op
        // (hasPosting guards it), so there is still exactly one posting.
        const JournalEntries = require('./journalEntries');
        const posted = db.prepare('SELECT number FROM invoices WHERE id = ?').get(Number(invoiceId));
        const cust = db.prepare(
          "SELECT COALESCE(NULLIF(display_name,''), NULLIF(company_name,''), NULLIF(TRIM(COALESCE(first_name,'')||' '||COALESCE(last_name,'')),''),'') AS name FROM customers WHERE id = ?"
        ).get(Number(customer) || 0);
        const post = JournalEntries.postInvoice({
          id: Number(invoiceId),
          date: String(start_date || new Date().toISOString().slice(0, 10)),
          number: (posted && posted.number) || String(invoiceId),
          total: (financials && financials.invoiceTotal) || 0,
          customerName: cust ? cust.name : '',
        });
        if (post && post.error) {
          throw new Error(`Invoice journal posting failed — ${post.error}`);
        }
      }

      return { success: true, invoiceId: Number(invoiceId), id: Number(invoiceId), invoice_id: Number(invoiceId), financials };
    });

    return tx();
    } catch (error) {
      console.error("Error inserting Invoice:", error);
      return { success: false, error: error.message || String(error) };
    }
  },

  // Retrieve all Invoices
  getAllInvoices: function () {
    const stmt = db.prepare("SELECT invoices.id, invoices.number, invoices.customer, COALESCE(NULLIF(customers.display_name, ''), NULLIF(customers.company_name, ''), NULLIF(TRIM(customers.first_name || ' ' || customers.last_name), ''), '') AS customer_name, invoices.customer_email, invoices.status, invoices.start_date, invoices.last_date, COALESCE(SUM(invoice_lines.amount), 0) AS subtotal, ROUND(COALESCE(SUM(invoice_lines.amount), 0) * (1 + COALESCE(invoices.vat, 0) / 100.0), 2) AS amount, COALESCE(pt.totalPaid, 0) AS totalPaid, ROUND(COALESCE(SUM(invoice_lines.amount), 0) * (1 + COALESCE(invoices.vat, 0) / 100.0) - COALESCE(pt.totalPaid, 0), 2) AS balance, invoices.vat, invoices.terms, invoices.message, invoices.statement_message, invoices.billing_address FROM invoices LEFT JOIN invoice_lines ON invoice_lines.invoice_id = invoices.id LEFT JOIN customers ON invoices.customer = customers.id LEFT JOIN (SELECT i.id AS invoiceId, COALESCE((SELECT SUM(a.amount) FROM payment_allocations a WHERE a.invoiceId = i.id), 0) + COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoiceId = i.id AND NOT EXISTS (SELECT 1 FROM payment_allocations x WHERE x.paymentId = p.id)), 0) AS totalPaid FROM invoices i) pt ON pt.invoiceId = invoices.id GROUP BY invoices.id ORDER BY invoices.id DESC");
    const report = this.getInvoiceReport();
    return {all:stmt.all(), report:report};
  },

  getPaginated: function (page = 1, pageSize = 25, search = '', status = '', dueFrom = '', dueTo = '', startFrom = '', startTo = '', customerId = '', onlyOutstanding = false) {
    const offset = (Math.max(1, page) - 1) * Math.max(1, pageSize);
    const limit = Math.max(1, Math.min(500, pageSize));
    const baseSql = `SELECT invoices.id, invoices.number, invoices.customer, COALESCE(NULLIF(customers.display_name, ''), NULLIF(customers.company_name, ''), NULLIF(TRIM(customers.first_name || ' ' || customers.last_name), ''), '') AS customer_name, invoices.customer_email, invoices.status, invoices.start_date, invoices.last_date, COALESCE(SUM(invoice_lines.amount), 0) AS subtotal, ROUND(COALESCE(SUM(invoice_lines.amount), 0) * (1 + COALESCE(invoices.vat, 0) / 100.0), 2) AS amount, COALESCE(pt.totalPaid, 0) AS totalPaid, ROUND(COALESCE(SUM(invoice_lines.amount), 0) * (1 + COALESCE(invoices.vat, 0) / 100.0) - COALESCE(pt.totalPaid, 0), 2) AS balance, invoices.vat, invoices.terms, invoices.message, invoices.statement_message, invoices.billing_address, invoices.sent_date, invoices.sent_method, invoices.sent_status FROM invoices LEFT JOIN invoice_lines ON invoice_lines.invoice_id = invoices.id LEFT JOIN customers ON invoices.customer = customers.id LEFT JOIN (SELECT i.id AS invoiceId, COALESCE((SELECT SUM(a.amount) FROM payment_allocations a WHERE a.invoiceId = i.id), 0) + COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoiceId = i.id AND NOT EXISTS (SELECT 1 FROM payment_allocations x WHERE x.paymentId = p.id)), 0) AS totalPaid FROM invoices i) pt ON pt.invoiceId = invoices.id`;
    const searchParam = search && search.trim() ? `%${search.trim()}%` : null;
    const statusParam = status && status.trim() ? status.trim() : null;
    const whereParts = [];
    const params = [];
    if (searchParam) {
      whereParts.push(`(customers.first_name || ' ' || customers.last_name LIKE ? OR invoices.number LIKE ?)`);
      params.push(searchParam, searchParam);
    }
    if (statusParam) {
      if (statusParam.startsWith('!')) {
        const excluded = statusParam.slice(1).split(',').map(s => s.trim()).filter(Boolean);
        if (excluded.length) {
          whereParts.push(`invoices.status COLLATE NOCASE NOT IN (${excluded.map(() => '?').join(',')})`);
          params.push(...excluded);
        }
      } else {
        const included = statusParam.split(',').map(s => s.trim()).filter(Boolean);
        whereParts.push(`invoices.status COLLATE NOCASE IN (${included.map(() => '?').join(',')})`);
        params.push(...included);
      }
    }
    if (dueFrom) {
      whereParts.push(`invoices.last_date >= ?`);
      params.push(dueFrom);
    }
    if (dueTo) {
      whereParts.push(`invoices.last_date <= ?`);
      params.push(dueTo);
    }
    if (startFrom) {
      whereParts.push(`invoices.start_date >= ?`);
      params.push(startFrom);
    }
    if (startTo) {
      whereParts.push(`invoices.start_date <= ?`);
      params.push(startTo);
    }
    if (customerId) {
      whereParts.push(`invoices.customer = ?`);
      params.push(Number(customerId));
    }
    const whereClause = whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : '';
    // When onlyOutstanding is requested, keep only invoices that still have a
    // real outstanding balance (> 0 after rounding to cents). This is the
    // authoritative balance (line totals + VAT minus paid amount) — the same
    // expression the SELECT exposes as the `balance` alias — so it stays in
    // sync with the displayed column and is immune to floating-point residue.
    const balanceHaving = onlyOutstanding
      ? ` HAVING ROUND(COALESCE(SUM(invoice_lines.amount), 0) * (1 + COALESCE(invoices.vat, 0) / 100.0) - COALESCE(pt.totalPaid, 0), 2) > 0`
      : '';
    const groupOrder = ` GROUP BY invoices.id, customers.first_name, customers.last_name, invoices.status, invoices.start_date, invoices.last_date, pt.totalPaid${balanceHaving} ORDER BY invoices.id DESC`;
    let total;
    if (params.length || onlyOutstanding) {
      const innerSql = `${baseSql}${whereClause}${groupOrder}`;
      total = db.prepare(`SELECT COUNT(*) AS total FROM (${innerSql})`).get(...params).total;
    } else {
      total = db.prepare('SELECT COUNT(*) AS total FROM invoices').get().total;
    }
    const dataSql = `${baseSql}${whereClause}${groupOrder} LIMIT ? OFFSET ?`;
    const data = params.length
      ? db.prepare(dataSql).all(...params, limit, offset)
      : db.prepare(baseSql + groupOrder + ' LIMIT ? OFFSET ?').all(limit, offset);
    return { data, total };
  },
  getInvoiceSummary: () => {
    const stmt_open = db.prepare("SELECT COUNT(DISTINCT i.id) AS open_invoice,SUM(l.amount + (l.amount*i.vat/100)) AS open_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status IN ('Open','Partially Paid') ");
    const stmt_due = db.prepare("SELECT COUNT(DISTINCT i.id) AS due_invoice,SUM(l.amount + (l.amount*i.vat/100)) AS due_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status IN ('Open','Partially Paid') AND i.last_date < ?");
    const stmt_open_expense = db.prepare("SELECT COUNT(DISTINCT e.id) AS open_expense,SUM(l.amount) AS open_total_amount_expense FROM expense_lines AS l INNER JOIN expenses AS e ON l.expense_id = e.id WHERE e.approval_status = 'Pending' ");
    const stmt_due_expense = db.prepare("SELECT COUNT(DISTINCT e.id) AS due_expense,SUM(l.amount) AS due_total_amount_expense FROM expense_lines AS l INNER JOIN expenses AS e ON l.expense_id = e.id WHERE e.approval_status = 'Pending' AND e.payment_date < ?");
 
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const due_date = `${year}-${month}-${day}`;
  const open_invoice = stmt_open.all();
  const due_invoice = stmt_due.all(due_date);
  const open_expense = stmt_open_expense.all();
  const due_expense = stmt_due_expense.all(due_date);
  return {open_invoice,due_invoice,open_expense,due_expense};
  },
  getInvoiceReport: function (){
    const stmt_open = db.prepare("SELECT COUNT(DISTINCT i.id) AS open_invoice,SUM(l.amount + (l.amount*i.vat/100)) AS open_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status IN ('Open','Partially Paid') ");
    const stmt_due = db.prepare("SELECT COUNT(DISTINCT i.id) AS due_invoice,SUM(l.amount + (l.amount*i.vat/100)) AS due_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status IN ('Open','Partially Paid') AND i.last_date < ?");
    const stmt_paid = db.prepare("SELECT COUNT(DISTINCT i.id) AS paid_invoice,SUM(l.amount + (l.amount*i.vat/100)) AS paid_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status = 'Paid' ");

    // Recently paid invoices (last 30 days) — based on payment date
    const stmt_recently_paid = db.prepare(`
      SELECT COUNT(DISTINCT i.id) AS recently_paid_count,
             COALESCE(SUM(l.amount + (l.amount*i.vat/100)), 0) AS recently_paid_amount
      FROM invoice_lines AS l
      INNER JOIN invoices AS i ON l.invoice_id = i.id
      WHERE i.status = 'Paid' AND i.start_date >= date('now', '-30 days')
    `);

    // Deposited: payments that have been deposited (status = 'Deposited')
    let deposited = [{ deposited_amount: 0 }];
    try {
      deposited = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS deposited_amount FROM payments WHERE status = 'Deposited'`).all();
    } catch (_) {}

    // Credit notes summary (Draft + Issued = available credits)
    let credit_notes = [{ credit_count: 0, credit_total: 0 }];
    try {
      credit_notes = db.prepare("SELECT COUNT(*) AS credit_count, COALESCE(SUM(total),0) AS credit_total FROM credit_notes WHERE status IN ('Draft','Issued')").all();
    } catch (_) {}

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const due_date = `${year}-${month}-${day}`;
    const open_invoice = stmt_open.all();
    const paid_invoice = stmt_paid.all();
    const due_invoice = stmt_due.all(due_date);
    const recently_paid = stmt_recently_paid.all();

    // Deposited amount = total payments with deposited status
    const deposited_amount = Number(deposited?.[0]?.deposited_amount) || 0;
    // Pending deposit amount = payments awaiting deposit
    let pendingDeposit = [{ pending_deposit_amount: 0 }];
    try {
      pendingDeposit = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS pending_deposit_amount FROM payments WHERE status = 'Pending Deposit' OR status IS NULL`).all();
    } catch (_) {}
    const pending_deposit_amount = Number(pendingDeposit?.[0]?.pending_deposit_amount) || 0;
    // Paid total from invoices
    const paid_total = Number(paid_invoice?.[0]?.paid_total_amount) || 0;
    // Not deposited = paid invoice total minus actual deposited payments
    const not_deposited_amount = Math.max(0, paid_total - deposited_amount);

    return {
      open_invoice, due_invoice, paid_invoice, credit_notes,
      recently_paid,
      deposited: [{ deposited_amount }],
      not_deposited: [{ not_deposited_amount }],
    };
  },
  getDashboardSummary: function () {
    // Not due invoices (pending but not overdue)
    const stmt_not_due = db.prepare(`
      SELECT COUNT(DISTINCT i.id) AS due_invoice,
             SUM(l.amount * (1 + i.vat/100)) AS not_due_total_amount 
      FROM invoice_lines AS l 
      INNER JOIN invoices AS i ON l.invoice_id = i.id 
      WHERE i.status IN ('Open','Partially Paid') AND i.last_date > ?`);

    // Open expenses (unpaid bills, approved expenses, pending approval)
    const stmt_open_expense = db.prepare(`
      SELECT COUNT(DISTINCT e.id) AS open_expense,
             SUM(l.amount) AS open_total_amount_expense 
      FROM expense_lines AS l 
      INNER JOIN expenses AS e ON l.expense_id = e.id 
      WHERE e.approval_status IN ('Unpaid','Partially Paid','Approved','Pending')`);

    // Due expenses (overdue bills and expenses)
    const stmt_due_expense = db.prepare(`
      SELECT COUNT(DISTINCT e.id) AS due_expense,
             SUM(l.amount) AS due_total_amount_expense 
      FROM expense_lines AS l 
      INNER JOIN expenses AS e ON l.expense_id = e.id 
      WHERE e.approval_status IN ('Unpaid','Partially Paid','Approved','Pending') AND e.payment_date < ?`);

    // Due quotes
    const stmt_quote = db.prepare(`
      SELECT COUNT(DISTINCT i.id) AS due_quote,
             SUM(l.amount * (1 + i.vat/100)) AS due_total_amount 
      FROM quote_lines AS l 
      INNER JOIN quotes AS i ON l.quote_id = i.id 
      WHERE i.status = 'Pending' AND i.last_date < ?`);

    // 12-month windowed open/due/paid figures so health ratios align with the
    // 12-month revenue/expense windows. All-time open amounts (used elsewhere)
    // skew DSO / runway / collection metrics on the dashboard.
    const stmt_open_invoice_12m = db.prepare(`
      SELECT COUNT(DISTINCT i.id) AS open_invoice,
             SUM(l.amount + (l.amount*i.vat/100)) AS open_total_amount 
      FROM invoice_lines AS l 
      INNER JOIN invoices AS i ON l.invoice_id = i.id 
      WHERE i.status IN ('Open','Partially Paid')
        AND i.start_date >= date('now', '-12 months')`);

    const stmt_due_invoice_12m = db.prepare(`
      SELECT COUNT(DISTINCT i.id) AS due_invoice,
             SUM(l.amount + (l.amount*i.vat/100)) AS due_total_amount 
      FROM invoice_lines AS l 
      INNER JOIN invoices AS i ON l.invoice_id = i.id 
      WHERE i.status IN ('Open','Partially Paid')
        AND i.start_date >= date('now', '-12 months') AND i.last_date < ?`);

    const stmt_paid_invoice_12m = db.prepare(`
      SELECT COUNT(DISTINCT i.id) AS paid_invoice,
             SUM(l.amount + (l.amount*i.vat/100)) AS paid_total_amount 
      FROM invoice_lines AS l 
      INNER JOIN invoices AS i ON l.invoice_id = i.id 
      WHERE i.status = 'Paid' AND i.start_date >= date('now', '-12 months')`);

    const stmt_open_expense_12m = db.prepare(`
      SELECT COUNT(DISTINCT e.id) AS open_expense,
             SUM(l.amount) AS open_total_amount_expense 
      FROM expense_lines AS l 
      INNER JOIN expenses AS e ON l.expense_id = e.id 
      WHERE e.approval_status IN ('Unpaid','Partially Paid','Approved','Pending')
        AND e.payment_date >= date('now', '-12 months')`);

    const stmt_due_expense_12m = db.prepare(`
      SELECT COUNT(DISTINCT e.id) AS due_expense,
             SUM(l.amount) AS due_total_amount_expense 
      FROM expense_lines AS l 
      INNER JOIN expenses AS e ON l.expense_id = e.id 
      WHERE e.approval_status IN ('Unpaid','Partially Paid','Approved','Pending')
        AND e.payment_date >= date('now', '-12 months') AND e.payment_date < ?`);
    
    // Invoice trends with comprehensive metrics
    const stmt_invoicetrend = db.prepare(`
      SELECT 
        strftime('%Y-%m', i.start_date) AS name,
        COUNT(DISTINCT i.id) AS number,
        SUM(l.amount * (1 + i.vat/100)) as revenue_total_amount,
        SUM(CASE WHEN i.status = 'Paid' THEN l.amount * (1 + i.vat/100) ELSE 0 END) as paid_amount,
        SUM(CASE WHEN i.status IN ('Open','Partially Paid') THEN l.amount * (1 + i.vat/100) ELSE 0 END) as pending_amount,
        COUNT(DISTINCT CASE WHEN i.status = 'Paid' THEN i.id END) as paid_count,
        COUNT(DISTINCT CASE WHEN i.status IN ('Open','Partially Paid') THEN i.id END) as pending_count,
        AVG(l.amount * (1 + i.vat/100)) as avg_invoice_value
      FROM invoices i
      INNER JOIN invoice_lines l ON l.invoice_id = i.id
      WHERE i.start_date >= date('now', '-12 months') 
      GROUP BY strftime('%Y-%m', i.start_date) 
      ORDER BY name ASC`);
      
    // Monthly performance metrics
    const stmt_monthly_performance = db.prepare(`
      WITH monthly_stats AS (
        SELECT 
          strftime('%Y-%m', i.start_date) as month,
          SUM(l.amount * (1 + i.vat/100)) as revenue,
          COUNT(DISTINCT i.id) as invoice_count,
          COUNT(DISTINCT i.customer) as unique_customers
        FROM invoices i
        INNER JOIN invoice_lines l ON l.invoice_id = i.id
        WHERE i.start_date >= date('now', '-12 months')
        GROUP BY strftime('%Y-%m', i.start_date)
      )
      SELECT 
        month,
        revenue,
        invoice_count,
        unique_customers,
        revenue / invoice_count as avg_invoice_value,
        LAG(revenue) OVER (ORDER BY month) as prev_month_revenue,
        LAG(invoice_count) OVER (ORDER BY month) as prev_month_count
      FROM monthly_stats
      ORDER BY month DESC
      LIMIT 12
    `);
      
    // Customer metrics
    const stmt_customer_metrics = db.prepare(`
      SELECT 
        COUNT(DISTINCT customer) as total_customers,
        SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) as paying_customers,
        ROUND(AVG(CASE 
          WHEN status = 'Paid' 
          THEN (SELECT SUM(amount * (1 + vat/100)) 
                FROM invoice_lines 
                WHERE invoice_id = invoices.id)
        END), 2) as avg_customer_value
      FROM invoices
      WHERE start_date >= date('now', '-12 months')`);

    // Customer growth trend
    const stmt_customertrend = db.prepare(`
      SELECT strftime('%Y-%m', date_entered) AS name, 
             COUNT(*) AS number 
      FROM customers 
      WHERE date_entered >= date('now', '-5 months') 
      GROUP BY strftime('%Y-%m', date_entered) 
      ORDER BY name`);

    // Supplier growth trend
    const stmt_suppliertrend = db.prepare(`
      SELECT strftime('%Y-%m', date_entered) AS name, 
             COUNT(*) AS number 
      FROM suppliers 
      WHERE date_entered >= date('now', '-5 months') 
      GROUP BY strftime('%Y-%m', date_entered) 
      ORDER BY name`);

    // Detailed expense analysis
    const stmt_expenselist = db.prepare(`
      WITH monthly_expenses AS (
        SELECT 
          el.category as name,
          COUNT(*) as count,
          SUM(el.amount) as value,
          strftime('%Y-%m', e.payment_date) as month,
          AVG(el.amount) as avg_expense,
          MAX(el.amount) as max_expense,
          MIN(el.amount) as min_expense
        FROM expense_lines el
        INNER JOIN expenses e ON e.id = el.expense_id
        WHERE e.payment_date >= date('now', '-12 months')
        GROUP BY el.category, strftime('%Y-%m', e.payment_date)
      )
      SELECT 
        name,
        SUM(count) as count,
        SUM(value) as value,
        ROUND(AVG(value), 2) as monthly_average,
        MAX(value) as highest_month,
        MIN(value) as lowest_month,
        ROUND(AVG(avg_expense), 2) as typical_expense,
        MAX(max_expense) as largest_expense
      FROM monthly_expenses
      GROUP BY name
      ORDER BY value DESC`);

    // Monthly expense totals (for dashboard P&L / expense widgets)
    const stmt_monthly_expenses = db.prepare(`
      SELECT strftime('%Y-%m', e.payment_date) AS month,
             SUM(l.amount) AS total
      FROM expense_lines l
      INNER JOIN expenses e ON e.id = l.expense_id
      WHERE e.payment_date >= date('now', '-12 months')
      GROUP BY strftime('%Y-%m', e.payment_date)
      ORDER BY month ASC`);

    // Monthly expense breakdown by category (for dashboard pie chart)
    const stmt_monthly_expense_categories = db.prepare(`
      SELECT el.category AS name,
             SUM(el.amount) AS value,
             strftime('%Y-%m', e.payment_date) AS month
      FROM expense_lines el
      INNER JOIN expenses e ON e.id = el.expense_id
      WHERE e.payment_date >= date('now', '-12 months')
      GROUP BY el.category, strftime('%Y-%m', e.payment_date)`);

    // Daily revenue (for dashboard Today/Yesterday/Custom Range selectors)
    const stmt_daily_revenue = db.prepare(`
      SELECT strftime('%Y-%m-%d', i.start_date) AS day,
             SUM(l.amount * (1 + i.vat/100)) AS revenue
      FROM invoices i
      INNER JOIN invoice_lines l ON l.invoice_id = i.id
      WHERE i.start_date >= date('now', '-36 months')
      GROUP BY strftime('%Y-%m-%d', i.start_date)
      ORDER BY day ASC`);

    // Daily expense totals (for dashboard Today/Yesterday/Custom Range selectors)
    const stmt_daily_expenses = db.prepare(`
      SELECT strftime('%Y-%m-%d', e.payment_date) AS day,
             SUM(l.amount) AS total
      FROM expense_lines l
      INNER JOIN expenses e ON e.id = l.expense_id
      WHERE e.payment_date >= date('now', '-36 months')
      GROUP BY strftime('%Y-%m-%d', e.payment_date)
      ORDER BY day ASC`);

    // Daily expense breakdown by category (for dashboard pie chart)
    const stmt_daily_expense_categories = db.prepare(`
      SELECT el.category AS name,
             SUM(el.amount) AS value,
             strftime('%Y-%m-%d', e.payment_date) AS day
      FROM expense_lines el
      INNER JOIN expenses e ON e.id = el.expense_id
      WHERE e.payment_date >= date('now', '-36 months')
      GROUP BY el.category, strftime('%Y-%m-%d', e.payment_date)`);

    // Get current date for due date calculations
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const due_date = `${year}-${month}-${day}`;

    // Get invoice report for open/paid/due amounts
    const report = this.getInvoiceReport();
    const open_invoice = report.open_invoice;
    const paid_invoice = report.paid_invoice;
    const due_invoice = report.due_invoice;

    // Execute all queries
    const due_not_invoice = stmt_not_due.all(due_date);
    const open_expense = stmt_open_expense.all();
    const due_expense = stmt_due_expense.all(due_date);
    const due_quote = stmt_quote.all(due_date);
    const open_invoice_12m = stmt_open_invoice_12m.all();
    const due_invoice_12m = stmt_due_invoice_12m.all(due_date);
    const paid_invoice_12m = stmt_paid_invoice_12m.all();
    const open_expense_12m = stmt_open_expense_12m.all();
    const due_expense_12m = stmt_due_expense_12m.all(due_date);
    const invoicetrend = stmt_invoicetrend.all();
    const customertrend = stmt_customertrend.all();
    const suppliertrend = stmt_suppliertrend.all();
    const expenselist = stmt_expenselist.all();
    const monthlyExpenses = stmt_monthly_expenses.all();
    const monthlyExpenseCategories = stmt_monthly_expense_categories.all();
    const dailyRev = stmt_daily_revenue.all();
    const dailyExp = stmt_daily_expenses.all();
    const dailyExpCat = stmt_daily_expense_categories.all();

    // Calculate some derived values
    const currentMonthInvoices = invoicetrend.length > 0 ? invoicetrend[invoicetrend.length - 1] : { number: 0, revenue_total_amount: 0 };
    const currentMonthExpenses = expenselist.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    
    // Get new metrics data
    const monthly_performance = stmt_monthly_performance.all();
    const customer_metrics = stmt_customer_metrics.get();
    
    // Calculate month-over-month changes
    const currentMonth = monthly_performance[0] || {};
    const prevMonth = monthly_performance[1] || {};
    
    const revenueChange = currentMonth.revenue && prevMonth.revenue
      ? ((currentMonth.revenue - prevMonth.revenue) / prevMonth.revenue * 100).toFixed(1)
      : 0;
    
    const customerChange = currentMonth.unique_customers && prevMonth.unique_customers
      ? ((currentMonth.unique_customers - prevMonth.unique_customers) / prevMonth.unique_customers * 100).toFixed(1)
      : 0;

    // Enhanced expense metrics
    const enhancedExpenseList = expenselist.map(item => ({
      ...item,
      value: Number(item.value) || 0,
      count: Number(item.count) || 0,
      monthlyAverage: Number(item.monthly_average) || 0,
      highestMonth: Number(item.highest_month) || 0,
      lowestMonth: Number(item.lowest_month) || 0,
      typicalExpense: Number(item.typical_expense) || 0,
      largestExpense: Number(item.largest_expense) || 0
    }));

    // Calculate totals
    const totalExpenses = enhancedExpenseList.reduce((sum, item) => sum + item.value, 0);
    const totalRevenue = monthly_performance.reduce((sum, month) => sum + (Number(month.revenue) || 0), 0);

    // Per-month maps for dashboard P&L / expenses widgets
    const monthlyExpensesMap = {};
    monthlyExpenses.forEach(r => { monthlyExpensesMap[r.month] = Number(r.total) || 0; });
    const monthlyExpenseCategoriesMap = {};
    monthlyExpenseCategories.forEach(r => {
      if (!monthlyExpenseCategoriesMap[r.month]) monthlyExpenseCategoriesMap[r.month] = [];
      monthlyExpenseCategoriesMap[r.month].push({ name: r.name, value: Number(r.value) || 0 });
    });
    
    return {
      // Original metrics
      open_invoice,
      due_invoice,
      open_expense,
      due_expense,
      due_quote,
      // 12-month windowed metrics (aligned with revenue/expense windows)
      openInvoice12m: open_invoice_12m,
      dueInvoice12m: due_invoice_12m,
      paidInvoice12m: paid_invoice_12m,
      openExpense12m: open_expense_12m,
      dueExpense12m: due_expense_12m,
      invoicetrend,
      customertrend,
      suppliertrend,
      due_not_invoice,
      paid_invoice,
      report,

      // Enhanced metrics
      expenseAnalysis: enhancedExpenseList,
      monthlyExpensesMap,
      monthlyExpenseCategoriesMap,
      dailyRevenue: dailyRev.map(r => ({ day: r.day, revenue: Number(r.revenue) || 0 })),
      dailyExpenses: dailyExp.map(r => ({ day: r.day, total: Number(r.total) || 0 })),
      dailyExpenseCategories: dailyExpCat.map(r => ({ day: r.day, name: r.name, value: Number(r.value) || 0 })),
      monthlyPerformance: monthly_performance.map(month => ({
        ...month,
        revenue: Number(month.revenue) || 0,
        invoice_count: Number(month.invoice_count) || 0,
        unique_customers: Number(month.unique_customers) || 0,
        avg_invoice_value: Number(month.avg_invoice_value) || 0,
        prev_month_revenue: Number(month.prev_month_revenue) || 0,
        prev_month_count: Number(month.prev_month_count) || 0
      })),
      
      customerMetrics: {
        totalCustomers: Number(customer_metrics.total_customers) || 0,
        payingCustomers: Number(customer_metrics.paying_customers) || 0,
        avgCustomerValue: Number(customer_metrics.avg_customer_value) || 0,
        customerRetentionRate: customer_metrics.total_customers > 0 
          ? (customer_metrics.paying_customers / customer_metrics.total_customers * 100).toFixed(1) 
          : 0
      },

      performance: {
        currentMonth: {
          revenue: Number(currentMonth.revenue) || 0,
          invoiceCount: Number(currentMonth.invoice_count) || 0,
          uniqueCustomers: Number(currentMonth.unique_customers) || 0,
          avgInvoiceValue: Number(currentMonth.avg_invoice_value) || 0,
          expenses: totalExpenses,
          profit: (Number(currentMonth.revenue) || 0) - totalExpenses
        },
        trends: {
          revenueGrowth: `${revenueChange}%`,
          customerGrowth: `${customerChange}%`,
          profitMargin: totalRevenue > 0 
            ? ((totalRevenue - totalExpenses) / totalRevenue * 100).toFixed(1) 
            : '0',
          averageInvoiceValue: currentMonth.avg_invoice_value || 0
        }
      }
    };
  },
  getSingleInvoice: (invoice_id) => {
    const stmt = db.prepare(`SELECT invoices.id as invoice_id, invoices.customer as customer_id, invoices.terms,
        customers.first_name, customers.last_name, customers.phone_number, customers.mobile_number,
        invoices.status, invoices.customer_email, invoices.islater, invoices.billing_address,
        invoices.start_date, invoices.last_date, invoices.message, invoices.statement_message,
        invoices.number, invoices.vat, invoices.entered_by, invoices.date_entered,
        invoices.sent_date, invoices.sent_method, invoices.sent_status,
        invoice_lines.id AS line_id, invoice_lines.amount, invoice_lines.description,
        invoice_lines.product, invoice_lines.quantity, invoice_lines.rate
      FROM invoices
      LEFT JOIN invoice_lines ON invoice_lines.invoice_id = invoices.id
      LEFT JOIN customers ON invoices.customer = customers.id
      WHERE invoices.id = ?`);
  
    const rows = stmt.all(invoice_id);
    if (!rows || rows.length === 0) return null;

    // Paid to date from payment allocations + direct payments (same source as
    // the list balance) so partially-paid invoices show what's been collected.
    let paidToDate = 0;
    try {
      const pd = db.prepare(`
        SELECT COALESCE(SUM(a.amount), 0) AS paid
        FROM payment_allocations a WHERE a.invoiceId = ?
      `).get(invoice_id);
      const direct = db.prepare(`
        SELECT COALESCE(SUM(p.amount), 0) AS paid
        FROM payments p WHERE p.invoiceId = ? AND p.invoiceId != 0
          AND NOT EXISTS (SELECT 1 FROM payment_allocations x WHERE x.paymentId = p.id)
      `).get(invoice_id);
      paidToDate = (Number(pd?.paid) || 0) + (Number(direct?.paid) || 0);
    } catch (e) {
      console.error('[invoices] paid-to-date compute error:', e.message);
    }
  
    const first = rows[0];
    // Authoritative financial state (read-only): the status returned to callers
    // is derived from total + real payment allocations, so a stale stored value
    // can never be shown. Document lifecycle states are preserved by the service.
    let fin = null;
    try { fin = getInvoiceFinancials(invoice_id); } catch { fin = null; }
    const result = {
      invoice_id: first.invoice_id,
      customer_id: first.customer_id,
      customer: first.customer_id,
      terms: first.terms,
      first_name: first.first_name,
      last_name: first.last_name,
      phone_number: first.phone_number,
      mobile_number: first.mobile_number,
      status: fin ? fin.status : first.status,
      statusStored: first.status,
      vat: first.vat,
      customer_email: first.customer_email,
      islater: first.islater,
      billing_address: first.billing_address,
      sent_date: first.sent_date,
      sent_method: first.sent_method,
      sent_status: first.sent_status,
      start_date: first.start_date,
      last_date: first.last_date,
      message: first.message,
      statement_message: first.statement_message,
      number: first.number,
      entered_by: first.entered_by,
      date_entered: first.date_entered,
      totalPaid: paidToDate,
      balance: fin
        ? fin.balance
        : Math.max(0, Number(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)) * (1 + (Number(first.vat) || 0) / 100) - paidToDate),
      overpayment: fin ? fin.overpayment : 0,
      lines: [],
    };
    // Actual date the invoice became fully paid (from payment history), used by
    // the PAID stamp. Null while an outstanding balance remains.
    result.paidDate = fin ? fin.paidDate : null;
    for (const row of rows) {
      if (row.line_id) {
        result.lines.push({ id: row.line_id, amount: row.amount, description: row.description, quantity: row.quantity, product_id: row.product, rate: row.rate });
      }
    }
    return result;
  },
  markInvoiceSent: (id, method, status) => {
    const date = new Date().toISOString().slice(0, 19).replace('T', ' ');
    return db.prepare('UPDATE invoices SET sent_date=?, sent_method=?, sent_status=? WHERE id=?').run(date, method, status, id);
  },

  getInitialInvoice: (invoice_id, type) => {
    type = type.toLowerCase();
    const stmt_customer = db.prepare(`SELECT id, first_name || ' ' || middle_name || ' ' || last_name AS name FROM customers ORDER BY id DESC`);
    const stmt_vat = db.prepare(`SELECT * FROM vat`); 
    const stmt_product = db.prepare(`SELECT * FROM products`);   
  
    const rows_customer = stmt_customer.all();    
    const rows_vat = stmt_vat.all();
    const rows_product = stmt_product.all();
    const loadvalues = {customers:rows_customer,vat:rows_vat,number:"",lines:[], products:rows_product};
    if(type === "expense")
    {
      const stmt_supplier = db.prepare(`SELECT id, first_name || ' ' || middle_name || ' ' || last_name AS name FROM suppliers ORDER BY id DESC`);
      const stmt_employee = db.prepare(`SELECT id, first_name || ' ' || last_name AS name FROM employees ORDER BY id DESC`);
      const rows_supplier = stmt_supplier.all();  
      const rows_employee = stmt_employee.all(); 
      loadvalues.suppliers = rows_supplier;
      loadvalues.employees = rows_employee;
    }
    if(invoice_id>0)
    {
      let stmt_lines;
      if(type === "expense")
      {       
        stmt_lines = db.prepare(`SELECT id as key, category, description, amount FROM ${type}_lines WHERE ${type}_id = ?`);
         }
      else{
        stmt_lines = db.prepare(`SELECT l.id as key, l.product, l.description, l.quantity, l.rate, l.amount FROM ${type}_lines as l WHERE ${type}_id = ?`);
         }
         const rows_lines = stmt_lines.all(invoice_id);
      loadvalues.lines = rows_lines;
    }
    else{
      const stmt_new = db.prepare(`SELECT * FROM ${type}s ORDER BY id DESC LIMIT 1`);
      const new_row = stmt_new.get();
      const latestInvoiceId = new_row ? parseInt(new_row.id) : 0;
      const newInvoiceId = latestInvoiceId + 1;
      loadvalues.number = type === "invoice"?`INV-${String(newInvoiceId).padStart(5, '0')}`:`QUO-${String(newInvoiceId).padStart(5, '0')}`;
    }  
    return loadvalues;
  },

  updateInvoice : async (invoiceData) => {
    const { id, lines, invoiceLines, ...invoiceDetails } = invoiceData;
    // Drop empty convenience rows before they are re-inserted.
    const lineItems = filterDocumentLines(lines || invoiceLines || []);

    // Capture the prior financial state so the caller can audit the impact.
    const previous = getInvoiceFinancials(Number(id));

    // ── ONE transaction around header + lines + financials + stock + GL ─────
    // The lines are DELETEd and re-inserted below; without a transaction a
    // failure between those two statements destroys the invoice's original
    // lines and leaves a partial set behind. Everything inside must be
    // SYNCHRONOUS — db.transaction() commits when the callback RETURNS, so an
    // `await` would end the transaction early and silently.
    const tx = db.transaction(() => {
      // ── Status is system controlled ─────────────────────────────────────
      // The ONLY client value honoured here is an explicit document lifecycle
      // state (Draft / Void / Cancelled) requested through an explicit action.
      // Any financial value a client tries to inject (Paid / Open / Pending / …)
      // is ignored outright: the status is recomputed from real money below.
      const storedRow = db.prepare('SELECT status FROM invoices WHERE id = ?').get(Number(id));
      const storedStatus = storedRow ? String(storedRow.status || '') : '';
      const requestedStatus = String(invoiceDetails.status || '').trim();
      const statusToWrite = isInvoiceDocumentState(requestedStatus)
        ? requestedStatus
        : (isInvoiceDocumentState(storedStatus) ? storedStatus : INVOICE_STATUS.OPEN);

      db.prepare(
        `UPDATE invoices
         SET customer = ?, customer_email = ?, islater = ?, billing_address = ?, 
             terms = ?, start_date = ?, last_date = ?, number = ?, vat = ?, 
             message = ?, statement_message = ?, status = ?
         WHERE id = ?`).run(
          Number(invoiceDetails.customer) || 0,
          String(invoiceDetails.customer_email || ''),
          invoiceDetails.islater ? 1 : 0,
          String(invoiceDetails.billing_address || ''),
          String(invoiceDetails.terms || ''),
          String(invoiceDetails.start_date || ''),
          String(invoiceDetails.last_date || ''),
          String(invoiceDetails.number || ''),
          Number(invoiceDetails.vat) || 0,
          String(invoiceDetails.message || ''),
          String(invoiceDetails.statement_message || ''),
          statusToWrite,
          Number(id)
      );
  
      // Delete existing lines for the invoice
      db.prepare(`DELETE FROM invoice_lines WHERE invoice_id = ?`).run(Number(id));
  
      // Insert updated lines
      const insertLine = db.prepare(
        `INSERT INTO invoice_lines (invoice_id, product, description, quantity, rate, amount, item_type, cogs_account_id, inventory_asset_account_id, tax_rate_id, tax_rate, tax_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const line of lineItems) {
        const snap = productSnapshot(line.product_id || line.product);
        insertLine.run(
          Number(id),
          line.product_id || line.product || null,
          String(line.description || ''),
          Number(line.quantity) || 1,
          Number(line.rate) || 0,
          Number(line.amount) || 0,
          snap.item_type,
          snap.cogs_account_id,
          snap.inventory_asset_account_id,
          line.taxRateId != null ? Number(line.taxRateId) : snap.tax_rate_id,
          Number.isFinite(Number(line.taxRate)) && Number(line.taxRate) !== 0 ? Number(line.taxRate) : snap.tax_rate,
          Number(line.taxAmount) || 0
        );
      }
  
      // Authoritative financial state: derive balance + status from the persisted
      // lines and the EXISTING payment history (never from the client payload).
      // Editing an invoice must not rewrite payment history: existing payments
      // keep their original amounts; only the balance/status follow.
      const financials = recalcInvoiceFinancials(Number(id));

      // ── Reconcile the stock to the lines just written ────────────────────
      // Runs for EVERY outcome, including the Draft/Void early return below: a
      // voided invoice must still give its goods back.
      //
      // The test is `isInvoiceDocumentState` (an EXPLICIT Draft/Void/Cancelled)
      // rather than `!isFinanciallyEffective`. A blank or unexpected status
      // means we do not know, and reconciling to the lines is the safe default
      // — silently putting goods back on an unknown state would be the more
      // damaging guess.
      //
      // An unresolvable line THROWS so the whole update rolls back, matching the
      // insert path and the bill. It cannot fire on a low count: issueStock
      // deliberately allows a negative balance and reports `negative` for the UI.
      {
        const DocumentInventory = require('../services/documentInventory');
        const stock = DocumentInventory.reconcileInvoiceStock(
          Number(id),
          isInvoiceDocumentState(String((financials && financials.status) || ''))
            ? []
            : readInvoiceItemLines(Number(id))
        );
        if (stock && stock.errors && stock.errors.length) {
          throw new Error(`Invoice stock could not be reconciled — ${stock.errors.join('; ')}`);
        }
      }

      // Void old journal entries then re-post using per-line income accounts.
      // A voided invoice contributes $0 — void the old postings but do NOT
      // create a fresh full-amount entry (keeps GL/AR consistent with the register).
      // This is INSIDE the transaction and FATAL on failure, so the line rewrite,
      // the stock reconcile and the GL re-post roll back together (atomic edit).
      {
        const JournalEntries = require('./journalEntries');
        const oldEntries = db.prepare("SELECT id FROM journal_entries WHERE source_type = 'invoice' AND source_id = ? AND status = 'Posted'").all(Number(id));
        for (const oe of oldEntries) {
          JournalEntries.voidEntry(oe.id);
        }
        const nextStatus = String((financials && financials.status) || '').toLowerCase();
        if (nextStatus === 'void' || nextStatus === 'voided' || nextStatus === 'cancelled' || nextStatus === 'canceled' || nextStatus === 'draft') {
          return { success: true, message: 'Invoice updated successfully.', financials, previous };
        }
        const post = JournalEntries.postInvoice({
          id: Number(id),
          date: String(invoiceDetails.start_date || new Date().toISOString().slice(0, 10)),
          number: String(invoiceDetails.number || id),
          customerName: invoiceDetails.customerName || '',
        });
        if (post && post.error) {
          throw new Error(`Invoice journal posting failed — ${post.error}`);
        }
      }

      return { success: true, message: 'Invoice updated successfully.', financials, previous };
    });

    try {
      return tx();
    } catch (error) {
      console.error('Error updating invoice:', error);
      throw error;
    }
  },
  deleteInvoice: async (id) => {
    try {
      const transaction = db.transaction((invoiceId) => {
        // Void the journal entries so computedBalance() stops counting them
        // (it excludes non-'Posted' entries). Inside the transaction so the GL
        // void and the stock reversal commit or roll back together.
        const JournalEntries = require('./journalEntries');
        const oldEntries = db.prepare("SELECT id FROM journal_entries WHERE source_type = 'invoice' AND source_id = ? AND status = 'Posted'").all(Number(invoiceId));
        for (const oe of oldEntries) {
          JournalEntries.voidEntry(oe.id);
        }
        // Put back the stock this invoice issued, BEFORE its lines are torn
        // down. Without this a deleted invoice would leave the shelf empty
        // forever — goods gone with no document to explain them.
        // `readInvoiceItemLines` is irrelevant here: reversing passes no lines,
        // so the reconciler gives back exactly what was posted.
        const DocumentInventory = require('../services/documentInventory');
        DocumentInventory.reverseInvoiceStock(invoiceId);
        db.prepare(`DELETE FROM invoice_lines WHERE invoice_id = ?`).run(invoiceId);
        const res = db.prepare(`DELETE FROM invoices WHERE id = ?`).run(invoiceId);
        return res.changes;
      });
      const changes = transaction(id);
      return { success: changes > 0 };
    } catch (error) {
      console.error('Error deleting invoice:', error);
      return { success: false, error: error.message };
    }
  },
  getFinancialReport: function (start_date, last_date, options = {}) {
    try {
      const dateFrom = start_date || '0000-01-01';
      const dateTo = last_date || '9999-12-31';
      const basis = String(options.basis || 'accrual').toLowerCase() === 'cash' ? 'cash' : 'accrual';
      const loc = options.location || null;
      const cls = options.class || null;
      const dept = options.department || null;
      const hasDimensions = !!(loc || cls || dept);

      // ── COA-driven balances from journal_lines ──────────────────────────
      const acctRows = db.prepare(`
        SELECT coa.id, coa.name, coa.type, coa.subType, coa.number, coa.parentId,
               coa.normalBalance, coa.openingBalance,
               COALESCE(SUM(CASE WHEN je.date <= ? AND jl.account_id = coa.id THEN jl.debit ELSE 0 END), 0) AS totalDebit,
               COALESCE(SUM(CASE WHEN je.date <= ? AND jl.account_id = coa.id THEN jl.credit ELSE 0 END), 0) AS totalCredit,
               COALESCE(SUM(CASE WHEN je.date BETWEEN ? AND ? AND jl.account_id = coa.id THEN jl.debit ELSE 0 END), 0) AS periodDebit,
               COALESCE(SUM(CASE WHEN je.date BETWEEN ? AND ? AND jl.account_id = coa.id THEN jl.credit ELSE 0 END), 0) AS periodCredit
        FROM chart_of_accounts coa
        LEFT JOIN journal_lines jl ON jl.account_id = coa.id
        LEFT JOIN journal_entries je ON je.id = jl.journal_id AND je.status = 'Posted'
        WHERE coa.status = 'Active'
        GROUP BY coa.id
        ORDER BY CAST(coa.number AS INTEGER) ASC, coa.name ASC
      `).all(dateTo, dateTo, dateFrom, dateTo, dateFrom, dateTo);

      // ── P&L period detail (accrual = journal date; cash = cash recognition date) ──
      const plDetail = this._getPLAccountRows(dateFrom, dateTo, basis, loc, cls, dept);
      const plById = new Map(plDetail.map((r) => [r.id, r]));

      // Compute balance for each account (period-driven for income/expense, cumulative for BS)
      let totalIncome = 0, totalCOGS = 0, totalExpenses = 0;
      let totalAssets = 0, totalLiabilities = 0, totalEquity = 0;
      const assetAccts = [], liabilityAccts = [], equityAccts = [];
      const incomeAccts = [], cogsAccts = [], expenseAccts = [];

      for (const r of acctRows) {
        // Single source of truth for the normal side (services/normalBalance.js).
        const nb = getExpectedNormalBalance(r.type) || normalizeNormalBalance(r.normalBalance) || 'Debit';
        const openBal = Number(r.openingBalance || 0);
        // Balance sheet: cumulative (to date)
        const bsBalance = nb === 'Debit'
          ? openBal + Number(r.totalDebit) - Number(r.totalCredit)
          : openBal + Number(r.totalCredit) - Number(r.totalDebit);

        const t = (r.type || '').toLowerCase();
        const isPL = t === 'income' || t === 'other income' || t === 'cost of goods sold' || t === 'expense' || t === 'other expense';
        // P&L: period only (income/expense accounts reset each period)
        const plRow = plById.get(r.id);
        const pd = plRow ? plRow.debit : Number(r.periodDebit);
        const pc = plRow ? plRow.credit : Number(r.periodCredit);
        const plBalance = nb === 'Debit' ? pd - pc : pc - pd;

        const plRecord = {
          id: r.id,
          number: r.number || '',
          name: r.name,
          type: r.type,
          subType: r.subType || '',
          parentId: r.parentId || null,
          amount: Number(plBalance.toFixed(2)),
          debit: Number(pd.toFixed(2)),
          credit: Number(pc.toFixed(2)),
          txnCount: plRow ? plRow.txnCount : 0,
          lastDate: plRow ? plRow.lastDate : null,
        };

        if (isPL) {
          if (t === 'income' || t === 'other income') {
            totalIncome += plBalance;
            incomeAccts.push(plRecord);
          } else if (t === 'cost of goods sold') {
            totalCOGS += plBalance;
            cogsAccts.push(plRecord);
          } else {
            totalExpenses += plBalance;
            expenseAccts.push(plRecord);
          }
        } else if (t === 'asset' || t === 'bank' || t === 'cash') {
          totalAssets += bsBalance;
          assetAccts.push({ id: r.id, number: r.number || '', name: r.name, amount: bsBalance, type: r.type, parentId: r.parentId || null });
        } else if (t === 'liability' || t === 'credit card' || t === 'loan') {
          totalLiabilities += bsBalance;
          liabilityAccts.push({ id: r.id, number: r.number || '', name: r.name, amount: bsBalance, type: r.type, parentId: r.parentId || null });
        } else if (t === 'equity') {
          totalEquity += bsBalance;
          equityAccts.push({ id: r.id, number: r.number || '', name: r.name, amount: bsBalance, type: r.type, parentId: r.parentId || null });
        }
      }

      const grossProfit = totalIncome - totalCOGS;
      const netProfit = grossProfit - totalExpenses;

      // ── Fallback: if no journal data found, aggregate from invoices/expenses directly ──
      if (!hasDimensions && basis === 'accrual' && totalIncome === 0 && totalExpenses === 0) {
        try {
          const invIncome = db.prepare(`
            SELECT COALESCE(SUM(il.amount * (1 + COALESCE(i.vat,0)/100)), 0) AS total
            FROM invoice_lines il
            JOIN invoices i ON i.id = il.invoice_id
            WHERE i.status COLLATE NOCASE NOT IN ('draft','cancelled','canceled','void','voided') AND i.start_date BETWEEN ? AND ?
          `).get(dateFrom, dateTo);
          if (invIncome && Number(invIncome.total) > 0) {
            totalIncome = Number(invIncome.total);
            incomeAccts.push({ id: null, number: '', name: 'Invoices Revenue', type: 'income', subType: '', parentId: null, amount: Number(totalIncome.toFixed(2)), debit: 0, credit: 0, txnCount: 0, lastDate: null });
          }

          const expTotal = db.prepare(`
            SELECT COALESCE(SUM(el.amount), 0) AS total
            FROM expense_lines el
            JOIN expenses e ON e.id = el.expense_id
            WHERE e.approval_status IN ('Approved','Unpaid','Paid') AND e.payment_date BETWEEN ? AND ?
          `).get(dateFrom, dateTo);
          if (expTotal && Number(expTotal.total) > 0) {
            totalExpenses = Number(expTotal.total);
            expenseAccts.push({ id: null, number: '', name: 'Expenses Total', type: 'expense', subType: '', parentId: null, amount: Number(totalExpenses.toFixed(2)), debit: 0, credit: 0, txnCount: 0, lastDate: null });
          }

          const cogsTotal = db.prepare(`
            SELECT COALESCE(SUM(el.amount), 0) AS total
            FROM expense_lines el
            JOIN expenses e ON e.id = el.expense_id
            WHERE e.category = 'Cost of Goods Sold' AND e.payment_date BETWEEN ? AND ?
          `).get(dateFrom, dateTo);
          if (cogsTotal) totalCOGS = Number(cogsTotal.total);
        } catch (fbErr) {
          console.error('[getFinancialReport] fallback error:', fbErr);
        }
      }

      // Recompute after fallback
      const grossProfitFinal = totalIncome - totalCOGS;
      const netProfitFinal = grossProfitFinal - totalExpenses;

      // Add net income to equity for BS balancing
      const retainedEarnings = totalEquity;
      const totalEquityFull = retainedEarnings + netProfitFinal;

      // Compute opening/closing cash balances from bank/cash accounts
      let openingCash = 0, closingCash = 0;
      for (const a of assetAccts) {
        const t = (a.type || '').toLowerCase();
        if (t === 'bank' || t === 'cash') {
          openingCash += Number(a.amount || 0) - netProfitFinal;
          closingCash += Number(a.amount || 0);
        }
      }
      if (openingCash < 0 && closingCash > 0) openingCash = closingCash - netProfitFinal;

      // Build period-by-period details from income/expense accounts
      const allAccts = [...incomeAccts, ...expenseAccts];
      const details = allAccts.length ? [{
        period: `${dateFrom} to ${dateTo}`,
        revenue: totalIncome,
        investments: 0,
        otherInflows: 0,
        operatingExpenses: totalExpenses,
        capex: 0,
        otherOutflows: 0,
        netCashFlow: netProfitFinal,
        closingBalance: closingCash || netProfitFinal,
      }] : [];

      // Build trend data for chart
      const trends = [
        { period: dateFrom, value: openingCash || 0, type: 'Opening Balance' },
        { period: dateTo, value: closingCash || netProfitFinal, type: 'Closing Balance' },
        { period: dateTo, value: netProfitFinal, type: 'Net Cash Flow' },
      ];

      return {
        profitLoss: {
          revenue: totalIncome,
          cogs: totalCOGS,
          operatingExpenses: totalExpenses,
          grossProfit: grossProfitFinal,
          netProfit: netProfitFinal,
          incomeAccounts: incomeAccts,
          cogsAccounts: cogsAccts,
          expenseAccounts: expenseAccts,
        },
        balanceSheet: {
          assets: assetAccts,
          liabilities: liabilityAccts,
          equity: equityAccts,
          summary: {
            totalAssets,
            totalLiabilities,
            totalEquity: totalEquityFull,
          },
        },
        cashFlow: {
          summary: {
            operatingCashFlow: netProfitFinal,
            investingCashFlow: 0,
            financingCashFlow: 0,
            netCashFlow: netProfitFinal,
            openingBalance: openingCash || 0,
            closingBalance: closingCash || netProfitFinal,
          },
          details,
          trends,
        },
      };
    } catch (error) {
      console.error('Error fetching report:', error);
      throw error;
    }
  },
  // P&L period detail rows, one per account with activity in the window.
  // Accrual: lines whose journal date falls in [dateFrom, dateTo].
  // Cash: lines recognised on the payment/bill-payment date within the window.
  _getPLAccountRows: function (dateFrom, dateTo, basis, loc, cls, dept) {
    const byId = new Map();
    const add = (account_id, debit, credit, entryDate) => {
      if (!account_id) return;
      const a = byId.get(account_id) || { id: account_id, debit: 0, credit: 0, txnCount: 0, lastDate: null };
      a.debit += Number(debit || 0);
      a.credit += Number(credit || 0);
      a.txnCount += 1;
      if (!a.lastDate || entryDate > a.lastDate) a.lastDate = entryDate;
      byId.set(account_id, a);
    };

    if (basis === 'cash') {
      // Fetch lines up to dateTo, then recognise by cash date in JS
      const lines = db.prepare(`
        SELECT jl.account_id, jl.debit, jl.credit, jl.class AS lclass, jl.location AS lloc, jl.department AS ldept,
               je.id AS entryId, je.date AS entryDate, je.source_type, je.source_id
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.journal_id AND je.status = 'Posted'
        WHERE je.date <= ? AND jl.account_id IS NOT NULL
      `).all(dateTo);

      // Build cash recognition date per entry
      const invIds = [...new Set(lines.filter((l) => l.source_type === 'invoice' && l.source_id).map((l) => Number(l.source_id)))];
      const expIds = [...new Set(lines.filter((l) => l.source_type === 'expense' && l.source_id).map((l) => Number(l.source_id)))];
      const invPayDate = new Map();
      if (invIds.length) {
        const ph = invIds.map(() => '?').join(',');
        for (const row of db.prepare(`SELECT invoiceId, MIN(date) AS d FROM payments WHERE invoiceId IN (${ph}) GROUP BY invoiceId`).all(...invIds)) {
          invPayDate.set(Number(row.invoiceId), row.d);
        }
      }
      const expPayDate = new Map();
      if (expIds.length) {
        const ph = expIds.map(() => '?').join(',');
        for (const row of db.prepare(`SELECT id, payment_date FROM expenses WHERE id IN (${ph})`).all(...expIds)) {
          expPayDate.set(Number(row.id), row.payment_date);
        }
      }
      const cashDate = (l) => {
        if (l.source_type === 'invoice') return invPayDate.get(Number(l.source_id)) || l.entryDate;
        if (l.source_type === 'expense') return expPayDate.get(Number(l.source_id)) || l.entryDate;
        return l.entryDate;
      };

      for (const l of lines) {
        const d = cashDate(l);
        if (!d || d < dateFrom || d > dateTo) continue;
        if (loc && l.lloc !== loc) continue;
        if (cls && l.lclass !== cls) continue;
        if (dept && l.ldept !== dept) continue;
        add(l.account_id, l.debit, l.credit, l.entryDate);
      }
    } else {
      let where = 'je.date BETWEEN ? AND ?';
      const params = [dateFrom, dateTo];
      if (loc) { where += ' AND jl.location = ?'; params.push(loc); }
      if (cls) { where += ' AND jl.class = ?'; params.push(cls); }
      if (dept) { where += ' AND jl.department = ?'; params.push(dept); }
      const lines = db.prepare(`
        SELECT jl.account_id, jl.debit, jl.credit, je.date AS entryDate
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.journal_id AND je.status = 'Posted'
        WHERE ${where} AND jl.account_id IS NOT NULL
      `).all(...params);
      for (const l of lines) add(l.account_id, l.debit, l.credit, l.entryDate);
    }

    return [...byId.values()].map((a) => ({
      id: a.id,
      debit: Number(a.debit.toFixed(2)),
      credit: Number(a.credit.toFixed(2)),
      txnCount: a.txnCount,
      lastDate: a.lastDate || null,
    }));
  },
  getManagementReport: function (start_date, last_date) {
    try {
      const formattedNumber = (number) => {
        const num = new Intl.NumberFormat('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(number);
        return `$${num}`;
      };

    const report = this.getFinancialReport(start_date, last_date);
    const kpiData = {
      totalRevenue: report.profitLoss.revenue,
      totalExpenses: report.profitLoss.operatingExpenses,
      netProfit: report.profitLoss.revenue - report.profitLoss.operatingExpenses,
      customerGrowth: "0%",
    };
    const chartData = [
      { name: "Revenue", value: kpiData.totalRevenue },
      { name: "Expenses", value: kpiData.totalExpenses },
      { name: "Profit", value: kpiData.netProfit },
    ];

    const tableData = [
      { key: "1", metric: "Revenue", value: formattedNumber(kpiData?.totalRevenue || 0)},
      { key: "2", metric: "Expenses", value: formattedNumber(kpiData?.totalExpenses || 0)},
      { key: "3", metric: "Net Profit", value: formattedNumber(kpiData?.netProfit || 0)},
      { key: "4", metric: "Customer Growth", value: "0%" },
    ];
    return { kpiData, chartData, tableData  };
    
  } catch (error) {
    console.error('Error fetching report:', error);
    throw error;
  }

  },

  // Accounts Receivable Aging (optimized with JOINs instead of correlated subqueries)
  getARAging: function(referenceDate) {
    try {
      const today = referenceDate || new Date().toISOString().slice(0,10);

      const rows = db.prepare(`
        SELECT 
          i.id AS invoiceId,
          i.customer AS customerId,
          COALESCE(c.first_name || ' ' || c.last_name, 'Unknown') AS customerName,
          i.last_date AS dueDate,
          COALESCE(lt.totalAmount, 0) AS totalAmount,
          COALESCE(pt.totalPaid, 0) AS totalPaid,
          COALESCE(i.vat, 0) AS vatRate
        FROM invoices i
        LEFT JOIN customers c ON c.id = i.customer
        LEFT JOIN (SELECT invoice_id, SUM(amount) AS totalAmount FROM invoice_lines GROUP BY invoice_id) lt ON lt.invoice_id = i.id
        LEFT JOIN (SELECT i2.id AS invoiceId, COALESCE((SELECT SUM(a.amount) FROM payment_allocations a WHERE a.invoiceId = i2.id), 0) + COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoiceId = i2.id AND NOT EXISTS (SELECT 1 FROM payment_allocations x WHERE x.paymentId = p.id)), 0) AS totalPaid FROM invoices i2) pt ON pt.invoiceId = i.id
        WHERE i.status IS NULL
           OR LOWER(i.status) NOT IN ('paid', 'void', 'voided', 'cancelled', 'canceled', 'draft')
      `).all();

      const enriched = [];
      for (const r of rows) {
        const totalWithVat = Number(r.totalAmount) * (1 + (Number(r.vatRate) || 0)/100);
        const balance = Math.round((totalWithVat - Number(r.totalPaid || 0)) * 100) / 100;
        if (balance <= 0) continue;
        const daysPastDue = r.dueDate ? Math.floor((new Date(today) - new Date(r.dueDate)) / 86400000) : 0;
        const bucket = daysPastDue <= 0 ? 'current'
                    : daysPastDue <= 30 ? '1-30'
                    : daysPastDue <= 60 ? '31-60'
                    : daysPastDue <= 90 ? '61-90'
                    : '90+';
        enriched.push({ invoiceId: r.invoiceId, customerId: r.customerId, customerName: r.customerName, dueDate: r.dueDate, balance, daysPastDue: isNaN(daysPastDue) ? 0 : daysPastDue, bucket });
      }

      const summary = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 };
      const byCustomerMap = new Map();
      for (const row of enriched) {
        summary[row.bucket] += row.balance;
        summary.total += row.balance;
        const key = row.customerId || `unknown:${row.customerName}`;
        if (!byCustomerMap.has(key)) {
          byCustomerMap.set(key, { customerId: row.customerId, customerName: row.customerName, invoices: [], total: 0 });
        }
        const group = byCustomerMap.get(key);
        group.invoices.push(row);
        group.total += row.balance;
      }
      const byCustomer = Array.from(byCustomerMap.values()).sort((a,b) => b.total - a.total);

      return { success: true, today, summary, byCustomer };
    } catch (e) {
      console.error('[invoices] getARAging error:', e);
      return { success: false, error: e.message };
    }
  },

  // ── Sales by Product report ─────────────────────────────────────────────
  getSalesByProduct: function ({ from, to, customerId, status } = {}) {
    try {
      const dateFrom = from || '0000-01-01';
      const dateTo   = to   || '9999-12-31';
      const conditions = ["i.status NOT IN ('Draft','Cancelled','Void')", 'i.start_date BETWEEN ? AND ?'];
      const params = [dateFrom, dateTo];

      if (customerId) { conditions.push('i.customer = ?'); params.push(Number(customerId)); }
      if (status)     { conditions.push('i.status = ?');   params.push(status); }

      const where = conditions.join(' AND ');

      // Aggregate by product (COALESCE(p.id,0) ensures all unmatched lines group as "Unitemized")
      const rows = db.prepare(`
        SELECT
          COALESCE(NULLIF(p.name, ''), 'Unitemized') AS productName,
          p.id AS productId,
          p.sku,
          SUM(il.quantity) AS totalQty,
          SUM(il.amount) AS totalSales,
          COUNT(DISTINCT i.id) AS invoiceCount
        FROM invoice_lines il
        JOIN invoices i ON il.invoice_id = i.id
        LEFT JOIN products p ON il.product = p.id
        WHERE ${where}
        GROUP BY COALESCE(p.id, 0)
        ORDER BY totalSales DESC
      `).all(...params);

      // Drill-down: one row per invoice per product (matches invoiceCount)
      const detail = db.prepare(`
        SELECT
          il.invoice_id,
          i.number AS invoiceNumber,
          i.start_date AS invoiceDate,
          i.status,
          c.first_name || ' ' || c.last_name AS customerName,
          COALESCE(NULLIF(p.name, ''), 'Unitemized') AS productName,
          p.id AS productId,
          SUM(il.quantity) AS quantity,
          SUM(il.amount) AS amount
        FROM invoice_lines il
        JOIN invoices i ON il.invoice_id = i.id
        LEFT JOIN customers c ON i.customer = c.id
        LEFT JOIN products p ON il.product = p.id
        WHERE ${where}
        GROUP BY il.invoice_id, COALESCE(p.id, 0)
        ORDER BY i.start_date DESC
      `).all(...params);

      return { success: true, summary: rows, detail };
    } catch (e) {
      console.error('[invoices] getSalesByProduct error:', e);
      return { success: false, error: e.message };
    }
  },

  // ── Sales Report summary (KPI + byCustomer + byIncomeAccount) ──────────
  getSalesSummary: function ({ from, to, customerId, status } = {}) {
    try {
      const dateFrom = from || '0000-01-01';
      const dateTo   = to   || '9999-12-31';
      const conditions = ["i.status NOT IN ('Draft','Cancelled','Void')", 'i.start_date BETWEEN ? AND ?'];
      const params = [dateFrom, dateTo];

      if (customerId) { conditions.push('i.customer = ?'); params.push(Number(customerId)); }
      if (status)     { conditions.push('i.status = ?');   params.push(status); }

      const where = conditions.join(' AND ');

      const lineSub = `(SELECT invoice_id, SUM(amount) AS subtotal FROM invoice_lines GROUP BY invoice_id)`;

      const kpi = db.prepare(`
        SELECT
          ROUND(SUM(COALESCE(il.subtotal, 0) * (1 + COALESCE(i.vat, 0) / 100.0)), 2) AS totalSales,
          ROUND(SUM(CASE WHEN i.status = 'Paid' THEN COALESCE(il.subtotal, 0) * (1 + COALESCE(i.vat, 0) / 100.0) ELSE 0 END), 2) AS totalPaid,
          ROUND(SUM(CASE WHEN i.status != 'Paid' THEN COALESCE(il.subtotal, 0) * (1 + COALESCE(i.vat, 0) / 100.0) ELSE 0 END), 2) AS totalUnpaid,
          COUNT(DISTINCT i.id) AS invoiceCount
        FROM invoices i
        LEFT JOIN ${lineSub} il ON il.invoice_id = i.id
        WHERE ${where}
      `).get(...params);

      const byCustomer = db.prepare(`
        SELECT
          COALESCE(c.id, 0) AS customer_id,
          COALESCE(c.first_name || ' ' || c.last_name, 'Unknown') AS customer,
          COUNT(DISTINCT i.id) AS count,
          ROUND(SUM(COALESCE(il.subtotal, 0) * (1 + COALESCE(i.vat, 0) / 100.0)), 2) AS total,
          ROUND(SUM(CASE WHEN i.status = 'Paid' THEN COALESCE(il.subtotal, 0) * (1 + COALESCE(i.vat, 0) / 100.0) ELSE 0 END), 2) AS paid,
          ROUND(SUM(CASE WHEN i.status != 'Paid' THEN COALESCE(il.subtotal, 0) * (1 + COALESCE(i.vat, 0) / 100.0) ELSE 0 END), 2) AS unpaid
        FROM invoices i
        LEFT JOIN ${lineSub} il ON il.invoice_id = i.id
        LEFT JOIN customers c ON i.customer = c.id
        WHERE ${where}
        GROUP BY i.customer
        ORDER BY total DESC
      `).all(...params);

      const byIncomeAccount = db.prepare(`
        SELECT
          COALESCE(p.income_account, 'Sales Revenue') AS account,
          COUNT(*) AS count,
          ROUND(SUM(il.amount), 2) AS total
        FROM invoice_lines il
        JOIN invoices i ON il.invoice_id = i.id
        LEFT JOIN products p ON il.product = p.id
        WHERE ${where}
        GROUP BY account
        ORDER BY total DESC
      `).all(...params);

      return { success: true, ...kpi, byCustomer, byIncomeAccount };
    } catch (e) {
      console.error('[invoices] getSalesSummary error:', e);
      return { success: false, error: e.message };
    }
  },

  // ── Sales by Income Account drill-down ─────────────────────────────────
  getSalesByAccountDetail: function ({ dateFrom, dateTo, account } = {}) {
    try {
      const from = dateFrom || '0000-01-01';
      const to = dateTo || '9999-12-31';
      const rows = db.prepare(`
        SELECT
          il.invoice_id,
          i.number AS invoiceNumber,
          i.start_date AS invoiceDate,
          i.status,
          COALESCE(c.first_name || ' ' || c.last_name, 'Unknown') AS customerName,
          SUM(il.amount) AS amount,
          COUNT(*) AS lineCount
        FROM invoice_lines il
        JOIN invoices i ON il.invoice_id = i.id
        LEFT JOIN customers c ON i.customer = c.id
        LEFT JOIN products p ON il.product = p.id
        WHERE COALESCE(p.income_account, 'Sales Revenue') = ?
          AND i.status NOT IN ('Draft','Cancelled','Void')
          AND i.start_date BETWEEN ? AND ?
        GROUP BY il.invoice_id
        ORDER BY i.start_date DESC
      `).all(account, from, to);
      return rows;
    } catch (e) {
      console.error('[invoices] getSalesByAccountDetail error:', e);
      return [];
    }
  },
};

// Ensure the Invoices table is created
Invoices.createTable();
Invoices.createInvoiceItem();

// Exposed so handlers (and the verification suite) never re-implement the rule
// that decides which invoice lines are inventory — the same discipline as
// Expenses exporting LINE_TYPE_ITEM / normalizeLineType.
Invoices.readInvoiceItemLines = readInvoiceItemLines;

module.exports = Invoices;
