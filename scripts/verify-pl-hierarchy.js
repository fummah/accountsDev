// Runtime check that getFinancialReport still runs after the ORDER BY change
// and returns hierarchy metadata (parentId + direct amounts) for the P&L tree.
// Runs against a SCRATCH COPY.
/* eslint-disable no-console */
const path = require('path');
const Module = require('module');

const electronStub = { ipcMain: { handle: () => {} }, app: { isPackaged: true } };
const originalLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return electronStub;
  return originalLoad.apply(this, arguments);
};

require('./lib/testDb.js').useScratchCopy({ label: 'verify-pl-hierarchy' });
const Invoices = require('../src/backend/models/invoices.js');

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`); }
};

let r;
try {
  r = Invoices.getFinancialReport('2000-01-01', '2100-12-31', { basis: 'accrual' });
  check('getFinancialReport runs (ORDER BY valid)', !!r && !r.error, r && r.error);
} catch (e) {
  check('getFinancialReport runs (ORDER BY valid)', false, e.message);
}

const pl = (r && r.profitLoss) || {};
const all = [...(pl.incomeAccounts || []), ...(pl.cogsAccounts || []), ...(pl.expenseAccounts || [])];
check('returns P&L account arrays', Array.isArray(pl.incomeAccounts) && Array.isArray(pl.expenseAccounts));
check('accounts carry id/name/amount', all.length > 0 && all.every(a => a.id != null && 'amount' in a));
check('accounts carry parentId key', all.length > 0 && all.every(a => 'parentId' in a));

const ids = new Set(all.map(a => Number(a.id)));
const linked = all.filter(a => a.parentId != null && ids.has(Number(a.parentId)));
check('at least one parent-child link exists in real data', linked.length > 0, { total: all.length, linked: linked.length });

// Sibling ordering should follow account number (the COA convention),
// evaluated WITHIN each section (income / cogs / expenses).
const num = (a) => { const n = parseInt(String(a.number == null ? '' : a.number), 10); return Number.isFinite(n) ? n : 0; };
let orderedOk = true;
[pl.incomeAccounts, pl.cogsAccounts, pl.expenseAccounts].forEach(section => {
  const byParent = {};
  (section || []).forEach(a => { const k = String(a.parentId); (byParent[k] = byParent[k] || []).push(a); });
  Object.values(byParent).forEach(list => {
    for (let i = 1; i < list.length; i++) {
      if (num(list[i - 1]) > num(list[i])) {
        orderedOk = false;
        console.log('    out-of-order group:', JSON.stringify(list.map(a => ({ id: a.id, number: a.number, name: a.name }))));
        break;
      }
    }
  });
});
check('siblings returned in account-number order (per section)', orderedOk);

console.log(`\n  (${all.length} P&L accounts; ${linked.length} have a parent in the same report)`);
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
