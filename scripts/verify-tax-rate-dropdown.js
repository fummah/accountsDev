/**
 * Tax Rate Dropdown Lifecycle Tests
 *
 * Tests the 5 scenarios from the Default Tax Rate implementation spec:
 *
 *   1. Create saved tax rate 6%. It appears in dropdown.
 *   2. Choose rate and save Customer. Reopen. Same rate selected.
 *   3. Rename Tax Rate. Customer still references same ID and new name displays.
 *   4. Delete/deactivate rate. Follow existing referential/inactive handling.
 *   5. Non-taxable customer behavior remains correct.
 *
 * Plus:
 *   6.  Vendor tax rate parity (same lifecycle on a supplier).
 *   7.  Legacy data backfill (numeric rate → linked ID where unique).
 *   8.  The shared frontend rule (utils/taxRate.js) — store the ID, display the label.
 *   9.  Clearing the rate clears BOTH columns (regression: the stale snapshot).
 *   10. Non-taxable clears both even with a stale selection.
 *   11. A deleted rate is preserved, not silently dropped.
 *   12. Reopening a record selects the right option (id, legacy match, ambiguous).
 *
 * Run with:
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/verify-tax-rate-dropdown.js
 */

const path = require('path');
const fs = require('fs');
const Module = require('module');

// ── stub electron BEFORE the handlers are required ──────────────────────────
const handlers = new Map();
const electronStub = {
  ipcMain: {
    handle: (channel, fn) => {
      if (handlers.has(channel)) throw new Error("Attempted to register a second handler for '" + channel + "'");
      handlers.set(channel, fn);
    },
  },
};
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

// ── tiny harness ────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  [PASS] ${label}`); }
  else { failed++; console.log(`  [FAIL] ${label}\n      expected: ${e}\n      actual:   ${a}`); }
}
function ok(label, cond, detail) {
  check(label, !!cond, true);
  if (!cond && detail) console.log(`      detail: ${detail}`);
}

const fakeEvent = { sender: { id: 'test-sender' } };
const created = { vatRates: [], customers: [], suppliers: [] };

function cleanup() {
  try {
    for (const id of created.customers) db.prepare('DELETE FROM customers WHERE id = ?').run(id);
    for (const id of created.suppliers) db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
    for (const id of created.vatRates) db.prepare('DELETE FROM vat WHERE id = ?').run(id);
  } catch (e) { console.log('  [warn] cleanup:', e.message); }
}

// IPC invoke helpers (call the real handler)
const invoke = async (channel, ...args) => handlers.get(channel)(fakeEvent, ...args);

// ── Test 1: Create saved tax rate; it appears in getAllVat ─────────────────
async function test1_createTaxRate() {
  console.log('\nTest 1: Create saved tax rate 6% — appears in dropdown\n');
  const res = await invoke('insert-vat', 'PA Sales Tax', 6, 'test');
  ok('handler reports success', res && res.success !== false, JSON.stringify(res));

  const allVat = await invoke('get-vat');
  const arr = Array.isArray(allVat) ? allVat : [];
  const rate = arr.find(v => v.vat_name === 'PA Sales Tax' && Number(v.vat_percentage) === 6);
  ok('tax rate appears in getAllVat', !!rate);
  if (rate) {
    test1_vatId = Number(rate.id);
    created.vatRates.push(test1_vatId);
  }
  check('vat_percentage is 6', rate ? Number(rate.vat_percentage) : null, 6);
  check('vat_name is correct', rate ? rate.vat_name : null, 'PA Sales Tax');
}

