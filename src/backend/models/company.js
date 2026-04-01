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
        email TEXT,
        phone TEXT,
        logo TEXT,
        currency TEXT,
        fy_start TEXT,
        vat_rate REAL,
        terms INTEGER,
        bank_name TEXT,
        account_number TEXT,
        branch_code TEXT,
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
      email = @email,
      phone = @phone,
      logo = @logo,
      currency = @currency,
      fy_start = @fy_start,
      vat_rate = @vat_rate,
      terms = @terms,
      bank_name = @bank_name,
      account_number = @account_number,
      branch_code = @branch_code,
      payments = @payments,
      date_updated = CURRENT_TIMESTAMP
      WHERE id = 1`);
    const res = stmt.run({
      name:           safe(data.name || null),
      reg_number:     safe(data.reg_number || data.regNumber || null),
      industry:       safe(data.industry || null),
      business_type:  safe(data.business_type || data.businessType || null),
      address:        safe(data.address || null),
      email:          safe(data.email || null),
      phone:          safe(data.phone || null),
      logo:           safe(typeof data.logo === 'string' ? data.logo : null),
      currency:       safe(data.currency || null),
      fy_start:       safe(data.fy_start || data.fyStart || null),
      vat_rate:       safe(data.vat_rate != null ? data.vat_rate : (data.vat != null ? data.vat : null)),
      terms:          safe(data.terms != null ? data.terms : null),
      bank_name:      safe(data.bank_name || data.bank || null),
      account_number: safe(data.account_number || data.accountNumber || null),
      branch_code:    safe(data.branch_code || data.branchCode || null),
      payments:       safe(paymentsStr),
    });
    return { success: res.changes >= 0 };
  },
};

Company.createTable();
module.exports = Company;
