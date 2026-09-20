/* Read-only: print the P&L summary totals from a scratch copy (evidence the
   presentation change did not alter any financial value). */
const path = require('path');
const Module = require('module');
const electronStub = { ipcMain: { handle: () => {} }, app: { isPackaged: true } };
const originalLoad = Module._load;
Module._load = function (request) { if (request === 'electron') return electronStub; return originalLoad.apply(this, arguments); };

require('./lib/testDb.js').useScratchCopy({ label: 'probe-pl-totals' });
const Invoices = require('../src/backend/models/invoices.js');

const r = Invoices.getFinancialReport('2000-01-01', '2100-12-31', { basis: 'accrual' });
const p = (r && r.profitLoss) || {};
console.log(JSON.stringify({
  revenue: p.revenue,
  cogs: p.cogs,
  grossProfit: p.grossProfit,
  operatingExpenses: p.operatingExpenses,
  netProfit: p.netProfit,
  incomeAccounts: (p.incomeAccounts || []).length,
  expenseAccounts: (p.expenseAccounts || []).length,
  cogsAccounts: (p.cogsAccounts || []).length,
}, null, 2));
