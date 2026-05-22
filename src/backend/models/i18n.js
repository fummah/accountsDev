const db = require('./dbmgr');

const I18n = {
  createTable() {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS i18n_translations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        locale TEXT NOT NULL,
        namespace TEXT NOT NULL DEFAULT 'common',
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        UNIQUE(locale, namespace, key)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS i18n_locales (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        native_name TEXT,
        direction TEXT DEFAULT 'ltr',
        date_format TEXT DEFAULT 'MM/DD/YYYY',
        number_decimal TEXT DEFAULT '.',
        number_thousands TEXT DEFAULT ',',
        currency_position TEXT DEFAULT 'before',
        active INTEGER DEFAULT 1
      )
    `).run();

    // Seed locales if empty
    try {
      const cnt = db.prepare(`SELECT COUNT(1) AS c FROM i18n_locales`).get().c;
      if (!cnt) {
        const ins = db.prepare(`INSERT OR IGNORE INTO i18n_locales (code, name, native_name, direction, date_format, number_decimal, number_thousands, currency_position, active) VALUES (?,?,?,?,?,?,?,?,?)`);
        const tx = db.transaction(() => {
          ins.run('en-US', 'English (US)', 'English', 'ltr', 'MM/DD/YYYY', '.', ',', 'before', 1);
          ins.run('en-GB', 'English (UK)', 'English', 'ltr', 'DD/MM/YYYY', '.', ',', 'before', 1);
          ins.run('en-ZA', 'English (South Africa)', 'English', 'ltr', 'DD/MM/YYYY', '.', ' ', 'before', 1);
          ins.run('fr-FR', 'French', 'Français', 'ltr', 'DD/MM/YYYY', ',', ' ', 'after', 1);
          ins.run('fr-CA', 'French (Canada)', 'Français (Canada)', 'ltr', 'YYYY-MM-DD', ',', ' ', 'after', 1);
          ins.run('es-ES', 'Spanish', 'Español', 'ltr', 'DD/MM/YYYY', ',', '.', 'after', 1);
          ins.run('pt-BR', 'Portuguese (Brazil)', 'Português', 'ltr', 'DD/MM/YYYY', ',', '.', 'before', 1);
          ins.run('de-DE', 'German', 'Deutsch', 'ltr', 'DD.MM.YYYY', ',', '.', 'after', 1);
          ins.run('ar-SA', 'Arabic (Saudi)', 'العربية', 'rtl', 'DD/MM/YYYY', '.', ',', 'after', 1);
          ins.run('ar-AE', 'Arabic (UAE)', 'العربية', 'rtl', 'DD/MM/YYYY', '.', ',', 'after', 1);
          ins.run('zh-CN', 'Chinese (Simplified)', '中文', 'ltr', 'YYYY-MM-DD', '.', ',', 'before', 1);
          ins.run('ja-JP', 'Japanese', '日本語', 'ltr', 'YYYY/MM/DD', '.', ',', 'before', 1);
          ins.run('hi-IN', 'Hindi', 'हिन्दी', 'ltr', 'DD/MM/YYYY', '.', ',', 'before', 1);
          ins.run('sw-KE', 'Swahili', 'Kiswahili', 'ltr', 'DD/MM/YYYY', '.', ',', 'before', 1);
          ins.run('zu-ZA', 'Zulu', 'isiZulu', 'ltr', 'DD/MM/YYYY', '.', ' ', 'before', 1);
          ins.run('af-ZA', 'Afrikaans', 'Afrikaans', 'ltr', 'DD/MM/YYYY', ',', ' ', 'before', 1);
          ins.run('ur-PK', 'Urdu', 'اردو', 'rtl', 'DD/MM/YYYY', '.', ',', 'after', 1);
          ins.run('he-IL', 'Hebrew', 'עברית', 'rtl', 'DD/MM/YYYY', '.', ',', 'before', 1);
          ins.run('tr-TR', 'Turkish', 'Türkçe', 'ltr', 'DD.MM.YYYY', ',', '.', 'after', 1);
          ins.run('ko-KR', 'Korean', '한국어', 'ltr', 'YYYY-MM-DD', '.', ',', 'before', 1);
        });
        tx();
      }
    } catch (e) { console.error('I18n locale seed error:', e); }

    // Seed core English translations if empty
    try {
      const cnt2 = db.prepare(`SELECT COUNT(1) AS c FROM i18n_translations WHERE locale = 'en-US'`).get().c;
      if (!cnt2) {
        const ins = db.prepare(`INSERT OR IGNORE INTO i18n_translations (locale, namespace, key, value) VALUES (?,?,?,?)`);
        const tx = db.transaction(() => {
          const entries = {
            // Navigation
            'nav.dashboard': 'Dashboard', 'nav.customers': 'Customers', 'nav.vendors': 'Vendors',
            'nav.employees': 'Employees', 'nav.banking': 'Banking', 'nav.reports': 'Reports',
            'nav.accountant': 'Accountant', 'nav.settings': 'Settings', 'nav.inventory': 'Inventory',
            'nav.projects': 'Projects', 'nav.pos': 'Point of Sale', 'nav.expenses': 'Expenses',
            // Common actions
            'action.save': 'Save', 'action.cancel': 'Cancel', 'action.delete': 'Delete',
            'action.edit': 'Edit', 'action.create': 'Create', 'action.search': 'Search',
            'action.export': 'Export', 'action.import': 'Import', 'action.print': 'Print',
            'action.back': 'Back', 'action.next': 'Next', 'action.confirm': 'Confirm',
            'action.add': 'Add', 'action.remove': 'Remove', 'action.close': 'Close',
            // Labels
            'label.name': 'Name', 'label.email': 'Email', 'label.phone': 'Phone',
            'label.address': 'Address', 'label.date': 'Date', 'label.amount': 'Amount',
            'label.status': 'Status', 'label.type': 'Type', 'label.description': 'Description',
            'label.total': 'Total', 'label.subtotal': 'Subtotal', 'label.tax': 'Tax',
            'label.balance': 'Balance', 'label.payment': 'Payment', 'label.invoice': 'Invoice',
            'label.customer': 'Customer', 'label.vendor': 'Vendor', 'label.employee': 'Employee',
            'label.product': 'Product', 'label.quantity': 'Quantity', 'label.price': 'Price',
            'label.rate': 'Rate', 'label.notes': 'Notes', 'label.category': 'Category',
            // Messages
            'msg.saved': 'Saved successfully', 'msg.deleted': 'Deleted successfully',
            'msg.error': 'An error occurred', 'msg.confirm_delete': 'Are you sure you want to delete this?',
            'msg.loading': 'Loading...', 'msg.no_data': 'No data available',
          };
          for (const [key, value] of Object.entries(entries)) {
            ins.run('en-US', 'common', key, value);
          }
        });
        tx();
      }
    } catch (e) { console.error('I18n translation seed error:', e); }
  },

  // Locales
  listLocales() {
    return db.prepare(`SELECT * FROM i18n_locales ORDER BY name ASC`).all();
  },
  listActiveLocales() {
    return db.prepare(`SELECT * FROM i18n_locales WHERE active = 1 ORDER BY name ASC`).all();
  },
  getLocale(code) {
    return db.prepare(`SELECT * FROM i18n_locales WHERE code = ?`).get(code);
  },
  toggleLocale(code, active) {
    db.prepare(`UPDATE i18n_locales SET active = ? WHERE code = ?`).run(active ? 1 : 0, code);
    return { success: true };
  },

  // Translations
  getTranslations(locale, namespace) {
    const rows = db.prepare(`SELECT key, value FROM i18n_translations WHERE locale = ? AND namespace = ?`).all(locale, namespace || 'common');
    const result = {};
    for (const r of rows) result[r.key] = r.value;
    return result;
  },

  getAllTranslationsForLocale(locale) {
    const rows = db.prepare(`SELECT namespace, key, value FROM i18n_translations WHERE locale = ?`).all(locale);
    const result = {};
    for (const r of rows) {
      if (!result[r.namespace]) result[r.namespace] = {};
      result[r.namespace][r.key] = r.value;
    }
    return result;
  },

  setTranslation(locale, namespace, key, value) {
    db.prepare(`INSERT INTO i18n_translations (locale, namespace, key, value) VALUES (?,?,?,?)
      ON CONFLICT(locale, namespace, key) DO UPDATE SET value = excluded.value`)
      .run(locale, namespace || 'common', key, value);
    return { success: true };
  },

  bulkSetTranslations(locale, namespace, translations) {
    const tx = db.transaction(() => {
      for (const [key, value] of Object.entries(translations || {})) {
        db.prepare(`INSERT INTO i18n_translations (locale, namespace, key, value) VALUES (?,?,?,?)
          ON CONFLICT(locale, namespace, key) DO UPDATE SET value = excluded.value`)
          .run(locale, namespace || 'common', key, value);
      }
    });
    tx();
    return { success: true };
  },

  exportLocale(locale) {
    return db.prepare(`SELECT namespace, key, value FROM i18n_translations WHERE locale = ? ORDER BY namespace, key`).all(locale);
  },

  importLocale(locale, entries) {
    const tx = db.transaction(() => {
      for (const e of (entries || [])) {
        db.prepare(`INSERT INTO i18n_translations (locale, namespace, key, value) VALUES (?,?,?,?)
          ON CONFLICT(locale, namespace, key) DO UPDATE SET value = excluded.value`)
          .run(locale, e.namespace || 'common', e.key, e.value);
      }
    });
    tx();
    return { success: true, count: (entries || []).length };
  },

  // Translation coverage stats
  getCoverage(locale) {
    const enCount = db.prepare(`SELECT COUNT(*) AS c FROM i18n_translations WHERE locale = 'en-US'`).get().c;
    const localeCount = db.prepare(`SELECT COUNT(*) AS c FROM i18n_translations WHERE locale = ?`).get(locale).c;
    return { locale, translated: localeCount, total: enCount, percentage: enCount > 0 ? Math.round((localeCount / enCount) * 100) : 0 };
  }
};

I18n.createTable();

module.exports = I18n;
