const db = require("./dbmgr");
const Settings = require('./settings');

const Journal = {
  createTable() {
    // Create base tables (may already exist with old or new schema)
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
      debit REAL DEFAULT 0,
      credit REAL DEFAULT 0,
      FOREIGN KEY(entry_id) REFERENCES journal_entries(id)
    )`).run();

    // ── Migrate journal_entries: add ALL columns needed by BOTH old and new engines ──
    try {
      const jeCols = new Set(db.prepare("PRAGMA table_info('journal_entries')").all().map(c => c.name.toLowerCase()));
      const addJE = (col, ddl) => {
        if (!jeCols.has(col.toLowerCase())) {
          try {
            db.prepare(`ALTER TABLE journal_entries ADD COLUMN ${col} ${ddl}`).run();
          } catch (alterErr) {
            console.error(`[journal] Failed to alter journal_entries for column ${col}:`, alterErr.message);
          }
        }
      };
      // New engine columns (journalEntries.js)
      addJE('reference',    'TEXT');
      addJE('source_type',  'TEXT');
      addJE('source_id',    'INTEGER');
      addJE('memo',         'TEXT');
      addJE('status',       "TEXT DEFAULT 'Posted'");
      addJE('created_at',   "DATETIME"); // No DEFAULT CURRENT_TIMESTAMP to avoid SQLite ALTER limitations
      addJE('created_by',   'TEXT');
      // Old engine columns (journal.js)
      addJE('entered_by',   'TEXT');
      addJE('reversal_of',  'INTEGER');
      addJE('is_template',  'INTEGER DEFAULT 0');
      addJE('entity_id',    'INTEGER');
      addJE('class',        'TEXT');
      addJE('location',     'TEXT');
      addJE('department',   'TEXT');
    } catch (e) { console.error('[journal] journal_entries migration error:', e.message); }

    // ── Migrate journal_lines: add ALL columns needed by BOTH engines ──
    try {
      const jlCols = new Set(db.prepare("PRAGMA table_info('journal_lines')").all().map(c => c.name.toLowerCase()));
      const addJL = (col, ddl) => { if (!jlCols.has(col.toLowerCase())) db.prepare(`ALTER TABLE journal_lines ADD COLUMN ${col} ${ddl}`).run(); };
      // New engine columns
      addJL('journal_id',   'INTEGER REFERENCES journal_entries(id)');
      addJL('account_id',   'INTEGER');
      addJL('description',  'TEXT');
      addJL('class',        'TEXT');
      addJL('location',     'TEXT');
      addJL('department',   'TEXT');
      // Old engine columns (backward compat)
      addJL('entry_id',     'INTEGER');
      addJL('account',      'TEXT');
    } catch (e) { console.error('[journal] journal_lines migration error:', e.message); }

    // ── Back-fill journal_id ↔ entry_id so both engines can read each other's data ──
    try { db.prepare("UPDATE journal_lines SET journal_id = entry_id WHERE journal_id IS NULL AND entry_id IS NOT NULL").run(); } catch {}
    try { db.prepare("UPDATE journal_lines SET entry_id = journal_id WHERE entry_id IS NULL AND journal_id IS NOT NULL").run(); } catch {}

    // ── Back-fill status for old entries that pre-date the status column ──
    try { db.prepare("UPDATE journal_entries SET status = 'Posted' WHERE status IS NULL").run(); } catch {}

    // Indices (all of them, for both engines)
    try {
      db.prepare('CREATE INDEX IF NOT EXISTS idx_journal_entry_date ON journal_entries(date)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(entry_id)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_jl_journal_id ON journal_lines(journal_id)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_jl_account ON journal_lines(account_id)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_je_source ON journal_entries(source_type, source_id)').run();
    } catch {}
  },
  getAll() {
    const entries = db.prepare("SELECT * FROM journal_entries ORDER BY date DESC").all();
    for (const entry of entries) {
      entry.lines = db.prepare("SELECT * FROM journal_lines WHERE journal_id=? OR entry_id=?").all(entry.id, entry.id);
    }
    return entries;
  },
  insert({ date, description, lines, entered_by, entity_id, class: classTag, location, department, reference }) {
    // Safety: ensure required columns exist (in case migration was skipped)
    try {
      const cols = new Set(db.prepare("PRAGMA table_info('journal_entries')").all().map(c => c.name.toLowerCase()));
      if (!cols.has('created_by')) db.prepare("ALTER TABLE journal_entries ADD COLUMN created_by TEXT").run();
      if (!cols.has('created_at')) db.prepare("ALTER TABLE journal_entries ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP").run();
      if (!cols.has('reference')) db.prepare("ALTER TABLE journal_entries ADD COLUMN reference TEXT").run();
      if (!cols.has('source_type')) db.prepare("ALTER TABLE journal_entries ADD COLUMN source_type TEXT").run();
      if (!cols.has('source_id')) db.prepare("ALTER TABLE journal_entries ADD COLUMN source_id INTEGER").run();
      if (!cols.has('memo')) db.prepare("ALTER TABLE journal_entries ADD COLUMN memo TEXT").run();
      if (!cols.has('status')) db.prepare("ALTER TABLE journal_entries ADD COLUMN status TEXT DEFAULT 'Posted'").run();
    } catch (migErr) { console.error('[journal.insert] column check:', migErr.message); }

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
      account_id: l.account_id || l.accountId || null,
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

    const entry = db.prepare("INSERT INTO journal_entries (date, description, entered_by, created_by, entity_id, class, location, department, reference, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Posted', datetime('now'))")
      .run(date, description, entered_by, entered_by, entity_id || null, classTag || null, location || null, department || null, reference || null);
    const entry_id = entry.lastInsertRowid;
    for (const line of sanitizedLines) {
      let accountId = line.account_id;
      if (!accountId && line.account) {
        const row = db.prepare("SELECT id FROM chart_of_accounts WHERE name = ? OR number = ? OR (number || ' - ' || name) = ? LIMIT 1")
          .get(line.account, line.account, line.account);
        if (row) accountId = row.id;
      }
      db.prepare("INSERT INTO journal_lines (entry_id, journal_id, account, account_id, debit, credit) VALUES (?, ?, ?, ?, ?, ?)")
        .run(entry_id, entry_id, line.account, accountId || null, line.debit || 0, line.credit || 0);
    }
    return entry_id;
  },

  // Generate a reversal template (does not insert). Returns an entry object.
  buildReversalTemplate(originalEntryId) {
    if (!originalEntryId) throw new Error('originalEntryId is required');
    const entry = db.prepare("SELECT * FROM journal_entries WHERE id=?").get(originalEntryId);
    if (!entry) throw new Error(`Original entry ${originalEntryId} not found`);
    const lines = db.prepare("SELECT * FROM journal_lines WHERE journal_id=? OR entry_id=?").all(originalEntryId, originalEntryId);
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
      db.prepare("INSERT INTO journal_lines (entry_id, journal_id, account, debit, credit) VALUES (?, ?, ?, ?, ?)")
        .run(newId, newId, line.account, line.debit || 0, line.credit || 0);
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