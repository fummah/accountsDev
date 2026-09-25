/**
 * verify-customer-export.js
 *
 * Proves the Customers Export feature and toolbar cleanup:
 *   (a) the backend export query returns EVERY matching customer (no page cap),
 *       with the SAME search + status filters and ordering as the list;
 *   (b) the IPC handler accepts only the search/status DTO (never raw SQL);
 *   (c) the shared CSV serializer escapes commas/quotes/newlines and writes a
 *       UTF-8 BOM;
 *   (d) the Customers toolbar no longer offers Import CSV, offers Export, and
 *       uses the shared ListToolbar (also used by Suppliers/Vendors);
 *   (e) the dedicated Import feature still exists.
 *
 * Runs against a SCRATCH DB.
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/verify-customer-export.js
 */
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ── stub electron BEFORE any handler is required ────────────────────────────
const handlers = new Map();
const electronStub = { ipcMain: { handle: (channel, fn) => { handlers.set(channel, fn); } } };
const originalLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return electronStub;
  return originalLoad.apply(this, arguments);
};

require('./lib/testDb.js').useScratchCopy({ label: 'verify-customer-export' });

const models = require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const dbmgr = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js'));
const db = dbmgr.raw;
const { Customers } = models;
require(path.join(ROOT, 'src', 'backend', 'handlers', 'customerHandlers.js'))();

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual); const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  [PASS] ' + label); }
  else { fail++; console.log(`  [FAIL] ${label}\n      expected: ${e}\n      actual:   ${a}`); }
};
const ok = (label, cond, detail) => { check(label, !!cond, true); if (!cond && detail) console.log('      detail: ' + detail); };

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const makeCustomer = (over = {}) => {
  const vals = {
    title: '', first_name: 'ZZExport', last_name: 'Customer', display_name: 'ZZExport Customer',
    company_name: 'ZZExport Co', email: 'zz@example.invalid', phone_number: '', mobile_number: '',
    website: '', address1: '', address2: '', city: '', state: '', postal_code: '', country: '',
    taxable: 1, default_tax_rate: null, default_tax_rate_id: null, status: 'Active', notes: '',
    entered_by: 'verify', date_entered: '2026-01-02 03:04:05', ...over,
  };
  const cols = Object.keys(vals);
  const id = db.prepare(`INSERT INTO customers (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(...cols.map(c => vals[c])).lastInsertRowid;
  return Number(id);
};

(async () => {
  // ── (b) handler wired + DTO-only ─────────────────────────────────────────
  const exportHandler = handlers.get('get-customers-for-export');
  ok('get-customers-for-export handler is registered', typeof exportHandler === 'function');
  const handlerSrc = read('src/backend/handlers/customerHandlers.js');
  ok('the handler uses the shared export query', /Customers\.getExportRows/.test(handlerSrc));
  ok('the handler only forwards search/status strings (no raw SQL)',
    /typeof search === 'string'/.test(handlerSrc) && /typeof status === 'string'/.test(handlerSrc));

  // ── (a) filters + ordering + no pagination cap ───────────────────────────
  const base = Customers.getExportRows('', '');
  const totalAll = Customers.getPaginated(1, 500, '', '').total;
  check('export returns the same population as the list total', base.length, totalAll);

  const aaron = makeCustomer({ first_name: 'Aaron', last_name: 'ZZExport', display_name: 'Aaron ZZExport', status: 'Active' });
  const aaronInactive = makeCustomer({ first_name: 'Aaron', last_name: 'ZZExport', display_name: 'Aaron ZZExport (Inactive)', status: 'Inactive' });
  const zeta = makeCustomer({ display_name: 'Zeta ZZExport', company_name: 'Zeta', status: 'Active' });

  const bySearch = Customers.getExportRows('Aaron', '');
  ok('search filter matches by first name', bySearch.some(r => Number(r.id) === aaron));
  ok('search returns only matching rows', bySearch.every(r => /aaron/i.test(`${r.first_name} ${r.display_name} ${r.company_name} ${r.email}`)));
  const byStatus = Customers.getExportRows('', 'Active');
  ok('status filter returns only Active rows', byStatus.every(r => (r.status || 'Active') === 'Active'));
  ok('status filter excludes the Inactive row', !byStatus.some(r => Number(r.id) === aaronInactive));
  const byBoth = Customers.getExportRows('Aaron', 'Active');
  ok('search + status applies BOTH filters',
    byBoth.some(r => Number(r.id) === aaron) && !byBoth.some(r => Number(r.id) === aaronInactive));

  // Ordering matches the list: display_name ASC (COLLATE NOCASE).
  const names = Customers.getExportRows('ZZExport', '').map(r => (r.display_name || '').toLowerCase());
  const sorted = [...names].sort();
  check('export is ordered by display name (same as the list)', names, sorted);

  // Balance is included for the Outstanding Balance column.
  ok('export rows include a numeric balance', Customers.getExportRows('ZZExport', '').every(r => r.balance != null));

  // No pagination cap: insert enough to exceed the list's 500 cap.
  const before = Customers.getExportRows('', '').length;
  const bulk = db.transaction(() => {
    for (let i = 0; i < 520; i++) {
      makeCustomer({ display_name: `ZZBulk ${String(i).padStart(4, '0')}`, company_name: 'ZZBulk' });
    }
  });
  bulk();
  const exportCount = Customers.getExportRows('ZZBulk', '').length;
  const pageCap = Customers.getPaginated(1, 500, 'ZZBulk', '').data.length;
  check('export returns ALL matching rows (no 500 cap)', exportCount, 520);
  check('the paginated list is still capped at 500', pageCap, 500);
  ok('export count exceeds a single page', exportCount > pageCap);

  // ── (c) CSV serializer ───────────────────────────────────────────────────
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csvutil-'));
  const mjs = path.join(tmp, 'csv.mjs');
  fs.writeFileSync(mjs, read('src/frontend/src/utils/csv.js'));
  const csv = await import('file://' + mjs.replace(/\\/g, '/'));
  check('commas are quoted and stay one column',
    csv.csvEscape('Smith, Jones & Sons'), '"Smith, Jones & Sons"');
  check('embedded quotes are doubled', csv.csvEscape('He said "Hello"'), '"He said ""Hello"""');
  check('newlines are quoted', csv.csvEscape('line1\nline2'), '"line1\nline2"');
  check('plain values are untouched', csv.csvEscape('Plain'), 'Plain');
  check('null becomes empty', csv.csvEscape(null), '');
  const doc = csv.toCsv(['A', 'B'], [['x, y', 'p"q']]);
  check('toCsv joins with CRLF and escapes each cell', doc, 'A,B\r\n"x, y","p""q"');
  ok('Unicode survives serialization', csv.toCsv(['N'], [['José François Müller']]).includes('José François Müller'));
  check('csvDate formats to yyyy-mm-dd', csv.csvDate('2026-01-02 03:04:05'), '2026-01-02');

  // ── (d) toolbar cleanup + shared toolbar ─────────────────────────────────
  const customerList = read('src/frontend/src/components/customers/CustomerList.js');
  const customerCenter = read('src/frontend/src/components/customers/CustomerCenter.js');
  const vendorList = read('src/frontend/src/components/vendors/SupplierVendorList.js');
  const listToolbar = read('src/frontend/src/components/shared/ListToolbar.js');

  ok('CustomerList no longer offers Import CSV',
    !/Import CSV/.test(customerList) && !/CsvImportModal/.test(customerList) && !/importVisible/.test(customerList));
  ok('CustomerList offers Export', /onExport=\{handleExport\}/.test(customerList) && /Export/.test(listToolbar));
  ok('CustomerList uses the shared ListToolbar', /<ListToolbar/.test(customerList));
  ok('CustomerList export uses the backend export query',
    /getCustomersForExport/.test(customerList) && /toCsv\(/.test(customerList) && /downloadCsv\(/.test(customerList));
  ok('CustomerList exports the full filtered set (not the current page)',
    /getCustomersForExport\?\.\(search/.test(customerList));
  ok('CustomerList keeps a working Refresh + Add Customer',
    /onRefresh=\{handleRefresh\}/.test(customerList) && /Add Customer/.test(customerList));
  ok('CustomerCenter Customers tab uses the shared ListToolbar with Export',
    /<ListToolbar/.test(customerCenter) && /handleExportCustomers/.test(customerCenter));
  ok('SupplierVendorList uses the shared ListToolbar',
    /<ListToolbar/.test(vendorList));
  ok('SupplierVendorList export reuses the shared CSV helper',
    /toCsv\(/.test(vendorList) && /downloadCsv\(/.test(vendorList));
  ok('ListToolbar aligns every control (align-items center, one row)',
    /alignItems:\s*'center'/.test(listToolbar) && /al-list-toolbar/.test(listToolbar) && !/marginRight:\s*'auto'/.test(listToolbar));
  ok('ListToolbar renders Search / Status / Export / Refresh / primary action',
    /Input\.Search/.test(listToolbar) && /onStatusChange/.test(listToolbar) && /onExport/.test(listToolbar) && /onRefresh/.test(listToolbar) && /primaryAction/.test(listToolbar));

  // ── (e) dedicated Import still exists ────────────────────────────────────
  const preload = read('src/backend/preload.js');
  const qbImport = read('src/frontend/src/components/accountant/QBImport.js');
  const vendorCenter = read('src/frontend/src/components/vendors/VendorCenter.js');
  ok('importCustomersCsv IPC still exposed', /importCustomersCsv:/.test(preload));
  ok('the dedicated Import page still imports customers', /importCustomersCsv/.test(qbImport) && /customers/.test(qbImport));
  ok('VendorCenter import is untouched', /CsvImportModal/.test(vendorCenter));

  fs.rmSync(tmp, { recursive: true, force: true });

  console.log('\n' + '='.repeat(56));
  console.log(pass + ' passed, ' + fail + ' failed');
  console.log('='.repeat(56) + '\n');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e && e.stack ? e.stack : e); process.exit(1); });
