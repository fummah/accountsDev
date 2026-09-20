/**
 * verify-deposit-party.js — Manual Deposit Customer/Vendor persistence.
 *
 * The relationship is stored per allocation LINE, by unique id + type
 * (customer/vendor), and hydrated back into the edit form. Runs against a
 * SCRATCH COPY (scripts/lib/testDb.js); the live company file is never touched.
 */
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const Module = require('module');

const electronStub = { ipcMain: { handle: () => {} }, app: { isPackaged: true } };
const originalLoad = Module._load;
Module._load = function (request) { if (request === 'electron') return electronStub; return originalLoad.apply(this, arguments); };

require('./lib/testDb.js').useScratchCopy({ label: 'verify-deposit-party' });
const ROOT = path.join(__dirname, '..');
const models = require(path.join(ROOT, 'src', 'backend', 'models', 'index.js'));
const Deposits = require(path.join(ROOT, 'src', 'backend', 'models', 'deposits.js'));
const db = require(path.join(ROOT, 'src', 'backend', 'models', 'dbmgr.js')).raw;

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9;

console.log('\n=== Manual Deposit party persistence ===');

// ── fixtures ──────────────────────────────────────────────────────────────
const cust = db.prepare("SELECT id, COALESCE(NULLIF(display_name,''), NULLIF(company_name,''), TRIM(first_name||' '||last_name)) AS name FROM customers WHERE status IS NULL OR status='Active' ORDER BY id LIMIT 1").get();
const cust2 = db.prepare("SELECT id, COALESCE(NULLIF(display_name,''), NULLIF(company_name,''), TRIM(first_name||' '||last_name)) AS name FROM customers WHERE id != ? ORDER BY id LIMIT 1").get(cust.id);
const vend = db.prepare("SELECT id, COALESCE(NULLIF(display_name,''), NULLIF(company_name,''), TRIM(first_name||' '||last_name)) AS name FROM suppliers ORDER BY id LIMIT 1").get();
let bank = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type)='bank' AND status='Active' ORDER BY id LIMIT 1").get();
if (!bank) {
  const ins = db.prepare("INSERT INTO chart_of_accounts (name, type, status, isSystem) VALUES ('ZZ Verify Bank','Bank','Active',0)").run();
  bank = { id: Number(ins.lastInsertRowid) };
}
const income = db.prepare("SELECT id FROM chart_of_accounts WHERE status='Active' AND LOWER(type) IN ('income','other income') ORDER BY id LIMIT 1").get()
  || db.prepare("SELECT id FROM chart_of_accounts WHERE status='Active' ORDER BY id LIMIT 1").get();

check('fixtures exist (customer, vendor, bank, category account)',
  !!(cust && vend && bank && income && cust2), JSON.stringify({ cust, vend, bank, income }));

// ── create with a Customer line and a Vendor line ─────────────────────────
const created = Deposits.create({
  bankAccountId: bank.id, date: '2026-06-01', reference: 'VERIFY-DEP-PARTY', memo: 'party test',
  paymentIds: [],
  allocations: [
    { accountId: income.id, amount: 890, description: 'Line 1', partyType: 'customer', partyId: cust.id },
    { accountId: income.id, amount: 90, description: 'Line 2', partyType: 'vendor', partyId: vend.id },
  ],
});
check('create succeeds', created && created.success, JSON.stringify(created));
const depId = created.id;

const rows = db.prepare('SELECT * FROM deposit_allocations WHERE deposit_id = ? ORDER BY id').all(depId);
check('two allocation lines persisted', rows.length === 2, rows.length);
check('line 1 stores party_type=customer + party_id', rows[0].party_type === 'customer' && Number(rows[0].party_id) === Number(cust.id), JSON.stringify(rows[0]));
check('line 2 stores party_type=vendor + party_id', rows[1].party_type === 'vendor' && Number(rows[1].party_id) === Number(vend.id), JSON.stringify(rows[1]));
check('party id is a real FK value, not a name', !isNaN(Number(rows[0].party_id)));

// ── read back (the edit API) ──────────────────────────────────────────────
let dep = Deposits.getById(depId);
check('getById returns the allocations', Array.isArray(dep.allocations) && dep.allocations.length === 2);
check('line 1 returns party_type/party_id for hydration',
  dep.allocations[0].party_type === 'customer' && Number(dep.allocations[0].party_id) === Number(cust.id));
check('line 1 returns the resolved party_name (a label for the selector)',
  !!dep.allocations[0].party_name, dep.allocations[0].party_name);
check('line 2 returns the vendor name', !!dep.allocations[1].party_name, dep.allocations[1].party_name);
check('total is the sum of the lines (980)', near(dep.total_amount, 980), dep.total_amount);

// ── update: change ONLY the amount, keep the party ────────────────────────
Deposits.update(depId, {
  bankAccountId: bank.id, date: '2026-06-01', reference: 'VERIFY-DEP-PARTY', memo: 'party test',
  paymentIds: [],
  allocations: [
    { accountId: income.id, amount: 950, description: 'Line 1', partyType: 'customer', partyId: cust.id },
    { accountId: income.id, amount: 90, description: 'Line 2', partyType: 'vendor', partyId: vend.id },
  ],
});
dep = Deposits.getById(depId);
check('edit amount only -> customer preserved', dep.allocations[0].party_type === 'customer' && Number(dep.allocations[0].party_id) === Number(cust.id), JSON.stringify(dep.allocations[0]));
check('edit amount only -> vendor preserved', dep.allocations[1].party_type === 'vendor' && Number(dep.allocations[1].party_id) === Number(vend.id));
check('edit amount only -> total updated to 1040', near(dep.total_amount, 1040), dep.total_amount);

