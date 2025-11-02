const { ipcMain } = require('electron');
const ChartOfAccounts = require('../models/chartOfAccounts');
const FixedAssets = require('../models/fixedAssets');
const Transactions = require('../models/transactions');

function registerAccountingHandlers() {
  // Chart of Accounts handlers
  ipcMain.handle('get-chart-of-accounts', async () => {
    try {
      return await ChartOfAccounts.getAll();
    } catch (error) {
      console.error('Error getting chart of accounts:', error);
      throw error;
    }
  });

  ipcMain.handle('create-account', async (_, account) => {
    try {
      return await ChartOfAccounts.create(account);
    } catch (error) {
      console.error('Error creating account:', error);
      throw error;
    }
  });

  ipcMain.handle('update-account', async (_, account) => {
    try {
      return await ChartOfAccounts.update(account);
    } catch (error) {
      console.error('Error updating account:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-account', async (_, id) => {
    try {
      return await ChartOfAccounts.delete(id);
    } catch (error) {
      console.error('Error deleting account:', error);
      throw error;
    }
  });

  // Fixed Assets handlers
  ipcMain.handle('get-fixed-assets', async () => {
    try {
      return await FixedAssets.getAll();
    } catch (error) {
      console.error('Error getting fixed assets:', error);
      throw error;
    }
  });

  ipcMain.handle('create-fixed-asset', async (_, asset) => {
    try {
      return await FixedAssets.create(asset);
    } catch (error) {
      console.error('Error creating fixed asset:', error);
      throw error;
    }
  });

  ipcMain.handle('update-fixed-asset', async (_, asset) => {
    try {
      return await FixedAssets.update(asset);
    } catch (error) {
      console.error('Error updating fixed asset:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-fixed-asset', async (_, id) => {
    try {
      return await FixedAssets.delete(id);
    } catch (error) {
      console.error('Error deleting fixed asset:', error);
      throw error;
    }
  });

  // Transactions handlers
  ipcMain.handle('get-transactions', async () => {
    try {
      return await Transactions.getAll();
    } catch (error) {
      console.error('Error getting transactions:', error);
      throw error;
    }
  });

  ipcMain.handle('create-transaction', async (_, transaction) => {
    try {
      return await Transactions.create(transaction);
    } catch (error) {
      console.error('Error creating transaction:', error);
      throw error;
    }
  });

  ipcMain.handle('void-transaction', async (_, id) => {
    try {
      return await Transactions.void(id);
    } catch (error) {
      console.error('Error voiding transaction:', error);
      throw error;
    }
  });
}

module.exports = registerAccountingHandlers;