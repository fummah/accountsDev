/* Read-only probe: does the backend invoice query actually filter by customerId
   and by invoice start_date? Runs on a scratch copy. */
const path = require('path');
const Module = require('module');
const electronStub = { ipcMain: { handle: () => {} }, app: { isPackaged: true } };
const originalLoad = Module._load;
Module._load = function (request) { if (request === 'electron') return electronStub; return originalLoad.apply(this, arguments); };

require('./lib/testDb.js').useScratchCopy({ label: 'probe-receive-payments' });
const Invoices = require('../src/backend/models/invoices.js');
const db = require('../src/backend/models/dbmgr.js').raw;

const status = '!paid,cancelled,void';
const base = (cust, from, to) => Invoices.getPaginated(1, 500, '', status, '', '', from || '', to || '', cust || '', true);

const all = base('', '', '');
const custs = [...new Set(all.data.map(r => `${r.customer}:${r.customer_name}`))];
console.log('NO FILTER  -> rows:', all.total, 'customers:', custs.slice(0, 8));

// pick the customer with the most invoices
const counts = {};
all.data.forEach(r => { counts[r.customer] = (counts[r.customer] || 0) + 1; });
const topId = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
const topName = (all.data.find(r => String(r.customer) === String(topId)) || {}).customer_name;

const one = base(topId, '', '');
const oneCusts = [...new Set(one.data.map(r => r.customer))];
console.log(`CUSTOMER ${topId} (${topName}) -> rows:`, one.total, 'distinct customers in result:', oneCusts);
console.log('  FILTER OK?', oneCusts.length === 1 && String(oneCusts[0]) === String(topId));

const july = base('', '2026-07-01', '2026-07-31');
const dates = july.data.map(r => r.start_date).sort();
console.log('DATE 2026-07-01..2026-07-31 -> rows:', july.total, 'min:', dates[0], 'max:', dates[dates.length - 1]);
const outside = july.data.filter(r => r.start_date < '2026-07-01' || r.start_date > '2026-07-31');
console.log('  DATE FILTER OK?', outside.length === 0, outside.slice(0, 3).map(r => r.start_date));

const both = base(topId, '2026-07-01', '2026-07-31');
console.log(`COMBINED customer ${topId} + July -> rows:`, both.total,
  'distinct customers:', [...new Set(both.data.map(r => r.customer))],
  'all in range?', both.data.every(r => r.start_date >= '2026-07-01' && r.start_date <= '2026-07-31'));
