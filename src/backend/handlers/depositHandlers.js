const { ipcMain } = require('electron');
const Deposits = require('../models/deposits');

function registerDepositHandlers() {
  ipcMain.handle('get-pending-payments', async () => {
    try {
      return Deposits.getPendingPayments();
    } catch (error) {
      console.error('Error fetching pending payments:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('get-deposits', async () => {
    try {
      return Deposits.getAll();
    } catch (error) {
      console.error('Error fetching deposits:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('get-deposit', async (event, id) => {
    try {
      return Deposits.getById(id);
    } catch (error) {
      console.error('Error fetching deposit:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('create-deposit', async (event, data) => {
    try {
      return Deposits.create(data);
    } catch (error) {
      console.error('Error creating deposit:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('update-deposit', async (event, id, data) => {
    try {
      return Deposits.update(id, data);
    } catch (error) {
      console.error('Error updating deposit:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('void-deposit', async (event, id) => {
    try {
      return Deposits.voidDeposit(id);
    } catch (error) {
      console.error('Error voiding deposit:', error);
      return { error: error.message };
    }
  });
}

module.exports = { register: registerDepositHandlers };
