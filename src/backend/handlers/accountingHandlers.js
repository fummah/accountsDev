const { ipcMain } = require('electron');
const ChartOfAccounts = require('../models/chartOfAccounts');
const { getBillLineAccounts } = require('../services/accountEligibility');
const { getExpectedNormalBalance, normalizeNormalBalance } = require('../services/normalBalance');
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
const db = require('../models/dbmgr');
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

  // Auto-repost all unposted transactions to general ledger on startup
  try {
    const repostAll = async () => {
      console.log('[accountingHandlers] Running startup auto-repost check...');
      // Invoices
      const invoices = db.prepare("SELECT * FROM invoices WHERE status IS NULL OR LOWER(status) NOT IN ('draft', 'void', 'voided')").all();
      let invCount = 0;
      for (const inv of invoices) {
        try {
          const res = JournalEntries.postInvoice(inv);
          if (res?.success) invCount++;
        } catch {}
      }
      // Expenses
      let expenses = [];
      try { expenses = db.prepare("SELECT * FROM expenses").all(); } catch {}
      let expCount = 0;
      for (const exp of expenses) {
        try {
          const res = JournalEntries.postExpense(exp);
          if (res?.success) expCount++;
        } catch {}
      }
      // Payments
      let payments = [];
      try { payments = db.prepare("SELECT * FROM payments").all(); } catch {}
      let pmtCount = 0;
      for (const pmt of payments) {
        try {
          const res = JournalEntries.postPayment(pmt);
          if (res?.success) pmtCount++;
        } catch {}
      }
      console.log(`[accountingHandlers] Auto-repost completed. Invoices posted: ${invCount}, Expenses: ${expCount}, Payments: ${pmtCount}`);
    };
    setTimeout(repostAll, 1000);
  } catch (repostErr) {
    console.error('[accountingHandlers] Auto-repost failed:', repostErr);
  }

  // Chart of Accounts handlers
  // NOTE: `context` is OPT-IN and additive. Omitting it (every existing caller)
  // returns exactly the same rows as before. `context: 'bill'` narrows the
  // result to accounts that are valid on a vendor-bill line item — this keeps
  // the filtering server-side and authoritative without changing the shared
  // endpoint for Invoices / Deposits / Checks / Journal / Reconciliation /
  // Products, which all rely on the unfiltered list.
  safeHandle('get-chart-of-accounts', async (_e, { dateFrom, dateTo, type, context } = {}) => {
    try {
      const accounts = await ChartOfAccounts.getAllAccounts({ dateFrom, dateTo, type });
      if (context === 'bill' && Array.isArray(accounts)) {
        return getBillLineAccounts(accounts);
      }
      return accounts;
    } catch (error) {
      console.error('Error fetching chart of accounts:', error);
      return { error: error.message };
    }
  });

  // ── Normal-balance metadata repair (idempotent, ledger-neutral) ───────────
  // Reads the stored normal side against the account's classification and
  // corrects any contradiction. Only chart_of_accounts.normalBalance is ever
  // written — never a journal entry, line, transaction amount or opening
  // balance. `dryRun: true` returns the proposed changes without writing.
  safeHandle('repair-normal-balances', async (_e, { dryRun = false } = {}) => {
    try {
      const { repairNormalBalances } = require('../services/normalBalance');
      return { success: true, ...repairNormalBalances(require('../models/dbmgr'), { dryRun }) };
    } catch (error) {
      console.error('Error repairing normal balances:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Ledger opening / brought-forward row ──────────────────────────────────
  // The account's opening balance is stored on the account itself
  // (chart_of_accounts.openingBalance), NOT as a journal entry. The ledger must
  // therefore derive its first row from that column plus any posted lines dated
  // before the period — never by inventing a posting.
  //
  // Read-only: this handler performs no writes and creates no journal entry, so
  // it cannot double-count money that is already inside the computed balance.
  safeHandle('ledger-opening-row', async (_e, { accountId, before } = {}) => {
    try {
      const OpeningBalance = require('../services/openingBalance');
      const st = OpeningBalance.forAccount(db, accountId, { before });
      if (!st) return { success: false, error: 'account_not_found' };
      return { success: true, ...st, row: OpeningBalance.openingRow(st) };
    } catch (error) {
      console.error('Error reading ledger opening row:', error);
      return { success: false, error: error.message };
    }
  });

  // The authoritative account-type → normal-balance rule (for diagnostics/UI).
  safeHandle('get-normal-balance-rules', async () => {
    try {
      const { NORMAL_BALANCE, LEGACY_TYPE_NORMAL_BALANCE } = require('../services/normalBalance');
      return { success: true, canonical: NORMAL_BALANCE, legacyTypes: LEGACY_TYPE_NORMAL_BALANCE };
    } catch (error) {
      console.error('Error reading normal balance rules:', error);
      return { success: false, error: error.message };
    }
  });

  // Dashboard balance cards — live balances per account category.
  //
  // Computed with the SAME authoritative engine the Chart of Accounts / General
  // Ledger use (`ChartOfAccounts.getAllAccounts` → `computedBalance`: Posted
  // journal lines + opening balance, normal side taken from the account's real
  // classification). No second balance formula lives here.
  //
  // Each account contributes its OWN (direct) balance, never a rolled-up parent
  // balance, so a grouping parent + its children are never double counted while
  // direct parent postings are still included.
  safeHandle('get-dashboard-balances', async () => {
    try {
      // Active accounts only — the SAME population the Trial Balance and the
      // original dashboard used (inactive accounts are retired from reporting).
      const accounts = (ChartOfAccounts.getAllAccounts() || [])
        .filter(a => String(a.status || 'Active').toLowerCase() === 'active');
      const typeOf = (a) => String(a.accountType || a.type || '').toLowerCase();
      const subOf  = (a) => String(a.accountSubType || a.subType || '').toLowerCase();
      const ownBal = (a) => Number(a.ownBalance != null ? a.ownBalance : (a.balance || 0)) || 0;
      const sum = (fn) => accounts.filter(fn).reduce((s, a) => s + ownBal(a), 0);

      return {
        bank:     sum(a => typeOf(a) === 'bank' || typeOf(a) === 'cash'),
        ar:       sum(a => subOf(a) === 'accounts receivable' || typeOf(a) === 'accounts receivable'),
        ap:       sum(a => subOf(a) === 'accounts payable'    || typeOf(a) === 'accounts payable'),
        cc:       sum(a => typeOf(a) === 'credit card'),
        loans:    sum(a => typeOf(a) === 'loan' || subOf(a).includes('loan') || subOf(a) === 'long-term liability' || subOf(a) === 'line of credit' || subOf(a) === 'mortgage'),
        revenue:  sum(a => typeOf(a) === 'income' || typeOf(a) === 'other income'),
        expenses: sum(a => typeOf(a) === 'expense' || typeOf(a) === 'other expense' || typeOf(a) === 'cost of goods sold'),
        equity:   sum(a => typeOf(a) === 'equity'),
      };
    } catch (e) {
      console.error('Error getting dashboard balances:', e);
      // Signal a FAILURE (nulls), not a true zero, so the UI never renders a
      // failed load as "$0.00".
      return { error: e.message, bank: null, ar: null, ap: null, cc: null, loans: null, revenue: null, expenses: null, equity: null };
    }
  });
// convert quote → invoice (lifecycle operation; status is backend controlled)
safeHandle('convertquote', async (event,quote_id) => {
  try {
    return await Quotes.convertQuoteToInvoice(quote_id);
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
    try {
      const result = JournalEntries.getAll(filters || {});
      console.log('[journal-list] returning', result.length, 'entries with filters:', JSON.stringify(filters));
      return result;
    }
    catch (e) { console.error('[journal-list] error:', e); return []; }
  });

  safeHandle('journal-by-account', async (_e, accountId, opts) => {
    try { return JournalEntries.getByAccount(accountId, opts || {}); }
    catch (e) { return []; }
  });

  safeHandle('journal-get-by-id', async (_e, id) => {
    try { return JournalEntries.getById(id); }
    catch (e) { return { error: e.message }; }
  });

  safeHandle('journal-source-detail', async (_e, sourceType, sourceId) => {
    try { return JournalEntries.getSourceDetail(sourceType, sourceId); }
    catch (e) { return { error: e.message }; }
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

  safeHandle('journal-get-by-source', async (_e, sourceType, sourceId) => {
    try {
      const entry = db.prepare(
        `SELECT * FROM journal_entries WHERE source_type = ? AND source_id = ? AND status = 'Posted' ORDER BY id DESC LIMIT 1`
      ).get(sourceType, sourceId);
      if (!entry) return null;
      const lines = db.prepare('SELECT * FROM journal_lines WHERE journal_id = ? ORDER BY id ASC').all(entry.id);
      return { ...entry, lines };
    } catch (e) { return { error: e.message }; }
  });

  // Bulk lookup of the GL debit-line account ids for a list of transactions.
  // Used by the Credit Card Charges register to render the real Chart of
  // Accounts expense accounts (with hierarchy) for each charge.
  safeHandle('journal-transaction-accounts', async (_e, txIds) => {
    try {
      const ids = (Array.isArray(txIds) ? txIds : []).map(Number).filter(Boolean);
      if (!ids.length) return {};
      const ph = ids.map(() => '?').join(',');
      const rows = db.prepare(`
        SELECT je.source_id AS tx_id, jl.account_id AS account_id
        FROM journal_entries je
        JOIN journal_lines jl ON jl.journal_id = je.id
        WHERE je.source_type = 'transaction' AND je.status = 'Posted'
          AND je.source_id IN (${ph}) AND jl.debit > 0
        ORDER BY je.id ASC, jl.id ASC
      `).all(...ids);
      const out = {};
      rows.forEach(r => {
        const id = Number(r.account_id);
        if (!id) return;
        if (!out[r.tx_id]) out[r.tx_id] = [];
        if (!out[r.tx_id].includes(id)) out[r.tx_id].push(id);
      });
      return out;
    } catch (e) { return { error: e.message }; }
  });

  safeHandle('journal-post-expense', async (_e, expense) => {
    try { return JournalEntries.postExpense(expense); }
    catch (e) { return { error: e.message }; }
  });

  // Blockchain anchoring (stub — stores timestamp on the journal entry)
  safeHandle('journal-anchor', async (_e, entryId) => {
    try {
      const entry = db.prepare('SELECT id, status FROM journal_entries WHERE id = ?').get(entryId);
      if (!entry) return { error: 'Entry not found' };
      if (entry.status === 'Void') return { error: 'Cannot anchor a voided entry' };
      // Mark as anchored by storing a timestamp in memo or a dedicated flag
      db.prepare("UPDATE journal_entries SET memo = COALESCE(memo,'') || ' [Anchored: ' || datetime('now') || ']' WHERE id = ?").run(entryId);
      return { success: true, anchoredAt: new Date().toISOString() };
    } catch (e) { return { error: e.message }; }
  });

  // Retroactively post journal entries for all unposted invoices & expenses
  safeHandle('journal-repost-all', async () => {
    try {
      let posted = 0, skipped = 0, errors = 0;
      // Post all non-Draft invoices that don't have journal entries yet
      const invoices = db.prepare("SELECT * FROM invoices WHERE status IS NULL OR LOWER(status) NOT IN ('draft', 'void', 'voided')").all();
      for (const inv of invoices) {
        try {
          const res = JournalEntries.postInvoice(inv);
          if (res?.success) posted++;
          else if (res?.skipped) skipped++;
          else errors++;
        } catch { errors++; }
      }
      // Post all approved expenses
      let expenses = [];
      try { expenses = db.prepare("SELECT * FROM expenses WHERE approval_status IN ('Approved','Unpaid','Pending') OR approval_status IS NULL").all(); } catch {}
      for (const exp of expenses) {
        try {
          const res = JournalEntries.postExpense(exp);
          if (res?.success) posted++;
          else if (res?.skipped) skipped++;
          else errors++;
        } catch { errors++; }
      }
      // Post all payments
      let payments = [];
      try { payments = db.prepare("SELECT * FROM payments").all(); } catch {}
      for (const pmt of payments) {
        try {
          const res = JournalEntries.postPayment(pmt);
          if (res?.success) posted++;
          else if (res?.skipped) skipped++;
          else errors++;
        } catch { errors++; }
      }
      return { success: true, posted, skipped, errors };
    } catch (e) { return { error: e.message }; }
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

  safeHandle('get-budgets', async () => {
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
        LEFT JOIN (
          SELECT jl.*
          FROM journal_lines jl
          JOIN journal_entries je ON jl.journal_id = je.id AND je.status = 'Posted'
        ) jl ON jl.account_id = coa.id
        WHERE coa.status = 'Active'
        GROUP BY coa.id
      `).all();

      const sum = (filterFn) => rows
        .filter(filterFn)
        .reduce((s, r) => {
          // Single source of truth for the normal side (services/normalBalance.js).
          const nb  = getExpectedNormalBalance(r.type) || normalizeNormalBalance(r.normalBalance) || 'Debit';
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

  // Handle reconciliation (single canonical registration lives in
  // bankingHandlers.js; duplicate registrations were removed to avoid
  // registration-order-dependent behavior).

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
      // Strip UTF-8 BOM
      csvText = csvText.replace(/^\ufeff/, '');

      const COAVersions = require('../models/coaVersions');
      try { COAVersions.createFromCurrent(note || 'Pre-import snapshot'); } catch {}

      const parseLine = (line) => {
        const out = []; let cur = ''; let q = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else { q = !q; } }
          else if (ch === ',' && !q) { out.push(cur); cur = ''; }
          else { cur += ch; }
        }
        out.push(cur);
        return out.map(x => x.trim().replace(/^"|"$/g, ''));
      };

      const rawLines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (rawLines.length <= 1) throw new Error('CSV has no data rows');
      const cols = parseLine(rawLines[0]).map(h => h.toLowerCase().trim());
      const dataRows = rawLines.slice(1).map(parseLine);

      const col = (name) => cols.indexOf(name);
      // name: QB Desktop uses 'Account', QBO uses 'Name'
      const idxNum     = col('number') >= 0 ? col('number') : col('account number');
      const idxName    = col('name') >= 0 ? col('name') : col('account name') >= 0 ? col('account name') : col('account');
      const idxType    = col('type') >= 0 ? col('type') : col('account type');
      // QBO uses 'Detail Type'
      const idxSubType = col('subtype') >= 0 ? col('subtype') : col('sub type') >= 0 ? col('sub type') : col('detail type');
      const idxStatus  = col('status') >= 0 ? col('status') : col('active status');
      const idxDesc    = col('description') >= 0 ? col('description') : col('desc');
      const idxNormal  = col('normalbalance') >= 0 ? col('normalbalance') : col('normal balance');
      const idxBalance = col('openingbalance') >= 0 ? col('openingbalance') : col('opening balance') >= 0 ? col('opening balance') : col('balance total');
      const idxTaxLine = col('taxline') >= 0 ? col('taxline') : col('tax line');

      const toInsert = [];
      for (const parts of dataRows) {
        const get = (i) => (i >= 0 && parts[i]) ? parts[i].trim() : '';
        const name    = get(idxName);
        if (!name) continue;
        const rawType = get(idxType);
        const type    = rawType || 'Expense';
        const subType = get(idxSubType) || null;
        const number  = get(idxNum) || null;
        const status  = get(idxStatus) || 'Active';
        const description   = get(idxDesc) || null;
        const normalBalance = get(idxNormal) || null;
        const openingBalance = parseFloat(get(idxBalance) || '0') || 0;
        const taxLine        = get(idxTaxLine) || null;
        toInsert.push({ name, type, subType, number, status, description, normalBalance, openingBalance, taxLine });
      }
      let inserted = 0;
      const errors = [];
      for (const acc of toInsert) {
        try {
          const result = ChartOfAccounts.insertAccount({
            name: acc.name, type: acc.type, subType: acc.subType,
            number: acc.number, status: acc.status,
            description: acc.description, normalBalance: acc.normalBalance,
            openingBalance: acc.openingBalance,
            taxLine: acc.taxLine,
            entered_by: 'import'
          });
          if (result && result.success !== false) inserted++;
          else errors.push(`${acc.name}: ${result?.error || 'unknown error'}`);
        } catch (e) {
          errors.push(`${acc.name}: ${e.message}`);
        }
      }
      try { COAVersions.createFromCurrent(note || 'Post-import snapshot'); } catch {}
      return { success: true, inserted, total: toInsert.length, errors: errors.length ? errors : undefined };
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