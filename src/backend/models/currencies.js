const db = require('./dbmgr');

// Ensure schema
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS currencies (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      symbol TEXT,
      decimals INTEGER DEFAULT 2,
      isBase INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS exchange_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fromCurrency TEXT NOT NULL,
      toCurrency TEXT NOT NULL,
      rate REAL NOT NULL,
      effectiveDate TEXT NOT NULL,
      source TEXT DEFAULT 'manual',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(fromCurrency, toCurrency, effectiveDate)
    )
  `).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_xrate_date ON exchange_rates(fromCurrency, toCurrency, effectiveDate DESC)`).run();
} catch {}

// Seed common currencies if empty
try {
  const cnt = db.prepare(`SELECT COUNT(*) as c FROM currencies`).get().c;
  if (cnt === 0) {
    const seed = [
      ['USD', 'US Dollar', '$', 2, 1],
      ['EUR', 'Euro', '\u20AC', 2, 0],
      ['GBP', 'British Pound', '\u00A3', 2, 0],
      ['ZAR', 'South African Rand', 'R', 2, 0],
      ['JPY', 'Japanese Yen', '\u00A5', 0, 0],
      ['CAD', 'Canadian Dollar', 'C$', 2, 0],
      ['AUD', 'Australian Dollar', 'A$', 2, 0],
      ['CHF', 'Swiss Franc', 'CHF', 2, 0],
      ['CNY', 'Chinese Yuan', '\u00A5', 2, 0],
      ['INR', 'Indian Rupee', '\u20B9', 2, 0],
      ['BRL', 'Brazilian Real', 'R$', 2, 0],
      ['MXN', 'Mexican Peso', 'Mex$', 2, 0],
      ['NGN', 'Nigerian Naira', '\u20A6', 2, 0],
      ['KES', 'Kenyan Shilling', 'KSh', 2, 0],
      ['AED', 'UAE Dirham', 'AED', 2, 0],
      ['SAR', 'Saudi Riyal', 'SAR', 2, 0],
      ['NZD', 'New Zealand Dollar', 'NZ$', 2, 0],
      ['SGD', 'Singapore Dollar', 'S$', 2, 0],
      ['HKD', 'Hong Kong Dollar', 'HK$', 2, 0],
      ['SEK', 'Swedish Krona', 'kr', 2, 0],
      ['NOK', 'Norwegian Krone', 'kr', 2, 0],
      ['BWP', 'Botswana Pula', 'P', 2, 0],
    ];
    const ins = db.prepare(`INSERT OR IGNORE INTO currencies (code, name, symbol, decimals, isBase) VALUES (?,?,?,?,?)`);
    const tx = db.transaction((rows) => { for (const r of rows) ins.run(...r); });
    tx(seed);
  }
} catch {}

const Currencies = {
  list() {
    return db.prepare(`SELECT * FROM currencies ORDER BY isBase DESC, code ASC`).all();
  },
  listActive() {
    return db.prepare(`SELECT * FROM currencies WHERE active=1 ORDER BY isBase DESC, code ASC`).all();
  },
  getBase() {
    return db.prepare(`SELECT * FROM currencies WHERE isBase=1 LIMIT 1`).get() || { code: 'USD', symbol: '$', decimals: 2 };
  },
  setBase(code) {
    db.prepare(`UPDATE currencies SET isBase=0 WHERE isBase=1`).run();
    db.prepare(`UPDATE currencies SET isBase=1, active=1 WHERE code=?`).run(code);
    return { ok: true };
  },
  add(code, name, symbol, decimals) {
    db.prepare(`INSERT OR REPLACE INTO currencies (code, name, symbol, decimals, isBase, active) VALUES (?,?,?,?,0,1)`).run(code, name, symbol || code, decimals || 2);
    return { ok: true };
  },
  toggle(code, active) {
    db.prepare(`UPDATE currencies SET active=? WHERE code=?`).run(active ? 1 : 0, code);
    return { ok: true };
  },
  // Exchange rates
  setRate(from, to, rate, effectiveDate) {
    const d = effectiveDate || new Date().toISOString().slice(0, 10);
    db.prepare(`
      INSERT INTO exchange_rates (fromCurrency, toCurrency, rate, effectiveDate, source)
      VALUES (?, ?, ?, ?, 'manual')
      ON CONFLICT(fromCurrency, toCurrency, effectiveDate) DO UPDATE SET rate=excluded.rate, source='manual'
    `).run(from, to, rate, d);
    return { ok: true };
  },
  getRate(from, to, date) {
    const d = date || new Date().toISOString().slice(0, 10);
    // Get closest rate on or before the date
    const row = db.prepare(`
      SELECT rate FROM exchange_rates
      WHERE fromCurrency=? AND toCurrency=? AND effectiveDate<=?
      ORDER BY effectiveDate DESC LIMIT 1
    `).get(from, to, d);
    if (row) return row.rate;
    // Try inverse
    const inv = db.prepare(`
      SELECT rate FROM exchange_rates
      WHERE fromCurrency=? AND toCurrency=? AND effectiveDate<=?
      ORDER BY effectiveDate DESC LIMIT 1
    `).get(to, from, d);
    if (inv) return 1 / inv.rate;
    return null;
  },
  convert(amount, from, to, date) {
    if (from === to) return amount;
    const rate = this.getRate(from, to, date);
    if (rate === null) return null;
    return Number((amount * rate).toFixed(4));
  },
  getRates(from, limit) {
    return db.prepare(`
      SELECT * FROM exchange_rates
      WHERE fromCurrency=?
      ORDER BY effectiveDate DESC, toCurrency ASC
      LIMIT ?
    `).all(from || 'USD', limit || 200);
  },
  getAllRates(limit) {
    return db.prepare(`SELECT * FROM exchange_rates ORDER BY effectiveDate DESC, id DESC LIMIT ?`).all(limit || 200);
  },
};

module.exports = Currencies;
