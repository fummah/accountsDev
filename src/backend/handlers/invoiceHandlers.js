const { ipcMain } = require('electron');
const Invoices = require('../models/invoices');
const AuditLog = require('../models/auditLog');
const { authorize } = require('../security/authz');
const { validateInvoice } = require('../validation/validators');
const JournalEntries = require('../models/journalEntries');

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
  ipcMain.handle('get-invoices-paginated', async (event, page, pageSize, search, status, dueFrom, dueTo, startFrom, startTo, customerId) => {
    try {
      return await Invoices.getPaginated(page, pageSize, search || '', status || '', dueFrom || '', dueTo || '', startFrom || '', startTo || '', customerId || '');
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

  // Sales by Product report
  ipcMain.handle('sales-by-product', async (_event, filters) => {
    try {
      return Invoices.getSalesByProduct(filters || {});
    } catch (error) {
      console.error('Error fetching sales by product:', error);
      return { success: false, error: error.message };
    }
  });

  // Sales Report summary (KPI, byCustomer, byIncomeAccount)
  ipcMain.handle('sales-summary', async (_event, filters) => {
    try {
      return Invoices.getSalesSummary(filters || {});
    } catch (error) {
      console.error('Error fetching sales summary:', error);
      return { success: false, error: error.message };
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
            userId: ctx.userId, action: 'create', entityType: 'invoice',
            entityId: res?.invoice_id || res?.id, details: { customer, number, status }
          });
        } catch (auditErr) { console.warn('Audit log failed (non-fatal):', auditErr.message); }

        // ── Auto-post to COA: DR Accounts Receivable / CR Income per line ──
        if (status && status !== 'Draft') {
          try {
            const invoiceId = res.invoiceId || res.invoice_id || res.id;
            if (invoiceId) {
              const inv = await Invoices.getSingleInvoice(invoiceId);
              if (inv) {
                const invDate = typeof start_date === 'string' ? start_date
                  : (start_date && typeof start_date.format === 'function' ? start_date.format('YYYY-MM-DD')
                  : (inv.start_date || new Date().toISOString().slice(0, 10)));
                const postResult = JournalEntries.postInvoice({
                  id: invoiceId,
                  date: invDate,
                  number: number || inv.number || '',
                  total: inv.total || inv.amount || 0,
                  customerName: inv.first_name ? `${inv.first_name} ${inv.last_name || ''}`.trim() : '',
                });
                if (postResult && postResult.error) {
                  console.warn('Journal auto-post (invoice) error:', postResult.error);
                  res.glWarning = postResult.error;
                }
              } else {
                console.warn('Journal auto-post (invoice) skipped — invoice not found after insert');
                res.glWarning = 'Invoice saved but could not retrieve for journal posting';
              }
            } else {
              console.warn('Journal auto-post (invoice) skipped — no invoice ID from insert');
              res.glWarning = 'Invoice saved but no ID returned for journal posting';
            }
          } catch (jErr) {
            console.warn('Journal auto-post (invoice) failed:', jErr.message);
            res.glWarning = jErr.message;
          }
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
        // ── Post-on-save: post/repost journal entry for non-Draft invoices ──
        if (invoiceData?.status && invoiceData.status !== 'Draft') {
          try {
            const inv = await Invoices.getSingleInvoice(invoiceData.id);
            if (inv) {
              // Reverse existing posting if any, then re-post
              const db = require('../models/dbmgr');
              const oldJe = db.prepare("SELECT id FROM journal_entries WHERE source_type = 'invoice' AND source_id = ? AND status = 'Posted' LIMIT 1").get(Number(invoiceData.id));
              if (oldJe) {
                JournalEntries.voidEntry(oldJe.id);
              }
              JournalEntries.postInvoice({
                id: invoiceData.id,
                date: inv.start_date || new Date().toISOString().slice(0, 10),
                number: inv.number || String(invoiceData.id),
                total: inv.total || inv.amount || 0,
                customerName: inv.first_name ? `${inv.first_name} ${inv.last_name || ''}`.trim() : '',
              });
            }
          } catch (jErr) {
            console.warn('Journal re-post (invoice update) failed:', jErr.message);
          }
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