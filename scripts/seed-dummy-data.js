/**
 * Seed massive dummy data for Accounting App Demo.
 * Run from project root: node scripts/seed-dummy-data.js
 *
 * Uses the same DB file as the app: src/backend/db/accounts.db
 * Tables must already exist (customers, employees, expenses, quotes, invoices, suppliers, products).
 * This script only inserts data; it does not create tables.
 *
 * Configure counts via env or the COUNTS object below.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// --- Configuration (column mappings follow models in src/backend/models) ---
const COUNTS = {
  customers: parseInt(process.env.SEED_CUSTOMERS, 10) || 30000,
  employees: parseInt(process.env.SEED_EMPLOYEES, 10) || 30000,
  products: parseInt(process.env.SEED_PRODUCTS, 10) || 800,
  suppliers: parseInt(process.env.SEED_SUPPLIERS, 10) || 500,
  invoices: parseInt(process.env.SEED_INVOICES, 10) || 15000,
  quotes: parseInt(process.env.SEED_QUOTES, 10) || 8000,
  expenses: parseInt(process.env.SEED_EXPENSES, 10) || 2000,
};

const DB_PATH = path.resolve(__dirname, '..', 'src', 'backend', 'db', 'accounts.db');

// --- Dummy data pools ---
const TITLES = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof'];
const FIRST_NAMES = [
  'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth',
  'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen',
  'Christopher', 'Nancy', 'Daniel', 'Lisa', 'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra',
  'Donald', 'Ashley', 'Steven', 'Kimberly', 'Paul', 'Emily', 'Andrew', 'Donna', 'Joshua', 'Michelle',
  'Kenneth', 'Dorothy', 'Kevin', 'Carol', 'Brian', 'Amanda', 'George', 'Melissa', 'Timothy', 'Deborah',
];
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
  'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts',
];
const COMPANY_PREFIXES = ['Global', 'Prime', 'Elite', 'Apex', 'Summit', 'Pioneer', 'Vertex', 'Nexus', 'Core', 'Peak'];
const COMPANY_SUFFIXES = ['Solutions', 'Industries', 'Group', 'Ltd', 'Corp', 'Inc', 'Partners', 'Services', 'Trading', 'Enterprises'];
const CITIES = [
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose',
  'Austin', 'Jacksonville', 'Fort Worth', 'Columbus', 'Charlotte', 'San Francisco', 'Indianapolis', 'Seattle', 'Denver', 'Boston',
  'London', 'Manchester', 'Birmingham', 'Leeds', 'Liverpool', 'Bristol', 'Sheffield', 'Edinburgh', 'Cardiff', 'Belfast',
];
const COUNTRIES = ['United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'Ireland', 'Spain'];
const STREET_NAMES = ['Main St', 'Oak Ave', 'Maple Dr', 'Cedar Ln', 'Park Rd', 'Lake View', 'Hill St', 'Valley Rd', 'River Way', 'Forest Ave'];
const PRODUCT_NAMES = [
  'Widget A', 'Widget B', 'Service Package Basic', 'Service Package Pro', 'Consulting Hour', 'License Annual',
  'Hardware Unit X', 'Hardware Unit Y', 'Support Plan', 'Training Session', 'Installation Fee', 'Maintenance Monthly',
  'Software Module A', 'Software Module B', 'API Access', 'Cloud Storage 100GB', 'Cloud Storage 1TB',
  'Subscription Monthly', 'Subscription Yearly', 'Custom Development', 'Audit Report', 'Compliance Check',
];
const PRODUCT_CATEGORIES = ['Goods', 'Services', 'Software', 'Hardware', 'Consulting', 'Subscription'];
const TERMS_OPTIONS = ['Net 15', 'Net 30', 'Net 45', 'Due on receipt', 'Net 60'];
const STATUSES_INV = ['Pending', 'Paid', 'Partially Paid'];
const STATUSES_QUOTE = ['Pending', 'Accepted', 'Invoiced', 'Declined'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickMany(arr, n) { const out = []; for (let i = 0; i < n; i++) out.push(pick(arr)); return out; }
function between(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function dateOffset(daysAgo) {
  const d = new Date(); d.setDate(d.getDate() - daysAgo); return d.toISOString().slice(0, 10);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Tables are not created here; they must already exist (see models folder).

function seedVat(db) {
  const ins = db.prepare('INSERT INTO vat (vat_name, vat_percentage, entered_by) VALUES (?, ?, ?)');
  const existing = db.prepare('SELECT COUNT(*) as c FROM vat').get();
  if (existing.c > 0) return 0;
  ins.run('Standard', 20, 'seed');
  ins.run('Reduced', 5, 'seed');
  return 2;
}

// --- Seed functions: column lists match src/backend/models (customers, employees, suppliers, products, invoices, quotes, expenses) ---

function seedCustomers(db, n) {
  const ins = db.prepare(`INSERT INTO customers (title, first_name, middle_name, last_name, suffix, email, display_name, company_name,
    phone_number, mobile_number, fax, other, website, address1, address2, city, state, postal_code, country, payment_method, terms, tax_number, entered_by, opening_balance, as_of, delivery_option, language, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (let i = 0; i < n; i++) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const company = `${pick(COMPANY_PREFIXES)} ${pick(COMPANY_SUFFIXES)} ${i % 50}`;
    const email = `contact${i}@${company.replace(/\s/g, '').toLowerCase()}.com`;
    const mobile = `+1${between(200, 999)}${between(200, 999)}${between(1000, 9999)}`;
    const addr = `${between(1, 9999)} ${pick(STREET_NAMES)}`;
    const city = pick(CITIES);
    const country = pick(COUNTRIES);
    const postal = String(between(10000, 99999));
    ins.run(
      pick(TITLES), first, '', last, '', email, `${first} ${last}`, company,
      `+1-${between(200, 999)}-${between(200, 999)}-${between(1000, 9999)}`, mobile, '', '', `https://${company.replace(/\s/g, '')}.com`,
      addr, '', city, '', postal, country, 'Bank Transfer', pick(TERMS_OPTIONS), `TAX${i}`, 'seed', 0, null, 'Email', 'en', ''
    );
  }
  return n;
}

function seedProducts(db, n) {
  const ins = db.prepare('INSERT INTO products (type, name, sku, category, description, price, income_account, tax_inclusive, tax, isfromsupplier, entered_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < n; i++) {
    const name = `${pick(PRODUCT_NAMES)} ${i % 20}`;
    const sku = `SKU-${String(i + 1).padStart(5, '0')}`;
    const category = pick(PRODUCT_CATEGORIES);
    const price = Math.round((between(10, 5000) + Math.random() * 100) * 100) / 100;
    ins.run('Product', name, sku, category, `Dummy product ${name}`, price, 'Sales', 'No', '', 'No', 'seed');
  }
  return n;
}

function seedSuppliers(db, n) {
  const ins = db.prepare(`INSERT INTO suppliers (title, first_name, middle_name, last_name, suffix, email, display_name, company_name,
    phone_number, mobile_number, fax, other, website, address1, address2, city, state, postal_code, country, supplier_terms, business_number, account_number, expense_category, opening_balance, as_of, entered_by, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (let i = 0; i < n; i++) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const company = `Supply ${pick(COMPANY_PREFIXES)} ${i % 30}`;
    const email = `supply${i}@${company.replace(/\s/g, '').toLowerCase()}.com`;
    const mobile = `+1${between(200, 999)}${between(200, 999)}${between(1000, 9999)}`;
    const addr = `${between(1, 9999)} ${pick(STREET_NAMES)}`;
    ins.run(
      pick(TITLES), first, '', last, '', email, `${first} ${last}`, company,
      `+1-${between(200, 999)}-${between(200, 999)}-${between(1000, 9999)}`, mobile, '', '', `https://${company.replace(/\s/g, '')}.com`,
      addr, '', pick(CITIES), '', String(between(10000, 99999)), pick(COUNTRIES), pick(TERMS_OPTIONS), `BN${i}`, `ACC${i}`, 'Supplies', 0, null, 'seed', ''
    );
  }
  return n;
}

function seedEmployees(db, n) {
  const ins = db.prepare('INSERT INTO employees (first_name, last_name, mi, email, phone, address, date_hired, entered_by, salary, status, role, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < n; i++) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const email = `emp${i}@company.com`;
    const salary = between(30000, 120000);
    const role = pick(['Staff', 'Manager', 'Admin']);
    ins.run(first, last, '', email, `+1-${between(200, 999)}-${between(200, 999)}-${between(1000, 9999)}`, `${between(1, 999)} ${pick(STREET_NAMES)}`, dateOffset(between(30, 2000)), 'seed', salary, 'Active', role, '[]');
  }
  return n;
}

function seedInvoices(db, n, customerIds, productIds, vatRates) {
  const insInv = db.prepare(`INSERT INTO invoices (customer, customer_email, islater, billing_address, terms, start_date, last_date, message, statement_message, number, entered_by, vat, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insLine = db.prepare('INSERT INTO invoice_lines (invoice_id, product, description, quantity, rate, amount) VALUES (?, ?, ?, ?, ?, ?)');
  const getProduct = db.prepare('SELECT id, price FROM products WHERE id = ?');
  let lastNum = db.prepare('SELECT id FROM invoices ORDER BY id DESC LIMIT 1').get();
  let nextNum = (lastNum ? lastNum.id : 0) + 1;

  const insertMany = db.transaction((total) => {
    for (let i = 0; i < total; i++) {
      const customerId = pick(customerIds);
      const startDate = dateOffset(between(1, 730));
      const lastDate = dateOffset(-between(0, 90));
      const vat = pick(vatRates);
      const numLines = between(1, 5);
      const status = pick(STATUSES_INV);
      const number = `INV-${String(nextNum).padStart(5, '0')}`;
      nextNum++;
      insInv.run(
        customerId, `cust${customerId}@example.com`, '0', `${between(1, 999)} ${pick(STREET_NAMES)}`, pick(TERMS_OPTIONS),
        startDate, lastDate, 'Thank you', '', number, 'seed', vat, status
      );
      const invId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
      let lineTotal = 0;
      for (let L = 0; L < numLines; L++) {
        const productId = pick(productIds);
        const row = getProduct.get(productId);
        const price = row ? row.price : 100;
        const qty = between(1, 20);
        const amount = Math.round(price * 100) / 100;
        lineTotal += amount * qty;
        insLine.run(invId, productId, `Line ${L + 1}`, qty, String(amount), amount);
      }
      const balance = Math.round(lineTotal * (1 + vat / 100) * 100) / 100;
      db.prepare('UPDATE invoices SET balance = ? WHERE id = ?').run(balance, invId);
    }
  });
  insertMany(n);
  return n;
}

function seedQuotes(db, n, customerIds, productIds, vatRates) {
  const insQuote = db.prepare(`INSERT INTO quotes (status, customer, customer_email, islater, billing_address, start_date, last_date, message, statement_message, number, entered_by, vat)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insLine = db.prepare('INSERT INTO quote_lines (quote_id, product, description, quantity, rate, amount) VALUES (?, ?, ?, ?, ?, ?)');
  const getProduct = db.prepare('SELECT id, price FROM products WHERE id = ?');
  let lastNum = db.prepare('SELECT id FROM quotes ORDER BY id DESC LIMIT 1').get();
  let nextNum = (lastNum ? lastNum.id : 0) + 1;

  const insertMany = db.transaction((total) => {
    for (let i = 0; i < total; i++) {
      const customerId = pick(customerIds);
      const startDate = dateOffset(between(1, 365));
      const lastDate = dateOffset(-between(0, 60));
      const vat = pick(vatRates);
      const numLines = between(1, 4);
      const status = pick(STATUSES_QUOTE);
      const number = `QUO-${String(nextNum).padStart(5, '0')}`;
      nextNum++;
      insQuote.run(
        status, customerId, `cust${customerId}@example.com`, '0', `${between(1, 999)} ${pick(STREET_NAMES)}`,
        startDate, lastDate, 'Quote message', '', number, 'seed', vat
      );
      const quoteId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
      for (let L = 0; L < numLines; L++) {
        const productId = pick(productIds);
        const row = getProduct.get(productId);
        const price = row ? row.price : 100;
        const qty = between(1, 15);
        const amount = Math.round(price * 100) / 100;
        insLine.run(quoteId, productId, `Line ${L + 1}`, qty, String(amount), amount);
      }
    }
  });
  insertMany(n);
  return n;
}

function seedExpenses(db, n, supplierIds, employeeIds) {
  const insExp = db.prepare('INSERT INTO expenses (payee, payment_account, payment_date, payment_method, ref_no, category, entered_by, approval_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insLine = db.prepare('INSERT INTO expense_lines (expense_id, category, description, amount) VALUES (?, ?, ?, ?)');
  const categories = ['supplier', 'employee', 'supplier'];
  const payees = [...supplierIds, ...employeeIds];

  const insertMany = db.transaction((total) => {
    for (let i = 0; i < total; i++) {
      const category = pick(categories);
      const payee = category === 'supplier' ? pick(supplierIds) : pick(employeeIds);
      const paymentDate = dateOffset(between(1, 400));
      insExp.run(payee, 'Bank Account', paymentDate, 'Bank Transfer', `REF-${i + 1}`, category, 'seed', pick(['Pending', 'Paid']));
      const expId = db.prepare('SELECT last_insert_rowid() AS id').get().id;
      const numLines = between(1, 3);
      for (let L = 0; L < numLines; L++) {
        const amt = Math.round((between(20, 2000) + Math.random() * 50) * 100) / 100;
        insLine.run(expId, 'Office', `Expense line ${L + 1}`, amt);
      }
    }
  });
  insertMany(n);
  return n;
}

// Drop sync/change-log triggers so bulk INSERTs don't fire them (they use NEW/OLD and can error if change_log is missing or schema differs).
function dropBulkInsertTriggers(db) {
  const tables = ['customers', 'products', 'suppliers', 'employees', 'invoices', 'invoice_lines', 'quotes', 'quote_lines', 'expenses', 'expense_lines', 'vat'];
  for (const name of tables) {
    try {
      db.exec(`DROP TRIGGER IF EXISTS trg_${name}_ai_change; DROP TRIGGER IF EXISTS trg_${name}_au_change; DROP TRIGGER IF EXISTS trg_${name}_ad_change; DROP TRIGGER IF EXISTS trg_${name}_bu_lock; DROP TRIGGER IF EXISTS trg_${name}_bd_lock;`);
    } catch (_) { /* ignore */ }
  }
}

