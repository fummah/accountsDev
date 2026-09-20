// src/backend/models/customers.js
const db = require('./dbmgr.js');
const ContactIdentity = require('../services/contactIdentity.js');

const Customers = {
  // Create the Customers table if it doesn't exist
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS customers (
    id	INTEGER,
    title	TEXT NOT NULL DEFAULT '',
	first_name	TEXT NOT NULL,
    middle_name	TEXT,
	last_name	TEXT,
	suffix	TEXT,
	email	TEXT,
    display_name	TEXT,
	company_name	TEXT,
    phone_number	TEXT,
    mobile_number	TEXT NOT NULL DEFAULT '',
    fax	TEXT,
    other	TEXT,
    website	TEXT,
    address1	TEXT,
    address2	TEXT,
    city	TEXT,
    state	TEXT,
    postal_code	TEXT,
    country	TEXT,
    payment_method	TEXT,
    terms	TEXT,
    notes	TEXT,
    delivery_option TEXT,
    language TEXT,
    tax_number	TEXT,
    opening_balance REAL DEFAULT 0.0,
    as_of TEXT,
	entered_by	TEXT,
	date_entered DATETIME DEFAULT CURRENT_TIMESTAMP,
    taxable INTEGER DEFAULT 1,
    default_tax_rate REAL DEFAULT NULL,
    default_tax_rate_id INTEGER,
    status TEXT DEFAULT 'Active',
	PRIMARY KEY(id AUTOINCREMENT)
      )
    `;
    db.prepare(stmt).run();
    // Add columns if they don't exist (for existing databases)
    try { db.prepare("ALTER TABLE customers ADD COLUMN taxable INTEGER DEFAULT 1").run(); } catch (_) {}
    try { db.prepare("ALTER TABLE customers ADD COLUMN default_tax_rate REAL DEFAULT NULL").run(); } catch (_) {}
    try { db.prepare("ALTER TABLE customers ADD COLUMN default_tax_rate_id INTEGER").run(); } catch (_) {}
    try { db.prepare("ALTER TABLE customers ADD COLUMN status TEXT DEFAULT 'Active'").run(); } catch (_) {}
  },

  // Insert a new customers
  insertCustomer: async (title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,
    fax,other,website,address1,address2,city,state,postal_code,country,payment_method,terms,tax_number,entered_by,opening_balance,as_of,delivery_option,language,notes,taxable,default_tax_rate,default_tax_rate_id) => {
    try {
    // SQLite can only bind numbers/strings/bigints/buffers/null — coerce every
    // value defensively so booleans/undefined/objects never reach better-sqlite3.
    const s = (v) => v == null ? '' : String(v);
    const n = (v) => {
      const num = v == null ? 0 : Number(v);
      return Number.isFinite(num) ? num : 0;
    };
    const nOrNull = (v) => {
      if (v == null || v === '') return null;
      const num = Number(v);
      return Number.isFinite(num) ? num : null;
    };
    // "First Name OR Company Name" — the API enforces the same rule the form
    // does, so a company-only record is accepted and a record with neither is
    // refused here rather than reaching the database.
    ContactIdentity.assertIdentified({ first_name, company_name });
    // Derive the display name from one rule: explicit -> personal name ->
    // company. Without this a company-only record would be stored with a blank
    // display name and render as an empty row in every list.
    const finalDisplayName = ContactIdentity.deriveDisplayName({ display_name, first_name, last_name, company_name });
    const stmt = db.prepare('INSERT INTO customers (title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,fax,other,website,address1,address2,city,state,postal_code,country,payment_method,terms,tax_number,entered_by,opening_balance,as_of,delivery_option,language,notes,taxable,default_tax_rate,default_tax_rate_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?,?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(
        s(title), s(first_name), s(middle_name), s(last_name), s(suffix), s(email),
        s(finalDisplayName), s(company_name), s(phone_number), s(mobile_number),
        s(fax), s(other), s(website), s(address1), s(address2), s(city), s(state),
        s(postal_code), s(country), s(payment_method), s(terms), s(tax_number),
        s(entered_by), n(opening_balance), nOrNull(as_of), s(delivery_option),
        s(language), s(notes),
        taxable != null ? (taxable ? 1 : 0) : 1,
        nOrNull(default_tax_rate),
        nOrNull(default_tax_rate_id));
    
      
    if (result.changes > 0) {
        return { success: true };
      } else {
        return { success: false };
      }
    } catch (error) {
      console.error("Error inserting customer:", error);
      return { success: false, error: error.message };
    }
  },
 
  // Retrieve all customers
  getAllCustomers: function() {
    const stmt = db.prepare('SELECT * FROM customers ORDER BY COALESCE(display_name, first_name) COLLATE NOCASE ASC');
    const report = this.getCustomerReport();
    return {all:stmt.all(),report:report};
  },

  getPaginated: function (page = 1, pageSize = 25, search = '', status = '') {
    const offset = (Math.max(1, page) - 1) * Math.max(1, pageSize);
    const limit = Math.max(1, Math.min(500, pageSize));
    const searchParam = search && search.trim() ? `%${search.trim()}%` : null;
    const statusParam = status && status.trim() ? status.trim() : null;
    const subquery = 'LEFT JOIN (SELECT net.customer, ROUND(SUM(net.inv_net), 2) AS balance FROM (SELECT i.customer, i.id, COALESCE(SUM(il.amount * (1 + COALESCE(i.vat, 0) / 100.0)), 0) - COALESCE(MAX(pt.totalPaid), 0) AS inv_net FROM invoices i INNER JOIN invoice_lines il ON il.invoice_id = i.id LEFT JOIN (SELECT invoiceId, SUM(amount) AS totalPaid FROM (SELECT a.invoiceId, a.amount FROM payment_allocations a UNION ALL SELECT p.invoiceId, p.amount FROM payments p WHERE p.invoiceId IS NOT NULL AND p.invoiceId != 0 AND NOT EXISTS (SELECT 1 FROM payment_allocations x WHERE x.paymentId = p.id)) GROUP BY invoiceId) pt ON pt.invoiceId = i.id WHERE LOWER(COALESCE(i.status, \'\')) NOT IN (\'paid\', \'cancelled\', \'void\', \'draft\') GROUP BY i.customer, i.id) net GROUP BY net.customer) bal ON bal.customer = c.id';
    const fields = 'c.*, COALESCE(bal.balance, 0) AS balance';
    const whereParts = [];
    const params = [];
    if (searchParam) {
      // Search across every field a user would realistically type when picking a
      // customer: full name, display name, company, email, phone, mobile and the
      // numeric customer number (id). Added for the CRM lead customer selector,
      // which cannot load all 60k+ customers into the DOM.
      whereParts.push(
        '(' +
          'c.first_name || \' \' || COALESCE(c.last_name,\'\') LIKE ?' +
          ' OR c.first_name LIKE ?' +
          ' OR c.last_name LIKE ?' +
          ' OR c.display_name LIKE ?' +
          ' OR c.company_name LIKE ?' +
          ' OR c.email LIKE ?' +
          ' OR c.phone_number LIKE ?' +
          ' OR c.mobile_number LIKE ?' +
          ' OR CAST(c.id AS TEXT) LIKE ?' +
        ')'
      );
      params.push(
        searchParam, searchParam, searchParam, searchParam, searchParam,
        searchParam, searchParam, searchParam, searchParam
      );
    }
    if (statusParam) {
      whereParts.push('COALESCE(c.status, \'Active\') = ?');
      params.push(statusParam);
    }
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) AS total FROM customers c ${whereClause}`).get(...params).total;
    const data = db.prepare(`SELECT ${fields} FROM customers c ${subquery} ${whereClause} ORDER BY COALESCE(c.display_name, c.first_name) COLLATE NOCASE ASC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    return { data, total };
  },
   // Retrieve single customer
   getSingleCustomer: (customer_id) => {
    const stmt = db.prepare('SELECT *FROM customers WHERE id=?');    
    const stmt_due = db.prepare("SELECT SUM(invoice_lines.amount) AS due_amount FROM invoice_lines INNER JOIN invoices ON invoice_lines.invoice_id = invoices.id WHERE invoices.customer = ? AND invoices.status IN ('Open', 'Partially Paid') GROUP BY invoices.id");
    const stmt_invoices = db.prepare('SELECT invoices.id, invoices.number, invoices.status, invoices.start_date, invoices.last_date, SUM(invoice_lines.amount) AS amount FROM invoice_lines INNER JOIN invoices ON invoice_lines.invoice_id = invoices.id WHERE invoices.customer = ? GROUP BY invoices.id, invoices.status, invoices.start_date, invoices.last_date');
    const stmt_quotes = db.prepare('SELECT quotes.id, quotes.number, quotes.status, quotes.start_date, quotes.last_date, SUM(quote_lines.amount) AS amount FROM quote_lines INNER JOIN quotes ON quote_lines.quote_id = quotes.id WHERE quotes.customer = ? GROUP BY quotes.id, quotes.status, quotes.start_date, quotes.last_date'); 
    const stmt_expenses = db.prepare("SELECT expenses.id, expenses.payment_account, expenses.approval_status, ref_no, SUM(expense_lines.amount) AS amount FROM expense_lines INNER JOIN expenses ON expense_lines.expense_id = expenses.id WHERE expenses.payee = ? AND expenses.category IN ('customer') GROUP BY expenses.id, expenses.approval_status, expenses.payment_account");
    const customer = stmt.get(customer_id);
    customer.invoices = stmt_invoices.all(customer_id);
    customer.quotes = stmt_quotes.all(customer_id);
    customer.expenses = stmt_expenses.all(customer_id);
    customer.due_amount = stmt_due.get(customer_id); 
    return customer;
  },
  updateCustomer : async (customerData) => {
    const { id, ...customerDetails } = customerData;
    try {
      // Merge with existing record so partial updates (e.g. only address/phone)
      // don't wipe NOT NULL columns like first_name.
      const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) || {};
      const pick = (key, fallbackKeys = []) => {
        if (customerDetails[key] !== undefined) return customerDetails[key];
        for (const fk of fallbackKeys) {
          if (customerDetails[fk] !== undefined) return customerDetails[fk];
        }
        return existing[key];
      };

      const firstName = pick('first_name') == null ? '' : pick('first_name');
      const lastName = pick('last_name');
      const companyName = pick('company_name', ['company']);

      // The rule is "First Name OR Company Name". Validate the MERGED result so
      // a partial edit (address only) of an already-identifiable record still
      // saves, while an edit that blanks out both is refused.
      ContactIdentity.assertIdentified({ first_name: firstName, company_name: companyName });

      // Do NOT synthesise a first name from the display name, and do NOT fall
      // back to 'Customer'. That silently rewrote a company-only record into a
      // fake person — editing "Amazon" (blank first name) set first_name to
      // "Amazon". first_name stays blank; the column is NOT NULL, which '' satisfies.
      const dn = ContactIdentity.deriveDisplayName({
        display_name: pick('display_name'),
        first_name: firstName,
        last_name: lastName,
        company_name: companyName,
      });

      await db.prepare(
        `UPDATE customers 
         SET 
             title = ?, first_name = ?, middle_name = ?, last_name = ?, suffix = ?, 
             email = ?, display_name = ?, company_name = ?, phone_number = ?, mobile_number = ?, 
             fax = ?, other = ?, website = ?, address1 = ?, address2 = ?, city = ?, state = ?, 
             postal_code = ?, country = ?, payment_method = ?, terms = ?, tax_number = ?,
             opening_balance = ?, as_of = ?, delivery_option = ?, language = ?, notes = ?,
             taxable = ?, default_tax_rate = ?, default_tax_rate_id = ?
         WHERE id = ?`).run(
        [
          pick('title'),
          firstName,
          pick('middle_name'),
          lastName,
          pick('suffix'),
          pick('email'),
          dn,
          companyName,
          pick('phone_number', ['phone']),
          pick('mobile_number', ['mobile']),
          pick('fax'),
          pick('other'),
          pick('website'),
          pick('address1'),
          pick('address2'),
          pick('city'),
          pick('state'),
          pick('postal_code', ['zip']),
          pick('country'),
          pick('payment_method'),
          pick('terms'),
          pick('tax_number'),
          pick('opening_balance'),
          pick('as_of'),
          pick('delivery_option'),
          pick('language'),
          pick('notes'),
          pick('taxable') != null ? (pick('taxable') ? 1 : 0) : 1,
          pick('default_tax_rate') != null ? Number(pick('default_tax_rate')) : null,
          pick('default_tax_rate_id') != null ? Number(pick('default_tax_rate_id')) : null,
          id
        ]
      );
  
      return { success: true, message: 'Customer updated successfully.' };
    } catch (error) {
      console.error('Error updating Customer:', error);
      throw error;
    }
  },
  // Activate / Deactivate a customer
  toggleStatus: (id, status) => {
    try {
      db.prepare('UPDATE customers SET status = ? WHERE id = ?').run(status || 'Active', id);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  getCustomerReport: function (){
    // Invoice status is automatic: an invoice is "open" while it still has an
    // outstanding balance (Open / Partially Paid). Legacy 'Pending' no longer exists.
    const stmt_open = db.prepare("SELECT COUNT(DISTINCT i.id) AS open_invoice,SUM(l.amount + (l.amount*i.vat/100)) AS open_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status COLLATE NOCASE IN ('Open','Partially Paid') ");
    const stmt_due = db.prepare("SELECT COUNT(DISTINCT i.id) AS due_invoice,SUM(l.amount + (l.amount*i.vat/100)) AS due_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status COLLATE NOCASE IN ('Open','Partially Paid') AND i.last_date < ?");
    const stmt_paid = db.prepare("SELECT COUNT(DISTINCT i.id) AS paid_invoice,SUM(l.amount + (l.amount*i.vat/100)) AS paid_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status COLLATE NOCASE = 'Paid' ");
    // Live quotes = Pending or Accepted (both still convertible).
    const stmt_quote = db.prepare("SELECT COUNT(DISTINCT i.id) AS due_quote,SUM(l.amount + (l.amount*i.vat/100)) AS due_total_amount FROM quote_lines AS l INNER JOIN quotes AS i ON l.quote_id = i.id WHERE i.status COLLATE NOCASE IN ('Pending','Accepted')");


    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const due_date = `${year}-${month}-${day}`;
    const open_invoice = stmt_open.all();
    const paid_invoice = stmt_paid.all();
    const due_invoice = stmt_due.all(due_date);
    const due_quote = stmt_quote.all();

    return {open_invoice,due_invoice, paid_invoice,due_quote};
  },

  /**
   * On-demand legacy tax rate backfill.
   *
   * Finds customers with a numeric `default_tax_rate` but no
   * `default_tax_rate_id`, and links them to the corresponding VAT rate
   * where the percentage match is unique. Ambiguous and unmatched records
   * are preserved — the numeric value is never lost.
   *
   * This is the runtime counterpart to migration 004. It can be called after
   * the user adds new VAT rates to retroactively link records that the
   * migration could not match (because the VAT rate didn't exist yet).
   */
  linkLegacyTaxRates: () => {
    try {
      const vatExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vat'").get();
      if (!vatExists) return { linked: 0, ambiguous: 0, unmatched: 0, report: [] };

      const unmatched = db.prepare(
        "SELECT id, default_tax_rate FROM customers WHERE default_tax_rate IS NOT NULL AND default_tax_rate_id IS NULL"
      ).all();

      if (unmatched.length === 0) return { linked: 0, ambiguous: 0, unmatched: 0, report: [] };

      const matchStmt = db.prepare("SELECT id, vat_name, vat_percentage FROM vat WHERE vat_percentage = ?");
      const linkStmt = db.prepare("UPDATE customers SET default_tax_rate_id = ? WHERE id = ?");

      let linked = 0, ambiguous = 0, unmatchedCount = 0;
      const report = [];

      for (const rec of unmatched) {
        const matches = matchStmt.all(Number(rec.default_tax_rate));
        if (matches.length === 1) {
          linkStmt.run(matches[0].id, rec.id);
          linked++;
          report.push({ id: rec.id, rate: rec.default_tax_rate, action: 'linked', vatId: matches[0].id });
        } else if (matches.length > 1) {
          ambiguous++;
          report.push({ id: rec.id, rate: rec.default_tax_rate, action: 'ambiguous', candidates: matches.length });
        } else {
          unmatchedCount++;
          report.push({ id: rec.id, rate: rec.default_tax_rate, action: 'unmatched' });
        }
      }

      if (linked > 0 || ambiguous > 0 || unmatchedCount > 0) {
        console.log(`[customers] linkLegacyTaxRates: ${linked} linked, ${ambiguous} ambiguous, ${unmatchedCount} unmatched`);
      }

      return { linked, ambiguous, unmatched: unmatchedCount, report };
    } catch (e) {
      console.error('[customers] linkLegacyTaxRates:', e);
      return { linked: 0, ambiguous: 0, unmatched: 0, report: [], error: e.message };
    }
  },
};

// Ensure the Customers table is created
Customers.createTable();

module.exports = Customers;
