// /backend/db/db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let db;

function connectDB() {
  db = new sqlite3.Database(path.join(__dirname, 'test.db'), (err) => {
    if (err) {
      console.error('Error opening database: ', err.message);
    } else {
      console.log('Connected to SQLite database.');
      createTables();
    }
  });
}

function createTables() {
  const usersTable = `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL
  );`;

  db.run(usersTable, (err) => {
    if (err) {
      console.error('Error creating users table: ', err.message);
    } else {
      console.log('Users table created successfully.');
    }
  });
}

function addUser(name, email, callback) {
  const sql = `INSERT INTO users (name, email) VALUES (?, ?)`;
  db.run(sql, [name, email], function (err) {
    if (err) {
      callback(err);
    } else {
      callback(null, { id: this.lastID });
    }
  });
}

function getUsers(callback) {
  const sql = `SELECT * FROM users`;
  db.all(sql, [], (err, rows) => {
    if (err) {
      callback(err);
    } else {
      callback(null, rows);
    }
  });
}

module.exports = { connectDB, addUser, getUsers };
