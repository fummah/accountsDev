// src/backend/handlers/payrollHandlers.js
const { ipcMain } = require('electron');
const Payroll = require('../models/payroll');
const PayrollConfig = require('../models/payrollConfig');

const registerPayrollHandlers = () => {
  // Get all payroll records
  ipcMain.handle('get-payroll-records', async () => {
    try {
      return await Payroll.getPayrollRecords();
    } catch (error) {
      console.error('Error fetching payroll records:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch payroll records'
      };
    }
  });

  // Process new payroll
  ipcMain.handle('process-payroll', async (event, payrollData) => {
    try {
      return await Payroll.processPayroll(payrollData);
    } catch (error) {
      console.error('Error processing payroll:', error);
      return {
        success: false,
        error: error.message || 'Failed to process payroll'
      };
    }
  });

  // Payroll formulas
  ipcMain.handle('payroll-formula-get', async () => {
    try { return { formula: PayrollConfig.getActiveFormula() }; } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('payroll-formula-save', async (_e, payload) => {
    try { return PayrollConfig.saveFormula(payload || {}); } catch (e) { return { error: e.message }; }
  });

  // Tax tables
  ipcMain.handle('payroll-tax-import', async (_e, { csvText, country, effective_date } = {}) => {
    try { return PayrollConfig.importTaxCsv(csvText, { country, effective_date }); } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('payroll-tax-list', async (_e, { country } = {}) => {
    try { return PayrollConfig.listTax({ country }); } catch (e) { return { error: e.message }; }
  });

  // Deductions config
  ipcMain.handle('payroll-deductions-get', async () => {
    try { return PayrollConfig.getDeductionsConfig(); } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('payroll-deductions-save', async (_e, items) => {
    try { return PayrollConfig.saveDeductionsConfig(items || []); } catch (e) { return { error: e.message }; }
  });

  // Payslip retrieval
  ipcMain.handle('payroll-payslip-get', async (_e, { payrollRunId, employeeId } = {}) => {
    try {
      return Payroll.getPayslipData(payrollRunId, employeeId);
    } catch (e) { return { success: false, error: e.message }; }
  });
  ipcMain.handle('payroll-payslips-for-run', async (_e, payrollRunId) => {
    try {
      return Payroll.getPayslipsForRun(payrollRunId);
    } catch (e) { return { success: false, error: e.message }; }
  });

  // e-Filing export (XML string for a payroll run)
  ipcMain.handle('payroll-efile-export', async (_e, { payrollRunId, country = 'DEFAULT' } = {}) => {
    try {
      if (!payrollRunId) throw new Error('payrollRunId required');
      const run = require('../models/dbmgr').prepare(`SELECT * FROM payroll_runs WHERE id=?`).get(payrollRunId);
      if (!run) throw new Error('Run not found');
      const rows = require('../models/dbmgr').prepare(`SELECT * FROM payroll_details WHERE payroll_run_id=? ORDER BY id ASC`).all(payrollRunId);
      const xmlEsc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const lines = rows.map(r => `    <Employee id="${r.employee_id}">\n      <Base>${r.base_salary||0}</Base>\n      <Hours>${r.hours_worked||0}</Hours>\n      <OvertimeHours>${r.overtime_hours||0}</OvertimeHours>\n      <Gross>${r.gross_pay||0}</Gross>\n      <Tax>${r.tax_deductions||0}</Tax>\n      <OtherDeductions>${r.other_deductions||0}</OtherDeductions>\n      <Net>${r.net_pay||0}</Net>\n    </Employee>`).join('\n');
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<PayrollSubmission country="${xmlEsc(country)}">\n  <Run id="${run.id}" start="${xmlEsc(run.pay_period_start)}" end="${xmlEsc(run.pay_period_end)}" processed="${xmlEsc(run.processed_date)}">\n${lines}\n  </Run>\n</PayrollSubmission>\n`;
      return { success: true, xml };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
};

module.exports = registerPayrollHandlers;