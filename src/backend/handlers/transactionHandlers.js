const { ipcMain } = require('electron');
const Transactions = require('../models/transactions');
const Journal = require('../models/journal');
const Ledger = require('../models/ledger');
const AuditLog = require('../models/auditLog');
const { authorize } = require('../security/authz');
const { validateTransaction, validateJournal } = require('../validation/validators');

const registerTransactionHandlers = () => {
  // Transactions
  ipcMain.handle('get-transactions', async () => {
    try {
      return Transactions.getAll();
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('insert-transaction', async (event, tx) => {
    try {
      const ctx = authorize(event, { permissions: 'write:transactions' });
      validateTransaction(tx);
      const res = Transactions.insert(tx);
      if (res?.changes > 0) {
        AuditLog.log({
          userId: ctx.userId,
          action: 'create',
          entityType: 'transaction',
          entityId: res.lastInsertRowid,
          details: { tx }
        });
      }
      return res;
    } catch (error) {
      console.error('Error inserting transaction:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('void-transaction', async (event, id) => {
    try {
      const ctx = authorize(event, { permissions: 'write:transactions' });
      const res = Transactions.voidTransaction(id);
      if (res?.changes > 0) {
        AuditLog.log({
          userId: ctx.userId,
          action: 'void',
          entityType: 'transaction',
          entityId: id
        });
      }
      return res;
    } catch (error) {
      console.error('Error voiding transaction:', error);
      return { error: error.message };
    }
  });

  // Journal
  ipcMain.handle('get-journal', async () => {
    try {
      return Journal.getAll();
    } catch (error) {
      console.error('Error fetching journal:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('insert-journal', async (event, entry) => {
    try {
      const ctx = authorize(event, { permissions: 'write:journal' });
      const id = Journal.insert(entry);
      if (id) {
        AuditLog.log({
          userId: ctx.userId,
          action: 'create',
          entityType: 'journal_entry',
          entityId: id,
          details: { entry }
        });
      }
      return id;
    } catch (error) {
      console.error('Error inserting journal entry:', error);
      return { error: error.message };
    }
  });

  // Suggest corrective lines for a draft journal (no DB writes)
  ipcMain.handle('suggest-corrective-journal', async (event, entryDraft, options) => {
    try {
      const ctx = authorize(event, { permissions: 'write:journal' });
      const result = Journal.suggestCorrective(entryDraft, options);
      AuditLog.log({
        userId: ctx.userId,
        action: 'suggest',
        entityType: 'journal_entry',
        entityId: null,
        details: { entryDraft, result }
      });
      return result;
    } catch (error) {
      console.error('Error suggesting corrective journal:', error);
      return { error: error.message };
    }
  });

  // Create a reversal entry for an existing journal entry
  ipcMain.handle('create-reversal-journal', async (event, { originalEntryId, date, entered_by }) => {
    try {
      const ctx = authorize(event, { permissions: 'write:journal' });
      const newId = Journal.createReversalEntry({ originalEntryId, date, entered_by: entered_by || ctx.userId });
      if (newId) {
        AuditLog.log({
          userId: ctx.userId,
          action: 'create',
          entityType: 'journal_reversal',
          entityId: newId,
          details: { originalEntryId, date }
        });
      }
      return { success: true, id: newId };
    } catch (error) {
      console.error('Error creating reversal journal:', error);
      return { error: error.message };
    }
  });

  // Ledger
  ipcMain.handle('get-ledger', async () => {
    try {
      return Ledger.getAll();
    } catch (error) {
      console.error('Error fetching ledger:', error);
      return { error: error.message };
    }
  });
};

module.exports = registerTransactionHandlers;