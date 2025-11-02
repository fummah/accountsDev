// src/backend/handlers/payrollHandlers.js
const { ipcMain } = require('electron');
const Payroll = require('../models/payroll');

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
};

module.exports = registerPayrollHandlers;