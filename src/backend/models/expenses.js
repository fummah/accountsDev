// src/backend/models/Expenses.js
const db = require('./dbmgr.js');

const Expenses = {
  // Create the Expenses table if it doesn't exist
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS expenses (
    id	INTEGER,
    payee	INTEGER NOT NULL,
	payment_account	TEXT NOT NULL,
    payment_date	TEXT,
	payment_method	TEXT,
    ref_no	TEXT,
    category	TEXT,
    approval_status TEXT DEFAULT 'Pending',
	entered_by	TEXT,
	date_entered DATETIME DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(id AUTOINCREMENT)
      )
    `;
    db.prepare(stmt).run();
    // Migration for multi-currency support
    try {
      const colInfo = db.prepare("PRAGMA table_info(expenses)").all();
      const hasCurrency = colInfo.some(c => c.name === 'currency');
      const hasFx = colInfo.some(c => c.name === 'fxRate');
      if (!hasCurrency) {
        db.prepare('ALTER TABLE expenses ADD COLUMN currency TEXT').run();
      }
      if (!hasFx) {
        db.prepare('ALTER TABLE expenses ADD COLUMN fxRate REAL DEFAULT 1.0').run();
      }
    } catch (e) {
      console.error('[expenses] migration failed:', e);
    }
  }, 
  createExpenseItem: () => {
    const stmt = `
     CREATE TABLE IF NOT EXISTS expense_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    date_entered DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (expense_id) REFERENCES expenses(id)
  )`;
    db.prepare(stmt).run();
  }, 
  
  // Insert a new Expenses
  insertExpense: async (payee,payment_account,payment_date, payment_method, ref_no,category,entered_by,approval_status,expenseLines) => {
    try {
    const stmt = db.prepare('INSERT INTO expenses (payee,payment_account,payment_date, payment_method, ref_no,category,entered_by,approval_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(payee,payment_account,payment_date, payment_method, ref_no,category,entered_by,approval_status);

    if (result.changes > 0) {
      const expenseId = result.lastInsertRowid;
      const expenseLineStmt = db.prepare('INSERT INTO expense_lines (expense_id, category, description, amount) VALUES (?, ?, ?, ?)');
      for (const line of expenseLines) {
        await expenseLineStmt.run(expenseId, line.category, line.description, line.amount);
      }
      // Also create a transaction record for the expense so it appears in transactions lists
      try {
        const totalAmount = expenseLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
        // Insert a transaction: debit the expense (amount), credit will be null (or handled by ledger later)
        const txStmt = db.prepare(`INSERT INTO transactions (date, type, amount, description, status, accountId, reference, debit, credit, entered_by) VALUES (?, ?, ?, ?, 'Active', ?, ?, ?, ?, ?)`);
        // accountId is null (payment_account is text); leave as NULL
        await txStmt.run(payment_date, 'Expense', totalAmount, category || 'Expense', null, ref_no || '', totalAmount, null, entered_by || null);
      } catch (txErr) {
        console.error('Failed to create transaction for expense:', txErr);
        // proceed — expense was created; return success but include warning
        return { success: true, expenseId, warning: 'expense_created_but_transaction_failed' };
      }

      return { success: true, expenseId,result };
    } 
      else {
        return { success: false };
      }
    } catch (error) {
      console.error("Error inserting Expense:", error);
      return { success: false };
    }
  },
  

  // Retrieve all Expenses
  getAllExpenses: () => {
    const stmt = db.prepare("SELECT e.id, e.category, e.payment_date,e.payment_method, e.ref_no, e.payment_account, e.approval_status,e.payee,COALESCE(SUM(el.amount), 0) AS amount, CASE WHEN e.category = 'customer' THEN c.first_name WHEN e.category = 'supplier' THEN s.first_name WHEN e.category = 'employee' THEN emp.first_name ELSE NULL END AS payee_name  FROM expenses e LEFT JOIN customers c ON e.payee = c.id AND e.category = 'customer' LEFT JOIN suppliers s ON e.payee = s.id AND e.category = 'supplier' LEFT JOIN employees emp ON e.payee = emp.id AND e.category = 'employee' LEFT JOIN expense_lines el ON e.id = el.expense_id GROUP BY e.id, e.category, e.payment_date, e.payment_method, e.payment_account, e.ref_no, e.approval_status, c.first_name,payee, s.first_name, emp.first_name ORDER BY e.id DESC");
    return stmt.all();
  },

  getPaginated: (page = 1, pageSize = 25, search = '') => {
    const offset = (Math.max(1, page) - 1) * Math.max(1, pageSize);
    const limit = Math.max(1, Math.min(500, pageSize));
    const baseSql = "SELECT e.id, e.category, e.payment_date, e.payment_method, e.ref_no, e.payment_account, e.approval_status, e.payee, COALESCE(SUM(el.amount), 0) AS amount, CASE WHEN e.category = 'customer' THEN c.first_name WHEN e.category = 'supplier' THEN s.first_name WHEN e.category = 'employee' THEN emp.first_name ELSE NULL END AS payee_name FROM expenses e LEFT JOIN customers c ON e.payee = c.id AND e.category = 'customer' LEFT JOIN suppliers s ON e.payee = s.id AND e.category = 'supplier' LEFT JOIN employees emp ON e.payee = emp.id AND e.category = 'employee' LEFT JOIN expense_lines el ON e.id = el.expense_id";
    const whereClause = search && search.trim() ? " WHERE (e.ref_no LIKE ? OR e.payment_method LIKE ? OR c.first_name LIKE ? OR s.first_name LIKE ? OR emp.first_name LIKE ?)" : '';
    const groupOrder = " GROUP BY e.id, e.category, e.payment_date, e.payment_method, e.payment_account, e.ref_no, e.approval_status, c.first_name, e.payee, s.first_name, emp.first_name ORDER BY e.id DESC";
    const searchParam = search && search.trim() ? `%${search.trim()}%` : null;
    const total = searchParam
      ? db.prepare(`SELECT COUNT(*) AS total FROM (${baseSql}${whereClause}${groupOrder})`).get(searchParam, searchParam, searchParam, searchParam, searchParam).total
      : db.prepare('SELECT COUNT(*) AS total FROM expenses').get().total;
    const dataSql = `${baseSql}${whereClause}${groupOrder} LIMIT ? OFFSET ?`;
    const data = searchParam ? db.prepare(dataSql).all(searchParam, searchParam, searchParam, searchParam, searchParam, limit, offset) : db.prepare(baseSql + groupOrder + ' LIMIT ? OFFSET ?').all(limit, offset);
    return { data, total };
  },
  updateExpense : async (expenseData) => {
    const { id, lines, ...expenseDetails } = expenseData;

    try {
      // Update the main expense details
      await db.prepare(
        `UPDATE expenses
         SET payee = ?, payment_account = ?, payment_date = ?, payment_method = ?, 
             ref_no = ?, category = ?, approval_status = ?
         WHERE id = ?`).run(
        [
          expenseDetails.payee,
          expenseDetails.payment_account,
          expenseDetails.payment_date,
          expenseDetails.payment_method,
          expenseDetails.ref_no,
          expenseDetails.category,
          expenseDetails.approval_status,
          id,
        ]
      );
  
      // Delete existing lines for the expense
      await db.prepare(`DELETE FROM expense_lines WHERE expense_id = ?`).run([id]);
  
      // Insert updated lines
      for (const line of lines) {
        await db.prepare(
          `INSERT INTO expense_lines (expense_id, category, description, amount) VALUES (?, ?, ?, ?)`).run(
          [id, line.category, line.description, line.amount]
        );
      }
  
      return { success: true, message: 'Expense updated successfully.' };
    } catch (error) {
      console.error('Error updating expense:', error);
      throw error;
    }
  }
  ,

  // Accounts Payable Aging (approximate from expenses marked Pending)
  getAPAging: function(referenceDate) {
    try {
      const today = referenceDate || new Date().toISOString().slice(0,10);
      // Pull expenses with pending status and sum lines
      const rows = db.prepare(`
        SELECT 
          e.id as expenseId,
          e.payment_date as dueDate,
          e.category,
          e.payee as supplierId,
          CASE WHEN e.category = 'supplier'
               THEN (SELECT first_name || ' ' || last_name FROM suppliers s WHERE s.id = e.payee)
               ELSE e.category
          END AS supplierName,
          COALESCE((SELECT SUM(el.amount) FROM expense_lines el WHERE el.expense_id = e.id), 0) AS totalAmount
        FROM expenses e
        WHERE (e.approval_status IS NULL OR LOWER(e.approval_status) IN ('pending'))
      `).all();

      const enriched = rows.map(r => {
        const amount = Number(r.totalAmount) || 0;
        const daysPastDue = r.dueDate ? Math.floor((new Date(today) - new Date(r.dueDate)) / (1000*60*60*24)) : 0;
        const bucket = daysPastDue <= 0 ? 'current'
                    : daysPastDue <= 30 ? '1-30'
                    : daysPastDue <= 60 ? '31-60'
                    : daysPastDue <= 90 ? '61-90'
                    : '90+';
        return {
          expenseId: r.expenseId,
          supplierId: r.supplierId,
          supplierName: r.supplierName || 'Unknown',
          dueDate: r.dueDate,
          amount,
          daysPastDue: isNaN(daysPastDue) ? 0 : daysPastDue,
          bucket
        };
      }).filter(r => r.amount > 0);

      const summary = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 };
      for (const row of enriched) {
        summary[row.bucket] += row.amount;
        summary.total += row.amount;
      }

      // Group by supplier
      const bySupplierMap = new Map();
      for (const row of enriched) {
        const key = row.supplierId || `unknown:${row.supplierName}`;
        if (!bySupplierMap.has(key)) {
          bySupplierMap.set(key, { supplierId: row.supplierId, supplierName: row.supplierName, expenses: [], total: 0 });
        }
        const group = bySupplierMap.get(key);
        group.expenses.push(row);
        group.total += row.amount;
      }
      const bySupplier = Array.from(bySupplierMap.values()).sort((a,b) => b.total - a.total);

      return { success: true, today, summary, bySupplier };
    } catch (e) {
      console.error('[expenses] getAPAging error:', e);
      return { success: false, error: e.message };
    }
  }
};

// Ensure the Expenses table is created
Expenses.createTable();
Expenses.createExpenseItem();

module.exports = Expenses;