function runSeed(db, countsOverride = {}) {
  const counts = { ...COUNTS, ...countsOverride };
  dropBulkInsertTriggers(db);

  let v = seedVat(db);
  const nCustomers = seedCustomers(db, counts.customers);
  const customerIds = db.prepare('SELECT id FROM customers ORDER BY id').all().map(r => r.id);
  const nProducts = seedProducts(db, counts.products);
  const productIds = db.prepare('SELECT id FROM products ORDER BY id').all().map(r => r.id);
  const nSuppliers = seedSuppliers(db, counts.suppliers);
  const supplierIds = db.prepare('SELECT id FROM suppliers ORDER BY id').all().map(r => r.id);
  const nEmployees = seedEmployees(db, counts.employees);
  const employeeIds = db.prepare('SELECT id FROM employees ORDER BY id').all().map(r => r.id);

  const vatRates = db.prepare('SELECT vat_percentage FROM vat').all().map(r => r.vat_percentage);
  if (vatRates.length === 0) vatRates.push(0, 20);

  const nInvoices = seedInvoices(db, counts.invoices, customerIds, productIds, vatRates);
  const nQuotes = seedQuotes(db, counts.quotes, customerIds, productIds, vatRates);
  const nExpenses = seedExpenses(db, counts.expenses, supplierIds, employeeIds);

  return {
    vat: v,
    customers: nCustomers,
    products: nProducts,
    suppliers: nSuppliers,
    employees: nEmployees,
    invoices: nInvoices,
    quotes: nQuotes,
    expenses: nExpenses,
  };
}

function main() {
  console.log('Seed DB path:', DB_PATH);
  console.log('Counts:', COUNTS);
  ensureDir(path.dirname(DB_PATH));

  const db = new Database(DB_PATH);
  if (db.pragma) {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
  }

  try {
    console.log('Populating existing tables...');
    const summary = runSeed(db, COUNTS);
    console.log('\nDone. Summary:', summary);
  } finally {
    if (db.close) db.close();
  }
}

if (typeof module !== 'undefined' && require.main === module) {
  main();
}

module.exports = { runSeed, COUNTS };
