const db = require('./dbmgr');

const JurisdictionTax = {
  createTable() {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS jurisdiction_tax_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        jurisdiction TEXT NOT NULL,
        tax_type TEXT NOT NULL,
        name TEXT NOT NULL,
        rate REAL DEFAULT 0,
        threshold REAL,
        applies_to TEXT,
        reverse_charge INTEGER DEFAULT 0,
        exempt_categories TEXT,
        effective_from DATE,
        effective_to DATE,
        active INTEGER DEFAULT 1,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Seed default tax rules if empty
    try {
      const cnt = db.prepare(`SELECT COUNT(1) AS c FROM jurisdiction_tax_rules`).get().c;
      if (!cnt) {
        const seed = db.prepare(`INSERT INTO jurisdiction_tax_rules (jurisdiction, tax_type, name, rate, threshold, applies_to, reverse_charge, exempt_categories, notes) VALUES (?,?,?,?,?,?,?,?,?)`);
        const tx = db.transaction(() => {
          // US Federal
          seed.run('US', 'Income Tax', 'Federal Income Tax', 0, null, 'payroll', 0, null, 'Progressive brackets in tax_brackets table');
          seed.run('US', 'FICA', 'Social Security', 6.2, 168600, 'payroll', 0, null, '2024 wage base limit');
          seed.run('US', 'FICA', 'Medicare', 1.45, null, 'payroll', 0, null, 'No wage base limit');
          seed.run('US', 'FICA', 'Additional Medicare', 0.9, 200000, 'payroll', 0, null, 'Above $200k');
          seed.run('US', 'FUTA', 'Federal Unemployment', 0.6, 7000, 'employer', 0, null, 'After state credit');
          // UK
          seed.run('UK', 'VAT', 'Standard Rate', 20, null, 'sales', 0, null, 'UK standard VAT');
          seed.run('UK', 'VAT', 'Reduced Rate', 5, null, 'sales', 0, 'domestic fuel,child car seats', 'Selected goods/services');
          seed.run('UK', 'VAT', 'Zero Rate', 0, null, 'sales', 0, 'food,books,children clothing', 'Zero-rated goods');
          seed.run('UK', 'PAYE', 'Basic Rate', 20, null, 'payroll', 0, null, '£12,571-£50,270');
          seed.run('UK', 'PAYE', 'Higher Rate', 40, null, 'payroll', 0, null, '£50,271-£125,140');
          seed.run('UK', 'PAYE', 'Additional Rate', 45, null, 'payroll', 0, null, 'Over £125,140');
          seed.run('UK', 'NI', 'Employee NI Class 1', 8, null, 'payroll', 0, null, 'Above £242/week');
          // South Africa
          seed.run('ZA', 'VAT', 'Standard Rate', 15, null, 'sales', 0, null, 'SA standard VAT');
          seed.run('ZA', 'VAT', 'Zero Rate', 0, null, 'sales', 0, 'basic foodstuffs,exports', 'Zero-rated supplies');
          seed.run('ZA', 'PAYE', 'Tax Bracket 1', 18, null, 'payroll', 0, null, 'R1-R237,100');
          seed.run('ZA', 'PAYE', 'Tax Bracket 2', 26, null, 'payroll', 0, null, 'R237,101-R370,500');
          seed.run('ZA', 'UIF', 'Unemployment Insurance', 1, null, 'payroll', 0, null, '1% employee + 1% employer');
          seed.run('ZA', 'SDL', 'Skills Development Levy', 1, 500000, 'employer', 0, null, 'Annual payroll > R500k');
          // Nigeria
          seed.run('NG', 'VAT', 'Standard Rate', 7.5, null, 'sales', 0, null, 'Nigeria VAT');
          seed.run('NG', 'WHT', 'Withholding Tax - Dividends', 10, null, 'payment', 0, null, 'Dividend payments');
          seed.run('NG', 'WHT', 'Withholding Tax - Rent', 10, null, 'payment', 0, null, 'Rental payments');
          seed.run('NG', 'WHT', 'Withholding Tax - Contract', 5, null, 'payment', 0, null, 'Contract/service payments');
          seed.run('NG', 'PAYE', 'First N300k', 7, null, 'payroll', 0, null, 'First N300,000');
          seed.run('NG', 'PAYE', 'Next N300k', 11, null, 'payroll', 0, null, 'Next N300,000');
          // UAE
          seed.run('AE', 'VAT', 'Standard Rate', 5, null, 'sales', 0, null, 'UAE VAT');
          seed.run('AE', 'VAT', 'Zero Rate', 0, null, 'sales', 0, 'exports,international transport,precious metals', 'Zero-rated');
          seed.run('AE', 'CIT', 'Corporate Tax', 9, 375000, 'corporate', 0, null, 'Taxable income > AED 375,000');
          // Canada
          seed.run('CA', 'GST', 'Federal GST', 5, null, 'sales', 0, null, 'Federal Goods & Services Tax');
          seed.run('CA-ON', 'HST', 'Ontario HST', 13, null, 'sales', 0, null, 'Harmonized Sales Tax - Ontario');
          seed.run('CA-BC', 'PST', 'BC Provincial Sales Tax', 7, null, 'sales', 0, null, 'British Columbia PST');
          seed.run('CA', 'CPP', 'Canada Pension Plan', 5.95, 68500, 'payroll', 0, null, '2024 max pensionable earnings');
          seed.run('CA', 'EI', 'Employment Insurance', 1.66, 63200, 'payroll', 0, null, '2024 max insurable earnings');
          // Australia
          seed.run('AU', 'GST', 'Goods & Services Tax', 10, null, 'sales', 0, null, 'Australian GST');
          seed.run('AU', 'PAYG', 'Pay As You Go', 0, null, 'payroll', 0, null, 'Progressive brackets');
          seed.run('AU', 'SUPER', 'Superannuation Guarantee', 11.5, null, 'employer', 0, null, '2024-25 rate');
        });
        tx();
      }
    } catch (e) { console.error('JurisdictionTax seed error:', e); }
  },

  listByJurisdiction(jurisdiction) {
    return db.prepare(`SELECT * FROM jurisdiction_tax_rules WHERE jurisdiction = ? AND active = 1 ORDER BY tax_type, name`).all(jurisdiction);
  },

  listAll() {
    return db.prepare(`SELECT * FROM jurisdiction_tax_rules WHERE active = 1 ORDER BY jurisdiction, tax_type, name`).all();
  },

  listJurisdictions() {
    return db.prepare(`SELECT DISTINCT jurisdiction FROM jurisdiction_tax_rules WHERE active = 1 ORDER BY jurisdiction`).all().map(r => r.jurisdiction);
  },

  getRule(id) {
    return db.prepare(`SELECT * FROM jurisdiction_tax_rules WHERE id = ?`).get(id);
  },

  saveRule(rule) {
    if (rule.id) {
      db.prepare(`UPDATE jurisdiction_tax_rules SET jurisdiction=?, tax_type=?, name=?, rate=?, threshold=?, applies_to=?, reverse_charge=?, exempt_categories=?, effective_from=?, effective_to=?, active=?, notes=? WHERE id=?`)
        .run(rule.jurisdiction, rule.tax_type, rule.name, rule.rate || 0, rule.threshold || null, rule.applies_to || null, rule.reverse_charge ? 1 : 0, rule.exempt_categories || null, rule.effective_from || null, rule.effective_to || null, rule.active !== false ? 1 : 0, rule.notes || null, rule.id);
      return { success: true };
    }
    const res = db.prepare(`INSERT INTO jurisdiction_tax_rules (jurisdiction, tax_type, name, rate, threshold, applies_to, reverse_charge, exempt_categories, effective_from, effective_to, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(rule.jurisdiction, rule.tax_type, rule.name, rule.rate || 0, rule.threshold || null, rule.applies_to || null, rule.reverse_charge ? 1 : 0, rule.exempt_categories || null, rule.effective_from || null, rule.effective_to || null, rule.notes || null);
    return { success: true, id: res.lastInsertRowid };
  },

  deleteRule(id) {
    return db.prepare(`DELETE FROM jurisdiction_tax_rules WHERE id = ?`).run(id);
  },

  calculateTax(jurisdiction, taxType, amount, options = {}) {
    const rules = db.prepare(`
      SELECT * FROM jurisdiction_tax_rules
      WHERE jurisdiction = ? AND tax_type = ? AND active = 1
        AND (effective_from IS NULL OR effective_from <= ?)
        AND (effective_to IS NULL OR effective_to >= ?)
      ORDER BY threshold ASC NULLS FIRST
    `).all(jurisdiction, taxType, options.date || new Date().toISOString().slice(0, 10), options.date || new Date().toISOString().slice(0, 10));

    if (!rules.length) return { tax: 0, rules: [], details: 'No matching rules found' };

    // For simple flat-rate taxes (VAT, GST)
    if (['VAT', 'GST', 'HST', 'PST', 'WHT', 'CIT'].includes(taxType)) {
      const rule = rules[0];
      const exemptCats = (rule.exempt_categories || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      if (options.category && exemptCats.includes(options.category.toLowerCase())) {
        return { tax: 0, rules: [rule], details: 'Exempt category' };
      }
      const tax = Number(((Number(amount) || 0) * (rule.rate / 100)).toFixed(2));
      return { tax, rate: rule.rate, rules: [rule], details: `${rule.name}: ${rule.rate}%` };
    }

    // For progressive taxes (PAYE, Income Tax)
    if (['PAYE', 'Income Tax'].includes(taxType)) {
      let totalTax = 0;
      const details = [];
      let remaining = Number(amount) || 0;
      for (const rule of rules) {
        if (remaining <= 0) break;
        const taxable = rule.threshold ? Math.min(remaining, rule.threshold) : remaining;
        const tax = taxable * (rule.rate / 100);
        totalTax += tax;
        details.push(`${rule.name}: ${taxable.toFixed(2)} × ${rule.rate}% = ${tax.toFixed(2)}`);
        remaining -= taxable;
      }
      return { tax: Number(totalTax.toFixed(2)), rules, details: details.join('; ') };
    }

    // For payroll deductions (FICA, NI, CPP, UIF, etc.)
    const rule = rules[0];
    const taxable = rule.threshold ? Math.min(Number(amount) || 0, rule.threshold) : (Number(amount) || 0);
    const tax = Number((taxable * (rule.rate / 100)).toFixed(2));
    return { tax, rate: rule.rate, rules: [rule], details: `${rule.name}: ${rule.rate}% on ${taxable.toFixed(2)}` };
  }
};

JurisdictionTax.createTable();

module.exports = JurisdictionTax;
