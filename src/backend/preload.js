// /backend/preload.js
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  //Users
  getAllUsers: () => ipcRenderer.invoke('get-users'),
  updateUser: (userData) => ipcRenderer.invoke('updateuser',userData),
  
  //Employees
  getEmployees: () => {
    console.log('Preload: Invoking get-employees');
    return ipcRenderer.invoke('get-employees');
  },
  getAllEmployees: () => {
    console.log('Preload: Invoking get-employees (legacy)');
    return ipcRenderer.invoke('get-employees');
  },
  updateEmployee: (employeeData) => ipcRenderer.invoke('update-employee', employeeData),
  insertEmployee: (employeeData) => ipcRenderer.invoke('insert-employee', employeeData),
  deleteEmployee: (id) => ipcRenderer.invoke('delete-employee', id),
  //Customers
  getAllCustomers: () => ipcRenderer.invoke('get-customers'),
  getSingleCustomer: (customer_id) => ipcRenderer.invoke('get-singleCustomer',customer_id),
  updateCustomer: (customerData) => ipcRenderer.invoke('updatecustomer',customerData),
  insertCustomer: (title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,fax,other,website,address1,address2,city,state,postal_code,country,payment_method,terms,tax_number,entered_by,opening_balance,as_of,delivery_option,language, notes) => ipcRenderer.invoke('insert-customer', title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,fax,other,website,address1,address2,city,state,postal_code,country,payment_method,terms,tax_number,entered_by,opening_balance,as_of,delivery_option,language, notes),
  //Suppliers
  getAllSuppliers: () => ipcRenderer.invoke('get-suppliers'),
  getSingleSupplier: (supplier_id) => ipcRenderer.invoke('get-singleSupplier',supplier_id),
  updateSupplier: (supplierData) => ipcRenderer.invoke('updatesupplier',supplierData),
  insertSupplier: (title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,fax,other,website,address1,address2,city,state,postal_code,country,supplier_terms,business_number,account_number,expense_category,opening_balance,as_of,entered_by, notes) => ipcRenderer.invoke('insert-supplier', title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,fax,other,website,address1,address2,city,state,postal_code,country,supplier_terms,business_number,account_number,expense_category,opening_balance,as_of,entered_by, notes),
//Expenses
  getAllExpenses: () => ipcRenderer.invoke('get-expenses'),
  updateExpense: (expenseData) => ipcRenderer.invoke('updateexpense',expenseData),
  insertExpense: (payee,payment_account,payment_date, payment_method, ref_no,category,entered_by,approval_status,expenseLines) => ipcRenderer.invoke('insert-expense', payee,payment_account,payment_date, payment_method, ref_no,category,entered_by,approval_status,expenseLines),
//Quotes
getAllQuotes: () => ipcRenderer.invoke('get-quotes'),
getSingleQuote: (quote_id) => ipcRenderer.invoke('get-singleQuote',quote_id),
updateQuote: (quoteData) => ipcRenderer.invoke('updatequote',quoteData),
insertQuote: (status,customer,customer_email, islater, billing_address,start_date,last_date,message,statement_message,number,entered_by,vat,quoteLines) => ipcRenderer.invoke('insert-quote', status,customer,customer_email, islater, billing_address,start_date,last_date,message,statement_message,number,entered_by,vat,quoteLines),
convertToInvoice: (quote_id) => ipcRenderer.invoke('convertquote', quote_id),
//Invoices 
getAllInvoices: () => ipcRenderer.invoke('get-invoices'),
getFinancialReport: (start_date, last_date) => ipcRenderer.invoke('get-financial', start_date, last_date),
getManagementReport: (start_date, last_date) => ipcRenderer.invoke('get-management', start_date, last_date),
getInvoiceSummary: () => ipcRenderer.invoke('invoicesummary'),
getDashboardSummary: () => ipcRenderer.invoke('dashboard'),
getSingleInvoice: (invoice_id) => ipcRenderer.invoke('get-singleInvoice',invoice_id),
getInitialInvoice: (invoice_id,type) => ipcRenderer.invoke('get-initinvoice',invoice_id, type),
updateInvoice: (invoiceData) => ipcRenderer.invoke('updateinvoice',invoiceData),
insertInvoice: (customer,customer_email,islater, billing_address, terms,start_date,last_date,message,statement_message,number,entered_by,vat,status,invoiceLines) => ipcRenderer.invoke('insert-invoice', customer,customer_email,islater, billing_address, terms,start_date,last_date,message,statement_message,number,entered_by,vat,status,invoiceLines),
//Products
getAllProducts: () => ipcRenderer.invoke('get-products'),
updateProduct: (productData) => ipcRenderer.invoke('updateproduct',productData),
insertProduct: (type,name,sku, category, description,price,income_account,tax_inclusive,tax,isfromsupplier,entered_by) => ipcRenderer.invoke('insert-product', type,name,sku, category, description,price,income_account,tax_inclusive,tax,isfromsupplier,entered_by),
//Vat
getAllVat: () => ipcRenderer.invoke('get-vat'),
updateVat: (vatData) => ipcRenderer.invoke('updatevat',vatData),
getVatReport: (start_date, last_date) => ipcRenderer.invoke('get-vatreport',start_date, last_date),
insertVat: (vat_name,vat_percentage,entered_by) => ipcRenderer.invoke('insert-vat', vat_name,vat_percentage,entered_by),
deleteRecord: (id,table) => ipcRenderer.invoke('deletingrecord', id,table),
  // Chart of accounts and fixed assets
  getChartOfAccounts: () => ipcRenderer.invoke('get-chart-accounts'),
  insertChartAccount: (name,type,number,entered_by) => ipcRenderer.invoke('insert-chart-account', name,type,number,entered_by),
  getFixedAssets: () => ipcRenderer.invoke('get-fixed-assets'),
  insertFixedAsset: (name,category,value,entered_by) => ipcRenderer.invoke('insert-fixed-asset', name,category,value,entered_by),

  // Transactions
  getTransactions: () => ipcRenderer.invoke('get-transactions'),
  insertTransaction: (tx) => ipcRenderer.invoke('insert-transaction', tx),
  voidTransaction: (id) => ipcRenderer.invoke('void-transaction', id),
  // Payroll
  getPayrollRecords: () => ipcRenderer.invoke('get-payroll-records'),
  processPayroll: (data) => ipcRenderer.invoke('process-payroll', data),

  // Journal
  getJournal: () => ipcRenderer.invoke('get-journal'),
  insertJournal: (entry) => ipcRenderer.invoke('insert-journal', entry),

  // Ledger
  getLedger: () => ipcRenderer.invoke('get-ledger'),
  // Tax Filing
  getTaxRecords: () => ipcRenderer.invoke('get-tax-records'),
  submitTaxFiling: (data) => ipcRenderer.invoke('submit-tax-filing', data),
  updateTaxFiling: (id, updates) => ipcRenderer.invoke('update-tax-filing', { id, updates }),

  // Company
  getCompany: () => ipcRenderer.invoke('get-company'),
  saveCompany: (data) => ipcRenderer.invoke('save-company', data),
  // Reports / Projections / Budgets
  getCashflowProjections: (year) => ipcRenderer.invoke('get-cashflow-projections', year),
  saveCashflowProjections: (projections, year) => ipcRenderer.invoke('save-cashflow-projections', projections, year),
  getBudgets: () => ipcRenderer.invoke('get-budgets'),
  insertBudget: (department, period, amount, forecast, entered_by) => ipcRenderer.invoke('insert-budget', department, period, amount, forecast, entered_by),

});
