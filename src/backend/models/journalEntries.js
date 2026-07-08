const db = require('./dbmgr');

const JournalEntries = {
  createTable: () => {
    // Tables may already be created by journal.js — just ensure all needed columns exist.
    db.prepare(`CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      description TEXT,
      entered_by TEXT
    )`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS journal_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER,
      account TEXT,
      debit REAL DEFAULT 0,
      credit REAL DEFAULT 0,
      FOREIGN KEY(entry_id) REFERENCES journal_entries(id)
    )`).run();

    // ── Migrate journal_entries: add ALL columns needed by both engines ──
    try {
      const jeCols = new Set(db.prepare("PRAGMA table_info('journal_entries')").all().map(c => c.name.toLowerCase()));
      const addJE = (col, ddl) => {
        if (!jeCols.has(col.toLowerCase())) {
          try {
            db.prepare(`ALTER TABLE journal_entries ADD COLUMN ${col} ${ddl}`).run();
          } catch (alterErr) {
            console.error(`[journalEntries] Failed to alter journal_entries for column ${col}:`, alterErr.message);
          }
        }
      };
      addJE('reference',    'TEXT');
      addJE('source_type',  'TEXT');
      addJE('source_id',    'INTEGER');
      addJE('memo',         'TEXT');
      addJE('status',       "TEXT DEFAULT 'Posted'");
      addJE('created_at',   "DATETIME"); // No DEFAULT CURRENT_TIMESTAMP to avoid SQLite ALTER limitations
      addJE('created_by',   'TEXT');
      addJE('entered_by',   'TEXT');
      addJE('reversal_of',  'INTEGER');
      addJE('is_template',  'INTEGER DEFAULT 0');
      addJE('entity_id',    'INTEGER');
      addJE('class',        'TEXT');
      addJE('location',     'TEXT');
      addJE('department',   'TEXT');
    } catch (e) { console.error('[journalEntries] journal_entries migration:', e.message); }

    // ── Migrate journal_lines: add ALL columns needed by both engines ──
    try {
      const jlCols = new Set(db.prepare("PRAGMA table_info('journal_lines')").all().map(c => c.name.toLowerCase()));
      const addJL = (col, ddl) => { if (!jlCols.has(col.toLowerCase())) db.prepare(`ALTER TABLE journal_lines ADD COLUMN ${col} ${ddl}`).run(); };
      addJL('journal_id',   'INTEGER REFERENCES journal_entries(id)');
      addJL('account_id',   'INTEGER');
      addJL('description',  'TEXT');
      addJL('class',        'TEXT');
      addJL('location',     'TEXT');
      addJL('department',   'TEXT');
      addJL('entry_id',     'INTEGER');
      addJL('account',      'TEXT');
    } catch (e) { console.error('[journalEntries] journal_lines migration:', e.message); }

    // ── Back-fill journal_id ↔ entry_id ──
    try { db.prepare("UPDATE journal_lines SET journal_id = entry_id WHERE journal_id IS NULL AND entry_id IS NOT NULL").run(); } catch {}
    try { db.prepare("UPDATE journal_lines SET entry_id = journal_id WHERE entry_id IS NULL AND journal_id IS NOT NULL").run(); } catch {}
    try { db.prepare("UPDATE journal_entries SET status = 'Posted' WHERE status IS NULL").run(); } catch {}

    // Indexes
    try { db.prepare('CREATE INDEX IF NOT EXISTS idx_jl_account    ON journal_lines(account_id)').run(); } catch {}
    try { db.prepare('CREATE INDEX IF NOT EXISTS idx_je_source     ON journal_entries(source_type, source_id)').run(); } catch {}
    try { db.prepare('CREATE INDEX IF NOT EXISTS idx_je_date       ON journal_entries(date)').run(); } catch {}
    try { db.prepare('CREATE INDEX IF NOT EXISTS idx_jl_journal_id ON journal_lines(journal_id)').run(); } catch {}
  },

  // ── Post a balanced journal entry ────────────────────────────────────────
  post: (entry) => {
    const lines = entry.lines || [];
    if (!lines.length) throw new Error('Journal entry must have at least one line.');
    const totalDebit  = lines.reduce((s, l) => s + Number(l.debit  || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      throw new Error(`Entry out of balance: debit ${totalDebit.toFixed(2)} ≠ credit ${totalCredit.toFixed(2)}`);
    }
    // Safety: ensure required columns exist (in case migration was skipped)
    try {
      const cols = new Set(db.prepare("PRAGMA table_info('journal_entries')").all().map(c => c.name.toLowerCase()));
      if (!cols.has('created_by')) db.prepare("ALTER TABLE journal_entries ADD COLUMN created_by TEXT").run();
      if (!cols.has('created_at')) db.prepare("ALTER TABLE journal_entries ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP").run();
      if (!cols.has('reference')) db.prepare("ALTER TABLE journal_entries ADD COLUMN reference TEXT").run();
      if (!cols.has('source_type')) db.prepare("ALTER TABLE journal_entries ADD COLUMN source_type TEXT").run();
      if (!cols.has('source_id')) db.prepare("ALTER TABLE journal_entries ADD COLUMN source_id INTEGER").run();
      if (!cols.has('memo')) db.prepare("ALTER TABLE journal_entries ADD COLUMN memo TEXT").run();
      if (!cols.has('status')) db.prepare("ALTER TABLE journal_entries ADD COLUMN status TEXT DEFAULT 'Posted'").run();
    } catch (migErr) { console.error('[journalEntries.post] column check:', migErr.message); }

    const postEntry = db.transaction(() => {
      const je = db.prepare(`
        INSERT INTO journal_entries (date, reference, description, source_type, source_id, memo, status, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'Posted', ?, datetime('now'))
      `).run(
        entry.date, entry.reference || null, entry.description || null,
        entry.source_type || null, entry.source_id || null,
        entry.memo || null, entry.created_by || null
      );
      const jid = je.lastInsertRowid;
      for (const line of lines) {
        db.prepare(`
          INSERT INTO journal_lines (journal_id, entry_id, account_id, debit, credit, description, class, location, department)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(jid, jid, line.account_id, Number(line.debit || 0), Number(line.credit || 0),
               line.description || null, line.class || null, line.location || null, line.department || null);
      }
      return { success: true, id: Number(jid) };
    });
    return postEntry();
  },

  // ── Void a journal entry ─────────────────────────────────────────────────
  voidEntry: (id) => {
    const res = db.prepare("UPDATE journal_entries SET status = 'Void', created_at = datetime('now') WHERE id = ?").run(id);
    return { success: res.changes > 0 };
  },

  // ── Fetch all journal entries ────────────────────────────────────────────
  getAll: ({ from, to, source_type, limit = 500 } = {}) => {
    let where = '1=1';
    const params = [];
    if (from) { where += ' AND je.date >= ?'; params.push(from); }
    if (to)   { where += ' AND je.date <= ?'; params.push(to); }
    if (source_type) { where += ' AND je.source_type = ?'; params.push(source_type); }
    const entries = db.prepare(`
      SELECT * FROM journal_entries WHERE ${where}
      ORDER BY date DESC, id DESC LIMIT ${Number(limit)}
    `).all(...params);
    // Attach lines
    for (const e of entries) {
      e.lines = db.prepare(`
        SELECT jl.*, c.name AS accountName, c.number AS accountNumber
        FROM journal_lines jl
        LEFT JOIN chart_of_accounts c ON jl.account_id = c.id
        WHERE jl.journal_id = ?
        ORDER BY jl.id
      `).all(e.id);
    }
    return entries;
  },

  // ── Lines for a specific account ─────────────────────────────────────────
  getByAccount: (accountId, { from, to, limit = 300 } = {}) => {
    let where = "jl.account_id = ? AND je.status != 'Void'";
    const params = [accountId];
    if (from) { where += ' AND je.date >= ?'; params.push(from); }
    if (to)   { where += ' AND je.date <= ?'; params.push(to); }
    return db.prepare(`
      SELECT jl.id, jl.debit, jl.credit, jl.description AS lineDesc,
             je.id AS journalId, je.date, je.reference, je.description,
             je.source_type, je.source_id, je.status, je.memo
      FROM journal_lines jl
      JOIN journal_entries je ON jl.journal_id = je.id
      WHERE ${where}
      ORDER BY je.date DESC, je.id DESC
      LIMIT ${Number(limit)}
    `).all(...params);
  },

  // ── Check if a source has already been journalised ──────────────────────
  hasPosting: (source_type, source_id) => {
    const row = db.prepare("SELECT id FROM journal_entries WHERE source_type = ? AND source_id = ? AND status = 'Posted' LIMIT 1")
      .get(source_type, source_id);
    return !!row;
  },

  // ── Reverse a previously posted entry (creates counter-entry) ───────────
  reverse: (journalId, date, created_by) => {
    const orig = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(journalId);
    if (!orig) throw new Error('Original entry not found');
    const origLines = db.prepare('SELECT * FROM journal_lines WHERE journal_id = ?').all(journalId);
    const reversedLines = origLines.map(l => ({
      account_id: l.account_id, debit: l.credit, credit: l.debit, description: l.description,
      class: l.class, location: l.location, department: l.department,
    }));
    return JournalEntries.post({
      date, description: `Reversal of entry #${journalId}: ${orig.description || ''}`,
      source_type: 'reversal', source_id: journalId, created_by,
      lines: reversedLines,
    });
  },

  // ── POST FROM INVOICE ──────────────────────────────────────────────────
  // DR Accounts Receivable (full total) / CR each income account per invoice line
  postInvoice: (invoice) => {
    if (JournalEntries.hasPosting('invoice', invoice.id)) return { skipped: true };
    const COA = require('./chartOfAccounts');
    const ar = COA.getSystemAccount('Accounts Receivable') || COA.getByName('Accounts Receivable');
    if (!ar) return { error: 'Accounts Receivable account not found in COA' };

    // Resolve fallback revenue account (used when a line has no income_account)
    const fallbackRevenue = COA.getByName('Sales Revenue') || COA.getByName('Service Revenue')
      || db.prepare("SELECT * FROM chart_of_accounts WHERE (LOWER(type)='income' OR LOWER(type)='other income') AND status='Active' LIMIT 1").get();
    if (!fallbackRevenue) return { error: 'No revenue/income account found in COA' };

    // Fetch invoice lines to credit the correct income account per product
    let invoiceLines = [];
    try {
      invoiceLines = db.prepare(`
        SELECT il.amount, il.quantity, il.description, il.product,
               p.income_account
        FROM invoice_lines il
        LEFT JOIN products p ON il.product = p.id
        WHERE il.invoice_id = ?
      `).all(Number(invoice.id));
    } catch { invoiceLines = []; }

    const vat = (() => {
      try { return Number(db.prepare('SELECT vat FROM invoices WHERE id = ?').get(Number(invoice.id))?.vat || 0); }
      catch { return 0; }
    })();

    // Build credit lines — one per invoice line mapped to its income account
    const creditLines = [];
    let totalCredit = 0;
    for (const line of invoiceLines) {
      const lineAmt = (Number(line.amount) || 0) * (1 + vat / 100);
      if (lineAmt <= 0) continue;

      let incomeAcctId = null;
      if (line.income_account) {
        const acct = db.prepare("SELECT id FROM chart_of_accounts WHERE name = ? OR number = ? LIMIT 1").get(line.income_account, line.income_account);
        if (acct) incomeAcctId = acct.id;
      }
      if (!incomeAcctId) incomeAcctId = fallbackRevenue.id;

      creditLines.push({ account_id: incomeAcctId, debit: 0, credit: lineAmt, description: line.description || 'Revenue' });
      totalCredit += lineAmt;
    }

    // If no lines found, fall back to invoice total against fallback revenue
    if (!creditLines.length) {
      const amount = Number(invoice.total || invoice.amount || 0);
      if (!amount) return { error: 'Invoice has zero amount' };
      creditLines.push({ account_id: fallbackRevenue.id, debit: 0, credit: amount, description: 'Revenue' });
      totalCredit = amount;
    }

    if (totalCredit <= 0) return { error: 'Invoice has zero amount' };

    try {
      return JournalEntries.post({
        date: invoice.date || invoice.invoiceDate || new Date().toISOString().slice(0, 10),
        reference: invoice.number || String(invoice.id),
        description: `Invoice ${invoice.number || '#' + invoice.id} — ${invoice.customerName || ''}`,
        source_type: 'invoice', source_id: invoice.id,
        lines: [
          { account_id: ar.id, debit: totalCredit, credit: 0, description: 'Accounts Receivable' },
          ...creditLines,
        ],
      });
    } catch (e) { return { error: e.message }; }
  },

  // ── POST FROM PAYMENT ─────────────────────────────────────────────────
  // DR Bank/Undeposited Funds / CR Accounts Receivable
  postPayment: (payment) => {
    if (JournalEntries.hasPosting('payment', payment.id)) return { skipped: true };
    const COA = require('./chartOfAccounts');
    const ar = COA.getSystemAccount('Accounts Receivable');
    const bank = COA.getSystemAccount('Undeposited Funds') || COA.getByName('Undeposited Funds');
    if (!ar || !bank) return { error: 'Required COA accounts not found (AR/Bank)' };

    const amount = Number(payment.amount || 0);
    if (!amount) return { error: 'Payment has zero amount' };

    try {
      return JournalEntries.post({
        date: payment.date || new Date().toISOString().slice(0, 10),
        reference: payment.reference || String(payment.id),
        description: `Payment received — ${payment.customerName || ''}`,
        source_type: 'payment', source_id: payment.id,
        lines: [
          { account_id: bank.id, debit: amount,  credit: 0,      description: 'Payment received' },
          { account_id: ar.id,   debit: 0,        credit: amount, description: 'Accounts Receivable cleared' },
        ],
      });
    } catch (e) { return { error: e.message }; }
  },

  // ── POST FROM EXPENSE / BILL ──────────────────────────────────────────
  // DR each expense line's account / CR Accounts Payable (full total)
  postExpense: (expense) => {
    if (JournalEntries.hasPosting('expense', expense.id)) return { skipped: true };
    const COA = require('./chartOfAccounts');
    const ap = COA.getSystemAccount('Accounts Payable');
    if (!ap) return { error: 'Accounts Payable account not found in COA' };

    // Fallback expense account for lines whose category doesn't match any COA account
    const fallbackExpAcct = COA.getByName('General Expenses')
      || db.prepare("SELECT * FROM chart_of_accounts WHERE type = 'Expense' AND status = 'Active' LIMIT 1").get();
    if (!fallbackExpAcct) return { error: 'No expense account found in COA' };

    // Fetch expense lines — category is a plain TEXT column (not a FK)
    let expenseLines = [];
    try {
      expenseLines = db.prepare(
        `SELECT amount, description, category FROM expense_lines WHERE expense_id = ?`
      ).all(Number(expense.id));
    } catch { expenseLines = []; }

    const debitLines = [];
    let totalDebit = 0;

    for (const line of expenseLines) {
      const lineAmt = Number(line.amount) || 0;
      if (lineAmt <= 0) continue;

      // Match category text to COA account name (case-insensitive), fall back if unmatched
      let acctId = null;
      if (line.category) {
        const matched = db.prepare(
          `SELECT id FROM chart_of_accounts
           WHERE LOWER(name) = LOWER(?) AND status = 'Active'
           LIMIT 1`
        ).get(line.category);
        if (matched) acctId = matched.id;
      }
      if (!acctId) acctId = fallbackExpAcct.id;

      debitLines.push({ account_id: acctId, debit: lineAmt, credit: 0, description: line.description || line.category || 'Expense' });
      totalDebit += lineAmt;
    }

    // If no lines, fall back to expense-level total + category/description
    if (!debitLines.length) {
      const amount = Number(expense.amount || expense.total || 0);
      if (!amount) return { error: 'Expense has zero amount' };
      let acctId = fallbackExpAcct.id;
      if (expense.category) {
        const acctByName = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(name) = LOWER(?) AND status='Active' LIMIT 1").get(expense.category);
        if (acctByName) acctId = acctByName.id;
      }
      debitLines.push({ account_id: acctId, debit: amount, credit: 0, description: expense.description || expense.category || 'Expense' });
      totalDebit = amount;
    }

    if (totalDebit <= 0) return { error: 'Expense has zero amount' };

    try {
      return JournalEntries.post({
        date: expense.date || new Date().toISOString().slice(0, 10),
        reference: expense.reference || String(expense.id),
        description: `Expense: ${expense.description || expense.category || ''}`,
        source_type: 'expense', source_id: expense.id,
        lines: [
          ...debitLines,
          { account_id: ap.id, debit: 0, credit: totalDebit, description: 'Accounts Payable' },
        ],
      });
    } catch (e) { return { error: e.message }; }
  },

  // ── POST FROM CREDIT CARD / LOAN RECLASSIFICATION BILL ─────────────
  // DR Credit Card / Loan account(s) / CR Accounts Payable
  // Used when a bill from a Credit Card vendor or Loan lender uses
  // the same credit card or loan account as its distribution line,
  // with no expense/asset accounts involved.
  postExpenseReclassification: (expense) => {
    if (JournalEntries.hasPosting('expense', expense.id)) return { skipped: true };
    const COA = require('./chartOfAccounts');
    const ap = COA.getSystemAccount('Accounts Payable');
    if (!ap) return { error: 'Accounts Payable account not found in COA' };

    let expenseLines = [];
    try {
      expenseLines = db.prepare(
        `SELECT amount, description, category FROM expense_lines WHERE expense_id = ?`
      ).all(Number(expense.id));
    } catch { expenseLines = []; }

    const debitLines = [];
    let totalDebit = 0;

    for (const line of expenseLines) {
      const lineAmt = Number(line.amount) || 0;
      if (lineAmt <= 0) continue;
      let acctId = null;
      if (line.category) {
        const matched = db.prepare(
          `SELECT id FROM chart_of_accounts
           WHERE LOWER(name) = LOWER(?) AND status = 'Active'
           LIMIT 1`
        ).get(line.category);
        if (matched) acctId = matched.id;
      }
      if (!acctId) continue;
      debitLines.push({ account_id: acctId, debit: lineAmt, credit: 0, description: `Reclassify to AP: ${line.description || line.category || ''}` });
      totalDebit += lineAmt;
    }

    if (!debitLines.length) return { error: 'No valid credit card / loan account lines found' };
    if (totalDebit <= 0) return { error: 'Expense has zero amount' };

    try {
      return JournalEntries.post({
        date: expense.date || new Date().toISOString().slice(0, 10),
        reference: expense.reference || String(expense.id),
        description: `Reclassify to AP: ${expense.description || expense.category || ''}`,
        source_type: 'expense', source_id: expense.id,
        lines: [
          ...debitLines,
          { account_id: ap.id, debit: 0, credit: totalDebit, description: 'Accounts Payable' },
        ],
      });
    } catch (e) { return { error: e.message }; }
  },

  // ── POST FROM TRANSACTION (checks, credit card charges, bank txns) ────
  // DR each split-line expense account / CR the bank/cash account
  postTransaction: (tx) => {
    const COA = require('./chartOfAccounts');
    if (!tx.accountId) return { error: 'Transaction has no accountId (bank/cash account)' };
    const bankAcct = db.prepare('SELECT * FROM chart_of_accounts WHERE id = ?').get(tx.accountId);
    if (!bankAcct) return { error: 'Bank/cash account not found in COA' };

    const splitLines = Array.isArray(tx.splitLines) ? tx.splitLines : [];
    const fallbackExpAcct = COA.getByName('General Expenses')
      || db.prepare("SELECT * FROM chart_of_accounts WHERE type = 'Expense' AND status = 'Active' LIMIT 1").get();
    if (!fallbackExpAcct && !splitLines.length) return { error: 'No expense account found in COA' };

    const debitLines = [];
    let totalDebit = 0;

    for (const line of splitLines) {
      const lineAmt = Number(line.amount) || 0;
      if (lineAmt <= 0) continue;
      const acctName = line.account || line.category || '';
      let acctId = null;
      if (acctName) {
        const matched = db.prepare(
          "SELECT id FROM chart_of_accounts WHERE LOWER(name) = LOWER(?) AND status = 'Active' LIMIT 1"
        ).get(acctName);
        if (matched) acctId = matched.id;
      }
      if (!acctId && fallbackExpAcct) acctId = fallbackExpAcct.id;
      if (!acctId) continue;

      debitLines.push({ account_id: acctId, debit: lineAmt, credit: 0, description: line.description || acctName || 'Expense' });
      totalDebit += lineAmt;
    }

    // If no split lines, use the full amount against the fallback expense account
    if (!debitLines.length) {
      const amount = Number(tx.amount || 0);
      if (!amount) return { error: 'Transaction has zero amount' };
      debitLines.push({ account_id: fallbackExpAcct.id, debit: amount, credit: 0, description: tx.description || 'Expense' });
      totalDebit = amount;
    }

    if (totalDebit <= 0) return { error: 'Transaction has zero amount' };

    try {
      return JournalEntries.post({
        date: tx.date || new Date().toISOString().slice(0, 10),
        reference: tx.reference || String(tx.id || ''),
        description: tx.description || 'Transaction',
        source_type: 'transaction', source_id: tx.id || null,
        lines: [
          ...debitLines,
          { account_id: bankAcct.id, debit: 0, credit: totalDebit, description: bankAcct.name || 'Bank Account' },
        ],
      });
    } catch (e) { return { error: e.message }; }
  },
};

