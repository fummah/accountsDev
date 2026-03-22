// src/backend/models/Documents.js
const db = require('./dbmgr.js');

const Documents = {
  // Create the Documents table if it doesn't exist
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS documents (
    id	INTEGER,
    document_name	TEXT NOT NULL,
    document_size	TEXT,
    document_type	TEXT,
    random_number	TEXT,
	category	TEXT NOT NULL,
    linked_id	INTEGER NOT NULL,
	entered_by	TEXT NOT NULL,
	date_entered DATETIME DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(id AUTOINCREMENT)
      )
    `;
    db.prepare(stmt).run();
    try {
      db.prepare('ALTER TABLE documents ADD COLUMN file_path TEXT').run();
    } catch (e) {
      // ignore if already exists
    }
  },

  // Insert a new Documents
  insertDocuments: async (document_name,document_size,document_type,random_number,category,linked_id,entered_by) => {
    try {
    const stmt = db.prepare('INSERT INTO Documents (document_name,document_size,document_type,random_number,category,linked_id,entered_by) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(document_name,document_size,document_type,random_number,category,linked_id,entered_by);  
     
    if (result.changes > 0) {
        return { success: true };
      } else {
        return { success: false };
      }
    } catch (error) {
      console.error("Error inserting Documents:", error);
      return { success: false };
    }
  },

  // Retrieve all Documents
  getAllDocuments: () => {
    const stmt = db.prepare('SELECT * FROM documents');
    return stmt.all();
  },

  getDocumentById: (id) => {
    return db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  },

  deleteDocument: (id) => {
    const stmt = db.prepare('DELETE FROM documents WHERE id = ?');
    return stmt.run(id);
  },
};

// Ensure the Documents table is created
Documents.createTable();

module.exports = Documents;
