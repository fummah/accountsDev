// src/backend/models/Expenses.js
const db = require('./dbmgr.js');

// ── bill-line shape ────────────────────────────────────────────────────────
// A bill line is either an ACCOUNT line (an account plus a hand-typed amount —
// the original behaviour) or an ITEM line (an inventory product plus quantity x
// rate). The column is nullable, so every pre-existing row reads as an account
// line and historical bills behave exactly as before.
const LINE_TYPE_ACCOUNT = 'account';
const LINE_TYPE_ITEM = 'item';
const normalizeLineType = (raw) =>
  String(raw == null ? '' : raw).trim().toLowerCase() === LINE_TYPE_ITEM
    ? LINE_TYPE_ITEM
    : LINE_TYPE_ACCOUNT;

// ONE insert statement, used by insertExpense AND updateExpense. They previously
// carried separate copies of this SQL, which is exactly how a newly added column
// ends up written on create but silently dropped on edit.
const LINE_INSERT_SQL = `INSERT INTO expense_lines
  (expense_id, category, description, amount, account_id, line_type, product_id, quantity, rate, warehouse_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/**
 * Resolve the account an ITEM line must debit.
 *
 * An item line is inventory, so it debits Inventory Asset — never a fallback
 * expense account. The client may send the id, but the backend stays
 * authoritative: when it is missing we look up the seeded system account here,
 * so the accounting is still correct for a renderer that does not know about it.
 * Returns null only when no Inventory Asset account exists at all.
 */
const resolveItemLineAccountId = (line) => {
  if (line.accountId != null && Number.isFinite(Number(line.accountId))) return Number(line.accountId);
  try {
    const COA = require('./chartOfAccounts');
    const inv = COA.getSystemAccount('Inventory Asset');
    if (inv && inv.id != null) return Number(inv.id);
  } catch { /* fall through — the caller resolves the account as usual */ }
  return null;
};

const lineParams = (expenseId, line) => {
  const type = normalizeLineType(line.line_type);
  const isItem = type === LINE_TYPE_ITEM;
  const qty = Number(line.quantity);
  const rate = Number(line.rate);
  return [
    expenseId,
    // `category` and `description` are NOT NULL, so never pass undefined.
    line.category != null ? line.category : (isItem ? 'Inventory' : 'General'),
    line.description != null ? line.description : '',
    line.amount,
    isItem ? resolveItemLineAccountId(line) : (line.accountId != null ? line.accountId : null),
    type,
    isItem && line.product_id != null ? Number(line.product_id) : null,
    isItem && Number.isFinite(qty) ? qty : null,
    isItem && Number.isFinite(rate) ? rate : null,
    isItem && line.warehouse_id != null ? Number(line.warehouse_id) : null,
  ];
};

/**
 * The item lines of a bill, in the shape services/documentInventory.js expects.
 *
 * Read back from the DATABASE rather than from the caller's array, so the stock
 * reconciliation always sees exactly what was persisted — which matters most on
 * an edit, where the lines have just been deleted and re-inserted.
 */
const readItemLines = (expenseId) => {
  let rows = [];
  try {
    rows = db.prepare(
      `SELECT id, line_type, product_id, quantity, rate, warehouse_id
         FROM expense_lines WHERE expense_id = ? ORDER BY id`
    ).all(Number(expenseId));
  } catch { return []; }
  return rows
    .filter(r => normalizeLineType(r.line_type) === LINE_TYPE_ITEM)
    .map(r => ({
      lineId: r.id,
      productId: r.product_id,
      quantity: r.quantity,
      warehouseId: r.warehouse_id,
      unitCost: r.rate,
    }));
};

/**
 * Move the stock a bill bought. MUST be called inside the bill's transaction.
 *
 * Draft / Void / Cancelled are a NON-financial lifecycle state — the same one
 * the General Ledger refuses to post for — so they move no stock either. Passing
 * an empty line set makes the reconciler REVERSE whatever a previously-confirmed
 * bill received, so moving a bill into that state un-receives it and moving it
 * back re-receives it. Same for a delete.
 *
 * The test is `isInvoiceDocumentState` (an EXPLICIT Draft/Void/Cancelled) rather
 * than a blank check: an unknown or empty status reconciles to the lines, which
 * is the safe default — silently putting goods back on an unknown state would be
 * the more damaging guess.
 *
 * An unresolvable line THROWS rather than being logged and skipped: a bill that
 * claims to have received goods but moved no stock is precisely the silent
 * inconsistency this integration exists to prevent, and the throw rolls the
 * whole bill back so it cannot be saved in that state.
 */
const postBillStock = (expenseId, approvalStatus) => {
  const DocumentInventory = require('../services/documentInventory');
  const { isInvoiceDocumentState } = require('../services/documentStatus');
  const nonPosting = isInvoiceDocumentState(approvalStatus);
  const res = DocumentInventory.reconcileBillStock(
    expenseId,
    nonPosting ? [] : readItemLines(expenseId)
  );
  if (res && res.errors && res.errors.length) {
    throw new Error(`Bill stock could not be posted — ${res.errors.join('; ')}`);
  }
  return res;
};

const Expenses = {
  // Create the Expenses table if it doesn't exist
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS expenses (
    id	INTEGER,
    payee	INTEGER NOT NULL,
	payment_account	TEXT NOT NULL,
    payment_date	TEXT,
	payment_method	TEXT,
    ref_no	TEXT,
    category	TEXT,
    approval_status TEXT DEFAULT 'Pending',
	entered_by	TEXT,
	date_entered DATETIME DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(id AUTOINCREMENT)
      )
    `;
    db.prepare(stmt).run();
    // Migration for multi-currency support and bills fields
    try {
      const colInfo = db.prepare("PRAGMA table_info(expenses)").all();
      const cols = new Set(colInfo.map(c => c.name));
      if (!cols.has('currency'))  db.prepare('ALTER TABLE expenses ADD COLUMN currency TEXT').run();
      if (!cols.has('fxRate'))    db.prepare('ALTER TABLE expenses ADD COLUMN fxRate REAL DEFAULT 1.0').run();
      if (!cols.has('due_date'))  db.prepare('ALTER TABLE expenses ADD COLUMN due_date TEXT').run();
      if (!cols.has('memo'))      db.prepare('ALTER TABLE expenses ADD COLUMN memo TEXT').run();
      if (!cols.has('terms'))     db.prepare('ALTER TABLE expenses ADD COLUMN terms INTEGER DEFAULT 30').run();
      if (!cols.has('paid_amount')) db.prepare('ALTER TABLE expenses ADD COLUMN paid_amount REAL DEFAULT 0').run();
    } catch (e) {
      console.error('[expenses] migration failed:', e);
    }
  }, 
  createExpenseItem: () => {
    const stmt = `
     CREATE TABLE IF NOT EXISTS expense_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER,
    category TEXT NOT NULL,
    account_id INTEGER,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    date_entered DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (expense_id) REFERENCES expenses(id)
  )`;
    db.prepare(stmt).run();
    // Migration: add account_id for hierarchical account identity
    try {
      const colInfo = db.prepare("PRAGMA table_info(expense_lines)").all();
      if (!colInfo.some(c => c.name === 'account_id')) {
        db.prepare('ALTER TABLE expense_lines ADD COLUMN account_id INTEGER').run();
      }
    } catch (e) {
      console.error('[expenses] expense_lines migration failed:', e);
    }
    // Migration: the bill-line shape (inventory item lines).
    //
    // A bill line is now either an ACCOUNT line (today's behaviour: an account
    // plus a hand-typed amount) or an ITEM line (an inventory product plus
    // quantity x rate). All of it is additive, and every existing row keeps
    // NULL, which LINE_TYPE_ACCOUNT reads as an account line — so historical
    // bills are untouched and behave exactly as before.
    try {
      const cols = new Set(db.prepare("PRAGMA table_info('expense_lines')").all().map(c => c.name));
      const add = (col, ddl) => { if (!cols.has(col)) db.prepare(`ALTER TABLE expense_lines ADD COLUMN ${col} ${ddl}`).run(); };
      add('line_type', "TEXT DEFAULT 'account'");   // 'account' | 'item'
      add('product_id', 'INTEGER');                 // products.id, for item lines
      add('quantity', 'REAL');
      add('rate', 'REAL');
      add('warehouse_id', 'INTEGER');               // warehouses.id, for item lines
    } catch (e) {
      console.error('[expenses] expense_lines line-shape migration failed:', e);
    }
  },
  
  // Insert a new Expenses
  insertExpense: async (payee,payment_account,payment_date, payment_method, ref_no,category,entered_by,approval_status,expenseLines,due_date,memo,terms) => {
    try {
    // ONE transaction around the header, its lines and the stock it moves, so a
    // bill can never exist without the inventory it claims to have received (or
    // the other way round).
    //
    // Everything in here is SYNCHRONOUS on purpose. better-sqlite3 commits when
    // this function returns, so a stray `await` would hand back a pending
    // promise, end the transaction early and silently lose the atomicity.
    const tx = db.transaction(() => {
      const stmt = db.prepare('INSERT INTO expenses (payee,payment_account,payment_date, payment_method, ref_no,category,entered_by,approval_status,due_date,memo,terms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const result = stmt.run(payee,payment_account,payment_date, payment_method, ref_no,category,entered_by,approval_status,due_date || null,memo || null,terms || 30);

      if (!(result.changes > 0)) return { success: false, error: 'The bill was not saved' };

      const expenseId = result.lastInsertRowid;
      const expenseLineStmt = db.prepare(LINE_INSERT_SQL);
      for (const line of expenseLines) {
        expenseLineStmt.run(...lineParams(expenseId, line));
      }

      // Skip GL and vendor balance for Draft status
      const isDraft = (approval_status || '').toLowerCase() === 'draft';
      if (!isDraft) {
        // Update vendor/supplier balance for bills
        try {
          const isBill = (payment_method || '').toLowerCase() === 'bill'
            || (category || '').toLowerCase() === 'bill'
            || (approval_status || '').toLowerCase() === 'unpaid'
            || (approval_status || '').toLowerCase() === 'partially paid';
          if (isBill && payee) {
            const totalAmount = expenseLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
            db.prepare('UPDATE suppliers SET balance = COALESCE(balance,0) + ? WHERE id = ?').run(totalAmount, Number(payee));
          }
        } catch (balErr) { console.error('[expenses] vendor balance update failed:', balErr); }
      }

      // NOTE: GL posting (double-entry journal) is handled centrally by
      // JournalEntries.postExpense() in the insert-expense IPC handler.
      // The legacy manual transactions/balance updates were REMOVED here to
      // prevent double-posting. Account balances are computed from
      // journal_lines (see chartOfAccounts.computedBalance), which already
      // applies correct debit/credit rules per account type:
      //   • Liability line (e.g. Truck Loan) → DR reduces the loan balance
      //   • Asset line → DR increases the asset balance
      //   • Expense line → DR increases the expense balance
      //   • Accounts Payable → CR increases AP (money owed)

      // Receive the goods this bill bought — same transaction as the bill.
      postBillStock(expenseId, approval_status);

      return { success: true, expenseId, result };
    });

    return tx();
    } catch (error) {
      console.error("Error inserting Expense:", error);
      // Surface the reason: the new failure mode (stock) is actionable, and the
      // renderer shows this string instead of a bare "Failed to save bill".
      return { success: false, error: error.message };
    }
  },
  

  // Retrieve a single expense with its lines
  getSingleExpense: (id) => {
    try {
      const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
      if (!expense) return null;
      const lines = db.prepare('SELECT * FROM expense_lines WHERE expense_id = ?').all(id);
      const totalAmount = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
      return { ...expense, lines, amount: totalAmount };
    } catch (error) {
      console.error('Error fetching single expense:', error);
      return null;
    }
  },

  // Retrieve all Expenses
  getAllExpenses: () => {
    const stmt = db.prepare(`
      SELECT e.id, e.category, e.payment_date, e.payment_method, e.ref_no, e.payment_account,
             e.approval_status, e.payee, e.due_date, e.memo, e.terms,
             COALESCE(e.paid_amount, 0) AS paid_amount,
             COALESCE(SUM(el.amount), 0) AS amount,
             CASE
               WHEN e.category = 'customer'  THEN COALESCE(c.first_name || ' ' || c.last_name, c.first_name)
               WHEN e.category IN ('supplier','bill') THEN COALESCE(s.display_name, s.first_name || ' ' || s.last_name, s.first_name)
               WHEN e.category = 'employee'  THEN COALESCE(emp.first_name || ' ' || emp.last_name, emp.first_name)
               ELSE NULL
             END AS payee_name
      FROM expenses e
      LEFT JOIN customers  c   ON e.payee = c.id   AND e.category = 'customer'
      LEFT JOIN suppliers  s   ON e.payee = s.id   AND e.category IN ('supplier','bill')
      LEFT JOIN employees  emp ON e.payee = emp.id AND e.category = 'employee'
      LEFT JOIN expense_lines el ON e.id = el.expense_id
      GROUP BY e.id
      ORDER BY e.id DESC
    `);
    return stmt.all();
  },

  // Retrieve open (unpaid / partially paid) bills for a given payee
  getOpenBills: (payeeId) => {
    try {
      if (!payeeId) return [];
      const rows = db.prepare(`
        SELECT e.id, e.category, e.payment_date, e.payment_method, e.ref_no, e.payment_account,
               e.approval_status, e.payee, e.due_date, e.memo, e.terms,
               COALESCE(e.paid_amount, 0) AS paid_amount,
               COALESCE(SUM(el.amount), 0) AS amount,
               CASE
                 WHEN e.category IN ('supplier','bill') THEN COALESCE(s.display_name, s.first_name || ' ' || s.last_name, s.first_name)
                 ELSE NULL
               END AS payee_name
        FROM expenses e
        LEFT JOIN suppliers s ON e.payee = s.id AND e.category IN ('supplier','bill')
        LEFT JOIN expense_lines el ON e.id = el.expense_id
        WHERE e.payee = ? AND e.category IN ('supplier','bill')
          AND LOWER(COALESCE(e.approval_status, 'pending')) NOT IN ('paid','cancelled','void')
        GROUP BY e.id
        ORDER BY COALESCE(e.due_date, e.payment_date) ASC
      `).all(Number(payeeId));
      return rows
        .map(r => ({ ...r, amount: Number(r.amount) || 0, paid_amount: Number(r.paid_amount) || 0 }))
        .filter(r => (r.amount - r.paid_amount) > 0.005);
    } catch (e) {
      console.error('[expenses] getOpenBills error:', e);
      return { error: e.message };
    }
  },

  getPaginated: (page = 1, pageSize = 25, search = '') => {
    const offset = (Math.max(1, page) - 1) * Math.max(1, pageSize);
    const limit = Math.max(1, Math.min(500, pageSize));
    const baseSql = "SELECT e.id, e.category, e.payment_date, e.payment_method, e.ref_no, e.payment_account, e.approval_status, e.payee, COALESCE(SUM(el.amount), 0) AS amount, CASE WHEN e.category = 'customer' THEN c.first_name WHEN e.category = 'supplier' THEN s.first_name WHEN e.category = 'employee' THEN emp.first_name ELSE NULL END AS payee_name FROM expenses e LEFT JOIN customers c ON e.payee = c.id AND e.category = 'customer' LEFT JOIN suppliers s ON e.payee = s.id AND e.category = 'supplier' LEFT JOIN employees emp ON e.payee = emp.id AND e.category = 'employee' LEFT JOIN expense_lines el ON e.id = el.expense_id";
    const whereClause = search && search.trim() ? " WHERE (e.ref_no LIKE ? OR e.payment_method LIKE ? OR c.first_name LIKE ? OR s.first_name LIKE ? OR emp.first_name LIKE ?)" : '';
    const groupOrder = " GROUP BY e.id, e.category, e.payment_date, e.payment_method, e.payment_account, e.ref_no, e.approval_status, c.first_name, e.payee, s.first_name, emp.first_name ORDER BY e.id DESC";
    const searchParam = search && search.trim() ? `%${search.trim()}%` : null;
    const total = searchParam
      ? db.prepare(`SELECT COUNT(*) AS total FROM (${baseSql}${whereClause}${groupOrder})`).get(searchParam, searchParam, searchParam, searchParam, searchParam).total
      : db.prepare('SELECT COUNT(*) AS total FROM expenses').get().total;
    const dataSql = `${baseSql}${whereClause}${groupOrder} LIMIT ? OFFSET ?`;
    const data = searchParam ? db.prepare(dataSql).all(searchParam, searchParam, searchParam, searchParam, searchParam, limit, offset) : db.prepare(baseSql + groupOrder + ' LIMIT ? OFFSET ?').all(limit, offset);
    return { data, total };
  },
  updateExpense : async (expenseData) => {
    const { id, lines, ...expenseDetails } = expenseData;

    try {
    // ONE transaction around the header, its lines, its stock and its GL
    // re-post, so an edit cannot half-apply. Everything inside is SYNCHRONOUS:
    // better-sqlite3 commits when this function returns, so a stray `await`
    // would hand back a pending promise and end the transaction early.
    const tx = db.transaction(() => {
      // Update the main expense details
      db.prepare(
        `UPDATE expenses
         SET payee = ?, payment_account = ?, payment_date = ?, payment_method = ?, 
             ref_no = ?, category = ?, approval_status = ?,
             due_date = ?, memo = ?, terms = ?
         WHERE id = ?`).run(
        [
          expenseDetails.payee,
          expenseDetails.payment_account,
          expenseDetails.payment_date,
          expenseDetails.payment_method,
          expenseDetails.ref_no,
          expenseDetails.category,
          expenseDetails.approval_status,
          expenseDetails.due_date || null,
          expenseDetails.memo || null,
          expenseDetails.terms || null,
          id,
        ]
      );
  
      // Delete existing lines for the expense
      db.prepare(`DELETE FROM expense_lines WHERE expense_id = ?`).run([id]);
  
      // Insert updated lines
      for (const line of lines) {
        db.prepare(LINE_INSERT_SQL).run(...lineParams(id, line));
      }

      // Reconcile the stock against the NEW lines. Because the key is the
      // stable (sourceType, sourceId, itemId, warehouseId) tuple and the
      // reconciler walks the union of desired and already-posted, editing
      // 50 → 60 posts +10 (never a second +50) and deleting a line reverses it.
      postBillStock(id, expenseDetails.approval_status);
  
      // Void old GL entries then re-post with updated lines
      try {
        const JournalEntries = require('./journalEntries');
        const oldEntries = db.prepare(
          `SELECT id FROM journal_entries WHERE source_type = 'expense' AND source_id = ? AND status = 'Posted'`
        ).all(Number(id));
        for (const oe of oldEntries) {
          JournalEntries.voidEntry(oe.id);
        }
        const exp = db.prepare(`SELECT * FROM expenses WHERE id = ?`).get(Number(id));
        if (exp) {
          // Detect Credit Card / Loan Reclassification Bill
          let isReclassification = false;
          try {
            const vendorRow = db.prepare("SELECT vendor_type FROM suppliers WHERE id = ?").get(Number(expenseDetails.payee));
            const isCCVendor = vendorRow && (vendorRow.vendor_type === 'Credit Card' || vendorRow.vendor_type === 'Loan Lender');
            if (isCCVendor && Array.isArray(lines) && lines.length > 0) {
              let allCCorLoan = true;
              let hasValid = false;
              for (const line of lines) {
                const amt = Number(line.amount) || 0;
                if (amt <= 0) continue;
                let acct = null;
                if (line.accountId) {
                  acct = db.prepare("SELECT type FROM chart_of_accounts WHERE id = ? AND status = 'Active'").get(Number(line.accountId));
                }
                if (!acct && line.category) {
                  acct = db.prepare("SELECT type FROM chart_of_accounts WHERE LOWER(name) = LOWER(?) AND status = 'Active' LIMIT 1").get(line.category);
                }
                if (!acct || (acct.type !== 'Credit Card' && acct.type !== 'Loan')) { allCCorLoan = false; break; }
                hasValid = true;
              }
              isReclassification = allCCorLoan && hasValid;
            }
          } catch (reclassErr) { isReclassification = false; }
          if (isReclassification) {
            JournalEntries.postExpenseReclassification({
              id: Number(id), date: exp.payment_date, category: exp.category,
              description: exp.category || '', reference: exp.ref_no || String(id),
            });
          } else {
            JournalEntries.postExpense({
              id: Number(id),
              date: exp.payment_date,
              category: exp.category,
              description: exp.category || '',
              reference: exp.ref_no || String(id),
            });
          }
        }
      } catch (glErr) {
        console.error('[expenses] GL re-post on update failed (non-fatal):', glErr);
      }

      return { success: true, message: 'Expense updated successfully.' };
    });

    return tx();
    } catch (error) {
      console.error('Error updating expense:', error);
      throw error;
    }
  }
  ,

  // Delete an expense and its related records
  deleteExpense: (id) => {
    try {
      // Void GL journal entries before deleting
      try {
        const JournalEntries = require('./journalEntries');
        const oldEntries = db.prepare(
          `SELECT id FROM journal_entries WHERE source_type = 'expense' AND source_id = ? AND status = 'Posted'`
        ).all(Number(id));
        for (const oe of oldEntries) {
          JournalEntries.voidEntry(oe.id);
        }
      } catch (glErr) {
        console.warn('[expenses] GL void on delete failed (non-fatal):', glErr.message);
      }
      // Put back the stock this bill received, BEFORE its lines and movements
      // are torn down. Without this a deleted bill would leave its receipt on
      // the shelf forever — inventory that no document accounts for.
      // (Pulled forward from Phase 6: leaving it out would ship orphan stock.)
      // Fatal on failure, like the insert/update paths: deleting the bill while
      // its receipt survives is the inconsistency this integration prevents.
      const DocumentInventory = require('../services/documentInventory');
      DocumentInventory.reverseBillStock(Number(id));
      // Delete expense lines first
      db.prepare('DELETE FROM expense_lines WHERE expense_id = ?').run(id);
      // Remove attached documents + their files so no orphans remain
      try {
        const Documents = require('./documents');
        Documents.deleteByLinked('bill', Number(id));
      } catch (docErr) {
        console.warn('[expenses] Attachment cleanup on delete failed:', docErr.message);
      }
      // Delete associated transaction record
      const txn = db.prepare("SELECT id, isReconciled FROM transactions WHERE type = 'Expense' AND id IN (SELECT id FROM transactions WHERE type = 'Expense' AND description LIKE '%' || (SELECT category FROM expenses WHERE id = ?) || '%' AND date = (SELECT payment_date FROM expenses WHERE id = ?))").get(id, id);
      if (txn && Number(txn.isReconciled)) {
        return { success: false, error: 'Cannot delete this expense: its bank-register transaction is part of a reconciliation. Delete the reconciliation first.' };
      }
      if (txn) {
        try {
          db.prepare("DELETE FROM transactions WHERE id = ?").run(txn.id);
        } catch (txErr) {
          console.warn('[expenses] Could not clean up transaction for expense:', txErr.message);
        }
      }
      // Delete the expense itself
      const res = db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
      return { success: res.changes > 0, message: res.changes > 0 ? 'Expense deleted successfully' : 'Expense not found' };
    } catch (error) {
      console.error('Error deleting expense:', error);
      return { success: false, error: error.message };
    }
  },

  // Accounts Payable Aging (approximate from expenses marked Pending)
  getAPAging: function(referenceDate) {
    try {
      const today = referenceDate || new Date().toISOString().slice(0,10);
      // Pull expenses with pending status and sum lines
      const rows = db.prepare(`
        SELECT 
          e.id as expenseId,
          e.payment_date as dueDate,
          e.category,
          e.payee as supplierId,
          CASE WHEN e.category = 'supplier'
               THEN (SELECT first_name || ' ' || last_name FROM suppliers s WHERE s.id = e.payee)
               ELSE e.category
          END AS supplierName,
          COALESCE((SELECT SUM(el.amount) FROM expense_lines el WHERE el.expense_id = e.id), 0) AS totalAmount
        FROM expenses e
        WHERE (e.approval_status IS NULL OR LOWER(e.approval_status) IN ('pending'))
      `).all();

      const enriched = rows.map(r => {
        const amount = Number(r.totalAmount) || 0;
        const daysPastDue = r.dueDate ? Math.floor((new Date(today) - new Date(r.dueDate)) / (1000*60*60*24)) : 0;
        const bucket = daysPastDue <= 0 ? 'current'
                    : daysPastDue <= 30 ? '1-30'
                    : daysPastDue <= 60 ? '31-60'
                    : daysPastDue <= 90 ? '61-90'
                    : '90+';
        return {
          expenseId: r.expenseId,
          supplierId: r.supplierId,
          supplierName: r.supplierName || 'Unknown',
          dueDate: r.dueDate,
          amount,
          daysPastDue: isNaN(daysPastDue) ? 0 : daysPastDue,
          bucket
        };
      }).filter(r => r.amount > 0);

      const summary = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 };
      for (const row of enriched) {
        summary[row.bucket] += row.amount;
        summary.total += row.amount;
      }

      // Group by supplier
      const bySupplierMap = new Map();
      for (const row of enriched) {
        const key = row.supplierId || `unknown:${row.supplierName}`;
        if (!bySupplierMap.has(key)) {
          bySupplierMap.set(key, { supplierId: row.supplierId, supplierName: row.supplierName, expenses: [], total: 0 });
        }
        const group = bySupplierMap.get(key);
        group.expenses.push(row);
        group.total += row.amount;
      }
      const bySupplier = Array.from(bySupplierMap.values()).sort((a,b) => b.total - a.total);

      return { success: true, today, summary, bySupplier };
    } catch (e) {
      console.error('[expenses] getAPAging error:', e);
      return { success: false, error: e.message };
    }
  }
};

// Ensure the Expenses table is created
Expenses.createTable();
Expenses.createExpenseItem();

// Exposed so callers — and the verification suite — never re-declare these
// strings, and so a typo cannot silently create a third line type.
Expenses.LINE_TYPE_ACCOUNT = LINE_TYPE_ACCOUNT;
Expenses.LINE_TYPE_ITEM = LINE_TYPE_ITEM;
Expenses.normalizeLineType = normalizeLineType;

module.exports = Expenses;
