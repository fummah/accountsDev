const { ipcMain } = require('electron');
const ChartOfAccounts = require('../models/chartOfAccounts');
const FixedAssets = require('../models/fixedAssets');
const Transactions = require('../models/transactions');
const {Budgets, Customers,
  Invoices,
  Quotes,
  Products,
  Employees,
  Expenses,
  Notes,
  Suppliers,
  Users,
  Vat,} = require('./../models');
const Entities = require('../models/entities');
const CashflowProjections = require('../models/cashflowProjections');
const AuditLog = require('../models/auditLog');
const { authorize } = require('../security/authz');
const Settings = require('../models/settings');
const Anchors = require('../models/auditAnchors');
ipcMain.handle('deletingrecord', async (event,id,table) => {
  try {
    table = (table || '').toLowerCase();
    switch (table) {
      case 'invoices':
        return await Invoices.deleteInvoice(id);
      case 'quotes':
        return await Quotes.deleteQuote(id);
      case 'expenses':
        // delete expense lines first then expense
        return await Expenses.deleteExpense ? await Expenses.deleteExpense(id) : await Vat.deleteRecord(id,table);
      case 'vat':
        return await Vat.deleteRecord(id,table);
      default:
        // fallback to generic delete
        return await Vat.deleteRecord(id,table);
    }
  } catch (error) {    
    console.error('Error deleting record:', error);
    return { error: error.message };
  }
});
function registerAccountingHandlers() {
  // Chart of Accounts handlers
  ipcMain.handle('get-chart-of-accounts', async () => {
    try {
      return await ChartOfAccounts.getAllAccounts();
    } catch (error) {
      console.error('Error fetching chart of accounts:', error);
      return { error: error.message };
    }
  });
  ipcMain.handle('get-budgets', async () => {
  try {
    console.log('[ipcHandlers] get-budgets invoked');
    return await Budgets.getBudgets();
  } catch (error) {
    console.error('Error fetching budgets:', error);
    return { error: error.message };
  }
});
// convert quote
ipcMain.handle('convertquote', async (event,quote_id) => {
  try {
    return await Quotes.convertToInvoice(quote_id);
  } catch (error) {    
    console.error('Error converting quote:', error);
    return { error: error.message };
  }
});
ipcMain.handle('insert-budget', async (event, department, period, amount, forecast, entered_by) => {
  try {
    console.log('Inserting budget:', department, period, amount, forecast, entered_by);
    return await Budgets.insertBudget(department, period, amount, forecast, entered_by);
  } catch (error) {
    console.error('Error inserting budget:', error);
    return { error: error.message };
  }
});

ipcMain.handle('update-budget', async (_e, id, department, period, amount, forecast) => {
  try {
    return Budgets.updateBudget(id, department, period, amount, forecast);
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('delete-budget', async (_e, id) => {
  try {
    return Budgets.deleteBudget(id);
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('budget-vs-actual', async (_e, period) => {
  try {
    return Budgets.getVsActual(period);
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('budget-periods', async () => {
  try {
    return Budgets.getPeriods();
  } catch (error) {
    return { error: error.message };
  }
});

  ipcMain.handle('insert-chart-account', async (event, name, type, number, entered_by) => {
    try {
      const ctx = authorize(event, { permissions: 'write:chart-accounts' });
      return await ChartOfAccounts.insertAccount(name, type, number, entered_by);
    } catch (error) {
      console.error('Error creating account:', error);
      return { error: error.message, success: false };
    }
  });

  ipcMain.handle('update-chart-account', async (event, accountData) => {
    try {
      const ctx = authorize(event, { permissions: 'write:chart-accounts' });
      const res = await ChartOfAccounts.updateAccount(accountData);
      if (res?.success) {
        AuditLog.log({
          userId: ctx.userId,
          action: 'update',
          entityType: 'chart_account',
          entityId: accountData.id,
          details: { accountData }
        });
      }
      return res;
    } catch (error) {
      console.error('Error updating account:', error);
      return { error: error.message, success: false };
    }
  });

  ipcMain.handle('delete-chart-account', async (event, id) => {
    try {
      const ctx = authorize(event, { permissions: 'write:chart-accounts' });
      const res = await ChartOfAccounts.deleteAccount(id);
      if (res?.success) {
        AuditLog.log({
          userId: ctx.userId,
          action: 'delete',
          entityType: 'chart_account',
          entityId: id
        });
      }
      return res;
    } catch (error) {
      console.error('Error deleting account:', error);
      return { error: error.message, success: false };
    }
  });

  // Cashflow Projections handlers
  ipcMain.handle('get-cashflow-projections', async (_, year) => {
    try {
      console.log('[accountingHandlers] get-cashflow-projections invoked for year:', year);
      const result = await CashflowProjections.getProjections(year);
      
      // Make sure we return the data array even if empty
      if (result.success) {
        return { success: true, data: result.data || [] };
      } else {
        console.error('Error in getProjections:', result.error);
        return { success: false, error: result.error, data: [] };
      }
    } catch (error) {
      console.error('Error fetching cashflow projections:', error);
      return { success: false, error: error.message, data: [] };
    }
  });

  ipcMain.handle('save-cashflow-projections', async (_, projections, year) => {
    try {
      console.log('[accountingHandlers] save-cashflow-projections invoked');
      const result = await CashflowProjections.saveProjections(projections, year);
      return { success: true, data: result };
    } catch (error) {
      console.error('Error saving cashflow projections:', error);
      return { success: false, error: error.message };
    }
  });

  // Fixed Assets handlers
  ipcMain.handle('get-fixed-assets', async () => {
    try {
      const assets = FixedAssets.getAllAssets();
      if (Array.isArray(assets)) {
        return { success: true, data: assets };
      } else {
        return { success: false, error: assets.error || 'Unknown error', data: [] };
      }
    } catch (error) {
      console.error('Error getting fixed assets:', error);
      return { success: false, error: error.message, data: [] };
    }
  });

  ipcMain.handle('insert-fixed-asset', async (event, asset) => {
    try {
      const ctx = authorize(event, { permissions: 'write:fixed-assets' });
      if (!asset || !asset.assetName) {
        throw new Error('Asset name is required');
      }
      const result = FixedAssets.insertAsset(asset);
      if (result?.success) {
        AuditLog.log({
          userId: ctx.userId,
          action: 'create',
          entityType: 'fixed_asset',
          entityId: result.id,
          details: { asset }
        });
      }
      return result;
    } catch (error) {
      console.error('Error creating fixed asset:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('update-fixed-asset', async (event, asset) => {
    try {
      const ctx = authorize(event, { permissions: 'write:fixed-assets' });
      const res = FixedAssets.updateAsset(asset);
      if (res?.success) {
        AuditLog.log({
          userId: ctx.userId,
          action: 'update',
          entityType: 'fixed_asset',
          entityId: asset?.id,
          details: { asset }
        });
      }
      return res;
    } catch (error) {
      console.error('Error updating fixed asset:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('delete-fixed-asset', async (event, id) => {
    try {
      const ctx = authorize(event, { permissions: 'write:fixed-assets' });
      const res = await FixedAssets.delete(id);
      if (res?.success) {
        AuditLog.log({
          userId: ctx.userId,
          action: 'delete',
          entityType: 'fixed_asset',
          entityId: id
        });
      }
      return res;
    } catch (error) {
      console.error('Error deleting fixed asset:', error);
      throw error;
    }
  });

  // Transactions handlers
  ipcMain.handle('get-transactions', async () => {
    try {
      return await Transactions.getAll();
    } catch (error) {
      console.error('Error getting transactions:', error);
      throw error;
    }
  });

  ipcMain.handle('create-transaction', async (event, transaction) => {
    try {
      const ctx = authorize(event, { permissions: 'write:transactions' });
      console.log('Creating transaction:', transaction);
      const res = await Transactions.insert(transaction);
      if (res?.changes > 0) {
        AuditLog.log({
          userId: ctx.userId,
          action: 'create',
          entityType: 'transaction',
          entityId: res.lastInsertRowid,
          details: { transaction }
        });
      }
      return res;
    } catch (error) {
      console.error('Error creating transaction:', error);
      throw error;
    }
  });

  ipcMain.handle('void-transaction', async (event, id) => {
    try {
      const ctx = authorize(event, { permissions: 'write:transactions' });
      const res = await Transactions.voidTransaction(id);
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
      return { success: false, error: error.message };
    }
  });

  // Trial Balance by date range
  ipcMain.handle('get-trial-balance', async (_, startDate, endDate) => {
    try {
      return await Transactions.getTrialBalance(startDate, endDate);
    } catch (error) {
      console.error('Error getting trial balance:', error);
      return { error: error.message };
    }
  });

  // Consolidated Trial Balance across entities
  ipcMain.handle('get-trial-balance-consolidated', async (event, { entityIds, startDate, endDate, eliminateIntercompany = true }) => {
    try {
      const ctx = authorize(event, { permissions: 'read:reports' });
      // Enforce entity ACL: all ids must be accessible by user
      const allowed = Entities.listUserEntities(ctx.userId).map(e => e.id);
      const requested = Array.isArray(entityIds) ? entityIds : [];
      const unauthorized = requested.filter(id => !allowed.includes(id));
      if (unauthorized.length > 0) throw new Error('Unauthorized entities requested');

      return await Transactions.getTrialBalanceByEntities(requested, startDate, endDate, { eliminateIntercompany });
    } catch (error) {
      console.error('Error getting consolidated trial balance:', error);
      return { error: error.message };
    }
  });

  // Advanced Trial Balance (filters: entityIds, class, location, department)
  ipcMain.handle('get-trial-balance-advanced', async (event, filters) => {
    try {
      authorize(event, { permissions: 'read:reports' });
      return Transactions.getTrialBalanceAdvanced(filters || {});
    } catch (error) {
      console.error('Error getting advanced trial balance:', error);
      return { error: error.message };
    }
  });

  // Handle reconciliation
  ipcMain.handle('reconcile-transactions', async (event, data) => {
    try {
      const ctx = authorize(event, { permissions: 'write:reconcile' });
      const res = await Transactions.reconcileTransactions(data);
      if (res?.success) {
        AuditLog.log({
          userId: ctx.userId,
          action: 'reconcile',
          entityType: 'account',
          entityId: data?.accountId,
          details: { statementDate: data?.statementDate, transactionIds: data?.transactions }
        });
      }
      return res;
    } catch (error) {
      console.error('Error reconciling transactions:', error);
      return { success: false, error: error.message };
    }
  });

  // Entities management
  ipcMain.handle('entities-list', async (event) => {
    try {
      let ctx = null;
      try {
        ctx = authorize(event, { permissions: 'read:entities' });
      } catch (e) {
        // Fallback: allow listing for UI bootstrap when no auth context is set
        ctx = null;
      }

      const all = Entities.listEntities();
      if (ctx && ctx.role === 'Admin') return all;
      if (ctx && ctx.userId) return Entities.listUserEntities(ctx.userId);
      return all;
    } catch (error) {
      console.error('Error listing entities:', error);
      return { error: error.message };
    }
  });

  // Dimensions (classes / locations / departments)
  ipcMain.handle('classes-list', async () => {
    try {
      return require('../models/classes').list();
    } catch (error) {
      console.error('Error listing classes:', error);
      return { error: error.message };
    }
  });

  // COA Import/Export + Versions
  ipcMain.handle('coa-export-template', async () => {
    try {
      // CSV header and a sample row
      const header = 'number,name,type,status';
      const sample = '1000,Cash,Asset,Active';
      return { success: true, csv: `${header}\n${sample}\n` };
    } catch (error) {
      return { error: error.message };
    }
  });

  ipcMain.handle('coa-export-current', async () => {
    try {
      const rows = await ChartOfAccounts.getAllAccounts();
      const header = 'number,name,type,status';
      const body = (rows || []).map(r => {
        const num = r.accountNumber || r.number || '';
        const name = r.accountName || r.name || '';
        const type = r.type || '';
        const status = r.status || 'Active';
        return [num, name, type, status].map(v => String(v ?? '').replace(/"/g, '""')).join(',');
      }).join('\n');
      return { success: true, csv: `${header}\n${body}\n` };
    } catch (error) {
      return { error: error.message };
    }
  });

  ipcMain.handle('coa-import', async (_event, { csvText, note }) => {
    try {
      if (!csvText || typeof csvText !== 'string') throw new Error('csvText required');
      const COAVersions = require('../models/coaVersions');
      // snapshot before import
      try { COAVersions.createFromCurrent(note || 'Pre-import snapshot'); } catch {}

      const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length <= 1) throw new Error('CSV has no data rows');
      const header = lines.shift();
      const cols = header.split(',').map(h => h.trim().toLowerCase());
      const idxNum = cols.indexOf('number');
      const idxName = cols.indexOf('name');
      const idxType = cols.indexOf('type');
      const idxStatus = cols.indexOf('status');
      const toInsert = [];
      for (const line of lines) {
        const parts = line.split(',').map(p => p.trim());
        const number = idxNum >= 0 ? parts[idxNum] : null;
        const name = idxName >= 0 ? parts[idxName] : null;
        const type = idxType >= 0 ? parts[idxType] : null;
        const status = idxStatus >= 0 ? parts[idxStatus] : 'Active';
        if (!name || !type) continue;
        toInsert.push({ name, type, number, status });
      }
      for (const acc of toInsert) {
        try { await ChartOfAccounts.insertAccount(acc.name, acc.type, acc.number || null, 'import'); } catch {}
      }
      // snapshot after
      try { COAVersions.createFromCurrent(note || 'Post-import snapshot'); } catch {}
      return { success: true, inserted: toInsert.length };
    } catch (error) {
      return { error: error.message };
    }
  });

  ipcMain.handle('coa-versions-list', async () => {
    try {
      const COAVersions = require('../models/coaVersions');
      return COAVersions.list(100);
    } catch (error) {
      return { error: error.message };
    }
  });

  ipcMain.handle('coa-version-create', async (_e, note) => {
    try {
      const COAVersions = require('../models/coaVersions');
      return COAVersions.createFromCurrent(note || 'Manual snapshot');
    } catch (error) {
      return { error: error.message };
    }
  });

  ipcMain.handle('coa-version-restore', async (_e, id) => {
    try {
      const COAVersions = require('../models/coaVersions');
      return COAVersions.restore(id);
    } catch (error) {
      return { error: error.message };
    }
  });
  ipcMain.handle('classes-create', async (_e, payload) => {
    try {
      return require('../models/classes').create(payload || {});
    } catch (error) {
      console.error('Error creating class:', error);
      return { error: error.message };
    }
  });
  ipcMain.handle('locations-list', async () => {
    try {
      return require('../models/locations').list();
    } catch (error) {
      console.error('Error listing locations:', error);
      return { error: error.message };
    }
  });
  ipcMain.handle('locations-create', async (_e, payload) => {
    try {
      return require('../models/locations').create(payload || {});
    } catch (error) {
      console.error('Error creating location:', error);
      return { error: error.message };
    }
  });
  ipcMain.handle('departments-list', async () => {
    try {
      return require('../models/departments').list();
    } catch (error) {
      console.error('Error listing departments:', error);
      return { error: error.message };
    }
  });
  ipcMain.handle('departments-create', async (_e, payload) => {
    try {
      return require('../models/departments').create(payload || {});
    } catch (error) {
      console.error('Error creating department:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('entities-create', async (event, payload) => {
    try {
      const ctx = authorize(event, { roles: ['Admin'] });
      const res = Entities.createEntity(payload || {});
      return res;
    } catch (error) {
      console.error('Error creating entity:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('entity-assign-user', async (event, { userId, entityId, role }) => {
    try {
      const ctx = authorize(event, { roles: ['Admin', 'Manager'] });
      const res = Entities.assignUserToEntity({ userId, entityId, role });
      return res;
    } catch (error) {
      console.error('Error assigning user to entity:', error);
      return { error: error.message };
    }
  });

  // Intercompany transfer
  ipcMain.handle('create-intercompany-transfer', async (event, payload) => {
    try {
      const ctx = authorize(event, { permissions: 'write:transactions' });
      const res = Transactions.createIntercompanyTransfer(payload || {});
      return res;
    } catch (error) {
      console.error('Error creating intercompany transfer:', error);
      return { error: error.message };
    }
  });

  // Closing date controls
  ipcMain.handle('get-closing-date', async (event) => {
    try {
      authorize(event, { permissions: 'read:*' });
      return { success: true, closingDate: Settings.get('closingDate') || null };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('set-closing-date', async (event, closingDate) => {
    try {
      const ctx = authorize(event, { roles: ['Admin'] });
      if (!closingDate || typeof closingDate !== 'string') throw new Error('closingDate must be YYYY-MM-DD');
      Settings.set('closingDate', closingDate);
      AuditLog.log({ userId: ctx.userId, action: 'update', entityType: 'setting', entityId: 'closingDate', details: { closingDate } });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('clear-closing-date', async (event) => {
    try {
      const ctx = authorize(event, { roles: ['Admin'] });
      Settings.set('closingDate', null);
      AuditLog.log({ userId: ctx.userId, action: 'update', entityType: 'setting', entityId: 'closingDate', details: { closingDate: null } });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

// Audit Trail handlers
ipcMain.handle('audit-list', async (_e, opts) => {
  try {
    return AuditLog.list(opts || {});
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('audit-search', async (_e, filters) => {
  try {
    return AuditLog.search(filters || {});
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('audit-stats', async () => {
  try {
    return AuditLog.stats();
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('audit-verify-chain', async (_e, limit) => {
  try {
    return AuditLog.verifyChain(limit || 100);
  } catch (e) { return { error: e.message }; }
});

}

module.exports = registerAccountingHandlers;