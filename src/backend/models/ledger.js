const db = require("./dbmgr");

const Ledger = {
  getAll() {
    // Combine transactions and journal lines for a simple ledger view
    let txs = [];
    try {
      txs = db.prepare("SELECT date, type as account, description, amount as debit, 0 as credit FROM transactions WHERE type='Income' AND status='Active' UNION ALL SELECT date, type as account, description, 0 as debit, amount as credit FROM transactions WHERE type='Expense' AND status='Active' ORDER BY date DESC").all();
    } catch {}
    let journal = [];
    try {
      journal = db.prepare(`
        SELECT je.date,
               COALESCE(c.name, jl.account) AS account,
               je.description,
               jl.debit,
               jl.credit,
               je.reference,
               je.source_type,
               je.source_id,
               je.status
        FROM journal_entries je
        JOIN journal_lines jl ON je.id = COALESCE(jl.journal_id, jl.entry_id)
        LEFT JOIN chart_of_accounts c ON jl.account_id = c.id
        WHERE je.status = 'Posted' OR je.status IS NULL
        ORDER BY je.date DESC
      `).all();
    } catch (e) {
      console.error('[Ledger] getAll journal query error:', e.message);
    }
    return [...txs, ...journal].sort((a, b) => new Date(b.date) - new Date(a.date));
  }
};

module.exports = Ledger;