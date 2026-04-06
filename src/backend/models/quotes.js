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
  insertQuote: (status,customer,customer_email, islater, billing_address,start_date,last_date,message,statement_message,number,entered_by,vat,quoteLines) => {
    try {
    const stmt = db.prepare('INSERT INTO quotes (status,customer,customer_email, islater, billing_address,start_date,last_date,message,statement_message,number,entered_by,vat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = stmt.run(
      String(status || 'Open'),
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
      const linesArr = Array.isArray(quoteLines) ? quoteLines : [];
      if (linesArr.length > 0) {
        const quoteLineStmt = db.prepare('INSERT INTO quote_lines (quote_id, product, description,quantity,rate, amount) VALUES (?, ?, ?, ?, ?, ?)');
        for (const line of linesArr) {
          quoteLineStmt.run(
            quoteId,
            line.product_id || line.product || null,
            String(line.description || ''),
            Number(line.quantity) || 1,
            Number(line.rate) || 0,
            Number(line.amount) || 0
          );
        }
      }
      // Auto-generate quote number if not provided
      if (!number || number === '') {
        const formattedNumber = `QUO-${String(Number(quoteId)).padStart(5, '0')}`;
        db.prepare('UPDATE quotes SET number = ? WHERE id = ?').run(formattedNumber, quoteId);
      }
      return { success: true, quoteId: Number(quoteId) }; 
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
          customers.first_name || ' ' || customers.last_name AS customer_name, 
          quotes.status, 
          quotes.start_date, 
          quotes.last_date, 
          COALESCE(SUM(quote_lines.amount * quote_lines.quantity), 0) AS amount, 
          quotes.vat,
          quotes.customer_email, 
          quotes.message, 
          quotes.statement_message, 
          quotes.billing_address 
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

  getPaginated: (page = 1, pageSize = 25, search = '', status = '') => {
    const offset = (Math.max(1, page) - 1) * Math.max(1, pageSize);
    const limit = Math.max(1, Math.min(500, pageSize));
    const baseSql = `SELECT quotes.id, quotes.number, quotes.customer, customers.first_name || ' ' || customers.last_name AS customer_name, quotes.status, quotes.start_date, quotes.last_date, COALESCE(SUM(quote_lines.amount * quote_lines.quantity), 0) AS amount, quotes.vat, quotes.customer_email, quotes.message, quotes.statement_message, quotes.billing_address FROM quotes LEFT JOIN quote_lines ON quote_lines.quote_id = quotes.id LEFT JOIN customers ON quotes.customer = customers.id`;
    const searchParam = search && search.trim() ? `%${search.trim()}%` : null;
    const statusParam = status && status.trim() ? status.trim() : null;
    const whereParts = [];
    const params = [];
    if (searchParam) {
      whereParts.push(`(customers.first_name || ' ' || customers.last_name LIKE ? OR quotes.number LIKE ?)`);
      params.push(searchParam, searchParam);
    }
    if (statusParam) {
      whereParts.push(`quotes.status = ?`);
      params.push(statusParam);
    }
    const whereClause = whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : '';
    const groupOrder = ` GROUP BY quotes.id, customers.first_name, customers.last_name, quotes.status, quotes.start_date, quotes.last_date, quotes.vat, quotes.customer_email, quotes.message, quotes.statement_message, quotes.billing_address ORDER BY quotes.id DESC`;
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
        customers.first_name, customers.last_name, customers.phone_number, customers.mobile_number,
        quotes.status, quotes.customer_email, quotes.islater, quotes.billing_address,
        quotes.start_date, quotes.last_date, quotes.message, quotes.statement_message,
        quotes.number, quotes.vat, quotes.entered_by, quotes.date_entered,
        quote_lines.id AS line_id, quote_lines.amount, quote_lines.description,
        quote_lines.product, quote_lines.quantity, quote_lines.rate
      FROM quotes
      LEFT JOIN quote_lines ON quote_lines.quote_id = quotes.id
      LEFT JOIN customers ON quotes.customer = customers.id
      WHERE quotes.id = ?`);
  
    const rows = stmt.all(quote_id);
    if (!rows || rows.length === 0) return null;
  
    const first = rows[0];
    const result = {
      quote_id: first.quote_id,
      customer_id: first.customer_id,
      customer: first.customer_id,
      first_name: first.first_name,
      last_name: first.last_name,
      phone_number: first.phone_number,
      mobile_number: first.mobile_number,
      status: first.status,
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
      lines: [],
    };
    for (const row of rows) {
      if (row.line_id) {
        result.lines.push({ id: row.line_id, amount: row.amount, description: row.description, quantity: row.quantity, product_id: row.product, rate: row.rate });
      }
    }
    return result;
  },

  updateQuote : async (quoteData) => {
    const { id, lines, quoteLines, ...quoteDetails } = quoteData;
    const lineItems = lines || quoteLines || [];

    try {
      db.prepare(
        `UPDATE quotes
         SET customer = ?, customer_email = ?, islater = ?, billing_address = ?, 
             start_date = ?, last_date = ?, number = ?, vat = ?, 
             message = ?, statement_message = ?, status = ?
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
          String(quoteDetails.status || 'Open'),
          Number(id)
      );
  
      // Delete existing lines for the quote
      db.prepare(`DELETE FROM quote_lines WHERE quote_id = ?`).run(Number(id));
  
      // Insert updated lines
      const insertLine = db.prepare(
        `INSERT INTO quote_lines (quote_id, product, description, quantity, rate, amount)
         VALUES (?, ?, ?, ?, ?, ?)`);
      for (const line of lineItems) {
        insertLine.run(
          Number(id),
          line.product_id || line.product || null,
          String(line.description || ''),
          Number(line.quantity) || 1,
          Number(line.rate) || 0,
          Number(line.amount) || 0
        );
      }
  
      return { success: true, message: 'Quote updated successfully.' };
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
        // Insert into invoices table (include status, last_date, message, statement_message, linked_quote)
        const invoice_stmt = db.prepare(`
          INSERT INTO invoices (customer, customer_email, islater, billing_address, terms, start_date, last_date, message, statement_message, number, entered_by, vat, status, linked_quote)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
  
        const result = invoice_stmt.run(
          Number(quote.customer) || 0,
          String(quote.customer_email || ''),
          quote.islater ? 1 : 0,
          String(quote.billing_address || ''),
          String(quote.terms || ''),
          new Date().toISOString().split('T')[0],
          String(quote.last_date || ''),
          String(quote.message || ''),
          String(quote.statement_message || ''),
          '',
          quote.entered_by != null ? String(quote.entered_by) : null,
          Number(quote.vat) || 0,
          'Pending',
          Number(quote.id)
        );
  
        const invoice_id = result.lastInsertRowid;
        const formatted_invoice_number = `INV-${String(invoice_id).padStart(5, '0')}`;
  
        // Update the invoice number
        db.prepare(`UPDATE invoices SET number = ? WHERE id = ?`).run(formatted_invoice_number, invoice_id);
  
        // Update linked_invoice in the quotes table
        db.prepare(`UPDATE quotes SET linked_invoice = ?, status = ? WHERE id = ?`).run(invoice_id, 'Invoiced', quote_id);
  
        // Insert into invoice_lines table
        const invoice_lines_stmt = db.prepare(`
          INSERT INTO invoice_lines (invoice_id, product, description, quantity, rate, amount) VALUES (?, ?, ?, ?, ?, ?)`);
  
        let totalAmount = 0;
        for (const line of quote_lines) {
          invoice_lines_stmt.run(
            invoice_id,
            line.product,
            line.description,
            line.quantity,
            line.rate,
            line.amount
          );
          totalAmount += (Number(line.amount) || 0) * (Number(line.quantity) || 1);
        }

        // Set balance on the new invoice (total with VAT)
        const vatRate = Number(quote.vat) || 0;
        const balance = totalAmount * (1 + vatRate / 100);
        db.prepare(`UPDATE invoices SET balance = ? WHERE id = ?`).run(balance, invoice_id);

        return invoice_id;
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
