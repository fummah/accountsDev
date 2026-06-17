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
};

module.exports = registerVendorCreditHandlers;
