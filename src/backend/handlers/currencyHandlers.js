const { ipcMain } = require('electron');
const Currencies = require('../models/currencies');

function register() {
  ipcMain.handle('currency-list', async () => {
    return Currencies.list();
  });

  ipcMain.handle('currency-list-active', async () => {
    return Currencies.listActive();
  });

  ipcMain.handle('currency-get-base', async () => {
    return Currencies.getBase();
  });

  ipcMain.handle('currency-set-base', async (_e, code) => {
    return Currencies.setBase(code);
  });

  ipcMain.handle('currency-add', async (_e, code, name, symbol, decimals) => {
    return Currencies.add(code, name, symbol, decimals);
  });

  ipcMain.handle('currency-toggle', async (_e, code, active) => {
    return Currencies.toggle(code, active);
  });

  ipcMain.handle('currency-set-rate', async (_e, from, to, rate, date) => {
    return Currencies.setRate(from, to, rate, date);
  });

  ipcMain.handle('currency-get-rate', async (_e, from, to, date) => {
    const rate = Currencies.getRate(from, to, date);
    return { rate, from, to };
  });

  ipcMain.handle('currency-convert', async (_e, amount, from, to, date) => {
    const result = Currencies.convert(amount, from, to, date);
    return { result, amount, from, to };
  });

  ipcMain.handle('currency-rates', async (_e, from, limit) => {
    return Currencies.getAllRates(limit);
  });
}

module.exports = register;
