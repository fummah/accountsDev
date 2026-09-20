// src/backend/models/Suppliers.js
const db = require('./dbmgr.js');
const ContactIdentity = require('../services/contactIdentity.js');

const Suppliers = {
  // Create the Suppliers table if it doesn't exist
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS suppliers (
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
    notes TEXT,
    country	TEXT,
    supplier_terms	TEXT,
    business_number	TEXT,
    account_number	TEXT,
    expense_category	TEXT,
    opening_balance REAL DEFAULT 0.0,
    balance REAL DEFAULT 0.0,
    as_of	TEXT,
	entered_by	TEXT,
	date_entered DATETIME DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(id AUTOINCREMENT)
      )
    `;
    db.prepare(stmt).run();
  },

  // Insert a new Suppliers
  insertSupplier: async (title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,
    fax,other,website,address1,address2,city,state,postal_code,country,supplier_terms,business_number,account_number,expense_category,opening_balance,as_of,entered_by,notes,vendor_type,taxable,default_tax_rate,default_tax_rate_id) => {
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
    // "First Name OR Company Name" — same rule the form applies, enforced here
    // so the API cannot accept a record the UI would have refused.
    ContactIdentity.assertIdentified({ first_name, company_name });
    // One display-name rule: explicit -> personal name -> company. A company-only
    // vendor otherwise lands with a blank display name and renders as an empty row.
    const finalDisplayName = ContactIdentity.deriveDisplayName({ display_name, first_name, last_name, company_name });
    const stmt = db.prepare('INSERT INTO suppliers (title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,fax,other,website,address1,address2,city,state,postal_code,country,supplier_terms,business_number,account_number,expense_category,opening_balance,as_of,entered_by,notes,vendor_type,taxable,default_tax_rate,default_tax_rate_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?,?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(
        s(title), s(first_name), s(middle_name), s(last_name), s(suffix), s(email),
        s(finalDisplayName), s(company_name), s(phone_number), s(mobile_number),
        s(fax), s(other), s(website), s(address1), s(address2), s(city), s(state),
        s(postal_code), s(country), s(supplier_terms), s(business_number),
        s(account_number), s(expense_category), n(opening_balance), nOrNull(as_of),
        s(entered_by), s(notes), s(vendor_type) || 'Regular',
        taxable != null ? (taxable ? 1 : 0) : 1,
        nOrNull(default_tax_rate),
        nOrNull(default_tax_rate_id));
    
      
    if (result.changes > 0) {
        return { success: true };
      } else {
        return { success: false };
      }
    } catch (error) {
      console.error("Error inserting supplier:", error);
      // Surface the reason — the identity rule is a user-fixable input error,
      // and the form shows `res.error` when it is present.
      return { success: false, error: error.message };
    }
  },

  // Retrieve all Suppliers
  getAllSuppliers: () => {
    const rows = db.prepare('SELECT * FROM suppliers ORDER BY COALESCE(display_name, first_name) COLLATE NOCASE ASC').all();
    const dueStmt = db.prepare("SELECT COALESCE(SUM(el.amount), 0) AS due_amount FROM expense_lines el INNER JOIN expenses e ON el.expense_id = e.id WHERE e.payee = ? AND e.category IN ('supplier','bill') AND LOWER(COALESCE(e.approval_status, 'pending')) NOT IN ('paid','cancelled','void')");
    return rows.map(r => {
      let due = 0;
      try { due = Number(dueStmt.get(r.id)?.due_amount) || 0; } catch (e) { due = 0; }
      return { ...r, due_amount: due };
    });
  },

  getPaginated: (page = 1, pageSize = 25, search = '') => {
    const offset = (Math.max(1, page) - 1) * Math.max(1, pageSize);
    const limit = Math.max(1, Math.min(500, pageSize));
    const searchParam = search && search.trim() ? `%${search.trim()}%` : null;
    let total;
    let data;
    if (searchParam) {
      total = db.prepare('SELECT COUNT(*) AS total FROM suppliers WHERE (first_name || \' \' || COALESCE(last_name,\'\') LIKE ? OR company_name LIKE ? OR email LIKE ?)').get(searchParam, searchParam, searchParam).total;
      data = db.prepare('SELECT * FROM suppliers WHERE (first_name || \' \' || COALESCE(last_name,\'\') LIKE ? OR company_name LIKE ? OR email LIKE ?) ORDER BY COALESCE(display_name, first_name) COLLATE NOCASE ASC LIMIT ? OFFSET ?').all(searchParam, searchParam, searchParam, limit, offset);
    } else {
      total = db.prepare('SELECT COUNT(*) AS total FROM suppliers').get().total;
      data = db.prepare('SELECT * FROM suppliers ORDER BY COALESCE(display_name, first_name) COLLATE NOCASE ASC LIMIT ? OFFSET ?').all(limit, offset);
    }
    return { data, total };
  },
  // Retrieve single supplier
  getSingleSupplier: (supplier_id) => {
   const stmt = db.prepare('SELECT * FROM suppliers WHERE id=?');    
   const stmt_due = db.prepare("SELECT COALESCE(SUM(el.amount), 0) AS due_amount FROM expense_lines el INNER JOIN expenses e ON el.expense_id = e.id WHERE e.payee = ? AND e.category IN ('supplier','bill') AND LOWER(COALESCE(e.approval_status, 'pending')) NOT IN ('paid','cancelled','void')");
   const stmt_expenses = db.prepare("SELECT e.id, e.payment_date, e.due_date, e.payment_account, e.approval_status, e.ref_no, e.payment_method, COALESCE(e.paid_amount, 0) AS paid_amount, SUM(el.amount) AS amount FROM expense_lines el INNER JOIN expenses e ON el.expense_id = e.id WHERE e.payee = ? AND e.category IN ('supplier','bill') GROUP BY e.id ORDER BY COALESCE(e.payment_date, e.due_date) DESC");
   const supplier = stmt.get(supplier_id);
   if (!supplier) return null;
   supplier.expenses = stmt_expenses.all(supplier_id) || [];
   supplier.due_amount = stmt_due.get(supplier_id) || { due_amount: 0 };
   return supplier;
 },
  updateSupplier : async (supplierData) => {
    const { id, ...supplierDetails } = supplierData;
    try {
      // Merge with the existing row before writing. Every column below is bound
      // from `supplierDetails`, so without a merge ANY partial update (address
      // only, phone only, …) passes `undefined` and dies on
      // `NOT NULL constraint failed: suppliers.title`. updateCustomer has always
      // merged; updateSupplier never did.
      const existing = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id) || {};
      const pick = (key, fallbackKeys = []) => {
        if (supplierDetails[key] !== undefined) return supplierDetails[key];
        for (const fk of fallbackKeys) {
          if (supplierDetails[fk] !== undefined) return supplierDetails[fk];
        }
        return existing[key];
      };
      // The live table declares title/first_name/mobile_number NOT NULL with no
      // default, so a missing value must land as '' rather than null.
      const notNull = (key, fallbackKeys = []) => {
        const v = pick(key, fallbackKeys);
        return v == null ? '' : v;
      };

      const firstName = notNull('first_name');
      const lastName = pick('last_name');
      const companyName = pick('company_name', ['company']);

      // "First Name OR Company Name" — validated against the MERGED result, so a
      // partial edit of an already-identifiable vendor still saves, while an edit
      // that blanks out both is refused. Same rule, same message as the form.
      ContactIdentity.assertIdentified({ first_name: firstName, company_name: companyName });

      // Do NOT synthesise a first name and do NOT fall back to 'Vendor'. That
      // would rewrite a company-only vendor into a fake person.
      const dn = ContactIdentity.deriveDisplayName({
        display_name: pick('display_name'),
        first_name: firstName,
        last_name: lastName,
        company_name: companyName,
      });

      await db.prepare(
        `UPDATE suppliers 
         SET 
             title = ?, 
             first_name = ?, 
             middle_name = ?, 
             last_name = ?, 
             suffix = ?, 
             email = ?, 
             display_name = ?, 
             company_name = ?, 
             phone_number = ?, 
             mobile_number = ?, 
             fax = ?, 
             other = ?, 
             website = ?, 
             address1 = ?, 
             address2 = ?, 
             city = ?, 
             state = ?, 
             postal_code = ?, 
             country = ?, 
             supplier_terms = ?, 
             business_number = ?, 
             account_number = ?,
             expense_category = ?,
             opening_balance = ?, 
             as_of = ?,
             notes = ?,
             vendor_type = ?,
             taxable = ?,
             default_tax_rate = ?,
             default_tax_rate_id = ?
         WHERE id = ?`).run(
        [
          notNull('title'),                // Title
          firstName,                       // First name
          pick('middle_name'),             // Middle name
          lastName,                        // Last name
          pick('suffix'),                  // Suffix
          pick('email'),                   // Email
          dn,                              // Display name
          companyName,                     // Company name
          pick('phone_number', ['phone']), // Phone number
          notNull('mobile_number', ['mobile']), // Mobile number
          pick('fax'),                     // Fax
          pick('other'),                   // Other
          pick('website'),                 // Website
          pick('address1'),                // Address line 1
          pick('address2'),                // Address line 2
          pick('city'),                    // City
          pick('state'),                   // State
          pick('postal_code', ['zip']),    // Postal code
          pick('country'),                 // Country
          pick('supplier_terms'),          // Payment terms
          pick('business_number'),         // Business number
          pick('account_number'),          // Account number
          pick('expense_category'),
          pick('opening_balance'),         // Opening balance
          pick('as_of'), 
          pick('notes'),
          pick('vendor_type') || 'Regular',
          pick('taxable') != null ? (pick('taxable') ? 1 : 0) : 1,
          pick('default_tax_rate') != null ? Number(pick('default_tax_rate')) : null,
          pick('default_tax_rate_id') != null ? Number(pick('default_tax_rate_id')) : null,
          id                               // Supplier ID (for WHERE clause)
        ]
      );
  
      return { success: true, message: 'Supplier updated successfully.' };
    } catch (error) {
      console.error('Error updating Supplier:', error);
      throw error;
    }
  },

  // Activate / Deactivate
  toggleStatus: (id, status) => {
    try {
      db.prepare('UPDATE suppliers SET status = ? WHERE id = ?').run(status || 'Active', id);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  deleteSupplier: (id) => {
    try {
      db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
};

// Ensure the Suppliers table is created
Suppliers.createTable();

// Migration: add status column if missing
try {
  const cols = db.prepare("PRAGMA table_info(suppliers)").all();
  if (!cols.some(c => c.name === 'status')) {
    db.prepare("ALTER TABLE suppliers ADD COLUMN status TEXT DEFAULT 'Active'").run();
  }
  if (!cols.some(c => c.name === 'vendor_type')) {
    db.prepare("ALTER TABLE suppliers ADD COLUMN vendor_type TEXT DEFAULT 'Regular'").run();
  }
  // Tax fields — mirror the customers table so vendors have the same
  // default-tax-rate relationship by VAT rate ID.
  if (!cols.some(c => c.name === 'taxable')) {
    db.prepare("ALTER TABLE suppliers ADD COLUMN taxable INTEGER DEFAULT 1").run();
  }
  if (!cols.some(c => c.name === 'default_tax_rate')) {
    db.prepare("ALTER TABLE suppliers ADD COLUMN default_tax_rate REAL DEFAULT NULL").run();
  }
  if (!cols.some(c => c.name === 'default_tax_rate_id')) {
    db.prepare("ALTER TABLE suppliers ADD COLUMN default_tax_rate_id INTEGER").run();
  }
} catch (e) { console.error('[suppliers] migration:', e); }

module.exports = Suppliers;
