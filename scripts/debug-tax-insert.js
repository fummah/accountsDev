const path = require('path');
const Module = require('module');

const handlers = new Map();
const electronStub = {
  ipcMain: { handle: (ch, fn) => handlers.set(ch, fn) },
};
const originalLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return electronStub;
  return originalLoad.apply(this, arguments);
};

const realLog = console.log.bind(console);
console.log = () => {};
require('./lib/testDb.js').useScratchCopy({ label: 'debug-tax-insert' });
require('../src/backend/models/index.js');
const registerIpcHandlers = require('../src/backend/handlers/ipcHandlers.js');
const registerCustomerHandlers = require('../src/backend/handlers/customerHandlers.js');
const dbmgr = require('../src/backend/models/dbmgr.js');
console.log = realLog;
const db = dbmgr.raw;
registerIpcHandlers();
registerCustomerHandlers();

const fakeEvent = { sender: { id: 'test' } };
const invoke = async (ch, ...args) => handlers.get(ch)(fakeEvent, ...args);

(async () => {
  // Create a VAT rate
  await invoke('insert-vat', 'Debug Tax', 6, 'test');
  const allVat = await invoke('get-vat');
  const vat = allVat.find(v => v.vat_name === 'Debug Tax');
  console.log('VAT rate:', JSON.stringify(vat));
  const vatId = Number(vat.id);
  
  // Insert a customer with tax params
  const res = await invoke('insert-customer',
    '', 'DebugTest', '', 'Customer', '', 'debug@example.invalid',
    'Debug Customer', 'Debug Co', '', '', '', '', '', '', '', '', '', '', '',
    '', '', 'test', 0, null, 'Email', 'en', 'en', 'debug notes',
    true, 6, vatId);
  console.log('Insert result:', JSON.stringify(res));
  
  // Check what's in the DB
  const row = db.prepare('SELECT default_tax_rate, default_tax_rate_id, taxable FROM customers WHERE first_name = ?').get('DebugTest');
  console.log('DB row:', JSON.stringify(row));
  console.log('default_tax_rate:', row.default_tax_rate, typeof row.default_tax_rate);
  console.log('default_tax_rate_id:', row.default_tax_rate_id, typeof row.default_tax_rate_id);
  console.log('taxable:', row.taxable, typeof row.taxable);
  
  // Cleanup
  db.prepare('DELETE FROM customers WHERE first_name = ?').run('DebugTest');
  db.prepare('DELETE FROM vat WHERE vat_name = ?').run('Debug Tax');
})();
