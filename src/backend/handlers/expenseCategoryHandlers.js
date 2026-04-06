const { ipcMain } = require('electron');
const ExpenseCategories = require('../models/expenseCategories');

function registerExpenseCategoryHandlers() {
  ipcMain.handle('expense-categories-list', async () => {
    try {
      return ExpenseCategories.getAll();
    } catch (e) {
      console.error('Error listing expense categories:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('expense-categories-active', async () => {
    try {
      return ExpenseCategories.getActive();
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('expense-category-insert', async (_e, name, description, color) => {
    try {
      return ExpenseCategories.insert(name, description, color);
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('expense-category-update', async (_e, id, name, description, color, status) => {
    try {
      return ExpenseCategories.update(id, name, description, color, status);
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('expense-category-delete', async (_e, id) => {
    try {
      return ExpenseCategories.remove(id);
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = registerExpenseCategoryHandlers;
