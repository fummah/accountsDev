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

const fakeEvent = { sender: { id: 'test' } };
const invoke = async (ch, ...args) => handlers.get(ch)(fakeEvent, ...args);

(async () => {
  // Create VAT rate
  await invoke('insert-vat', 'PA Sales Tax', 6, 'test');
  const allVat = await invoke('get-vat');
  const rate = allVat.find(v => v.vat_name === 'PA Sales Tax' && Number(v.vat_percentage) === 6);
  const vatId = Number(rate.id);
  console.log('VAT id:', vatId, 'percentage:', rate.vat_percentage);
  
  // Insert customer exactly like test2 does
  const res = await invoke('insert-customer',
    '', 'TaxTest', '', 'Customer', '', 'tax-test@example.invalid',
    'Tax Test Customer', 'Tax Co', '', '', '', '', '', '', '', '', '', '', '',
    '', '', 'test', 0, null, 'Email', 'en', 'en', 'tax test notes',
    true, 6, vatId);
  console.log('Insert result:', JSON.stringify(res));
  
  // Direct DB query
  const dbRow = db.prepare("SELECT * FROM customers WHERE first_name = 'TaxTest'").get();
  console.log('Direct DB query:');
  console.log('  default_tax_rate:', dbRow.default_tax_rate);
  console.log('  default_tax_rate_id:', dbRow.default_tax_rate_id);
  console.log('  taxable:', dbRow.taxable);
  
  // Via get-customers handler
  const allCust = await invoke('get-customers');
  const arr = Array.isArray(allCust) ? allCust : (allCust?.all || allCust?.data || []);
  console.log('get-customers returned:', Array.isArray(allCust) ? 'array' : typeof allCust, 'length:', arr.length);
  const cust = arr.find(c => c.first_name === 'TaxTest');
  console.log('Via get-customers handler:');
  console.log('  default_tax_rate:', cust.default_tax_rate);
  console.log('  default_tax_rate_id:', cust.default_tax_rate_id);
  console.log('  taxable:', cust.taxable);
  
  // Via get-singleCustomer handler
  const single = await invoke('get-singleCustomer', Number(cust.id));
  console.log('Via get-singleCustomer handler:');
  console.log('  default_tax_rate:', single.default_tax_rate);
  console.log('  default_tax_rate_id:', single.default_tax_rate_id);
  console.log('  taxable:', single.taxable);
  
  // Cleanup
  db.prepare('DELETE FROM customers WHERE first_name = ?').run('TaxTest');
  db.prepare('DELETE FROM vat WHERE vat_name = ?').run('PA Sales Tax');
})();
