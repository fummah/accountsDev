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
  getEmployeesPaginated: (page, pageSize, search) => ipcRenderer.invoke('get-employees-paginated', page, pageSize, search),
  getAllEmployees: () => {
    console.log('Preload: Invoking get-employees (legacy)');
    return ipcRenderer.invoke('get-employees');
  },
  updateEmployee: (employeeData) => ipcRenderer.invoke('update-employee', employeeData),
  insertEmployee: (employeeData) => ipcRenderer.invoke('insert-employee', employeeData),
  deleteEmployee: (id) => ipcRenderer.invoke('delete-employee', id),
  //Customers
  getAllCustomers: () => ipcRenderer.invoke('get-customers'),
  getCustomersPaginated: (page, pageSize, search) => ipcRenderer.invoke('get-customers-paginated', page, pageSize, search),
  getCustomerReport: () => ipcRenderer.invoke('get-customer-report'),
  getSingleCustomer: (customer_id) => ipcRenderer.invoke('get-singleCustomer',customer_id),
  updateCustomer: (customerData) => ipcRenderer.invoke('updatecustomer',customerData),
  insertCustomer: (title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,fax,other,website,address1,address2,city,state,postal_code,country,payment_method,terms,tax_number,entered_by,opening_balance,as_of,delivery_option,language, notes) => ipcRenderer.invoke('insert-customer', title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,fax,other,website,address1,address2,city,state,postal_code,country,payment_method,terms,tax_number,entered_by,opening_balance,as_of,delivery_option,language, notes),
  //Suppliers
  getAllSuppliers: () => ipcRenderer.invoke('get-suppliers'),
  getSuppliersPaginated: (page, pageSize, search) => ipcRenderer.invoke('get-suppliers-paginated', page, pageSize, search),
  getSingleSupplier: (supplier_id) => ipcRenderer.invoke('get-singleSupplier',supplier_id),
  updateSupplier: (supplierData) => ipcRenderer.invoke('updatesupplier',supplierData),
  insertSupplier: (title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,fax,other,website,address1,address2,city,state,postal_code,country,supplier_terms,business_number,account_number,expense_category,opening_balance,as_of,entered_by, notes) => ipcRenderer.invoke('insert-supplier', title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,fax,other,website,address1,address2,city,state,postal_code,country,supplier_terms,business_number,account_number,expense_category,opening_balance,as_of,entered_by, notes),
  supplierToggleStatus: (id, status) => ipcRenderer.invoke('supplier-toggle-status', id, status),
  deleteSupplier: (id) => ipcRenderer.invoke('delete-supplier', id),

  // Expense Categories
  expenseCategoriesList: () => ipcRenderer.invoke('expense-categories-list'),
  expenseCategoriesActive: () => ipcRenderer.invoke('expense-categories-active'),
  expenseCategoryInsert: (name, description, color) => ipcRenderer.invoke('expense-category-insert', name, description, color),
  expenseCategoryUpdate: (id, name, description, color, status) => ipcRenderer.invoke('expense-category-update', id, name, description, color, status),
  expenseCategoryDelete: (id) => ipcRenderer.invoke('expense-category-delete', id),

//Expenses
  getAllExpenses: () => ipcRenderer.invoke('get-expenses'),
  getExpensesPaginated: (page, pageSize, search) => ipcRenderer.invoke('get-expenses-paginated', page, pageSize, search),
  updateExpense: (expenseData) => ipcRenderer.invoke('updateexpense',expenseData),
  insertExpense: (payee,payment_account,payment_date, payment_method, ref_no,category,entered_by,approval_status,expenseLines) => ipcRenderer.invoke('insert-expense', payee,payment_account,payment_date, payment_method, ref_no,category,entered_by,approval_status,expenseLines),
  createExpenseWithApproval: (payee,payment_account,payment_date, payment_method, ref_no,category,entered_by,approval_status,expenseLines) => 
    ipcRenderer.invoke('expense-create-with-approval', payee,payment_account,payment_date, payment_method, ref_no,category,entered_by,approval_status,expenseLines),
  markExpensePaid: (id) => ipcRenderer.invoke('mark-expense-paid', id),
