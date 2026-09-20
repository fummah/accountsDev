const Module = require('module');
const handlers = new Map();
const electronStub = { ipcMain: { handle: (ch, fn) => handlers.set(ch, fn) } };
const originalLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return electronStub;
  return originalLoad.apply(this, arguments);
};
const realLog = console.log.bind(console);
console.log = () => {};
require('./lib/testDb.js').useScratchCopy({ label: 'verify-tax-rate-dropdown' });
require('../src/backend/models/index.js');
const registerIpcHandlers = require('../src/backend/handlers/ipcHandlers.js');
const registerCustomerHandlers = require('../src/backend/handlers/customerHandlers.js');
const dbmgr = require('../src/backend/models/dbmgr.js');
console.log = realLog;
const db = dbmgr.raw;
registerIpcHandlers();
registerCustomerHandlers();

// Check for stale TaxTest customers
const rows = db.prepare("SELECT id, first_name, default_tax_rate, default_tax_rate_id, taxable FROM customers WHERE first_name = 'TaxTest'").all();
console.log('TaxTest customers found:', rows.length);
rows.forEach(r => console.log(JSON.stringify(r)));

// Check for stale NonTax customers
const rows2 = db.prepare("SELECT id, first_name, default_tax_rate, default_tax_rate_id, taxable FROM customers WHERE first_name = 'NonTax'").all();
console.log('NonTax customers found:', rows2.length);
rows2.forEach(r => console.log(JSON.stringify(r)));

// Check for stale LegacyCust customers
const rows3 = db.prepare("SELECT id, first_name, default_tax_rate, default_tax_rate_id, taxable FROM customers WHERE first_name = 'LegacyCust'").all();
console.log('LegacyCust customers found:', rows3.length);
rows3.forEach(r => console.log(JSON.stringify(r)));