// ── Test 2: Choose rate, save Customer, reopen, same rate selected ──────────
async function test2_saveAndReopenCustomer() {
  console.log('\nTest 2: Choose rate, save Customer, reopen — same rate selected\n');
  if (!test1_vatId) { console.log('  [SKIP] no VAT rate from test 1'); failed++; return; }

  const res = await invoke('insert-customer',
    '', 'TaxTest', '', 'Customer', '', 'tax-test@example.invalid',
    'Tax Test Customer', 'Tax Co', '', '', '', '', '', '', '', '', '', '', '',
    '', '', 'test', 0, null, 'Email', 'en', 'en', 'tax test notes',
    true, 6, test1_vatId);
  ok('customer insert success', res && res.success !== false, JSON.stringify(res));

  const allCust = await invoke('get-customers');
  const arr = Array.isArray(allCust) ? allCust : (allCust?.all || allCust?.data || []);
  const cust = arr.find(c => c.first_name === 'TaxTest');
  ok('customer found in list', !!cust);
  if (!cust) return;
  created.customers.push(Number(cust.id));
  test2_customerId = Number(cust.id);

  check('default_tax_rate_id stored', Number(cust.default_tax_rate_id), test1_vatId);
  check('default_tax_rate (percentage snapshot)', Number(cust.default_tax_rate), 6);
  check('taxable is true', Number(cust.taxable), 1);

  // Reopen via getSingleCustomer
  const single = await invoke('get-singleCustomer', test2_customerId);
  ok('single customer found', !!single);
  if (single) {
    check('reopen: same rate ID', Number(single.default_tax_rate_id), test1_vatId);
    check('reopen: taxable still true', Number(single.taxable), 1);
  }
}

// ── Test 3: Rename Tax Rate; customer still references same ID ──────────────
async function test3_renameTaxRate() {
  console.log('\nTest 3: Rename Tax Rate — customer still references same ID\n');
  if (!test1_vatId || !test2_customerId) { console.log('  [SKIP] missing test data'); failed++; return; }

  // Rename the VAT rate
  await invoke('updatevat', { id: test1_vatId, vat_name: 'PA State Tax', vat_percentage: 6 });

  const allVat = await invoke('get-vat');
  const arr = Array.isArray(allVat) ? allVat : [];
  const renamed = arr.find(v => Number(v.id) === test1_vatId);
  check('vat_name updated to PA State Tax', renamed ? renamed.vat_name : null, 'PA State Tax');
  check('vat_percentage unchanged at 6', renamed ? Number(renamed.vat_percentage) : null, 6);

  // Customer still references the same ID
  const single = await invoke('get-singleCustomer', test2_customerId);
  ok('customer still found', !!single);
  if (single) {
    check('customer default_tax_rate_id unchanged (same reference)', Number(single.default_tax_rate_id), test1_vatId);
    // The display would now show "PA State Tax (6%)" instead of "PA Sales Tax (6%)"
    // because the relationship is by ID, not by name
    const displayRate = arr.find(v => Number(v.id) === Number(single.default_tax_rate_id));
    check('display label uses new name', displayRate ? displayRate.vat_name : null, 'PA State Tax');
  }
}

// ── Test 4: Delete rate; referential handling ───────────────────────────────
async function test4_deleteRate() {
  console.log('\nTest 4: Delete/deactivate rate — referential handling\n');
  if (!test1_vatId || !test2_customerId) { console.log('  [SKIP] missing test data'); failed++; return; }

  // Delete the VAT rate
  const res = await invoke('deletingrecord', test1_vatId, 'vat');
  ok('delete handler reports success', res && res.success !== false, JSON.stringify(res));

  // Rate is gone from getAllVat
  const allVat = await invoke('get-vat');
  const arr = Array.isArray(allVat) ? allVat : [];
  const deleted = arr.find(v => Number(v.id) === test1_vatId);
  ok('rate no longer in getAllVat', !deleted);

  // Customer still exists and still has the ID reference (it's a soft reference,
  // not a foreign key constraint). The UI should handle the dangling reference
  // gracefully (e.g. "Deleted rate #N").
  const single = await invoke('get-singleCustomer', test2_customerId);
  ok('customer still exists after rate deleted', !!single);
  if (single) {
    check('customer default_tax_rate_id still set (dangling reference preserved)', Number(single.default_tax_rate_id), test1_vatId);
    // The display label would show "Deleted rate #N" because the ID no longer
    // resolves to a saved VAT rate
  }
  // Remove from cleanup since we already deleted it
  created.vatRates = created.vatRates.filter(id => id !== test1_vatId);
}

