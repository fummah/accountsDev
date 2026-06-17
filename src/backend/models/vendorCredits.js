const db = require('./dbmgr');

const VendorCredits = {
  createTable() {
    db.prepare(`CREATE TABLE IF NOT EXISTS vendor_credits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      remaining_amount REAL NOT NULL,
      reference TEXT,
      memo TEXT,
      status TEXT DEFAULT 'Active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS credit_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      credit_id INTEGER NOT NULL,
      expense_id INTEGER,
      amount REAL NOT NULL,
      applied_date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (credit_id) REFERENCES vendor_credits(id),
      FOREIGN KEY (expense_id) REFERENCES expenses(id)
    )`).run();
  },

  createCredit({ supplier_id, date, amount, reference, memo }) {
    const amt = Number(amount) || 0;
    if (amt <= 0) return { error: 'Amount must be positive' };

    const result = db.prepare(
      `INSERT INTO vendor_credits (supplier_id, date, amount, remaining_amount, reference, memo)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(supplier_id, date, amt, amt, reference || null, memo || '');

    const creditId = result.lastInsertRowid;

    // Post journal: DR Accounts Payable / CR Expense
    try {
      const COA = require('./chartOfAccounts');
      const ap = COA.getSystemAccount('Accounts Payable');
      if (ap) {
        const fallbackExp = db.prepare("SELECT id FROM chart_of_accounts WHERE type = 'Expense' AND status = 'Active' LIMIT 1").get();
        if (fallbackExp) {
          const JournalEntries = require('./journalEntries');
          JournalEntries.post({
            date: date || new Date().toISOString().slice(0, 10),
            reference: reference || String(creditId),
            description: `Vendor Credit: ${memo || reference || ''}`,
            source_type: 'vendor_credit',
            source_id: creditId,
            lines: [
              { account_id: ap.id, debit: amt, credit: 0, description: 'Vendor Credit - AP reduction' },
              { account_id: fallbackExp.id, debit: 0, credit: amt, description: 'Vendor Credit - Expense reduction' },
            ],
          });
        }
      }
    } catch (e) { console.error('[vendorCredits] journal posting failed:', e); }

    // Reduce vendor balance
    try {
      db.prepare('UPDATE suppliers SET balance = COALESCE(balance,0) - ? WHERE id = ?').run(amt, Number(supplier_id));
    } catch (e) { console.error('[vendorCredits] vendor balance update failed:', e); }

    return { success: true, id: creditId };
  },

  getCredits(supplierId) {
    if (supplierId) {
      return db.prepare(
        `SELECT vc.*, COALESCE(s.display_name, s.first_name || ' ' || s.last_name, 'Unknown') AS supplier_name
         FROM vendor_credits vc
         LEFT JOIN suppliers s ON s.id = vc.supplier_id
         WHERE vc.supplier_id = ?
         ORDER BY vc.created_at DESC`
      ).all(Number(supplierId));
    }
    return db.prepare(
      `SELECT vc.*, COALESCE(s.display_name, s.first_name || ' ' || s.last_name, 'Unknown') AS supplier_name
       FROM vendor_credits vc
       LEFT JOIN suppliers s ON s.id = vc.supplier_id
       ORDER BY vc.created_at DESC`
    ).all();
  },

  getAvailableCredits(supplierId) {
    return db.prepare(
      `SELECT * FROM vendor_credits
       WHERE supplier_id = ? AND status = 'Active' AND remaining_amount > 0
       ORDER BY date DESC`
    ).all(Number(supplierId));
  },

  applyCredit(creditId, expenseId, amount) {
    const amt = Number(amount) || 0;
    if (amt <= 0) return { error: 'Amount must be positive' };

    const credit = db.prepare('SELECT * FROM vendor_credits WHERE id = ? AND status = ?').get(creditId, 'Active');
    if (!credit) return { error: 'Credit not found or not active' };
    if (credit.remaining_amount < amt - 0.005) return { error: 'Insufficient credit remaining' };

    db.prepare('BEGIN TRANSACTION').run();
    try {
      db.prepare(
        `INSERT INTO credit_applications (credit_id, expense_id, amount, applied_date)
         VALUES (?, ?, ?, ?)`
      ).run(creditId, expenseId || null, amt, new Date().toISOString().slice(0, 10));

      const newRemaining = credit.remaining_amount - amt;
      const newStatus = newRemaining <= 0.005 ? 'Applied' : 'Active';
      db.prepare('UPDATE vendor_credits SET remaining_amount = ?, status = ? WHERE id = ?')
        .run(Math.max(0, newRemaining), newStatus, creditId);

      if (expenseId) {
        db.prepare('UPDATE expenses SET paid_amount = COALESCE(paid_amount,0) + ? WHERE id = ?').run(amt, Number(expenseId));
      }

      db.prepare('COMMIT').run();
      return { success: true };
    } catch (e) {
      db.prepare('ROLLBACK').run();
      return { error: e.message };
    }
  },

  voidCredit(id) {
    const credit = db.prepare('SELECT * FROM vendor_credits WHERE id = ?').get(id);
    if (!credit) return { error: 'Credit not found' };
    if (credit.remaining_amount < credit.amount - 0.005) return { error: 'Cannot void - credit has been partially applied' };

    db.prepare("UPDATE vendor_credits SET status = 'Voided', remaining_amount = 0 WHERE id = ?").run(id);
    db.prepare('UPDATE suppliers SET balance = COALESCE(balance,0) + ? WHERE id = ?').run(credit.amount, Number(credit.supplier_id));
    return { success: true };
  },
};

VendorCredits.createTable();
module.exports = VendorCredits;
