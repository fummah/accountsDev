// src/backend/models/employees.js
const db = require('./dbmgr.js');

const Employees = {
  // Create the Employees table if it doesn't exist
  createTable: () => {
    // Drop existing table if it exists
    try {
      db.prepare('DROP TABLE IF EXISTS employees').run();
    } catch (error) {
      console.error('Error dropping employees table:', error);
    }

    // Create new table with all columns
    const stmt = `
      CREATE TABLE IF NOT EXISTS employees (
        id INTEGER,
        first_name TEXT NOT NULL,
        last_name TEXT,
        mi TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        date_hired TEXT,
        entered_by TEXT,
        salary REAL DEFAULT 0,
        status TEXT DEFAULT 'Active',
        role TEXT DEFAULT 'Staff',
        permissions TEXT DEFAULT '[]',
        date_entered DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(id AUTOINCREMENT)
      )
    `;
    
    try {
      db.prepare(stmt).run();
      console.log('Employees table created successfully');
    } catch (error) {
      console.error('Error creating employees table:', error);
      throw error;
    }
  },

  // Migrate existing data
  migrateTable: () => {
    try {
      // Check if role column exists
      const tableInfo = db.prepare("PRAGMA table_info(employees)").all();
      const hasRole = tableInfo.some(col => col.name === 'role');
      const hasPermissions = tableInfo.some(col => col.name === 'permissions');
      
      if (!hasRole) {
        db.prepare("ALTER TABLE employees ADD COLUMN role TEXT DEFAULT 'Staff'").run();
      }
      
      if (!hasPermissions) {
        db.prepare("ALTER TABLE employees ADD COLUMN permissions TEXT DEFAULT '[]'").run();
      }

      console.log('Employee table migration completed successfully');
    } catch (error) {
      console.error('Error during migration:', error);
      throw error;
    }
  },

  // Insert a new employee
  insertEmployee: async (first_name, last_name, mi, email, phone, address, date_hired, entered_by, salary, status, role = 'Staff', permissions = []) => {
    try {
      if (!first_name || !last_name) {
        throw new Error('First name and last name are required');
      }

      if (!['Admin', 'Manager', 'Staff'].includes(role)) {
        throw new Error('Invalid role specified');
      }

      // Create employee table with role and permissions if it doesn't exist
      db.prepare(`
        CREATE TABLE IF NOT EXISTS employees (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          mi TEXT,
          email TEXT,
          phone TEXT,
          address TEXT,
          date_hired TEXT,
          entered_by TEXT,
          salary REAL DEFAULT 0,
          status TEXT DEFAULT 'Active',
          role TEXT DEFAULT 'Staff',
          permissions TEXT,
          date_entered DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      const stmt = db.prepare(`
        INSERT INTO employees (
          first_name, last_name, mi, email, phone, address,
          date_hired, entered_by, salary, status, role, permissions
        ) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = await stmt.run(
        first_name,
        last_name,
        mi || '',
        email || '',
        phone || '',
        address || '',
        date_hired || null,
        entered_by || 'system',
        parseFloat(salary) || 0,
        status || 'Active',
        role,
        Array.isArray(permissions) ? JSON.stringify(permissions) : '[]'
      );
   
      if (result.changes > 0) {
        return { 
          success: true,
          id: result.lastInsertRowid,
          message: 'Employee added successfully'
        };
      } else {
        return { 
          success: false,
          error: 'Failed to insert employee'
        };
      }
    } catch (error) {
      console.error("Error inserting employee:", error);
      return { 
        success: false,
        error: error.message || 'Unknown error occurred while inserting employee'
      };
    }
  },

  // Retrieve all employees
  getAllEmployees: () => {
    try {
      console.log('Attempting to fetch all employees from database...');
      
      // First check if table exists
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='employees'").get();
      if (!tableExists) {
        console.error('Employees table does not exist');
        return { success: false, error: 'Employees table does not exist' };
      }

      // Get table structure
      const tableInfo = db.prepare("PRAGMA table_info(employees)").all();
      console.log('Table structure:', tableInfo);

      const stmt = db.prepare(`
        SELECT 
          id,
          first_name,
          last_name,
          mi,
          email,
          phone,
          address,
          date_hired,
          entered_by,
          salary,
          status,
          COALESCE(role, 'Staff') as role,
          COALESCE(permissions, '[]') as permissions,
          date_entered
        FROM employees 
        ORDER BY id DESC
      `);
      
      console.log('Executing SELECT query...');
      const employees = stmt.all();
      console.log(`Found ${employees.length} employees`);
      
      if (!Array.isArray(employees)) {
        console.error('Expected array of employees but got:', typeof employees);
        return { 
          success: false, 
          error: 'Database returned invalid format' 
        };
      }
      
      // Ensure permissions is always a valid JSON string
      const processedEmployees = employees.map(emp => ({
        ...emp,
        permissions: emp.permissions || '[]',
        role: emp.role || 'Staff',
        // Ensure all required fields have default values
        status: emp.status || 'Active',
        salary: parseFloat(emp.salary || 0),
        date_hired: emp.date_hired || null
      }));

      console.log('Processed employees:', processedEmployees);
      return { 
        success: true, 
        data: processedEmployees 
      };
    } catch (error) {
      console.error('Error in getAllEmployees:', error);
      console.error('Error stack:', error.stack);
      return { success: false, error: error.message || 'Database error occurred' };
    }
  },
  updateEmployee: async (employeeData) => {
    try {
      const { id, ...employeeDetails } = employeeData;
      
      if (!id) {
        throw new Error('Employee ID is required for update');
      }

      if (!employeeDetails.first_name || !employeeDetails.last_name) {
        throw new Error('First name and last name are required');
      }

      if (employeeDetails.role && !['Admin', 'Manager', 'Staff'].includes(employeeDetails.role)) {
        throw new Error('Invalid role specified');
      }

      const stmt = db.prepare(`
        UPDATE employees 
        SET first_name = ?, 
            last_name = ?, 
            mi = ?, 
            email = ?,
            phone = ?, 
            address = ?, 
            date_hired = ?, 
            salary = ?, 
            status = ?,
            role = ?,
            permissions = ?
        WHERE id = ?
      `);

      const result = await stmt.run(
        employeeDetails.first_name,
        employeeDetails.last_name,
        employeeDetails.mi || '',
        employeeDetails.email || '',
        employeeDetails.phone || '',
        employeeDetails.address || '',
        employeeDetails.date_hired || null,
        parseFloat(employeeDetails.salary) || 0,
        employeeDetails.status || 'Active',
        employeeDetails.role || 'Staff',
        Array.isArray(employeeDetails.permissions) ? JSON.stringify(employeeDetails.permissions) : '[]',
        id
      );
  
      if (result.changes > 0) {
        return { 
          success: true, 
          message: 'Employee updated successfully'
        };
      } else {
        return {
          success: false,
          error: 'No employee found with that ID'
        };
      }
    } catch (error) {
      console.error('Error updating Employee:', error);
      return {
        success: false,
        error: error.message || 'Unknown error occurred while updating employee'
      };
    }
  },
};

// Initialize database
(async () => {
  try {
    console.log('Initializing employees database...');
    
    // Check if table exists
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='employees'").get();
    console.log('Table exists check:', tableExists);

    if (tableExists) {
      console.log('Attempting to migrate existing employees table...');
      Employees.migrateTable();
    } else {
      console.log('Creating new employees table...');
      Employees.createTable();
    }

    // Verify table structure
    const tableInfo = db.prepare("PRAGMA table_info(employees)").all();
    console.log('Final table structure:', tableInfo);

    console.log('Employee database initialization complete');
  } catch (error) {
    console.error('Failed to initialize employees database:', error);
    console.error('Error stack:', error.stack);
  }
})();

module.exports = Employees;
