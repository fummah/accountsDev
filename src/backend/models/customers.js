// src/backend/models/customers.js
const db = require('./dbmgr.js');

const Customers = {
  // Create the Customers table if it doesn't exist
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS customers (
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
	PRIMARY KEY(id AUTOINCREMENT)
      )
    `;
    db.prepare(stmt).run();
  },

  // Insert a new customers
  insertCustomer: async (title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,
    fax,other,website,address1,address2,city,state,postal_code,country,payment_method,terms,tax_number,entered_by,opening_balance,as_of,delivery_option,language, notes) => {
    try {
    const stmt = db.prepare('INSERT INTO customers (title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,fax,other,website,address1,address2,city,state,postal_code,country,payment_method,terms,tax_number,entered_by,opening_balance,as_of,delivery_option,language,notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?,?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,
        fax,other,website,address1,address2,city,state,postal_code,country,payment_method,terms,tax_number,entered_by,opening_balance,as_of,delivery_option,language, notes);
   
     
    if (result.changes > 0) {
        return { success: true };
      } else {
        return { success: false };
      }
    } catch (error) {
      console.error("Error inserting customer:", error);
      return { success: false };
    }
  },
 
  // Retrieve all customers
  getAllCustomers: function() {
    const stmt = db.prepare('SELECT * FROM customers ORDER BY id DESC');
    const report = this.getCustomerReport();
    return {all:stmt.all(),report:report};
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
      // Update the main customer details
      await db.prepare(
        `UPDATE customers 
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
             payment_method = ?, 
             terms = ?, 
             tax_number = ?,
             opening_balance = ?, 
             as_of = ?, 
             delivery_option = ?, 
             language = ?,
             notes = ? 
         WHERE id = ?`).run(
        [
          customerDetails.title,           // Title
          customerDetails.first_name,      // First name
          customerDetails.middle_name,     // Middle name
          customerDetails.last_name,       // Last name
          customerDetails.suffix,          // Suffix
          customerDetails.email,           // Email
          customerDetails.display_name,    // Display name
          customerDetails.company_name,    // Company name
          customerDetails.phone_number,    // Phone number
          customerDetails.mobile_number,   // Mobile number
          customerDetails.fax,             // Fax
          customerDetails.other,           // Other
          customerDetails.website,         // Website
          customerDetails.address1,        // Address line 1
          customerDetails.address2,        // Address line 2
          customerDetails.city,            // City
          customerDetails.state,           // State
          customerDetails.postal_code,     // Postal code
          customerDetails.country,         // Country
          customerDetails.payment_method,  // Payment method
          customerDetails.terms,           // Terms
          customerDetails.tax_number,      // Tax number
          customerDetails.opening_balance, // Opening balance
          customerDetails.as_of,           // As of (date)
          customerDetails.delivery_option, // Delivery option
          customerDetails.language,
          customerDetails.notes,         // Language
          id                               // Customer ID (for WHERE clause)
        ]
      );
  
      return { success: true, message: 'Customer updated successfully.' };
    } catch (error) {
      console.error('Error updating Customer:', error);
      throw error;
    }
  },
  getCustomerReport: function (){
    const stmt_open = db.prepare("SELECT COUNT(DISTINCT i.id) AS open_invoice,SUM(l.amount * l.quantity + ((l.amount * l.quantity)*i.vat/100)) AS open_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status = 'Pending' ");
    const stmt_due = db.prepare("SELECT COUNT(DISTINCT i.id) AS due_invoice,SUM(l.amount * l.quantity + ((l.amount * l.quantity)*i.vat/100)) AS due_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status = 'Pending' AND i.last_date < ?");
    const stmt_paid = db.prepare("SELECT COUNT(DISTINCT i.id) AS paid_invoice,SUM(l.amount * l.quantity + ((l.amount * l.quantity)*i.vat/100)) AS paid_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status = 'Paid' ");
    const stmt_quote = db.prepare("SELECT COUNT(DISTINCT i.id) AS due_quote,SUM(l.amount * l.quantity + ((l.amount * l.quantity)*i.vat/100)) AS due_total_amount FROM quote_lines AS l INNER JOIN quotes AS i ON l.quote_id = i.id WHERE i.status = 'Pending'");


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
};

// Ensure the Customers table is created
Customers.createTable();

module.exports = Customers;
