const { ipcMain } = require('electron');
const ChartOfAccounts = require('../models/chartOfAccounts');
const JournalEntries  = require('../models/journalEntries');
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

  // ── COA Full-feature handlers ──────────────────────────────────────────
  safeHandle('insert-chart-account', async (event, payloadOrName, type, number, entered_by, openingBalance, status, parentId, description) => {
    try {
      const ctx = authorize(event, { permissions: 'write:chart-accounts' });
      // Accept both full-object and legacy positional args
      const payload = (payloadOrName && typeof payloadOrName === 'object')
        ? payloadOrName
        : { name: payloadOrName, type, number, entered_by, openingBalance, status, parentId, description };
      const res = ChartOfAccounts.insertAccount(payload);
      if (res?.success) {
        AuditLog.log({ userId: ctx.userId, action: 'create', entityType: 'chart_account', entityId: res.id, details: payload });
      }
      return res;
    } catch (error) {
      console.error('Error creating account:', error);
      return { error: error.message, success: false };
    }
  });

  safeHandle('update-chart-account', async (event, accountData) => {
    try {
      const ctx = authorize(event, { permissions: 'write:chart-accounts' });
      const res = ChartOfAccounts.updateAccount(accountData);
      if (res?.success) {
        AuditLog.log({ userId: ctx.userId, action: 'update', entityType: 'chart_account', entityId: accountData.id, details: accountData });
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
      const res = ChartOfAccounts.deleteAccount(id);
      if (res?.success) {
        AuditLog.log({ userId: ctx.userId, action: res.softDelete ? 'deactivate' : 'delete', entityType: 'chart_account', entityId: id });
      }
      return res;
    } catch (error) {
      console.error('Error deleting account:', error);
      return { error: error.message, success: false };
    }
  });

  safeHandle('coa-seed-system-accounts', async (_e) => {
    try {
      ChartOfAccounts.seedSystemAccounts();
      return { success: true };
    } catch (e) { return { error: e.message }; }
  });

  safeHandle('coa-bulk-create', async (_e, accounts) => {
    try {
      return ChartOfAccounts.bulkInsert(Array.isArray(accounts) ? accounts : []);
    } catch (e) { return { error: e.message }; }
  });

  safeHandle('coa-get-subtypes', async () => {
    try { return ChartOfAccounts.getSubTypes(); }
    catch (e) { return {}; }
  });

  safeHandle('get-account-activity', async (_e, accountId, opts) => {
    try { return ChartOfAccounts.getAccountActivity(accountId, opts || {}); }
    catch (e) { return []; }
  });

  // ── Journal Entry handlers ─────────────────────────────────────────────
  safeHandle('journal-post', async (event, entry) => {
    try {
      const ctx = authorize(event, { permissions: 'write:transactions' });
      const res = JournalEntries.post(entry);
      if (res?.success) {
        AuditLog.log({ userId: ctx.userId, action: 'create', entityType: 'journal_entry', entityId: res.id, details: entry });
      }
      return res;
    } catch (e) { return { error: e.message }; }
  });

  safeHandle('journal-list', async (_e, filters) => {
    try { return JournalEntries.getAll(filters || {}); }
    catch (e) { return []; }
  });

  safeHandle('journal-by-account', async (_e, accountId, opts) => {
    try { return JournalEntries.getByAccount(accountId, opts || {}); }
    catch (e) { return []; }
  });

  safeHandle('journal-void', async (event, id) => {
    try {
      const ctx = authorize(event, { permissions: 'write:transactions' });
      const res = JournalEntries.voidEntry(id);
      if (res?.success) {
        AuditLog.log({ userId: ctx.userId, action: 'void', entityType: 'journal_entry', entityId: id });
      }
      return res;
    } catch (e) { return { error: e.message }; }
  });

  safeHandle('journal-reverse', async (event, journalId, date) => {
    try {
      const ctx = authorize(event, { permissions: 'write:transactions' });
      return JournalEntries.reverse(journalId, date, ctx.userId);
    } catch (e) { return { error: e.message }; }
  });

  safeHandle('journal-post-invoice', async (_e, invoice) => {
    try { return JournalEntries.postInvoice(invoice); }
    catch (e) { return { error: e.message }; }
  });

  safeHandle('journal-post-payment', async (_e, payment) => {
    try { return JournalEntries.postPayment(payment); }
    catch (e) { return { error: e.message }; }
  });

  safeHandle('journal-post-expense', async (_e, expense) => {
    try { return JournalEntries.postExpense(expense); }
    catch (e) { return { error: e.message }; }
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

  // Dashboard balance cards — pre-aggregated by account category
  safeHandle('get-dashboard-balances', async () => {
    try {
      const db = require('../models/dbmgr');
      const rows = db.prepare(`
        SELECT
          coa.type        AS type,
          coa.subType     AS subType,
          coa.normalBalance,
          coa.openingBalance,
          coa.id          AS accountId,
          COALESCE(SUM(jl.debit),  0) AS totalDebit,
          COALESCE(SUM(jl.credit), 0) AS totalCredit
        FROM chart_of_accounts coa
        LEFT JOIN journal_lines jl   ON jl.account_id = coa.id
        LEFT JOIN journal_entries je ON je.id = jl.journal_id AND je.status = 'Posted'
        WHERE coa.status = 'Active'
        GROUP BY coa.id
      `).all();

      const sum = (filterFn) => rows
        .filter(filterFn)
        .reduce((s, r) => {
          const nb  = r.normalBalance || 'Debit';
          const base = Number(r.openingBalance || 0);
          const bal  = nb === 'Debit'
            ? base + r.totalDebit - r.totalCredit
            : base + r.totalCredit - r.totalDebit;
          return s + bal;
        }, 0);

      const t  = (r) => (r.type    || '').toLowerCase();
      const st = (r) => (r.subType || '').toLowerCase();

      return {
        bank:     sum(r => t(r) === 'bank' || t(r) === 'cash'),
        ar:       sum(r => st(r) === 'accounts receivable' || t(r) === 'accounts receivable'),
        ap:       sum(r => st(r) === 'accounts payable'    || t(r) === 'accounts payable'),
        cc:       sum(r => t(r) === 'credit card'),
        loans:    sum(r => t(r) === 'loan' || st(r).includes('loan') || st(r) === 'long-term liability' || st(r) === 'line of credit' || st(r) === 'mortgage'),
        revenue:  sum(r => t(r) === 'income' || t(r) === 'other income'),
        expenses: sum(r => t(r) === 'expense' || t(r) === 'other expense' || t(r) === 'cost of goods sold'),
        equity:   sum(r => t(r) === 'equity'),
      };
    } catch (e) {
      console.error('Error getting dashboard balances:', e);
      return { bank: 0, ar: 0, ap: 0, cc: 0, loans: 0, revenue: 0, expenses: 0, equity: 0 };
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
      const idxNum     = cols.indexOf('number');
      const idxName    = cols.indexOf('name');
      const idxType    = cols.indexOf('type');
      const idxSubType = cols.indexOf('subtype');
      const idxStatus  = cols.indexOf('status');
      const toInsert = [];
      for (const line of lines) {
        const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        const number  = idxNum     >= 0 ? (parts[idxNum]     || '').trim() || null : null;
        const name    = idxName    >= 0 ? (parts[idxName]    || '').trim()         : null;
        const rawType = idxType    >= 0 ? (parts[idxType]    || '').trim()         : '';
        const type    = rawType || 'Expense'; // default to Expense if column absent or empty
        const subType = idxSubType >= 0 ? (parts[idxSubType] || '').trim() || null : null;
        const status  = idxStatus  >= 0 ? (parts[idxStatus]  || '').trim() || 'Active' : 'Active';
        if (!name) continue; // only skip rows with no name
        toInsert.push({ name, type, subType, number, status });
      }
      for (const acc of toInsert) {
        try { ChartOfAccounts.insertAccount({ name: acc.name, type: acc.type, subType: acc.subType || null, number: acc.number || null, status: acc.status || 'Active', entered_by: 'import' }); } catch {}
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

  // Roles CRUD
  safeHandle('roles-list', async () => {
    try {
      return require('../models/roles').list();
    } catch (error) {
      console.error('Error listing roles:', error);
      return [];
    }
  });
  safeHandle('roles-create', async (_e, name, description) => {
    try {
      return require('../models/roles').create(name, description);
    } catch (error) {
      console.error('Error creating role:', error);
      return { success: false, error: error.message };
    }
  });
  safeHandle('roles-update', async (_e, id, name, description) => {
    try {
      return require('../models/roles').update(id, name, description);
    } catch (error) {
      console.error('Error updating role:', error);
      return { success: false, error: error.message };
    }
  });
  safeHandle('roles-delete', async (_e, id) => {
    try {
      return require('../models/roles').remove(id);
    } catch (error) {
      console.error('Error deleting role:', error);
      return { success: false, error: error.message };
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