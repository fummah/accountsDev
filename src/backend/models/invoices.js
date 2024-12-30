// src/backend/models/Invoices.js
const db = require('./dbmgr.js');

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
    linked_invoice TEXT,
	entered_by	TEXT,
	date_entered DATETIME DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(id AUTOINCREMENT),
  FOREIGN KEY (customer) REFERENCES customers(id)
      )
    `;
    db.prepare(stmt).run();
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
  }, 
  
  // Insert a new Invoices
  insertInvoice: async (customer,customer_email,islater, billing_address, terms,start_date,last_date,message,statement_message,number,entered_by,vat,status,invoiceLines) => {
    try {
    const stmt = db.prepare('INSERT INTO invoices (customer,customer_email,islater, billing_address, terms,start_date,last_date,message,statement_message,number,entered_by, vat, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(customer,customer_email,islater, billing_address, terms,start_date,last_date,message,statement_message,number,entered_by, vat, status);

    if (result.changes > 0) {
      const invoiceId = result.lastInsertRowid;
      const invoiceLineStmt = db.prepare('INSERT INTO invoice_lines (invoice_id, product, description,quantity,rate, amount) VALUES (?, ?, ?, ?, ?, ?)');
      for (const line of invoiceLines) {
        await invoiceLineStmt.run(invoiceId, line.product, line.description,line.quantity,line.rate, line.amount);
      }
      return { success: true, invoiceId }; 
    } 
      else {
        return { success: false };
      }
    } catch (error) {
      console.error("Error inserting Invoice:", error);
      return { success: false, error:error };
    }
  },

  // Retrieve all Invoices
  getAllInvoices: function () {
    const stmt = db.prepare("SELECT invoices.id, invoices.number,invoices.customer, customers.first_name || ' ' || customers.last_name AS customer_name,invoices.customer_email, invoices.status, invoices.start_date, invoices.last_date, SUM(invoice_lines.amount *invoice_lines.quantity) AS amount, invoices.vat, invoices.terms,invoices.message,invoices.statement_message, invoices.billing_address FROM invoice_lines INNER JOIN invoices ON invoice_lines.invoice_id = invoices.id INNER JOIN customers ON invoices.customer = customers.id GROUP BY invoices.id, customers.first_name, customers.last_name, invoices.status, invoices.start_date, invoices.last_date ORDER BY invoices.id DESC");
    const report = this.getInvoiceReport();
    return {all:stmt.all(), report:report};
  },
  getInvoiceSummary: () => {
    const stmt_open = db.prepare("SELECT COUNT(DISTINCT i.id) AS open_invoice,SUM(l.amount * l.quantity + ((l.amount * l.quantity)*i.vat/100)) AS open_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status = 'Pending' ");
    const stmt_due = db.prepare("SELECT COUNT(DISTINCT i.id) AS due_invoice,SUM(l.amount * l.quantity + ((l.amount * l.quantity)*i.vat/100)) AS due_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status = 'Pending' AND i.last_date < ?");
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
    const stmt_open = db.prepare("SELECT COUNT(DISTINCT i.id) AS open_invoice,SUM(l.amount * l.quantity + ((l.amount * l.quantity)*i.vat/100)) AS open_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status = 'Pending' ");
    const stmt_due = db.prepare("SELECT COUNT(DISTINCT i.id) AS due_invoice,SUM(l.amount * l.quantity + ((l.amount * l.quantity)*i.vat/100)) AS due_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status = 'Pending' AND i.last_date < ?");
    const stmt_paid = db.prepare("SELECT COUNT(DISTINCT i.id) AS open_invoice,SUM(l.amount * l.quantity + ((l.amount * l.quantity)*i.vat/100)) AS paid_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status = 'Paid' ");
    
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const due_date = `${year}-${month}-${day}`;
    const open_invoice = stmt_open.all();
    const paid_invoice = stmt_paid.all();
    const due_invoice = stmt_due.all(due_date);

    return {open_invoice,due_invoice, paid_invoice};
  },
  getDashboardSummary: function () {
    const stmt_not_due = db.prepare("SELECT COUNT(DISTINCT i.id) AS due_invoice,SUM(l.amount * l.quantity + ((l.amount * l.quantity)*i.vat/100)) AS not_due_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status = 'Pending' AND i.last_date > ?");
    const stmt_open_expense = db.prepare("SELECT COUNT(DISTINCT e.id) AS open_expense,SUM(l.amount) AS open_total_amount_expense FROM expense_lines AS l INNER JOIN expenses AS e ON l.expense_id = e.id WHERE e.approval_status = 'Pending' ");
    const stmt_due_expense = db.prepare("SELECT COUNT(DISTINCT e.id) AS due_expense,SUM(l.amount) AS due_total_amount_expense FROM expense_lines AS l INNER JOIN expenses AS e ON l.expense_id = e.id WHERE e.approval_status = 'Pending' AND e.payment_date < ?");
    const stmt_quote = db.prepare("SELECT COUNT(DISTINCT i.id) AS due_quote,SUM(l.amount * l.quantity + ((l.amount * l.quantity)*i.vat/100)) AS due_total_amount FROM quote_lines AS l INNER JOIN quotes AS i ON l.quote_id = i.id WHERE i.status = 'Pending' AND i.last_date < ?");
    
    const stmt_invoicetrend= db.prepare("SELECT strftime('%Y-%m', start_date) AS name, COUNT(*) AS number FROM invoices WHERE start_date >= date('now', '-5 months') AND status='Paid' GROUP BY strftime('%Y-%m', start_date) ORDER BY name ASC");
    const stmt_customertrend= db.prepare("SELECT strftime('%Y-%m', date_entered) AS name, COUNT(*) AS number FROM customers WHERE date_entered >= date('now', '-5 months') GROUP BY strftime('%Y-%m', date_entered) ORDER BY name");
    const stmt_suppliertrend= db.prepare("SELECT strftime('%Y-%m', date_entered) AS name, COUNT(*) AS number FROM suppliers WHERE date_entered >= date('now', '-5 months') GROUP BY strftime('%Y-%m', date_entered) ORDER BY name");
    const stmt_expenselist= db.prepare("SELECT category as name, COUNT(*) as value FROM expense_lines GROUP BY category");

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const due_date = `${year}-${month}-${day}`;

  const report = this.getInvoiceReport();
  const open_invoice = report.open_invoice;
  const paid_invoice = report.paid_invoice;
  const due_invoice = report.due_invoice;
  const due_not_invoice = stmt_not_due.all(due_date);
  const open_expense = stmt_open_expense.all();
  const due_expense = stmt_due_expense.all(due_date);
  const due_quote = stmt_quote.all(due_date);
  const invoicetrend = stmt_invoicetrend.all();
  const customertrend = stmt_customertrend.all();
  const suppliertrend = stmt_suppliertrend.all();
  const expenselist = stmt_expenselist.all();


  return {open_invoice,due_invoice,open_expense,due_expense,due_quote,invoicetrend, customertrend,suppliertrend, expenselist, due_not_invoice,paid_invoice,report};
  },
  getSingleInvoice: (invoice_id) => {
    const stmt = db.prepare(`SELECT invoices.id as invoice_id, customers.first_name, customers.last_name,customers.phone_number, customers.mobile_number, invoices.status, invoices.customer_email, invoices.islater, invoices.billing_address,
        invoices.start_date, invoices.last_date, invoices.message, invoices.statement_message, invoices.number, invoices.vat, invoices.entered_by, invoices.date_entered, invoice_lines.id AS line_id,
        invoice_lines.amount, invoice_lines.description, invoice_lines.product, invoice_lines.quantity, invoice_lines.rate FROM invoice_lines INNER JOIN invoices ON invoice_lines.invoice_id = invoices.id INNER JOIN customers ON invoices.customer = customers.id WHERE invoices.id = ?`);
  
    const rows = stmt.all(invoice_id);
  
    const groupedData = rows.reduce((acc, row) => {
      const {invoice_id, first_name, last_name, phone_number, mobile_number, status,vat, customer_email, islater, billing_address, start_date, last_date, message, statement_message, number, entered_by, date_entered,
        line_id, amount, description,quantity, product, rate, } = row;
  
      if (!acc) {
        acc = {invoice_id, first_name, last_name, phone_number, mobile_number, status, vat, customer_email, islater, billing_address, start_date, last_date, message, statement_message, number, entered_by,
          date_entered, lines: [], };
      }
      acc.lines.push({ id: line_id, amount, description, quantity, product, rate,});
      return acc;
    }, null);
  
    return groupedData;
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
    const { id, lines, ...invoiceDetails } = invoiceData;

    try {
      // Update the main invoice details
      await db.prepare(
        `UPDATE invoices
         SET customer = ?, customer_email = ?, islater = ?, billing_address = ?, 
             terms = ?, start_date = ?, last_date = ?, number = ?, vat = ?, 
             message = ?, statement_message = ?, status = ?
         WHERE id = ?`).run(
        [
          invoiceDetails.customer,
          invoiceDetails.customer_email,
          invoiceDetails.islater ? 1 : 0,
          invoiceDetails.billing_address,
          invoiceDetails.terms,
          invoiceDetails.start_date,
          invoiceDetails.last_date,
          invoiceDetails.number,
          invoiceDetails.vat,
          invoiceDetails.message,
          invoiceDetails.statement_message,
          invoiceDetails.status,
          id,
        ]
      );
  
      // Delete existing lines for the invoice
      await db.prepare(`DELETE FROM invoice_lines WHERE invoice_id = ?`, [id]);
  
      // Insert updated lines
      for (const line of lines) {
        await db.prepare(
          `INSERT INTO invoice_lines (invoice_id, product, description, quantity, rate, amount)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, line.product, line.description, line.quantity, line.rate, line.amount]
        );
      }
  
      return { success: true, message: 'Invoice updated successfully.' };
    } catch (error) {
      console.error('Error updating invoice:', error);
      throw error;
    }
  }
  ,
};

// Ensure the Invoices table is created
Invoices.createTable();
Invoices.createInvoiceItem();

module.exports = Invoices;
