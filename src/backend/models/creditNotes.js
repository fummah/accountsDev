const db = require('./dbmgr');

const CreditNotes = {
  createTable() {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS credit_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        credit_note_number TEXT,
        customer_id INTEGER,
        customer_name TEXT,
        invoice_id INTEGER,
        date TEXT NOT NULL,
        due_date TEXT,
        reason TEXT,
        status TEXT DEFAULT 'Draft',
        subtotal REAL DEFAULT 0,
        tax_amount REAL DEFAULT 0,
        total REAL DEFAULT 0,
        notes TEXT,
        entered_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS credit_note_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        credit_note_id INTEGER NOT NULL,
        description TEXT,
        quantity REAL DEFAULT 1,
        unit_price REAL DEFAULT 0,
        amount REAL DEFAULT 0,
        account_id INTEGER,
        tax_rate REAL DEFAULT 0,
        FOREIGN KEY (credit_note_id) REFERENCES credit_notes(id) ON DELETE CASCADE
      )
    `).run();
  },

  generateNumber() {
    const last = db.prepare(`SELECT credit_note_number FROM credit_notes ORDER BY id DESC LIMIT 1`).get();
    if (!last || !last.credit_note_number) return 'CN-0001';
    const num = parseInt(last.credit_note_number.replace(/\D/g, ''), 10) || 0;
    return `CN-${String(num + 1).padStart(4, '0')}`;
  },

  getAll() {
    return db.prepare(`SELECT * FROM credit_notes ORDER BY created_at DESC`).all();
  },

  getById(id) {
    const cn = db.prepare(`SELECT * FROM credit_notes WHERE id = ?`).get(id);
    if (!cn) return null;
    cn.lines = db.prepare(`SELECT * FROM credit_note_lines WHERE credit_note_id = ?`).all(id);
    return cn;
  },

  getByCustomer(customerId) {
    return db.prepare(`SELECT * FROM credit_notes WHERE customer_id = ? ORDER BY created_at DESC`).all(customerId);
  },

  insert(data, lines) {
    const number = data.credit_note_number || this.generateNumber();
    const subtotal = (lines || []).reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const taxAmount = (lines || []).reduce((s, l) => s + ((Number(l.amount) || 0) * (Number(l.tax_rate) || 0) / 100), 0);
    const total = subtotal + taxAmount;

    const result = db.prepare(`
      INSERT INTO credit_notes (credit_note_number, customer_id, customer_name, invoice_id, date, due_date, reason, status, subtotal, tax_amount, total, notes, entered_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      number,
      data.customer_id || null,
      data.customer_name || null,
      data.invoice_id || null,
      data.date || new Date().toISOString().slice(0, 10),
      data.due_date || null,
      data.reason || null,
      data.status || 'Draft',
      subtotal, taxAmount, total,
      data.notes || null,
      data.entered_by || null
    );

    const cnId = result.lastInsertRowid;
    if (Array.isArray(lines) && lines.length > 0) {
      const insertLine = db.prepare(`
        INSERT INTO credit_note_lines (credit_note_id, description, quantity, unit_price, amount, account_id, tax_rate)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const line of lines) {
        insertLine.run(cnId, line.description || '', Number(line.quantity) || 1, Number(line.unit_price) || 0, Number(line.amount) || 0, line.account_id || null, Number(line.tax_rate) || 0);
      }
    }

    return { success: true, id: cnId, credit_note_number: number };
  },

  update(id, data) {
    const existing = db.prepare(`SELECT * FROM credit_notes WHERE id = ?`).get(id);
    if (!existing) return { success: false, error: 'Credit note not found' };

    db.prepare(`
      UPDATE credit_notes SET customer_id=?, customer_name=?, invoice_id=?, date=?, due_date=?, reason=?, status=?, notes=?, updated_at=datetime('now')
      WHERE id=?
    `).run(
      data.customer_id ?? existing.customer_id,
      data.customer_name ?? existing.customer_name,
      data.invoice_id ?? existing.invoice_id,
      data.date ?? existing.date,
      data.due_date ?? existing.due_date,
      data.reason ?? existing.reason,
      data.status ?? existing.status,
      data.notes ?? existing.notes,
      id
    );

    if (Array.isArray(data.lines)) {
      db.prepare(`DELETE FROM credit_note_lines WHERE credit_note_id = ?`).run(id);
      const insertLine = db.prepare(`
        INSERT INTO credit_note_lines (credit_note_id, description, quantity, unit_price, amount, account_id, tax_rate)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      let subtotal = 0, taxAmount = 0;
      for (const line of data.lines) {
        const amt = Number(line.amount) || 0;
        const tax = amt * (Number(line.tax_rate) || 0) / 100;
        insertLine.run(id, line.description || '', Number(line.quantity) || 1, Number(line.unit_price) || 0, amt, line.account_id || null, Number(line.tax_rate) || 0);
        subtotal += amt;
        taxAmount += tax;
      }
      db.prepare(`UPDATE credit_notes SET subtotal=?, tax_amount=?, total=?, updated_at=datetime('now') WHERE id=?`).run(subtotal, taxAmount, subtotal + taxAmount, id);
    }

    return { success: true };
  },

  delete(id) {
    db.prepare(`DELETE FROM credit_note_lines WHERE credit_note_id = ?`).run(id);
    db.prepare(`DELETE FROM credit_notes WHERE id = ?`).run(id);
    return { success: true };
  },

  applyToInvoice(creditNoteId, invoiceId) {
    const cn = db.prepare(`SELECT * FROM credit_notes WHERE id = ?`).get(creditNoteId);
    if (!cn) return { success: false, error: 'Credit note not found' };
    db.prepare(`UPDATE credit_notes SET invoice_id=?, status='Applied', updated_at=datetime('now') WHERE id=?`).run(invoiceId, creditNoteId);
    return { success: true, applied: cn.total };
  }
};

CreditNotes.createTable();
module.exports = CreditNotes;
