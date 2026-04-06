const { ipcMain } = require('electron');
const Transactions = require('../models/transactions');

const registerBankingHandlers = () => {
  // Dedicated deposit & transfer list handlers
  ipcMain.handle('get-deposits', async () => {
    try {
      return Transactions.getDeposits();
    } catch (error) {
      console.error('Error fetching deposits:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('get-transfers', async () => {
    try {
      return Transactions.getTransfers();
    } catch (error) {
      console.error('Error fetching transfers:', error);
      return { error: error.message };
    }
  });

  // Banking handlers
  ipcMain.handle('reconcile-transactions', async (event, data) => {
    try {
      return await Transactions.reconcileTransactions(data);
    } catch (error) {
      console.error('Error reconciling transactions:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('create-bank-transfer', async (event, data) => {
    try {
      return await Transactions.createBankTransfer(data);
    } catch (error) {
      console.error('Error creating bank transfer:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('create-deposit', async (event, data) => {
    try {
      return await Transactions.createDeposit(data);
    } catch (error) {
      console.error('Error creating deposit:', error);
      return { error: error.message };
    }
  });
};

module.exports = registerBankingHandlers;