// ── Test 5: Non-taxable customer behavior ───────────────────────────────────
async function test5_nonTaxable() {
  console.log('\nTest 5: Non-taxable customer behavior\n');

  // Insert a non-taxable customer with a tax rate (should still be stored,
  // but the UI disables/clears the dropdown — the backend doesn't enforce
  // the combination, the UI does)
  const res = await invoke('insert-customer',
    '', 'NonTax', '', 'Customer', '', 'nontax@example.invalid',
    'Non-Tax Customer', 'NonTax Co', '', '', '', '', '', '', '', '', '', '', '',
    '', '', 'test', 0, null, 'Email', 'en', 'en', 'non-tax notes',
    false, null, null);
  ok('non-taxable customer insert success', res && res.success !== false, JSON.stringify(res));

  const allCust = await invoke('get-customers');
  const arr = Array.isArray(allCust) ? allCust : (allCust?.all || allCust?.data || []);
  const cust = arr.find(c => c.first_name === 'NonTax');
  ok('non-taxable customer found', !!cust);
  if (cust) {
    created.customers.push(Number(cust.id));
    check('taxable is false (0)', Number(cust.taxable), 0);
    check('default_tax_rate is null', cust.default_tax_rate, null);
    check('default_tax_rate_id is null', cust.default_tax_rate_id, null);
  }

  // Update to taxable with a rate, then switch back to non-taxable (clears rate)
  if (cust) {
    const custId = Number(cust.id);
    // Create a fresh VAT rate for this test
    const vatRes = await invoke('insert-vat', 'VAT 15', 15, 'test');
    const allVat = await invoke('get-vat');
    const vatArr = Array.isArray(allVat) ? allVat : [];
    const vat15 = vatArr.find(v => v.vat_name === 'VAT 15' && Number(v.vat_percentage) === 15);
    ok('VAT 15 rate created for non-taxable test', !!vat15);
    if (vat15) {
      created.vatRates.push(Number(vat15.id));
      const vatId = Number(vat15.id);

      // Update customer to taxable with rate
      await invoke('updatecustomer', {
        id: custId, taxable: true, default_tax_rate: 15, default_tax_rate_id: vatId,
      });
      const updated = await invoke('get-singleCustomer', custId);
      check('after update: taxable is true', Number(updated.taxable), 1);
      check('after update: rate ID set', Number(updated.default_tax_rate_id), vatId);

      // Switch to non-taxable (clears rate — the UI does this via the
      // TaxSettingsSection conditional logic, and the save handler passes
      // null for the rate when taxable is false)
      await invoke('updatecustomer', {
        id: custId, taxable: false, default_tax_rate: null, default_tax_rate_id: null,
      });
      const after = await invoke('get-singleCustomer', custId);
      check('after non-taxable switch: taxable is false', Number(after.taxable), 0);
      check('after non-taxable switch: rate ID cleared', after.default_tax_rate_id, null);
      check('after non-taxable switch: rate cleared', after.default_tax_rate, null);
    }
  }
}

