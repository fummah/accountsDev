const db = require("./dbmgr");

const Ledger = {
  getAll() {
    // Combine transactions and journal lines for a simple ledger view
    const txs = db.prepare("SELECT date, type as account, description, amount as debit, 0 as credit FROM transactions WHERE type='Income' AND status='Active' UNION ALL SELECT date, type as account, description, 0 as debit, amount as credit FROM transactions WHERE type='Expense' AND status='Active' ORDER BY date DESC").all();
    const journal = db.prepare("SELECT je.date, jl.account, je.description, jl.debit, jl.credit FROM journal_entries je JOIN journal_lines jl ON je.id=jl.entry_id ORDER BY je.date DESC").all();
    return [...txs, ...journal].sort((a, b) => new Date(b.date) - new Date(a.date));
  }
};

module.exports = Ledger;