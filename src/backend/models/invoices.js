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
    balance REAL DEFAULT 0,
    linked_invoice TEXT,
	entered_by	TEXT,
	date_entered DATETIME DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(id AUTOINCREMENT),
  FOREIGN KEY (customer) REFERENCES customers(id)
      )
    `;
    db.prepare(stmt).run();
    // Migration: ensure additional columns exist on older DBs
    try {
      const colInfo = db.prepare("PRAGMA table_info(invoices)").all();
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
            const sumLines = db.prepare('SELECT COALESCE(SUM(amount * quantity),0) as total FROM invoice_lines WHERE invoice_id = ?').get(row.id).total;
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
  }, 
  
  // Insert a new Invoices
  insertInvoice: (customer,customer_email,islater, billing_address, terms,start_date,last_date,message,statement_message,number,entered_by,vat,status,invoiceLines) => {
    try {
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
      String(status || 'Draft')
    );

    if (result.changes > 0) {
      const invoiceId = result.lastInsertRowid;
      const linesArr = Array.isArray(invoiceLines) ? invoiceLines : [];
      if (linesArr.length > 0) {
        const invoiceLineStmt = db.prepare('INSERT INTO invoice_lines (invoice_id, product, description,quantity,rate, amount) VALUES (?, ?, ?, ?, ?, ?)');
        for (const line of linesArr) {
          invoiceLineStmt.run(
            invoiceId,
            line.product_id || line.product || null,
            String(line.description || ''),
            Number(line.quantity) || 1,
            Number(line.rate) || 0,
            Number(line.amount) || 0
          );
        }
      }
      // Auto-generate invoice number if not provided
      if (!number || number === '') {
        const formattedNumber = `INV-${String(Number(invoiceId)).padStart(5, '0')}`;
        db.prepare('UPDATE invoices SET number = ? WHERE id = ?').run(formattedNumber, invoiceId);
      }
      // Compute and set balance (line totals + VAT)
      const lineSum = linesArr.reduce((s, l) => s + (Number(l.amount) || 0) * (Number(l.quantity) || 1), 0);
      const balance = lineSum * (1 + (Number(vat) || 0) / 100);
      db.prepare('UPDATE invoices SET balance = ? WHERE id = ?').run(balance, invoiceId);
      return { success: true, invoiceId: Number(invoiceId) }; 
    } 
      else {
        return { success: false };
      }
    } catch (error) {
      console.error("Error inserting Invoice:", error);
      return { success: false, error: error.message || String(error) };
    }
  },

  // Retrieve all Invoices
  getAllInvoices: function () {
    const stmt = db.prepare("SELECT invoices.id, invoices.number, invoices.customer, customers.first_name || ' ' || customers.last_name AS customer_name, invoices.customer_email, invoices.status, invoices.start_date, invoices.last_date, COALESCE(SUM(invoice_lines.amount * invoice_lines.quantity), 0) AS amount, invoices.vat, invoices.terms, invoices.message, invoices.statement_message, invoices.billing_address FROM invoices LEFT JOIN invoice_lines ON invoice_lines.invoice_id = invoices.id LEFT JOIN customers ON invoices.customer = customers.id GROUP BY invoices.id ORDER BY invoices.id DESC");
    const report = this.getInvoiceReport();
    return {all:stmt.all(), report:report};
  },

  getPaginated: function (page = 1, pageSize = 25, search = '', status = '') {
    const offset = (Math.max(1, page) - 1) * Math.max(1, pageSize);
    const limit = Math.max(1, Math.min(500, pageSize));
    const baseSql = `SELECT invoices.id, invoices.number, invoices.customer, customers.first_name || ' ' || customers.last_name AS customer_name, invoices.customer_email, invoices.status, invoices.start_date, invoices.last_date, COALESCE(SUM(invoice_lines.amount * invoice_lines.quantity), 0) AS amount, invoices.vat, invoices.terms, invoices.message, invoices.statement_message, invoices.billing_address FROM invoices LEFT JOIN invoice_lines ON invoice_lines.invoice_id = invoices.id LEFT JOIN customers ON invoices.customer = customers.id`;
    const searchParam = search && search.trim() ? `%${search.trim()}%` : null;
    const statusParam = status && status.trim() ? status.trim() : null;
    const whereParts = [];
    const params = [];
    if (searchParam) {
      whereParts.push(`(customers.first_name || ' ' || customers.last_name LIKE ? OR invoices.number LIKE ?)`);
      params.push(searchParam, searchParam);
    }
    if (statusParam) {
      whereParts.push(`invoices.status = ?`);
      params.push(statusParam);
    }
    const whereClause = whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : '';
    const groupOrder = ` GROUP BY invoices.id, customers.first_name, customers.last_name, invoices.status, invoices.start_date, invoices.last_date ORDER BY invoices.id DESC`;
    let total;
    if (params.length) {
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
    const stmt_open = db.prepare("SELECT COUNT(DISTINCT i.id) AS open_invoice,SUM(l.amount * l.quantity + ((l.amount * l.quantity)*i.vat/100)) AS open_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status IN ('Pending','Partially Paid','Sent','Unpaid') ");
    const stmt_due = db.prepare("SELECT COUNT(DISTINCT i.id) AS due_invoice,SUM(l.amount * l.quantity + ((l.amount * l.quantity)*i.vat/100)) AS due_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status IN ('Pending','Partially Paid','Sent','Unpaid') AND i.last_date < ?");
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
    const stmt_open = db.prepare("SELECT COUNT(DISTINCT i.id) AS open_invoice,SUM(l.amount * l.quantity + ((l.amount * l.quantity)*i.vat/100)) AS open_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status IN ('Pending','Partially Paid','Sent','Unpaid') ");
    const stmt_due = db.prepare("SELECT COUNT(DISTINCT i.id) AS due_invoice,SUM(l.amount * l.quantity + ((l.amount * l.quantity)*i.vat/100)) AS due_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status IN ('Pending','Partially Paid','Sent','Unpaid') AND i.last_date < ?");
    const stmt_paid = db.prepare("SELECT COUNT(DISTINCT i.id) AS paid_invoice,SUM(l.amount * l.quantity + ((l.amount * l.quantity)*i.vat/100)) AS paid_total_amount FROM invoice_lines AS l INNER JOIN invoices AS i ON l.invoice_id = i.id WHERE i.status = 'Paid' ");

    // Recently paid invoices (last 30 days) — based on payment date
    const stmt_recently_paid = db.prepare(`
      SELECT COUNT(DISTINCT i.id) AS recently_paid_count,
             COALESCE(SUM(l.amount * l.quantity + ((l.amount * l.quantity)*i.vat/100)), 0) AS recently_paid_amount
      FROM invoice_lines AS l
      INNER JOIN invoices AS i ON l.invoice_id = i.id
      WHERE i.status = 'Paid' AND i.start_date >= date('now', '-30 days')
    `);

    // Deposited: total payments that have been recorded (from payments table)
    let deposited = [{ deposited_amount: 0 }];
    try {
      deposited = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS deposited_amount FROM payments`).all();
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

    // Deposited amount = total payments recorded
    const deposited_amount = Number(deposited?.[0]?.deposited_amount) || 0;
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
             SUM(l.amount * l.quantity * (1 + i.vat/100)) AS not_due_total_amount 
      FROM invoice_lines AS l 
      INNER JOIN invoices AS i ON l.invoice_id = i.id 
      WHERE i.status IN ('Pending','Partially Paid','Sent','Unpaid') AND i.last_date > ?`);

    // Open expenses (pending approval)
    const stmt_open_expense = db.prepare(`
      SELECT COUNT(DISTINCT e.id) AS open_expense,
             SUM(l.amount) AS open_total_amount_expense 
      FROM expense_lines AS l 
      INNER JOIN expenses AS e ON l.expense_id = e.id 
      WHERE e.approval_status = 'Pending'`);

    // Due expenses (pending and overdue)
    const stmt_due_expense = db.prepare(`
      SELECT COUNT(DISTINCT e.id) AS due_expense,
             SUM(l.amount) AS due_total_amount_expense 
      FROM expense_lines AS l 
      INNER JOIN expenses AS e ON l.expense_id = e.id 
      WHERE e.approval_status = 'Pending' AND e.payment_date < ?`);

    // Due quotes
    const stmt_quote = db.prepare(`
      SELECT COUNT(DISTINCT i.id) AS due_quote,
             SUM(l.amount * l.quantity * (1 + i.vat/100)) AS due_total_amount 
      FROM quote_lines AS l 
      INNER JOIN quotes AS i ON l.quote_id = i.id 
      WHERE i.status = 'Pending' AND i.last_date < ?`);
    
    // Invoice trends with comprehensive metrics
    const stmt_invoicetrend = db.prepare(`
      SELECT 
        strftime('%Y-%m', i.start_date) AS name,
        COUNT(DISTINCT i.id) AS number,
        SUM(l.amount * l.quantity * (1 + i.vat/100)) as revenue_total_amount,
        SUM(CASE WHEN i.status = 'Paid' THEN l.amount * l.quantity * (1 + i.vat/100) ELSE 0 END) as paid_amount,
        SUM(CASE WHEN i.status IN ('Pending','Partially Paid','Sent','Unpaid') THEN l.amount * l.quantity * (1 + i.vat/100) ELSE 0 END) as pending_amount,
        COUNT(DISTINCT CASE WHEN i.status = 'Paid' THEN i.id END) as paid_count,
        COUNT(DISTINCT CASE WHEN i.status IN ('Pending','Partially Paid','Sent','Unpaid') THEN i.id END) as pending_count,
        AVG(l.amount * l.quantity * (1 + i.vat/100)) as avg_invoice_value
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
          SUM(l.amount * l.quantity * (1 + i.vat/100)) as revenue,
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
          THEN (SELECT SUM(amount * quantity * (1 + vat/100)) 
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
    const invoicetrend = stmt_invoicetrend.all();
    const customertrend = stmt_customertrend.all();
    const suppliertrend = stmt_suppliertrend.all();
    const expenselist = stmt_expenselist.all();

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
    
    return {
      // Original metrics
      open_invoice,
      due_invoice,
      open_expense,
      due_expense,
      due_quote,
      invoicetrend,
      customertrend,
      suppliertrend,
      due_not_invoice,
      paid_invoice,
      report,

      // Enhanced metrics
      expenseAnalysis: enhancedExpenseList,
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
        invoice_lines.id AS line_id, invoice_lines.amount, invoice_lines.description,
        invoice_lines.product, invoice_lines.quantity, invoice_lines.rate
      FROM invoices
      LEFT JOIN invoice_lines ON invoice_lines.invoice_id = invoices.id
      LEFT JOIN customers ON invoices.customer = customers.id
      WHERE invoices.id = ?`);
  
    const rows = stmt.all(invoice_id);
    if (!rows || rows.length === 0) return null;
  
    const first = rows[0];
    const result = {
      invoice_id: first.invoice_id,
      customer_id: first.customer_id,
      customer: first.customer_id,
      terms: first.terms,
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
    const lineItems = lines || invoiceLines || [];

    try {
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
          String(invoiceDetails.status || 'Draft'),
          Number(id)
      );
  
      // Delete existing lines for the invoice
      db.prepare(`DELETE FROM invoice_lines WHERE invoice_id = ?`).run(Number(id));
  
      // Insert updated lines
      const insertLine = db.prepare(
        `INSERT INTO invoice_lines (invoice_id, product, description, quantity, rate, amount)
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
  
      // Recalculate balance (line totals + VAT - existing payments)
      const lineSum = lineItems.reduce((s, l) => s + (Number(l.amount) || 0) * (Number(l.quantity) || 1), 0);
      const invoiceTotal = lineSum * (1 + (Number(invoiceDetails.vat) || 0) / 100);
      let totalPaid = 0;
      try {
        const paidRow = db.prepare('SELECT COALESCE(SUM(amount), 0) AS totalPaid FROM payments WHERE invoiceId = ?').get(Number(id));
        totalPaid = Number(paidRow?.totalPaid) || 0;
      } catch (_) {}
      const balance = Math.max(0, invoiceTotal - totalPaid);
      db.prepare('UPDATE invoices SET balance = ? WHERE id = ?').run(balance, Number(id));

      return { success: true, message: 'Invoice updated successfully.' };
    } catch (error) {
      console.error('Error updating invoice:', error);
      throw error;
    }
  },
  deleteInvoice: async (id) => {
    try {
      const transaction = db.transaction((invoiceId) => {
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
  getFinancialReport: function (start_date, last_date) {
    try {
      // Use LEFT JOINs and COALESCE to avoid nulls when product mapping isn't present
      const stmt_revenue = db.prepare(
        `SELECT 
           COALESCE(SUM(l.amount * l.quantity + ((l.amount * l.quantity) * i.vat / 100)), 0) AS revenue_total_amount,
           COALESCE(SUM(COALESCE(p.price,0) * l.quantity), 0) AS product_total_amount
         FROM invoice_lines AS l
         LEFT JOIN products AS p ON l.product = p.id OR l.product = p.name
         INNER JOIN invoices AS i ON l.invoice_id = i.id
         WHERE i.status IN ('Paid', 'Partially Paid') AND i.start_date BETWEEN ? AND ?`
      );

      const stmt_expense = db.prepare(
        `SELECT COALESCE(SUM(l.amount), 0) AS expense_total_amount
         FROM expense_lines AS l
         INNER JOIN expenses AS e ON l.expense_id = e.id
         WHERE e.approval_status IN ('Paid', 'Pending') AND e.payment_date BETWEEN ? AND ?`
      );

      const revenue = stmt_revenue.get(start_date, last_date) || { revenue_total_amount: 0, product_total_amount: 0 };
      const expense = stmt_expense.get(start_date, last_date) || { expense_total_amount: 0 };

      // Ensure numeric values
      const revenueTotal = Number(revenue.revenue_total_amount) || 0;
      const productTotal = Number(revenue.product_total_amount) || 0;
      const expenseTotal = Number(expense.expense_total_amount) || 0;

      const grossProfit = revenueTotal - productTotal;
      const netProfit = grossProfit - expenseTotal;

      return {
        profitLoss: {
          revenue: revenueTotal,
          cogs: productTotal,
          operatingExpenses: expenseTotal,
          grossProfit: grossProfit,
          netProfit: netProfit,
        },
        balanceSheet: {
          assets: {
            cash: grossProfit - expenseTotal,
            accountsReceivable: 0,
            inventory: 0,
            total: (grossProfit - expenseTotal),
          },
          liabilities: {
            accountsPayable: expenseTotal,
            shortTermDebt: 0,
            total: expenseTotal,
          },
          equity: {
            retainedEarnings: 0,
            shareholderEquity: 0,
            total: 0,
          },
        },
        cashFlow: {
          operating: grossProfit - expenseTotal,
          investing: 0,
          financing: 0,
          netCashFlow: grossProfit - expenseTotal,
        },
      };
    } catch (error) {
      console.error('Error fetching report:', error);
      throw error;
    }

  },
  getManagementReport: function (start_date, last_date) {
    try {
      const formattedNumber = (number) => { 
        const num = new Intl.NumberFormat('fr-FR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
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
        LEFT JOIN (SELECT invoice_id, SUM(amount * quantity) AS totalAmount FROM invoice_lines GROUP BY invoice_id) lt ON lt.invoice_id = i.id
        LEFT JOIN (SELECT invoiceId, SUM(amount) AS totalPaid FROM payments GROUP BY invoiceId) pt ON pt.invoiceId = i.id
        WHERE i.status IS NULL OR i.status NOT IN ('Paid')
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
  }
};

// Ensure the Invoices table is created
Invoices.createTable();
Invoices.createInvoiceItem();

module.exports = Invoices;