//Quotes
getAllQuotes: () => ipcRenderer.invoke('get-quotes'),
getQuotesPaginated: (page, pageSize, search, status) => ipcRenderer.invoke('get-quotes-paginated', page, pageSize, search, status),
getSingleQuote: (quote_id) => ipcRenderer.invoke('get-singleQuote',quote_id),
updateQuote: (quoteData) => ipcRenderer.invoke('updatequote',quoteData),
insertQuote: (status,customer,customer_email, islater, billing_address,start_date,last_date,message,statement_message,number,entered_by,vat,quoteLines) => ipcRenderer.invoke('insert-quote', status,customer,customer_email, islater, billing_address,start_date,last_date,message,statement_message,number,entered_by,vat,quoteLines),
convertToInvoice: (quote_id) => ipcRenderer.invoke('convertquote', quote_id),
//Invoices 
getAllInvoices: () => ipcRenderer.invoke('get-invoices'),
getInvoicesPaginated: (page, pageSize, search, status) => ipcRenderer.invoke('get-invoices-paginated', page, pageSize, search, status),
getInvoiceReport: () => ipcRenderer.invoke('get-invoice-report'),
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
getProductsPaginated: (page, pageSize, search, typeFilter) => ipcRenderer.invoke('get-products-paginated', page, pageSize, search, typeFilter),
updateProduct: (productData) => ipcRenderer.invoke('updateproduct',productData),
insertProduct: (type,name,sku, category, description,price,income_account,tax_inclusive,tax,isfromsupplier,entered_by) => ipcRenderer.invoke('insert-product', type,name,sku, category, description,price,income_account,tax_inclusive,tax,isfromsupplier,entered_by),
//Vat
getAllVat: () => ipcRenderer.invoke('get-vat'),
updateVat: (vatData) => ipcRenderer.invoke('updatevat',vatData),
getVatReport: (start_date, last_date) => ipcRenderer.invoke('get-vatreport',start_date, last_date),
insertVat: (vat_name,vat_percentage,entered_by) => ipcRenderer.invoke('insert-vat', vat_name,vat_percentage,entered_by),
deleteRecord: (id,table) => ipcRenderer.invoke('deletingrecord', id,table),
  // Chart of accounts and fixed assets
  getChartOfAccounts: () => ipcRenderer.invoke('get-chart-of-accounts'),
  insertChartAccount: (name,type,number,entered_by) => ipcRenderer.invoke('insert-chart-account', name,type,number,entered_by),
  updateChartAccount: (accountData) => ipcRenderer.invoke('update-chart-account', accountData),
  deleteChartAccount: (id) => ipcRenderer.invoke('delete-chart-account', id),
  getFixedAssets: () => ipcRenderer.invoke('get-fixed-assets'),
  insertFixedAsset: (asset) => ipcRenderer.invoke('insert-fixed-asset', asset),
  updateFixedAsset: (asset) => ipcRenderer.invoke('update-fixed-asset', asset),
  deleteFixedAsset: (id) => ipcRenderer.invoke('delete-fixed-asset', id),

  // UI helpers
  openPayrollCalendar: () => {
    // navigate the renderer to the payroll calendar route
    try {
      window.location.href = '/main/banking/payroll-calendar';
    } catch (err) {
      // fallback to notifying main process if direct navigation fails
      ipcRenderer.send('open-payroll-calendar');
    }
  },



  // Transactions
  getTransactions: () => ipcRenderer.invoke('get-transactions'),
  insertTransaction: (tx) => ipcRenderer.invoke('insert-transaction', tx),
  voidTransaction: (id) => ipcRenderer.invoke('void-transaction', id),
  getTrialBalance: (startDate, endDate) => ipcRenderer.invoke('get-trial-balance', startDate, endDate),
  getTrialBalanceConsolidated: (payload) => ipcRenderer.invoke('get-trial-balance-consolidated', payload),
  getTrialBalanceAdvanced: (filters) => ipcRenderer.invoke('get-trial-balance-advanced', filters),
  getDeposits: () => ipcRenderer.invoke('get-deposits'),
  getTransfers: () => ipcRenderer.invoke('get-transfers'),
  createDeposit: (data) => ipcRenderer.invoke('create-deposit', data),
  createBankTransfer: (data) => ipcRenderer.invoke('create-bank-transfer', data),
  reconcileTransactions: (data) => ipcRenderer.invoke('reconcile-transactions', data),
  createIntercompanyTransfer: (data) => ipcRenderer.invoke('create-intercompany-transfer', data),
  // Payroll
  getPayrollRecords: () => ipcRenderer.invoke('get-payroll-records'),
  processPayroll: (data) => ipcRenderer.invoke('process-payroll', data),
  payrollFormulaGet: () => ipcRenderer.invoke('payroll-formula-get'),
  payrollFormulaSave: (payload) => ipcRenderer.invoke('payroll-formula-save', payload),
  payrollTaxImport: (payload) => ipcRenderer.invoke('payroll-tax-import', payload),
  payrollTaxList: (payload) => ipcRenderer.invoke('payroll-tax-list', payload),
  payrollDeductionsGet: () => ipcRenderer.invoke('payroll-deductions-get'),
  payrollDeductionsSave: (items) => ipcRenderer.invoke('payroll-deductions-save', items),
  payrollEfileExport: (payload) => ipcRenderer.invoke('payroll-efile-export', payload),
  payrollPayslipGet: (payload) => ipcRenderer.invoke('payroll-payslip-get', payload),
  payrollPayslipsForRun: (runId) => ipcRenderer.invoke('payroll-payslips-for-run', runId),

  // Journal
  getJournal: () => ipcRenderer.invoke('get-journal'),
  insertJournal: (entry) => ipcRenderer.invoke('insert-journal', entry),
  suggestCorrectiveJournal: (entryDraft, options) => ipcRenderer.invoke('suggest-corrective-journal', entryDraft, options),
  createReversalJournal: (payload) => ipcRenderer.invoke('create-reversal-journal', payload),

  // Ledger
  getLedger: () => ipcRenderer.invoke('get-ledger'),
  // Tax Filing
  getTaxRecords: () => ipcRenderer.invoke('get-tax-records'),
  submitTaxFiling: (data) => ipcRenderer.invoke('submit-tax-filing', data),
  updateTaxFiling: (id, updates) => ipcRenderer.invoke('update-tax-filing', { id, updates }),

  // Company
  getCompany: () => ipcRenderer.invoke('get-company'),
  saveCompany: (data) => ipcRenderer.invoke('save-company', data),
  /** Load massive dummy data (customers, invoices, quotes, entities, etc.). Pass optional counts, e.g. { customers: 500, invoices: 2000 }. */
  seedDummyData: (countsOverride) => ipcRenderer.invoke('seed-dummy-data', countsOverride),

  // Entities
  listEntities: () => ipcRenderer.invoke('entities-list'),
  createEntity: (payload) => ipcRenderer.invoke('entities-create', payload),
  assignUserToEntity: (userId, entityId, role) => ipcRenderer.invoke('entity-assign-user', { userId, entityId, role }),

  // Dimensions
  listClasses: () => ipcRenderer.invoke('classes-list'),
  createClass: (payload) => ipcRenderer.invoke('classes-create', payload),
  listLocations: () => ipcRenderer.invoke('locations-list'),
  createLocation: (payload) => ipcRenderer.invoke('locations-create', payload),
  listDepartments: () => ipcRenderer.invoke('departments-list'),
  createDepartment: (payload) => ipcRenderer.invoke('departments-create', payload),
  listRoles: () => ipcRenderer.invoke('roles-list'),
  createRole: (name, description) => ipcRenderer.invoke('roles-create', name, description),
  updateRole: (id, name, description) => ipcRenderer.invoke('roles-update', id, name, description),
  deleteRole: (id) => ipcRenderer.invoke('roles-delete', id),

  // COA import/export + versions
  coaExportTemplate: () => ipcRenderer.invoke('coa-export-template'),
  coaExportCurrent: () => ipcRenderer.invoke('coa-export-current'),
  coaImport: (csvText, note) => ipcRenderer.invoke('coa-import', { csvText, note }),
  coaVersionsList: () => ipcRenderer.invoke('coa-versions-list'),
  coaVersionCreate: (note) => ipcRenderer.invoke('coa-version-create', note),
  coaVersionRestore: (id) => ipcRenderer.invoke('coa-version-restore', id),
  // Reports / Projections / Budgets
  getCashflowProjections: (year) => ipcRenderer.invoke('get-cashflow-projections', year),
  saveCashflowProjections: (projections, year) => ipcRenderer.invoke('save-cashflow-projections', projections, year),
  getBudgets: () => ipcRenderer.invoke('get-budgets'),
  insertBudget: (department, period, amount, forecast, entered_by) => ipcRenderer.invoke('insert-budget', department, period, amount, forecast, entered_by),
  updateBudget: (id, department, period, amount, forecast) => ipcRenderer.invoke('update-budget', id, department, period, amount, forecast),
  deleteBudget: (id) => ipcRenderer.invoke('delete-budget', id),
  budgetVsActual: (period) => ipcRenderer.invoke('budget-vs-actual', period),
  budgetPeriods: () => ipcRenderer.invoke('budget-periods'),

  // Statements
  createStatement: (data) => ipcRenderer.invoke('create-statement', data),

  // Payments
  getUnpaidInvoices: (customerId) => ipcRenderer.invoke('get-unpaid-invoices', customerId),
  recordPayment: (data) => ipcRenderer.invoke('record-payment', data),
  getPayments: (limit) => ipcRenderer.invoke('get-payments', limit),
  getPaymentsPaginated: (params) => ipcRenderer.invoke('get-payments-paginated', params),

  // Income Tracking
  getIncomeTransactions: (params) => ipcRenderer.invoke('get-income-transactions', params),

  // Documents
  getDocuments: (category, linkedId) => ipcRenderer.invoke('documents-list', category, linkedId),
  uploadDocument: (payload) => ipcRenderer.invoke('document-upload', payload),
  openDocument: (id) => ipcRenderer.invoke('document-open', id),
  deleteDocument: (id) => ipcRenderer.invoke('document-delete', id),

  // Recurring Transactions
  getRecurringTransactions: () => ipcRenderer.invoke('get-recurring-transactions'),
  createRecurringTransaction: (data) => ipcRenderer.invoke('create-recurring-transaction', data),
  updateRecurringTransaction: (data) => ipcRenderer.invoke('update-recurring-transaction', data),
  deleteRecurringTransaction: (id) => ipcRenderer.invoke('delete-recurring-transaction', id),
  recurringPause: (id) => ipcRenderer.invoke('recurring-pause', id),
  recurringResume: (id) => ipcRenderer.invoke('recurring-resume', id),
  recurringBulkPause: (ids) => ipcRenderer.invoke('recurring-bulk-pause', ids),
  recurringBulkResume: (ids) => ipcRenderer.invoke('recurring-bulk-resume', ids),
  recurringRunNow: (id) => ipcRenderer.invoke('recurring-run-now', id),
  listRecurringReminders: (limit) => ipcRenderer.invoke('recurring-reminders', { limit }),

  // Items
  getItems: () => ipcRenderer.invoke('get-items'),
  createItem: (data) => ipcRenderer.invoke('create-item', data),
  updateItem: (data) => ipcRenderer.invoke('update-item', data),
  deleteItem: (id) => ipcRenderer.invoke('delete-item', id),

  // Inventory
  getWarehouses: () => ipcRenderer.invoke('get-warehouses'),
  createWarehouse: (warehouse) => ipcRenderer.invoke('create-warehouse', warehouse),
  updateWarehouse: (warehouse) => ipcRenderer.invoke('update-warehouse', warehouse),
  deleteWarehouse: (id) => ipcRenderer.invoke('delete-warehouse', id),
  getItemStock: (itemId) => ipcRenderer.invoke('get-item-stock', itemId),
  setReorderPoint: (itemId, warehouseId, reorderPoint) => ipcRenderer.invoke('set-reorder-point', itemId, warehouseId, reorderPoint),
  getReorderList: () => ipcRenderer.invoke('get-reorder-list'),
  listExpiringLots: (days) => ipcRenderer.invoke('list-expiring-lots', days),
  adjustInventory: (itemId, warehouseId, quantity, reason) => ipcRenderer.invoke('adjust-inventory', itemId, warehouseId, quantity, reason),
  transferStock: (itemId, fromWarehouseId, toWarehouseId, quantity, refType, refId) => ipcRenderer.invoke('transfer-stock', itemId, fromWarehouseId, toWarehouseId, quantity, refType, refId),
  addSerial: (itemId, serial, warehouseId) => ipcRenderer.invoke('add-serial', itemId, serial, warehouseId),
  assignSerialWarehouse: (serial, warehouseId) => ipcRenderer.invoke('assign-serial-warehouse', serial, warehouseId),
  updateSerialStatus: (serial, status) => ipcRenderer.invoke('update-serial-status', serial, status),
  listSerialsByItem: (itemId) => ipcRenderer.invoke('list-serials-by-item', itemId),
  // Lots
  lotAdd: (payload) => ipcRenderer.invoke('lot-add', payload),
  lotAdjust: (payload) => ipcRenderer.invoke('lot-adjust', payload),
  lotAssignWarehouse: (payload) => ipcRenderer.invoke('lot-assign-warehouse', payload),
  lotListByItem: (itemId) => ipcRenderer.invoke('lot-list-by-item', itemId),
  createBOM: (parentItemId, name) => ipcRenderer.invoke('create-bom', parentItemId, name),
  addBOMComponent: (bomId, componentItemId, quantity) => ipcRenderer.invoke('add-bom-component', bomId, componentItemId, quantity),
  removeBOMComponent: (componentId) => ipcRenderer.invoke('remove-bom-component', componentId),
  getBOM: (bomId) => ipcRenderer.invoke('get-bom', bomId),
  listAssemblies: (searchTerm) => ipcRenderer.invoke('list-assemblies', searchTerm),
  addBarcode: (itemId, code, symbology) => ipcRenderer.invoke('add-barcode', itemId, code, symbology),
  getBarcodesByItem: (itemId) => ipcRenderer.invoke('get-barcodes-by-item', itemId),
  findItemByBarcode: (code) => ipcRenderer.invoke('find-item-by-barcode', code),
  deleteBarcode: (id) => ipcRenderer.invoke('delete-barcode', id),

  // Projects / Job Costing / Timesheets
  getProjects: () => ipcRenderer.invoke('get-projects'),
  createProject: (project) => ipcRenderer.invoke('create-project', project),
  updateProject: (project) => ipcRenderer.invoke('update-project', project),
  deleteProject: (id) => ipcRenderer.invoke('delete-project', id),
  addProjectLink: (projectId, linkType, linkedId, direction, amount, costType) => ipcRenderer.invoke('add-project-link', projectId, linkType, linkedId, direction, amount, costType),
  listProjectLinks: (projectId) => ipcRenderer.invoke('list-project-links', projectId),
  getProjectProfitability: (projectId) => ipcRenderer.invoke('get-project-profitability', projectId),
  logTime: (entry) => ipcRenderer.invoke('log-time', entry),
  listTimesheetsByProject: (projectId) => ipcRenderer.invoke('list-timesheets-by-project', projectId),
  deleteTimesheet: (id) => ipcRenderer.invoke('delete-timesheet', id),
  // Project tasks (Gantt)
  projectTaskList: (projectId) => ipcRenderer.invoke('project-task-list', projectId),
  projectTaskCreate: (task) => ipcRenderer.invoke('project-task-create', task),
  projectTaskUpdate: (task) => ipcRenderer.invoke('project-task-update', task),
  projectTaskDelete: (id) => ipcRenderer.invoke('project-task-delete', id),
  projectInvoiceFromTimesheets: (payload) => ipcRenderer.invoke('project-invoice-from-timesheets', payload),

  // Bank Statements
  parseBankStatement: (csvText, meta) => ipcRenderer.invoke('parse-bank-statement', csvText, meta),
  listParsedStatements: () => ipcRenderer.invoke('list-parsed-statements'),
  getParsedStatement: (id) => ipcRenderer.invoke('get-parsed-statement', id),
  parsePlaintextStatement: (text, meta) => ipcRenderer.invoke('parse-plaintext-statement', text, meta),

  // Bank Feeds (live/offline)
  bankProviders: () => ipcRenderer.invoke('bank-providers'),
  bankConnect: (providerId, options) => ipcRenderer.invoke('bank-connect', { providerId, options }),
  bankDisconnect: () => ipcRenderer.invoke('bank-disconnect'),
  bankListAccounts: () => ipcRenderer.invoke('bank-list-accounts'),
  bankFetchTransactions: (filters) => ipcRenderer.invoke('bank-fetch-transactions', filters),
  bankRulesList: () => ipcRenderer.invoke('bank-rules-list'),
  bankRulesSave: (rule) => ipcRenderer.invoke('bank-rules-save', rule),
  bankRulesDelete: (id) => ipcRenderer.invoke('bank-rules-delete', id),
  bankRulesApply: (transactions) => ipcRenderer.invoke('bank-rules-apply', transactions),
  bankReconcileSuggest: (payload) => ipcRenderer.invoke('bank-reconcile-suggest', payload),
  bankApplySuggestions: (payload) => ipcRenderer.invoke('bank-apply-suggestions', payload),

  // Payments / Gateways
  payConfigGet: () => ipcRenderer.invoke('pay-config-get'),
  payConfigSet: (cfg) => ipcRenderer.invoke('pay-config-set', cfg),
  payLinkCreate: (payload) => ipcRenderer.invoke('pay-link-create', payload),
  payLinkComplete: (payload) => ipcRenderer.invoke('pay-link-complete', payload),

  // Analytics
  getDashboardKpis: () => ipcRenderer.invoke('get-dashboard-kpis'),
  getARAging: (referenceDate) => ipcRenderer.invoke('get-ar-aging', referenceDate),
  getAPAging: (referenceDate) => ipcRenderer.invoke('get-ap-aging', referenceDate),
  getRevenueTrend: () => ipcRenderer.invoke('get-revenue-trend'),
  dashboardInsights: () => ipcRenderer.invoke('dashboard-insights'),
  detectExpenseAnomalies: () => ipcRenderer.invoke('detect-expense-anomalies'),
  whatIfForecast: (payload) => ipcRenderer.invoke('whatif-forecast', payload || {}),
  aiTrainSeries: (payload) => ipcRenderer.invoke('ai-train-series', payload || {}),
  aiPredictSeries: (payload) => ipcRenderer.invoke('ai-predict-series', payload || {}),
  dashboardWidgetsGet: (payload) => ipcRenderer.invoke('dashboard-widgets-get', payload || {}),
  dashboardWidgetsSet: (payload) => ipcRenderer.invoke('dashboard-widgets-set', payload || {}),
  forecastCashflow: () => ipcRenderer.invoke('forecast-cashflow'),

  // Report builder
  reportBuilderMetadata: () => ipcRenderer.invoke('report-builder-metadata'),
  reportBuilderRun: (payload) => ipcRenderer.invoke('report-builder-run', payload),
  reportTemplatesList: () => ipcRenderer.invoke('report-builder-templates-list'),
  reportTemplateGet: (id) => ipcRenderer.invoke('report-builder-template-get', id),
  reportTemplateSave: (payload) => ipcRenderer.invoke('report-builder-template-save', payload),
  reportTemplateDelete: (id) => ipcRenderer.invoke('report-builder-template-delete', id),
  forecastCashflow: () => ipcRenderer.invoke('forecast-cashflow'),

  // Auth context
  setAuthContext: (context) => ipcRenderer.invoke('auth-set-context', context),
  clearAuthContext: () => ipcRenderer.invoke('auth-clear-context'),
  loginLocal: (email, password) => ipcRenderer.invoke('auth-login-local', { email, password }),
  logout: () => ipcRenderer.invoke('auth-logout'),
  getMe: () => ipcRenderer.invoke('auth-get-me'),
  mfaSetup: (userId) => ipcRenderer.invoke('auth-mfa-setup', { userId }),
  mfaDisable: (userId) => ipcRenderer.invoke('auth-mfa-disable', { userId }),
  mfaVerify: (userId, token) => ipcRenderer.invoke('auth-mfa-verify', { userId, token }),

  // Backups / Export
  backupDb: (destinationPath) => ipcRenderer.invoke('backup-db', destinationPath),
  restoreDb: (sourcePath) => ipcRenderer.invoke('restore-db', sourcePath),
  backupList: () => ipcRenderer.invoke('backup-list'),
  backupSettingsGet: () => ipcRenderer.invoke('backup-settings-get'),
  backupSettingsSet: (cfg) => ipcRenderer.invoke('backup-settings-set', cfg),
  dbDownload: (options) => ipcRenderer.invoke('db-download', options),
  dbGetFileBase64: () => ipcRenderer.invoke('db-get-file-base64'),
  dbImportFile: (sourcePath) => ipcRenderer.invoke('db-import-file', sourcePath),
  dbInfo: () => ipcRenderer.invoke('db-info'),
  exportTableCsv: (tableName) => ipcRenderer.invoke('export-table-csv', tableName),
  exportDataJson: () => ipcRenderer.invoke('export-data-json'),
  importDataJson: (data) => ipcRenderer.invoke('import-data-json', data),

  // Depreciation
  deprGenerate: (payload) => ipcRenderer.invoke('depr-generate', payload),
  deprList: (assetId) => ipcRenderer.invoke('depr-list', assetId),
  deprClear: (assetId) => ipcRenderer.invoke('depr-clear', assetId),

  // Closing date
  getClosingDate: () => ipcRenderer.invoke('get-closing-date'),
  setClosingDate: (closingDate) => ipcRenderer.invoke('set-closing-date', closingDate),
  clearClosingDate: () => ipcRenderer.invoke('clear-closing-date'),

  // Settings (generic)
  settingsGet: (key) => ipcRenderer.invoke('settings-get', key),
  settingsSet: (key, value) => ipcRenderer.invoke('settings-set', key, value),

  // Imports (QuickBooks CSV)
  importCustomersCsv: (csvText, options) => ipcRenderer.invoke('import-customers-csv', csvText, options || {}),
  importProductsCsv: (csvText, options) => ipcRenderer.invoke('import-products-csv', csvText, options || {}),
  importInvoicesCsv: (csvText, options) => ipcRenderer.invoke('import-invoices-csv', csvText, options || {}),
  importPaymentsCsv: (csvText, options) => ipcRenderer.invoke('import-payments-csv', csvText, options || {}),
  importBillsCsv: (csvText, options) => ipcRenderer.invoke('import-bills-csv', csvText, options || {}),
  importCustomerBalancesCsv: (csvText, options) => ipcRenderer.invoke('import-customer-balances-csv', csvText, options || {}),
  importCompanyCsv: (csvText) => ipcRenderer.invoke('import-company-csv', csvText),
  importSuppliersCsv: (csvText, options) => ipcRenderer.invoke('import-suppliers-csv', csvText, options || {}),
  importVatCsv: (csvText, options) => ipcRenderer.invoke('import-vat-csv', csvText, options || {}),
  // Audit Trail
  auditList: (opts) => ipcRenderer.invoke('audit-list', opts),
  auditSearch: (filters) => ipcRenderer.invoke('audit-search', filters),
  auditStats: () => ipcRenderer.invoke('audit-stats'),
  auditVerifyChain: (limit) => ipcRenderer.invoke('audit-verify-chain', limit),

  // Multi-currency
  currencyList: () => ipcRenderer.invoke('currency-list'),
  currencyListActive: () => ipcRenderer.invoke('currency-list-active'),
  currencyGetBase: () => ipcRenderer.invoke('currency-get-base'),
  currencySetBase: (code) => ipcRenderer.invoke('currency-set-base', code),
  currencyAdd: (code, name, symbol, decimals) => ipcRenderer.invoke('currency-add', code, name, symbol, decimals),
  currencyToggle: (code, active) => ipcRenderer.invoke('currency-toggle', code, active),
  currencySetRate: (from, to, rate, date) => ipcRenderer.invoke('currency-set-rate', from, to, rate, date),
  currencyGetRate: (from, to, date) => ipcRenderer.invoke('currency-get-rate', from, to, date),
  currencyConvert: (amount, from, to, date) => ipcRenderer.invoke('currency-convert', amount, from, to, date),
  currencyRates: (from, limit) => ipcRenderer.invoke('currency-rates', from, limit),

  // Sync engine (offline/VPN-friendly)
  syncStatus: () => ipcRenderer.invoke('sync-status'),
  syncRun: () => ipcRenderer.invoke('sync-run'),
  syncGetDevice: () => ipcRenderer.invoke('sync-get-device'),
  syncSetConfig: (cfg) => ipcRenderer.invoke('sync-set-config', cfg),
  syncEnsureTriggers: (tables) => ipcRenderer.invoke('sync-ensure-triggers', tables),
  syncLockAcquire: (tableName, recordId, ownerUserId, ttlSec) => ipcRenderer.invoke('sync-lock-acquire', tableName, recordId, ownerUserId, ttlSec),
  syncLockRelease: (tableName, recordId) => ipcRenderer.invoke('sync-lock-release', tableName, recordId),
  syncLockHeartbeat: (tableName, recordId, ttlSec) => ipcRenderer.invoke('sync-lock-heartbeat', tableName, recordId, ttlSec),
  syncConflictsList: (status) => ipcRenderer.invoke('sync-conflicts-list', status),
  syncConflictResolve: (conflictId, resolution, resolvedBy) => ipcRenderer.invoke('sync-conflict-resolve', conflictId, resolution, resolvedBy),
  syncSetConflictStrategy: (strategy) => ipcRenderer.invoke('sync-set-conflict-strategy', strategy),

  // Scheduler (background tasks)
  schedulerListRegistered: () => ipcRenderer.invoke('scheduler-list-registered'),
  schedulerList: () => ipcRenderer.invoke('scheduler-list'),
  schedulerSet: (tasks) => ipcRenderer.invoke('scheduler-set', tasks),
  schedulerReload: () => ipcRenderer.invoke('scheduler-reload'),

  // Approvals (policies + actions)
  approvalPolicyList: () => ipcRenderer.invoke('approval-policy-list'),
  approvalPolicySave: (policy) => ipcRenderer.invoke('approval-policy-save', policy),
  approvalPolicyDelete: (id) => ipcRenderer.invoke('approval-policy-delete', id),
  approvalsList: (filter) => ipcRenderer.invoke('approvals-list', filter),
  approvalApprove: (payload) => ipcRenderer.invoke('approval-approve', payload),
  approvalReject: (payload) => ipcRenderer.invoke('approval-reject', payload),

  // Blockchain anchoring
  journalAnchor: (entryId) => ipcRenderer.invoke('journal-anchor', entryId),
  // AI Assistant
  assistantAsk: (question) => ipcRenderer.invoke('assistant-ask', question),

  // Credit Notes / Refunds
  creditNotesList: () => ipcRenderer.invoke('credit-notes-list'),
  creditNoteGet: (id) => ipcRenderer.invoke('credit-note-get', id),
  creditNotesByCustomer: (customerId) => ipcRenderer.invoke('credit-notes-by-customer', customerId),
  creditNoteCreate: (data, lines) => ipcRenderer.invoke('credit-note-create', data, lines),
  creditNoteUpdate: (id, data) => ipcRenderer.invoke('credit-note-update', id, data),
  creditNoteDelete: (id) => ipcRenderer.invoke('credit-note-delete', id),
  creditNoteApply: (creditNoteId, invoiceId) => ipcRenderer.invoke('credit-note-apply', creditNoteId, invoiceId),

  // Webhooks
  webhooksList: () => ipcRenderer.invoke('webhooks-list'),
  webhookGet: (id) => ipcRenderer.invoke('webhook-get', id),
  webhookCreate: (data) => ipcRenderer.invoke('webhook-create', data),
  webhookUpdate: (id, data) => ipcRenderer.invoke('webhook-update', id, data),
  webhookDelete: (id) => ipcRenderer.invoke('webhook-delete', id),
  webhookLogs: (webhookId, limit) => ipcRenderer.invoke('webhook-logs', webhookId, limit),
  webhookTest: (id) => ipcRenderer.invoke('webhook-test', id),

  // POS (Point of Sale)
  posGetOpenSession: () => ipcRenderer.invoke('pos-get-open-session'),
  posOpenSession: (openedBy, openingAmount) => ipcRenderer.invoke('pos-open-session', openedBy, openingAmount),
  posCloseSession: (sessionId, closingAmount) => ipcRenderer.invoke('pos-close-session', sessionId, closingAmount),
  posCreateSale: (sale, lines) => ipcRenderer.invoke('pos-create-sale', sale, lines),
  posListSales: (sessionId) => ipcRenderer.invoke('pos-list-sales', sessionId),
  posListSessions: (limit) => ipcRenderer.invoke('pos-list-sessions', limit),
  posGetSale: (saleId) => ipcRenderer.invoke('pos-get-sale', saleId),

  // CRM
  crmListLeads: (filters) => ipcRenderer.invoke('crm-list-leads', filters),
  crmGetLead: (id) => ipcRenderer.invoke('crm-get-lead', id),
  crmCreateLead: (lead) => ipcRenderer.invoke('crm-create-lead', lead),
  crmUpdateLead: (lead) => ipcRenderer.invoke('crm-update-lead', lead),
  crmUpdateLeadStage: (id, stage) => ipcRenderer.invoke('crm-update-lead-stage', id, stage),
  crmBulkUpdateStage: (ids, stage) => ipcRenderer.invoke('crm-bulk-update-stage', ids, stage),
  crmDeleteLead: (id) => ipcRenderer.invoke('crm-delete-lead', id),
  crmConvertLead: (id, extraData) => ipcRenderer.invoke('crm-convert-lead', id, extraData),
  crmListActivities: (params) => ipcRenderer.invoke('crm-list-activities', params),
  crmOverdueActivities: () => ipcRenderer.invoke('crm-overdue-activities'),
  crmUpcomingActivities: (days) => ipcRenderer.invoke('crm-upcoming-activities', days),
  crmCreateActivity: (activity) => ipcRenderer.invoke('crm-create-activity', activity),
  crmUpdateActivity: (activity) => ipcRenderer.invoke('crm-update-activity', activity),
  crmDeleteActivity: (id) => ipcRenderer.invoke('crm-delete-activity', id),
  crmGetLeadQuotes: (leadId) => ipcRenderer.invoke('crm-get-lead-quotes', leadId),
  crmLinkQuote: (leadId, quoteId) => ipcRenderer.invoke('crm-link-quote', leadId, quoteId),
  crmCreateQuoteForLead: (leadId, quoteData, quoteLines) => ipcRenderer.invoke('crm-create-quote-for-lead', leadId, quoteData, quoteLines),
  crmGetLeadWithRelated: (leadId) => ipcRenderer.invoke('crm-get-lead-with-related', leadId),
  crmPipelineStats: () => ipcRenderer.invoke('crm-pipeline-stats'),
  crmReports: () => ipcRenderer.invoke('crm-reports'),
});

// Navigation event from main to renderer (production routing)
try {
  const { ipcRenderer } = require('electron');
  ipcRenderer.on('navigate', (_event, path) => {
    try {
      if (typeof window !== 'undefined') {
        // Prefer hash navigation to support packaged file:// builds reliably
        if (path && path.startsWith('/')) {
          window.location.hash = '#' + path;
        } else {
          window.location.hash = '#' + (path || '/');
        }
      } else {
        window.addEventListener('DOMContentLoaded', () => {
          try {
            if (path && path.startsWith('/')) {
              window.location.hash = '#' + path;
            } else {
              window.location.hash = '#' + (path || '/');
            }
          } catch {}
        }, { once: true });
      }
    } catch {}
  });
} catch {}