// ── Seed sample journal entries for demo ───────────────────────────────
JournalEntries.seedSampleData = () => {
  const count = db.prepare('SELECT COUNT(*) as c FROM journal_entries').get();
  if (count.c > 0) return { skipped: true, count: count.c };

  const COA = require('./chartOfAccounts');
  // Ensure we have enough COA accounts for a realistic demo
  const ensureAccount = (name, type, subType, number) => {
    const existing = db.prepare("SELECT id FROM chart_of_accounts WHERE name = ?").get(name);
    if (existing) return existing.id;
    db.prepare(`INSERT INTO chart_of_accounts (name, type, subType, number, normalBalance, status)
      VALUES (?, ?, ?, ?, ?, 'Active')`).run(name, type, subType, number, type === 'Asset' || type === 'Expense' || type === 'Cost of Goods Sold' ? 'Debit' : 'Credit');
    return db.prepare('SELECT last_insert_rowid() AS id').get().id;
  };
  const bankId    = ensureAccount('Checking Account',        'Bank',     'Checking',         '1000');
  const arId      = ensureAccount('Accounts Receivable',     'Asset',    'Accounts Receivable','1100');
  const apId      = ensureAccount('Accounts Payable',        'Liability','Accounts Payable', '2000');
  const rentId    = ensureAccount('Rent Expense',            'Expense',  'Rent',             '6100');
  const utilId    = ensureAccount('Utilities Expense',       'Expense',  'Utilities',        '6200');
  const officeId  = ensureAccount('Office Supplies Expense', 'Expense',  'Office Supplies',  '6300');
  const salaryId  = ensureAccount('Salaries & Wages',        'Expense',  'Salaries & Wages', '6400');
  const revenueId = ensureAccount('Service Revenue',         'Income',   'Service Income',   '4100');
  const cogsId    = ensureAccount('Cost of Goods Sold',      'Cost of Goods Sold','Cost of Goods Sold','5000');
  const reId      = ensureAccount('Retained Earnings',       'Equity',   'Retained Earnings','3900');

  const today = new Date();
  const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

  const post = (entry) => JournalEntries.post(entry);

  const sampleEntries = [
    // 1. Service revenue received (DR Bank, CR Revenue)
    { date: daysAgo(45), reference: 'SR-001', description: 'Consulting services - Q1 closing',
      source_type: 'seed', lines: [
        { account_id: bankId,    debit: 15000,  credit: 0,      description: 'Payment received' },
        { account_id: revenueId, debit: 0,       credit: 15000, description: 'Service revenue' },
      ]},
    // 2. Rent payment (DR Rent, CR Bank)
    { date: daysAgo(30), reference: 'EXP-RENT-001', description: 'Office rent - March',
      source_type: 'seed', lines: [
        { account_id: rentId,  debit: 5000,  credit: 0,    description: 'Monthly office rent' },
        { account_id: bankId,  debit: 0,     credit: 5000, description: 'Rent payment' },
      ]},
    // 3. Utilities payment (DR Utilities, CR Bank)
    { date: daysAgo(28), reference: 'EXP-UTIL-001', description: 'Electricity and water - March',
      source_type: 'seed', lines: [
        { account_id: utilId,  debit: 1200,  credit: 0,    description: 'Electricity + water bill' },
        { account_id: bankId,  debit: 0,     credit: 1200, description: 'Utilities payment' },
      ]},
    // 4. Office supplies (DR Office Supplies, CR Bank)
    { date: daysAgo(25), reference: 'EXP-OFF-001', description: 'Office supplies purchase',
      source_type: 'seed', lines: [
        { account_id: officeId, debit: 800,   credit: 0,    description: 'Stationery and supplies' },
        { account_id: bankId,   debit: 0,     credit: 800,  description: 'Office supplies payment' },
      ]},
    // 5. Invoice on account (DR AR, CR Revenue)
    { date: daysAgo(20), reference: 'INV-2025-001', description: 'Website development project - Client A',
      source_type: 'seed', lines: [
        { account_id: arId,     debit: 25000, credit: 0,      description: 'Invoice issued' },
        { account_id: revenueId, debit: 0,    credit: 25000,  description: 'Project revenue' },
      ]},
    // 6. Salaries (DR Salaries, CR Bank)
    { date: daysAgo(15), reference: 'PAYROLL-001', description: 'Bi-weekly payroll',
      source_type: 'seed', lines: [
        { account_id: salaryId, debit: 12000, credit: 0,     description: 'Employee salaries' },
        { account_id: bankId,   debit: 0,     credit: 12000, description: 'Salary payments' },
      ]},
    // 7. Bill received (DR COGS, CR AP)
    { date: daysAgo(10), reference: 'BILL-001', description: 'Server hosting - Q1',
      source_type: 'seed', lines: [
        { account_id: cogsId, debit: 3500, credit: 0,    description: 'Infrastructure costs' },
        { account_id: apId,   debit: 0,    credit: 3500, description: 'Vendor bill payable' },
      ]},
    // 8. Another service sale (DR Bank, CR Revenue)
    { date: daysAgo(5), reference: 'SR-002', description: 'Maintenance contract - Q2',
      source_type: 'seed', lines: [
        { account_id: bankId,    debit: 8000,  credit: 0,     description: 'Contract payment' },
        { account_id: revenueId, debit: 0,     credit: 8000,  description: 'Maintenance revenue' },
      ]},
    // 9. Bill paid (DR AP, CR Bank)
    { date: daysAgo(3), reference: 'PAY-AP-001', description: 'Payment to vendor - Server hosting',
      source_type: 'seed', lines: [
        { account_id: apId,   debit: 3500, credit: 0,    description: 'Vendor payment' },
        { account_id: bankId, debit: 0,    credit: 3500, description: 'Payment sent' },
      ]},
    // 10. AR collected (DR Bank, CR AR)
    { date: daysAgo(1), reference: 'PMT-AR-001', description: 'Payment received - Client A (partial)',
      source_type: 'seed', lines: [
        { account_id: bankId, debit: 15000, credit: 0,     description: 'Partial payment received' },
        { account_id: arId,   debit: 0,     credit: 15000, description: 'AR collection' },
      ]},
  ];

  let posted = 0;
  for (const entry of sampleEntries) {
    try { post(entry); posted++; }
    catch (e) { console.error('[journalEntries.seed] entry failed:', e.message); }
  }
  return { seeded: posted, total: sampleEntries.length };
};

JournalEntries.createTable();
JournalEntries.seedSampleData();

module.exports = JournalEntries;
