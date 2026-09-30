const { ipcMain } = require('electron');
const VendorCredits = require('../models/vendorCredits');

const registerVendorCreditHandlers = () => {
  ipcMain.handle('vendor-credits-list', async (_e, supplierId) => {
    try {
      return VendorCredits.getCredits(supplierId);
    } catch (error) {
      console.error('Error listing vendor credits:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('vendor-credits-available', async (_e, supplierId) => {
    try {
      return VendorCredits.getAvailableCredits(supplierId);
    } catch (error) {
      console.error('Error listing available vendor credits:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('vendor-credits-create', async (event, data) => {
    try {
      const res = VendorCredits.createCredit(data);
      return res;
    } catch (error) {
      console.error('Error creating vendor credit:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('vendor-credits-apply', async (event, { creditId, expenseId, amount }) => {
    try {
      const res = VendorCredits.applyCredit(creditId, expenseId, amount);
      return res;
    } catch (error) {
      console.error('Error applying vendor credit:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('vendor-credits-void', async (event, id) => {
    try {
      const res = VendorCredits.voidCredit(id);
      return res;
    } catch (error) {
      console.error('Error voiding vendor credit:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('vendor-credits-update', async (event, id, data) => {
    try {
      return VendorCredits.updateCredit(id, data || {});
    } catch (error) {
      console.error('Error updating vendor credit:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('vendor-credits-applications', async (_e, creditId) => {
    try {
      return VendorCredits.getApplications(creditId);
    } catch (error) {
      console.error('Error listing credit applications:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('bill-credit-applications', async (_e, expenseId) => {
    try {
      return VendorCredits.getBillApplications(expenseId);
    } catch (error) {
      console.error('Error listing bill credit applications:', error);
      return { error: error.message };
    }
  });
};

module.exports = registerVendorCreditHandlers;
