const crypto = require('crypto');
const db = require('./dbmgr');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * ParsedStatements — imported bank statement SOURCE data.
 *
 * A parsed statement is EVIDENCE, not an accounting entry: importing a statement
 * never creates a journal. Lines can be linked (matched) to existing AccuLedger
 * transactions, or categorized to an account, but the accounting transaction is
 * always created through its own existing workflow.
 *
 * Relationships use stable ids only (bank_account_id, matched_id, account ids).
 */
const lineHash = (r) => crypto.createHash('sha1')
  .update(`${r.date || ''}|${round2(r.amount).toFixed(2)}|${String(r.description || '').trim()}|${String(r.reference || '').trim()}`)
  .digest('hex');

const ParsedStatements = {
  createTables: () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS parsed_statements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bankName TEXT,
        periodStart DATE,
        periodEnd DATE,
        currency TEXT,
        uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    db.prepare(`
      CREATE TABLE IF NOT EXISTS statement_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parsedStatementId INTEGER NOT NULL,
        date DATE NOT NULL,
        description TEXT,
        amount REAL NOT NULL,
        type TEXT,
        reference TEXT
      )
    `).run();

    // ── Additive migrations: statement-level review/reconciliation metadata ──
    const addCol = (table, col, ddl) => {
      try {
        const cols = new Set(db.prepare(`PRAGMA table_info('${table}')`).all().map((c) => c.name));
        if (!cols.has(col)) db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`).run();
      } catch { /* best effort */ }
    };
    addCol('parsed_statements', 'bank_account_id', 'INTEGER');
    addCol('parsed_statements', 'opening_balance', 'REAL');
    addCol('parsed_statements', 'closing_balance', 'REAL');
    addCol('parsed_statements', 'source_file', 'TEXT');
    addCol('parsed_statements', 'file_hash', 'TEXT');
    addCol('parsed_statements', 'status', "TEXT DEFAULT 'Parsed'");
    addCol('parsed_statements', 'reconciliation_status', "TEXT DEFAULT 'Not Reconciled'");
    addCol('parsed_statements', 'reconciliation_id', 'INTEGER');
    addCol('parsed_statements', 'imported_by', 'TEXT');
    addCol('parsed_statements', 'updated_at', 'DATETIME');

    addCol('statement_transactions', 'matched', 'INTEGER DEFAULT 0');
    addCol('statement_transactions', 'matched_type', 'TEXT');
    addCol('statement_transactions', 'matched_id', 'INTEGER');
    addCol('statement_transactions', 'category_account_id', 'INTEGER');
    addCol('statement_transactions', 'running_balance', 'REAL');
    addCol('statement_transactions', 'external_id', 'TEXT');
    addCol('statement_transactions', 'matched_at', 'DATETIME');
    addCol('statement_transactions', 'matched_by', 'TEXT');
  },

  lineHash,

  createStatement: (meta = {}) => {
    const res = db.prepare(`
      INSERT INTO parsed_statements
        (bankName, periodStart, periodEnd, currency, bank_account_id, opening_balance, closing_balance,
         source_file, file_hash, status, reconciliation_status, imported_by, uploadedAt, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      meta.bankName || null,
      meta.periodStart || null,
      meta.periodEnd || null,
      meta.currency || null,
      meta.bankAccountId != null && meta.bankAccountId !== '' ? Number(meta.bankAccountId) : null,
      meta.openingBalance != null && meta.openingBalance !== '' ? round2(meta.openingBalance) : null,
      meta.closingBalance != null && meta.closingBalance !== '' ? round2(meta.closingBalance) : null,
      meta.sourceFile || meta.fileName || null,
      meta.fileHash || null,
      meta.status || 'Parsed',
      'Not Reconciled',
      meta.importedBy || 'system'
    );
    return { id: res.lastInsertRowid };
  },

  /** Insert lines, skipping any already present (reprocess-safe / idempotent). */
  insertTransactions: (parsedStatementId, rows) => {
    const stmt = db.prepare(`
      INSERT INTO statement_transactions
        (parsedStatementId, date, description, amount, type, reference, running_balance, external_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const existing = new Set(
      db.prepare('SELECT external_id FROM statement_transactions WHERE parsedStatementId = ? AND external_id IS NOT NULL').all(parsedStatementId).map((r) => r.external_id)
    );
    const tx = db.transaction(() => {
      let inserted = 0;
      let skipped = 0;
      for (const r of rows) {
        const hash = lineHash(r);
        if (existing.has(hash)) { skipped++; continue; }
        stmt.run(parsedStatementId, r.date, r.description || null, Number(r.amount) || 0, r.type || null, r.reference || null,
          r.runningBalance != null ? round2(r.runningBalance) : null, hash);
        existing.add(hash);
        inserted++;
      }
      return { inserted, skipped };
    });
    try { return { success: true, ...tx() }; }
    catch (e) { return { success: false, error: e.message }; }
  },

  /** Duplicate detection: same file hash, or same bank account + identical period. */
  findDuplicate: ({ bankAccountId = null, periodStart = null, periodEnd = null, fileHash = null } = {}) => {
    if (fileHash) {
      const byHash = db.prepare('SELECT id FROM parsed_statements WHERE file_hash = ? LIMIT 1').get(fileHash);
      if (byHash) return { duplicate: true, reason: 'file', statementId: Number(byHash.id) };
    }
    if (bankAccountId && periodStart && periodEnd) {
      const byPeriod = db.prepare('SELECT id FROM parsed_statements WHERE bank_account_id = ? AND periodStart = ? AND periodEnd = ? LIMIT 1')
        .get(Number(bankAccountId), periodStart, periodEnd);
      if (byPeriod) return { duplicate: true, reason: 'period', statementId: Number(byPeriod.id) };
    }
    return { duplicate: false };
  },

  _counts: (statementId) => {
    const row = db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN matched = 1 THEN 1 ELSE 0 END) AS matched,
             SUM(CASE WHEN matched = 1 OR category_account_id IS NOT NULL THEN 1 ELSE 0 END) AS categorized,
             SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS moneyIn,
             SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS moneyOut
      FROM statement_transactions WHERE parsedStatementId = ?
    `).get(Number(statementId)) || {};
    const total = Number(row.total) || 0;
    const matched = Number(row.matched) || 0;
    const categorized = Number(row.categorized) || 0;
    return {
      transactionCount: total,
      matched,
      unmatched: total - categorized,
      moneyIn: round2(row.moneyIn),
      moneyOut: round2(row.moneyOut),
    };
  },

  listStatements: () => {
    const rows = db.prepare(`
      SELECT ps.*, a.name AS bank_account_name, a.number AS bank_account_number
      FROM parsed_statements ps
      LEFT JOIN chart_of_accounts a ON a.id = ps.bank_account_id
      ORDER BY ps.uploadedAt DESC, ps.id DESC
    `).all();
    return rows.map((r) => { const c = ParsedStatements._counts(r.id); return { ...r, ...c, transactions: c.transactionCount }; });
  },

  getStatementWithTransactions: (id) => {
    const st = db.prepare(`
      SELECT ps.*, a.name AS bank_account_name, a.number AS bank_account_number
      FROM parsed_statements ps
      LEFT JOIN chart_of_accounts a ON a.id = ps.bank_account_id
      WHERE ps.id = ?
    `).get(Number(id));
    if (!st) return null;
    const transactions = db.prepare(`
      SELECT t.*, a.name AS category_account_name
      FROM statement_transactions t
      LEFT JOIN chart_of_accounts a ON a.id = t.category_account_id
      WHERE t.parsedStatementId = ? ORDER BY t.date ASC, t.id ASC
    `).all(Number(id));
    return { ...st, transactions, ...ParsedStatements._counts(id) };
  },

  /** Company-wide summary for the Bank Statements page. */
  getSummary: () => {
    const stmtCount = db.prepare('SELECT COUNT(*) AS c FROM parsed_statements').get().c;
    const ready = db.prepare(`
      SELECT COUNT(*) AS c FROM parsed_statements ps
      WHERE ps.bank_account_id IS NOT NULL AND ps.periodStart IS NOT NULL AND ps.periodEnd IS NOT NULL
        AND ps.status = 'Parsed' AND ps.reconciliation_status != 'Reconciled'
    `).get().c;
    const reconciled = db.prepare("SELECT COUNT(*) AS c FROM parsed_statements WHERE reconciliation_status = 'Reconciled'").get().c;
    const failed = db.prepare("SELECT COUNT(*) AS c FROM parsed_statements WHERE status = 'Failed'").get().c;
    const needsReview = db.prepare("SELECT COUNT(*) AS c FROM parsed_statements WHERE status = 'Needs Review' OR bank_account_id IS NULL").get().c;
    const agg = db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN matched = 1 THEN 1 ELSE 0 END) AS matched,
             SUM(CASE WHEN matched = 1 OR category_account_id IS NOT NULL THEN 1 ELSE 0 END) AS categorized
      FROM statement_transactions
    `).get() || {};
    const total = Number(agg.total) || 0;
    const matched = Number(agg.matched) || 0;
    const categorized = Number(agg.categorized) || 0;
    return {
      totalStatements: Number(stmtCount) || 0,
      importedTransactions: total,
      unmatchedTransactions: total - categorized,
      matchedTransactions: categorized,
      readyForReconciliation: Number(ready) || 0,
      reconciledStatements: Number(reconciled) || 0,
      failedStatements: Number(failed) || 0,
      needsReview: Number(needsReview) || 0,
    };
  },

  setBankAccount: (id, bankAccountId) => {
    db.prepare('UPDATE parsed_statements SET bank_account_id = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(bankAccountId != null && bankAccountId !== '' ? Number(bankAccountId) : null, Number(id));
    return { success: true };
  },

  setStatus: (id, status) => {
    db.prepare('UPDATE parsed_statements SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(String(status), Number(id));
    return { success: true };
  },

  /** Link a statement line to an EXISTING AccuLedger transaction (no new journal). */
  matchLine: (lineId, { matchedType = null, matchedId = null, accountId = null, matchedBy = 'system' } = {}) => {
    db.prepare(`
      UPDATE statement_transactions
      SET matched = 1, matched_type = ?, matched_id = ?, category_account_id = COALESCE(?, category_account_id),
          matched_at = datetime('now'), matched_by = ?
      WHERE id = ?
    `).run(matchedType, matchedId != null ? Number(matchedId) : null,
      accountId != null ? Number(accountId) : null, matchedBy, Number(lineId));
    return { success: true };
  },

  unmatchLine: (lineId) => {
    db.prepare(`
      UPDATE statement_transactions
      SET matched = 0, matched_type = NULL, matched_id = NULL, matched_at = NULL, matched_by = NULL
      WHERE id = ?
    `).run(Number(lineId));
    return { success: true };
  },

  /** Categorize a line to an account (the actual transaction is created elsewhere). */
  categorizeLine: (lineId, accountId) => {
    db.prepare('UPDATE statement_transactions SET category_account_id = ? WHERE id = ?')
      .run(accountId != null ? Number(accountId) : null, Number(lineId));
    return { success: true };
  },

  setReconciliation: (id, { reconciliationId = null, status = 'In Progress' } = {}) => {
    db.prepare('UPDATE parsed_statements SET reconciliation_id = ?, reconciliation_status = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(reconciliationId != null ? Number(reconciliationId) : null, String(status), Number(id));
    return { success: true };
  },

  /** Delete source data. Reconciled statements are protected; matched accounting
   *  transactions are NEVER deleted (they are separate auditable records). */
  deleteStatement: (id) => {
    const st = db.prepare('SELECT id, reconciliation_status FROM parsed_statements WHERE id = ?').get(Number(id));
    if (!st) return { success: false, error: 'Statement not found.' };
    if (String(st.reconciliation_status || '').toLowerCase() === 'reconciled') {
      return { success: false, error: 'This statement is reconciled. Unreconcile it before deleting.', protected: true };
    }
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM statement_transactions WHERE parsedStatementId = ?').run(Number(id));
      db.prepare('DELETE FROM parsed_statements WHERE id = ?').run(Number(id));
    });
    try { tx(); return { success: true }; } catch (e) { return { success: false, error: e.message }; }
  },
};

ParsedStatements.createTables();

module.exports = ParsedStatements;
