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
};

// Ensure the Expenses table is created
Expenses.createTable();
Expenses.createExpenseItem();

module.exports = Expenses;
