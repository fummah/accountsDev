// src/backend/models/users.js
const db = require('./dbmgr');
const { hashPassword, verifyPassword, validatePasswordPolicy } = require('../security/passwords');

const Users = {
  // Create the Users table if it doesn't exist
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS users (
    id	INTEGER,
	first_name	TEXT NOT NULL,
	last_name	TEXT NOT NULL,
	email	TEXT NOT NULL,
	contact_number	TEXT,
	password	TEXT,
	role	TEXT,
  logo	TEXT,
  company_name	TEXT,
	entered_by	TEXT NOT NULL,
	date_entered DATETIME DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(id AUTOINCREMENT)
      )
    `;
    db.prepare(stmt).run();
  },

  // Insert a new user (hashes password)
  insertUser: (first_name,last_name, email,contact_number,password,role,entered_by) => {
    if (password) {
      const check = validatePasswordPolicy(password);
      if (!check.valid) return { success: false, error: check.errors.join('; ') };
    }
    const hashed = password ? hashPassword(password) : null;
    const stmt = db.prepare('INSERT INTO users (first_name,last_name, email,contact_number,password,role,entered_by) VALUES (?, ?, ?, ?, ?, ?, ?)');
    return stmt.run(first_name,last_name, email,contact_number,hashed,role,entered_by);
  },

  // Retrieve all users
  getAllUsers: () => {
    const stmt = db.prepare('SELECT * FROM users');
    return stmt.all();
  },
  updateUser : async (userData) => {
    const { ...userDetails } = userData;

    try {
      // Update the main user details
      await db.prepare(
        `UPDATE users
         SET first_name = ?, last_name = ?, email = ?, contact_number = ?, 
             company_name = ?, password = ?, logo = ?
         WHERE id = 1`).run(
        [ 
          userDetails.first_name,
          userDetails.last_name,
          userDetails.email,
          userDetails.contact_number,
          userDetails.company_name,
          userDetails.password ? hashPassword(userDetails.password) : null,
          userDetails.logo,
        ]
      );
  
  
      return { success: true, message: 'User updated successfully.' };
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  },

  findByEmail: (email) => {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
    return stmt.get(email);
  },

  verifyPasswordForUser: (user, password) => {
    return verifyPassword(password, user.password || '');
  }
  ,
};

// Ensure the Users table is created
Users.createTable();

module.exports = Users;
