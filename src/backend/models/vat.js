// src/backend/models/vat.js
const db = require('./dbmgr.js');

const Vat = {
  // Create the vat table if it doesn't exist
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS vat (
    id	INTEGER,
	vat_name	TEXT NOT NULL,
  vat_percentage REAL NOT NULL,
	entered_by	TEXT,
	date_entered DATETIME DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(id AUTOINCREMENT)
      )
    `;
    db.prepare(stmt).run();
  },

  // Insert a new vat
  insertVat: async (vat_name,vat_percentage,entered_by) => {
    try {
    const stmt = db.prepare('INSERT INTO vat (vat_name,vat_percentage,entered_by) VALUES (?, ?, ?)');
    const result = await stmt.run(vat_name,vat_percentage,entered_by);
   
     
    if (result.changes > 0) {
        return { success: true };
      } else {
        return { success: false };
      }
    } catch (error) {
      console.error("Error inserting vat:", error);
      return { success: false };
    }
  },

  // Retrieve all vat
  getAllVat: () => {
    const stmt = db.prepare('SELECT * FROM vat ORDER BY id DESC');
    return stmt.all();
  },
  updateVat : async (vatData) => {
    const { id, ...vatDetails } = vatData;
    try {
      // Update the main vat details
      await db.prepare(`UPDATE vat SET vat_name = ?, vat_percentage = ? WHERE id = ?`).run(
        [
          vatDetails.vat_name,
          vatDetails.vat_percentage,
          id,
        ]
      );
  
      return { success: true, message: 'Vat updated successfully.' };
    } catch (error) {
      console.error('Error updating Vat:', error);
      throw error;
    }
  },
  deleteRecord : async (id,table) => {
    
    try {
      // dleleting record
      await db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(
        [
          id,
        ]
      );
  
      return { success: true, message: 'Record successfully deleted successfully.' };
    } catch (error) {
      console.error('Error deleting record:', error);
      throw error;
    }
  },
};

// Ensure the vat table is created
Vat.createTable();

module.exports = Vat;
