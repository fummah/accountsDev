// src/backend/models/sdmgr.js
const Database = require('better-sqlite3');
const path = require('path');

// Define the path to the SQLite database file
const dbPath = path.join(__dirname, '../db/accounts.db');

// Initialize the database connection
const db = new Database(dbPath, { verbose: console.log });

// Export the database connection
module.exports = db;
