const { ipcMain } = require('electron');
const Transactions = require('../models/transactions');

const registerBankingHandlers = () => {
  // Deposits now handled by depositHandlers.js
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

};

module.exports = registerBankingHandlers;