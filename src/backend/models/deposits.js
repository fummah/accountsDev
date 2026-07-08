const db = require('./dbmgr');

const Deposits = {
  createTable: () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS deposits (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_account_id INTEGER NOT NULL,
        date            TEXT NOT NULL,
        reference       TEXT,
        memo            TEXT,
        total_amount    REAL DEFAULT 0,
        status          TEXT DEFAULT 'Active',
        created_by      TEXT,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS deposit_allocations (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        deposit_id  INTEGER NOT NULL,
        account_id  INTEGER,
        amount      REAL DEFAULT 0,
        description TEXT,
        FOREIGN KEY (deposit_id) REFERENCES deposits(id)
      )
    `).run();

    // Migrations
    try {
      const cols = new Set(db.prepare("PRAGMA table_info('deposits')").all().map(r => r.name));
      const add = (col, ddl) => { if (!cols.has(col)) db.prepare(`ALTER TABLE deposits ADD COLUMN ${col} ${ddl}`).run(); };
      add('updated_at', 'DATETIME');
    } catch (e) { console.error('deposits migration:', e); }
  },

  create: ({ bankAccountId, date, reference, memo, paymentIds, allocations, createdBy }) => {
    const COA = require('./chartOfAccounts');
    const JournalEntries = require('./journalEntries');

    const totalAmount = Array.isArray(paymentIds) && paymentIds.length > 0
      ? db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE id IN (${paymentIds.map(() => '?').join(',')})`).get(...paymentIds).total
      : (allocations || []).reduce((s, a) => s + Number(a.amount || 0), 0);
    if (!totalAmount) throw new Error('Deposit must have at least one allocation or payment');

    const result = db.transaction(() => {
      // 1. Create deposit record
      const dep = db.prepare(`
        INSERT INTO deposits (bank_account_id, date, reference, memo, total_amount, status, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, 'Active', ?, datetime('now'))
      `).run(bankAccountId, date, reference || null, memo || null, totalAmount, createdBy || null);
      const depositId = dep.lastInsertRowid;

      // 2. Insert allocations (resolve account name → id if needed)
      if (allocations && allocations.length > 0) {
        const allocStmt = db.prepare('INSERT INTO deposit_allocations (deposit_id, account_id, amount, description) VALUES (?, ?, ?, ?)');
        for (const a of allocations) {
          let acctId = a.accountId || null;
          if (acctId && isNaN(Number(acctId))) {
            const found = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(name) = LOWER(?) LIMIT 1").get(String(acctId));
            acctId = found ? found.id : null;
          }
          allocStmt.run(depositId, acctId, Number(a.amount || 0), a.description || null);
        }
      }

      // 3. Link and update selected payments
      if (paymentIds && paymentIds.length > 0) {
        db.prepare(`UPDATE payments SET deposit_id = ?, status = 'Deposited' WHERE id IN (${paymentIds.map(() => '?').join(',')})`).run(depositId, ...paymentIds);
      }

      // 4. Post journal entry: DR Bank / CR (credit side)
      //    - Existing-payment deposits  → CR Undeposited Funds (clearing UF)
      //    - Manual deposits            → CR the selected income/asset/equity
      //      account on each allocation line (Sales Income, Owner Contribution…)
      const bank = db.prepare('SELECT id FROM chart_of_accounts WHERE id = ?').get(bankAccountId);
      if (!bank) throw new Error('Bank account not found');

      const isExistingPaymentsDeposit = Array.isArray(paymentIds) && paymentIds.length > 0;
      const creditLines = [];

      if (isExistingPaymentsDeposit) {
        const undeposited = COA.getSystemAccount('Undeposited Funds') || db.prepare("SELECT id FROM chart_of_accounts WHERE name = 'Undeposited Funds' LIMIT 1").get();
        if (!undeposited) throw new Error('Undeposited Funds account not found');
        creditLines.push({ account_id: undeposited.id, debit: 0, credit: totalAmount, description: 'Clear undeposited funds' });
      } else {
        // Manual deposit — credit each allocation's chosen account/category.
        // Fall back to Undeposited Funds only if an allocation has no account.
        const undeposited = COA.getSystemAccount('Undeposited Funds') || db.prepare("SELECT id FROM chart_of_accounts WHERE name = 'Undeposited Funds' LIMIT 1").get();
        for (const a of (allocations || [])) {
          const amt = Number(a.amount || 0);
          if (amt <= 0) continue;
          let creditAcctId = a.accountId || null;
          // accountId may be a name string — resolve to COA id
          if (creditAcctId && isNaN(Number(creditAcctId))) {
            const found = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(name) = LOWER(?) LIMIT 1").get(String(creditAcctId));
            creditAcctId = found ? found.id : null;
          }
          if (!creditAcctId && undeposited) creditAcctId = undeposited.id;
          if (!creditAcctId) throw new Error('Deposit allocation has no valid account/category');
          creditLines.push({ account_id: Number(creditAcctId), debit: 0, credit: amt, description: a.description || 'Deposit' });
        }
        if (!creditLines.length) throw new Error('Manual deposit requires at least one allocation with an account');
      }

      JournalEntries.post({
        date: date || new Date().toISOString().slice(0, 10),
        description: memo || `Bank Deposit — ${reference || ''}`,
        source_type: 'deposit',
        source_id: Number(depositId),
        lines: [
          { account_id: bank.id, debit: totalAmount, credit: 0, description: 'Deposit to bank' },
          ...creditLines,
        ],
      });

      // 5. Also write to legacy transactions table for backward compat
      try {
        db.prepare(`INSERT INTO transactions (accountId, date, type, reference, description, debit, created_at) VALUES (?, ?, 'deposit', ?, 'Bank Deposit', ?, datetime('now'))`)
          .run(bankAccountId, date, reference || `DEP-${depositId}`, totalAmount);
        const txId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
        for (const a of (allocations || [])) {
          if (a.accountId) {
            db.prepare('INSERT INTO deposit_items (depositId, type, reference, description, amount) VALUES (?, ?, ?, ?, ?)')
              .run(txId, 'allocation', null, a.description || '', Number(a.amount || 0));
          }
        }
      } catch (legacyErr) { console.warn('[deposits] legacy transactions write failed:', legacyErr.message); }

      return { success: true, id: Number(depositId) };
    })();

    return result;
  },

  getAll: () => {
    return db.prepare(`
      SELECT d.*, c.name AS bank_account_name
      FROM deposits d
      LEFT JOIN chart_of_accounts c ON d.bank_account_id = c.id
      ORDER BY d.date DESC, d.id DESC
    `).all();
  },

  getById: (id) => {
    const dep = db.prepare(`
      SELECT d.*, c.name AS bank_account_name
      FROM deposits d
      LEFT JOIN chart_of_accounts c ON d.bank_account_id = c.id
      WHERE d.id = ?
    `).get(id);
    if (!dep) return null;
    dep.allocations = db.prepare(`
      SELECT da.*, c.name AS account_name
      FROM deposit_allocations da
      LEFT JOIN chart_of_accounts c ON da.account_id = c.id
      WHERE da.deposit_id = ?
    `).all(id);
    dep.payments = db.prepare(`
      SELECT p.*, i.number AS invoice_number, c.display_name AS customer_name
      FROM payments p
      LEFT JOIN invoices i ON p.invoiceId = i.id
      LEFT JOIN customers c ON p.customerId = c.id
      WHERE p.deposit_id = ?
    `).all(id);
    return dep;
  },

  update: (id, { bankAccountId, date, reference, memo, allocations }) => {
    const existing = Deposits.getById(id);
    if (!existing) throw new Error('Deposit not found');
    if (existing.status === 'Reconciled') throw new Error('Cannot edit a reconciled deposit');

    const totalAmount = (allocations || []).reduce((s, a) => s + Number(a.amount || 0), 0);

    return db.transaction(() => {
      db.prepare(`UPDATE deposits SET bank_account_id = ?, date = ?, reference = ?, memo = ?, total_amount = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(bankAccountId || existing.bank_account_id, date || existing.date, reference ?? existing.reference, memo ?? existing.memo, totalAmount || existing.total_amount, id);

      // Replace allocations
      db.prepare('DELETE FROM deposit_allocations WHERE deposit_id = ?').run(id);
      if (allocations && allocations.length > 0) {
        const allocStmt = db.prepare('INSERT INTO deposit_allocations (deposit_id, account_id, amount, description) VALUES (?, ?, ?, ?)');
        for (const a of allocations) {
          allocStmt.run(id, a.accountId || null, Number(a.amount || 0), a.description || null);
        }
      }

      return { success: true };
    })();
  },

  voidDeposit: (id) => {
    const JournalEntries = require('./journalEntries');

    return db.transaction(() => {
      const dep = db.prepare('SELECT * FROM deposits WHERE id = ?').get(id);
      if (!dep) throw new Error('Deposit not found');

      // Void the journal entry
      const je = db.prepare("SELECT id FROM journal_entries WHERE source_type = 'deposit' AND source_id = ? AND status = 'Posted'").get(id);
      if (je) JournalEntries.voidEntry(je.id);

      // Unlink payments — revert to Pending Deposit
      db.prepare("UPDATE payments SET deposit_id = NULL, status = 'Pending Deposit' WHERE deposit_id = ?").run(id);

      // Void the deposit
      db.prepare("UPDATE deposits SET status = 'Void', updated_at = datetime('now') WHERE id = ?").run(id);

      return { success: true };
    })();
  },

  getPendingPayments: () => {
    return db.prepare(`
      SELECT p.*, i.number AS invoice_number, i.status AS invoice_status,
             c.display_name AS customer_name,
             (SELECT COALESCE(SUM(il.amount * (1 + i2.vat/100)),0)
              FROM invoice_lines il JOIN invoices i2 ON il.invoice_id = i2.id WHERE i2.id = p.invoiceId) AS invoice_total
      FROM payments p
      LEFT JOIN invoices i ON p.invoiceId = i.id
      LEFT JOIN customers c ON p.customerId = c.id
      WHERE p.status = 'Pending Deposit' OR p.status IS NULL
      ORDER BY p.date DESC, p.createdAt DESC
    `).all();
  },
};

Deposits.createTable();

module.exports = Deposits;
