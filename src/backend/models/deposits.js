const db = require('./dbmgr');

// A manual-deposit line may reference ONE Customer OR ONE Vendor, by UNIQUE id.
// Never by name. Accepts the generic { partyType, partyId } shape and also the
// legacy { customerId } / { vendorId } shape, and enforces the XOR rule: if both
// a customer and a vendor are somehow supplied, neither is stored rather than
// persisting an ambiguous line. Returns { type: 'customer'|'vendor'|null, id }.
const normalizeParty = (a = {}) => {
  const has = (v) => v != null && v !== '';
  // The generic { partyType, partyId } shape is authoritative when present.
  let type = has(a.partyType) ? String(a.partyType).trim().toLowerCase() : '';
  let id = has(a.partyId) ? Number(a.partyId) : null;
  if (!type) {
    const hasCust = has(a.customerId);
    const hasVend = has(a.vendorId);
    // Customer XOR Vendor: a line naming BOTH is ambiguous, so neither is
    // stored rather than persisting an arbitrary winner.
    if (hasCust && hasVend) return { type: null, id: null };
    if (hasCust) { type = 'customer'; id = Number(a.customerId); }
    else if (hasVend) { type = 'vendor'; id = Number(a.vendorId); }
  }
  if (type !== 'customer' && type !== 'vendor') return { type: null, id: null };
  if (id == null || !Number.isFinite(id) || id <= 0) return { type: null, id: null };
  return { type, id };
};

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

    // Each manual-deposit allocation may reference ONE Customer OR ONE Vendor,
    // stored by its UNIQUE id (never by name — names are not identifiers). The
    // relationship belongs on the LINE, because one deposit can mix parties.
    // `party_type` is 'customer' | 'vendor'. Additive: legacy rows stay NULL and
    // simply show no party, rather than a guessed one.
    try {
      const acols = new Set(db.prepare("PRAGMA table_info('deposit_allocations')").all().map(r => r.name));
      const addA = (col, ddl) => { if (!acols.has(col)) db.prepare(`ALTER TABLE deposit_allocations ADD COLUMN ${col} ${ddl}`).run(); };
      addA('party_type', 'TEXT');
      addA('party_id', 'INTEGER');
    } catch (e) { console.error('deposit_allocations migration:', e); }
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
        const allocStmt = db.prepare('INSERT INTO deposit_allocations (deposit_id, account_id, amount, description, party_type, party_id) VALUES (?, ?, ?, ?, ?, ?)');
        for (const a of allocations) {
          let acctId = a.accountId || null;
          if (acctId && isNaN(Number(acctId))) {
            const found = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(name) = LOWER(?) LIMIT 1").get(String(acctId));
            acctId = found ? found.id : null;
          }
          const party = normalizeParty(a);
          allocStmt.run(depositId, acctId, Number(a.amount || 0), a.description || null, party.type, party.id);
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
      const bank = db.prepare('SELECT id, name, type FROM chart_of_accounts WHERE id = ?').get(bankAccountId);
      if (!bank) throw new Error('Bank account not found');
      if (String(bank.type || '').trim().toLowerCase() !== 'bank') {
        throw new Error(
          `Invalid bank account. The selected Chart of Accounts account "${bank.name || ''}" (${bank.type || ''}) is not a Bank account.`
        );
      }

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
      SELECT da.*, c.name AS account_name,
             CASE da.party_type
               WHEN 'customer' THEN COALESCE(NULLIF(cu.display_name,''), NULLIF(cu.company_name,''), NULLIF(TRIM(cu.first_name || ' ' || cu.last_name),''))
               WHEN 'vendor'   THEN COALESCE(NULLIF(su.display_name,''), NULLIF(su.company_name,''), NULLIF(TRIM(su.first_name || ' ' || su.last_name),''))
               ELSE NULL END AS party_name
      FROM deposit_allocations da
      LEFT JOIN chart_of_accounts c ON da.account_id = c.id
      LEFT JOIN customers cu ON da.party_type = 'customer' AND da.party_id = cu.id
      LEFT JOIN suppliers su ON da.party_type = 'vendor'   AND da.party_id = su.id
      WHERE da.deposit_id = ?
    `).all(id);
    dep.payments = db.prepare(`
      SELECT p.*, i.number AS invoice_number,
             COALESCE(NULLIF(pc.display_name,''), NULLIF(pc.company_name,''), NULLIF(pc.first_name || ' ' || pc.last_name,''),
                      NULLIF(ic.display_name,''), NULLIF(ic.company_name,''), NULLIF(ic.first_name || ' ' || ic.last_name,''),
                      'Unknown') AS customer_name
      FROM payments p
      LEFT JOIN invoices i ON p.invoiceId = i.id
      LEFT JOIN customers pc ON p.customerId = pc.id
      LEFT JOIN customers ic ON i.customer = ic.id
      WHERE p.deposit_id = ?
    `).all(id);
    return dep;
  },

  update: (id, { bankAccountId, date, reference, memo, paymentIds, allocations }) => {
    const COA = require('./chartOfAccounts');
    const JournalEntries = require('./journalEntries');
    const existing = Deposits.getById(id);
    if (!existing) throw new Error('Deposit not found');
    if (existing.status === 'Reconciled') throw new Error('Cannot edit a reconciled deposit');

    const isExistingPaymentsDeposit = Array.isArray(paymentIds) && paymentIds.length > 0;
    const totalAmount = isExistingPaymentsDeposit
      ? db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE id IN (${paymentIds.map(() => '?').join(',')})`).get(...paymentIds).total
      : (allocations || []).reduce((s, a) => s + Number(a.amount || 0), 0);
    if (!totalAmount) throw new Error('Deposit must have at least one allocation or payment');

    const bank = db.prepare('SELECT id, name, type FROM chart_of_accounts WHERE id = ?').get(bankAccountId || existing.bank_account_id);
    if (!bank) throw new Error('Bank account not found');
    if (String(bank.type || '').trim().toLowerCase() !== 'bank') {
      throw new Error(
        `Invalid bank account. The selected Chart of Accounts account "${bank.name || ''}" (${bank.type || ''}) is not a Bank account.`
      );
    }

    return db.transaction(() => {
      db.prepare(`UPDATE deposits SET bank_account_id = ?, date = ?, reference = ?, memo = ?, total_amount = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(bankAccountId || existing.bank_account_id, date || existing.date, reference ?? existing.reference, memo ?? existing.memo, totalAmount, id);

      // Replace allocations (resolve account name → id if needed)
      db.prepare('DELETE FROM deposit_allocations WHERE deposit_id = ?').run(id);
      if (allocations && allocations.length > 0) {
        const allocStmt = db.prepare('INSERT INTO deposit_allocations (deposit_id, account_id, amount, description, party_type, party_id) VALUES (?, ?, ?, ?, ?, ?)');
        for (const a of allocations) {
          let acctId = a.accountId || null;
          if (acctId && isNaN(Number(acctId))) {
            const found = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(name) = LOWER(?) LIMIT 1").get(String(acctId));
            acctId = found ? found.id : null;
          }
          // The relationship is re-written on every update from the submitted
          // party (not dropped), so an edit that only changes the amount keeps
          // the Customer/Vendor the client sent back.
          const party = normalizeParty(a);
          allocStmt.run(id, acctId, Number(a.amount || 0), a.description || null, party.type, party.id);
        }
      }

      // Relink selected payments; unlink any that were previously part of this deposit
      if (isExistingPaymentsDeposit) {
        db.prepare(`UPDATE payments SET deposit_id = ?, status = 'Deposited' WHERE id IN (${paymentIds.map(() => '?').join(',')})`).run(id, ...paymentIds);
        const placeholders = paymentIds.map(() => '?').join(',');
        db.prepare(`UPDATE payments SET deposit_id = NULL, status = 'Pending Deposit' WHERE deposit_id = ? AND id NOT IN (${placeholders})`).run(id, ...paymentIds);
      }

      // Void the old journal entry so its lines stop counting toward balances
      const oldJe = db.prepare("SELECT id FROM journal_entries WHERE source_type = 'deposit' AND source_id = ? AND status = 'Posted'").get(id);
      if (oldJe) JournalEntries.voidEntry(oldJe.id);

      // Repost the journal entry with the edited date/amounts/accounts
      const creditLines = [];
      if (isExistingPaymentsDeposit) {
        const undeposited = COA.getSystemAccount('Undeposited Funds') || db.prepare("SELECT id FROM chart_of_accounts WHERE name = 'Undeposited Funds' LIMIT 1").get();
        if (!undeposited) throw new Error('Undeposited Funds account not found');
        creditLines.push({ account_id: undeposited.id, debit: 0, credit: totalAmount, description: 'Clear undeposited funds' });
      } else {
        const undeposited = COA.getSystemAccount('Undeposited Funds') || db.prepare("SELECT id FROM chart_of_accounts WHERE name = 'Undeposited Funds' LIMIT 1").get();
        for (const a of (allocations || [])) {
          const amt = Number(a.amount || 0);
          if (amt <= 0) continue;
          let creditAcctId = a.accountId || null;
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
        date: date || existing.date || new Date().toISOString().slice(0, 10),
        description: memo || `Bank Deposit — ${reference || existing.reference || ''}`,
        source_type: 'deposit',
        source_id: Number(id),
        lines: [
          { account_id: bank.id, debit: totalAmount, credit: 0, description: 'Deposit to bank' },
          ...creditLines,
        ],
      });

      // Keep the legacy transactions row in sync for display consistency
      try {
        const ref = (reference ?? existing.reference) || `DEP-${id}`;
        const legacy = db.prepare("SELECT id, isReconciled FROM transactions WHERE type = 'deposit' AND description = 'Bank Deposit' AND (reference = ? OR reference = ?) ORDER BY id DESC LIMIT 1")
          .get(reference || existing.reference, `DEP-${id}`);
        if (legacy) {
          if (Number(legacy.isReconciled)) {
            throw new Error(`Cannot edit this deposit: its bank-register transaction is part of a reconciliation. Delete the reconciliation first.`);
          }
          db.prepare('UPDATE transactions SET accountId = ?, date = ?, reference = ?, debit = ? WHERE id = ?')
            .run(bankAccountId || existing.bank_account_id, date || existing.date, ref, totalAmount, legacy.id);
        } else {
          db.prepare(`INSERT INTO transactions (accountId, date, type, reference, description, debit, created_at) VALUES (?, ?, 'deposit', ?, 'Bank Deposit', ?, datetime('now'))`)
            .run(bankAccountId || existing.bank_account_id, date || existing.date, ref, totalAmount);
        }
      } catch (legacyErr) {
        if (/reconciliation/.test(legacyErr.message)) throw legacyErr;
        console.warn('[deposits] legacy transactions update failed:', legacyErr.message);
      }

      return { success: true };
    })();
  },

  voidDeposit: (id) => {
    const JournalEntries = require('./journalEntries');

    return db.transaction(() => {
      const dep = db.prepare('SELECT * FROM deposits WHERE id = ?').get(id);
      if (!dep) throw new Error('Deposit not found');

      // Guard: a deposit whose register row was cleared in a reconciliation
      // must not be voided behind the reconciler's back.
      const legacy = db.prepare("SELECT id, isReconciled FROM transactions WHERE type = 'deposit' AND description = 'Bank Deposit' AND (reference = ? OR reference = ?) ORDER BY id DESC LIMIT 1")
        .get(dep.reference, `DEP-${id}`);
      if (legacy && Number(legacy.isReconciled)) {
        throw new Error('Cannot void this deposit: its bank-register transaction is part of a reconciliation. Delete the reconciliation first.');
      }

      // Void the journal entry
      const je = db.prepare("SELECT id FROM journal_entries WHERE source_type = 'deposit' AND source_id = ? AND status = 'Posted'").get(id);
      if (je) JournalEntries.voidEntry(je.id);

      // Unlink payments — revert to Pending Deposit
      db.prepare("UPDATE payments SET deposit_id = NULL, status = 'Pending Deposit' WHERE deposit_id = ?").run(id);

      // Void the deposit
      db.prepare("UPDATE deposits SET status = 'Void', updated_at = datetime('now') WHERE id = ?").run(id);

      // Void the legacy register row so it stops appearing as Active in the
      // bank register and the reconciliation work queue.
      if (legacy) {
        db.prepare("UPDATE transactions SET status = 'Voided' WHERE id = ?").run(legacy.id);
      }

      return { success: true };
    })();
  },

  // Permanently delete a deposit and unwind everything it created:
  //   - reverse its journal entry (so balances/GL stop including it)
  //   - return linked payments to the undeposited queue
  //   - remove the legacy bank-register row (+ its line items)
  //   - delete attachment links/files
  //   - delete allocation lines and the deposit record itself
  // Blocked when the deposit (or its bank-register row) is reconciled.
  deleteDeposit: (id) => {
    const JournalEntries = require('./journalEntries');

    return db.transaction(() => {
      const dep = db.prepare('SELECT * FROM deposits WHERE id = ?').get(id);
      if (!dep) throw new Error('Deposit not found');

      if (String(dep.status || '').toLowerCase() === 'reconciled') {
        throw new Error('This deposit cannot be deleted because it has already been reconciled. Reopen/undo the reconciliation first.');
      }

      const legacy = db.prepare("SELECT id, isReconciled FROM transactions WHERE type = 'deposit' AND description = 'Bank Deposit' AND (reference = ? OR reference = ?) ORDER BY id DESC LIMIT 1")
        .get(dep.reference, `DEP-${id}`);
      if (legacy && Number(legacy.isReconciled)) {
        throw new Error('This deposit cannot be deleted because it has already been reconciled. Reopen/undo the reconciliation first.');
      }

      // Reverse the accounting (excludes it from computed balances/GL).
      const je = db.prepare("SELECT id FROM journal_entries WHERE source_type = 'deposit' AND source_id = ? AND status = 'Posted'").get(id);
      if (je) JournalEntries.voidEntry(je.id);

      // Return linked payments to the undeposited queue.
      db.prepare("UPDATE payments SET deposit_id = NULL, status = 'Pending Deposit' WHERE deposit_id = ?").run(id);

      // Remove the legacy bank-register row + its line items.
      if (legacy) {
        try { db.prepare('DELETE FROM deposit_items WHERE depositId = ?').run(legacy.id); } catch (_) { /* table optional */ }
        db.prepare('DELETE FROM transactions WHERE id = ?').run(legacy.id);
      }

      // Remove any attachments tied to this deposit.
      try {
        const Documents = require('./documents');
        Documents.deleteByLinked('deposit', Number(id));
      } catch (docErr) { console.warn('[deposits] attachment cleanup on delete failed:', docErr.message); }

      // Remove allocation lines and the deposit record.
      db.prepare('DELETE FROM deposit_allocations WHERE deposit_id = ?').run(id);
      db.prepare('DELETE FROM deposits WHERE id = ?').run(id);

      // Audit trail (retained independently of the hard delete).
      try {
        const AuditLog = require('./auditLog');
        AuditLog.log({
          userId: 'system',
          action: 'delete',
          entityType: 'deposit',
          entityId: String(id),
          details: {
            reference: dep.reference,
            date: dep.date,
            amount: dep.total_amount,
            bankAccountId: dep.bank_account_id,
          },
        });
      } catch (auditErr) { console.warn('[deposits.deleteDeposit] audit log failed:', auditErr.message); }

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
