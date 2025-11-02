const Tax = require('../models/tax');

const registerTaxHandlers = (ipcMain) => {
    // Create the tax_filings table when handlers are registered
    Tax.createTable();

    ipcMain.handle('get-tax-records', async () => {
        console.log('Getting tax records...');
        try {
            return await Tax.getTaxRecords();
        } catch (error) {
            console.error('Error in get-tax-records handler:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('submit-tax-filing', async (_, filingData) => {
        console.log('Submitting tax filing:', filingData);
        try {
            return await Tax.submitTaxFiling(filingData);
        } catch (error) {
            console.error('Error in submit-tax-filing handler:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('update-tax-filing', async (_, { id, updates }) => {
        console.log('Updating tax filing:', id, updates);
        try {
            return await Tax.updateTaxFiling(id, updates);
        } catch (error) {
            console.error('Error in update-tax-filing handler:', error);
            return { success: false, error: error.message };
        }
    });
};

module.exports = { registerTaxHandlers };