// ── switch Customer -> Vendor on a line (XOR: old relation cleared) ────────
Deposits.update(depId, {
  bankAccountId: bank.id, date: '2026-06-01', reference: 'VERIFY-DEP-PARTY', memo: 'party test',
  paymentIds: [],
  allocations: [
    { accountId: income.id, amount: 950, description: 'Line 1', partyType: 'vendor', partyId: vend.id },
    { accountId: income.id, amount: 90, description: 'Line 2', partyType: 'vendor', partyId: vend.id },
  ],
});
dep = Deposits.getById(depId);
check('customer -> vendor: line 1 is now the vendor', dep.allocations[0].party_type === 'vendor' && Number(dep.allocations[0].party_id) === Number(vend.id), JSON.stringify(dep.allocations[0]));
check('customer -> vendor: no stale customer id remains', dep.allocations[0].party_type !== 'customer');

// ── change Customer on a line ─────────────────────────────────────────────
Deposits.update(depId, {
  bankAccountId: bank.id, date: '2026-06-01', reference: 'VERIFY-DEP-PARTY', memo: 'party test',
  paymentIds: [],
  allocations: [
    { accountId: income.id, amount: 950, description: 'Line 1', partyType: 'customer', partyId: cust2.id },
    { accountId: income.id, amount: 90, description: 'Line 2', partyType: 'vendor', partyId: vend.id },
  ],
});
dep = Deposits.getById(depId);
check('change customer -> new customer id stored', dep.allocations[0].party_type === 'customer' && Number(dep.allocations[0].party_id) === Number(cust2.id), JSON.stringify(dep.allocations[0]));

// ── delete a line: its party goes with it ─────────────────────────────────
Deposits.update(depId, {
  bankAccountId: bank.id, date: '2026-06-01', reference: 'VERIFY-DEP-PARTY', memo: 'party test',
  paymentIds: [],
  allocations: [{ accountId: income.id, amount: 950, description: 'Line 1', partyType: 'customer', partyId: cust2.id }],
});
dep = Deposits.getById(depId);
check('deleted line leaves no orphan allocation row', dep.allocations.length === 1, dep.allocations.length);
check('remaining line keeps its customer', dep.allocations[0].party_type === 'customer' && Number(dep.allocations[0].party_id) === Number(cust2.id));

// ── XOR enforcement: both a customer AND a vendor supplied -> neither ─────
const bothRes = Deposits.create({
  bankAccountId: bank.id, date: '2026-06-02', reference: 'VERIFY-DEP-XOR', memo: 'xor',
  paymentIds: [],
  allocations: [{ accountId: income.id, amount: 10, description: 'ambiguous', customerId: cust.id, vendorId: vend.id }],
});
const xorRow = db.prepare('SELECT party_type, party_id FROM deposit_allocations WHERE deposit_id = ?').get(bothRes.id);
check('an ambiguous line (customer AND vendor) stores NEITHER party', xorRow.party_type == null && xorRow.party_id == null, JSON.stringify(xorRow));

// ── legacy row: no party persisted -> blank, never guessed ────────────────
db.prepare('INSERT INTO deposit_allocations (deposit_id, account_id, amount, description) VALUES (?, ?, ?, ?)')
  .run(depId, income.id, 5, 'Legacy Name — old text');
const legacy = Deposits.getById(depId).allocations.find(a => a.description === 'Legacy Name — old text');
check('legacy line reads back with no party', legacy && legacy.party_type == null && legacy.party_name == null, JSON.stringify(legacy));
check('legacy line keeps its description text', legacy && legacy.description === 'Legacy Name — old text');

// ── source wiring ─────────────────────────────────────────────────────────
const ui = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'src', 'components', 'banking', 'Deposits.js'), 'utf8');
check('the selector value is a TYPE+ID key, never a name', /value=\{partyKeyOf\(a\.partyType, a\.partyId\)\}/.test(ui));
check('the selector option value is the payor key', /<Option key=\{o\.value\} value=\{o\.value\}>/.test(ui));
check('submit sends partyType + partyId per line', /partyType: a\.partyType \|\| null/.test(ui) && /partyId: a\.partyId \|\| null/.test(ui));
check('submit no longer folds the name into the description', !/\[a\.receivedFrom/.test(ui));
check('edit hydrates partyType + partyId from the saved row', /partyType: type/.test(ui) && /partyName: a\.party_name/.test(ui));
check('edit no longer blanks the party (no `receivedFrom: \'\'`)', !/receivedFrom: ''/.test(ui));
check('the detail view shows a Customer/Vendor column', /title: 'Customer\/Vendor'/.test(ui));
check('async options are synthesised so a saved id is never blank',
  /a\.partyName \|\| `\$\{a\.partyType === 'customer' \? 'Customer' : 'Vendor'\} #\$\{a\.partyId\}`/.test(ui));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
