/* PHASE 1 audit probe #2 — chart of accounts table name + inventory/COGS accounts + bills. */
const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', 'src', 'backend', 'db', 'accounts.db'), { readonly: true });
const q = (sql, ...p) => { try { return db.prepare(sql).all(...p); } catch (e) { return [{ ERROR: e.message }]; } };
const one = (sql, ...p) => { try { return db.prepare(sql).get(...p); } catch (e) { return { ERROR: e.message }; } };
const line = (t) => console.log('\n=== ' + t + ' ===');

line('ALL TABLES');
console.log(q(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).map(r => r.name).join(', '));

line('COA TABLE CANDIDATES');
for (const t of ['chart_of_accounts', 'chartOfAccounts', 'account', 'accounting_accounts', 'coa']) {
  const r = one(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, t);
  if (r && r.sql) { console.log('-- ' + t + ' --\n' + r.sql); }
}

line('BILLS SAMPLE');
console.log(JSON.stringify(q(`SELECT id, payee, ref_no, category, payment_account, due_date, terms, paid_amount, approval_status FROM expenses WHERE category='bill' ORDER BY id DESC LIMIT 6`), null, 1));

line('BILL LINES SAMPLE');
console.log(JSON.stringify(q(`SELECT l.id, l.expense_id, l.category, l.account_id, l.description, l.amount FROM expense_lines l JOIN expenses e ON e.id=l.expense_id WHERE e.category='bill' ORDER BY l.id DESC LIMIT 10`), null, 1));

line('EXPENSE_LINES account_id null ratio');
console.log(JSON.stringify(one(`SELECT COUNT(*) total, SUM(CASE WHEN account_id IS NULL THEN 1 ELSE 0 END) nullAcct FROM expense_lines`)));

db.close();
