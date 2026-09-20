const db = require('./dbmgr');
const Settings = require('./settings');

const JournalEntries = {
  createTable: () => {
    // Tables may already be created by journal.js — just ensure all needed columns exist.
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

    // ── Migrate journal_entries: add ALL columns needed by both engines ──
    try {
      const jeCols = new Set(db.prepare("PRAGMA table_info('journal_entries')").all().map(c => c.name.toLowerCase()));
      const addJE = (col, ddl) => {
        if (!jeCols.has(col.toLowerCase())) {
          try {
            db.prepare(`ALTER TABLE journal_entries ADD COLUMN ${col} ${ddl}`).run();
          } catch (alterErr) {
            console.error(`[journalEntries] Failed to alter journal_entries for column ${col}:`, alterErr.message);
          }
        }
      };
      addJE('reference',    'TEXT');
      addJE('source_type',  'TEXT');
      addJE('source_id',    'INTEGER');
      addJE('memo',         'TEXT');
      addJE('status',       "TEXT DEFAULT 'Posted'");
      addJE('created_at',   "DATETIME"); // No DEFAULT CURRENT_TIMESTAMP to avoid SQLite ALTER limitations
      addJE('created_by',   'TEXT');
      addJE('entered_by',   'TEXT');
      addJE('reversal_of',  'INTEGER');
      addJE('is_template',  'INTEGER DEFAULT 0');
      addJE('entity_id',    'INTEGER');
      addJE('class',        'TEXT');
      addJE('location',     'TEXT');
      addJE('department',   'TEXT');
    } catch (e) { console.error('[journalEntries] journal_entries migration:', e.message); }

    // ── Migrate journal_lines: add ALL columns needed by both engines ──
    try {
      const jlCols = new Set(db.prepare("PRAGMA table_info('journal_lines')").all().map(c => c.name.toLowerCase()));
      const addJL = (col, ddl) => { if (!jlCols.has(col.toLowerCase())) db.prepare(`ALTER TABLE journal_lines ADD COLUMN ${col} ${ddl}`).run(); };
      addJL('journal_id',   'INTEGER REFERENCES journal_entries(id)');
      addJL('account_id',   'INTEGER');
      addJL('description',  'TEXT');
      addJL('class',        'TEXT');
      addJL('location',     'TEXT');
      addJL('department',   'TEXT');
      addJL('entry_id',     'INTEGER');
      addJL('account',      'TEXT');
    } catch (e) { console.error('[journalEntries] journal_lines migration:', e.message); }

    // ── Back-fill journal_id ↔ entry_id ──
    try { db.prepare("UPDATE journal_lines SET journal_id = entry_id WHERE journal_id IS NULL AND entry_id IS NOT NULL").run(); } catch {}
    try { db.prepare("UPDATE journal_lines SET entry_id = journal_id WHERE entry_id IS NULL AND journal_id IS NOT NULL").run(); } catch {}
    try { db.prepare("UPDATE journal_entries SET status = 'Posted' WHERE status IS NULL").run(); } catch {}

    // Indexes
    try { db.prepare('CREATE INDEX IF NOT EXISTS idx_jl_account    ON journal_lines(account_id)').run(); } catch {}
    try { db.prepare('CREATE INDEX IF NOT EXISTS idx_je_source     ON journal_entries(source_type, source_id)').run(); } catch {}
    try { db.prepare('CREATE INDEX IF NOT EXISTS idx_je_date       ON journal_entries(date)').run(); } catch {}
    try { db.prepare('CREATE INDEX IF NOT EXISTS idx_jl_journal_id ON journal_lines(journal_id)').run(); } catch {}
  },

  // ── Post a balanced journal entry (the single posting engine) ────────
  post: (entry) => {
    const lines = entry.lines || [];
    if (!lines.length) throw new Error('Journal entry must have at least one line.');
    // Enforce closing date (no postings on or before closingDate)
    const closingDate = Settings.get('closingDate');
    if (closingDate && entry.date && typeof entry.date === 'string' && entry.date <= closingDate) {
      throw new Error(`Posting date ${entry.date} is on or before closing date ${closingDate}`);
    }
    const totalDebit  = lines.reduce((s, l) => s + Number(l.debit  || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      throw new Error(`Entry out of balance: debit ${totalDebit.toFixed(2)} ≠ credit ${totalCredit.toFixed(2)}`);
    }
    if (lines.some(l => Number(l.debit || 0) < 0 || Number(l.credit || 0) < 0)) {
      throw new Error('Journal lines must not contain negative amounts');
    }
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
      if (!cols.has('entered_by')) db.prepare("ALTER TABLE journal_entries ADD COLUMN entered_by TEXT").run();
      if (!cols.has('entity_id')) db.prepare("ALTER TABLE journal_entries ADD COLUMN entity_id INTEGER").run();
      if (!cols.has('class')) db.prepare("ALTER TABLE journal_entries ADD COLUMN class TEXT").run();
      if (!cols.has('location')) db.prepare("ALTER TABLE journal_entries ADD COLUMN location TEXT").run();
      if (!cols.has('department')) db.prepare("ALTER TABLE journal_entries ADD COLUMN department TEXT").run();
    } catch (migErr) { console.error('[journalEntries.post] column check:', migErr.message); }

    const postEntry = db.transaction(() => {
      const je = db.prepare(`
        INSERT INTO journal_entries (date, reference, description, source_type, source_id, memo, status, created_by, entered_by, entity_id, class, location, department, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'Posted', ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        entry.date, entry.reference || null, entry.description || null,
        entry.source_type || null, entry.source_id || null,
        entry.memo || null, entry.created_by || entry.entered_by || null,
        entry.entered_by || entry.created_by || null,
        entry.entity_id || null, entry.class || null, entry.location || null, entry.department || null
      );
      const jid = je.lastInsertRowid;
      for (const line of lines) {
        // Single engine accepts account by id OR by name/number
        let accountId = line.account_id || line.accountId || null;
        let accountName = line.account || line.accountName || null;
        if (!accountId && accountName) {
          const row = db.prepare("SELECT id, name FROM chart_of_accounts WHERE name = ? OR number = ? OR (number || ' - ' || name) = ? LIMIT 1")
            .get(accountName, accountName, accountName);
          if (row) { accountId = row.id; accountName = row.name; }
        }
        db.prepare(`
          INSERT INTO journal_lines (journal_id, entry_id, account_id, account, debit, credit, description, class, location, department)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(jid, jid, accountId || null, accountName || null,
               Number(line.debit || 0), Number(line.credit || 0),
               line.description || null, line.class || null, line.location || null, line.department || null);
      }
      return { success: true, id: Number(jid) };
    });
    const result = postEntry();
    // Audit every posted GL entry (incl. auto-posted from invoices, bills,
    // payments, deposits, transfers, credit notes, recurring runs).
    if (result && result.success) {
      try {
        const AuditLog = require('./auditLog');
        AuditLog.log({
          userId: entry.entered_by || entry.created_by || 'system',
          action: 'journalPosted',
          entityType: 'journal',
          entityId: String(result.id),
          details: {
            date: entry.date, reference: entry.reference || null,
            source_type: entry.source_type || null, source_id: entry.source_id != null ? entry.source_id : null,
            debit: totalDebit, credit: totalCredit,
            lines: lines.length,
          },
        });
      } catch (auditErr) { console.error('[journalEntries.post] audit log failed:', auditErr.message); }
    }
    return result;
  },

  // ── Void a journal entry ─────────────────────────────────────────────────
  voidEntry: (id) => {
    const res = db.prepare("UPDATE journal_entries SET status = 'Void', created_at = datetime('now') WHERE id = ?").run(id);
    if (res.changes > 0) {
      try {
        const AuditLog = require('./auditLog');
        AuditLog.log({
          userId: 'system',
          action: 'journalVoided',
          entityType: 'journal',
          entityId: String(id),
          details: { reason: 'voided by source operation' },
        });
      } catch (auditErr) { console.error('[journalEntries.voidEntry] audit log failed:', auditErr.message); }
    }
    return { success: res.changes > 0 };
  },

  // ── Fetch all journal entries ────────────────────────────────────────────
  getAll: ({ from, to, source_type, limit = 500 } = {}) => {
    let where = '1=1';
    const params = [];
    if (from) { where += ' AND date >= ?'; params.push(from); }
    if (to)   { where += ' AND date <= ?'; params.push(to); }
    if (source_type) { where += ' AND source_type = ?'; params.push(source_type); }
    const entries = db.prepare(`
      SELECT * FROM journal_entries WHERE ${where}
      ORDER BY date DESC, id DESC LIMIT ${Number(limit)}
    `).all(...params);
    // Attach lines
    for (const e of entries) {
      e.lines = db.prepare(`
        SELECT jl.*, c.name AS accountName, c.number AS accountNumber
        FROM journal_lines jl
        LEFT JOIN chart_of_accounts c ON jl.account_id = c.id
        WHERE jl.journal_id = ?
        ORDER BY jl.id
      `).all(e.id);
    }
    // Attach drill-down source info (number / party / date)
    return JournalEntries.attachSourceInfo(entries);
  },

  // ── Resolve source details (number, party, date) for drill-down ──────────
  attachSourceInfo: (entries) => {
    if (!Array.isArray(entries)) return entries;
    const groups = {};
    for (const e of entries) {
      if (!e.source_type || !e.source_id) continue;
      (groups[e.source_type] || (groups[e.source_type] = [])).push(e.source_id);
    }
    const ph = (ids) => ids.map(() => '?').join(',');
    const partyName = (r) => {
      if (!r) return '';
      return r.display_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || r.company_name || '';
    };
    const apply = (rows, type, pick) => {
      const map = new Map(rows.map(r => [r.id, r]));
      for (const e of entries) if (e.source_type === type) { const r = map.get(e.source_id); if (r) e.source = pick(r); }
    };
    try {
      if (groups.invoice) apply(db.prepare(`SELECT i.id, i.number, i.start_date, c.id AS customer_id, c.display_name, c.first_name, c.last_name, c.company_name FROM invoices i LEFT JOIN customers c ON c.id = i.customer WHERE i.id IN (${ph(groups.invoice)})`).all(...groups.invoice), 'invoice', r => ({ number: r.number || '', party: partyName(r), partyType: 'customer', partyId: r.customer_id || null, date: r.start_date || '' }));
    } catch (e) { console.error('[journalEntries] invoice source lookup failed:', e.message); }
    try {
      if (groups.expense || groups.bill_payment) {
        const ids = (groups.expense || []).concat(groups.bill_payment || []);
        const map = new Map(db.prepare(`SELECT e.id, e.ref_no, e.payment_date, s.id AS supplier_id, s.display_name, s.first_name, s.last_name, s.company_name FROM expenses e LEFT JOIN suppliers s ON s.id = e.payee WHERE e.id IN (${ph(ids)})`).all(...ids).map(r => [r.id, r]));
        for (const e of entries) if (e.source_type === 'expense' || e.source_type === 'bill_payment') { const r = map.get(e.source_id); if (r) e.source = { number: r.ref_no || '', party: partyName(r), partyType: 'supplier', partyId: r.supplier_id || null, date: r.payment_date || '' }; }
      }
    } catch (e) { console.error('[journalEntries] bill source lookup failed:', e.message); }
    try {
      if (groups.payment) apply(db.prepare(`SELECT p.id, p.reference, p.date, c.id AS customer_id, c.display_name, c.first_name, c.last_name, c.company_name FROM payments p LEFT JOIN invoices i ON i.id = p.invoiceId LEFT JOIN customers c ON c.id = i.customer WHERE p.id IN (${ph(groups.payment)})`).all(...groups.payment), 'payment', r => ({ number: r.reference || ('PMT-' + r.id), party: partyName(r), partyType: 'customer', partyId: r.customer_id || null, date: (r.date || '').slice(0, 10) }));
    } catch (e) { console.error('[journalEntries] payment source lookup failed:', e.message); }
    try {
      if (groups.deposit) apply(db.prepare(`SELECT d.id, d.reference, d.date, c.name AS bank_name FROM deposits d LEFT JOIN chart_of_accounts c ON c.id = d.bank_account_id WHERE d.id IN (${ph(groups.deposit)})`).all(...groups.deposit), 'deposit', r => ({ number: r.reference || ('DEP-' + r.id), party: r.bank_name || '', date: r.date || '' }));
    } catch (e) { console.error('[journalEntries] deposit source lookup failed:', e.message); }
    try {
      if (groups.transaction) {
        const rows = db.prepare(`SELECT t.id, t.reference, t.date, t.payee_name FROM transactions t WHERE t.id IN (${ph(groups.transaction)})`).all(...groups.transaction);
        const map = new Map(rows.map(r => [r.id, r]));
        const billRefs = [];
        for (const e of entries) {
          if (e.source_type !== 'transaction') continue;
          const r = map.get(e.source_id);
          if (!r) continue;
          const desc = e.description || '';
          const checkM = desc.match(/^Check\s*#(\S+)\s+to\s+(.+)$/i);
          if (checkM) {
            e.source = { kind: 'check', id: e.source_id, number: checkM[1], party: checkM[2].trim(), date: (r.date || '').slice(0, 10) };
            continue;
          }
          const payM = desc.match(/^Payment for bill\s+(\S+)\s*[-]\s*(.*)$/i);
          if (payM) { billRefs.push({ e, ref: payM[1].replace(/[^0-9A-Za-z-]/g, ''), party: payM[2].trim() }); continue; }
          e.source = { kind: 'transaction', id: e.source_id, number: r.reference || ('TX-' + r.id), party: r.payee_name || '', date: (r.date || '').slice(0, 10) };
        }
        const refs = [...new Set(billRefs.map(b => b.ref))];
        const billMap = new Map();
        for (const ref of refs) {
          const b = db.prepare(`SELECT e.id, e.ref_no, e.payment_date, s.id AS supplier_id, s.display_name, s.first_name, s.last_name, s.company_name FROM expenses e LEFT JOIN suppliers s ON s.id = e.payee WHERE e.ref_no = ? LIMIT 1`).get(ref);
          if (b) billMap.set(ref, b);
        }
        for (const { e, ref, party } of billRefs) {
          const b = billMap.get(ref);
          e.source = b
            ? { kind: 'bill', id: b.id, number: b.ref_no || ref, party: party || partyName(b), partyType: 'supplier', partyId: b.supplier_id || null, date: b.payment_date || '' }
            : { kind: 'bill', id: null, number: ref, party, date: '' };
        }
      }
    } catch (e) { console.error('[journalEntries] transaction source lookup failed:', e.message); }
    try {
      if (groups.vendor_credit) apply(db.prepare(`SELECT v.id, v.reference, v.date, s.id AS supplier_id, s.display_name, s.first_name, s.last_name, s.company_name FROM vendor_credits v LEFT JOIN suppliers s ON s.id = v.supplier_id WHERE v.id IN (${ph(groups.vendor_credit)})`).all(...groups.vendor_credit), 'vendor_credit', r => ({ number: r.reference || ('VC-' + r.id), party: partyName(r), partyType: 'supplier', partyId: r.supplier_id || null, date: r.date || '' }));
    } catch (e) { console.error('[journalEntries] vendor credit source lookup failed:', e.message); }
    try {
      if (groups.credit_note) apply(db.prepare(`SELECT cn.id, cn.credit_note_number, cn.date, cn.customer_name FROM credit_notes cn WHERE cn.id IN (${ph(groups.credit_note)})`).all(...groups.credit_note), 'credit_note', r => ({ number: r.credit_note_number || ('CN-' + r.id), party: r.customer_name || '', date: r.date || '' }));
    } catch (e) { console.error('[journalEntries] credit note source lookup failed:', e.message); }
    try {
      // Reconciliation adjustments post with source_id = the bank account id.
      if (groups.reconciliation) {
        const rows = db.prepare(`SELECT r.accountId, r.accountName, MAX(r.id) AS recId, r.statementDate, r.statementBalance FROM reconciliations r WHERE r.accountId IN (${ph(groups.reconciliation)}) GROUP BY r.accountId`).all(...groups.reconciliation);
        const map = new Map(rows.map(r => [r.accountId, r]));
        for (const e of entries) {
          if (e.source_type !== 'reconciliation') continue;
          const r = map.get(e.source_id);
          if (!r) continue;
          e.source = { kind: 'reconciliation', id: r.recId, number: r.accountName || ('Bank #' + r.accountId), party: r.accountName || '', date: r.statementDate || '', statementBalance: r.statementBalance ?? null };
        }
      }
    } catch (e) { console.error('[journalEntries] reconciliation source lookup failed:', e.message); }
    return entries;
  },

  // ── Full source detail for the drill-down modal ─────────────────────────
  getSourceDetail: (sourceType, sourceId) => {
    const st = sourceType;
    const id = Number(sourceId);
    // transfer/intercompany look up by reference string and seed needs no id,
    // so only require a numeric id for every other source type.
    const needsNumericId = !['transfer', 'intercompany_transfer', 'seed'].includes(st);
    if (needsNumericId && !id) return null;
    const partyName = (r) => r && (r.display_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || r.company_name || '');
    try {
      // INVOICE
      if (st === 'invoice') {
        const inv = db.prepare(`
          SELECT i.*, c.display_name, c.first_name, c.last_name, c.company_name
          FROM invoices i LEFT JOIN customers c ON c.id = i.customer WHERE i.id = ?
        `).get(id);
        if (!inv) return null;
        const lines = db.prepare(`SELECT il.*, p.name AS product_name FROM invoice_lines il LEFT JOIN products p ON il.product = p.id WHERE il.invoice_id = ?`).all(id);
        const subtotal = lines.reduce((s, l) => s + Number(l.amount || 0), 0);
        return {
          type: 'invoice', label: 'Invoice', number: inv.number, date: inv.start_date,
          party: partyName(inv), partyId: inv.customer || null, partyType: 'customer', partyLabel: 'Customer', status: inv.status,
          total: subtotal * (1 + Number(inv.vat || 0) / 100), memo: inv.message,
          lines: lines.map(l => ({ description: l.description || l.product_name || '', quantity: l.quantity, rate: l.rate, amount: l.amount, account: '' })),
        };
      }
      // BILL / EXPENSE
      if (st === 'expense' || st === 'bill_payment') {
        const exp = db.prepare(`
          SELECT e.*, s.display_name, s.first_name, s.last_name, s.company_name, c.name AS payment_account_name
          FROM expenses e
          LEFT JOIN suppliers s ON e.payee = s.id
          LEFT JOIN chart_of_accounts c ON e.payment_account = c.id
          WHERE e.id = ?
        `).get(id);
        if (!exp) return null;
        const lines = db.prepare(`SELECT * FROM expense_lines WHERE expense_id = ?`).all(id);
        const total = lines.reduce((s, l) => s + Number(l.amount || 0), 0);
        return {
          type: 'bill', label: st === 'bill_payment' ? 'Bill Payment' : 'Bill', number: exp.ref_no, date: exp.payment_date,
          party: partyName(exp), partyId: exp.payee || null, partyType: 'supplier', partyLabel: 'Vendor', status: exp.approval_status || exp.status,
          total: total || exp.amount || 0, memo: exp.memo,
          lines: lines.map(l => ({ description: l.description || '', quantity: 1, rate: l.amount, amount: l.amount, account: l.category || '' })),
        };
      }
      // PAYMENT
      if (st === 'payment') {
        const pay = db.prepare(`
          SELECT p.*, i.number AS invoice_number, c.display_name, c.first_name, c.last_name, c.company_name
          FROM payments p
          LEFT JOIN invoices i ON p.invoiceId = i.id
          LEFT JOIN customers c ON p.customerId = c.id
          WHERE p.id = ?
        `).get(id);
        if (!pay) return null;
        return {
          type: 'payment', label: 'Payment', number: pay.reference || ('PMT-' + pay.id), date: (pay.date || '').slice(0, 10),
          party: partyName(pay), partyId: pay.customerId || null, partyType: 'customer', partyLabel: 'Customer', status: pay.status,
          total: pay.amount, memo: pay.memo,
          lines: [{ description: pay.invoice_number ? `Invoice ${pay.invoice_number}` : 'Payment received', quantity: 1, rate: pay.amount, amount: pay.amount, account: '' }],
        };
      }
      // DEPOSIT
      if (st === 'deposit') {
        const Deposits = require('./deposits');
        const dep = Deposits.getById(id);
        if (!dep) return null;
        const allocLines = (dep.allocations || []).map(a => ({ description: a.description || 'Deposit allocation', quantity: 1, rate: a.amount, amount: a.amount, account: a.account_name || '' }));
        const paymentLines = (dep.payments || []).map(p => ({ description: `Payment${p.invoice_number ? ' · ' + p.invoice_number : ''}${p.customer_name ? ' — ' + p.customer_name : ''}`, quantity: 1, rate: p.amount, amount: p.amount, account: 'Undeposited Funds' }));
        return {
          type: 'deposit', label: 'Deposit', number: dep.reference || ('DEP-' + dep.id), date: dep.date,
          party: dep.bank_account_name, partyLabel: 'Bank Account', status: dep.status,
          total: dep.total_amount, memo: dep.memo,
          lines: allocLines.length ? allocLines : paymentLines,
        };
      }
      // TRANSACTION (check / bill payment / expense / generic)
      if (st === 'transaction') {
        const tx = db.prepare(`
          SELECT t.*, c.name AS account_name FROM transactions t LEFT JOIN chart_of_accounts c ON t.accountId = c.id WHERE t.id = ?
        `).get(id);
        if (!tx) return null;
        const typeLabel = (tx.type || 'Transaction').replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
        let splitLines = [];
        try {
          const parsed = typeof tx.categories === 'string' ? JSON.parse(tx.categories) : tx.categories;
          if (Array.isArray(parsed)) splitLines = parsed;
        } catch {}
        const lines = splitLines.length
          ? splitLines.map(sl => ({ description: sl.description || sl.account || '', quantity: 1, rate: sl.amount, amount: sl.amount, account: sl.account || sl.category || '' }))
          : [{ description: tx.description || '', quantity: 1, rate: tx.amount, amount: tx.amount, account: tx.account_name || '' }];
        return {
          type: 'transaction', label: typeLabel, number: tx.reference || ('TX-' + tx.id), date: (tx.date || '').slice(0, 10),
          party: tx.payee_name, partyLabel: 'Payee', status: tx.status,
          total: tx.amount || Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0), memo: tx.description,
          lines,
        };
      }
      // VENDOR CREDIT
      if (st === 'vendor_credit') {
        const vc = db.prepare(`
          SELECT vc.*, COALESCE(s.display_name, s.first_name || ' ' || s.last_name, '') AS supplier_name
          FROM vendor_credits vc LEFT JOIN suppliers s ON s.id = vc.supplier_id WHERE vc.id = ?
        `).get(id);
        if (!vc) return null;
        return {
          type: 'vendor_credit', label: 'Vendor Credit', number: vc.reference || ('VC-' + vc.id), date: vc.date,
          party: vc.supplier_name, partyId: vc.supplier_id || null, partyType: 'supplier', partyLabel: 'Vendor', status: vc.status,
          total: vc.amount, memo: vc.memo,
          lines: [{ description: vc.memo || 'Vendor Credit', quantity: 1, rate: vc.amount, amount: vc.amount, account: '' }],
        };
      }
      // CREDIT NOTE
      if (st === 'credit_note') {
        const CreditNotes = require('./creditNotes');
        const cn = CreditNotes.getById(id);
        if (!cn) return null;
        return {
          type: 'credit_note', label: 'Credit Note', number: cn.credit_note_number, date: cn.date,
          party: cn.customer_name, partyLabel: 'Customer', status: cn.status,
          total: cn.total, memo: cn.reason || cn.notes,
          lines: (cn.lines || []).map(l => ({ description: l.description || '', quantity: l.quantity, rate: l.unit_price, amount: l.amount, account: '' })),
        };
      }
      // QUOTE
      if (st === 'quote') {
        const q = db.prepare(`
          SELECT q.*, c.display_name, c.first_name, c.last_name, c.company_name
          FROM quotes q LEFT JOIN customers c ON c.id = q.customer WHERE q.id = ?
        `).get(id);
        if (!q) return null;
        const lines = db.prepare(`SELECT ql.*, p.name AS product_name FROM quote_lines ql LEFT JOIN products p ON ql.product = p.id WHERE ql.quote_id = ?`).all(id);
        const subtotal = lines.reduce((s, l) => s + Number(l.amount || 0), 0);
        return {
          type: 'quote', label: 'Quote', number: q.number || ('QT-' + q.id), date: q.start_date,
          party: partyName(q), partyId: q.customer || null, partyType: 'customer', partyLabel: 'Customer', status: q.status,
          total: subtotal * (1 + Number(q.vat || 0) / 100), memo: q.message,
          lines: lines.map(l => ({ description: l.description || l.product_name || '', quantity: l.quantity, rate: l.rate, amount: l.amount, account: '' })),
        };
      }
      // RECURRING TEMPLATE
      if (st === 'recurring') {
        const rt = db.prepare('SELECT * FROM recurring_transactions WHERE id = ?').get(id);
        if (!rt) return null;
        let payload = {};
        try { payload = typeof rt.payload === 'string' ? JSON.parse(rt.payload || '{}') : (rt.payload || {}); } catch {}
        return {
          type: 'recurring', label: 'Recurring Transaction', number: 'REC-' + rt.id, date: rt.nextDate,
          party: payload.customerName || rt.kind || '', partyLabel: 'Recurring', status: rt.status,
          total: rt.amount, memo: rt.description,
          lines: [{ description: rt.description || 'Recurring transaction', quantity: 1, rate: rt.amount, amount: rt.amount, account: rt.kind || '' }],
        };
      }
      // JOURNAL ENTRY (reversal / void)
      if (st === 'journal') {
        const je = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(id);
        if (!je) return null;
        const lines = db.prepare(`
          SELECT jl.*, c.name AS accountName, c.number AS accountNumber
          FROM journal_lines jl LEFT JOIN chart_of_accounts c ON jl.account_id = c.id
          WHERE jl.journal_id = ? ORDER BY jl.id
        `).all(id);
        return {
          type: 'journal', label: je.source_type === 'reversal' ? 'Reversal' : 'Void', number: je.reference || ('#' + je.id), date: je.date,
          party: je.entered_by || je.created_by || '', partyLabel: 'Entered By', status: je.status,
          total: lines.reduce((s, l) => s + (Number(l.debit) || 0), 0), memo: je.description,
          lines: lines.map(l => ({ description: l.description || '', account: l.accountName || '', quantity: 1, rate: Number(l.debit) || Number(l.credit) || 0, amount: Number(l.debit) || Number(l.credit) || 0 })),
        };
      }
// BANK RECONCILIATION ADJUSTMENT (source_id = the bank account id)
      if (st === 'reconciliation') {
        const acct = db.prepare('SELECT name, number FROM chart_of_accounts WHERE id = ?').get(id);
        const rec = acct
          ? db.prepare('SELECT * FROM reconciliations WHERE accountId = ? ORDER BY statementDate DESC, id DESC LIMIT 1').get(acct.id)
          : null;
        const label = (rec && rec.accountName) || (acct && acct.name) || ('Bank #' + id);
        return {
          type: 'reconciliation', label: 'Bank Reconciliation Adjustment', number: label, date: rec ? rec.statementDate : '',
          party: label, partyLabel: 'Bank Account', status: 'Posted',
          total: rec && rec.statementBalance != null ? rec.statementBalance : null,
          memo: rec ? `Statement date ${rec.statementDate || ''}` : 'Bank reconciliation adjustment',
          lines: [],
        };
      }
// TRANSFER / INTERCOMPANY TRANSFER (source_id = the shared reference)
      if (st === 'transfer' || st === 'intercompany_transfer') {
        const tx = db.prepare(`
          SELECT * FROM transactions
          WHERE reference = ? AND LOWER(type) IN ('transfer_in','transfer_out','intercompany')
          ORDER BY id ASC LIMIT 1
        `).get(String(sourceId));
        if (!tx) return null;
        const acct = db.prepare('SELECT name FROM chart_of_accounts WHERE id = ?').get(tx.accountId);
        const isInter = st === 'intercompany_transfer' || String(tx.type || '').toLowerCase() === 'intercompany';
        return {
          type: isInter ? 'intercompany_transfer' : 'transfer',
          label: isInter ? 'Intercompany Transfer' : 'Bank Transfer',
          number: tx.reference || ('TR-' + tx.id), date: (tx.date || '').slice(0, 10),
          party: isInter ? (tx.isIntercompany ? 'Intercompany' : '') : acct?.name || '',
          partyLabel: 'Bank Account', status: tx.status || 'Posted',
          total: tx.amount || Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0), memo: tx.description,
          lines: [{ description: tx.description || acct?.name || 'Bank transfer', quantity: 1, rate: tx.amount || Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0), amount: tx.amount || Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0), account: acct?.name || '' }],
        };
      }
      // PAYROLL RUN (payroll runs are not journal-posted; show the run summary)
      if (st === 'payroll') {
        const run = db.prepare(`
          SELECT pr.*
          FROM payroll_runs pr
          WHERE pr.id = ?
        `).get(id);
        if (!run) return null;
        return {
          type: 'payroll', label: 'Payroll Run', number: 'PR-' + run.id, date: run.processed_date,
          party: 'Payroll', partyLabel: 'Payroll', status: run.status,
          total: run.total_net_pay, memo: run.notes,
          lines: [{ description: `Pay period ${run.pay_period_start || ''} → ${run.pay_period_end || ''}`, quantity: run.payments_count, rate: run.total_net_pay, amount: run.total_net_pay, account: '' }],
        };
      }
      // SEED SAMPLE DATA
      if (st === 'seed') {
        return {
          type: 'seed', label: 'Sample Data', number: 'SEED-' + (sourceId != null ? sourceId : ''), date: '',
          party: 'System', partyLabel: 'Seed', status: 'Posted',
          total: null, memo: 'Sample journal entry created during system seeding',
          lines: [],
        };
      }
      return null;
    } catch (e) {
      console.error('[journalEntries] getSourceDetail failed:', e.message);
      return { error: e.message };
    }
  },

  // ── Lines for a specific account ─────────────────────────────────────────
  getByAccount: (accountId, { from, to, limit = 300 } = {}) => {
    let where = "jl.account_id = ? AND je.status != 'Void'";
    const params = [accountId];
    if (from) { where += ' AND je.date >= ?'; params.push(from); }
    if (to)   { where += ' AND je.date <= ?'; params.push(to); }
    return db.prepare(`
      SELECT jl.id, jl.debit, jl.credit, jl.description AS lineDesc,
             je.id AS journalId, je.date, je.reference, je.description,
             je.source_type, je.source_id, je.status, je.memo
      FROM journal_lines jl
      JOIN journal_entries je ON jl.journal_id = je.id
      WHERE ${where}
      ORDER BY je.date DESC, je.id DESC
      LIMIT ${Number(limit)}
    `).all(...params);
  },

  // ── Fetch a single journal entry with its lines (drill-down) ──────────
  getById: (id) => {
    const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(id);
    if (!entry) return null;
    entry.lines = db.prepare(`
      SELECT jl.*, c.name AS accountName, c.number AS accountNumber
      FROM journal_lines jl
      LEFT JOIN chart_of_accounts c ON jl.account_id = c.id
      WHERE jl.journal_id = ?
      ORDER BY jl.id
    `).all(id);
    return entry;
  },

  // ── Check if a source has already been journalised ──────────────────────
  hasPosting: (source_type, source_id) => {
    const row = db.prepare("SELECT id FROM journal_entries WHERE source_type = ? AND source_id = ? AND status = 'Posted' LIMIT 1")
      .get(source_type, source_id);
    return !!row;
  },

  // ── Reverse a previously posted entry (creates counter-entry) ───────────
  reverse: (journalId, date, created_by) => {
    const orig = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(journalId);
    if (!orig) throw new Error('Original entry not found');
    const origLines = db.prepare('SELECT * FROM journal_lines WHERE journal_id = ?').all(journalId);
    const reversedLines = origLines.map(l => ({
      account_id: l.account_id, debit: l.credit, credit: l.debit, description: l.description,
      class: l.class, location: l.location, department: l.department,
    }));
    return JournalEntries.post({
      date, description: `Reversal of entry #${journalId}: ${orig.description || ''}`,
      source_type: 'reversal', source_id: journalId, created_by,
      lines: reversedLines,
    });
  },

  // ── POST FROM INVOICE ──────────────────────────────────────────────────
  // DR Accounts Receivable (full total) / CR each income account per invoice line
  postInvoice: (invoice) => {
    if (JournalEntries.hasPosting('invoice', invoice.id)) return { skipped: true };
    // Never re-post voided/voided invoices (guards against startup auto-repost reviving them).
    try {
      const invRow = db.prepare("SELECT LOWER(COALESCE(status, '')) AS status FROM invoices WHERE id = ?").get(Number(invoice.id));
      if (invRow && (invRow.status === 'void' || invRow.status === 'voided')) return { skipped: true };
    } catch (_) {}
    const COA = require('./chartOfAccounts');
    const ar = COA.getSystemAccount('Accounts Receivable') || COA.getByName('Accounts Receivable');
    if (!ar) return { error: 'Accounts Receivable account not found in COA' };

    // Resolve fallback revenue account (used when a line has no income_account)
    const fallbackRevenue = COA.getByName('Sales Revenue') || COA.getByName('Service Revenue')
      || db.prepare("SELECT * FROM chart_of_accounts WHERE (LOWER(type)='income' OR LOWER(type)='other income') AND status='Active' LIMIT 1").get();
    if (!fallbackRevenue) return { error: 'No revenue/income account found in COA' };

    // Fetch invoice lines to credit the correct income account per product
    let invoiceLines = [];
    try {
      invoiceLines = db.prepare(`
        SELECT il.amount, il.quantity, il.description, il.product,
               p.income_account, p.income_account_id
        FROM invoice_lines il
        LEFT JOIN products p ON il.product = p.id
        WHERE il.invoice_id = ?
      `).all(Number(invoice.id));
    } catch { invoiceLines = []; }

    const vat = (() => {
      try { return Number(db.prepare('SELECT vat FROM invoices WHERE id = ?').get(Number(invoice.id))?.vat || 0); }
      catch { return 0; }
    })();

    // Build credit lines — one per invoice line mapped to its income account
    const creditLines = [];
    let totalCredit = 0;
    for (const line of invoiceLines) {
      const lineAmt = (Number(line.amount) || 0) * (1 + vat / 100);
      if (lineAmt <= 0) continue;

      let incomeAcctId = null;
      if (line.income_account_id) {
        const byId = db.prepare("SELECT id FROM chart_of_accounts WHERE id = ? AND status = 'Active'").get(Number(line.income_account_id));
        if (byId) incomeAcctId = byId.id;
      }
      if (!incomeAcctId && line.income_account) {
        const acct = db.prepare("SELECT id FROM chart_of_accounts WHERE name = ? OR number = ? LIMIT 1").get(line.income_account, line.income_account);
        if (acct) incomeAcctId = acct.id;
      }
      if (!incomeAcctId) incomeAcctId = fallbackRevenue.id;

      creditLines.push({ account_id: incomeAcctId, debit: 0, credit: lineAmt, description: line.description || 'Revenue' });
      totalCredit += lineAmt;
    }

    // If no lines found, fall back to invoice total against fallback revenue
    if (!creditLines.length) {
      const amount = Number(invoice.total || invoice.amount || 0);
      if (!amount) return { error: 'Invoice has zero amount' };
      creditLines.push({ account_id: fallbackRevenue.id, debit: 0, credit: amount, description: 'Revenue' });
      totalCredit = amount;
    }

    if (totalCredit <= 0) return { error: 'Invoice has zero amount' };

    try {
      return JournalEntries.post({
        date: invoice.date || invoice.invoiceDate || new Date().toISOString().slice(0, 10),
        reference: invoice.number || String(invoice.id),
        description: `Invoice ${invoice.number || '#' + invoice.id} — ${invoice.customerName || ''}`,
        source_type: 'invoice', source_id: invoice.id,
        lines: [
          { account_id: ar.id, debit: totalCredit, credit: 0, description: 'Accounts Receivable' },
          ...creditLines,
        ],
      });
    } catch (e) { return { error: e.message }; }
  },

  // ── POST FROM PAYMENT ─────────────────────────────────────────────────
  // DR Bank/Undeposited Funds / CR Accounts Receivable
  postPayment: (payment) => {
    if (JournalEntries.hasPosting('payment', payment.id)) return { skipped: true };
    const COA = require('./chartOfAccounts');
    const ar = COA.getSystemAccount('Accounts Receivable');
    let bank = COA.getSystemAccount('Undeposited Funds') || COA.getByName('Undeposited Funds');
    // Honor an explicit "Deposit To" account if it resolves; otherwise undeposited funds.
    // Resolve by unique Account ID first (preferred), then by name/number (legacy).
    // Only Bank/Cash/Undeposited Funds type accounts are valid deposit targets —
    // depositing into an arbitrary account would mispost the register.
    if (payment.bankAccountName) {
      const idMatch = /^\d+$/.test(String(payment.bankAccountName).trim())
        ? db.prepare("SELECT * FROM chart_of_accounts WHERE id = ?").get(Number(payment.bankAccountName))
        : null;
      const chosen = idMatch
        || COA.getByName(payment.bankAccountName)
        || COA.getSystemAccount(payment.bankAccountName)
        || db.prepare('SELECT * FROM chart_of_accounts WHERE number = ? LIMIT 1').get(payment.bankAccountName);
      if (chosen) {
        const type = String(chosen.type || chosen.accountType || '').toLowerCase();
        const isDepositTarget = type === 'bank' || type === 'cash' || type === 'undeposited funds'
          || /undeposited/i.test(chosen.name || '');
        if (!isDepositTarget) {
          return { error: `Deposit To account "${chosen.name || chosen.accountName}" is not a bank account.` };
        }
        bank = chosen;
      }
    }
    if (!ar || !bank) return { error: 'Required COA accounts not found (AR/Bank)' };

    const amount = Number(payment.amount || 0);
    if (!amount) return { error: 'Payment has zero amount' };

    try {
      return JournalEntries.post({
        date: payment.date || new Date().toISOString().slice(0, 10),
        reference: payment.reference || String(payment.id),
        description: `Payment received — ${payment.customerName || ''}`,
        source_type: 'payment', source_id: payment.id,
        lines: [
          { account_id: bank.id, debit: amount,  credit: 0,      description: 'Payment received' },
          { account_id: ar.id,   debit: 0,        credit: amount, description: 'Accounts Receivable cleared' },
        ],
      });
    } catch (e) { return { error: e.message }; }
  },

  // ── POST FROM EXPENSE / BILL ──────────────────────────────────────────
  // DR each expense line's account / CR Accounts Payable (full total)
  postExpense: (expense) => {
    if (JournalEntries.hasPosting('expense', expense.id)) return { skipped: true };
    const COA = require('./chartOfAccounts');
    const ap = COA.getSystemAccount('Accounts Payable');
    if (!ap) return { error: 'Accounts Payable account not found in COA' };

    // Fallback expense account for lines whose category doesn't match any COA account
    const fallbackExpAcct = COA.getByName('General Expenses')
      || db.prepare("SELECT * FROM chart_of_accounts WHERE type = 'Expense' AND status = 'Active' LIMIT 1").get();
    if (!fallbackExpAcct) return { error: 'No expense account found in COA' };

    // Fetch expense lines — category is a plain TEXT column (not a FK)
    let expenseLines = [];
    try {
      expenseLines = db.prepare(
        `SELECT amount, description, category, account_id, line_type FROM expense_lines WHERE expense_id = ?`
      ).all(Number(expense.id));
    } catch {
      // `line_type` is owned by models/expenses.js, which may not have been
      // loaded yet (this model does not require it). Fall back to the original
      // projection rather than swallowing the error and posting nothing at all —
      // an empty line set silently falls through to the expense-level total.
      try {
        expenseLines = db.prepare(
          `SELECT amount, description, category, account_id FROM expense_lines WHERE expense_id = ?`
        ).all(Number(expense.id));
      } catch { expenseLines = []; }
    }

    const debitLines = [];
    let totalDebit = 0;

    for (const line of expenseLines) {
      const lineAmt = Number(line.amount) || 0;
      if (lineAmt <= 0) continue;

      // Prefer the stored account_id (exact account), fall back to name match
      let acctId = null;
      if (line.account_id) {
        const byId = db.prepare(`SELECT id FROM chart_of_accounts WHERE id = ? AND status = 'Active'`).get(Number(line.account_id));
        if (byId) acctId = byId.id;
      }

      // An INVENTORY line capitalises stock, so it belongs to Inventory Asset.
      // If its stored account is missing or has been deactivated, resolve the
      // system account directly instead of falling through to an expense
      // account: booking stock as an expense understates the balance sheet and
      // overstates profit. `models/expenses.js` resolves this at write time, so
      // this branch is the backstop for legacy or hand-edited rows.
      if (!acctId && String(line.line_type || '').trim().toLowerCase() === 'item') {
        const inv = COA.getSystemAccount('Inventory Asset');
        if (inv && inv.id != null) acctId = Number(inv.id);
      }

      if (!acctId && line.category) {
        const matched = db.prepare(
          `SELECT id FROM chart_of_accounts
           WHERE LOWER(name) = LOWER(?) AND status = 'Active'
           LIMIT 1`
        ).get(line.category);
        if (matched) acctId = matched.id;
      }
      if (!acctId) acctId = fallbackExpAcct.id;

      debitLines.push({ account_id: acctId, debit: lineAmt, credit: 0, description: line.description || line.category || 'Expense' });
      totalDebit += lineAmt;
    }

    // If no lines, fall back to expense-level total + category/description
    if (!debitLines.length) {
      const amount = Number(expense.amount || expense.total || 0);
      if (!amount) return { error: 'Expense has zero amount' };
      let acctId = fallbackExpAcct.id;
      if (expense.category) {
        const acctByName = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(name) = LOWER(?) AND status='Active' LIMIT 1").get(expense.category);
        if (acctByName) acctId = acctByName.id;
      }
      debitLines.push({ account_id: acctId, debit: amount, credit: 0, description: expense.description || expense.category || 'Expense' });
      totalDebit = amount;
    }

    if (totalDebit <= 0) return { error: 'Expense has zero amount' };

    try {
      return JournalEntries.post({
        date: expense.date || new Date().toISOString().slice(0, 10),
        reference: expense.reference || String(expense.id),
        description: `Expense: ${expense.description || expense.category || ''}`,
        source_type: 'expense', source_id: expense.id,
        lines: [
          ...debitLines,
          { account_id: ap.id, debit: 0, credit: totalDebit, description: 'Accounts Payable' },
        ],
      });
    } catch (e) { return { error: e.message }; }
  },

  // ── POST FROM CREDIT CARD / LOAN RECLASSIFICATION BILL ─────────────
  // DR Credit Card / Loan account(s) / CR Accounts Payable
  // Used when a bill from a Credit Card vendor or Loan lender uses
  // the same credit card or loan account as its distribution line,
  // with no expense/asset accounts involved.
  postExpenseReclassification: (expense) => {
    if (JournalEntries.hasPosting('expense', expense.id)) return { skipped: true };
    const COA = require('./chartOfAccounts');
    const ap = COA.getSystemAccount('Accounts Payable');
    if (!ap) return { error: 'Accounts Payable account not found in COA' };

    let expenseLines = [];
    try {
      expenseLines = db.prepare(
        `SELECT amount, description, category, account_id FROM expense_lines WHERE expense_id = ?`
      ).all(Number(expense.id));
    } catch { expenseLines = []; }

    const debitLines = [];
    let totalDebit = 0;

    for (const line of expenseLines) {
      const lineAmt = Number(line.amount) || 0;
      if (lineAmt <= 0) continue;
      let acctId = null;
      if (line.account_id) {
        const byId = db.prepare(`SELECT id FROM chart_of_accounts WHERE id = ? AND status = 'Active'`).get(Number(line.account_id));
        if (byId) acctId = byId.id;
      }
      if (!acctId && line.category) {
        const matched = db.prepare(
          `SELECT id FROM chart_of_accounts
           WHERE LOWER(name) = LOWER(?) AND status = 'Active'
           LIMIT 1`
        ).get(line.category);
        if (matched) acctId = matched.id;
      }
      if (!acctId) continue;
      debitLines.push({ account_id: acctId, debit: lineAmt, credit: 0, description: `Reclassify to AP: ${line.description || line.category || ''}` });
      totalDebit += lineAmt;
    }

    if (!debitLines.length) return { error: 'No valid credit card / loan account lines found' };
    if (totalDebit <= 0) return { error: 'Expense has zero amount' };

    try {
      return JournalEntries.post({
        date: expense.date || new Date().toISOString().slice(0, 10),
        reference: expense.reference || String(expense.id),
        description: `Reclassify to AP: ${expense.description || expense.category || ''}`,
        source_type: 'expense', source_id: expense.id,
        lines: [
          ...debitLines,
          { account_id: ap.id, debit: 0, credit: totalDebit, description: 'Accounts Payable' },
        ],
      });
    } catch (e) { return { error: e.message }; }
  },

  // ── POST FROM TRANSACTION (checks, credit card charges, bank txns) ────
  // DR each split-line expense account / CR the bank/cash account
  postTransaction: (tx) => {
    const COA = require('./chartOfAccounts');
    if (!tx.accountId) return { error: 'Transaction has no accountId (bank/cash account)' };
    const bankAcct = db.prepare('SELECT * FROM chart_of_accounts WHERE id = ?').get(tx.accountId);
    if (!bankAcct) return { error: 'Bank/cash account not found in COA' };

    const splitLines = Array.isArray(tx.splitLines) ? tx.splitLines : [];
    const fallbackExpAcct = COA.getByName('General Expenses')
      || db.prepare("SELECT * FROM chart_of_accounts WHERE type = 'Expense' AND status = 'Active' LIMIT 1").get();
    if (!fallbackExpAcct && !splitLines.length) return { error: 'No expense account found in COA' };

    const debitLines = [];
    let totalDebit = 0;

    for (const line of splitLines) {
      const lineAmt = Number(line.amount) || 0;
      if (lineAmt <= 0) continue;
      const acctName = line.account || line.category || '';
      let acctId = null;
      if (line.accountId) {
        const byId = db.prepare("SELECT id FROM chart_of_accounts WHERE id = ? AND status = 'Active'").get(Number(line.accountId));
        if (byId) acctId = byId.id;
      }
      if (!acctId && acctName) {
        const matched = db.prepare(
          "SELECT id FROM chart_of_accounts WHERE LOWER(name) = LOWER(?) AND status = 'Active' LIMIT 1"
        ).get(acctName);
        if (matched) acctId = matched.id;
      }
      if (!acctId && fallbackExpAcct) acctId = fallbackExpAcct.id;
      if (!acctId) continue;

      debitLines.push({ account_id: acctId, debit: lineAmt, credit: 0, description: line.description || acctName || 'Expense' });
      totalDebit += lineAmt;
    }

    // If no split lines, use the full amount against the fallback expense account
    if (!debitLines.length) {
      const amount = Number(tx.amount || 0);
      if (!amount) return { error: 'Transaction has zero amount' };
      debitLines.push({ account_id: fallbackExpAcct.id, debit: amount, credit: 0, description: tx.description || 'Expense' });
      totalDebit = amount;
    }

    if (totalDebit <= 0) return { error: 'Transaction has zero amount' };

    try {
      return JournalEntries.post({
        date: tx.date || new Date().toISOString().slice(0, 10),
        reference: tx.reference || String(tx.id || ''),
        description: tx.description || 'Transaction',
        source_type: 'transaction', source_id: tx.id || null,
        lines: [
          ...debitLines,
          { account_id: bankAcct.id, debit: 0, credit: totalDebit, description: bankAcct.name || 'Bank Account' },
        ],
      });
    } catch (e) { return { error: e.message }; }
  },
};

