const db = require("./dbmgr");

const Transactions = {
  createTable() {
    // Main transactions table
    db.prepare(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      type TEXT,
      amount REAL,
      description TEXT,
      status TEXT DEFAULT 'Active',
      accountId INTEGER,
      reference TEXT,
      debit REAL,
      credit REAL,
      isReconciled BOOLEAN DEFAULT 0,
      entered_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();

    // Reconciliations table
    db.prepare(`CREATE TABLE IF NOT EXISTS reconciliations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      accountId INTEGER,
      statementDate TEXT,
      statementBalance REAL,
      reconciledBalance REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();

    // Deposit items table
    db.prepare(`CREATE TABLE IF NOT EXISTS deposit_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      depositId INTEGER,
      type TEXT,
      reference TEXT,
      description TEXT,
      amount REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();

    // Payroll runs table
    db.prepare(`CREATE TABLE IF NOT EXISTS payroll_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      startDate TEXT,
      endDate TEXT,
      paymentMethod TEXT,
      bankAccount INTEGER,
      notes TEXT,
      status TEXT DEFAULT 'Completed',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();

    // Payroll payments table
    db.prepare(`CREATE TABLE IF NOT EXISTS payroll_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payrollRunId INTEGER,
      employeeId INTEGER,
      grossPay REAL,
      deductions REAL,
      netPay REAL,
      status TEXT DEFAULT 'Paid',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();
  },

  getAll() {
    return db.prepare("SELECT * FROM transactions ORDER BY date DESC").all();
  },

  insert({ date, type, amount, description, accountId, reference, debit, credit, entered_by }) {
    return db.prepare(`
      INSERT INTO transactions (
        date, type, amount, description, status, accountId, 
        reference, debit, credit, entered_by
      ) VALUES (?, ?, ?, ?, 'Active', ?, ?, ?, ?, ?)
    `).run(date, type, amount, description, accountId, reference, debit, credit, entered_by);
  },

  voidTransaction(id) {
    return db.prepare("UPDATE transactions SET status='Voided' WHERE id=?").run(id);
  },

  reconcileTransactions({ accountId, statementDate, statementBalance, transactions }) {
    const db = require('./dbmgr');
    
    db.prepare('BEGIN TRANSACTION').run();
    
    try {
      // Update transaction reconciliation status
      const updateStmt = db.prepare('UPDATE transactions SET isReconciled = 1 WHERE id = ?');
      transactions.forEach(txId => updateStmt.run(txId));

      // Insert reconciliation record
      db.prepare(`
        INSERT INTO reconciliations (
          accountId, statementDate, statementBalance, reconciledBalance
        ) VALUES (?, ?, ?, ?)
      `).run(accountId, statementDate, statementBalance, statementBalance);

      db.prepare('COMMIT').run();
      return { success: true };
    } catch (error) {
      db.prepare('ROLLBACK').run();
      throw error;
    }
  },

  createBankTransfer({ fromAccount, toAccount, date, amount, reference }) {
    const db = require('./dbmgr');
    
    db.prepare('BEGIN TRANSACTION').run();
    
    try {
      // Create withdrawal from source account
      db.prepare(`
        INSERT INTO transactions (
          accountId, date, type, reference, description,
          debit, credit
        ) VALUES (?, ?, 'transfer_out', ?, 'Bank Transfer Out', NULL, ?)
      `).run(fromAccount, date, reference, amount);

      // Create deposit to destination account
      db.prepare(`
        INSERT INTO transactions (
          accountId, date, type, reference, description,
          debit, credit
        ) VALUES (?, ?, 'transfer_in', ?, 'Bank Transfer In', ?, NULL)
      `).run(toAccount, date, reference, amount);

      db.prepare('COMMIT').run();
      return { success: true };
    } catch (error) {
      db.prepare('ROLLBACK').run();
      throw error;
    }
  },

  createDeposit({ accountId, date, items, total }) {
    const db = require('./dbmgr');
    
    db.prepare('BEGIN TRANSACTION').run();
    
    try {
      // Insert main deposit transaction
      const result = db.prepare(`
        INSERT INTO transactions (
          accountId, date, type, reference, description,
          debit, credit
        ) VALUES (?, ?, 'deposit', ?, 'Bank Deposit', ?, NULL)
      `).run(accountId, date, 'DEP-' + Date.now(), total);

      const depositId = result.lastInsertRowid;

      // Insert deposit items
      const itemStmt = db.prepare(`
        INSERT INTO deposit_items (
          depositId, type, reference, description, amount
        ) VALUES (?, ?, ?, ?, ?)
      `);

      items.forEach(item => {
        itemStmt.run(depositId, item.type, item.reference, item.description, item.amount);
      });

      db.prepare('COMMIT').run();
      return { success: true };
    } catch (error) {
      db.prepare('ROLLBACK').run();
      throw error;
    }
  },

  processPayroll({ payPeriodStart, payPeriodEnd, paymentMethod, bankAccount, notes, employeeIds }) {
    const db = require('./dbmgr');
    
    db.prepare('BEGIN TRANSACTION').run();
    
    try {
      // Create payroll run record
      const runResult = db.prepare(`
        INSERT INTO payroll_runs (
          startDate, endDate, paymentMethod, bankAccount, notes
        ) VALUES (?, ?, ?, ?, ?)
      `).run(payPeriodStart, payPeriodEnd, paymentMethod, bankAccount, notes);

      const payrollRunId = runResult.lastInsertRowid;

      // Get employee details and create payments
      const employeeStmt = db.prepare('SELECT * FROM employees WHERE id = ?');
      const paymentStmt = db.prepare(`
        INSERT INTO payroll_payments (
          payrollRunId, employeeId, grossPay, deductions, netPay
        ) VALUES (?, ?, ?, ?, ?)
      `);
      const transactionStmt = db.prepare(`
        INSERT INTO transactions (
          accountId, date, type, reference, description,
          debit, credit
        ) VALUES (?, ?, 'payroll', ?, ?, NULL, ?)
      `);

      employeeIds.forEach(employeeId => {
        const employee = employeeStmt.get(employeeId);
        
        const grossPay = employee.salary || 0;
        const deductions = grossPay * 0.2; // Example: 20% deductions
        const netPay = grossPay - deductions;

        // Create payment record
        paymentStmt.run(payrollRunId, employeeId, grossPay, deductions, netPay);

        // Create bank transaction
        transactionStmt.run(
          bankAccount,
          payPeriodEnd,
          `PAY-${payrollRunId}-${employeeId}`,
          `Payroll Payment - ${employee.first_name} ${employee.last_name}`,
          netPay
        );
      });

      db.prepare('COMMIT').run();
      return { success: true };
    } catch (error) {
      db.prepare('ROLLBACK').run();
      throw error;
    }
  }
};

Transactions.createTable();
module.exports = Transactions;