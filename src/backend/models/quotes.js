// src/backend/models/Quotes.js
const db = require('./dbmgr.js');

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
  }, 
  
  // Insert a new Quotes
  insertQuote: async (status,customer,customer_email, islater, billing_address,start_date,last_date,message,statement_message,number,entered_by,vat,quoteLines) => {
    try {
    const stmt = db.prepare('INSERT INTO quotes (status,customer,customer_email, islater, billing_address,start_date,last_date,message,statement_message,number,entered_by,vat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(status,customer,customer_email, islater, billing_address,start_date,last_date,message,statement_message,number,entered_by,vat);

    if (result.changes > 0) {
      const quoteId = result.lastInsertRowid;
      const quoteLineStmt = db.prepare('INSERT INTO quote_lines (quote_id, product, description,quantity,rate, amount) VALUES (?, ?, ?, ?, ?, ?)');
      for (const line of quoteLines) {
        await quoteLineStmt.run(quoteId, line.product, line.description,line.quantity,line.rate, line.amount);
      }
      return { success: true, quoteId }; 
    } 
      else {
        return { success: false };
      }
    } catch (error) {
      console.error("Error inserting Quote:", error);
      return { success: false };
    }
  },

  // Retrieve all Quotes
  getAllQuotes: () => {
    const stmt = db.prepare(`
      SELECT 
          quotes.id, 
          quotes.number,
          quotes.customer, 
          customers.first_name || ' ' || customers.last_name AS customer_name, 
          quotes.status, 
          quotes.start_date, 
          quotes.last_date, 
          SUM(quote_lines.amount *quote_lines.quantity) AS amount, 
          quotes.vat,
          quotes.customer_email, 
          quotes.message, 
          quotes.statement_message, 
          quotes.billing_address 
      FROM 
          quote_lines 
      INNER JOIN 
          quotes 
      ON 
          quote_lines.quote_id = quotes.id 
      INNER JOIN 
          customers 
      ON 
          quotes.customer = customers.id 
      GROUP BY 
          quotes.id, 
          customers.first_name, 
          customers.last_name, 
          quotes.status, 
          quotes.start_date, 
          quotes.last_date, 
          quotes.vat, 
          quotes.customer_email, 
          quotes.message, 
          quotes.statement_message, 
          quotes.billing_address 
      ORDER BY 
          quotes.id
          Desc
  `);
  
    return stmt.all();
  },
  getSingleQuote: (quote_id) => {
    const stmt = db.prepare(`SELECT quotes.id as quote_id, customers.first_name, customers.last_name,customers.phone_number, customers.mobile_number, quotes.status, quotes.customer_email, quotes.islater, quotes.billing_address,
        quotes.start_date, quotes.last_date, quotes.message, quotes.statement_message, quotes.number, quotes.vat, quotes.entered_by, quotes.date_entered, quote_lines.id AS line_id,
        quote_lines.amount, quote_lines.description, quote_lines.product, quote_lines.quantity, quote_lines.rate FROM quote_lines INNER JOIN quotes ON quote_lines.quote_id = quotes.id INNER JOIN customers ON quotes.customer = customers.id WHERE quotes.id = ?`);
  
    const rows = stmt.all(quote_id);
  
    const groupedData = rows.reduce((acc, row) => {
      const {quote_id, first_name, last_name, phone_number, mobile_number, status, vat, customer_email, islater, billing_address, start_date, last_date, message, statement_message, number, entered_by, date_entered,
        line_id, amount, description,quantity, product, rate, } = row;
  
      if (!acc) {
        acc = {quote_id, first_name, last_name, phone_number, mobile_number, status, vat, customer_email, islater, billing_address, start_date, last_date, message, statement_message, number, entered_by,
          date_entered, lines: [], };
      }
      acc.lines.push({ id: line_id, amount, description, quantity, product, rate,});
      return acc;
    }, null);
  
    return groupedData;
  },

  updateQuote : async (quoteData) => {
    const { id, lines, ...quoteDetails } = quoteData;

    try {
      // Update the main quote details
      await db.prepare(
        `UPDATE quotes
         SET customer = ?, customer_email = ?, islater = ?, billing_address = ?, 
             start_date = ?, last_date = ?, number = ?, vat = ?, 
             message = ?, statement_message = ?, status = ?
         WHERE id = ?`).run(
        [
          quoteDetails.customer,
          quoteDetails.customer_email,
          quoteDetails.islater ? 1 : 0,
          quoteDetails.billing_address,
          quoteDetails.start_date,
          quoteDetails.last_date,
          quoteDetails.number,
          quoteDetails.vat,
          quoteDetails.message,          
          quoteDetails.statement_message,
          quoteDetails.status,
          id,
        ]
      );
  
      // Delete existing lines for the quote
      await db.prepare(`DELETE FROM quote_lines WHERE quote_id = ?`, [id]);
  
      // Insert updated lines
      for (const line of lines) {
        await db.prepare(
          `INSERT INTO quote_lines (quote_id, product, description, quantity, rate, amount)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, line.product, line.description, line.quantity, line.rate, line.amount]
        );
      }
  
      return { success: true, message: 'quote updated successfully.' };
    } catch (error) {
      console.error('Error updating quote:', error);
      throw error;
    }
  },
  
  convertToInvoice: (quote_id) => {
    try {
      // Fetch quote data
      const quote_stmt = db.prepare(`SELECT * FROM quotes WHERE id = ?`);
      const quote = quote_stmt.get(quote_id);
  
      if (!quote) {
        throw new Error(`Quote with ID ${quote_id} not found.`);
      }
  
      // Fetch quote lines data
      const quote_lines_stmt = db.prepare(`SELECT * FROM quote_lines WHERE quote_id = ?`);
      const quote_lines = quote_lines_stmt.all(quote_id);
  
      // Begin transaction
      const transaction = db.transaction(() => {
        // Insert into invoices table
        const invoice_stmt = db.prepare(`
          INSERT INTO invoices (customer, customer_email, islater, billing_address, terms, start_date, number, entered_by, vat, linked_quote)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
  
        const result = invoice_stmt.run(
          quote.customer,
          quote.customer_email,
          quote.islater,
          quote.billing_address,
          quote.terms,
          new Date().toISOString().split('T')[0], // Current date as ISO string
          0,
          quote.entered_by,
          quote.vat,
          quote.id
        );
  
        const invoice_id = result.lastInsertRowid;
        const formatted_invoice_number = `INV-${String(invoice_id).padStart(5, '0')}`;
  
        // Update the invoice number
        const update_invoice_number_stmt = db.prepare(`
          UPDATE invoices SET number = ? WHERE id = ?
        `);
        update_invoice_number_stmt.run(formatted_invoice_number, invoice_id);
  
        // Update linked_invoice in the quotes table
        const update_quote_stmt = db.prepare(`
          UPDATE quotes SET linked_invoice = ?, status = ? WHERE id = ?
        `);
        update_quote_stmt.run(invoice_id,'Invoiced', quote_id);
  
        // Insert into invoice_lines table
        const invoice_lines_stmt = db.prepare(`
          INSERT INTO invoice_lines (invoice_id, product, description,quantity,rate, amount) VALUES (?, ?, ?, ?, ?, ?)`);
  
        for (const line of quote_lines) {
          invoice_lines_stmt.run(
            invoice_id,
            line.product,
            line.description,
            line.quantity,
            line.rate,
            line.amount
          );
        }
      });
  
      // Execute transaction
      transaction();
  
      console.log(`Quote ${quote_id} successfully converted to Invoice.`);
      return { success: true, message: 'successfully converted to Invoice.' };
    } catch (error) {
      console.error('Error converting quote to invoice:', error);
      throw error;
    }
  
  },
};

// Ensure the Quotes table is created
Quotes.createTable();
Quotes.createQuoteItem();

module.exports = Quotes;
