// src/backend/models/billPayments.js
//
// CENTRAL BILL-PAYMENT LIFECYCLE SERVICE
//
// A vendor bill is paid by one or more bank payments (usually a Check). Each
// payment is a *payment application*: it links an explicit `expense_id` (the
// bill) to the bank `transaction_id` (the check) and to the posted
// `journal_id` (DR Accounts Payable / CR Bank) that recorded it.
//
//   Bill (expenses)
//     |
//     +---- bill_payments (payment application)
//              |
//              +---- transactions (Check)
//              +---- journal_entries (DR AP / CR Bank)
//
// Bill status is DERIVED, never set directly:
//
//   paidAmount      = SUM(active payment applications) + SUM(active vendor
//                     credit applications)
//   remainingAmount = bill total - paidAmount
//   status          = Paid | Partially Paid | Unpaid  (the UI derives Overdue
//                     from the due date, exactly as before)
//
// `recalcBill` is the ONE place that formula lives. Payment creation, payment
// reversal and the Bill Management screens all go through it, so deleting a
// check can no longer leave a bill stuck on "Paid".
//
// `reverseForCheck` is the ONE place a payment is undone. Both the Check
// Printing screen (deleteCheck) and any future vendor-payment screen call it,
// so accounting, allocations, bill balances and vendor balances can never drift
// apart. It is transactional and idempotent.

const db = require('./dbmgr');

const TOLERANCE = 0.005;

// Bill states that are a non-financial / approval lifecycle state. A bill with
// no active payments keeps its state instead of being forced back to "Unpaid".
const PRESERVED_EMPTY_STATES = new Set(['draft', 'void', 'voided', 'cancelled', 'pending']);

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

const lower = (v) => String(v == null ? '' : v).trim().toLowerCase();

// Some installs carry a stored `suppliers.balance` column, others derive vendor
// payables entirely from bill status/paid_amount (the columns `recalcBill`
// maintains). Detect once so payment/reversal stay correct either way and never
// crash on a schema without the column.
const SUPPLIER_HAS_BALANCE = (() => {
  try {
    return db.prepare("PRAGMA table_info('suppliers')").all().some(c => lower(c.name) === 'balance');
  } catch { return false; }
})();

