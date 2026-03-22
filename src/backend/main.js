const { app, BrowserWindow, Menu, ipcMain, protocol, dialog } = require('electron');
const path = require('path');
const registerIpcHandlers = require('./handlers/ipcHandlers');
const registerEmployeeHandlers = require('./handlers/employeeHandlers');
const registerPayrollHandlers = require('./handlers/payrollHandlers');
const registerCustomerHandlers = require('./handlers/customerHandlers');
const registerBankingHandlers = require('./handlers/bankingHandlers');
const registerTransactionHandlers = require('./handlers/transactionHandlers');
const registerTaxHandlers = require('./handlers/taxHandlers');
const registerInvoiceHandlers = require('./handlers/invoiceHandlers');
const registerInventoryHandlers = require('./handlers/inventoryHandlers');
const registerProjectHandlers = require('./handlers/projectHandlers');
const registerPosHandlers = require('./handlers/posHandlers');
const registerCrmHandlers = require('./handlers/crmHandlers');
const registerBankStatementHandlers = require('./handlers/bankStatementHandlers');
const registerSettingsHandlers = require('./handlers/settingsHandlers');
const registerAnalyticsHandlers = require('./handlers/analyticsHandlers');
const registerAuthHandlers = require('./handlers/authHandlers');
const registerBackupHandlers = require('./handlers/backupHandlers');
const registerCloudSyncHandlers = require('./handlers/cloudSyncHandlers');
const registerSyncHandlers = require('./handlers/syncHandlers');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
    },
  });

  const devUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000';
  const buildRoot = path.join(__dirname, '..', 'frontend', 'build');
  const localIndex = path.join(buildRoot, 'index.html');

  // In production, rewrite file:// absolute paths (/assets, /static, /css, /loader.css) to the build folder
  if (app.isPackaged) {
    try {
      protocol.interceptFileProtocol('file', (request, callback) => {
        try {
          const url = new URL(request.url);
          const p = url.pathname || '';
          const mapPrefix = (prefix) => path.join(buildRoot, prefix, p.replace(new RegExp(`^/${prefix}/`), ''));
          if (p === '/loader.css') {
            return callback({ path: path.join(buildRoot, 'loader.css') });
          }
          if (p.startsWith('/assets/')) {
            return callback({ path: mapPrefix('assets') });
          }
          if (p.startsWith('/static/')) {
            return callback({ path: mapPrefix('static') });
          }
          if (p.startsWith('/css/')) {
            return callback({ path: mapPrefix('css') });
          }
          if (p === '/favicon.ico' || p === '/favicon1.ico') {
            return callback({ path: path.join(buildRoot, p.replace(/^\//, '')) });
          }
          return callback(decodeURIComponent(url.pathname));
        } catch (e) {
          return callback(request.url);
        }
      });
    } catch (e) {
      console.error('Failed to intercept file protocol:', e);
    }
  }

  const loadRenderer = async () => {
    if (app.isPackaged) {
      // Always use local build in production
      await win.loadFile(localIndex);
      return;
    }
    // In development try dev server then fall back to local build
    try {
      await win.loadURL(devUrl);
      console.log(`Loaded URL: ${devUrl}`);
    } catch (err) {
      console.error(`Error loading ${devUrl}:`, err);
      try {
        await win.loadFile(localIndex);
        console.log(`Loaded local index at ${localIndex}`);
      } catch (err2) {
        console.error('Failed to load local index.html fallback:', err2);
      }
    }
  };

  // Attach basic load-failure handling and then attempt initial load.
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Renderer failed to load URL', { errorCode, errorDescription, validatedURL });
    // try fallback if dev URL failed
    win.loadFile(localIndex).catch(err => console.error('Fallback loadFile failed:', err));
  });

  win.webContents.on('did-finish-load', () => {
    console.log('Renderer finished loading');
  });

  loadRenderer();

  // Ask for confirmation before closing
  win.on('close', (e) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Yes', 'No'],
      defaultId: 1,
      title: 'Confirm Exit',
      message: 'Are you sure you want to exit?',
    });
    if (choice === 1) {
      e.preventDefault();
    }
  });

  // Helper to navigate consistently in dev and production (hash routing in dev too)
  const navigateTo = (routePath) => {
    if (!win) return;
    const normalized = routePath && routePath.startsWith('/') ? routePath : `/${routePath || ''}`;
    if (app.isPackaged) {
      win.webContents.send('navigate', normalized);
    } else {
      const base = (process.env.ELECTRON_START_URL || devUrl || 'http://localhost:3000').replace(/\/$/, '');
      win.loadURL(`${base}/#${normalized}`);
    }
  };

  const menuTemplate = [
    // 🟦 Classic Menus
    {
      label: 'File',
      submenu: [
        { label: 'New Window', click: () => { createWindow(); } },
        { type: 'separator' },
        { label: 'Open File...' },
        { label: 'Save' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
   
    {
      label: 'Accountant',
      submenu: [
        { label: 'Accountant Center', click: () => { navigateTo('/main/dashboard/accountant'); } },
        { type: 'separator' },
        { label: 'Chart of Accounts', click: () => { navigateTo('/main/accountant/chart-of-accounts'); } },
        { label: 'Fixed Assets Item List', click: () => { navigateTo('/main/accountant/fixed-assets'); } },
        { type: 'separator' },
        { label: 'Enter Transaction', click: () => { navigateTo('/main/accountant/enter-transaction'); } },
        { label: 'Void Transaction', click: () => { navigateTo('/main/accountant/void-transaction'); } },
        { type: 'separator' },
        { label: 'Reconcile', click: () => { navigateTo('/main/accountant/reconcile'); } },
        { label: 'Working Trial Balance', click: () => { navigateTo('/main/accountant/trial-balance'); } },
        { label: 'Consolidated Trial Balance', click: () => { navigateTo('/main/accountant/consolidated-trial-balance'); } },
        { label: 'Advanced Trial Balance', click: () => { navigateTo('/main/accountant/advanced-trial-balance'); } },
        { label: 'Entities', click: () => { navigateTo('/main/accountant/entities'); } },
        { label: 'Classes And Locations', click: () => { navigateTo('/main/accountant/dimensions'); } },
        { label: 'COA Import/Export', click: () => { navigateTo('/main/accountant/coa-import-export'); } },
        { label: 'QuickBooks Import', click: () => { navigateTo('/main/accountant/qb-import'); } },
        { label: 'General Ledger', click: () => { navigateTo('/main/accountant/general-ledger'); } },
        { label: 'Journal Entries', click: () => { navigateTo('/main/accountant/journal-entries'); } },
        { label: 'Print Checks', click: () => { navigateTo('/main/accountant/check-printing'); } },
        { label: 'Set Closing Date', click: () => { navigateTo('/main/accountant/closing-date'); } },
        { type: 'separator' },
        { label: 'Manage Fixed Assets', click: () => { navigateTo('/main/accountant/manage-assets'); } }
        ,
        { type: 'separator' },
        { label: 'Recurring Transactions', click: () => { navigateTo('/main/accountant/recurring'); } }
      ]
    },
    // 🟩 Custom System Menu
    {
      label: 'Company',
      submenu: [
        { label: 'Home Page',  click: () => { navigateTo('/main/dashboard/flow'); } },
            { label: 'Company Snapshot',
              click: () => { navigateTo('/main/dashboard/home-dash'); }
             },            
            { label: 'My Company', click: () => { navigateTo('/main/dashboard/company'); } },
            { label: 'Users' , 
              submenu:[
                               {label:'View Users', click: () => { navigateTo('/main/employees/center'); }}

            ]},
            { type: 'separator' },
            { label: 'Set Closing Date',
              click: () => { navigateTo('/main/accountant/closing-date'); }
             },
            { label: 'Planning and Budgeting' , 
              submenu:[
                {label:'Setup Budgets', click: () => { navigateTo('/main/reports/budget-vs-actual'); }},
                {label:'Setup Forecast', click: () => { navigateTo('/main/reports/budget-vs-actual'); }},
                {label:'Cashflow Projector', click: () => { navigateTo('/main/reports/cash-flow'); }}

            ]},
            { label: 'Manage Fixed Assets', click: () => { navigateTo('/main/accountant/manage-assets'); } },
            { label: 'Document Center', click: () => { navigateTo('/main/documents'); } },
        { label: 'Exit', role: 'quit' }
      ]
    },

    // 🟨 Customers-like Menu
    {
      label: 'Customers',
      submenu: [      
                { label: 'Customer Center', click: () => {
                  navigateTo('/main/customers/center');
                } },
                { label: 'Customer List', click: () => {
                  navigateTo('/main/customers/list');
                } },
            { type: 'separator' },
            { label: 'Invoices', click: () => {
              navigateTo('/main/customers/invoices/list');
            } },
            { label: 'Create Invoice', click: () => {
              navigateTo('/main/customers/invoices/new');
            } },
            { type: 'separator' },
            { label: 'Quotes / Estimates', click: () => {
              navigateTo('/main/customers/quotes/list');
            } },
            { label: 'Create Quote', click: () => {
              navigateTo('/main/customers/quotes/new');
            } },
            { type: 'separator' },
            { label: 'Create Statements', click: () => {
              navigateTo('/main/customers/statements/new');
            } },
            { label: 'Receive Payments', click: () => {
              navigateTo('/main/customers/payments');
            } },
            { type: 'separator' },
            { label: 'Income Tracker', click: () => {
              navigateTo('/main/customers/income-tracker');
            } },
            { label: 'Recurring Transactions', click: () => {
              navigateTo('/main/customers/recurring');
            } },
            { label: 'Credit Notes / Refunds', click: () => {
              navigateTo('/main/customers/credit-notes');
            } },
            { label: 'Item List', click: () => {
              navigateTo('/main/customers/items');
            } },
          ]
        },
        {
          label: 'Vendors',
          submenu: [
            { label: 'Vendor Center', click: () => { navigateTo('/main/vendors/center'); }  },
            { type: 'separator' },
            { label: 'Bill Tracker', click: () => { navigateTo('/main/vendors/bills/tracker'); } },
            { label: 'Enter Bills', click: () => { navigateTo('/main/vendors/bills/new'); } },
            { label: 'Pay Bills', click: () => { navigateTo('/main/vendors/bills/pay'); }},
            { type: 'separator' },
            { label: 'Item List', click: () => { navigateTo('/main/vendors/items'); } }
          ]
        },
        {
          label: 'Employees',
          submenu: [
            { label: 'Employee Center', click: () => { navigateTo('/main/employees/center'); }},
            { type: 'separator' },
            { label: 'Employee List', click: () => { navigateTo('/main/employees/list'); }},
            { label: 'Run Payroll', click: () => { navigateTo('/main/employees/payroll'); }},
            { label: 'Tax Filing', click: () => { navigateTo('/main/employees/tax-filing'); }},
            { label: 'Payslips', click: () => { navigateTo('/main/employees/payslips'); }}
          ]
        },
        {
          label: 'Banking',
          submenu: [
            { label: 'Make Deposits', click: () => { navigateTo('/main/banking/deposits'); } },
            { label: 'Transfer Funds', click: () => { navigateTo('/main/banking/transfers'); } },
            { type: 'separator' },
            { label: 'Reconcile', click: () => { navigateTo('/main/banking/reconcile'); } },
        { label: 'Run Payroll', click: () => { navigateTo('/main/employees/payroll'); } },
        { type: 'separator' },
        { label: 'Bank Feeds (Live/Offline)', click: () => { navigateTo('/main/banking/feeds'); } }
          ]
        },

    // 🟦 Activities
    {
      label: 'Expense Tracking',
      submenu: [
        { label: 'Bill Management', click: () => { navigateTo('/main/vendors/bills/tracker'); } },
        { label: 'Expense Tracking', click: () => { navigateTo('/main/expenses/tracking'); } },
        { type: 'separator' },
        { label: 'Credit Card Charges', click: () => { navigateTo('/main/expenses/credit-cards'); } },
        { label: 'Transactions', click: () => { navigateTo('/main/expenses/transactions'); } }
      ]
    },

    // 🟪 Reports
    {
      label: 'Reports and Analytics',
      submenu: [
        { label: 'Profit & Loss', click: () => { navigateTo('/main/reports/profit-loss'); } },
        { label: 'Cash Flow', click: () => { navigateTo('/main/reports/cash-flow'); } },
        { label: 'Balance Sheet', click: () => { navigateTo('/main/reports/balance-sheet'); } },
        { label: 'A/R Aging', click: () => { navigateTo('/main/reports/ar-aging'); } },
        { label: 'A/P Aging', click: () => { navigateTo('/main/reports/ap-aging'); } },
        { type: 'separator' },
        { label: 'Job Costing', click: () => { navigateTo('/main/reports/job-costing'); } },
        { label: 'Project Profitability', click: () => { navigateTo('/main/reports/project-profitability'); } },
        { type: 'separator' },
        { label: 'Time Tracking', click: () => { navigateTo('/main/reports/time-tracking'); } },
        { label: 'Report Builder', click: () => { navigateTo('/main/reports/builder'); } },
        { type: 'separator' },
        { label: 'Budget vs Actual', click: () => { navigateTo('/main/reports/budget-vs-actual'); } },
        { label: 'Audit Trail', click: () => { navigateTo('/main/reports/audit-trail'); } },
        { type: 'separator' },
        { label: 'VAT Return', click: () => { navigateTo('/main/reports/vat-return'); } },
        { label: 'Tax Summary', click: () => { navigateTo('/main/reports/tax-summary'); } },
        { type: 'separator' },
        { label: 'Analytics Dashboard', click: () => { navigateTo('/main/analytics'); } },
        { label: 'AI Assistant', click: () => { navigateTo('/main/assistant'); } }
      ]
    },

    // 🟥 Settings
    {
      label: 'Settings',
      submenu: [
        { label: 'Language', click: () => { navigateTo('/main/settings/language'); } },
        { label: 'Theme', click: () => { navigateTo('/main/settings/theme'); } },
        { label: 'Preferences', click: () => { navigateTo('/main/settings/preferences'); } }
        ,
        { label: 'Closing Date', click: () => { navigateTo('/main/settings/closing-date'); } }
        ,
        { label: 'Background Scheduler', click: () => { navigateTo('/main/settings/scheduler'); } }
        ,
        { label: 'API Server', click: () => { navigateTo('/main/settings/api'); } }
        ,
        { label: 'Approval Policies', click: () => { navigateTo('/main/settings/approval-policies'); } }
        ,
        { label: 'Payment Gateways', click: () => { navigateTo('/main/settings/payment-gateways'); } }
        ,
        { label: 'Payroll Settings', click: () => { navigateTo('/main/settings/payroll'); } }
        ,
        { label: 'Backup & Export', click: () => { navigateTo('/main/settings/backup-export'); } }
        ,
        { label: 'Cloud Sync', click: () => { navigateTo('/main/settings/cloud-sync'); } }
        ,
        { label: 'Sync / VPN', click: () => { navigateTo('/main/settings/sync-vpn'); } }
        ,
        { label: 'Database Share & Download', click: () => { navigateTo('/main/settings/database'); } }
        ,
        { label: 'Multi-Currency', click: () => { navigateTo('/main/settings/currencies'); } }
        ,
        { label: 'Accessibility', click: () => { navigateTo('/main/settings/accessibility'); } }
      ]
    },
  
    // 🟧 Help
    {
      label: 'Help',
      submenu: [
        { label: 'User Guide' },
        { label: 'Contact Support' },
        { type: 'separator' },
        { label: 'AI Assistant', click: () => { navigateTo('/main/assistant'); } },
        { label: 'About', role: 'about' }
      ]
    },
    // Quick access to Approvals Center
    {
      label: 'Window',
      submenu: [
        { label: 'Approvals Center', click: () => { navigateTo('/main/approvals/center'); } },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  // Fallback listener for UI navigation requests from preload
  ipcMain.on('open-payroll-calendar', () => {
    if (!win) return;
    if (app.isPackaged) {
      win.webContents.send('navigate', '/main/banking/payroll-calendar');
    } else {
      const base = (process.env.ELECTRON_START_URL || devUrl || 'http://localhost:3000').replace(/\/$/, '');
      win.loadURL(`${base}/#/main/banking/payroll-calendar`);
    }
  });
}

const registerAllHandlers = async () => {
  const handlers = [
    { name: 'Auth', register: registerAuthHandlers },
    { name: 'Backup', register: registerBackupHandlers },
    { name: 'Invoice', register: registerInvoiceHandlers },      // Register first as others might depend on it
    { name: 'Tax', register: registerTaxHandlers },
    { name: 'Banking', register: registerBankingHandlers },
    { name: 'Transaction', register: registerTransactionHandlers },
    { name: 'Payroll', register: registerPayrollHandlers },
    { name: 'Employee', register: registerEmployeeHandlers },
    { name: 'Customer', register: registerCustomerHandlers },
    { name: 'Inventory', register: registerInventoryHandlers },
    { name: 'Project', register: registerProjectHandlers },
    { name: 'POS', register: registerPosHandlers },
    { name: 'CRM', register: registerCrmHandlers },
    { name: 'BankStatements', register: registerBankStatementHandlers },
    { name: 'BankFeeds', register: require('./handlers/bankFeedHandlers') },
    { name: 'Payments', register: require('./handlers/paymentGatewayHandlers') },
    { name: 'Depreciation', register: require('./handlers/depreciationHandlers') },
    { name: 'APIServer', register: require('./handlers/apiServer') },
    { name: 'Sync', register: registerSyncHandlers },
    { name: 'Import', register: require('./handlers/importHandlers') },
    { name: 'CloudSync', register: registerCloudSyncHandlers },
    { name: 'Documents', register: require('./handlers/documentHandlers') },
    { name: 'Assistant', register: require('./handlers/assistantHandlers') },
    { name: 'Settings', register: registerSettingsHandlers },
    { name: 'Analytics', register: registerAnalyticsHandlers },
    { name: 'Approvals', register: require('./handlers/approvalHandlers') },
    { name: 'Accounting', register: require('./handlers/accountingHandlers') },
    { name: 'Scheduler', register: require('./handlers/schedulerHandlers') },
    { name: 'ReportBuilder', register: require('./handlers/reportBuilderHandlers') },
    { name: 'Currency', register: require('./handlers/currencyHandlers') },
    { name: 'CreditNotes', register: require('./handlers/creditNoteHandlers') },
    { name: 'Webhooks', register: require('./handlers/webhookHandlers') },
    { name: 'IPC', register: registerIpcHandlers }              // Keep IPC handlers last
  ];

  for (const handler of handlers) {
    try {
      console.log(`Registering handler module: ${handler.name} (register type: ${typeof handler.register})`);
      if (typeof handler.register !== 'function') {
        console.error(`Error: ${handler.name} handler is not a function`);
        continue;
      }
      await handler.register();
      console.log(`${handler.name} handlers registered successfully`);
    } catch (error) {
      console.error(`Error registering ${handler.name} handlers:`, error);
    }
  }
};

app.whenReady().then(async () => {
  try {
    await registerAllHandlers();
    createWindow();
  } catch (error) {
    console.error('Error during app initialization:', error);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
