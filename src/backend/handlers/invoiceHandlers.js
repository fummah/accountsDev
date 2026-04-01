const { ipcMain } = require('electron');
const Invoices = require('../models/invoices');
const AuditLog = require('../models/auditLog');
const { authorize } = require('../security/authz');
const { validateInvoice } = require('../validation/validators');

const registerInvoiceHandlers = () => {
  // Get all Invoices
  ipcMain.handle('get-invoices', async () => {
    try {
      return await Invoices.getAllInvoices();
    } catch (error) {
      console.error('Error fetching invoices:', error);
      return { error: error.message };
    }
  });

  // Get Invoices (server-side pagination)
  ipcMain.handle('get-invoices-paginated', async (event, page, pageSize, search, status) => {
    try {
      return await Invoices.getPaginated(page, pageSize, search || '', status || '');
    } catch (error) {
      console.error('Error fetching invoices (paginated):', error);
      return { error: error.message };
    }
  });

  // Get Initial Invoice
  ipcMain.handle('get-initinvoice', async (event, invoice_id, type) => {
    try {
      return await Invoices.getInitialInvoice(invoice_id, type);
    } catch (error) {    
      console.error(`Error fetching: ${type}`, error);
      return { error: error.message };
    }
  });

  // Get Single Invoice
  ipcMain.handle('get-singleInvoice', async (event, invoice_id) => {
    try {
      return await Invoices.getSingleInvoice(invoice_id);
    } catch (error) {    
      console.error('Error fetching invoice:', error);
      return { error: error.message };
    }
  });

  // Get Invoice Report (for dashboard card, no full list)
  ipcMain.handle('get-invoice-report', async () => {
    try {
      return await Invoices.getInvoiceReport();
    } catch (error) {
      console.error('Error fetching invoice report:', error);
      return { error: error.message };
    }
  });

  // Get Invoice Summary
  ipcMain.handle('invoicesummary', async () => {
    try {
      return await Invoices.getInvoiceSummary();
    } catch (error) {    
      console.error('Error fetching invoice summary:', error);
      return { error: error.message };
    }
  });

  // Get Dashboard Summary
  ipcMain.handle('dashboard', async () => {
    try {
      return await Invoices.getDashboardSummary();
    } catch (error) {    
      console.error('Error fetching dashboard summary:', error);
      return { error: error.message };
    }
  });

  // Insert Invoice
  ipcMain.handle('insert-invoice', async (event, customer, customer_email, islater, billing_address, terms, start_date, last_date, message, statement_message, number, entered_by, vat, status, invoiceLines) => {
    try {
      const ctx = authorize(event, { permissions: 'write:invoices' });
      validateInvoice({ customer, start_date, last_date, invoiceLines });
      const res = await Invoices.insertInvoice(
        customer, customer_email, islater, billing_address, terms, start_date, 
        last_date, message, statement_message, number, entered_by, vat, status, invoiceLines
      );
      if (res?.success) {
        try {
          AuditLog.log({
            userId: ctx.userId,
            action: 'create',
            entityType: 'invoice',
            entityId: res?.invoice_id || res?.id,
            details: { customer, number, status }
          });
        } catch (auditErr) {
          console.warn('Audit log failed (non-fatal):', auditErr.message);
        }
      }
      return res;
    } catch (error) {
      console.error('Error inserting invoice:', error);
      return { error: error.message };
    }
  });

  // Update Invoice
  ipcMain.handle('updateinvoice', async (event, invoiceData) => {
    try {
      const ctx = authorize(event, { permissions: 'write:invoices' });
      validateInvoice(invoiceData);
      const res = await Invoices.updateInvoice(invoiceData);
      if (res?.success) {
        try {
          AuditLog.log({
            userId: ctx.userId,
            action: 'update',
            entityType: 'invoice',
            entityId: invoiceData?.id,
            details: { status: invoiceData?.status, total: invoiceData?.total }
          });
        } catch (auditErr) {
          console.warn('Audit log failed (non-fatal):', auditErr.message);
        }
      }
      return res;
    } catch (error) {    
      console.error('Error updating invoice:', error);
      return { error: error.message };
    }
  });

  // Get Financial Report
  ipcMain.handle('get-financial', async (event, start_date, last_date) => {
    try {
      console.log('[invoiceHandlers] get-financial invoked with', start_date, last_date);
      const result = await Invoices.getFinancialReport(start_date, last_date);
      // Ensure we always return an object with the expected keys
      return result || { profitLoss: {}, balanceSheet: {}, cashFlow: {} };
    } catch (error) {
      console.error(`Error fetching financial report:`, error);
      return { error: error.message };
    }
  });

  // Get Management Report
  ipcMain.handle('get-management', async (event, start_date, last_date) => {
    try {
      return await Invoices.getManagementReport(start_date, last_date);
    } catch (error) {    
      console.error(`Error fetching:`, error);
      return { error: error.message };
    }
  });
};

module.exports = registerInvoiceHandlers;