const BillPayments = {
  createTable() {
    db.prepare(`CREATE TABLE IF NOT EXISTS bill_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      supplier_id INTEGER,
      transaction_id INTEGER,
      journal_id INTEGER,
      amount REAL NOT NULL,
      payment_date TEXT,
      status TEXT DEFAULT 'Active',
      balance_applied INTEGER DEFAULT 1,
      reversal_journal_id INTEGER,
      reversed_at TEXT,
      reversed_by TEXT,
      reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();

    // Additive migration for installs that already have an early version.
    try {
      const cols = new Set(db.prepare("PRAGMA table_info('bill_payments')").all().map(c => lower(c.name)));
      const add = (col, ddl) => { if (!cols.has(lower(col))) db.prepare(`ALTER TABLE bill_payments ADD COLUMN ${col} ${ddl}`).run(); };
      add('supplier_id', 'INTEGER');
      add('transaction_id', 'INTEGER');
      add('journal_id', 'INTEGER');
      add('balance_applied', 'INTEGER DEFAULT 1');
      add('reversal_journal_id', 'INTEGER');
      add('reversed_at', 'TEXT');
      add('reversed_by', 'TEXT');
      add('reason', 'TEXT');
    } catch (e) { console.error('[billPayments] migration failed:', e.message); }

    try { db.prepare('CREATE INDEX IF NOT EXISTS idx_bill_payments_expense ON bill_payments(expense_id)').run(); } catch {}
    try { db.prepare('CREATE INDEX IF NOT EXISTS idx_bill_payments_txn ON bill_payments(transaction_id)').run(); } catch {}
    try { db.prepare('CREATE INDEX IF NOT EXISTS idx_bill_payments_journal ON bill_payments(journal_id)').run(); } catch {}

    // Make sure the existing vendor credits (which also reduce a bill) are
    // visible to the derived balance, and adopt legacy bill-payment journal
    // entries so historical payments are not orphaned.
    this.backfillFromLegacy();
  },

  // ── Backfill ─────────────────────────────────────────────────────────────
  // Before this service existed, a bill payment was only implied by a posted
  // journal entry (source_type='bill_payment', source_id=the bill). Adopt each
  // of those as an application so `recalcBill` sees the full payment history.
  // Idempotent: a journal entry is only adopted once.
  backfillFromLegacy() {
    try {
      const entries = db.prepare(`
        SELECT je.id, je.source_id, je.date
        FROM journal_entries je
        WHERE je.source_type = 'bill_payment' AND je.status = 'Posted'
      `).all();
      if (!entries.length) return { adopted: 0 };

      const exists = db.prepare("SELECT id FROM bill_payments WHERE journal_id = ? LIMIT 1");
      const findCheck = db.prepare(`
        SELECT id FROM transactions
        WHERE LOWER(type) = 'check' AND description LIKE ?
        ORDER BY id DESC LIMIT 1
      `);
      const insert = db.prepare(`
        INSERT INTO bill_payments (expense_id, supplier_id, transaction_id, journal_id, amount, payment_date, status, balance_applied)
        VALUES (?, ?, ?, ?, ?, ?, 'Active', 1)
      `);

      let adopted = 0;
      const run = db.transaction(() => {
        for (const je of entries) {
          if (exists.get(je.id)) continue;
          const bill = db.prepare('SELECT id, payee FROM expenses WHERE id = ?').get(Number(je.source_id));
          if (!bill) continue;
          const totals = db.prepare(
            'SELECT COALESCE(SUM(debit), 0) AS debit FROM journal_lines WHERE journal_id = ?'
          ).get(je.id);
          const amount = round2(totals && totals.debit);
          if (amount <= TOLERANCE) continue;
          const check = findCheck.get(`%Bill #${bill.id}%`);
          insert.run(
            Number(bill.id),
            bill.payee != null ? Number(bill.payee) : null,
            check ? Number(check.id) : null,
            je.id,
            amount,
            je.date || null
          );
          adopted++;
        }
      });
      run();
      if (adopted) console.log(`[billPayments] adopted ${adopted} legacy bill payment(s)`);
      return { adopted };
    } catch (e) {
      console.error('[billPayments] legacy backfill failed:', e.message);
      return { adopted: 0, error: e.message };
    }
  },

  // ── Reads ────────────────────────────────────────────────────────────────
  getById(id) {
    return db.prepare('SELECT * FROM bill_payments WHERE id = ?').get(Number(id));
  },

  // Apply a delta to the stored vendor balance when the schema has one. A no-op
  // otherwise — the derived vendor payable (bill total minus paid_amount) is
  // already updated by recalcBill.
  adjustVendorBalance(supplierId, delta) {
    if (supplierId == null || !SUPPLIER_HAS_BALANCE) return false;
    db.prepare('UPDATE suppliers SET balance = COALESCE(balance, 0) + ? WHERE id = ?')
      .run(round2(delta), Number(supplierId));
    return true;
  },

  getActiveForBill(expenseId) {
    return db.prepare(
      "SELECT * FROM bill_payments WHERE expense_id = ? AND status = 'Active' ORDER BY id"
    ).all(Number(expenseId));
  },

  getAllForCheck(transactionId) {
    return db.prepare(
      'SELECT * FROM bill_payments WHERE transaction_id = ? ORDER BY id'
    ).all(Number(transactionId));
  },

  getActiveForCheck(transactionId) {
    return db.prepare(
      "SELECT * FROM bill_payments WHERE transaction_id = ? AND status = 'Active' ORDER BY id"
    ).all(Number(transactionId));
  },

  // Applications for a check, enriched for the delete-confirmation UI.
  describeForCheck(transactionId) {
    const rows = db.prepare(`
      SELECT bp.id, bp.expense_id AS billId, bp.amount, bp.status,
             e.ref_no AS billNumber, e.due_date AS dueDate,
             COALESCE(s.display_name, s.first_name || ' ' || s.last_name, s.first_name) AS vendorName
      FROM bill_payments bp
      LEFT JOIN expenses e ON e.id = bp.expense_id
      LEFT JOIN suppliers s ON s.id = bp.supplier_id
      WHERE bp.transaction_id = ? AND bp.status = 'Active'
      ORDER BY bp.id
    `).all(Number(transactionId));
    return rows.map(r => ({ ...r, amount: round2(r.amount) }));
  },

  // ── Derived bill balance / status ────────────────────────────────────────
  // The single source of truth for "how much has this bill been paid?".
  computeBillPosition(expenseId) {
    const id = Number(expenseId);
    const bill = db.prepare('SELECT id, approval_status, due_date FROM expenses WHERE id = ?').get(id);
    if (!bill) return null;

    const totalRow = db.prepare(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM expense_lines WHERE expense_id = ?'
    ).get(id);
    const total = round2(totalRow && totalRow.total);

    const appliedRow = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) AS applied FROM bill_payments WHERE expense_id = ? AND status = 'Active'"
    ).get(id);
    const creditRow = (() => {
      try {
        return db.prepare(
          'SELECT COALESCE(SUM(amount), 0) AS applied FROM credit_applications WHERE expense_id = ?'
        ).get(id);
      } catch { return { applied: 0 }; }
    })();

    const paid = round2((appliedRow && appliedRow.applied) + (creditRow && creditRow.applied));
    const remaining = round2(total - paid);

    const current = lower(bill.approval_status);
    let status;
    if (total > TOLERANCE && remaining <= TOLERANCE) {
      status = 'Paid';
    } else if (paid > TOLERANCE) {
      status = 'Partially Paid';
    } else if (PRESERVED_EMPTY_STATES.has(current)) {
      status = bill.approval_status; // keep Draft / Void / Cancelled / Pending
    } else {
      status = 'Unpaid';
    }

    return { expenseId: id, total, paid, remaining, status, dueDate: bill.due_date };
  },

  // Persist the derived position. `paid_amount` and `approval_status` are the
  // columns the Bill Management / Pay Bills screens read, so they must always
  // agree with the applications.
  recalcBill(expenseId) {
    const pos = this.computeBillPosition(expenseId);
    if (!pos) return null;
    db.prepare('UPDATE expenses SET paid_amount = ?, approval_status = ? WHERE id = ?')
      .run(pos.paid, pos.status, pos.expenseId);
    return pos;
  },

  // ── Writes ───────────────────────────────────────────────────────────────
  createApplication({ expenseId, supplierId, transactionId = null, journalId = null, amount, paymentDate = null, balanceApplied = true }) {
    const amt = round2(amount);
    if (amt <= TOLERANCE) return { error: 'Payment amount must be positive' };
    let supplier = supplierId;
    if (supplier == null) {
      const bill = db.prepare('SELECT payee FROM expenses WHERE id = ?').get(Number(expenseId));
      supplier = bill ? bill.payee : null;
    }
    const res = db.prepare(`
      INSERT INTO bill_payments (expense_id, supplier_id, transaction_id, journal_id, amount, payment_date, status, balance_applied)
      VALUES (?, ?, ?, ?, ?, ?, 'Active', ?)
    `).run(
      Number(expenseId),
      supplier != null ? Number(supplier) : null,
      transactionId != null ? Number(transactionId) : null,
      journalId != null ? Number(journalId) : null,
      amt,
      paymentDate || new Date().toISOString().slice(0, 10),
      balanceApplied ? 1 : 0
    );
    return { success: true, id: Number(res.lastInsertRowid), amount: amt };
  },

  // Reverse a single application: counter-post its journal entry, mark it
  // Reversed (never delete — the audit trail stays), and restore the vendor
  // balance if the original payment reduced it. Idempotent.
  reverseApplication(application, { reason = null, userId = 'system', date = null } = {}) {
    const app = typeof application === 'object' ? application : this.getById(application);
    if (!app) return { skipped: true, reason: 'application not found' };
    if (lower(app.status) !== 'active') return { skipped: true, reason: 'already reversed' };

    const JournalEntries = require('./journalEntries');
    let reversalJournalId = null;

    if (app.journal_id) {
      // Never double-reverse: a reversal is a Posted entry whose source_id is
      // the original journal entry id.
      const already = db.prepare(
        "SELECT id FROM journal_entries WHERE source_type = 'reversal' AND source_id = ? AND status = 'Posted' LIMIT 1"
      ).get(Number(app.journal_id));
      if (already) {
        reversalJournalId = Number(already.id);
      } else {
        try {
          const rev = JournalEntries.reverse(
            Number(app.journal_id),
            date || new Date().toISOString().slice(0, 10),
            userId
          );
          reversalJournalId = rev && rev.id ? Number(rev.id) : null;
        } catch (e) {
          // The payment journal is the accounting effect; if it cannot be
          // reversed the whole operation must fail so nothing half-applies.
          throw new Error(`Could not reverse payment journal #${app.journal_id}: ${e.message}`);
        }
      }
    }

    db.prepare(`
      UPDATE bill_payments
      SET status = 'Reversed', reversal_journal_id = ?, reversed_at = datetime('now'), reversed_by = ?, reason = ?
      WHERE id = ?
    `).run(reversalJournalId, userId || 'system', reason || null, Number(app.id));

    if (Number(app.balance_applied) && app.supplier_id != null) {
      this.adjustVendorBalance(app.supplier_id, app.amount);
    }

    return { reversed: true, applicationId: Number(app.id), reversalJournalId };
  },

  // ── Central payment creation entry point ─────────────────────────────────
  // Create the check, post DR Accounts Payable / CR Bank, record the explicit
  // payment application and derive the bill balance — atomically. This is the
  // counterpart to reverseForCheck, so the lifecycle has exactly one way in and
  // one way out.
  payBill({ expenseId, amount, paymentDate, bankAccount, checkNumber = null, vendorName = null, enteredBy = 'system' }) {
    const COA = require('./chartOfAccounts');
    const JournalEntries = require('./journalEntries');
    const Transactions = require('./transactions');

    const ap = COA.getSystemAccount('Accounts Payable');
    if (!ap) return { success: false, error: 'Accounts Payable account not in COA' };

    const billAmt = round2(amount);
    if (billAmt <= TOLERANCE) return { success: false, error: 'Invalid bill amount' };

    const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(Number(expenseId));
    if (!expense) return { success: false, error: 'Expense not found' };

    // Resolve the bank account by id (preferred) or name; it must be a real
    // Bank-type account, never a silent fallback.
    let bank = null;
    if (bankAccount) {
      const numericId = Number(bankAccount);
      if (Number.isFinite(numericId) && numericId > 0) {
        bank = db.prepare("SELECT * FROM chart_of_accounts WHERE id = ? AND status = 'Active'").get(numericId);
      }
      if (!bank) {
        bank = db.prepare("SELECT * FROM chart_of_accounts WHERE LOWER(name) = LOWER(?) AND status = 'Active' LIMIT 1").get(String(bankAccount));
      }
    }
    if (!bank) return { success: false, error: `Bank account "${bankAccount || ''}" not found in COA` };
    if (lower(bank.type) !== 'bank') {
      return { success: false, error: `Selected account "${bank.name || ''}" (${bank.type || ''}) is not a Bank account. Checks must be drawn on a Bank account.` };
    }

    let name = vendorName;
    if (!name) {
      try {
        const vendor = db.prepare('SELECT display_name, first_name, last_name FROM suppliers WHERE id = ?').get(Number(expense.payee));
        if (vendor) name = vendor.display_name || `${vendor.first_name || ''} ${vendor.last_name || ''}`.trim();
      } catch { name = ''; }
    }
    name = name || '';

    let checkNum = checkNumber != null && String(checkNumber).trim() !== '' ? String(checkNumber).trim() : '';
    if (!checkNum) {
      try {
        const lastCheck = db.prepare("SELECT reference FROM transactions WHERE type = 'Check' AND reference IS NOT NULL AND reference != '' ORDER BY id DESC LIMIT 1").get();
        const lastNum = lastCheck ? parseInt(lastCheck.reference, 10) : 1000;
        checkNum = String((isNaN(lastNum) ? 1000 : lastNum) + 1);
      } catch { checkNum = '1001'; }
    }

    const pmtDate = paymentDate || new Date().toISOString().slice(0, 10);

    const run = db.transaction(() => {
      const txResult = Transactions.insert({
        date: pmtDate,
        type: 'Check',
        amount: billAmt,
        description: `Bill payment to ${name} — Bill #${expenseId}`,
        reference: checkNum,
        accountId: bank.id,
        debit: 0,
        credit: billAmt,
        entered_by: enteredBy,
        payee_name: name,
      });
      const checkId = txResult?.lastInsertRowid || null;

      const je = JournalEntries.post({
        date: pmtDate,
        description: `Bill payment — expense #${expenseId}`,
        source_type: 'bill_payment',
        source_id: Number(expenseId),
        created_by: enteredBy,
        lines: [
          { account_id: ap.id,   debit: billAmt, credit: 0,       description: 'Accounts Payable cleared' },
          { account_id: bank.id, debit: 0,       credit: billAmt, description: 'Bank / Cash payment' },
        ],
      });
      const journalId = je && je.id ? Number(je.id) : null;

      this.createApplication({
        expenseId: Number(expenseId),
        supplierId: expense.payee != null ? Number(expense.payee) : null,
        transactionId: checkId,
        journalId,
        amount: billAmt,
        paymentDate: pmtDate,
        balanceApplied: true,
      });

      if (expense.payee != null) {
        this.adjustVendorBalance(expense.payee, -billAmt);
      }

      const position = this.recalcBill(Number(expenseId));
      return { checkId, journalId, position };
    });

    const paid = run();

    try {
      const AuditLog = require('./auditLog');
      AuditLog.log({
        userId: enteredBy || 'system',
        action: 'billPayment',
        entityType: 'bill',
        entityId: String(expenseId),
        details: { amount: billAmt, checkId: paid.checkId, journalId: paid.journalId, checkNumber: checkNum },
      });
    } catch (auditErr) { console.error('[billPayments] audit log failed:', auditErr.message); }

    return {
      success: true,
      remainingBalance: paid.position ? Math.max(0, paid.position.remaining) : 0,
      bill: paid.position,
      check: {
        id: paid.checkId,
        checkNumber: checkNum,
        date: pmtDate,
        payee: name,
        amount: billAmt,
        bankAccount: bank.name,
        memo: `Bill payment — Bill #${expenseId}`,
      },
    };
  },

  /**
   * Combined settlement: apply vendor credits AND pay the cash remainder by
   * check/bank, ATOMICALLY. Credits reduce Accounts Payable without touching
   * Bank; only the remaining cash portion creates a check and hits Bank. The
   * credit's own accounting was posted when it was created, so applying it here
   * only ALLOCATES the existing balance — never a second posting.
   *
   * bills:   [{ expenseId }]                 (must all belong to one vendor)
   * credits: [{ creditId, amount }]          (amount = how much of the credit to use)
   */
  settleBillsWithCredits({ bills = [], credits = [], paymentDate = null, bankAccount = null, checkNumber = null, enteredBy = 'system' }) {
    const COA = require('./chartOfAccounts');
    const JournalEntries = require('./journalEntries');
    const Transactions = require('./transactions');

    const ap = COA.getSystemAccount('Accounts Payable');
    if (!ap) return { success: false, error: 'Accounts Payable account not in COA' };

    const billIds = bills.map(b => Number(b.expenseId || b.id)).filter(Boolean);
    if (!billIds.length) return { success: false, error: 'No bills selected' };

    const billRows = billIds.map(id => db.prepare('SELECT * FROM expenses WHERE id = ?').get(id));
    if (billRows.some(b => !b)) return { success: false, error: 'One or more bills were not found' };

    const vendorId = Number(billRows[0].payee);
    if (billRows.some(b => Number(b.payee) !== vendorId)) {
      return { success: false, error: 'Vendor credits can only be applied when all selected bills belong to the same vendor.' };
    }

    const creditReqs = (credits || [])
      .filter(c => c && Number(c.creditId) && Number(c.amount) > TOLERANCE)
      .map(c => ({ creditId: Number(c.creditId), amount: round2(c.amount) }));

    const pmtDate = paymentDate || new Date().toISOString().slice(0, 10);

    let bank = null;
    const resolveBank = () => {
      if (bank) return bank;
      if (!bankAccount) return null;
      const numericId = Number(bankAccount);
      if (Number.isFinite(numericId) && numericId > 0) {
        bank = db.prepare("SELECT * FROM chart_of_accounts WHERE id = ? AND status = 'Active'").get(numericId);
      }
      if (!bank) bank = db.prepare("SELECT * FROM chart_of_accounts WHERE LOWER(name) = LOWER(?) AND status = 'Active' LIMIT 1").get(String(bankAccount));
      return bank;
    };

    let vendorName = '';
    try {
      const v = db.prepare('SELECT display_name, first_name, last_name FROM suppliers WHERE id = ?').get(vendorId);
      if (v) vendorName = v.display_name || `${v.first_name || ''} ${v.last_name || ''}`.trim();
    } catch { /* optional */ }

    let nextCheck = checkNumber != null && String(checkNumber).trim() !== '' ? parseInt(String(checkNumber), 10) : null;
    if (nextCheck == null || isNaN(nextCheck)) {
      try {
        const lastCheck = db.prepare("SELECT reference FROM transactions WHERE type = 'Check' AND reference IS NOT NULL AND reference != '' ORDER BY id DESC LIMIT 1").get();
        const lastNum = lastCheck ? parseInt(lastCheck.reference, 10) : 1000;
        nextCheck = (isNaN(lastNum) ? 1000 : lastNum) + 1;
      } catch { nextCheck = 1001; }
    }

    const run = db.transaction(() => {
      // 1. Positions as of NOW (before this settlement).
      const positions = billRows
        .map(b => this.computeBillPosition(b.id))
        .filter(Boolean)
        .sort((a, b) => a.expenseId - b.expenseId); // deterministic: oldest bill id first

      const billRemaining = new Map(positions.map(p => [p.expenseId, Math.max(0, p.remaining)]));

      // 2. Validate credits (vendor + active + available) inside the transaction.
      const creditStates = creditReqs.map(req => {
        const c = db.prepare('SELECT * FROM vendor_credits WHERE id = ?').get(req.creditId);
        if (!c) throw new Error(`Vendor credit #${req.creditId} not found`);
        if (Number(c.supplier_id) !== vendorId) throw new Error('A selected vendor credit does not belong to this vendor.');
        if (lower(c.status) !== 'active') throw new Error(`Vendor credit #${req.creditId} is not active.`);
        if (req.amount > Number(c.remaining_amount) + TOLERANCE) {
          throw new Error(`Vendor credit #${req.creditId} only has ${round2(c.remaining_amount)} available.`);
        }
        return { row: c, requested: req.amount, used: 0 };
      });

      // 3. Allocate credits to bills oldest-first, capped by each bill's remaining.
      const applied = [];
      for (const cs of creditStates) {
        let remainingCredit = cs.requested;
        for (const p of positions) {
          if (remainingCredit <= TOLERANCE) break;
          const rem = billRemaining.get(p.expenseId) || 0;
          if (rem <= TOLERANCE) continue;
          const use = Math.min(remainingCredit, rem);
          applied.push({ creditId: cs.row.id, expenseId: p.expenseId, amount: round2(use) });
          billRemaining.set(p.expenseId, round2(rem - use));
          remainingCredit = round2(remainingCredit - use);
          cs.used = round2(cs.used + use);
        }
      }

      // 4. Persist applications + reduce credit remaining/status.
      const insApp = db.prepare('INSERT INTO credit_applications (credit_id, expense_id, amount, applied_date) VALUES (?,?,?,?)');
      const updCredit = db.prepare('UPDATE vendor_credits SET remaining_amount = ?, status = ? WHERE id = ?');
      for (const cs of creditStates) {
        if (cs.used <= TOLERANCE) continue;
        const newRemaining = Math.max(0, round2(Number(cs.row.remaining_amount) - cs.used));
        updCredit.run(newRemaining, newRemaining <= TOLERANCE ? 'Applied' : 'Active', cs.row.id);
      }
      for (const a of applied) insApp.run(a.creditId, a.expenseId, a.amount, pmtDate);

      // 5. Cash remainder per bill → check + journal + payment application.
      const checks = [];
      for (const p of positions) {
        const cash = billRemaining.get(p.expenseId) || 0;
        if (cash <= TOLERANCE) { this.recalcBill(p.expenseId); continue; }
        const bk = resolveBank();
        if (!bk) throw new Error('Select a bank account for the cash portion of this payment.');
        if (lower(bk.type) !== 'bank') throw new Error(`Selected account "${bk.name}" is not a Bank account. Checks must be drawn on a Bank account.`);

        const txResult = Transactions.insert({
          date: pmtDate, type: 'Check', amount: cash,
          description: `Bill payment to ${vendorName} — Bill #${p.expenseId}`,
          reference: String(nextCheck), accountId: bk.id, debit: 0, credit: cash,
          entered_by: enteredBy, payee_name: vendorName,
        });
        const checkId = txResult?.lastInsertRowid || null;
        const je = JournalEntries.post({
          date: pmtDate,
          description: `Bill payment — expense #${p.expenseId}`,
          source_type: 'bill_payment', source_id: p.expenseId, created_by: enteredBy,
          lines: [
            { account_id: ap.id, debit: cash, credit: 0, description: 'Accounts Payable cleared' },
            { account_id: bk.id, debit: 0, credit: cash, description: 'Bank / Cash payment' },
          ],
        });
        this.createApplication({
          expenseId: p.expenseId, supplierId: vendorId, transactionId: checkId,
          journalId: je && je.id ? Number(je.id) : null, amount: cash, paymentDate: pmtDate, balanceApplied: true,
        });
        this.adjustVendorBalance(vendorId, -cash);
        checks.push({ id: checkId, billId: p.expenseId, amount: cash, checkNumber: String(nextCheck), bankName: bk.name });
        nextCheck += 1;
        this.recalcBill(p.expenseId);
      }

      // 6. Recalc every bill so credit-only settlements also update status.
      positions.forEach(p => this.recalcBill(p.expenseId));

      return { checks, applied, positions };
    });

    let out;
    try { out = run(); }
    catch (e) { return { success: false, error: e.message }; }

    const creditsApplied = round2(out.applied.reduce((s, a) => s + a.amount, 0));
    try {
      const AuditLog = require('./auditLog');
      AuditLog.log({
        userId: enteredBy || 'system', action: 'billPayment', entityType: 'bill',
        entityId: billIds.join(','),
        details: { creditsApplied, checks: out.checks.map(c => ({ billId: c.billId, amount: c.amount })), applied: out.applied },
      });
    } catch (auditErr) { console.error('[billPayments] audit log failed:', auditErr.message); }

    const billPositions = billIds.map(id => this.computeBillPosition(id));
    return { success: true, checks: out.checks, applied: out.applied, creditsApplied, bills: billPositions };
  },

  // ── Legacy detection (only when no explicit application exists) ──────────
  // Historical checks recorded the bill reference inside the description. This
  // is used ONLY as a fallback for rows created before the relation existed.
  // It never matches on vendor + amount.
  resolveLegacyBill(check) {
    if (!check) return null;
    const amount = round2(Number(check.amount || check.debit || check.credit || 0));
    if (amount <= TOLERANCE) return null;
    const desc = String(check.description || '');

    // "Bill payment to <vendor> — Bill #123" (bill-pay handler)
    let m = desc.match(/Bill\s*#(\d+)/i);
    if (m) {
      const bill = db.prepare("SELECT id, payee FROM expenses WHERE id = ?").get(Number(m[1]));
      if (bill) return { expenseId: Number(bill.id), supplierId: bill.payee, amount, balanceApplied: true };
    }

    // "Payment for bill <ref|id> - <vendor>" (Pay Bills / Bill Tracker)
    m = desc.match(/Payment for bill\s+([^\s-]+)\s*-/i);
    if (m) {
      const token = m[1].trim();
      let bill = db.prepare(
        "SELECT id, payee FROM expenses WHERE ref_no = ? AND category IN ('bill','supplier') ORDER BY id DESC LIMIT 1"
      ).get(token);
      if (!bill && /^\d+$/.test(token)) {
        bill = db.prepare("SELECT id, payee FROM expenses WHERE id = ?").get(Number(token));
      }
      if (bill) return { expenseId: Number(bill.id), supplierId: bill.payee, amount, balanceApplied: false };
    }

    return null;
  },

  // ── Central reversal entry point ─────────────────────────────────────────
  // Undo everything a payment check represents, atomically:
  //   1. reverse each payment application (journal + allocation + vendor)
  //   2. reverse the check's own journal entry, if it has one
  //   3. delete the check transaction
  //   4. recalculate every affected bill from its remaining active payments
  //
  // Returns { success, reversedBills: [{ expenseId, paid, remaining, status }] }.
  // Idempotent: a second call for a deleted check is a no-op success.
  reverseForCheck(transactionId, { reason = null, userId = 'system', date = null, keepCheck = false } = {}) {
    const id = Number(transactionId);
    const check = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!check) {
      return { success: true, alreadyReversed: true, message: 'Check already deleted', reversedBills: [] };
    }
    if (lower(check.type) !== 'check') {
      return { success: false, error: `Transaction #${id} is not a check` };
    }

    const Transactions = require('./transactions');
    const JournalEntries = require('./journalEntries');

    const run = db.transaction(() => {
      const applications = this.getActiveForCheck(id);
      const affected = new Set();
      const reversalDate = date || new Date().toISOString().slice(0, 10);

      // 1) Explicit applications (the normal path).
      for (const app of applications) {
        this.reverseApplication(app, { reason, userId, date: reversalDate });
        affected.add(Number(app.expense_id));
      }

      // 1b) Legacy fallback: a payment created before the relation existed.
      if (applications.length === 0) {
        const legacy = this.resolveLegacyBill(check);
        if (legacy) {
          const created = this.createApplication({
            expenseId: legacy.expenseId,
            supplierId: legacy.supplierId,
            transactionId: id,
            journalId: null,
            amount: legacy.amount,
            paymentDate: check.date,
            balanceApplied: legacy.balanceApplied,
          });
          if (created && created.id) {
            this.reverseApplication(this.getById(created.id), { reason: reason || 'Legacy check deletion', userId, date: reversalDate });
          }
          affected.add(Number(legacy.expenseId));
        }
      }

      // 2) Reverse the check's own transaction journal (normal write checks and
      //    the legacy Pay Bills flow). Skip any journal already reversed as an
      //    application, so a payment is never reversed twice.
      const txJournals = db.prepare(
        "SELECT id FROM journal_entries WHERE source_type = 'transaction' AND source_id = ? AND status = 'Posted'"
      ).all(String(id));
      for (const je of txJournals) {
        const already = db.prepare(
          "SELECT id FROM journal_entries WHERE source_type = 'reversal' AND source_id = ? AND status = 'Posted' LIMIT 1"
        ).get(Number(je.id));
        if (already) continue;
        try {
          JournalEntries.reverse(Number(je.id), reversalDate, userId);
        } catch (e) {
          throw new Error(`Could not reverse check journal #${je.id}: ${e.message}`);
        }
      }

      // 3) Delete the check (or, for a void, keep it and mark it Voided) so the
      //    audit trail survives either way.
      if (keepCheck) {
        db.prepare("UPDATE transactions SET status = 'Voided' WHERE id = ?").run(id);
      } else {
        Transactions.deleteTransaction(id);
      }

      // 4) Recalculate the bills this payment touched.
      const reversedBills = [];
      for (const expenseId of affected) {
        const pos = this.recalcBill(expenseId);
        if (pos) reversedBills.push(pos);
      }

      return { success: true, reversedBills, applicationCount: applications.length };
    });

    const result = run();

    try {
      const AuditLog = require('./auditLog');
      AuditLog.log({
        userId: userId || 'system',
        action: 'reverseBillPayment',
        entityType: 'check',
        entityId: String(id),
        details: {
          reason,
          applications: result.applicationCount,
          bills: result.reversedBills.map(b => ({ expenseId: b.expenseId, paid: b.paid, remaining: b.remaining, status: b.status })),
        },
      });
    } catch (auditErr) { console.error('[billPayments] audit log failed:', auditErr.message); }

    return result;
  },
};

BillPayments.createTable();

module.exports = BillPayments;
