const db = require('./dbmgr');

const Consolidation = {
  createTables() {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS consolidation_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id INTEGER NOT NULL,
        local_account_id INTEGER NOT NULL,
        group_account_name TEXT NOT NULL,
        group_account_type TEXT NOT NULL,
        group_account_number TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS consolidation_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        entity_ids TEXT,
        status TEXT DEFAULT 'Draft',
        data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  },

  // Mappings
  listMappings(entityId) {
    if (entityId) {
      return db.prepare(`SELECT * FROM consolidation_mappings WHERE entity_id = ? ORDER BY group_account_type, group_account_name`).all(entityId);
    }
    return db.prepare(`SELECT * FROM consolidation_mappings ORDER BY entity_id, group_account_type, group_account_name`).all();
  },

  saveMapping(mapping) {
    if (mapping.id) {
      db.prepare(`UPDATE consolidation_mappings SET entity_id=?, local_account_id=?, group_account_name=?, group_account_type=?, group_account_number=? WHERE id=?`)
        .run(mapping.entity_id, mapping.local_account_id, mapping.group_account_name, mapping.group_account_type, mapping.group_account_number || null, mapping.id);
      return { success: true };
    }
    const res = db.prepare(`INSERT INTO consolidation_mappings (entity_id, local_account_id, group_account_name, group_account_type, group_account_number) VALUES (?,?,?,?,?)`)
      .run(mapping.entity_id, mapping.local_account_id, mapping.group_account_name, mapping.group_account_type, mapping.group_account_number || null);
    return { success: true, id: res.lastInsertRowid };
  },

  deleteMapping(id) {
    return db.prepare(`DELETE FROM consolidation_mappings WHERE id = ?`).run(id);
  },

  autoMapAccounts(entityId) {
    const accounts = db.prepare(`SELECT id, name, type, number FROM chart_of_accounts`).all();
    const existing = new Set(db.prepare(`SELECT local_account_id FROM consolidation_mappings WHERE entity_id = ?`).all(entityId).map(r => r.local_account_id));
    let mapped = 0;
    for (const a of accounts) {
      if (existing.has(a.id)) continue;
      db.prepare(`INSERT INTO consolidation_mappings (entity_id, local_account_id, group_account_name, group_account_type, group_account_number) VALUES (?,?,?,?,?)`)
        .run(entityId, a.id, a.name, a.type, a.number || null);
      mapped++;
    }
    return { success: true, mapped };
  },

  // Consolidated Reports
  generateConsolidated(startDate, endDate, entityIds) {
    const entities = entityIds || [];
    
    // Get all transactions within date range
    const transactions = db.prepare(`
      SELECT t.accountId, t.debit, t.credit, t.entity_id, t.isIntercompany, t.eliminateOnConsolidation,
             coa.name AS account_name, coa.type AS account_type, coa.number AS account_number
      FROM transactions t
      LEFT JOIN chart_of_accounts coa ON coa.id = t.accountId
      WHERE t.date >= ? AND t.date <= ? AND t.status = 'Active'
      ${entities.length ? `AND (t.entity_id IN (${entities.map(()=>'?').join(',')}) OR t.entity_id IS NULL)` : ''}
    `).all(startDate, endDate, ...(entities.length ? entities : []));

    // Aggregate by group account
    const groupAccounts = {};
    for (const t of transactions) {
      // Skip intercompany transactions marked for elimination
      if (t.isIntercompany && t.eliminateOnConsolidation) continue;

      const key = t.account_name || `Account-${t.accountId}`;
      if (!groupAccounts[key]) {
        groupAccounts[key] = {
          name: key,
          type: t.account_type || 'Other',
          number: t.account_number || '',
          totalDebit: 0,
          totalCredit: 0,
          balance: 0,
        };
      }
      groupAccounts[key].totalDebit += Number(t.debit || 0);
      groupAccounts[key].totalCredit += Number(t.credit || 0);
      groupAccounts[key].balance = groupAccounts[key].totalDebit - groupAccounts[key].totalCredit;
    }

    const accounts = Object.values(groupAccounts).sort((a, b) => (a.type + a.name).localeCompare(b.type + b.name));

    // Build P&L
    const revenue = accounts.filter(a => ['Income', 'Revenue', 'Sales'].includes(a.type));
    const expenses = accounts.filter(a => ['Expense', 'Cost of Goods Sold', 'COGS'].includes(a.type));
    const totalRevenue = revenue.reduce((s, a) => s + Math.abs(a.balance), 0);
    const totalExpenses = expenses.reduce((s, a) => s + Math.abs(a.balance), 0);
    const netIncome = totalRevenue - totalExpenses;

    // Build Balance Sheet
    const assets = accounts.filter(a => ['Asset', 'Bank', 'Fixed Asset', 'Other Current Asset', 'Accounts Receivable'].includes(a.type));
    const liabilities = accounts.filter(a => ['Liability', 'Other Current Liability', 'Long Term Liability', 'Accounts Payable', 'Credit Card'].includes(a.type));
    const equity = accounts.filter(a => ['Equity', 'Retained Earnings'].includes(a.type));
    const totalAssets = assets.reduce((s, a) => s + Math.abs(a.balance), 0);
    const totalLiabilities = liabilities.reduce((s, a) => s + Math.abs(a.balance), 0);
    const totalEquity = equity.reduce((s, a) => s + Math.abs(a.balance), 0);

    const result = {
      period: { start: startDate, end: endDate },
      entities: entities,
      profitAndLoss: { revenue, expenses, totalRevenue, totalExpenses, netIncome },
      balanceSheet: { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity },
      allAccounts: accounts,
      intercompanyEliminated: transactions.filter(t => t.isIntercompany && t.eliminateOnConsolidation).length,
    };

    // Save run
    const res = db.prepare(`INSERT INTO consolidation_runs (name, start_date, end_date, entity_ids, status, data) VALUES (?,?,?,?,?,?)`)
      .run(`Consolidated ${startDate} to ${endDate}`, startDate, endDate, JSON.stringify(entities), 'Completed', JSON.stringify(result));

    return { success: true, id: res.lastInsertRowid, ...result };
  },

  listRuns(limit) {
    return db.prepare(`SELECT id, name, start_date, end_date, entity_ids, status, created_at FROM consolidation_runs ORDER BY created_at DESC LIMIT ?`).all(limit || 50);
  },

  getRun(id) {
    const run = db.prepare(`SELECT * FROM consolidation_runs WHERE id = ?`).get(id);
    if (run && run.data) run.data = JSON.parse(run.data);
    if (run && run.entity_ids) run.entity_ids = JSON.parse(run.entity_ids);
    return run;
  },

  deleteRun(id) {
    return db.prepare(`DELETE FROM consolidation_runs WHERE id = ?`).run(id);
  }
};

Consolidation.createTables();

module.exports = Consolidation;