// ── Test 6: Vendor tax rate parity ──────────────────────────────────────────
async function test6_vendorTaxRate() {
  console.log('\nTest 6: Vendor tax rate parity\n');

  // Create a VAT rate for the vendor test
  const vatRes = await invoke('insert-vat', 'Vendor Tax', 8, 'test');
  const allVat = await invoke('get-vat');
  const vatArr = Array.isArray(allVat) ? allVat : [];
  const vendorTax = vatArr.find(v => v.vat_name === 'Vendor Tax' && Number(v.vat_percentage) === 8);
  ok('vendor tax rate created', !!vendorTax);
  if (!vendorTax) { failed++; return; }
  created.vatRates.push(Number(vendorTax.id));
  const vatId = Number(vendorTax.id);

  // Insert a vendor with tax rate
  const res = await invoke('insert-supplier',
    '', 'VendTax', '', 'Test', '', 'vendtax@example.invalid',
    'Tax Vendor', 'Vendor Co', '', '', '', '', '', '', '', '', '', '', '',
    '', '', '', '', 0, null, 'test', 'vendor tax notes', 'Regular',
    true, 8, vatId);
  ok('vendor insert success', res && res.success !== false, JSON.stringify(res));

  const allSup = await invoke('get-suppliers');
  const arr = Array.isArray(allSup) ? allSup : (allSup?.all || allSup?.data || []);
  const sup = arr.find(s => s.first_name === 'VendTax');
  ok('vendor found in list', !!sup);
  if (sup) {
    created.suppliers.push(Number(sup.id));
    check('vendor default_tax_rate_id stored', Number(sup.default_tax_rate_id), vatId);
    check('vendor default_tax_rate (percentage)', Number(sup.default_tax_rate), 8);
    check('vendor taxable is true', Number(sup.taxable), 1);
  }

  // Reopen via getSingleSupplier
  if (sup) {
    const single = await invoke('get-singleSupplier', Number(sup.id));
    ok('single vendor found', !!single);
    if (single) {
      check('reopen: same rate ID', Number(single.default_tax_rate_id), vatId);
      check('reopen: taxable still true', Number(single.taxable), 1);
    }

    // Update vendor tax rate (switch to non-taxable)
    await invoke('updatesupplier', {
      id: Number(sup.id), taxable: false, default_tax_rate: null, default_tax_rate_id: null,
    });
    const after = await invoke('get-singleSupplier', Number(sup.id));
    check('after non-taxable: vendor taxable is false', Number(after.taxable), 0);
    check('after non-taxable: vendor rate ID cleared', after.default_tax_rate_id, null);
  }
}

// ── Test 7: Legacy data backfill ─────────────────────────────────────────────
async function test7_legacyBackfill() {
  console.log('\nTest 7: Legacy data backfill (numeric rate → linked ID)\n');

  // Create a VAT rate
  const vatRes = await invoke('insert-vat', 'Legacy Match', 7, 'test');
  const allVat = await invoke('get-vat');
  const vatArr = Array.isArray(allVat) ? allVat : [];
  const legacyRate = vatArr.find(v => v.vat_name === 'Legacy Match' && Number(v.vat_percentage) === 7);
  ok('legacy match VAT rate created', !!legacyRate);
  if (!legacyRate) { failed++; return; }
  created.vatRates.push(Number(legacyRate.id));
  const vatId = Number(legacyRate.id);

  // Insert a customer with a numeric default_tax_rate but NO default_tax_rate_id
  // (simulating a legacy record). We do this by inserting directly via the model
  // with undefined for the ID param.
  const res = await invoke('insert-customer',
    '', 'LegacyCust', '', 'Backfill', '', 'legacy@example.invalid',
    'Legacy Customer', 'Legacy Co', '', '', '', '', '', '', '', '', '', '', '',
    '', '', 'test', 0, null, 'Email', 'en', 'en', 'legacy notes',
    true, 7, undefined); // undefined for default_tax_rate_id — simulates legacy
  ok('legacy customer insert success', res && res.success !== false, JSON.stringify(res));

  const allCust = await invoke('get-customers');
  const arr = Array.isArray(allCust) ? allCust : (allCust?.all || allCust?.data || []);
  const legacyCust = arr.find(c => c.first_name === 'LegacyCust');
  ok('legacy customer found', !!legacyCust);
  if (!legacyCust) return;
  created.customers.push(Number(legacyCust.id));

  check('legacy: default_tax_rate has numeric value', Number(legacyCust.default_tax_rate), 7);
  ok('legacy: default_tax_rate_id is null (before backfill)', legacyCust.default_tax_rate_id == null);

  // Run the on-demand backfill
  const Customers = require('../src/backend/models/customers.js');
  const result = Customers.linkLegacyTaxRates();
  ok('backfill ran without error', !result.error, JSON.stringify(result));
  check('backfill: linked count >= 1', result.linked >= 1, true);

  // Verify the customer now has the linked ID
  const after = await invoke('get-singleCustomer', Number(legacyCust.id));
  check('after backfill: default_tax_rate_id linked', Number(after.default_tax_rate_id), vatId);
  check('after backfill: default_tax_rate preserved (not lost)', Number(after.default_tax_rate), 7);
}

