const { ipcMain } = require('electron');
const Transactions = require('../models/transactions');
const JournalEntries = require('../models/journalEntries');
const Journal = require('../models/journal');
const Ledger = require('../models/ledger');
const AuditLog = require('../models/auditLog');
const ChartOfAccounts = require('../models/chartOfAccounts');
const db = require('../models/dbmgr');
const { authorize } = require('../security/authz');
const { validateTransaction, validateJournal } = require('../validation/validators');
const { deriveSplitTotal, parseStoredSplits, MONEY_TOLERANCE } = require('../services/chargeSplits');

// A check is always drawn on a real Bank-type account. Reject any Chart of
// Accounts account that is NOT classified as 'Bank' (Credit Card, Expense,
// Income, Liability, Equity, ... are never valid check bank accounts).
const assertBankAccount = (accountId) => {
  if (accountId == null) return;
  const acc = ChartOfAccounts.getAccount(Number(accountId));
  if (!acc) {
    throw new Error(
      `Invalid bank account: account #${accountId} does not exist in the Chart of Accounts.`
    );
  }
  const type = String(acc.type || acc.accountType || '').trim().toLowerCase();
  if (type !== 'bank') {
    throw new Error(
      `Invalid bank account. The selected Chart of Accounts account "${acc.name || acc.accountName}" (${acc.type || acc.accountType}) is not a Bank account.`
    );
  }
};

