const { ipcMain } = require('electron');
const CreditNotes = require('../models/creditNotes');
const AuditLog = require('../models/auditLog');
const { authorize } = require('../security/authz');

async function register() {
  ipcMain.handle('credit-notes-list', async () => {
    try {
      return CreditNotes.getAll();
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('credit-note-get', async (_e, id) => {
    try {
      return CreditNotes.getById(id);
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('credit-notes-by-customer', async (_e, customerId) => {
    try {
      return CreditNotes.getByCustomer(customerId);
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('credit-note-create', async (event, data, lines) => {
    try {
      const ctx = authorize(event, { permissions: 'write:invoices' });
      const result = CreditNotes.insert(data, lines);
      if (result.success) {
        AuditLog.log({ userId: ctx.userId, action: 'create', entityType: 'credit_note', entityId: String(result.id), details: { number: result.credit_note_number } });
      }
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('credit-note-update', async (event, id, data) => {
    try {
      const ctx = authorize(event, { permissions: 'write:invoices' });
      const result = CreditNotes.update(id, data);
      if (result.success) {
        AuditLog.log({ userId: ctx.userId, action: 'update', entityType: 'credit_note', entityId: String(id), details: data });
      }
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('credit-note-delete', async (event, id) => {
    try {
      const ctx = authorize(event, { roles: ['Admin', 'Manager'] });
      const result = CreditNotes.delete(id);
      if (result.success) {
        AuditLog.log({ userId: ctx.userId, action: 'delete', entityType: 'credit_note', entityId: String(id) });
      }
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('credit-note-apply', async (event, creditNoteId, invoiceId) => {
    try {
      const ctx = authorize(event, { permissions: 'write:invoices' });
      const result = CreditNotes.applyToInvoice(creditNoteId, invoiceId);
      if (result.success) {
        AuditLog.log({ userId: ctx.userId, action: 'applyCreditNote', entityType: 'credit_note', entityId: String(creditNoteId), details: { invoiceId } });
      }
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = register;
