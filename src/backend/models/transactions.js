  // Ensure schema migrations for older DBs: add missing columns if any
const db = require("./dbmgr");
const Settings = require('./settings');
const JournalEntries = require('./journalEntries');
const { getExpectedNormalBalance, normalizeNormalBalance } = require('../services/normalBalance');

const Transactions = {
  createTable() {
    // Main transactions table
    db.prepare(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      type TEXT,
      amount REAL,
      description TEXT,
      status TEXT DEFAULT 'Active',
      accountId INTEGER,
      customerId INTEGER REFERENCES customers(id),
      reference TEXT,
      debit REAL,
      credit REAL,
      isReconciled BOOLEAN DEFAULT 0,
      entered_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      class TEXT,
      location TEXT,
      department TEXT,
      currency TEXT,
      fxRate REAL DEFAULT 1.0,
      entity_id INTEGER,
      isIntercompany INTEGER DEFAULT 0,
      eliminateOnConsolidation INTEGER DEFAULT 1,
      pairId INTEGER
    )`).run();

    // Reconciliations table (audit trail)
    db.prepare(`CREATE TABLE IF NOT EXISTS reconciliations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      accountId INTEGER,
      accountName TEXT,
      statementDate TEXT,
      statementBalance REAL,
      reconciledBalance REAL,
      reconciledBy TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();

    // Junction table linking each reconciliation to its transactions
    db.prepare(`CREATE TABLE IF NOT EXISTS reconciliation_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reconciliationId INTEGER,
      transactionId INTEGER,
      amount REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();

    // Deposit items table
    db.prepare(`CREATE TABLE IF NOT EXISTS deposit_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      depositId INTEGER,
      type TEXT,
      reference TEXT,
      description TEXT,
      amount REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();

    // Payroll runs table
    db.prepare(`CREATE TABLE IF NOT EXISTS payroll_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      startDate TEXT,
      endDate TEXT,
      paymentMethod TEXT,
      bankAccount INTEGER,
      notes TEXT,
      status TEXT DEFAULT 'Completed',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();

    // Payroll payments table
    db.prepare(`CREATE TABLE IF NOT EXISTS payroll_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payrollRunId INTEGER,
      employeeId INTEGER,
      grossPay REAL,
      deductions REAL,
      netPay REAL,
      status TEXT DEFAULT 'Paid',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();
  },

  // Ensure schema migrations for older DBs: add missing columns if any
  ensureColumns() {
    try {
      const infoStmt = db.prepare("PRAGMA table_info('transactions')");
      const cols = infoStmt.all().map(c => c.name.toLowerCase());
      const toAdd = [];
      if (!cols.includes('accountid')) toAdd.push({ name: 'accountId', sql: 'INTEGER' });
      if (!cols.includes('customerid')) toAdd.push({ name: 'customerId', sql: 'INTEGER REFERENCES customers(id)' });
      if (!cols.includes('reference')) toAdd.push({ name: 'reference', sql: 'TEXT' });
      if (!cols.includes('debit')) toAdd.push({ name: 'debit', sql: 'REAL' });
      if (!cols.includes('credit')) toAdd.push({ name: 'credit', sql: 'REAL' });
      if (!cols.includes('isreconciled')) toAdd.push({ name: 'isReconciled', sql: "BOOLEAN DEFAULT 0" });
      if (!cols.includes('entered_by')) toAdd.push({ name: 'entered_by', sql: 'TEXT' });
      if (!cols.includes('created_at')) toAdd.push({ name: 'created_at', sql: "TEXT DEFAULT CURRENT_TIMESTAMP" });
      if (!cols.includes('class')) toAdd.push({ name: 'class', sql: 'TEXT' });
      if (!cols.includes('location')) toAdd.push({ name: 'location', sql: 'TEXT' });
      if (!cols.includes('department')) toAdd.push({ name: 'department', sql: 'TEXT' });
      if (!cols.includes('currency')) toAdd.push({ name: 'currency', sql: 'TEXT' });
      if (!cols.includes('fxrate')) toAdd.push({ name: 'fxRate', sql: 'REAL DEFAULT 1.0' });
      if (!cols.includes('entity_id')) toAdd.push({ name: 'entity_id', sql: 'INTEGER' });
      if (!cols.includes('isintercompany')) toAdd.push({ name: 'isIntercompany', sql: 'INTEGER DEFAULT 0' });
      if (!cols.includes('eliminateonconsolidation')) toAdd.push({ name: 'eliminateOnConsolidation', sql: 'INTEGER DEFAULT 1' });
      if (!cols.includes('pairid')) toAdd.push({ name: 'pairId', sql: 'INTEGER' });
      if (!cols.includes('printed')) toAdd.push({ name: 'printed', sql: 'INTEGER DEFAULT 0' });
      if (!cols.includes('printed_at')) toAdd.push({ name: 'printed_at', sql: 'TEXT' });
      if (!cols.includes('categories')) toAdd.push({ name: 'categories', sql: 'TEXT' });
      if (!cols.includes('payee_name')) toAdd.push({ name: 'payee_name', sql: 'TEXT' });
      if (!cols.includes('payee_address')) toAdd.push({ name: 'payee_address', sql: 'TEXT' });
      if (!cols.includes('source_type')) toAdd.push({ name: 'source_type', sql: 'TEXT' });
      if (!cols.includes('source_id')) toAdd.push({ name: 'source_id', sql: 'INTEGER' });
      if (!cols.includes('reconciliationid')) toAdd.push({ name: 'reconciliationId', sql: 'INTEGER' });
      if (!cols.includes('reconciliationdate')) toAdd.push({ name: 'reconciliationDate', sql: 'TEXT' });

      toAdd.forEach(col => {
        try {
          db.prepare(`ALTER TABLE transactions ADD COLUMN ${col.name} ${col.sql}`).run();
          console.log(`Added missing column transactions.${col.name}`);
        } catch (addErr) {
          console.error(`Failed to add column ${col.name} to transactions:`, addErr);
        }
      });
    } catch (err) {
      console.error('Failed to ensure transactions columns', err);
    }

    // Ensure audit columns exist on the reconciliations table (existing DBs)
    try {
      const recCols = db.prepare("PRAGMA table_info('reconciliations')").all().map(c => c.name.toLowerCase());
      const recToAdd = [];
      if (!recCols.includes('accountname')) recToAdd.push({ name: 'accountName', sql: 'TEXT' });
      if (!recCols.includes('reconciledby')) recToAdd.push({ name: 'reconciledBy', sql: 'TEXT' });
      if (!recCols.includes('startingbalance')) recToAdd.push({ name: 'startingBalance', sql: 'REAL DEFAULT 0' });
      if (!recCols.includes('difference')) recToAdd.push({ name: 'difference', sql: 'REAL DEFAULT 0' });
      if (!recCols.includes('adjustmentamount')) recToAdd.push({ name: 'adjustmentAmount', sql: 'REAL DEFAULT 0' });
      if (!recCols.includes('adjustmentjournalid')) recToAdd.push({ name: 'adjustmentJournalId', sql: 'INTEGER' });
      if (!recCols.includes('adjustmentdescription')) recToAdd.push({ name: 'adjustmentDescription', sql: 'TEXT' });
      if (!recCols.includes('adjustmentaccountid')) recToAdd.push({ name: 'adjustmentAccountId', sql: 'INTEGER' });
      // The unresolved difference BEFORE any adjustment, kept for the audit
      // trail. `difference` itself records the POST-adjustment position, so a
      // completed reconciliation reads as zero.
      if (!recCols.includes('originaldifference')) recToAdd.push({ name: 'originalDifference', sql: 'REAL DEFAULT 0' });
      recToAdd.forEach(col => {
        try {
          db.prepare(`ALTER TABLE reconciliations ADD COLUMN ${col.name} ${col.sql}`).run();
          console.log(`Added missing column reconciliations.${col.name}`);
        } catch (addErr) {
          console.error(`Failed to add column ${col.name} to reconciliations:`, addErr);
        }
      });
    } catch (err) {
      console.error('Failed to ensure reconciliations columns', err);
    }
  },
 
  getAll() {
    return db.prepare("SELECT * FROM transactions ORDER BY created_at DESC").all();
  },

  getCheckStats() {
    const total = db.prepare("SELECT COUNT(*) AS c FROM transactions WHERE LOWER(type) = 'check'").get().c;
    const totalAmount = db.prepare("SELECT COALESCE(SUM(COALESCE(amount, debit, 0)), 0) AS s FROM transactions WHERE LOWER(type) = 'check'").get().s;
    const monthStart = new Date();
    monthStart.setDate(1);
    const ms = monthStart.toISOString().slice(0, 10);
    const thisMonthCount = db.prepare("SELECT COUNT(*) AS c FROM transactions WHERE LOWER(type) = 'check' AND date >= ?").get(ms).c;
    const lastRef = db.prepare("SELECT MAX(CAST(reference AS INTEGER)) AS n FROM transactions WHERE LOWER(type) = 'check' AND reference GLOB '[0-9]*'").get().n;
    return { total, totalAmount, thisMonthCount, nextCheckNumber: String((lastRef || 0) + 1) };
  },

  getPaginated(page = 1, pageSize = 25, search = '', typeFilter = '') {
    const offset = (Math.max(1, page) - 1) * Math.max(1, pageSize);
    const limit = Math.max(1, Math.min(500, pageSize));
    const conditions = [];
    const params = [];
    if (typeFilter) {
      conditions.push(`LOWER(type) = LOWER(?)`);
      params.push(typeFilter);
    }
    if (search && search.trim()) {
      conditions.push('(type LIKE ? OR date LIKE ? OR description LIKE ? OR reference LIKE ? OR payee_name LIKE ? OR CAST(amount AS TEXT) LIKE ?)');
      const sp = `%${search.trim()}%`;
      params.push(sp, sp, sp, sp, sp, sp);
    }
    const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
    const orderSql = " ORDER BY created_at DESC";
    const countSql = `SELECT COUNT(*) AS total FROM transactions${whereClause}`;
    const total = db.prepare(countSql).get(...params).total;
    const dataSql = `SELECT * FROM transactions${whereClause}${orderSql} LIMIT ? OFFSET ?`;
    const data = db.prepare(dataSql).all(...params, limit, offset);
    return { data, total };
  },

  getDeposits() {
    return db.prepare("SELECT * FROM transactions WHERE LOWER(type) = 'deposit' ORDER BY date DESC").all();
  },

  getTransfers() {
    return db.prepare("SELECT * FROM transactions WHERE LOWER(type) IN ('transfer_in', 'transfer_out') ORDER BY date DESC").all();
  },

  insert({ date, type, amount, description, accountId, customerId, reference, debit, credit, entered_by, entity_id, isIntercompany, eliminateOnConsolidation, pairId, class: classTag, location, department, categories, payee_name, payee_address, source_type, source_id }) {
    // Closing date enforcement
    const closingDate = Settings.get('closingDate');
    if (closingDate && date && typeof date === 'string' && date <= closingDate) {
      throw new Error(`Posting date ${date} is on or before closing date ${closingDate}`);
    }
    // Ensure dynamic columns exist
    try {
      const cols = new Set(db.prepare("PRAGMA table_info('transactions')").all().map(c => c.name.toLowerCase()));
      if (!cols.has('categories')) db.prepare("ALTER TABLE transactions ADD COLUMN categories TEXT").run();
      if (!cols.has('payee_name')) db.prepare("ALTER TABLE transactions ADD COLUMN payee_name TEXT").run();
      if (!cols.has('payee_address')) db.prepare("ALTER TABLE transactions ADD COLUMN payee_address TEXT").run();
      if (!cols.has('source_type')) db.prepare("ALTER TABLE transactions ADD COLUMN source_type TEXT").run();
      if (!cols.has('source_id')) db.prepare("ALTER TABLE transactions ADD COLUMN source_id INTEGER").run();
    } catch {}
    this.assertUniqueCheckNumber({ type, reference });
    return db.prepare(`
      INSERT INTO transactions (
        date, type, amount, description, status, accountId, customerId,
        reference, debit, credit, entered_by, entity_id, isIntercompany, eliminateOnConsolidation, pairId, class, location, department, categories, payee_name, payee_address, source_type, source_id
      ) VALUES (?, ?, ?, ?, 'Active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(date, type, amount, description, accountId, customerId, reference, debit, credit, entered_by, entity_id || null, isIntercompany ? 1 : 0, eliminateOnConsolidation ? 1 : 0, pairId || null, classTag || null, location || null, department || null, categories || null, payee_name || null, payee_address || null, source_type || null, source_id || null);
  },

  getById(id) {
    return db.prepare("SELECT * FROM transactions WHERE id = ?").get(id);
  },

  // A transaction cleared as part of a bank statement reconciliation must not be
  // silently edited/deleted/voided — doing so desyncs the stored reconciliation
  // balance/difference and the reconciliation_transactions junction.
  assertNotReconciled(id) {
    const row = this.getById(id);
    if (row && Number(row.isReconciled)) {
      throw new Error(
        `Transaction #${id} is part of a bank reconciliation and cannot be modified. ` +
        `Delete the reconciliation first, or void it there.`
      );
    }
  },

  findByReference(type, reference) {
    return db.prepare("SELECT * FROM transactions WHERE type = ? AND reference = ? AND (status IS NULL OR LOWER(status) != 'void')").get(type, String(reference));
  },

  // Check numbers must be unique across non-void checks. The frontend gives an
  // advisory warning, but the DB is the final gate — a duplicate number breaks
  // check-register integrity, audit trails, and reconciliation of cleared checks.
  assertUniqueCheckNumber({ id = null, type, reference }) {
    if (String(type || '').toLowerCase() !== 'check' || reference == null || String(reference).trim() === '') return;
    const dup = db.prepare(
      `SELECT id FROM transactions
       WHERE LOWER(type) = 'check' AND reference = ?
         AND (status IS NULL OR LOWER(status) != 'void') AND id != ?`
    ).get(String(reference).trim(), Number(id) || 0);
    if (dup) {
      throw new Error(
        `Check #${reference} already exists (transaction #${dup.id}). ` +
        `Check numbers must be unique — pick a different number.`
      );
    }
  },

  update(id, { date, type, amount, description, reference, accountId, categories, payee_name, payee_address }) {
    this.assertNotReconciled(id);
    const closingDate = Settings.get('closingDate');
    const existing = this.getById(id);
    if (!existing) throw new Error(`Transaction ${id} not found`);
    if (closingDate && date && typeof date === 'string' && date <= closingDate) {
      throw new Error(`Posting date ${date} is on or before closing date ${closingDate}`);
    }
    this.assertUniqueCheckNumber({ id, type: type || existing.type, reference: reference != null ? reference : existing.reference });
    try {
      const cols = new Set(db.prepare("PRAGMA table_info('transactions')").all().map(c => c.name.toLowerCase()));
      if (!cols.has('payee_name')) db.prepare("ALTER TABLE transactions ADD COLUMN payee_name TEXT").run();
      if (!cols.has('payee_address')) db.prepare("ALTER TABLE transactions ADD COLUMN payee_address TEXT").run();
    } catch {}
    return db.prepare(`
      UPDATE transactions SET date=?, type=?, amount=?, description=?, reference=?, accountId=?, categories=?, payee_name=?, payee_address=?
      WHERE id=?
    `).run(
      date || existing.date,
      type || existing.type,
      amount != null ? amount : existing.amount,
      description != null ? description : existing.description,
      reference != null ? reference : existing.reference,
      accountId != null ? accountId : existing.accountId,
      categories != null ? categories : existing.categories,
      payee_name != null ? payee_name : existing.payee_name,
      payee_address != null ? payee_address : existing.payee_address,
      id
    );
  },

  deleteTransaction(id) {
    this.assertNotReconciled(id);
    // Remove attached documents + their files (credit-card charges and checks
    // attach documents keyed by transaction id) so no orphans remain.
    try {
      const Documents = require('./documents');
      Documents.deleteByLinked('creditcard', Number(id));
      Documents.deleteByLinked('check', Number(id));
    } catch (docErr) {
      console.warn('[transactions] Attachment cleanup on delete failed:', docErr.message);
    }
    return db.prepare("DELETE FROM transactions WHERE id=?").run(id);
  },

  voidTransaction(id) {
    this.assertNotReconciled(id);
    const tx = this.getById(id);
    // A check carries accounting (and possibly bill payment allocations) that a
    // bare status flip would leave posted. Route it through the same central
    // reversal used by delete, but keep the row and mark it Voided.
    if (tx && String(tx.type || '').toLowerCase() === 'check') {
      const BillPayments = require('./billPayments');
      const activeApps = BillPayments.getActiveForCheck(id);
      const postedJournal = db.prepare(
        "SELECT id FROM journal_entries WHERE source_type = 'transaction' AND source_id = ? AND status = 'Posted' LIMIT 1"
      ).get(String(id));
      if (activeApps.length > 0 || postedJournal) {
        const res = BillPayments.reverseForCheck(id, { keepCheck: true, reason: 'Check voided', userId: 'system' });
        if (res && res.success !== false) return { changes: 1, success: true, reversed: true };
        throw new Error((res && res.error) || 'Failed to reverse the voided check');
      }
    }
    return db.prepare("UPDATE transactions SET status='Voided' WHERE id=?").run(id);
  },

  // Permanently delete a check AND reverse its accounting impact.
  //
  // The reversal itself lives in ONE place — models/billPayments.js
  // (reverseForCheck) — which:
  //   1. reverses/voids the posted journal entry so account balances (Bank, AP)
  //      are restored,
  //   2. reverses the explicit payment application(s) linking the check to any
  //      bill(s), restoring the amount applied,
  //   3. recalculates each affected bill's paid/remaining/status from its
  //      remaining ACTIVE payments (never a hard-coded status),
  //   4. restores the vendor balance where the payment reduced it,
  //   5. deletes the check transaction record,
  //   all atomically and idempotently.
  //
  // Normal write checks (no bill relationship) simply reverse their own
  // journal; no bill is touched.
  // Returns { success, message, reversedBills }.
  deleteCheck(id) {
    this.assertNotReconciled(id);
    const check = this.getById(id);
    if (!check) {
      // Idempotent: a retried delete must not error and must not reverse again.
      return { success: true, alreadyReversed: true, message: 'Check already deleted', reversedBills: [] };
    }
    if (String(check.type || '').toLowerCase() !== 'check') {
      return { success: false, error: `Transaction #${id} is not a check` };
    }

    const BillPayments = require('./billPayments');
    const res = BillPayments.reverseForCheck(id, { reason: 'Check deleted', userId: 'system' });
    if (!res || res.success === false) {
      return { success: false, error: (res && res.error) || 'Failed to reverse the payment' };
    }

    const reversedBills = Array.isArray(res.reversedBills) ? res.reversedBills : [];
    const first = reversedBills[0];
    return {
      success: true,
      message: res.alreadyReversed
        ? `Check #${check.reference || id} was already reversed`
        : `Check #${check.reference || id} deleted and payment reversed`,
      reversedJournal: true,
      reversedBill: first
        ? { expenseId: first.expenseId, newPaid: first.paid, newStatus: first.status }
        : null,
      reversedBills,
    };
  },

  reconcileTransactions({ accountId, accountName, statementDate, statementBalance, transactions, reconciledBy, createAdjustment = false, adjustmentDescription = null, adjustmentAccountId = null }) {
    const db = require('./dbmgr');

    if (!accountId || !Array.isArray(transactions) || transactions.length === 0) {
      throw new Error('Please select at least one transaction to reconcile');
    }
    const stmtBal = Number(statementBalance) || 0;
    const recDate = statementDate || new Date().toISOString().slice(0, 10);

    // Load the selected transactions (debit - credit = bank movement)
    const placeholders = transactions.map(() => '?').join(',');
    const selected = db.prepare(
      `SELECT id, debit, credit, amount, isReconciled FROM transactions WHERE id IN (${placeholders})`
    ).all(...transactions.map(Number));

    if (selected.length !== transactions.length) {
      throw new Error('One or more selected transactions no longer exist');
    }
    const alreadyReconciled = selected.filter(t => t.isReconciled);
    if (alreadyReconciled.length > 0) {
      throw new Error('One or more selected transactions are already reconciled');
    }

    const movement = selected.reduce((sum, t) => sum + (Number(t.debit) || 0) - (Number(t.credit) || 0), 0);

    // Starting balance for this statement. The rule lives in ONE place —
    // services/openingBalance.js — so the reconciliation and the General Ledger
    // cannot drift apart on what the account's opening balance is:
    //   - First reconciliation  -> the account's opening balance
    //   - Later reconciliations -> the previous statement ending balance
    //     (which already contains the opening balance; never re-added)
    const OpeningBalance = require('../services/openingBalance');
    const startState = OpeningBalance.reconciliationStartingBalance(db, accountId);
    const startingBalance = startState.startingBalance;

    const clearedBalance = startingBalance + movement;

    // Difference = statement ending balance - cleared balance (opening balance included)
    const difference = stmtBal - clearedBalance;

    if (Math.abs(difference) > 0.005 && !createAdjustment) {
      throw new Error(
        `Reconciliation cannot be completed because the account is out of balance. Remaining Difference: ${difference.toFixed(2)}`
      );
    }

    db.prepare('BEGIN TRANSACTION').run();

    try {
      // When the user explicitly chooses to adjust, post a real journal entry so
      // the difference is captured in the GL / journal (never silently zeroed).
      let adjustmentJournalId = null;
      let adjustmentAmount = 0;
      let adjustmentDescriptionText = null;
      let adjustmentAccountUsed = null;
      if (Math.abs(difference) > 0.005 && createAdjustment) {
        adjustmentAmount = Math.abs(difference);
        const COA = require('./chartOfAccounts');
        const bank = COA.getAccount(accountId);
        if (!bank) throw new Error('Bank account not found for the reconciliation adjustment');

        // Which account absorbs the difference is decided by ONE rule
        // (services/reconciliationAdjustment.js): the account the user chose,
        // else a configured discrepancy account, else the first eligible one.
        // The bank account itself is never permitted on both sides.
        const ReconAdj = require('../services/reconciliationAdjustment');
        const disc = ReconAdj.resolveAdjustmentAccount(db, { adjustmentAccountId, bankAccountId: accountId });
        if (!disc) {
          throw new Error(
            'No adjustment account available. Create an expense account such as ' +
            `"${ReconAdj.DEFAULT_DISCREPANCY_NAME}" (or pick one) and try again.`
          );
        }

        adjustmentDescriptionText = (adjustmentDescription && adjustmentDescription.trim())
          || `Bank reconciliation adjustment for ${recDate}`;

        // The adjustment must move the BOOK balance to the statement balance.
        //   difference > 0 : the statement says there is more money than the
        //                    books do  -> DEBIT the bank, CREDIT the adjustment
        //   difference < 0 : the books carry more than the statement does
        //                    -> CREDIT the bank, DEBIT the adjustment
        // Either way the bank side is signed like a bank movement and the entry
        // balances by construction (both lines carry adjustmentAmount).
        const lines = difference > 0
          ? [
              { account_id: bank.id, debit: adjustmentAmount, description: adjustmentDescriptionText },
              { account_id: disc.id, credit: adjustmentAmount, description: adjustmentDescriptionText },
            ]
          : [
              { account_id: disc.id, debit: adjustmentAmount, description: adjustmentDescriptionText },
              { account_id: bank.id, credit: adjustmentAmount, description: adjustmentDescriptionText },
            ];

        const JournalEntries = require('./journalEntries');
        const je = JournalEntries.post({
          date: recDate,
          description: adjustmentDescriptionText,
          // source_type/source_id make the entry traceable back to the
          // reconciliation from the General Ledger and Journal Entries screens.
          source_type: 'reconciliation',
          source_id: accountId,
          created_by: reconciledBy || null,
          lines,
        });
        if (!je || je.error || !je.id) {
          throw new Error((je && je.error) || 'Failed to post the reconciliation adjustment journal entry');
        }
        adjustmentJournalId = je.id;
        adjustmentAccountUsed = { id: disc.id, name: disc.name };
      }

      // Insert reconciliation record (audit trail)
      // After a successful adjustment the reconciliation is RESOLVED: the
      // recorded difference is zero, while `originalDifference` and
      // `adjustmentAmount` preserve exactly what was posted and why.
      const unresolvedDifference = Math.abs(difference) < 0.005 ? 0 : difference;
      const resolvedDifference = adjustmentJournalId ? 0 : unresolvedDifference;

      const recRes = db.prepare(`
        INSERT INTO reconciliations (
          accountId, accountName, statementDate, statementBalance, reconciledBalance,
          startingBalance, difference, adjustmentAmount, adjustmentJournalId, adjustmentDescription,
          adjustmentAccountId, originalDifference, reconciledBy
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        accountId,
        accountName || null,
        recDate,
        stmtBal,
        clearedBalance,
        startingBalance,
        resolvedDifference,
        adjustmentAmount,
        adjustmentJournalId,
        adjustmentJournalId ? adjustmentDescriptionText : null,
        adjustmentAccountUsed ? adjustmentAccountUsed.id : null,
        unresolvedDifference,
        reconciledBy || null
      );
      const reconciliationId = recRes.lastInsertRowid;

      // Link each transaction to this reconciliation + mark as reconciled
      const updateStmt = db.prepare(`
        UPDATE transactions
        SET isReconciled = 1, reconciliationId = ?, reconciliationDate = ?
        WHERE id = ?
      `);
      const linkStmt = db.prepare(`
        INSERT INTO reconciliation_transactions (reconciliationId, transactionId, amount)
        VALUES (?, ?, ?)
      `);

      selected.forEach(tx => {
        updateStmt.run(reconciliationId, recDate, tx.id);
        linkStmt.run(reconciliationId, tx.id, (Number(tx.debit) || 0) - (Number(tx.credit) || 0));
      });

      db.prepare('COMMIT').run();
      return {
        success: true,
        reconciliationId,
        startingBalance,
        startingBalanceSource: startState.source,
        movement,
        clearedBalance,
        // Post-adjustment position: zero once the difference has been captured.
        difference: resolvedDifference,
        unresolvedDifference,
        adjustmentJournalId,
        adjustmentAccount: adjustmentAccountUsed,
      };
    } catch (error) {
      db.prepare('ROLLBACK').run();
      throw error;
    }
  },

  // Unreconciled transactions for a bank account (the active work queue)
  getUnreconciledTransactions({ accountId, statementDate }) {
    const db = require('./dbmgr');
    const params = [accountId];
    let dateClause = '';
    if (statementDate) {
      dateClause = ' AND date <= ?';
      params.push(statementDate);
    }
    return db.prepare(`
      SELECT t.*,
             (COALESCE(t.debit, 0) - COALESCE(t.credit, 0)) AS amount
      FROM transactions t
      WHERE t.accountId = ?
        AND (t.isReconciled IS NULL OR t.isReconciled = 0)
        AND (t.status IS NULL OR LOWER(t.status) != 'voided')
        ${dateClause}
      ORDER BY t.date ASC, t.id ASC
    `).all(...params);
  },

  // Reconciliation history (audit trail) for an account
  getReconciliations({ accountId }) {
    const db = require('./dbmgr');
    const rows = db.prepare(`
      SELECT r.*,
             (SELECT COUNT(*) FROM reconciliation_transactions rt WHERE rt.reconciliationId = r.id) AS transactionCount,
             (SELECT COALESCE(SUM(rt.amount), 0) FROM reconciliation_transactions rt WHERE rt.reconciliationId = r.id) AS totalCleared
      FROM reconciliations r
      WHERE r.accountId = ?
      ORDER BY r.statementDate DESC, r.id DESC
    `).all(accountId);
    return rows.map(r => ({
      ...r,
      transactionCount: Number(r.transactionCount) || 0,
      totalCleared: Number(r.totalCleared) || 0,
    }));
  },

  // Transactions included in a specific reconciliation
  getReconciliationDetail({ reconciliationId }) {
    const db = require('./dbmgr');
    const rec = db.prepare('SELECT * FROM reconciliations WHERE id = ?').get(reconciliationId);
    if (!rec) return null;
    const transactions = db.prepare(`
      SELECT rt.*, t.date, t.type, t.reference, t.description, t.debit, t.credit, t.status
      FROM reconciliation_transactions rt
      LEFT JOIN transactions t ON t.id = rt.transactionId
      WHERE rt.reconciliationId = ?
      ORDER BY t.date ASC, t.id ASC
    `).all(reconciliationId);
    return { ...rec, transactions };
  },

  createBankTransfer({ fromAccount, toAccount, date, amount, reference, description }) {
    // Closing date enforcement
    const closingDate = Settings.get('closingDate');
    if (closingDate && date && typeof date === 'string' && date <= closingDate) {
      throw new Error(`Posting date ${date} is on or before closing date ${closingDate}`);
    }
    const db = require('./dbmgr');

    // A transfer may only move money between real Bank-type accounts.
    const COA = require('./chartOfAccounts');
    const srcAcct = COA.getAccount(Number(fromAccount));
    const dstAcct = COA.getAccount(Number(toAccount));
    const isBank = (a) => a && String(a.type || a.accountType || '').trim().toLowerCase() === 'bank';
    if (!isBank(srcAcct)) {
      throw new Error(`Transfer source account "${srcAcct ? srcAcct.name : fromAccount}" is not a Bank account.`);
    }
    if (!isBank(dstAcct)) {
      throw new Error(`Transfer destination account "${dstAcct ? dstAcct.name : toAccount}" is not a Bank account.`);
    }

    db.prepare('BEGIN TRANSACTION').run();
    
    try {
      const descOut = description ? `Transfer Out: ${description}` : 'Bank Transfer Out';
      const descIn = description ? `Transfer In: ${description} to account ${toAccount}` : `Bank Transfer In to account ${toAccount}`;
      const ref = reference || ('TRF-' + Date.now());

      // Create withdrawal from source account (credit = money leaving)
      db.prepare(`
        INSERT INTO transactions (
          accountId, date, type, reference, description,
          debit, credit
        ) VALUES (?, ?, 'transfer_out', ?, ?, NULL, ?)
      `).run(fromAccount, date, ref, descOut, amount);

      // Create deposit to destination account (debit = money arriving)
      db.prepare(`
        INSERT INTO transactions (
          accountId, date, type, reference, description,
          debit, credit
        ) VALUES (?, ?, 'transfer_in', ?, ?, ?, NULL)
      `).run(toAccount, date, ref, descIn, amount);

      db.prepare('COMMIT').run();

      // Post double-entry to general ledger: DR destination / CR source
      try {
        const srcRow = db.prepare('SELECT id, name FROM chart_of_accounts WHERE id = ?').get(fromAccount);
        const dstRow = db.prepare('SELECT id, name FROM chart_of_accounts WHERE id = ?').get(toAccount);
        if (srcRow && dstRow) {
          JournalEntries.post({
            date: date || new Date().toISOString().slice(0, 10),
            reference: ref,
            description: description || 'Bank Transfer',
            source_type: 'transfer', source_id: ref,
            lines: [
              { account_id: dstRow.id, debit: amount, credit: 0, description: dstRow.name },
              { account_id: srcRow.id, debit: 0, credit: amount, description: srcRow.name },
            ],
          });
        }
      } catch (jErr) { console.warn('[transactions] Journal post (transfer) failed:', jErr.message); }

      return { success: true };
    } catch (error) {
      db.prepare('ROLLBACK').run();
      throw error;
    }
  },

  // Create an intercompany transfer between two entities and accounts
  createIntercompanyTransfer({ fromEntityId, toEntityId, fromAccountId, toAccountId, date, amount, reference, description, eliminateOnConsolidation = true }) {
    const closingDate = Settings.get('closingDate');
    if (closingDate && date && typeof date === 'string' && date <= closingDate) {
      throw new Error(`Posting date ${date} is on or before closing date ${closingDate}`);
    }
    const db = require('./dbmgr');
    db.prepare('BEGIN TRANSACTION').run();
    try {
      const pairId = Date.now(); // simple linkage identifier
      // Credit from entity (outflow)
      db.prepare(`
        INSERT INTO transactions (
          accountId, date, type, reference, description, debit, credit, entity_id, isIntercompany, eliminateOnConsolidation, pairId
        ) VALUES (?, ?, 'intercompany', ?, ?, NULL, ?, ?, 1, ?, ?)
      `).run(fromAccountId, date, reference || null, description || 'Intercompany Transfer Out', amount, fromEntityId, eliminateOnConsolidation ? 1 : 0, pairId);

      // Debit to entity (inflow)
      db.prepare(`
        INSERT INTO transactions (
          accountId, date, type, reference, description, debit, credit, entity_id, isIntercompany, eliminateOnConsolidation, pairId
        ) VALUES (?, ?, 'intercompany', ?, ?, ?, NULL, ?, 1, ?, ?)
      `).run(toAccountId, date, reference || null, description || 'Intercompany Transfer In', amount, toEntityId, eliminateOnConsolidation ? 1 : 0, pairId);

      db.prepare('COMMIT').run();

      // Post double-entry to general ledger
      try {
        const srcAcct = db.prepare('SELECT id, name FROM chart_of_accounts WHERE id = ?').get(fromAccountId);
        const dstAcct = db.prepare('SELECT id, name FROM chart_of_accounts WHERE id = ?').get(toAccountId);
        if (srcAcct && dstAcct) {
          JournalEntries.post({
            date: date || new Date().toISOString().slice(0, 10),
            reference: reference || null,
            description: description || 'Intercompany Transfer',
            source_type: 'intercompany_transfer', source_id: reference || pairId,
            lines: [
              { account_id: dstAcct.id, debit: amount, credit: 0, description: dstAcct.name },
              { account_id: srcAcct.id, debit: 0, credit: amount, description: srcAcct.name },
            ],
          });
        }
      } catch (jErr) { console.warn('[transactions] Journal post (intercompany) failed:', jErr.message); }

      return { success: true };
    } catch (error) {
      db.prepare('ROLLBACK').run();
      throw error;
    }
  },

  createDeposit({ accountId, date, items, total }) {
    // Closing date enforcement
    const closingDate = Settings.get('closingDate');
    if (closingDate && date && typeof date === 'string' && date <= closingDate) {
      throw new Error(`Posting date ${date} is on or before closing date ${closingDate}`);
    }
    const db = require('./dbmgr');
    
    db.prepare('BEGIN TRANSACTION').run();
    
    try {
      // Insert main deposit transaction
      const result = db.prepare(`
        INSERT INTO transactions (
          accountId, date, type, reference, description,
          debit, credit
        ) VALUES (?, ?, 'deposit', ?, 'Bank Deposit', ?, NULL)
      `).run(accountId, date, 'DEP-' + Date.now(), total);

      const depositId = result.lastInsertRowid;

      // Insert deposit items
      const itemStmt = db.prepare(`
        INSERT INTO deposit_items (
          depositId, type, reference, description, amount
        ) VALUES (?, ?, ?, ?, ?)
      `);

      items.forEach(item => {
        itemStmt.run(depositId, item.type, item.reference, item.description, item.amount);
      });

      db.prepare('COMMIT').run();
      return { success: true };
    } catch (error) {
      db.prepare('ROLLBACK').run();
      throw error;
    }
  },

  processPayroll({ payPeriodStart, payPeriodEnd, paymentMethod, bankAccount, notes, employeeIds }) {
    // Closing date enforcement (payPeriodEnd is posting date)
    const closingDate = Settings.get('closingDate');
    if (closingDate && payPeriodEnd && typeof payPeriodEnd === 'string' && payPeriodEnd <= closingDate) {
      throw new Error(`Posting date ${payPeriodEnd} is on or before closing date ${closingDate}`);
    }
    const db = require('./dbmgr');
    
    db.prepare('BEGIN TRANSACTION').run();
    
    try {
      // Create payroll run record
      const runResult = db.prepare(`
        INSERT INTO payroll_runs (
          startDate, endDate, paymentMethod, bankAccount, notes
        ) VALUES (?, ?, ?, ?, ?)
      `).run(payPeriodStart, payPeriodEnd, paymentMethod, bankAccount, notes);

      const payrollRunId = runResult.lastInsertRowid;

      // Get employee details and create payments
      const employeeStmt = db.prepare('SELECT * FROM employees WHERE id = ?');
      const paymentStmt = db.prepare(`
        INSERT INTO payroll_payments (
          payrollRunId, employeeId, grossPay, deductions, netPay
        ) VALUES (?, ?, ?, ?, ?)
      `);
      const transactionStmt = db.prepare(`
        INSERT INTO transactions (
          accountId, date, type, reference, description,
          debit, credit
        ) VALUES (?, ?, 'payroll', ?, ?, NULL, ?)
      `);

      employeeIds.forEach(employeeId => {
        const employee = employeeStmt.get(employeeId);
        
        const grossPay = employee.salary || 0;
        const deductions = grossPay * 0.2; // Example: 20% deductions
        const netPay = grossPay - deductions;

        // Create payment record
        paymentStmt.run(payrollRunId, employeeId, grossPay, deductions, netPay);

        // Create bank transaction
        transactionStmt.run(
          bankAccount,
          payPeriodEnd,
          `PAY-${payrollRunId}-${employeeId}`,
          `Payroll Payment - ${employee.first_name} ${employee.last_name}`,
          netPay
        );
      });

      db.prepare('COMMIT').run();
      return { success: true };
    } catch (error) {
      db.prepare('ROLLBACK').run();
      throw error;
    }
  }

  ,

  getPayrollRuns() {
    try {
      const runs = db.prepare(`
        SELECT pr.id, pr.startDate AS payPeriodStart, pr.endDate AS payPeriodEnd, pr.paymentMethod, pr.bankAccount, pr.notes, pr.status, pr.created_at
        FROM payroll_runs pr
        ORDER BY pr.created_at DESC
      `).all();

      // Attach summary totals for each run
      const stmtTotals = db.prepare(`SELECT IFNULL(SUM(netPay),0) as totalNetPay, COUNT(*) as paymentsCount FROM payroll_payments WHERE payrollRunId = ?`);

      const results = runs.map(run => {
        const totals = stmtTotals.get(run.id);
        return {
          ...run,
          totalNetPay: totals ? Number(totals.totalNetPay) : 0,
          paymentsCount: totals ? Number(totals.paymentsCount) : 0,
        };
      });

      return results;
    } catch (error) {
      console.error('Error fetching payroll runs:', error);
      return [];
    }
  }
};

// Aggregate transactions into a trial balance for a date range
Transactions.getTrialBalance = function(startDate, endDate) {
  try {
    const db = require('./dbmgr');

    // Normalize dates; if not provided, use wide range
    const start = startDate || '0000-01-01';
    const end = endDate || '9999-12-31';

    // Read from journal_lines (authoritative double-entry source) — same as computedBalance().
    // The Posted/date filter must gate the SUM (via CASE), not the LEFT JOIN:
    // putting it in the JOIN's ON clause left non-Posted lines counted, so the
    // Trial Balance included VOID entries and disagreed with the General Ledger.
    const rows = db.prepare(`
      SELECT coa.id                               AS accountId,
             coa.name                             AS accountName,
             coa.type                             AS accountType,
             coa.subType                          AS accountSubType,
             coa.number                           AS accountNumber,
             coa.normalBalance,
             COALESCE(SUM(CASE WHEN je.status = 'Posted' AND je.date >= ? AND je.date <= ? THEN jl.debit  ELSE 0 END), 0) AS totalDebit,
             COALESCE(SUM(CASE WHEN je.status = 'Posted' AND je.date >= ? AND je.date <= ? THEN jl.credit ELSE 0 END), 0) AS totalCredit
      FROM chart_of_accounts coa
      LEFT JOIN journal_lines jl   ON jl.account_id = coa.id
      LEFT JOIN journal_entries je ON je.id = jl.journal_id
      WHERE coa.status = 'Active'
      GROUP BY coa.id
      ORDER BY CAST(coa.number AS INTEGER), coa.name
    `).all(start, end, start, end);

    return rows.map(r => {
      // Single source of truth for the normal side (services/normalBalance.js):
      // the account's type wins; the stored field is honoured only when the
      // classification is unknown.
      const nb = getExpectedNormalBalance(r.accountType) || normalizeNormalBalance(r.normalBalance) || 'Debit';
      const d = Number(r.totalDebit)  || 0;
      const c = Number(r.totalCredit) || 0;
      // Balance = normal-side amount (positive = normal, negative = contra)
      const balance = nb === 'Debit' ? d - c : c - d;
      return {
        accountId:      r.accountId,
        accountName:    r.accountName,
        accountType:    r.accountType,
        accountSubType: r.accountSubType || '',
        accountNumber:  r.accountNumber  || '',
        debit:          d,
        credit:         c,
        balance,
      };
    });
  } catch (error) {
    console.error('Error computing trial balance:', error);
    return [];
  }
};

// Consolidated Trial Balance across entities
Transactions.getTrialBalanceByEntities = function(entityIds, startDate, endDate, options = {}) {
  try {
    const db = require('./dbmgr');
    const start = startDate || '0000-01-01';
    const end = endDate || '9999-12-31';
    const eliminate = options.eliminateIntercompany !== false; // default true

    const ids = Array.isArray(entityIds) ? entityIds.filter(id => id != null) : [];
    if (ids.length === 0) {
      // no filter -> behave like standard TB
      return Transactions.getTrialBalance(start, end);
    }

    const placeholders = ids.map(() => '?').join(',');

    const stmt = db.prepare(`
      SELECT coa.id as accountId,
             coa.name as accountName,
             coa.type as accountType,
             IFNULL(s.totalDebit, 0) as totalDebit,
             IFNULL(s.totalCredit, 0) as totalCredit
      FROM chart_of_accounts coa
      LEFT JOIN (
        SELECT accountId,
               SUM(IFNULL(debit,0)) as totalDebit,
               SUM(IFNULL(credit,0)) as totalCredit
        FROM transactions
        WHERE date >= ? AND date <= ?
          AND (status IS NULL OR LOWER(status) = 'active')
          AND entity_id IN (${placeholders})
          ${eliminate ? "AND (isIntercompany IS NULL OR eliminateOnConsolidation = 0)" : ""}
        GROUP BY accountId
      ) s ON s.accountId = coa.id
      ORDER BY coa.number || coa.id
    `);

    const rows = stmt.all(start, end, ...ids);
    return rows.map(r => ({
      accountId: r.accountId,
      accountName: r.accountName,
      accountType: r.accountType,
      debit: Number(r.totalDebit) || 0,
      credit: Number(r.totalCredit) || 0,
      balance: (Number(r.totalDebit) || 0) - (Number(r.totalCredit) || 0)
    }));
  } catch (error) {
    console.error('Error computing consolidated trial balance:', error);
    return [];
  }
};

// Trial balance with filters for entity/class/location/department
Transactions.getTrialBalanceAdvanced = function({ startDate, endDate, entityIds = [], classTag, location, department }) {
  try {
    const db = require('./dbmgr');
    const start = startDate || '0000-01-01';
    const end = endDate || '9999-12-31';

    const conditions = [`date >= ?`, `date <= ?`, `(status IS NULL OR LOWER(status) = 'active')`];
    const params = [start, end];

    if (Array.isArray(entityIds) && entityIds.length > 0) {
      conditions.push(`(entity_id IN (${entityIds.map(() => '?').join(',')}))`);
      params.push(...entityIds);
    }
    if (classTag) { conditions.push(`(class = ?)`); params.push(classTag); }
    if (location) { conditions.push(`(location = ?)`); params.push(location); }
    if (department) { conditions.push(`(department = ?)`); params.push(department); }

    const where = conditions.join(' AND ');

    const stmt = db.prepare(`
      SELECT coa.id as accountId,
             coa.name as accountName,
             coa.type as accountType,
             IFNULL(s.totalDebit, 0) as totalDebit,
             IFNULL(s.totalCredit, 0) as totalCredit
      FROM chart_of_accounts coa
      LEFT JOIN (
        SELECT accountId,
               SUM(IFNULL(debit,0)) as totalDebit,
               SUM(IFNULL(credit,0)) as totalCredit
        FROM transactions
        WHERE ${where}
        GROUP BY accountId
      ) s ON s.accountId = coa.id
      ORDER BY coa.number || coa.id
    `);

    const rows = stmt.all(...params);
    return rows.map(r => ({
      accountId: r.accountId,
      accountName: r.accountName,
      accountType: r.accountType,
      debit: Number(r.totalDebit) || 0,
      credit: Number(r.totalCredit) || 0,
      balance: (Number(r.totalDebit) || 0) - (Number(r.totalCredit) || 0)
    }));
  } catch (error) {
    console.error('Error computing trial balance (advanced):', error);
    return [];
  }
};
Transactions.createTable();
// Run schema migration to add any missing columns for older DBs
if (typeof Transactions.ensureColumns === 'function') {
  try { Transactions.ensureColumns(); } catch (e) { console.error('Error running transactions.ensureColumns', e); }
}

module.exports = Transactions;