const db = require('./dbmgr.js');
const {
  NORMAL_BALANCE,
  getExpectedNormalBalance,
  normalizeNormalBalance,
  repairNormalBalances,
} = require('../services/normalBalance');

// ── Standard sub-types per account type ─────────────────────────────────────
const ACCOUNT_SUBTYPES = {
  Asset:                ['Bank', 'Accounts Receivable', 'Inventory', 'Fixed Assets', 'Other Current Assets', 'Prepaid Expenses', 'Undeposited Funds', 'Other Asset'],
  Bank:                 ['Checking', 'Savings', 'Money Market', 'Other Bank'],
  Cash:                 ['Petty Cash', 'Cash on Hand'],
  Liability:            ['Accounts Payable', 'Payroll Liability', 'Other Current Liability', 'Deferred Revenue'],
  'Credit Card':        ['Visa', 'Mastercard', 'American Express', 'Other Credit Card'],
  Loan:                 ['Short-Term Loan', 'Long-Term Loan', 'Line of Credit', 'Mortgage', 'Equipment Loan', 'Vehicle Loan', 'Other Loan'],
  Equity:               ["Owner's Equity", 'Retained Earnings', 'Opening Balance Equity', 'Common Stock', 'Drawings'],
  Income:               ['Sales', 'Service Income', 'Product Sales', 'Discounts', 'Other Income'],
  'Cost of Goods Sold': ['Cost of Goods Sold', 'Purchases', 'Direct Labor', 'Freight'],
  Expense:              ['Advertising', 'Repairs & Maintenance', 'Utilities', 'Office Supplies', 'Rent', 'Salaries & Wages', 'Insurance', 'Travel', 'Depreciation', 'Interest Expense', 'Professional Fees', 'Vehicle Expenses', 'Bank Charges', 'Other Expense'],
  'Other Income':       ['Interest Income', 'Gain on Sale', 'Other Miscellaneous Income'],
  'Other Expense':      ['Interest Expense', 'Loss on Sale', 'Other Miscellaneous Expense'],
};

// ── Mandatory system accounts (seeded once on first run) ─────────────────────
const SYSTEM_ACCOUNTS = [
  { name: 'Accounts Receivable',   type: 'Asset',     subType: 'Accounts Receivable',  number: '1100', isSystem: 1 },
  { name: 'Inventory Asset',        type: 'Asset',     subType: 'Inventory',             number: '1200', isSystem: 1 },
  { name: 'Undeposited Funds',      type: 'Asset',     subType: 'Undeposited Funds',     number: '1050', isSystem: 1 },
  { name: 'Accounts Payable',       type: 'Liability', subType: 'Accounts Payable',      number: '2000', isSystem: 1 },
  { name: 'Retained Earnings',      type: 'Equity',    subType: 'Retained Earnings',     number: '3900', isSystem: 1 },
  { name: 'Opening Balance Equity', type: 'Equity',    subType: 'Opening Balance Equity',number: '3000', isSystem: 1 },
  { name: 'Sales Revenue',          type: 'Income',    subType: 'Sales',                 number: '4000', isSystem: 0 },
  { name: 'Service Revenue',        type: 'Income',    subType: 'Service Income',        number: '4100', isSystem: 0 },
  { name: 'Cost of Goods Sold',     type: 'Cost of Goods Sold', subType: 'Cost of Goods Sold', number: '5000', isSystem: 0 },
  { name: 'Inventory Adjustment',   type: 'Expense',   subType: 'Inventory Adjustment',  number: '6100', isSystem: 1 },
  { name: 'Payroll Expenses',       type: 'Expense',   subType: 'Salaries & Wages',      number: '6000', isSystem: 0 },
  { name: 'Payroll Liabilities',    type: 'Liability', subType: 'Payroll Liability',     number: '2200', isSystem: 0 },
];

// ── Account-type families — a child and its parent must belong to the same
//    family (mirrors ACCOUNT_TYPE_FAMILY in ChartOfAccounts.js). ──────────────
const TYPE_FAMILY = {
  'Asset': 'Asset', 'Bank': 'Asset', 'Cash': 'Asset',
  'Liability': 'Liability', 'Credit Card': 'Liability', 'Loan': 'Liability',
  'Equity': 'Equity',
  'Income': 'Income', 'Other Income': 'Income',
  'Cost of Goods Sold': 'Expense', 'Expense': 'Expense', 'Other Expense': 'Expense',
};

