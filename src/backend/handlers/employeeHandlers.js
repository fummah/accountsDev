
const { ipcMain } = require('electron');
const Employees = require('../models/employees');
const db = require('../models/dbmgr');

// Register employee-related IPC handlers
const registerEmployeeHandlers = () => {
  // Get all employees
  ipcMain.handle('get-employees', async () => {
    try {
      console.log('IPC Handler: Fetching employees...');
      const result = await Employees.getAllEmployees();
      console.log('IPC Handler: Got response:', result);

      // Check if we got a response with success property
      if (result && typeof result.success === 'boolean') {
        return result; // Pass through the response as is
      }

      // Legacy format handling (if result is array)
      if (Array.isArray(result)) {
        console.log('IPC Handler: Got legacy array response');
        return {
          success: true,
          data: result
        };
      }

      // Unknown response format
      console.error('IPC Handler: Invalid response format:', result);
      return {
        success: false,
        error: 'Invalid response format from database'
      };
    } catch (error) {
      console.error('IPC Handler: Error fetching employees:', error);
      console.error('IPC Handler: Error stack:', error.stack);
      return { 
        success: false, 
        error: error.message || 'Failed to fetch employees'
      };
    }
  });

  // Insert new employee
  ipcMain.handle('insert-employee', async (event, employeeData) => {
    try {
      // Only pass expected fields to the model
      const {
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
        role,
        permissions
      } = employeeData;

      return await Employees.insertEmployee(
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
        role,
        permissions
      );
    } catch (error) {
      console.error('Error inserting employee:', error);
      return { error: error.message, success: false };
    }
  });

  // Update employee
  ipcMain.handle('update-employee', async (event, employeeData) => {
    try {
      return await Employees.updateEmployee(employeeData);
    } catch (error) {
      console.error('Error updating employee:', error);
      return { error: error.message, success: false };
    }
  });

  // Delete employee
  ipcMain.handle('delete-employee', async (event, id) => {
    try {
      const stmt = db.prepare('DELETE FROM employees WHERE id = ?');
      const result = stmt.run(id);
      return { success: result.changes > 0 };
    } catch (error) {
      console.error('Error deleting employee:', error);
      return { error: error.message, success: false };
    }
  });
};

module.exports = registerEmployeeHandlers;