  // Ensure schema migrations for older DBs: add missing columns if any
const db = require("./dbmgr");
const Settings = require('./settings');

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
      customerId INTEGER REFERENCES customers(id),
      reference TEXT,
      debit REAL,
      credit REAL,
      isReconciled BOOLEAN DEFAULT 0,
      entered_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      class TEXT,
      location TEXT,
      department TEXT,
      currency TEXT,
      fxRate REAL DEFAULT 1.0,
      entity_id INTEGER,
      isIntercompany INTEGER DEFAULT 0,
      eliminateOnConsolidation INTEGER DEFAULT 1,
      pairId INTEGER
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

  // Ensure schema migrations for older DBs: add missing columns if any
  ensureColumns() {
    try {
      const infoStmt = db.prepare("PRAGMA table_info('transactions')");
      const cols = infoStmt.all().map(c => c.name.toLowerCase());
      const toAdd = [];
      if (!cols.includes('accountid')) toAdd.push({ name: 'accountId', sql: 'INTEGER' });
      if (!cols.includes('customerid')) toAdd.push({ name: 'customerId', sql: 'INTEGER REFERENCES customers(id)' });
      if (!cols.includes('reference')) toAdd.push({ name: 'reference', sql: 'TEXT' });
      if (!cols.includes('debit')) toAdd.push({ name: 'debit', sql: 'REAL' });
      if (!cols.includes('credit')) toAdd.push({ name: 'credit', sql: 'REAL' });
      if (!cols.includes('isreconciled')) toAdd.push({ name: 'isReconciled', sql: "BOOLEAN DEFAULT 0" });
      if (!cols.includes('entered_by')) toAdd.push({ name: 'entered_by', sql: 'TEXT' });
      if (!cols.includes('created_at')) toAdd.push({ name: 'created_at', sql: "TEXT DEFAULT CURRENT_TIMESTAMP" });
      if (!cols.includes('class')) toAdd.push({ name: 'class', sql: 'TEXT' });
      if (!cols.includes('location')) toAdd.push({ name: 'location', sql: 'TEXT' });
      if (!cols.includes('department')) toAdd.push({ name: 'department', sql: 'TEXT' });
      if (!cols.includes('currency')) toAdd.push({ name: 'currency', sql: 'TEXT' });
      if (!cols.includes('fxrate')) toAdd.push({ name: 'fxRate', sql: 'REAL DEFAULT 1.0' });
      if (!cols.includes('entity_id')) toAdd.push({ name: 'entity_id', sql: 'INTEGER' });
      if (!cols.includes('isintercompany')) toAdd.push({ name: 'isIntercompany', sql: 'INTEGER DEFAULT 0' });
      if (!cols.includes('eliminateonconsolidation')) toAdd.push({ name: 'eliminateOnConsolidation', sql: 'INTEGER DEFAULT 1' });
      if (!cols.includes('pairid')) toAdd.push({ name: 'pairId', sql: 'INTEGER' });

      toAdd.forEach(col => {
        try {
          db.prepare(`ALTER TABLE transactions ADD COLUMN ${col.name} ${col.sql}`).run();
          console.log(`Added missing column transactions.${col.name}`);
        } catch (addErr) {
          console.error(`Failed to add column ${col.name} to transactions:`, addErr);
        }
      });
    } catch (err) {
      console.error('Failed to ensure transactions columns', err);
    }
  },
 
  getAll() {
    return db.prepare("SELECT * FROM transactions ORDER BY date DESC").all();
  },

  getDeposits() {
    return db.prepare("SELECT * FROM transactions WHERE LOWER(type) = 'deposit' ORDER BY date DESC").all();
  },

  getTransfers() {
    return db.prepare("SELECT * FROM transactions WHERE LOWER(type) IN ('transfer_in', 'transfer_out') ORDER BY date DESC").all();
  },

  insert({ date, type, amount, description, accountId, customerId, reference, debit, credit, entered_by, entity_id, isIntercompany, eliminateOnConsolidation, pairId, class: classTag, location, department }) {
    // Closing date enforcement
    const closingDate = Settings.get('closingDate');
    if (closingDate && date && typeof date === 'string' && date <= closingDate) {
      throw new Error(`Posting date ${date} is on or before closing date ${closingDate}`);
    }
    return db.prepare(`
      INSERT INTO transactions (
        date, type, amount, description, status, accountId, customerId,
        reference, debit, credit, entered_by, entity_id, isIntercompany, eliminateOnConsolidation, pairId, class, location, department
      ) VALUES (?, ?, ?, ?, 'Active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(date, type, amount, description, accountId, customerId, reference, debit, credit, entered_by, entity_id || null, isIntercompany ? 1 : 0, eliminateOnConsolidation ? 1 : 0, pairId || null, classTag || null, location || null, department || null);
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

  createBankTransfer({ fromAccount, toAccount, date, amount, reference, description }) {
    // Closing date enforcement
    const closingDate = Settings.get('closingDate');
    if (closingDate && date && typeof date === 'string' && date <= closingDate) {
      throw new Error(`Posting date ${date} is on or before closing date ${closingDate}`);
    }
    const db = require('./dbmgr');
    
    db.prepare('BEGIN TRANSACTION').run();
    
    try {
      const descOut = description ? `Transfer Out: ${description}` : 'Bank Transfer Out';
      const descIn = description ? `Transfer In: ${description} to account ${toAccount}` : `Bank Transfer In to account ${toAccount}`;
      const ref = reference || ('TRF-' + Date.now());

      // Create withdrawal from source account (credit = money leaving)
      db.prepare(`
        INSERT INTO transactions (
          accountId, date, type, reference, description,
          debit, credit
        ) VALUES (?, ?, 'transfer_out', ?, ?, NULL, ?)
      `).run(fromAccount, date, ref, descOut, amount);

      // Create deposit to destination account (debit = money arriving)
      db.prepare(`
        INSERT INTO transactions (
          accountId, date, type, reference, description,
          debit, credit
        ) VALUES (?, ?, 'transfer_in', ?, ?, ?, NULL)
      `).run(toAccount, date, ref, descIn, amount);

      db.prepare('COMMIT').run();
      return { success: true };
    } catch (error) {
      db.prepare('ROLLBACK').run();
      throw error;
    }
  },

  // Create an intercompany transfer between two entities and accounts
  createIntercompanyTransfer({ fromEntityId, toEntityId, fromAccountId, toAccountId, date, amount, reference, description, eliminateOnConsolidation = true }) {
    const closingDate = Settings.get('closingDate');
    if (closingDate && date && typeof date === 'string' && date <= closingDate) {
      throw new Error(`Posting date ${date} is on or before closing date ${closingDate}`);
    }
    const db = require('./dbmgr');
    db.prepare('BEGIN TRANSACTION').run();
    try {
      const pairId = Date.now(); // simple linkage identifier
      // Credit from entity (outflow)
      db.prepare(`
        INSERT INTO transactions (
          accountId, date, type, reference, description, debit, credit, entity_id, isIntercompany, eliminateOnConsolidation, pairId
        ) VALUES (?, ?, 'intercompany', ?, ?, NULL, ?, ?, 1, ?, ?)
      `).run(fromAccountId, date, reference || null, description || 'Intercompany Transfer Out', amount, fromEntityId, eliminateOnConsolidation ? 1 : 0, pairId);

      // Debit to entity (inflow)
      db.prepare(`
        INSERT INTO transactions (
          accountId, date, type, reference, description, debit, credit, entity_id, isIntercompany, eliminateOnConsolidation, pairId
        ) VALUES (?, ?, 'intercompany', ?, ?, ?, NULL, ?, 1, ?, ?)
      `).run(toAccountId, date, reference || null, description || 'Intercompany Transfer In', amount, toEntityId, eliminateOnConsolidation ? 1 : 0, pairId);

      db.prepare('COMMIT').run();
      return { success: true };
    } catch (error) {
      db.prepare('ROLLBACK').run();
      throw error;
    }
  },

  createDeposit({ accountId, date, items, total }) {
    // Closing date enforcement
    const closingDate = Settings.get('closingDate');
    if (closingDate && date && typeof date === 'string' && date <= closingDate) {
      throw new Error(`Posting date ${date} is on or before closing date ${closingDate}`);
    }
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
    // Closing date enforcement (payPeriodEnd is posting date)
    const closingDate = Settings.get('closingDate');
    if (closingDate && payPeriodEnd && typeof payPeriodEnd === 'string' && payPeriodEnd <= closingDate) {
      throw new Error(`Posting date ${payPeriodEnd} is on or before closing date ${closingDate}`);
    }
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

  ,

  getPayrollRuns() {
    try {
      const runs = db.prepare(`
        SELECT pr.id, pr.startDate AS payPeriodStart, pr.endDate AS payPeriodEnd, pr.paymentMethod, pr.bankAccount, pr.notes, pr.status, pr.created_at
        FROM payroll_runs pr
        ORDER BY pr.created_at DESC
      `).all();

      // Attach summary totals for each run
      const stmtTotals = db.prepare(`SELECT IFNULL(SUM(netPay),0) as totalNetPay, COUNT(*) as paymentsCount FROM payroll_payments WHERE payrollRunId = ?`);

      const results = runs.map(run => {
        const totals = stmtTotals.get(run.id);
        return {
          ...run,
          totalNetPay: totals ? Number(totals.totalNetPay) : 0,
          paymentsCount: totals ? Number(totals.paymentsCount) : 0,
        };
      });

      return results;
    } catch (error) {
      console.error('Error fetching payroll runs:', error);
      return [];
    }
  }
};

// Aggregate transactions into a trial balance for a date range
Transactions.getTrialBalance = function(startDate, endDate) {
  try {
    const db = require('./dbmgr');

    // Normalize dates; if not provided, use wide range
    const start = startDate || '0000-01-01';
    const end = endDate || '9999-12-31';

    const stmt = db.prepare(`
      SELECT coa.id as accountId,
             coa.name as accountName,
             coa.type as accountType,
             IFNULL(s.totalDebit, 0) as totalDebit,
             IFNULL(s.totalCredit, 0) as totalCredit
      FROM chart_of_accounts coa
      LEFT JOIN (
        SELECT accountId,
               SUM(IFNULL(debit,0)) as totalDebit,
               SUM(IFNULL(credit,0)) as totalCredit
        FROM transactions
        WHERE date >= ? AND date <= ? AND (status IS NULL OR LOWER(status) = 'active')
        GROUP BY accountId
      ) s ON s.accountId = coa.id
      ORDER BY coa.number || coa.id
    `);

    const rows = stmt.all(start, end);

    // Map to friendly structure expected by frontend
    return rows.map(r => ({
      accountId: r.accountId,
      accountName: r.accountName,
      accountType: r.accountType,
      debit: Number(r.totalDebit) || 0,
      credit: Number(r.totalCredit) || 0,
      balance: (Number(r.totalDebit) || 0) - (Number(r.totalCredit) || 0)
    }));
  } catch (error) {
    console.error('Error computing trial balance:', error);
    return [];
  }
};

// Consolidated Trial Balance across entities
Transactions.getTrialBalanceByEntities = function(entityIds, startDate, endDate, options = {}) {
  try {
    const db = require('./dbmgr');
    const start = startDate || '0000-01-01';
    const end = endDate || '9999-12-31';
    const eliminate = options.eliminateIntercompany !== false; // default true

    const ids = Array.isArray(entityIds) ? entityIds.filter(id => id != null) : [];
    if (ids.length === 0) {
      // no filter -> behave like standard TB
      return Transactions.getTrialBalance(start, end);
    }

    const placeholders = ids.map(() => '?').join(',');

    const stmt = db.prepare(`
      SELECT coa.id as accountId,
             coa.name as accountName,
             coa.type as accountType,
             IFNULL(s.totalDebit, 0) as totalDebit,
             IFNULL(s.totalCredit, 0) as totalCredit
      FROM chart_of_accounts coa
      LEFT JOIN (
        SELECT accountId,
               SUM(IFNULL(debit,0)) as totalDebit,
               SUM(IFNULL(credit,0)) as totalCredit
        FROM transactions
        WHERE date >= ? AND date <= ?
          AND (status IS NULL OR LOWER(status) = 'active')
          AND entity_id IN (${placeholders})
          ${eliminate ? "AND (isIntercompany IS NULL OR eliminateOnConsolidation = 0)" : ""}
        GROUP BY accountId
      ) s ON s.accountId = coa.id
      ORDER BY coa.number || coa.id
    `);

    const rows = stmt.all(start, end, ...ids);
    return rows.map(r => ({
      accountId: r.accountId,
      accountName: r.accountName,
      accountType: r.accountType,
      debit: Number(r.totalDebit) || 0,
      credit: Number(r.totalCredit) || 0,
      balance: (Number(r.totalDebit) || 0) - (Number(r.totalCredit) || 0)
    }));
  } catch (error) {
    console.error('Error computing consolidated trial balance:', error);
    return [];
  }
};

// Trial balance with filters for entity/class/location/department
Transactions.getTrialBalanceAdvanced = function({ startDate, endDate, entityIds = [], classTag, location, department }) {
  try {
    const db = require('./dbmgr');
    const start = startDate || '0000-01-01';
    const end = endDate || '9999-12-31';

    const conditions = [`date >= ?`, `date <= ?`, `(status IS NULL OR LOWER(status) = 'active')`];
    const params = [start, end];

    if (Array.isArray(entityIds) && entityIds.length > 0) {
      conditions.push(`(entity_id IN (${entityIds.map(() => '?').join(',')}))`);
      params.push(...entityIds);
    }
    if (classTag) { conditions.push(`(class = ?)`); params.push(classTag); }
    if (location) { conditions.push(`(location = ?)`); params.push(location); }
    if (department) { conditions.push(`(department = ?)`); params.push(department); }

    const where = conditions.join(' AND ');

    const stmt = db.prepare(`
      SELECT coa.id as accountId,
             coa.name as accountName,
             coa.type as accountType,
             IFNULL(s.totalDebit, 0) as totalDebit,
             IFNULL(s.totalCredit, 0) as totalCredit
      FROM chart_of_accounts coa
      LEFT JOIN (
        SELECT accountId,
               SUM(IFNULL(debit,0)) as totalDebit,
               SUM(IFNULL(credit,0)) as totalCredit
        FROM transactions
        WHERE ${where}
        GROUP BY accountId
      ) s ON s.accountId = coa.id
      ORDER BY coa.number || coa.id
    `);

    const rows = stmt.all(...params);
    return rows.map(r => ({
      accountId: r.accountId,
      accountName: r.accountName,
      accountType: r.accountType,
      debit: Number(r.totalDebit) || 0,
      credit: Number(r.totalCredit) || 0,
      balance: (Number(r.totalDebit) || 0) - (Number(r.totalCredit) || 0)
    }));
  } catch (error) {
    console.error('Error computing trial balance (advanced):', error);
    return [];
  }
};
Transactions.createTable();
// Run schema migration to add any missing columns for older DBs
if (typeof Transactions.ensureColumns === 'function') {
  try { Transactions.ensureColumns(); } catch (e) { console.error('Error running transactions.ensureColumns', e); }
}

module.exports = Transactions;