const isCompatibleParentType = (childType, parentType) => {
  if (!childType || !parentType) return true;
  return (TYPE_FAMILY[childType] || childType) === (TYPE_FAMILY[parentType] || parentType);
};

// Validate a parentId for insert/update: must exist, be type-compatible, and
// never create a self or circular reference in the hierarchy.
function assertValidParent(db, parentId, ownId, childType) {
  if (parentId == null || parentId === '' || Number(parentId) <= 0) return;
  const parentIdNum = Number(parentId);
  const own = ownId != null ? Number(ownId) : null;
  if (own != null && parentIdNum === own) {
    throw new Error('An account cannot be its own parent.');
  }
  const parent = db.prepare('SELECT id, type, parentId FROM chart_of_accounts WHERE id = ?').get(parentIdNum);
  if (!parent) {
    throw new Error(`Parent account #${parentIdNum} does not exist in the Chart of Accounts.`);
  }
  if (!isCompatibleParentType(childType, parent.type)) {
    throw new Error(`Parent account type "${parent.type || ''}" is not compatible with child type "${childType || ''}".`);
  }
  if (own != null) {
    // Walk up the parent chain to detect circular references.
    let cur = parent.parentId;
    const seen = new Set();
    while (cur != null) {
      const pid = Number(cur);
      if (seen.has(pid)) break;
      seen.add(pid);
      if (pid === own) {
        throw new Error('Setting this parent would create a circular reference in the account hierarchy.');
      }
      const up = db.prepare('SELECT parentId FROM chart_of_accounts WHERE id = ?').get(pid);
      cur = up && up.parentId != null ? up.parentId : null;
    }
  }
}

// ── Helper: compute balance from journal_lines for an account ────────────────
function computedBalance(id, normalBal, openingBalance, dateFrom, dateTo) {
  try {
    let sql = `
      SELECT COALESCE(SUM(jl.debit),0) AS d, COALESCE(SUM(jl.credit),0) AS c
      FROM journal_lines jl
      JOIN journal_entries je ON jl.journal_id = je.id
      WHERE jl.account_id = ? AND je.status = 'Posted'
    `;
    const params = [id];
    if (dateFrom) { sql += ' AND je.date >= ?'; params.push(dateFrom); }
    if (dateTo) { sql += ' AND je.date <= ?'; params.push(dateTo); }
    const row = db.prepare(sql).get(...params);
    const base = Number(openingBalance || 0);
    return normalBal === 'Debit'
      ? base + row.d - row.c
      : base + row.c - row.d;
  } catch {
    return Number(openingBalance || 0);
  }
}

const BALANCE_SHEET_TYPES = new Set(['Asset','Bank','Cash','Liability','Credit Card','Loan','Equity']);
const PNL_TYPES = new Set(['Income','Other Income','Expense','Other Expense','Cost of Goods Sold']);

