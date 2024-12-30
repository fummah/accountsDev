// src/backend/models/Notes.js
const db = require('./dbmgr.js');

const Notes = {
  // Create the Notes table if it doesn't exist
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS notes (
    id	INTEGER,
    description	TEXT NOT NULL,
	category	TEXT NOT NULL,
    linked_id	INTEGER NOT NULL,
	entered_by	TEXT NOT NULL,
	date_entered DATETIME DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(id AUTOINCREMENT)
      )
    `;
    db.prepare(stmt).run();
  },

  // Insert a new Notes
  insertNotes: async (description,category,linked_id,entered_by) => {
    try {
    const stmt = db.prepare('INSERT INTO notes (description,category,linked_id,entered_by) VALUES (?, ?, ?, ?)');
    const result = await stmt.run(description,category,linked_id,entered_by);  
     
    if (result.changes > 0) {
        return { success: true };
      } else {
        return { success: false };
      }
    } catch (error) {
      console.error("Error inserting notes:", error);
      return { success: false };
    }
  },

  // Retrieve all Notes
  getAllNotes: () => {
    const stmt = db.prepare('SELECT * FROM notes');
    return stmt.all();
  },
};

// Ensure the Notes table is created
Notes.createTable();

module.exports = Notes;