// ── UI layer ─────────────────────────────────────────────────────────────────
//
// The tests above exercise the BACKEND. They pass even when the forms send the
// wrong thing, which is exactly how the bug this section guards against went
// unnoticed: CustomerDetails sent `undefined` for the percentage snapshot when
// the dropdown was cleared, the backend read that as "field not supplied" and
// kept the old number, and the detail page — which falls back to that number
// when the id is null — put the cleared rate straight back on screen.
//
// So these tests load the real frontend module (src/frontend/src/utils/taxRate.js)
// through CRA's own Babel preset and drive it directly.

const FRONTEND = path.join(__dirname, '..', 'src', 'frontend');
const TAX_UTIL = path.join(FRONTEND, 'src', 'utils', 'taxRate.js');

function loadTaxUtil() {
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  const babel = require(path.join(FRONTEND, 'node_modules', '@babel', 'core'));
  const src = fs.readFileSync(TAX_UTIL, 'utf8');
  const { code } = babel.transformSync(src, {
    presets: [require.resolve(path.join(FRONTEND, 'node_modules', 'babel-preset-react-app'))],
    babelrc: false,
    configFile: false,
    filename: TAX_UTIL,
  });
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
  return mod.exports;
}

const TaxUtil = loadTaxUtil();
const RATES = [
  { id: 1, vat_name: 'No Tax', vat_percentage: 0 },
  { id: 2, vat_name: 'PA Sales Tax', vat_percentage: 6 },
  { id: 3, vat_name: 'VAT', vat_percentage: 15 },
];

/**
 * Canonical form of a resolveTaxRateFields result that DISTINGUISHES the three
 * meanings the backend cares about: a number, null (clear it), and undefined
 * (leave the stored snapshot alone). JSON.stringify alone cannot — it drops
 * undefined-valued keys.
 */
const canon = (o) => {
  const rate = !('default_tax_rate' in o)
    ? 'ABSENT'
    : o.default_tax_rate === undefined
      ? 'undefined(keep)'
      : JSON.stringify(o.default_tax_rate);
  return `{rate=${rate}, id=${JSON.stringify(o.default_tax_rate_id)}}`;
};

// ── Test 8: the shared rule — store the ID, never the label ─────────────────
async function test8_sharedRule() {
  console.log('\nTest 8: Shared rule — store the ID, display the label\n');

  check('label format matches the spec', TaxUtil.taxRateLabel(RATES[1]), 'PA Sales Tax (6%)');
  check('0% rate still labelled', TaxUtil.taxRateLabel(RATES[0]), 'No Tax (0%)');
  check('15% rate labelled', TaxUtil.taxRateLabel(RATES[2]), 'VAT (15%)');

  // Selected rate -> id stored, percentage snapshotted alongside.
  check('selected rate stores id + snapshot',
    canon(TaxUtil.resolveTaxRateFields({ taxable: true, default_tax_rate_id: 2 }, RATES)),
    canon({ default_tax_rate: 6, default_tax_rate_id: 2 }));

  // A string id (what an antd Select hands back for some options) still resolves.
  check('string id resolves the same way',
    canon(TaxUtil.resolveTaxRateFields({ taxable: true, default_tax_rate_id: '3' }, RATES)),
    canon({ default_tax_rate: 15, default_tax_rate_id: 3 }));
}

