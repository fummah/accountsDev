const { ipcMain } = require('electron');
const Transactions = require('../models/transactions');
const { authorize } = require('../security/authz');
const AuditLog = require('../models/auditLog');

const registerBankingHandlers = () => {
  // Deposits now handled by depositHandlers.js
  ipcMain.handle('get-transfers', async () => {
    try {
      return Transactions.getTransfers();
    } catch (error) {
      console.error('Error fetching transfers:', error);
      return { error: error.message };
    }
  });

  // Banking handlers
  ipcMain.handle('reconcile-transactions', async (event, data) => {
    try {
      let ctx = null;
      try { ctx = authorize(event, { permissions: 'write:reconcile' }); } catch {}
      let reconciledBy = null;
      if (ctx && ctx.userId) {
        try {
          const Users = require('../models/users');
          const u = (Users.getAllUsers ? Users.getAllUsers() : []).find(x => String(x.id) === String(ctx.userId));
          reconciledBy = (u && (u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim())) || ctx.userId;
        } catch { reconciledBy = ctx.userId; }
      }
      const res = await Transactions.reconcileTransactions({
        ...data,
        reconciledBy,
      });
      if (res?.success) {
        try {
          AuditLog.log({
            userId: ctx ? ctx.userId : 'system',
            action: 'reconcile',
            entityType: 'account',
            entityId: data?.accountId,
            details: { statementDate: data?.statementDate, reconciliationId: res.reconciliationId, transactionIds: data?.transactions },
          });
        } catch (e) { console.warn('Audit log (reconcile) failed:', e.message); }
      }
      return res;
    } catch (error) {
      console.error('Error reconciling transactions:', error);
      return { error: error.message };
    }
  });

  // Unreconciled transactions queue for the reconciliation screen
  ipcMain.handle('get-unreconciled-transactions', async (_e, params) => {
    try {
      return Transactions.getUnreconciledTransactions(params || {});
    } catch (error) {
      console.error('Error fetching unreconciled transactions:', error);
      return { error: error.message };
    }
  });

  // Reconciliation history (audit trail)
  ipcMain.handle('get-reconciliation-history', async (_e, { accountId } = {}) => {
    try {
      return Transactions.getReconciliations({ accountId });
    } catch (error) {
      console.error('Error fetching reconciliation history:', error);
      return { error: error.message };
    }
  });

  // Reconciliation detail (transactions in one reconciliation)
  ipcMain.handle('get-reconciliation-detail', async (_e, { reconciliationId } = {}) => {
    try {
      return Transactions.getReconciliationDetail({ reconciliationId });
    } catch (error) {
      console.error('Error fetching reconciliation detail:', error);
      return { error: error.message };
    }
  });

  // The starting (book) balance for a reconciliation — resolved through the SAME
  // opening-balance rule the General Ledger uses, so the two screens can never
  // disagree. Read-only.
  ipcMain.handle('reconciliation-starting-balance', async (_e, { accountId } = {}) => {
    try {
      const OpeningBalance = require('../services/openingBalance');
      const db = require('../models/dbmgr');
      const state = OpeningBalance.reconciliationStartingBalance(db, accountId);
      return { success: true, ...state };
    } catch (error) {
      console.error('Error reading reconciliation starting balance:', error);
      return { success: false, error: error.message };
    }
  });

  // Accounts eligible to absorb a "Reconcile Anyway" difference, plus the one to
  // preselect (a configured discrepancy account if the file has one).
  ipcMain.handle('reconciliation-adjustment-accounts', async (_e, { accountId } = {}) => {
    try {
      const ReconAdj = require('../services/reconciliationAdjustment');
      const db = require('../models/dbmgr');
      const accounts = ReconAdj.getEligibleAdjustmentAccounts(db, { bankAccountId: accountId });
      const def = ReconAdj.findDefaultAdjustmentAccount(db, { bankAccountId: accountId });
      return {
        success: true,
        accounts: accounts.map(a => ({ id: a.id, name: a.name, type: a.type, number: a.number })),
        defaultAccountId: def ? def.id : null,
      };
    } catch (error) {
      console.error('Error listing reconciliation adjustment accounts:', error);
      return { success: false, error: error.message, accounts: [], defaultAccountId: null };
    }
  });

  ipcMain.handle('create-bank-transfer', async (event, data) => {
    try {
      return await Transactions.createBankTransfer(data);
    } catch (error) {
      console.error('Error creating bank transfer:', error);
      return { error: error.message };
    }
  });

};

module.exports = registerBankingHandlers;