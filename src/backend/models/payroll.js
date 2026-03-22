// src/backend/models/payroll.js
const db = require('./dbmgr.js');
const PayrollConfig = require('./payrollConfig');

const Payroll = {
  // Create the Payroll tables if they don't exist
  createTables: () => {
    // Payroll runs table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS payroll_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        -- Columns added via migrations if missing
        pay_period_start DATE,
        pay_period_end DATE,
        processed_date DATE,
        payment_method TEXT,
        notes TEXT,
        status TEXT,
        total_net_pay REAL,
        total_tax REAL,
        total_deductions REAL,
        payments_count INTEGER,
        created_at DATETIME
      )
    `).run();

    // Payroll details table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS payroll_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payroll_run_id INTEGER,
        employee_id INTEGER,
        base_salary REAL,
        hours_worked REAL,
        overtime_hours REAL,
        gross_pay REAL,
        tax_deductions REAL,
        other_deductions REAL,
        net_pay REAL,
        payment_status TEXT,
        FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id),
        FOREIGN KEY (employee_id) REFERENCES employees(id)
      )
    `).run();

    // Lightweight migrations: ensure expected columns exist (handles older DBs)
    try {
      const existingRunsCols = new Set(db.prepare(`PRAGMA table_info('payroll_runs')`).all().map(r => r.name));
      const addRunCol = (name, ddl) => {
        if (!existingRunsCols.has(name)) {
          db.prepare(`ALTER TABLE payroll_runs ADD COLUMN ${name} ${ddl}`).run();
        }
      };
      addRunCol('pay_period_start', 'DATE');
      addRunCol('pay_period_end', 'DATE');
      addRunCol('processed_date', 'DATE');
      addRunCol('payment_method', 'TEXT');
      addRunCol('notes', 'TEXT');
      addRunCol('status', "TEXT DEFAULT 'Processed'");
      addRunCol('total_net_pay', 'REAL DEFAULT 0');
      addRunCol('total_tax', 'REAL DEFAULT 0');
      addRunCol('total_deductions', 'REAL DEFAULT 0');
      addRunCol('payments_count', 'INTEGER DEFAULT 0');
      addRunCol('created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
    } catch (e) {
      console.error('Payroll runs migration failed:', e);
    }

    try {
      const existingDetailsCols = new Set(db.prepare(`PRAGMA table_info('payroll_details')`).all().map(r => r.name));
      const addDetCol = (name, ddl) => {
        if (!existingDetailsCols.has(name)) {
          db.prepare(`ALTER TABLE payroll_details ADD COLUMN ${name} ${ddl}`).run();
        }
      };
      addDetCol('hours_worked', 'REAL DEFAULT 0');
      addDetCol('overtime_hours', 'REAL DEFAULT 0');
      addDetCol('payment_status', "TEXT DEFAULT 'Pending'");
    } catch (e) {
      console.error('Payroll details migration failed:', e);
    }
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

  // Evaluate payroll using configured formula
  _evaluateRow({ regularHours, overtimeHours, rate, grossBase, employeeId, date, country }) {
    const fnSrc = PayrollConfig.getActiveFormula();
    let formulaFn;
    try {
      // Limited sandbox via function arguments only
      formulaFn = (0, eval)(`(${fnSrc})`);
    } catch (e) {
      // Fallback if custom formula broken
      formulaFn = ({ regularHours=0, overtimeHours=0, rate=0, grossBase=0, employeeId }) => {
        const gross = (Number(regularHours)||0)*(Number(rate)||0) + (Number(overtimeHours)||0)*(Number(rate)||0)*1.5 + (Number(grossBase)||0);
        const tax = PayrollConfig.computeTax(gross, country, date);
        const deductions = PayrollConfig.computeDeductions(employeeId, gross, date);
        return { gross, tax, deductions: deductions.items, net: gross - tax - deductions.total };
      };
    }
    const helpers = {
      computeTax: (g, c, d) => PayrollConfig.computeTax(g, c, d),
      computeDeductions: (empId, g, d) => PayrollConfig.computeDeductions(empId, g, d)
    };
    return formulaFn({ regularHours, overtimeHours, rate, grossBase, employeeId, date, country, helpers });
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
        notes,
        country = 'DEFAULT'
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

        const upsertDetail = (empId, rate, regular, overtime, grossBase) => {
          const { gross, tax, deductions, net } = Payroll._evaluateRow({
            regularHours: regular,
            overtimeHours: overtime,
            rate,
            grossBase,
            employeeId: empId,
            date: payPeriodEnd || new Date().toISOString().slice(0,10),
            country
          });
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
            regular || 0,
            overtime || 0,
            gross,
            tax,
            (deductions||[]).reduce((s,d)=>s+Number(d.amount||0),0),
            net,
            'Processed'
          );
        };

        // If detailed rows were provided, use them; otherwise fall back to employeeIds
        if (Array.isArray(rows) && rows.length > 0) {
          rows.forEach(r => {
            const empId = r.id || r.employee_id;
            const rate = Number(r.rate) || 0;
            const regular = Number(r.regularHours) || 0;
            const overtime = Number(r.overtimeHours) || 0;
            const grossBase = Number(r.grossBase) || 0;
            upsertDetail(empId, rate, regular, overtime, grossBase);
          });
        } else if (Array.isArray(employeeIds) && employeeIds.length > 0) {
          const employees = db.prepare('SELECT id, salary FROM employees WHERE id IN (' + employeeIds.join(',') + ')').all();
          employees.forEach(emp => {
            const baseSalary = Number(emp.salary)||0;
            upsertDetail(emp.id, baseSalary, 0, 0, baseSalary);
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
  },

  getPayslipData(payrollRunId, employeeId) {
    try {
      const detail = db.prepare(`
        SELECT pd.*, e.first_name, e.last_name, e.email, e.phone, e.salary,
               pr.pay_period_start, pr.pay_period_end, pr.processed_date, pr.payment_method
        FROM payroll_details pd
        JOIN employees e ON e.id = pd.employee_id
        JOIN payroll_runs pr ON pr.id = pd.payroll_run_id
        WHERE pd.payroll_run_id = ? AND pd.employee_id = ?
      `).get(payrollRunId, employeeId);
      if (!detail) return { success: false, error: 'Payslip not found' };
      return { success: true, data: detail };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  getPayslipsForRun(payrollRunId) {
    try {
      const rows = db.prepare(`
        SELECT pd.*, e.first_name, e.last_name, e.email,
               pr.pay_period_start, pr.pay_period_end, pr.processed_date, pr.payment_method
        FROM payroll_details pd
        JOIN employees e ON e.id = pd.employee_id
        JOIN payroll_runs pr ON pr.id = pd.payroll_run_id
        WHERE pd.payroll_run_id = ?
        ORDER BY e.last_name, e.first_name
      `).all(payrollRunId);
      return { success: true, data: rows };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
};

// Initialize tables
Payroll.createTables();

module.exports = Payroll;