const registerTransactionHandlers = () => {
  // Transactions
  ipcMain.handle('get-transactions', async () => {
    try {
      return Transactions.getAll();
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('get-transactions-paginated', async (_e, { page = 1, pageSize = 25, search = '', type = '' } = {}) => {
    try {
      return Transactions.getPaginated(page, pageSize, search, type);
    } catch (error) {
      console.error('Error fetching paginated transactions:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('get-check-stats', async () => {
    try {
      return Transactions.getCheckStats();
    } catch (error) {
      console.error('Error fetching check stats:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('find-transaction-by-reference', async (_e, { type, reference }) => {
    try {
      return Transactions.findByReference(type, reference) || null;
    } catch (error) {
      console.error('Error finding transaction by reference:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('insert-transaction', async (event, tx) => {
    try {
      const ctx = authorize(event, { permissions: 'write:transactions' });
      validateTransaction(tx);
      if ((tx.type || '').toLowerCase() === 'check') assertBankAccount(tx.accountId);
      // Split-driven total: when the payload carries expense split lines the
      // charge total is DERIVED from them. A client-supplied `amount` is never
      // trusted — it must equal the line sum or it is corrected to it.
      const derivedAmount = deriveSplitTotal(tx.splitLines);
      if (derivedAmount != null) {
        if (Number(tx.amount) > 0 && Math.abs(Number(tx.amount) - derivedAmount) > MONEY_TOLERANCE) {
          console.warn(`[insert-transaction] supplied amount ${tx.amount} != split total ${derivedAmount}; using split total`);
        }
        tx = { ...tx, amount: derivedAmount };
      }
      // Infer proper debit/credit based on transaction type
      // For the bank register: deposits increase the bank (debit for Asset accounts),
      // checks/expenses decrease the bank (credit for Asset accounts).
      const amt = Number(tx.amount) || 0;
      let debit = tx.debit;
      let credit = tx.credit;
      if (debit == null && credit == null && amt > 0) {
        const type = (tx.type || '').toLowerCase();
        if (type === 'deposit' || type === 'transfer_in') {
          debit = amt; credit = 0;
        } else if (type === 'check' || type === 'expense' || type === 'payment' || type === 'transfer_out' || type === 'credit card') {
          debit = 0; credit = amt;
        } else {
          // Default: treat unknown types as outgoing (credit)
          debit = 0; credit = amt;
        }
      }
      const res = Transactions.insert({ ...tx, debit, credit });
      if (res?.changes > 0) {
        AuditLog.log({
          userId: ctx.userId,
          action: 'create',
          entityType: 'transaction',
          entityId: res.lastInsertRowid,
          details: { tx }
        });
        // Post double-entry journal: DR expense accounts per split line / CR bank account
        const splitLines = Array.isArray(tx.splitLines) ? tx.splitLines : [];
        if (splitLines.length > 0 || Number(tx.amount) > 0) {
          try {
            JournalEntries.postTransaction({
              id: res.lastInsertRowid,
              date: tx.date,
              description: tx.description || '',
              reference: tx.reference || '',
              accountId: tx.accountId,
              amount: tx.amount,
              splitLines,
            });
          } catch (jErr) {
            console.warn('Journal auto-post (transaction) failed:', jErr.message);
          }
        }
      }
      return res;
    } catch (error) {
      console.error('Error inserting transaction:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('get-transaction', async (_e, id) => {
    try {
      return Transactions.getById(id);
    } catch (error) {
      console.error('Error fetching transaction:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('update-transaction', async (event, id, data) => {
    try {
      const ctx = authorize(event, { permissions: 'write:transactions' });
      const existing = Transactions.getById(id);
      const txnType = String((data.type || existing?.type || '')).toLowerCase();
      if (txnType === 'check') assertBankAccount(data.accountId != null ? data.accountId : existing?.accountId);
      // Split-driven total (same rule as insert). Prefer the incoming lines;
      // fall back to the stored categories so an edit that only changes an
      // account still keeps the total consistent with the lines.
      const nextSplitLines = Array.isArray(data.splitLines)
        ? data.splitLines
        : parseStoredSplits(existing?.categories);
      const derivedAmount = deriveSplitTotal(nextSplitLines);
      if (derivedAmount != null) {
        if (Number(data.amount) > 0 && Math.abs(Number(data.amount) - derivedAmount) > MONEY_TOLERANCE) {
          console.warn(`[update-transaction] supplied amount ${data.amount} != split total ${derivedAmount}; using split total`);
        }
        data = { ...data, amount: derivedAmount };
      }
      const res = Transactions.update(id, data);
      if (res?.changes > 0) {
        AuditLog.log({
          userId: ctx.userId,
          action: 'update',
          entityType: 'transaction',
          entityId: id,
          details: { before: existing, after: data }
        });
        // Reverse old journal entry and repost with updated data
        try {
          if (existing) {
            // Find and reverse the old journal entry by source_type + source_id
            const oldEntry = db.prepare("SELECT id FROM journal_entries WHERE source_type = 'transaction' AND source_id = ? AND status = 'Posted' LIMIT 1").get(String(id));
            if (oldEntry) {
              JournalEntries.reverse(oldEntry.id, data.date || existing?.date, ctx.userId);
            }
          }
          const splitLines = nextSplitLines;
          if (splitLines.length > 0 || Number(data.amount || existing?.amount || 0) > 0) {
            JournalEntries.postTransaction({
              id,
              date: data.date || existing?.date,
              description: data.description || existing?.description || '',
              reference: data.reference || existing?.reference || '',
              accountId: data.accountId || existing?.accountId,
              amount: data.amount != null ? data.amount : existing?.amount,
              splitLines,
            });
          }
        } catch (jErr) {
          console.warn('Journal reverse-repost (transaction update) failed:', jErr.message);
        }
      }
      return res;
    } catch (error) {
      console.error('Error updating transaction:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('delete-transaction', async (event, id) => {
    try {
      const ctx = authorize(event, { permissions: 'write:transactions' });
      const existing = Transactions.getById(id);
      // A check carries accounting (and possibly bill payment allocations);
      // route it through the ONE reversal service so no screen can delete a
      // check while leaving its payment / journal behind.
      const isCheck = existing && String(existing.type || '').toLowerCase() === 'check';
      const res = isCheck ? Transactions.deleteCheck(id) : Transactions.deleteTransaction(id);
      if ((res?.changes > 0) || res?.success) {
        AuditLog.log({
          userId: ctx.userId,
          action: 'delete',
          entityType: isCheck ? 'check' : 'transaction',
          entityId: id,
          details: isCheck ? { reversedBills: res.reversedBills } : undefined
        });
      }
      return res;
    } catch (error) {
      console.error('Error deleting transaction:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('void-transaction', async (event, id) => {
    try {
      const ctx = authorize(event, { permissions: 'write:transactions' });
      const res = Transactions.voidTransaction(id);
      if (res?.changes > 0) {
        AuditLog.log({
          userId: ctx.userId,
          action: 'void',
          entityType: 'transaction',
          entityId: id
        });
      }
      return res;
    } catch (error) {
      console.error('Error voiding transaction:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('delete-check', async (event, id) => {
    try {
      const ctx = authorize(event, { permissions: 'write:transactions' });
      const res = Transactions.deleteCheck(id);
      if (res?.success) {
        AuditLog.log({
          userId: ctx.userId,
          action: 'delete',
          entityType: 'check',
          entityId: id,
          details: { reversedJournal: res.reversedJournal, reversedBill: res.reversedBill }
        });
      }
      return res;
    } catch (error) {
      console.error('Error deleting check:', error);
      return { error: error.message };
    }
  });

  // Read-only: which bills (if any) does this check pay? Used by the Check
  // Printing screen to show a meaningful "this will reopen bill X" confirmation
  // before deletion. Never returns a payment for an unrelated write check.
  ipcMain.handle('get-check-bill-applications', async (_e, id) => {
    try {
      const BillPayments = require('../models/billPayments');
      return BillPayments.describeForCheck(id) || [];
    } catch (error) {
      console.error('Error fetching check bill applications:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('mark-check-printed', async (event, id, printed = 1) => {
    try {
      const ctx = authorize(event, { permissions: 'write:transactions' });
      const tx = db.prepare("SELECT id, type FROM transactions WHERE id = ?").get(id);
      if (!tx) return { success: false, error: 'Transaction not found' };
      if (String(tx.type || '').toLowerCase() !== 'check') {
        return { success: false, error: 'Only checks can be marked as printed' };
      }
      const val = printed ? 1 : 0;
      const res = db.prepare("UPDATE transactions SET printed = ?, printed_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END WHERE id = ?").run(val, val, id);
      if (res.changes > 0) {
        AuditLog.log({
          userId: ctx.userId,
          action: val ? 'print' : 'unprint',
          entityType: 'transaction',
          entityId: id,
          details: { printed: val, printedAt: val ? new Date().toISOString() : null }
        });
      }
      return { success: res.changes > 0 };
    } catch (error) {
      console.error('Error updating check printed status:', error);
      return { error: error.message };
    }
  });

  // Journal
  ipcMain.handle('get-journal', async () => {
    try {
      return Journal.getAll();
    } catch (error) {
      console.error('Error fetching journal:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('insert-journal', async (event, entry) => {
    try {
      const ctx = authorize(event, { permissions: 'write:journal' });
      console.log('[insert-journal] received entry:', JSON.stringify({ ...entry, lines: entry.lines?.length }));
      // Single posting engine: JournalEntries.post (accepts account names or ids)
      const result = JournalEntries.post(entry);
      const id = result?.id;
      console.log('[insert-journal] inserted with id:', id);
      if (id) {
        AuditLog.log({
          userId: ctx.userId,
          action: 'create',
          entityType: 'journal_entry',
          entityId: id,
          details: { entry }
        });
      }
      return result;
    } catch (error) {
      console.error('Error inserting journal entry:', error);
      return { error: error.message };
    }
  });

  // Suggest corrective lines for a draft journal (no DB writes)
  ipcMain.handle('suggest-corrective-journal', async (event, entryDraft, options) => {
    try {
      const ctx = authorize(event, { permissions: 'write:journal' });
      const result = Journal.suggestCorrective(entryDraft, options);
      AuditLog.log({
        userId: ctx.userId,
        action: 'suggest',
        entityType: 'journal_entry',
        entityId: null,
        details: { entryDraft, result }
      });
      return result;
    } catch (error) {
      console.error('Error suggesting corrective journal:', error);
      return { error: error.message };
    }
  });

  // Blockchain anchoring for journal entries (fallback in case accountingHandlers fails)
  ipcMain.handle('journal-anchor', async (_e, entryId) => {
    try {
      const entry = db.prepare('SELECT id, status FROM journal_entries WHERE id = ?').get(entryId);
      if (!entry) return { error: 'Entry not found' };
      if (entry.status === 'Void') return { error: 'Cannot anchor a voided entry' };
      db.prepare("UPDATE journal_entries SET memo = COALESCE(memo,'') || ' [Anchored: ' || datetime('now') || ']' WHERE id = ?").run(entryId);
      return { success: true, anchoredAt: new Date().toISOString() };
    } catch (e) { return { error: e.message }; }
  });

  // Create a reversal entry for an existing journal entry
  ipcMain.handle('create-reversal-journal', async (event, { originalEntryId, date, entered_by }) => {
    try {
      const ctx = authorize(event, { permissions: 'write:journal' });
      const newId = Journal.createReversalEntry({ originalEntryId, date, entered_by: entered_by || ctx.userId });
      if (newId) {
        AuditLog.log({
          userId: ctx.userId,
          action: 'create',
          entityType: 'journal_reversal',
          entityId: newId,
          details: { originalEntryId, date }
        });
      }
      return { success: true, id: newId };
    } catch (error) {
      console.error('Error creating reversal journal:', error);
      return { error: error.message };
    }
  });

  // Ledger
  ipcMain.handle('get-ledger', async () => {
    try {
      return Ledger.getAll();
    } catch (error) {
      console.error('Error fetching ledger:', error);
      return { error: error.message };
    }
  });
};

module.exports = registerTransactionHandlers;