// ── Seed sample journal entries for demo ───────────────────────────────
JournalEntries.seedSampleData = () => {
  const count = db.prepare('SELECT COUNT(*) as c FROM journal_entries').get();
  if (count.c > 0) return { skipped: true, count: count.c };

  const COA = require('./chartOfAccounts');
  // Ensure we have enough COA accounts for a realistic demo
  const ensureAccount = (name, type, subType, number) => {
    const existing = db.prepare("SELECT id FROM chart_of_accounts WHERE name = ?").get(name);
    if (existing) return existing.id;
    db.prepare(`INSERT INTO chart_of_accounts (name, type, subType, number, normalBalance, status)
      VALUES (?, ?, ?, ?, ?, 'Active')`).run(name, type, subType, number, type === 'Asset' || type === 'Expense' || type === 'Cost of Goods Sold' ? 'Debit' : 'Credit');
    return db.prepare('SELECT last_insert_rowid() AS id').get().id;
  };
  const bankId    = ensureAccount('Checking Account',        'Bank',     'Checking',         '1000');
  const arId      = ensureAccount('Accounts Receivable',     'Asset',    'Accounts Receivable','1100');
  const apId      = ensureAccount('Accounts Payable',        'Liability','Accounts Payable', '2000');
  const rentId    = ensureAccount('Rent Expense',            'Expense',  'Rent',             '6100');
  const utilId    = ensureAccount('Utilities Expense',       'Expense',  'Utilities',        '6200');
  const officeId  = ensureAccount('Office Supplies Expense', 'Expense',  'Office Supplies',  '6300');
  const salaryId  = ensureAccount('Salaries & Wages',        'Expense',  'Salaries & Wages', '6400');
  const revenueId = ensureAccount('Service Revenue',         'Income',   'Service Income',   '4100');
  const cogsId    = ensureAccount('Cost of Goods Sold',      'Cost of Goods Sold','Cost of Goods Sold','5000');
  const reId      = ensureAccount('Retained Earnings',       'Equity',   'Retained Earnings','3900');

  const today = new Date();
  const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

  const post = (entry) => JournalEntries.post(entry);

  const sampleEntries = [
    // 1. Service revenue received (DR Bank, CR Revenue)
    { date: daysAgo(45), reference: 'SR-001', description: 'Consulting services - Q1 closing',
      source_type: 'seed', lines: [
        { account_id: bankId,    debit: 15000,  credit: 0,      description: 'Payment received' },
        { account_id: revenueId, debit: 0,       credit: 15000, description: 'Service revenue' },
      ]},
    // 2. Rent payment (DR Rent, CR Bank)
    { date: daysAgo(30), reference: 'EXP-RENT-001', description: 'Office rent - March',
      source_type: 'seed', lines: [
        { account_id: rentId,  debit: 5000,  credit: 0,    description: 'Monthly office rent' },
        { account_id: bankId,  debit: 0,     credit: 5000, description: 'Rent payment' },
      ]},
    // 3. Utilities payment (DR Utilities, CR Bank)
    { date: daysAgo(28), reference: 'EXP-UTIL-001', description: 'Electricity and water - March',
      source_type: 'seed', lines: [
        { account_id: utilId,  debit: 1200,  credit: 0,    description: 'Electricity + water bill' },
        { account_id: bankId,  debit: 0,     credit: 1200, description: 'Utilities payment' },
      ]},
    // 4. Office supplies (DR Office Supplies, CR Bank)
    { date: daysAgo(25), reference: 'EXP-OFF-001', description: 'Office supplies purchase',
      source_type: 'seed', lines: [
        { account_id: officeId, debit: 800,   credit: 0,    description: 'Stationery and supplies' },
        { account_id: bankId,   debit: 0,     credit: 800,  description: 'Office supplies payment' },
      ]},
    // 5. Invoice on account (DR AR, CR Revenue)
    { date: daysAgo(20), reference: 'INV-2025-001', description: 'Website development project - Client A',
      source_type: 'seed', lines: [
        { account_id: arId,     debit: 25000, credit: 0,      description: 'Invoice issued' },
        { account_id: revenueId, debit: 0,    credit: 25000,  description: 'Project revenue' },
      ]},
    // 6. Salaries (DR Salaries, CR Bank)
    { date: daysAgo(15), reference: 'PAYROLL-001', description: 'Bi-weekly payroll',
      source_type: 'seed', lines: [
        { account_id: salaryId, debit: 12000, credit: 0,     description: 'Employee salaries' },
        { account_id: bankId,   debit: 0,     credit: 12000, description: 'Salary payments' },
      ]},
    // 7. Bill received (DR COGS, CR AP)
    { date: daysAgo(10), reference: 'BILL-001', description: 'Server hosting - Q1',
      source_type: 'seed', lines: [
        { account_id: cogsId, debit: 3500, credit: 0,    description: 'Infrastructure costs' },
        { account_id: apId,   debit: 0,    credit: 3500, description: 'Vendor bill payable' },
      ]},
    // 8. Another service sale (DR Bank, CR Revenue)
    { date: daysAgo(5), reference: 'SR-002', description: 'Maintenance contract - Q2',
      source_type: 'seed', lines: [
        { account_id: bankId,    debit: 8000,  credit: 0,     description: 'Contract payment' },
        { account_id: revenueId, debit: 0,     credit: 8000,  description: 'Maintenance revenue' },
      ]},
    // 9. Bill paid (DR AP, CR Bank)
    { date: daysAgo(3), reference: 'PAY-AP-001', description: 'Payment to vendor - Server hosting',
      source_type: 'seed', lines: [
        { account_id: apId,   debit: 3500, credit: 0,    description: 'Vendor payment' },
        { account_id: bankId, debit: 0,    credit: 3500, description: 'Payment sent' },
      ]},
    // 10. AR collected (DR Bank, CR AR)
    { date: daysAgo(1), reference: 'PMT-AR-001', description: 'Payment received - Client A (partial)',
      source_type: 'seed', lines: [
        { account_id: bankId, debit: 15000, credit: 0,     description: 'Partial payment received' },
        { account_id: arId,   debit: 0,     credit: 15000, description: 'AR collection' },
      ]},
  ];

  let posted = 0;
  for (const entry of sampleEntries) {
    try { post(entry); posted++; }
    catch (e) { console.error('[journalEntries.seed] entry failed:', e.message); }
  }
  return { seeded: posted, total: sampleEntries.length };
};

JournalEntries.createTable();

// seedSampleData is NOT called automatically — it remains available
// for explicit invocation when demo/training data is desired.

module.exports = JournalEntries;
