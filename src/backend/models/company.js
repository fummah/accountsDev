const db = require('./dbmgr.js');

const Company = {
  createTable() {
    const stmt = `
      CREATE TABLE IF NOT EXISTS company_info (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        name TEXT,
        reg_number TEXT,
        industry TEXT,
        business_type TEXT,
        address TEXT,
        address1 TEXT,
        address2 TEXT,
        city TEXT,
        state TEXT,
        postal_code TEXT,
        country TEXT,
        email TEXT,
        phone TEXT,
        website TEXT,
        tax_id TEXT,
        logo TEXT,
        currency TEXT,
        fy_start TEXT,
        vat_rate REAL,
        tax_name TEXT,
        terms INTEGER,
        bank_name TEXT,
        account_number TEXT,
        branch_code TEXT,
        routing_number TEXT,
        account_type TEXT,
        opening_balance REAL DEFAULT 0,
        payments TEXT,
        date_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    db.prepare(stmt).run();
    // ensure single row exists
    const exists = db.prepare('SELECT COUNT(*) as c FROM company_info').get().c;
    if (!exists) {
      db.prepare('INSERT INTO company_info (id) VALUES (1)').run();
    }
    // Migrate missing columns for existing databases
    try {
      const cols = new Set(db.prepare("PRAGMA table_info('company_info')").all().map(r => r.name));
      const add = (col, ddl) => { if (!cols.has(col)) db.prepare(`ALTER TABLE company_info ADD COLUMN ${col} ${ddl}`).run(); };
      add('website',         'TEXT');
      add('tax_id',          'TEXT');
      add('tax_name',        'TEXT');
      add('routing_number',  'TEXT');
      add('account_type',    'TEXT');
      add('opening_balance', 'REAL DEFAULT 0');
      add('address1',        'TEXT');
      add('address2',        'TEXT');
      add('city',            'TEXT');
      add('state',           'TEXT');
      add('postal_code',     'TEXT');
      add('country',         'TEXT');
    } catch (e) { console.error('[company] migration failed:', e); }
  },
  getInfo() {
    return db.prepare('SELECT * FROM company_info WHERE id = 1').get() || {};
  },
  saveInfo(data) {
    // Helper: coerce value to a SQLite-safe type (string, number, or null)
    const safe = (v) => {
      if (v == null) return null;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint') return v;
      if (Buffer.isBuffer(v)) return v;
      return String(v); // fallback: stringify objects/arrays/booleans
    };
    // Accept both camelCase (legacy) and snake_case keys from the frontend
    const payments = data.payments;
    const paymentsStr = Array.isArray(payments) ? payments.join(',') : payments || null;

    const stmt = db.prepare(`UPDATE company_info SET
      name = @name,
      reg_number = @reg_number,
      industry = @industry,
      business_type = @business_type,
      address = @address,
      address1 = @address1,
      address2 = @address2,
      city = @city,
      state = @state,
      postal_code = @postal_code,
      country = @country,
      email = @email,
      phone = @phone,
      website = @website,
      tax_id = @tax_id,
      logo = @logo,
      currency = @currency,
      fy_start = @fy_start,
      vat_rate = @vat_rate,
      tax_name = @tax_name,
      terms = @terms,
      bank_name = @bank_name,
      account_number = @account_number,
      branch_code = @branch_code,
      routing_number = @routing_number,
      account_type = @account_type,
      opening_balance = @opening_balance,
      payments = @payments,
      date_updated = CURRENT_TIMESTAMP
      WHERE id = 1`);
    const res = stmt.run({
      name:            safe(data.name || null),
      reg_number:      safe(data.reg_number || data.regNumber || null),
      industry:        safe(data.industry || null),
      business_type:   safe(data.business_type || data.businessType || null),
      address:         safe(data.address || null),
      address1:        safe(data.address1 || data.address || null),
      address2:        safe(data.address2 || null),
      city:            safe(data.city || null),
      state:           safe(data.state || null),
      postal_code:     safe(data.postal_code || data.postalCode || data.zip || null),
      country:         safe(data.country || null),
      email:           safe(data.email || null),
      phone:           safe(data.phone || null),
      website:         safe(data.website || null),
      tax_id:          safe(data.tax_id || data.taxId || null),
      logo:            safe(typeof data.logo === 'string' ? data.logo : null),
      currency:        safe(data.currency || null),
      fy_start:        safe(data.fy_start || data.fyStart || null),
      vat_rate:        safe(data.vat_rate != null ? data.vat_rate : (data.vat != null ? data.vat : null)),
      tax_name:        safe(data.tax_name || data.taxName || null),
      terms:           safe(data.terms != null ? data.terms : null),
      bank_name:       safe(data.bank_name || data.bank || null),
      account_number:  safe(data.account_number || data.accountNumber || null),
      branch_code:     safe(data.branch_code || data.branchCode || null),
      routing_number:  safe(data.routing_number || data.routingNumber || null),
      account_type:    safe(data.account_type || data.accountType || null),
      opening_balance: safe(data.opening_balance != null ? data.opening_balance : null),
      payments:        safe(paymentsStr),
    });
    return { success: res.changes >= 0 };
  },
};

Company.createTable();
module.exports = Company;
