const db = require("./dbmgr");

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
  },
  getAll() {
    const entries = db.prepare("SELECT * FROM journal_entries ORDER BY date DESC").all();
    for (const entry of entries) {
      entry.lines = db.prepare("SELECT * FROM journal_lines WHERE entry_id=?").all(entry.id);
    }
    return entries;
  },
  insert({ date, description, lines, entered_by }) {
    const entry = db.prepare("INSERT INTO journal_entries (date, description, entered_by) VALUES (?, ?, ?)").run(date, description, entered_by);
    const entry_id = entry.lastInsertRowid;
    for (const line of lines) {
      db.prepare("INSERT INTO journal_lines (entry_id, account, debit, credit) VALUES (?, ?, ?, ?)").run(entry_id, line.account, line.debit || 0, line.credit || 0);
    }
    return entry_id;
  }
};

Journal.createTable();
module.exports = Journal;