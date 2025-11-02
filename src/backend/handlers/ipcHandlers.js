// ipcHandlers.js

const { ipcMain } = require('electron');
const {
  Customers,
  Invoices,
  Quotes,
  Products,
  Employees,
  Expenses,
  Notes,
  Suppliers,
  Users,
  Vat,
  CashflowProjections,
  Budgets,
  ChartOfAccounts,
  FixedAssets,
  Company,
  Transactions,
  Journal,
  Ledger,
} = require('./../models');

const Tax = require('../models/tax');

const registerIpcHandlers = () => {
  // Create the tax_filings table when handlers are registered
  Tax.createTable();
  // Handler to get all employees
  ipcMain.handle('get-employees', async () => {
    try {
      return await Employees.getAllEmployees();
    } catch (error) {
      console.error('Error fetching employees:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('get-users', async () => {
    try {
      return await Users.getAllUsers();
    } catch (error) {
      console.error('Error fetching users:', error);
      return { error: error.message };
    }
  });
// Transactions
ipcMain.handle('get-transactions', async () => {
  try {
    return Transactions.getAll();
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return { error: error.message };
  }
});
ipcMain.handle('insert-transaction', async (event, tx) => {
  try {
    return Transactions.insert(tx);
  } catch (error) {
    console.error('Error inserting transaction:', error);
    return { error: error.message };
  }
});
ipcMain.handle('void-transaction', async (event, id) => {
  try {
    return Transactions.voidTransaction(id);
  } catch (error) {
    console.error('Error voiding transaction:', error);
    return { error: error.message };
  }
});

// Journal
ipcMain.handle('get-journal', async () => {
  try {
    return Journal.getAll();
  } catch (error) {
    console.error('Error fetching journal:', error);
    return { error: error.message };
  }
});
ipcMain.handle('insert-journal', async (event, entry) => {
  try {
    return Journal.insert(entry);
  } catch (error) {
    console.error('Error inserting journal entry:', error);
    return { error: error.message };
  }
});

// Ledger
ipcMain.handle('get-ledger', async () => {
  try {
    return Ledger.getAll();
  } catch (error) {
    console.error('Error fetching ledger:', error);
    return { error: error.message };
  }
});

  ipcMain.handle('updateuser', async (event, userData) => {
    try {
      return await Users.updateUser(userData);
    } catch (error) {
      console.error('Error updating user:', error);
      return { error: error.message };
    }
  });

  // Handler to insert an employee
  ipcMain.handle('insert-employee', async (event, employeeData) => {
    try {
      const { first_name, last_name, mi, email, phone, address, date_hired, entered_by, salary, status } = employeeData;
      return await Employees.insertEmployee(first_name, last_name, mi, email, phone, address, date_hired, entered_by, salary, status);
    } catch (error) {
      console.error('Error inserting employee:', error);
      return { error: error.message };
    }
  });

   // Handler to get all Customers
   ipcMain.handle('get-customers', async () => {
    try {
      return await Customers.getAllCustomers();
    } catch (error) {
      console.error('Error fetching cutomers:', error);
      return { error: error.message };
    }
  });

  // Handler to insert an customer
  ipcMain.handle('insert-customer', async (event, title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,
    fax,other,website,address1,address2,city,state,postal_code,country,payment_method,terms,tax_number,entered_by,opening_balance,as_of,delivery_option,language,notes) => {
    try {
      return await Customers.insertCustomer(title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,
        fax,other,website,address1,address2,city,state,postal_code,country,payment_method,terms,tax_number,entered_by,opening_balance,as_of,delivery_option,language,notes);
    } catch (error) {
      console.error('Error inserting customer:', error);
      return { error: error.message };
    }
  });

  // Handler to get all Suppliers
  ipcMain.handle('get-suppliers', async () => {
    try {
      return await Suppliers.getAllSuppliers();
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      return { error: error.message };
    }
  });

  // Handler to insert an supplier
  ipcMain.handle('insert-supplier', async (event, first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,
    fax,other,website,address1,address2,city,state,postal_code,country,supplier_terms,business_number,account_number,expense_category,opening_balance,as_of,entered_by,notes) => {
    try {
      return await Suppliers.insertSupplier(first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,
        fax,other,website,address1,address2,city,state,postal_code,country,supplier_terms,business_number,account_number,expense_category,opening_balance,as_of,entered_by,notes);
    } catch (error) {
      console.error('Error inserting supplier:', error);
      return { error: error.message };
    }
  });

// Handler to get all Expenses
ipcMain.handle('get-expenses', async () => {
  try {
    return await Expenses.getAllExpenses();
  } catch (error) {
    console.error('Error fetching expenses:', error);
    return { error: error.message };
  }
});

// Handler to insert an expense
ipcMain.handle('insert-expense', async (event, payee,payment_account,payment_date, payment_method, ref_no,category,entered_by,approval_status,expenseLines) => {
  try {
    return await Expenses.insertExpense(payee,payment_account,payment_date, payment_method, ref_no,category,entered_by,approval_status,expenseLines);
  } catch (error) {
    console.error('Error inserting expense:', error);
    return { error: error.message };
  }
});

// Handler to get all Quotes
ipcMain.handle('get-quotes', async () => {
  try {
    return await Quotes.getAllQuotes();
  } catch (error) {
    console.error('Error fetching quotes:', error);
    return { error: error.message };
  }
});

// Handler to get single Quote
ipcMain.handle('get-singleQuote', async (event,quote_id) => {
  try {
    return await Quotes.getSingleQuote(quote_id);
  } catch (error) {
    console.log(quote_id);
    console.error('Error fetching quote:', error);
    return { error: error.message };
  }
});

// Handler to insert an quote
ipcMain.handle('insert-quote', async (event, status,customer,customer_email, islater, billing_address,start_date,last_date,message,statement_message,number,entered_by,vat,quoteLines) => {
  try {
    return await Quotes.insertQuote(status,customer,customer_email, islater, billing_address,start_date,last_date,message,statement_message,number,entered_by,vat,quoteLines);
  } catch (error) {
    console.error('Error inserting quote:', error);
    return { error: error.message };
  }
});

// Handler to get all Invoices
ipcMain.handle('get-invoices', async () => {
  try {
    return await Invoices.getAllInvoices();
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return { error: error.message };
  }
});

ipcMain.handle('get-singleInvoice', async (event,invoice_id) => {
  try {
    return await Invoices.getSingleInvoice(invoice_id);
  } catch (error) {    
    console.error('Error fetching invoice:', error);
    return { error: error.message };
  }
});

ipcMain.handle('get-singleCustomer', async (event,customer_id) => {
  try {
    return await Customers.getSingleCustomer(customer_id);
  } catch (error) {    
    console.error('Error fetching customer:', error);
    return { error: error.message };
  }
});

ipcMain.handle('get-singleSupplier', async (event,supplier_id) => {
  try {
    return await Suppliers.getSingleSupplier(supplier_id);
  } catch (error) {    
    console.error('Error fetching supplier:', error);
    return { error: error.message };
  }
});

ipcMain.handle('invoicesummary', async () => {
  try {
    return await Invoices.getInvoiceSummary();
  } catch (error) {    
    console.error('Error fetching invoice summary:', error);
    return { error: error.message };
  }
});

ipcMain.handle('dashboard', async () => {
  try {
    console.log(Invoices.getDashboardSummary());
    return await Invoices.getDashboardSummary();
  } catch (error) {    
    console.error('Error fetching dashboard summary:', error);
    return { error: error.message };
  }
});

// Handler to insert an invoice
ipcMain.handle('insert-invoice', async (event, customer,customer_email,islater, billing_address, terms,start_date,last_date,message,statement_message,number,entered_by,vat,status,invoiceLines) => {
  try {
       return await Invoices.insertInvoice(customer,customer_email,islater, billing_address, terms,start_date,last_date,message,statement_message,number,entered_by,vat,status,invoiceLines);
  } catch (error) {
    console.error('Error inserting invoice:', error);
    return { error: error.message };
  }
});

// Handler to get all Products
ipcMain.handle('get-products', async () => {
  try {
    return await Products.getAllProducts();
  } catch (error) {
    console.error('Error fetching Products:', error);
    return { error: error.message };
  }
});

// Handler to insert an product
ipcMain.handle('insert-product', async (event, type,name,sku, category, description,price,income_account,tax_inclusive,tax,isfromsupplier,entered_by) => {
  try {
    return await Products.insertProduct(type,name,sku, category, description,price,income_account,tax_inclusive,tax,isfromsupplier,entered_by);
  } catch (error) {
    console.error('Error inserting product:', error);
    return { error: error.message };
  }
});

// Handler to get all Vat
ipcMain.handle('get-vat', async () => {
  try {
    return await Vat.getAllVat();
  } catch (error) {
    console.error('Error fetching Vat:', error);
    return { error: error.message };
  }
});

// Handler to insert an vat
ipcMain.handle('insert-vat', async (event, vat_name,vat_percentage,entered_by) => {
  try {
    return await Vat.insertVat(vat_name,vat_percentage,entered_by);
  } catch (error) {
    console.error('Error inserting vat:', error);
    return { error: error.message };
  }
});

// Chart of Accounts handlers
ipcMain.handle('get-chart-accounts', async () => {
  try {
    return await ChartOfAccounts.getAllAccounts();
  } catch (error) {
    console.error('Error fetching chart of accounts:', error);
    return { error: error.message };
  }
});

ipcMain.handle('insert-chart-account', async (event, name, type, number, entered_by) => {
  try {
    return await ChartOfAccounts.insertAccount(name, type, number, entered_by);
  } catch (error) {
    console.error('Error inserting chart account:', error);
    return { error: error.message };
  }
});

// Fixed assets handlers
ipcMain.handle('get-fixed-assets', async () => {
  try {
    return await FixedAssets.getAllAssets();
  } catch (error) {
    console.error('Error fetching fixed assets:', error);
    return { error: error.message };
  }
});

ipcMain.handle('insert-fixed-asset', async (event, name, category, value, entered_by) => {
  try {
    return await FixedAssets.insertAsset(name, category, value, entered_by);
  } catch (error) {
    console.error('Error inserting fixed asset:', error);
    return { error: error.message };
  }
});

// Handler to get all invoice
ipcMain.handle('get-initinvoice', async (event,invoice_id, type) => {
  try {
    return await Invoices.getInitialInvoice(invoice_id, type);
  } catch (error) {    
    console.error(`Error fetching: ${type}`, error);
    return { error: error.message };
  }
});

// Handler to get all Financial Reports
ipcMain.handle('get-financial', async (event,start_date, last_date) => {
  try {
    return await Invoices.getFinancialReport(start_date, last_date);
  } catch (error) {    
    console.error(`Error fetching:`, error);
    return { error: error.message };
  }
});

// Handler to get all Management Reports
ipcMain.handle('get-management', async (event,start_date, last_date) => {
  try {
    return await Invoices.getManagementReport(start_date, last_date);
  } catch (error) {    
    console.error(`Error fetching:`, error);
    return { error: error.message };
  }
});

ipcMain.handle('get-budgets', async () => {
  try {
    return await Budgets.getBudgets();
  } catch (error) {
    console.error('Error fetching budgets:', error);
    return { error: error.message };
  }
});

ipcMain.handle('insert-budget', async (event, department, period, amount, forecast, entered_by) => {
  try {
    return await Budgets.insertBudget(department, period, amount, forecast, entered_by);
  } catch (error) {
    console.error('Error inserting budget:', error);
    return { error: error.message };
  }
});

// Handler update Invoice
ipcMain.handle('updateinvoice', async (event,invoiceData) => {
  try {
    return await Invoices.updateInvoice(invoiceData);
  } catch (error) {    
    console.error('Error updating invoice:', error);
    return { error: error.message };
  }
});

// Handler update Invoice
ipcMain.handle('updatequote', async (event,quoteData) => {
  try {
    return await Quotes.updateQuote(quoteData);
  } catch (error) {    
    console.error('Error updating quote:', error);
    return { error: error.message };
  }
});

// Handler update vat
ipcMain.handle('updatevat', async (event,vatData) => {
  try {
    return await Vat.updateVat(vatData);
  } catch (error) {    
    console.error('Error updating vat:', error);
    return { error: error.message };
  }
});

// Handler update employee
ipcMain.handle('updateemployee', async (event,employeeData) => {
  try {
    return await Employees.updateEmployee(employeeData);
  } catch (error) {    
    console.error('Error updating employee:', error);
    return { error: error.message };
  }
});

// Alias with hyphen to support calls using 'update-employee'
ipcMain.handle('update-employee', async (event, employeeData) => {
  try {
    return await Employees.updateEmployee(employeeData);
  } catch (error) {
    console.error('Error updating employee (hyphen alias):', error);
    return { error: error.message };
  }
});

// Handler update expense
ipcMain.handle('updateexpense', async (event,expenseData) => {
  try {
    return await Expenses.updateExpense(expenseData);
  } catch (error) {    
    console.error('Error updating expense:', error);
    return { error: error.message };
  }
});

// Handler update product
ipcMain.handle('updateproduct', async (event,productData) => {
  try {
    return await Products.updateProduct(productData);
  } catch (error) {    
    console.error('Error updating product:', error);
    return { error: error.message };
  }
});

// Handler update customer
ipcMain.handle('updatecustomer', async (event,customerData) => {
  try {
    return await Customers.updateCustomer(customerData);
  } catch (error) {    
    console.error('Error updating customer:', error);
    return { error: error.message };
  }
});

// Handler update supplier
ipcMain.handle('updatesupplier', async (event,supplierData) => {
  try {
    return await Suppliers.updateSupplier(supplierData);
  } catch (error) {    
    console.error('Error updating supplier:', error);
    return { error: error.message };
  }
});

// Deleting record
ipcMain.handle('deletingrecord', async (event,id,table) => {
  try {
    table = (table || '').toLowerCase();
    switch (table) {
      case 'invoices':
        return await Invoices.deleteInvoice(id);
      case 'quotes':
        return await Quotes.deleteQuote(id);
      case 'expenses':
        // delete expense lines first then expense
        return await Expenses.deleteExpense ? await Expenses.deleteExpense(id) : await Vat.deleteRecord(id,table);
      case 'vat':
        return await Vat.deleteRecord(id,table);
      default:
        // fallback to generic delete
        return await Vat.deleteRecord(id,table);
    }
  } catch (error) {    
    console.error('Error deleting record:', error);
    return { error: error.message };
  }
});

// convert quote
ipcMain.handle('convertquote', async (event,quote_id) => {
  try {
    return await Quotes.convertToInvoice(quote_id);
  } catch (error) {    
    console.error('Error converting quote:', error);
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

  ipcMain.handle('process-payroll', async (event, data) => {
    try {
      return await Transactions.processPayroll(data);
    } catch (error) {
      console.error('Error processing payroll:', error);
      return { error: error.message };
    }
  });

  // Handler to get payroll runs/records
  ipcMain.handle('get-payroll-records', async () => {
    try {
      return await Transactions.getPayrollRuns();
    } catch (error) {
      console.error('Error fetching payroll runs:', error);
      return { error: error.message };
    }
  });

  // Tax Filing handlers
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

  // Company handlers
  ipcMain.handle('get-company', async () => {
    try {
      return await Company.getInfo();
    } catch (error) {
      console.error('Error fetching company info:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('save-company', async (event, data) => {
    try {
      return await Company.saveInfo(data);
    } catch (error) {
      console.error('Error saving company info:', error);
      return { error: error.message };
    }
  });
};

module.exports = registerIpcHandlers;
