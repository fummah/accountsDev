// src/backend/models/payroll.js
const db = require('./dbmgr.js');

const Payroll = {
  // Create the Payroll tables if they don't exist
  createTables: () => {
    // Payroll runs table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS payroll_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pay_period_start DATE NOT NULL,
        pay_period_end DATE NOT NULL,
        processed_date DATE NOT NULL,
        payment_method TEXT NOT NULL,
        notes TEXT,
        status TEXT DEFAULT 'Processed',
        total_net_pay REAL DEFAULT 0,
        total_tax REAL DEFAULT 0,
        total_deductions REAL DEFAULT 0,
        payments_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Payroll details table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS payroll_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payroll_run_id INTEGER,
        employee_id INTEGER,
        base_salary REAL,
        hours_worked REAL DEFAULT 0,
        overtime_hours REAL DEFAULT 0,
        gross_pay REAL,
        tax_deductions REAL,
        other_deductions REAL,
        net_pay REAL,
        payment_status TEXT DEFAULT 'Pending',
        FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id),
        FOREIGN KEY (employee_id) REFERENCES employees(id)
      )
    `).run();
  },

  // Get all payroll records
  getPayrollRecords: () => {
    try {
      const stmt = db.prepare(`
        SELECT 
          pr.id,
          pr.pay_period_start,
          pr.pay_period_end,
          pr.processed_date,
          pr.payment_method,
          pr.notes,
          pr.status,
          pr.total_net_pay,
          pr.total_tax,
          pr.total_deductions,
          COUNT(pd.id) as payments_count,
          pr.created_at
        FROM payroll_runs pr
        LEFT JOIN payroll_details pd ON pr.id = pd.payroll_run_id
        GROUP BY pr.id
        ORDER BY pr.processed_date DESC
      `);

      const rows = stmt.all();
      // map to camelCase for frontend convenience
      const data = rows.map(r => ({
        id: r.id,
        payPeriodStart: r.pay_period_start,
        payPeriodEnd: r.pay_period_end,
        processedDate: r.processed_date,
        paymentMethod: r.payment_method,
        notes: r.notes,
        status: r.status,
        totalNetPay: r.total_net_pay,
        totalTax: r.total_tax,
        totalDeductions: r.total_deductions,
        paymentsCount: r.payments_count,
        created_at: r.created_at
      }));

      return {
        success: true,
        data
      };
    } catch (error) {
      console.error('Error getting payroll records:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch payroll records'
      };
    }
  },

  // Process a new payroll run
  processPayroll: async (payrollData) => {
    try {
      const {
        payPeriodStart,
        payPeriodEnd,
        employeeIds,
        rows,
        paymentMethod,
        notes
      } = payrollData;

      // Start a transaction
      const transaction = db.transaction(() => {
        // Create payroll run
        const runResult = db.prepare(`
          INSERT INTO payroll_runs (
            pay_period_start, 
            pay_period_end, 
            processed_date,
            payment_method,
            notes,
            status
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          payPeriodStart,
          payPeriodEnd,
          new Date().toISOString().split('T')[0],
          paymentMethod,
          notes,
          'Processed'
        );

        const payrollRunId = runResult.lastInsertRowid;

        // If detailed rows were provided, use them; otherwise fall back to employeeIds
        if (Array.isArray(rows) && rows.length > 0) {
          // rows expected: [{ id, regularHours, overtimeHours, rate, deductions }]
          const taxRate = 0.2; // TODO: make configurable
          rows.forEach(r => {
            const empId = r.id || r.employee_id;
            const rate = Number(r.rate) || 0;
            const regular = Number(r.regularHours) || 0;
            const overtime = Number(r.overtimeHours) || 0;
            const grossPay = regular * rate + overtime * rate * 1.5;
            const taxDeductions = grossPay * taxRate;
            const otherDeductions = Number(r.deductions) || 0;
            const netPay = grossPay - taxDeductions - otherDeductions;

            db.prepare(`
              INSERT INTO payroll_details (
                payroll_run_id,
                employee_id,
                base_salary,
                hours_worked,
                overtime_hours,
                gross_pay,
                tax_deductions,
                other_deductions,
                net_pay,
                payment_status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              payrollRunId,
              empId,
              rate,
              regular,
              overtime,
              grossPay,
              taxDeductions,
              otherDeductions,
              netPay,
              'Processed'
            );
          });
        } else if (Array.isArray(employeeIds) && employeeIds.length > 0) {
          // Get employee salaries
          const employees = db.prepare('SELECT id, salary FROM employees WHERE id IN (' + employeeIds.join(',') + ')').all();
          // Process each employee using salary as gross
          employees.forEach(emp => {
            const baseSalary = emp.salary;
            const taxRate = 0.2;
            const grossPay = baseSalary;
            const taxDeductions = grossPay * taxRate;
            const netPay = grossPay - taxDeductions;

            db.prepare(`
              INSERT INTO payroll_details (
                payroll_run_id,
                employee_id,
                base_salary,
                gross_pay,
                tax_deductions,
                other_deductions,
                net_pay,
                payment_status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              payrollRunId,
              emp.id,
              baseSalary,
              grossPay,
              taxDeductions,
              0,
              netPay,
              'Processed'
            );
          });
        }

        // Update payroll run totals
        const totals = db.prepare(`
          SELECT 
            SUM(net_pay) as total_net,
            SUM(tax_deductions) as total_tax,
            SUM(other_deductions) as total_deductions,
            COUNT(*) as payment_count
          FROM payroll_details 
          WHERE payroll_run_id = ?
        `).get(payrollRunId);

        db.prepare(`
          UPDATE payroll_runs 
          SET 
            total_net_pay = ?,
            total_tax = ?,
            total_deductions = ?,
            payments_count = ?
          WHERE id = ?
        `).run(
          totals.total_net,
          totals.total_tax,
          totals.total_deductions,
          totals.payment_count,
          payrollRunId
        );

        return payrollRunId;
      });

      // Execute transaction
      const newPayrollId = transaction();

      return {
        success: true,
        message: 'Payroll processed successfully',
        payrollId: newPayrollId
      };
    } catch (error) {
      console.error('Error processing payroll:', error);
      return {
        success: false,
        error: error.message || 'Failed to process payroll'
      };
    }
  }
};

// Initialize tables
Payroll.createTables();

module.exports = Payroll;