// ── Test 9: clearing the rate clears BOTH columns (the regression) ──────────
async function test9_clearingClearsBoth() {
  console.log('\nTest 9: Clearing the rate clears both columns (regression)\n');

  // The unit-level rule.
  check('cleared dropdown -> both cleared',
    canon(TaxUtil.resolveTaxRateFields({ taxable: true, default_tax_rate_id: undefined }, RATES)),
    canon({ default_tax_rate: null, default_tax_rate_id: null }));
  check('never set -> both cleared',
    canon(TaxUtil.resolveTaxRateFields({ taxable: true }, RATES)),
    canon({ default_tax_rate: null, default_tax_rate_id: null }));
  check('null id -> both cleared',
    canon(TaxUtil.resolveTaxRateFields({ taxable: true, default_tax_rate_id: null }, RATES)),
    canon({ default_tax_rate: null, default_tax_rate_id: null }));

  // End-to-end through the real handler, simulating the CustomerDetails edit
  // form: the customer is on a rate, the user clears the dropdown, and saves.
  const vatId = RATES[1].id;
  await invoke('insert-customer',
    '', 'ClearTest', '', 'Customer', '', 'clear@example.invalid',
    'Clear Test', 'Clear Co', '', '', '', '', '', '', '', '', '', '', '',
    '', '', 'test', 0, null, 'Email', 'en', 'en', '',
    true, 6, vatId);
  const all = await invoke('get-customers');
  const arr = Array.isArray(all) ? all : (all?.all || []);
  const cust = arr.find(c => c.first_name === 'ClearTest');
  ok('customer seeded on a rate', !!cust);
  if (!cust) return;
  const custId = Number(cust.id);
  created.customers.push(custId);
  check('seeded: id set', Number(cust.default_tax_rate_id), vatId);
  check('seeded: snapshot set', Number(cust.default_tax_rate), 6);

  // This is what the form now sends after clearing the dropdown.
  const fields = TaxUtil.resolveTaxRateFields({ taxable: true, default_tax_rate_id: undefined }, RATES);
  await invoke('updatecustomer', { id: custId, ...fields });

  const after = await invoke('get-singleCustomer', custId);
  check('after clear: id is null', after.default_tax_rate_id, null);
  check('after clear: snapshot is null (was the bug)', after.default_tax_rate, null);
  check('after clear: displays as None', TaxUtil.describeTaxRate(after, RATES), 'None');
}

// ── Test 10: non-taxable clears both, even with a stale selection ───────────
async function test10_nonTaxableRule() {
  console.log('\nTest 10: Non-taxable clears both (even with a stale selection)\n');

  check('non-taxable with a selection -> both cleared',
    canon(TaxUtil.resolveTaxRateFields({ taxable: false, default_tax_rate_id: 3 }, RATES)),
    canon({ default_tax_rate: null, default_tax_rate_id: null }));
  check('non-taxable with no selection -> both cleared',
    canon(TaxUtil.resolveTaxRateFields({ taxable: false }, RATES)),
    canon({ default_tax_rate: null, default_tax_rate_id: null }));
  check('taxable omitted -> treated as taxable',
    canon(TaxUtil.resolveTaxRateFields({ default_tax_rate_id: 3 }, RATES)),
    canon({ default_tax_rate: 15, default_tax_rate_id: 3 }));
}

