const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const registerIpcHandlers = require('./handlers/ipcHandlers');
const registerEmployeeHandlers = require('./handlers/employeeHandlers');
const registerPayrollHandlers = require('./handlers/payrollHandlers');

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

  win.loadURL('http://localhost:3000');

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
        { label: 'Accountant Center', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/dashboard/accountant');
          }
        } },
        { type: 'separator' },
        { label: 'Chart of Accounts', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/accountant/chart-of-accounts');
          }
        } },
        { label: 'Fixed Assets Item List', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/accountant/fixed-assets');
          }
        } },
        { type: 'separator' },
        { label: 'Enter Transaction', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/accountant/enter-transaction');
          }
        } },
        { label: 'Void Transaction', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/accountant/void-transaction');
          }
        } },
        { type: 'separator' },
        { label: 'Reconcile', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/accountant/reconcile');
          }
        } },
        { label: 'Working Trial Balance', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/accountant/trial-balance');
          }
        } },
        { label: 'General Ledger', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/accountant/general-ledger');
          }
        } },
        { label: 'Journal Entries', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/accountant/journal-entries');
          }
        } },
        { label: 'Set Closing Date', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/accountant/closing-date');
          }
        } },
        { type: 'separator' },
        { label: 'Manage Fixed Assets', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/accountant/manage-assets');
          }
        } }
      ]
    },
    // 🟩 Custom System Menu
    {
      label: 'Company',
      submenu: [
        { label: 'Home Page',  click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/dashboard/flow');
          }
        } },
            { label: 'Company Snapshot',
              click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/dashboard/home-dash');
          }
        }
             },            
            { label: 'My Company', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/dashboard/company');
          }
        } },
            { label: 'Users' , 
              submenu:[
                {label:'Setup User Roles'},
                {label:'View Users', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/inner/employees');
          }
        }}

            ]},
            { type: 'separator' },
            { label: 'Set Closing Date' },
            { label: 'Planning and Budgeting' , 
              submenu:[
                {label:'Setup Budgets', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/inner/reports');
          }
        }},
                {label:'Setup Forecast', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/inner/reports');
          }
        }},
                {label:'Cashflow Projector', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/inner/reports');
          }
        }}

            ]},
            { label: 'Manage Fixed Assets' },
        { label: 'Exit', role: 'quit' }
      ]
    },

    // 🟨 Customers-like Menu
    {
      label: 'Customers',
      submenu: [      
            { label: 'Customer Center', click: () => {
              if (win) {
                win.loadURL('http://localhost:3000/main/customers/center');
              }
            } },
            { type: 'separator' },
            { label: 'Create Quotes', click: () => {
              if (win) {
                win.loadURL('http://localhost:3000/main/customers/quotes/new');
              }
            } },
            { label: 'Create Invoices', click: () => {
              if (win) {
                win.loadURL('http://localhost:3000/main/customers/invoices/new');
              }
            } },
            { type: 'separator' },
            { label: 'Create Statements', click: () => {
              if (win) {
                win.loadURL('http://localhost:3000/main/customers/statements/new');
              }
            } },
            { label: 'Receive Payments', click: () => {
              if (win) {
                win.loadURL('http://localhost:3000/main/customers/payments');
              }
            } },
            { type: 'separator' },
            { label: 'Income Tracker', click: () => {
              if (win) {
                win.loadURL('http://localhost:3000/main/customers/income-tracker');
              }
            } },
            { label: 'Recurring Transactions', click: () => {
              if (win) {
                win.loadURL('http://localhost:3000/main/customers/recurring');
              }
            } },
            { label: 'Item List', click: () => {
              if (win) {
                win.loadURL('http://localhost:3000/main/customers/items');
              }
            } },
          ]
        },
        {
          label: 'Vendors',
          submenu: [
            { label: 'Vendor Center', click: () => {
              if (win) {
                win.loadURL('http://localhost:3000/main/vendors/center');
              }
            }  },
            { type: 'separator' },
            { label: 'Bill Tracker', click: () => {
              if (win) {
                win.loadURL('http://localhost:3000/main/vendors/bills/tracker');
              }
            } },
            { label: 'Enter Bills', click: () => {
              if (win) {
                win.loadURL('http://localhost:3000/main/vendors/bills/new');
              }
            } },
            { label: 'Pay Bills', click: () => {
              if (win) {
                win.loadURL('http://localhost:3000/main/vendors/bills/pay');
              }
            }},
            { type: 'separator' },
            { label: 'Item List', click: () => {
              if (win) {
                win.loadURL('http://localhost:3000/main/vendors/items');
              }
            } }
          ]
        },
        {
          label: 'Employees',
          submenu: [
            { label: 'Employee Center', click: () => {
              if (win) {
                win.loadURL('http://localhost:3000/main/employees/center');
              }
            }},
            { type: 'separator' },
            { label: 'Employee List', click: () => {
              if (win) {
                win.loadURL('http://localhost:3000/main/employees/list');
              }
            }},
            { label: 'Run Payroll', click: () => {
              if (win) {
                win.loadURL('http://localhost:3000/main/employees/payroll');
              }
            }},
            { label: 'Tax Filing', click: () => {
              if (win) {
                win.loadURL('http://localhost:3000/main/employees/tax-filing');
              }
            }}
          ]
        },
        {
          label: 'Banking',
          submenu: [
            { label: 'Make Deposits', click: () => {
              if (win) {
                win.loadURL('http://localhost:3000/main/banking/deposits');
              }
            } },
            { label: 'Transfer Funds', click: () => {
              if (win) {
                win.loadURL('http://localhost:3000/main/banking/transfers');
              }
            } },
            { type: 'separator' },
            { label: 'Reconcile', click: () => {
              if (win) {
                win.loadURL('http://localhost:3000/main/banking/reconcile');
              }
            } },
            { label: 'Run Payroll', click: () => {
              if (win) {
                win.loadURL('http://localhost:3000/main/banking/payroll');
              }
            } }
          ]
        },

    // 🟦 Activities
    {
      label: 'Expense Tracking',
      submenu: [
        { label: 'Bill Management', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/expenses/bills');
          }
        } },
        { label: 'Expense Tracking', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/expenses/tracking');
          }
        } },
        { type: 'separator' },
        { label: 'Credit Card Charges', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/expenses/credit-cards');
          }
        } },
        { label: 'Transactions', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/expenses/transactions');
          }
        } }
      ]
    },

    // 🟪 Reports
    {
      label: 'Reports and Analytics',
      submenu: [
        { label: 'Profit & Loss', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/reports/profit-loss');
          }
        } },
        { label: 'Cash Flow', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/reports/cash-flow');
          }
        } },
        { label: 'Balance Sheet', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/reports/balance-sheet');
          }
        } },
        { type: 'separator' },
        { label: 'Job Costing', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/reports/job-costing');
          }
        } },
        { label: 'Project Profitability', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/reports/project-profitability');
          }
        } },
        { type: 'separator' },
        { label: 'Time Tracking', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/reports/time-tracking');
          }
        } }
      ]
    },

    // 🟥 Settings
    {
      label: 'Settings',
      submenu: [
        { label: 'Language', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/settings/language');
          }
        } },
        { label: 'Theme', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/settings/theme');
          }
        } },
        { label: 'Preferences', click: () => {
          if (win) {
            win.loadURL('http://localhost:3000/main/settings/preferences');
          }
        } }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    },

    // 🟧 Help
    {
      label: 'Help',
      submenu: [
        { label: 'User Guide' },
        { label: 'Contact Support' },
        { type: 'separator' },
        { label: 'About', role: 'about' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  createWindow();
  registerIpcHandlers();
  registerEmployeeHandlers();
  registerPayrollHandlers();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
