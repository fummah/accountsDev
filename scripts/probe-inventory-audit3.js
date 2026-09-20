/* PHASE 1 audit probe #3 — chart_of_accounts inventory/COGS availability. */
const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, '..', 'src', 'backend', 'db', 'accounts.db'), { readonly: true });
const q = (sql, ...p) => { try { return db.prepare(sql).all(...p); } catch (e) { return [{ ERROR: e.message }]; } };
const line = (t) => console.log('\n=== ' + t + ' ===');

line('ACCOUNT TYPE DISTRIBUTION');
console.log(JSON.stringify(q(`SELECT type, COUNT(*) c FROM chart_of_accounts GROUP BY type ORDER BY c DESC`), null, 1));

line('INVENTORY / COGS / ASSET ACCOUNTS');
console.log(JSON.stringify(q(`SELECT id, name, type, subType, status FROM chart_of_accounts WHERE name LIKE '%nventor%' OR name LIKE '%Cost of Goods%' OR name LIKE '%COGS%'`), null, 1));

line('ALL Asset-family accounts (id, name, type, subType)');
console.log(JSON.stringify(q(`SELECT id, name, type, subType FROM chart_of_accounts WHERE type IN ('Asset','Bank','Cash','Other Current Asset','Fixed Asset') AND status='Active' ORDER BY id`), null, 1));

line('ALL Expense-family + COGS accounts');
console.log(JSON.stringify(q(`SELECT id, name, type, subType FROM chart_of_accounts WHERE type IN ('Expense','Cost of Goods Sold','Other Expense') AND status='Active' ORDER BY id`), null, 1));

line('Accounts Payable account');
console.log(JSON.stringify(q(`SELECT id, name, type, subType FROM chart_of_accounts WHERE type LIKE '%Payable%' OR name LIKE '%Accounts Payable%'`), null, 1));

db.close();
