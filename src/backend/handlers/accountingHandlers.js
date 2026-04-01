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

// NOTE: 'deletingrecord' handler is registered in ipcHandlers.js — do NOT duplicate here
function registerAccountingHandlers() {
  // Safe handler registration – skip duplicates instead of crashing
  const safeHandle = (channel, handler) => {
    try {
      ipcMain.handle(channel, handler);
    } catch (e) {
      if (e.message && e.message.includes('second handler')) {
        console.warn(`[accountingHandlers] Skipping duplicate channel: ${channel}`);
      } else {
        console.error(`[accountingHandlers] Error registering '${channel}':`, e);
      }
    }
  };

  // Chart of Accounts handlers
  safeHandle('get-chart-of-accounts', async () => {
    try {
      return await ChartOfAccounts.getAllAccounts();
    } catch (error) {
      console.error('Error fetching chart of accounts:', error);
      return { error: error.message };
    }
  });
  safeHandle('get-budgets', async () => {
  try {
    console.log('[ipcHandlers] get-budgets invoked');
    return await Budgets.getBudgets();
  } catch (error) {
    console.error('Error fetching budgets:', error);
    return { error: error.message };
  }
});
// convert quote
safeHandle('convertquote', async (event,quote_id) => {
  try {
    return await Quotes.convertToInvoice(quote_id);
  } catch (error) {    
    console.error('Error converting quote:', error);
    return { error: error.message };
  }
});
safeHandle('insert-budget', async (event, department, period, amount, forecast, entered_by) => {
  try {
    console.log('Inserting budget:', department, period, amount, forecast, entered_by);
    return await Budgets.insertBudget(department, period, amount, forecast, entered_by);
  } catch (error) {
    console.error('Error inserting budget:', error);
    return { error: error.message };
  }
});

safeHandle('update-budget', async (_e, id, department, period, amount, forecast) => {
  try {
    return Budgets.updateBudget(id, department, period, amount, forecast);
  } catch (error) {
    return { error: error.message };
  }
});

safeHandle('delete-budget', async (_e, id) => {
  try {
    return Budgets.deleteBudget(id);
  } catch (error) {
    return { error: error.message };
  }
});

safeHandle('budget-vs-actual', async (_e, period) => {
  try {
    return Budgets.getVsActual(period);
  } catch (error) {
    return { error: error.message };
  }
});

safeHandle('budget-periods', async () => {
  try {
    return Budgets.getPeriods();
  } catch (error) {
    return { error: error.message };
  }
});

  safeHandle('insert-chart-account', async (event, name, type, number, entered_by) => {
    try {
      const ctx = authorize(event, { permissions: 'write:chart-accounts' });
      return await ChartOfAccounts.insertAccount(name, type, number, entered_by);
    } catch (error) {
      console.error('Error creating account:', error);
      return { error: error.message, success: false };
    }
  });

  safeHandle('update-chart-account', async (event, accountData) => {
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

  safeHandle('delete-chart-account', async (event, id) => {
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
  safeHandle('get-cashflow-projections', async (_, year) => {
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

  safeHandle('save-cashflow-projections', async (_, projections, year) => {
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
  safeHandle('get-fixed-assets', async () => {
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

  safeHandle('insert-fixed-asset', async (event, asset) => {
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

  safeHandle('update-fixed-asset', async (event, asset) => {
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

  safeHandle('delete-fixed-asset', async (event, id) => {
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
  safeHandle('get-transactions', async () => {
    try {
      return await Transactions.getAll();
    } catch (error) {
      console.error('Error getting transactions:', error);
      throw error;
    }
  });

  safeHandle('create-transaction', async (event, transaction) => {
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

  safeHandle('void-transaction', async (event, id) => {
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
  safeHandle('get-trial-balance', async (_, startDate, endDate) => {
    try {
      return await Transactions.getTrialBalance(startDate, endDate);
    } catch (error) {
      console.error('Error getting trial balance:', error);
      return { error: error.message };
    }
  });

  // Consolidated Trial Balance across entities
  safeHandle('get-trial-balance-consolidated', async (event, { entityIds, startDate, endDate, eliminateIntercompany = true }) => {
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
  safeHandle('get-trial-balance-advanced', async (event, filters) => {
    try {
      authorize(event, { permissions: 'read:reports' });
      return Transactions.getTrialBalanceAdvanced(filters || {});
    } catch (error) {
      console.error('Error getting advanced trial balance:', error);
      return { error: error.message };
    }
  });

  // Handle reconciliation
  safeHandle('reconcile-transactions', async (event, data) => {
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
  safeHandle('entities-list', async (event) => {
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
  safeHandle('classes-list', async () => {
    try {
      return require('../models/classes').list();
    } catch (error) {
      console.error('Error listing classes:', error);
      return { error: error.message };
    }
  });

  // COA Import/Export + Versions
  safeHandle('coa-export-template', async () => {
    try {
      // CSV header and a sample row
      const header = 'number,name,type,status';
      const sample = '1000,Cash,Asset,Active';
      return { success: true, csv: `${header}\n${sample}\n` };
    } catch (error) {
      return { error: error.message };
    }
  });

  safeHandle('coa-export-current', async () => {
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

  safeHandle('coa-import', async (_event, { csvText, note }) => {
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

  safeHandle('coa-versions-list', async () => {
    try {
      const COAVersions = require('../models/coaVersions');
      return COAVersions.list(100);
    } catch (error) {
      return { error: error.message };
    }
  });

  safeHandle('coa-version-create', async (_e, note) => {
    try {
      const COAVersions = require('../models/coaVersions');
      return COAVersions.createFromCurrent(note || 'Manual snapshot');
    } catch (error) {
      return { error: error.message };
    }
  });

  safeHandle('coa-version-restore', async (_e, id) => {
    try {
      const COAVersions = require('../models/coaVersions');
      return COAVersions.restore(id);
    } catch (error) {
      return { error: error.message };
    }
  });
  safeHandle('classes-create', async (_e, payload) => {
    try {
      return require('../models/classes').create(payload || {});
    } catch (error) {
      console.error('Error creating class:', error);
      return { error: error.message };
    }
  });
  safeHandle('locations-list', async () => {
    try {
      return require('../models/locations').list();
    } catch (error) {
      console.error('Error listing locations:', error);
      return { error: error.message };
    }
  });
  safeHandle('locations-create', async (_e, payload) => {
    try {
      return require('../models/locations').create(payload || {});
    } catch (error) {
      console.error('Error creating location:', error);
      return { error: error.message };
    }
  });
  safeHandle('departments-list', async () => {
    try {
      return require('../models/departments').list();
    } catch (error) {
      console.error('Error listing departments:', error);
      return { error: error.message };
    }
  });
  safeHandle('departments-create', async (_e, payload) => {
    try {
      return require('../models/departments').create(payload || {});
    } catch (error) {
      console.error('Error creating department:', error);
      return { error: error.message };
    }
  });

  safeHandle('entities-create', async (event, payload) => {
    try {
      const ctx = authorize(event, { roles: ['Admin'] });
      const res = Entities.createEntity(payload || {});
      return res;
    } catch (error) {
      console.error('Error creating entity:', error);
      return { error: error.message };
    }
  });

  safeHandle('entity-assign-user', async (event, { userId, entityId, role }) => {
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
  safeHandle('create-intercompany-transfer', async (event, payload) => {
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
  safeHandle('get-closing-date', async (event) => {
    try {
      authorize(event, { permissions: 'read:*' });
      return { success: true, closingDate: Settings.get('closingDate') || null };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  safeHandle('set-closing-date', async (event, closingDate) => {
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

  safeHandle('clear-closing-date', async (event) => {
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
safeHandle('audit-list', async (_e, opts) => {
  try {
    return AuditLog.list(opts || {});
  } catch (e) { return { error: e.message }; }
});

safeHandle('audit-search', async (_e, filters) => {
  try {
    return AuditLog.search(filters || {});
  } catch (e) { return { error: e.message }; }
});

safeHandle('audit-stats', async () => {
  try {
    return AuditLog.stats();
  } catch (e) { return { error: e.message }; }
});

safeHandle('audit-verify-chain', async (_e, limit) => {
  try {
    return AuditLog.verifyChain(limit || 100);
  } catch (e) { return { error: e.message }; }
});

}

module.exports = registerAccountingHandlers;