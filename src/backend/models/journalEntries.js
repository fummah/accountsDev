const db = require('./dbmgr');

const JournalEntries = {
  createTable: () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        date        TEXT NOT NULL,
        reference   TEXT,
        description TEXT,
        source_type TEXT,
        source_id   INTEGER,
        memo        TEXT,
        status      TEXT DEFAULT 'Posted',
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by  TEXT
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS journal_lines (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        journal_id  INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
        account_id  INTEGER NOT NULL REFERENCES chart_of_accounts(id),
        debit       REAL DEFAULT 0,
        credit      REAL DEFAULT 0,
        description TEXT,
        class       TEXT,
        location    TEXT,
        department  TEXT
      )
    `).run();

    // Indexes
    try { db.prepare('CREATE INDEX IF NOT EXISTS idx_jl_account ON journal_lines(account_id)').run(); } catch {}
    try { db.prepare('CREATE INDEX IF NOT EXISTS idx_je_source  ON journal_entries(source_type, source_id)').run(); } catch {}
    try { db.prepare('CREATE INDEX IF NOT EXISTS idx_je_date    ON journal_entries(date)').run(); } catch {}
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
          INSERT INTO journal_lines (journal_id, account_id, debit, credit, description, class, location, department)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(jid, line.account_id, Number(line.debit || 0), Number(line.credit || 0),
               line.description || null, line.class || null, line.location || null, line.department || null);
      }
      return { success: true, id: jid };
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
      const lineAmt = (Number(line.amount) || 0) * (Number(line.quantity) || 1) * (1 + vat / 100);
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
};

JournalEntries.createTable();

module.exports = JournalEntries;
