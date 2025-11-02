// src/backend/models/employees.js
const db = require('./dbmgr.js');

const Employees = {
  // Create the Employees table if it doesn't exist
  createTable: () => {
    const stmt = `
      CREATE TABLE IF NOT EXISTS employees (
    id	INTEGER,
	first_name	TEXT NOT NULL,
	last_name	TEXT,
	mi	TEXT,
	email	TEXT,
  phone	TEXT,
  address	TEXT,
	date_hired	TEXT,
	entered_by	TEXT,
  salary	REAL DEFAULT 0,
	status	TEXT DEFAULT 'Active',
	date_entered DATETIME DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY(id AUTOINCREMENT)
      )
    `;
    db.prepare(stmt).run();
  },

  // Insert a new employee
  insertEmployee: async (first_name, last_name, mi,email,phone,address,date_hired,entered_by,salary,status) => {
    try {
    const stmt = db.prepare('INSERT INTO employees (first_name, last_name, mi,email,phone,address,date_hired,entered_by,salary,status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = await stmt.run(first_name, last_name, mi,email,phone,address,date_hired,entered_by,salary,status);
   
     
    if (result.changes > 0) {
        return { success: true };
      } else {
        return { success: false };
      }
    } catch (error) {
      console.error("Error inserting employee:", error);
      return { success: false };
    }
  },

  // Retrieve all employees
  getAllEmployees: () => {
    const stmt = db.prepare('SELECT * FROM employees ORDER BY id DESC');
    return stmt.all();
  },
  updateEmployee : async (employeeData) => {
    const { id, ...employeeDetails } = employeeData;
    try {
      // Update the main employee details
      await db.prepare(`UPDATE employees SET first_name = ?, last_name = ?, mi =?, email =?,phone =?, address =?, date_hired =?, salary =?, status = ? WHERE id = ?`).run(
        [
          employeeDetails.first_name,
          employeeDetails.last_name,
          employeeDetails.mi,
          employeeDetails.email,
          employeeDetails.phone,
          employeeDetails.address,
          employeeDetails.date_hired,
          employeeDetails.salary,
          employeeDetails.status,
          id,
        ]
      );
  
      return { success: true, message: 'Employee updated successfully.' };
    } catch (error) {
      console.error('Error updating Employee:', error);
      throw error;
    }
  },
};

// Ensure the Employees table is created
Employees.createTable();

module.exports = Employees;
