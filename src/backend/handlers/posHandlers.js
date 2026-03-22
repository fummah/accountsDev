const { ipcMain } = require('electron');
const { POS } = require('../models');

function registerPosHandlers() {
  ipcMain.handle('pos-open-session', async (event, openedBy, openingAmount) => {
    try {
      return POS.openSession(openedBy, openingAmount);
    } catch (e) {
      console.error('Error opening POS session:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('pos-get-open-session', async () => {
    try {
      return POS.getOpenSession();
    } catch (e) {
      console.error('Error fetching open POS session:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('pos-close-session', async (event, sessionId, closingAmount) => {
    try {
      return POS.closeSession(sessionId, closingAmount);
    } catch (e) {
      console.error('Error closing POS session:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('pos-create-sale', async (event, sale, lines) => {
    try {
      return POS.createSale(sale, lines);
    } catch (e) {
      console.error('Error creating POS sale:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('pos-list-sales', async (event, sessionId) => {
    try {
      return POS.listSales(sessionId);
    } catch (e) {
      console.error('Error listing POS sales:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('pos-get-sale', async (event, saleId) => {
    try {
      return POS.getSaleWithLines(saleId);
    } catch (e) {
      console.error('Error getting POS sale:', e);
      return { error: e.message };
    }
  });
}

module.exports = registerPosHandlers;