// ── Test 11: a deleted rate is preserved, not silently dropped ──────────────
async function test11_danglingPreserved() {
  console.log('\nTest 11: A deleted rate is preserved, not silently dropped\n');

  // Unit: an id that no longer resolves keeps the id and leaves the snapshot.
  check('dangling id -> id kept, snapshot untouched',
    canon(TaxUtil.resolveTaxRateFields({ taxable: true, default_tax_rate_id: 999999 }, RATES)),
    canon({ default_tax_rate: undefined, default_tax_rate_id: 999999 }));

  // End-to-end: edit an unrelated field on a record whose rate was deleted.
  await invoke('insert-customer',
    '', 'DangleTest', '', 'Customer', '', 'dangle@example.invalid',
    'Dangle Test', 'Dangle Co', '', '', '', '', '', '', '', '', '', '', '',
    '', '', 'test', 0, null, 'Email', 'en', 'en', '',
    true, 12, 424242);
  const all = await invoke('get-customers');
  const arr = Array.isArray(all) ? all : (all?.all || []);
  const cust = arr.find(c => c.first_name === 'DangleTest');
  ok('dangling customer seeded', !!cust);
  if (!cust) return;
  const custId = Number(cust.id);
  created.customers.push(custId);

  const fields = TaxUtil.resolveTaxRateFields({ taxable: true, default_tax_rate_id: 424242 }, RATES);
  await invoke('updatecustomer', { id: custId, first_name: 'DangleRenamed', ...fields });

  const after = await invoke('get-singleCustomer', custId);
  check('unrelated edit applied', after.first_name, 'DangleRenamed');
  check('dangling id preserved', Number(after.default_tax_rate_id), 424242);
  check('dangling snapshot preserved', Number(after.default_tax_rate), 12);
  check('dangling renders as Deleted rate', TaxUtil.describeTaxRate(after, RATES), 'Deleted rate #424242');
}

// ── Test 12: reopening a record selects the right option ────────────────────
async function test12_loadExisting() {
  console.log('\nTest 12: Reopening a record selects the right option\n');

  // Stored id wins.
  check('id present -> selected',
    TaxUtil.taxRateFormValue({ default_tax_rate_id: 2, default_tax_rate: 99 }, RATES), 2);

  // Legacy row: a numeric rate but no id, uniquely matching one saved rate.
  check('legacy unique match -> linked',
    TaxUtil.taxRateFormValue({ default_tax_rate_id: null, default_tax_rate: 15 }, RATES), 3);

  // Legacy row with no match at all -> blank, but nothing destroyed.
  check('legacy unmatched -> blank',
    TaxUtil.taxRateFormValue({ default_tax_rate_id: null, default_tax_rate: 4.5 }, RATES), undefined);

  // Ambiguous: two saved rates share the percentage. Must NOT pick a winner.
  const ambiguous = RATES.concat([{ id: 9, vat_name: 'Duplicate 6', vat_percentage: 6 }]);
  check('legacy ambiguous -> blank (never guess)',
    TaxUtil.taxRateFormValue({ default_tax_rate_id: null, default_tax_rate: 6 }, ambiguous), undefined);

  // Nothing stored at all.
  check('nothing stored -> blank',
    TaxUtil.taxRateFormValue({}, RATES), undefined);

  // Display side.
  check('display: id resolves', TaxUtil.describeTaxRate({ default_tax_rate_id: 3 }, RATES), 'VAT (15%)');
  check('display: legacy matched', TaxUtil.describeTaxRate({ default_tax_rate_id: null, default_tax_rate: 6 }, RATES), 'PA Sales Tax (6%)');
  check('display: legacy unmatched', TaxUtil.describeTaxRate({ default_tax_rate_id: null, default_tax_rate: 4.5 }, RATES), '4.5%');
  check('display: nothing', TaxUtil.describeTaxRate({}, RATES), 'None');
}

// ── run all tests ────────────────────────────────────────────────────────────
let test1_vatId = null;
let test2_customerId = null;

(async () => {
  try {
    await test1_createTaxRate();
    await test2_saveAndReopenCustomer();
    await test3_renameTaxRate();
    await test4_deleteRate();
    await test5_nonTaxable();
    await test6_vendorTaxRate();
    await test7_legacyBackfill();
    await test8_sharedRule();
    await test9_clearingClearsBoth();
    await test10_nonTaxableRule();
    await test11_danglingPreserved();
    await test12_loadExisting();
  } catch (e) {
    failed++;
    console.log(`  [FAIL] suite threw: ${e.message}`);
    console.log(e.stack);
  } finally {
    cleanup();
  }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
