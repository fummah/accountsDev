const db = require("./dbmgr");
const Settings = require('./settings');

const Journal = {
  createTable() {
    db.prepare(`CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      description TEXT,
      entered_by TEXT
    )`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS journal_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER,
      account TEXT,
      debit REAL,
      credit REAL,
      FOREIGN KEY(entry_id) REFERENCES journal_entries(id)
    )`).run();
    // Indices
    try {
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_journal_entry_date ON journal_entries(date)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(entry_id)`).run();
    } catch {}

    // Safe migrations: add reversal_of, is_template, entity_id, class, location, department if missing
    try {
      const cols = db.prepare("PRAGMA table_info('journal_entries')").all().map(c => c.name.toLowerCase());
      if (!cols.includes('reversal_of')) {
        db.prepare(`ALTER TABLE journal_entries ADD COLUMN reversal_of INTEGER`).run();
      }
      if (!cols.includes('is_template')) {
        db.prepare(`ALTER TABLE journal_entries ADD COLUMN is_template INTEGER DEFAULT 0`).run();
      }
      if (!cols.includes('entity_id')) {
        db.prepare(`ALTER TABLE journal_entries ADD COLUMN entity_id INTEGER`).run();
      }
      if (!cols.includes('class')) {
        db.prepare(`ALTER TABLE journal_entries ADD COLUMN class TEXT`).run();
      }
      if (!cols.includes('location')) {
        db.prepare(`ALTER TABLE journal_entries ADD COLUMN location TEXT`).run();
      }
      if (!cols.includes('department')) {
        db.prepare(`ALTER TABLE journal_entries ADD COLUMN department TEXT`).run();
      }
    } catch {}
  },
  getAll() {
    const entries = db.prepare("SELECT * FROM journal_entries ORDER BY date DESC").all();
    for (const entry of entries) {
      entry.lines = db.prepare("SELECT * FROM journal_lines WHERE entry_id=?").all(entry.id);
    }
    return entries;
  },
  insert({ date, description, lines, entered_by, entity_id, class: classTag, location, department }) {
    // Enforce closing date (no postings on or before closingDate)
    const closingDate = Settings.get('closingDate');
    if (closingDate && date && typeof date === 'string' && date <= closingDate) {
      throw new Error(`Posting date ${date} is on or before closing date ${closingDate}`);
    }

    // Validate journal lines
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new Error('Journal entry requires at least one line');
    }
    const sanitizedLines = lines.map(l => ({
      account: l.account,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0
    }));
    const totalDebit = sanitizedLines.reduce((s, l) => s + (l.debit || 0), 0);
    const totalCredit = sanitizedLines.reduce((s, l) => s + (l.credit || 0), 0);
    if (Number(totalDebit.toFixed(2)) !== Number(totalCredit.toFixed(2))) {
      throw new Error('Journal entry is not balanced (debits must equal credits)');
    }
    if (sanitizedLines.some(l => l.debit < 0 || l.credit < 0)) {
      throw new Error('Journal lines must not contain negative amounts');
    }

    const entry = db.prepare("INSERT INTO journal_entries (date, description, entered_by, entity_id, class, location, department) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(date, description, entered_by, entity_id || null, classTag || null, location || null, department || null);
    const entry_id = entry.lastInsertRowid;
    for (const line of sanitizedLines) {
      db.prepare("INSERT INTO journal_lines (entry_id, account, debit, credit) VALUES (?, ?, ?, ?)").run(entry_id, line.account, line.debit || 0, line.credit || 0);
    }
    return entry_id;
  },

  // Generate a reversal template (does not insert). Returns an entry object.
  buildReversalTemplate(originalEntryId) {
    if (!originalEntryId) throw new Error('originalEntryId is required');
    const entry = db.prepare("SELECT * FROM journal_entries WHERE id=?").get(originalEntryId);
    if (!entry) throw new Error(`Original entry ${originalEntryId} not found`);
    const lines = db.prepare("SELECT * FROM journal_lines WHERE entry_id=?").all(originalEntryId);
    const reversedLines = lines.map(l => ({
      account: l.account,
      // swap debit/credit
      debit: Number(l.credit) || 0,
      credit: Number(l.debit) || 0
    }));
    return {
      date: entry.date,
      description: `Reversal of #${originalEntryId}: ${entry.description || ''}`.trim(),
      lines: reversedLines,
      entered_by: entry.entered_by,
      reversal_of: originalEntryId
    };
  },

  // Create a persisted reversal entry with a provided date and entered_by
  createReversalEntry({ originalEntryId, date, entered_by }) {
    if (!originalEntryId) throw new Error('originalEntryId is required');
    const template = this.buildReversalTemplate(originalEntryId);
    // allow override of date/entered_by
    const newDate = date || template.date;
    const newEnteredBy = entered_by || template.entered_by;

    // Enforce closing date for reversal posting
    const closingDate = Settings.get('closingDate');
    if (closingDate && newDate && typeof newDate === 'string' && newDate <= closingDate) {
      throw new Error(`Posting date ${newDate} is on or before closing date ${closingDate}`);
    }

    // Insert header with reversal_of link (preserve entity_id from original)
    const original = db.prepare("SELECT entity_id FROM journal_entries WHERE id=?").get(originalEntryId);
    const ins = db.prepare("INSERT INTO journal_entries (date, description, entered_by, reversal_of, entity_id) VALUES (?, ?, ?, ?, ?)")
      .run(newDate, template.description, newEnteredBy, originalEntryId, original ? original.entity_id : null);
    const newId = ins.lastInsertRowid;
    for (const line of template.lines) {
      db.prepare("INSERT INTO journal_lines (entry_id, account, debit, credit) VALUES (?, ?, ?, ?)")
        .run(newId, line.account, line.debit || 0, line.credit || 0);
    }
    return newId;
  },

  // Suggest corrective lines to balance an input draft entry (does not insert)
  // Returns an object with suggestions array. Each suggestion has a title and lines.
  suggestCorrective(entryDraft, { defaultAccount = 'Suspense' } = {}) {
    if (!entryDraft || !Array.isArray(entryDraft.lines)) {
      throw new Error('entryDraft with lines is required');
    }
    const sanitizedLines = entryDraft.lines.map(l => ({
      account: l.account,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0
    }));
    const totalDebit = sanitizedLines.reduce((s, l) => s + (l.debit || 0), 0);
    const totalCredit = sanitizedLines.reduce((s, l) => s + (l.credit || 0), 0);
    const roundedDiff = Number((totalDebit - totalCredit).toFixed(2));

    const suggestions = [];

    if (roundedDiff === 0) {
      return { balanced: true, suggestions: [] };
    }

    // Single-line balancing suggestion to default account (Suspense)
    if (roundedDiff > 0) {
      // more debit than credit; add credit to balance
      suggestions.push({
        key: 'single_balance_credit',
        title: `Add credit ${Math.abs(roundedDiff).toFixed(2)} to ${defaultAccount}`,
        lines: [{ account: defaultAccount, debit: 0, credit: Math.abs(roundedDiff) }]
      });
    } else {
      // more credit than debit; add debit to balance
      suggestions.push({
        key: 'single_balance_debit',
        title: `Add debit ${Math.abs(roundedDiff).toFixed(2)} to ${defaultAccount}`,
        lines: [{ account: defaultAccount, debit: Math.abs(roundedDiff), credit: 0 }]
      });
    }

    // Full reversal template suggestion (if user prefers to reverse instead)
    suggestions.push({
      key: 'full_reversal_template',
      title: 'Create full reversal template of current lines',
      lines: sanitizedLines.map(l => ({ account: l.account, debit: l.credit, credit: l.debit }))
    });

    return { balanced: false, suggestions };
  }
};

Journal.createTable();
module.exports = Journal;