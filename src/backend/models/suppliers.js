// src/backend/models/Suppliers.js
const db = require('./dbmgr.js');

const Suppliers = {
  // Create the Suppliers table if it doesn't exist
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS suppliers (
    id	INTEGER,
    title	TEXT NOT NULL,
	first_name	TEXT NOT NULL,
    middle_name	TEXT,
	last_name	TEXT,
	suffix	TEXT,
	email	TEXT,
    display_name	TEXT,
	company_name	TEXT,
    phone_number	TEXT,
    mobile_number	TEXT NOT NULL,
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
    fax,other,website,address1,address2,city,state,postal_code,country,supplier_terms,business_number,account_number,expense_category,opening_balance,as_of,entered_by,notes) => {
    try {
    const stmt = db.prepare('INSERT INTO suppliers (title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,fax,other,website,address1,address2,city,state,postal_code,country,supplier_terms,business_number,account_number,expense_category,opening_balance,as_of,entered_by,notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?,?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,
        fax,other,website,address1,address2,city,state,postal_code,country,supplier_terms,business_number,account_number,expense_category,opening_balance,as_of,entered_by, notes);
   
     
    if (result.changes > 0) {
        return { success: true };
      } else {
        return { success: false };
      }
    } catch (error) {
      console.error("Error inserting supplier:", error);
      return { success: false };
    }
  },

  // Retrieve all Suppliers
  getAllSuppliers: () => {
    const stmt = db.prepare('SELECT * FROM suppliers ORDER BY id DESC');
    return stmt.all();
  },

  getPaginated: (page = 1, pageSize = 25, search = '') => {
    const offset = (Math.max(1, page) - 1) * Math.max(1, pageSize);
    const limit = Math.max(1, Math.min(500, pageSize));
    const searchParam = search && search.trim() ? `%${search.trim()}%` : null;
    let total;
    let data;
    if (searchParam) {
      total = db.prepare('SELECT COUNT(*) AS total FROM suppliers WHERE (first_name || \' \' || COALESCE(last_name,\'\') LIKE ? OR company_name LIKE ? OR email LIKE ?)').get(searchParam, searchParam, searchParam).total;
      data = db.prepare('SELECT * FROM suppliers WHERE (first_name || \' \' || COALESCE(last_name,\'\') LIKE ? OR company_name LIKE ? OR email LIKE ?) ORDER BY id DESC LIMIT ? OFFSET ?').all(searchParam, searchParam, searchParam, limit, offset);
    } else {
      total = db.prepare('SELECT COUNT(*) AS total FROM suppliers').get().total;
      data = db.prepare('SELECT * FROM suppliers ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);
    }
    return { data, total };
  },
  // Retrieve single customer
  getSingleSupplier: (supplier_id) => {
   const stmt = db.prepare('SELECT * FROM suppliers WHERE id=?');    
   const stmt_due = db.prepare("SELECT SUM(expense_lines.amount) AS due_amount FROM expense_lines INNER JOIN expenses ON expense_lines.expense_id = expenses.id WHERE expenses.payee = ? AND expenses.approval_status IN ('Pending') AND expenses.category IN ('supplier') GROUP BY expenses.id");
   const stmt_expenses = db.prepare("SELECT expenses.id, expenses.payment_account, expenses.approval_status, ref_no, SUM(expense_lines.amount) AS amount FROM expense_lines INNER JOIN expenses ON expense_lines.expense_id = expenses.id WHERE expenses.payee = ? AND expenses.category IN ('supplier') GROUP BY expenses.id, expenses.approval_status, expenses.payment_account");
   const supplier = stmt.get(supplier_id);
   if (!supplier) return null;
   supplier.expenses = stmt_expenses.all(supplier_id) || [];
   supplier.due_amount = stmt_due.get(supplier_id) || { due_amount: 0 };
   return supplier;
 },
  updateSupplier : async (supplierData) => {
    const { id, ...supplierDetails } = supplierData;
    try {
      // Update the main supplier details
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
             notes = ?
         WHERE id = ?`).run(
        [
          supplierDetails.title,           // Title
          supplierDetails.first_name,      // First name
          supplierDetails.middle_name,     // Middle name
          supplierDetails.last_name,       // Last name
          supplierDetails.suffix,          // Suffix
          supplierDetails.email,           // Email
          supplierDetails.display_name,    // Display name
          supplierDetails.company_name,    // Company name
          supplierDetails.phone_number,    // Phone number
          supplierDetails.mobile_number,   // Mobile number
          supplierDetails.fax,             // Fax
          supplierDetails.other,           // Other
          supplierDetails.website,         // Website
          supplierDetails.address1,        // Address line 1
          supplierDetails.address2,        // Address line 2
          supplierDetails.city,            // City
          supplierDetails.state,           // State
          supplierDetails.postal_code,     // Postal code
          supplierDetails.country,         // Country
          supplierDetails.supplier_terms,  // Payment method
          supplierDetails.business_number,           // Terms
          supplierDetails.account_number,      // Tax number
          supplierDetails.expense_category,
          supplierDetails.opening_balance, // Opening balance
          supplierDetails.as_of, 
          supplierDetails.notes,         // Language
          id                               // Customer ID (for WHERE clause)
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
} catch (e) { console.error('[suppliers] status migration:', e); }

module.exports = Suppliers;