const ChartOfAccounts = {
  createTable: () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS chart_of_accounts (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT NOT NULL,
        type            TEXT NOT NULL,
        subType         TEXT,
        number          TEXT,
        parentId        INTEGER,
        description     TEXT,
        taxLine         TEXT,
        normalBalance   TEXT DEFAULT 'Debit',
        openingBalance  REAL DEFAULT 0,
        openingBalanceDate TEXT,
        balance         REAL DEFAULT 0,
        status          TEXT DEFAULT 'Active',
        isSystem        INTEGER DEFAULT 0,
        entered_by      TEXT,
        date_entered    DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_modified   DATETIME
      )
    `).run();

    // Migrations for existing databases
    try {
      const cols = new Set(db.prepare("PRAGMA table_info('chart_of_accounts')").all().map(r => r.name));
      const add = (col, ddl) => { if (!cols.has(col)) db.prepare(`ALTER TABLE chart_of_accounts ADD COLUMN ${col} ${ddl}`).run(); };
      add('subType',             'TEXT');
      add('parentId',            'INTEGER');
      add('description',         'TEXT');
      add('taxLine',             'TEXT');
      add('normalBalance',       "TEXT DEFAULT 'Debit'");
      add('openingBalance',      'REAL DEFAULT 0');
      add('openingBalanceDate',  'TEXT');
      add('isSystem',            'INTEGER DEFAULT 0');
    } catch (e) {
      console.error('chart_of_accounts migration failed:', e);
    }

    // Repair normalBalance on existing rows.
    // NOTE: the test is NOT "is it blank". A row holding 'Credit' on a Bank
    // account is just as wrong as a blank one. The expected side is derived
    // purely from the account's type, so every mismatched row is corrected here
    // and already-correct rows are left alone. (Superseded the old blank-only
    // back-fill, which silently skipped every pre-existing wrong value.)
    // The versioned migration 003 owns the same repair for upgrade runs.
    try {
      repairNormalBalances(db);
    } catch (e) {
      console.error('chart_of_accounts normalBalance repair failed:', e);
    }

    ChartOfAccounts.seedSystemAccounts();
  },

  // ── Seed mandatory system accounts (idempotent) ─────────────────────────
  seedSystemAccounts: () => {
    for (const acc of SYSTEM_ACCOUNTS) {
      const exists = db.prepare("SELECT id FROM chart_of_accounts WHERE name = ? LIMIT 1").get(acc.name);
      if (!exists) {
        const nb = NORMAL_BALANCE[acc.type] || 'Debit';
        db.prepare(`
          INSERT INTO chart_of_accounts (name, type, subType, number, normalBalance, openingBalance, status, isSystem, entered_by)
          VALUES (?, ?, ?, ?, ?, 0, 'Active', ?, 'system')
        `).run(acc.name, acc.type, acc.subType, acc.number, nb, acc.isSystem);
      } else if (acc.isSystem) {
        db.prepare("UPDATE chart_of_accounts SET isSystem = 1 WHERE id = ?").run(exists.id);
      }
    }
  },

  // ── Fetch all accounts with computed balance ─────────────────────────────
  getAllAccounts: ({ dateFrom, dateTo, type } = {}) => {
    let sql = `
      SELECT id, name, type, subType, number, parentId, description, taxLine,
             normalBalance, openingBalance, openingBalanceDate, balance, status, isSystem
      FROM chart_of_accounts
    `;
    const params = [];
    if (type) {
      sql += ' WHERE LOWER(type) = LOWER(?)';
      params.push(String(type).trim());
    }
    sql += ' ORDER BY CAST(number AS INTEGER) ASC, name ASC';
    const rows = db.prepare(sql).all(...params);

    const accounts = rows.map(r => {
      // The account's type is authoritative for its normal side; the stored
      // value is only honoured when the classification is unknown.
      const nb = getExpectedNormalBalance(r.type) || normalizeNormalBalance(r.normalBalance) || 'Debit';
      // Balance Sheet accounts always use unfiltered balance; P&L accounts use date filter
      const isBS = BALANCE_SHEET_TYPES.has(r.type);
      const computed = isBS
        ? computedBalance(r.id, nb, r.openingBalance)
        : computedBalance(r.id, nb, r.openingBalance, dateFrom, dateTo);
      // If there are NO journal entries yet, fall back to the stored static balance
      const hasJournalActivity = (() => {
        try {
          return db.prepare('SELECT 1 FROM journal_lines WHERE account_id = ? LIMIT 1').get(r.id) != null;
        } catch { return false; }
      })();
      const finalBalance = hasJournalActivity ? computed : (r.balance || r.openingBalance || 0);

      return {
        id:                 r.id,
        accountName:        r.name,
        accountType:        r.type,
        accountSubType:     r.subType || '',
        subType:            r.subType || '',
        accountNumber:      r.number,
        accountCode:        r.number,
        number:             r.number,
        parentId:           r.parentId || null,
        description:        r.description || '',
        taxLine:            r.taxLine || '',
        normalBalance:      nb,
        openingBalance:     Number(r.openingBalance || 0),
        openingBalanceDate: r.openingBalanceDate || '',
        balance:            finalBalance,
        ownBalance:         finalBalance,
        status:             r.status || 'Active',
        isSystem:           !!r.isSystem,
      };
    });

    // ── Roll up child balances into parent accounts ──────────────────────
    const byId = new Map(accounts.map(a => [a.id, a]));
    // Build list of parent IDs (accounts that have children)
    const parentIds = new Set(accounts.filter(a => a.parentId).map(a => a.parentId));
    // Recursive rollup: sum child balances into parent
    const rollup = (parentId) => {
      let total = 0;
      for (const a of accounts) {
        if (a.parentId === parentId) {
          // If this child is also a parent, recurse first
          if (parentIds.has(a.id)) rollup(a.id);
          total += Number(a.balance || 0);
        }
      }
      const parent = byId.get(parentId);
      if (parent) {
        parent.balance = Number(parent.ownBalance || 0) + total;
      }
    };
    // Only process top-level parents (parents that are not children themselves, or all parents)
    for (const pid of parentIds) {
      rollup(pid);
    }

    return accounts;
  },

  // ── Single account with computed balance ────────────────────────────────
  getAccount: (id) => {
    const r = db.prepare('SELECT * FROM chart_of_accounts WHERE id = ?').get(id);
    if (!r) return null;
    const nb = getExpectedNormalBalance(r.type) || normalizeNormalBalance(r.normalBalance) || 'Debit';
    const balance = computedBalance(id, nb, r.openingBalance);
    return { ...r, accountName: r.name, accountType: r.type, accountCode: r.number, normalBalance: nb, balance };
  },

  // ── Find system account by sub-type or name ────────────────────────────
  getSystemAccount: (subType) => {
    let acct = db.prepare("SELECT * FROM chart_of_accounts WHERE subType = ? AND isSystem = 1 LIMIT 1").get(subType);
    if (!acct) acct = db.prepare("SELECT * FROM chart_of_accounts WHERE LOWER(name) = LOWER(?) AND isSystem = 1 LIMIT 1").get(subType);
    if (!acct) acct = db.prepare("SELECT * FROM chart_of_accounts WHERE LOWER(name) = LOWER(?) LIMIT 1").get(subType);
    if (!acct) acct = db.prepare("SELECT * FROM chart_of_accounts WHERE subType = ? LIMIT 1").get(subType);
    return acct;
  },

  // ── Find account by name ──────────────────────────────────────────────
  getByName: (name) => {
    return db.prepare("SELECT * FROM chart_of_accounts WHERE LOWER(name) = LOWER(?) LIMIT 1").get(name);
  },

  // ── Insert (full payload object) ────────────────────────────────────────
  insertAccount: (payload) => {
    const p = (payload && typeof payload === 'object') ? payload : { name: String(payload || '') };
    const name = (p.name || p.accountName || '').toString().trim();
    const type = (p.type || p.accountType || 'Expense').toString().trim();
    if (!name) return { success: false, error: 'Account name is required' };

    const parentIdVal = (p.parentId == null || p.parentId === '') ? null : Number(p.parentId);
    try {
      assertValidParent(db, parentIdVal, null, type);
    } catch (e) {
      return { success: false, error: e.message };
    }

    const nb = getExpectedNormalBalance(type) || NORMAL_BALANCE[type] || 'Debit';
    const res = db.prepare(`
      INSERT INTO chart_of_accounts
        (name, type, subType, number, parentId, description, taxLine,
         normalBalance, openingBalance, openingBalanceDate, status, isSystem, entered_by, date_entered)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      name, type,
      p.subType || p.accountSubType || null,
      p.number || p.accountNumber || p.accountCode || null,
      parentIdVal,
      p.description || null,
      p.taxLine || null,
      nb,
      Number(p.openingBalance || 0),
      p.openingBalanceDate || null,
      p.status || 'Active',
      p.isSystem ? 1 : 0,
      p.entered_by || p.enteredBy || null
    );
    return { success: res.changes > 0, id: res.lastInsertRowid };
  },

  // ── Update (full payload) ────────────────────────────────────────────────
  updateAccount: (accountData) => {
    const row = db.prepare('SELECT isSystem FROM chart_of_accounts WHERE id = ?').get(accountData.id);
    if (row?.isSystem && accountData.isSystem === false) {
      return { success: false, message: 'System accounts cannot be un-flagged.' };
    }
    const type = accountData.accountType || accountData.type;
    const parentIdVal = (accountData.parentId == null || accountData.parentId === '') ? null : Number(accountData.parentId);
    try {
      assertValidParent(db, parentIdVal, accountData.id, type);
    } catch (e) {
      return { success: false, error: e.message };
    }
    // The normal side follows the account's classification, not whatever side
    // the client happened to send (and never lands on the wrong side of a type
    // change: reclassifying a Bank account to Liability re-stamps it Credit).
    const nb = getExpectedNormalBalance(type) || NORMAL_BALANCE[type] || 'Debit';
    const res = db.prepare(`
      UPDATE chart_of_accounts SET
        name               = ?,
        type               = ?,
        subType            = ?,
        number             = ?,
        parentId           = ?,
        description        = ?,
        taxLine            = ?,
        normalBalance      = ?,
        openingBalance     = ?,
        openingBalanceDate = ?,
        status             = ?,
        last_modified      = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      accountData.accountName || accountData.name,
      type,
      accountData.subType || accountData.accountSubType || null,
      accountData.accountNumber || accountData.accountCode || accountData.number || null,
      parentIdVal,
      accountData.description || null,
      accountData.taxLine || null,
      nb,
      Number(accountData.openingBalance || 0),
      accountData.openingBalanceDate || null,
      accountData.status || 'Active',
      accountData.id
    );
    return { success: res.changes > 0, message: res.changes > 0 ? 'Account updated' : 'No changes' };
  },

  // ── Soft delete (mark inactive) or hard delete if no activity ───────────
  deleteAccount: (id) => {
    const row = db.prepare('SELECT isSystem FROM chart_of_accounts WHERE id = ?').get(id);
    if (!row) return { success: false, message: 'Account not found' };
    if (row.isSystem) return { success: false, message: 'System accounts cannot be deleted.' };

    // Check journal activity
    let journalCount = 0;
    try { journalCount = db.prepare('SELECT COUNT(*) AS c FROM journal_lines WHERE account_id = ?').get(id)?.c || 0; } catch {}
    let txnCount = 0;
    try { txnCount = db.prepare('SELECT COUNT(*) AS c FROM transactions WHERE accountId = ?').get(id)?.c || 0; } catch {}

    if (journalCount > 0 || txnCount > 0) {
      // Soft delete
      db.prepare("UPDATE chart_of_accounts SET status = 'Inactive', last_modified = CURRENT_TIMESTAMP WHERE id = ?").run(id);
      return { success: true, softDelete: true, message: 'Account has transactions — marked Inactive.' };
    }

    // Check sub-accounts
    const children = db.prepare('SELECT COUNT(*) AS c FROM chart_of_accounts WHERE parentId = ?').get(id)?.c || 0;
    if (children > 0) return { success: false, message: 'Reassign or delete sub-accounts first.' };

    db.prepare('DELETE FROM chart_of_accounts WHERE id = ?').run(id);
    return { success: true, message: 'Account deleted.' };
  },

  // ── Bulk insert (for templates/import) ────────────────────────────────
  bulkInsert: (accounts) => {
    let inserted = 0, skipped = 0;
    const run = db.transaction(() => {
      for (const acc of accounts) {
        const exists = db.prepare('SELECT id FROM chart_of_accounts WHERE LOWER(name) = LOWER(?) LIMIT 1').get(acc.name || acc.accountName);
        if (exists) { skipped++; continue; }
        const r = ChartOfAccounts.insertAccount(acc);
        if (r.success) inserted++;
      }
    });
    run();
    return { success: true, inserted, skipped };
  },

  // ── Get account activity (journal lines) ─────────────────────────────
  getAccountActivity: (accountId, { from, to, limit = 300 } = {}) => {
    let where = 'jl.account_id = ? AND je.status != \'Void\'';
    const params = [accountId];
    if (from) { where += ' AND je.date >= ?'; params.push(from); }
    if (to)   { where += ' AND je.date <= ?'; params.push(to); }
    try {
      return db.prepare(`
        SELECT jl.id, jl.debit, jl.credit, jl.description AS lineDesc,
               je.id AS journalId, je.date, je.reference, je.description, je.source_type, je.source_id, je.status
        FROM journal_lines jl
        JOIN journal_entries je ON jl.journal_id = je.id
        WHERE ${where}
        ORDER BY je.date DESC, je.id DESC
        LIMIT ?
      `).all(...params, Number(limit));
    } catch { return []; }
  },

  getCount: () => db.prepare('SELECT COUNT(*) as count FROM chart_of_accounts').get().count,
  getSubTypes: () => ACCOUNT_SUBTYPES,
  getNormalBalance: () => NORMAL_BALANCE,
};

ChartOfAccounts.createTable();

module.exports = ChartOfAccounts;
