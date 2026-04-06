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
const Approvals = require('../models/approvals');

const registerIpcHandlers = () => {
  console.log('[ipcHandlers] registerIpcHandlers called');

  // Helper: skip duplicate handler registrations instead of throwing
  const registeredChannels = new Set();
  const safeHandle = (channel, handler) => {
    try {
      ipcMain.handle(channel, handler);
      registeredChannels.add(channel);
    } catch (e) {
      if (e.message && e.message.includes('second handler')) {
        // Already registered by another handler module – skip silently
      } else {
        console.error(`[ipcHandlers] Error registering '${channel}':`, e);
      }
    }
  };
  // Create the tax_filings table when handlers are registered
  try {
    Tax.createTable();
  } catch (err) {
    console.error('[ipcHandlers] Tax.createTable error:', err);
  }

  // Fallback lightweight entity handlers (in case accounting handlers haven't registered yet)
  try {
    const Entities = require('../models/entities');
    const Transactions = require('../models/transactions');
    const Classes = require('../models/classes');
    const Locations = require('../models/locations');
    const Departments = require('../models/departments');
    const ChartOfAccounts = require('../models/chartOfAccounts');
    const COAVersions = require('../models/coaVersions');
    try {
      safeHandle('entities-list', async () => {
        try {
          return Entities.listEntities();
        } catch (e) {
          return { error: e.message };
        }
      });
    } catch {}
    try {
      safeHandle('entities-create', async (_event, payload) => {
        try {
          return Entities.createEntity(payload || {});
        } catch (e) {
          return { error: e.message };
        }
      });
    } catch {}
    try {
      safeHandle('entity-assign-user', async (_event, { userId, entityId, role }) => {
        try {
          return Entities.assignUserToEntity({ userId, entityId, role });
        } catch (e) {
          return { error: e.message };
        }
      });
    } catch {}
    try {
      safeHandle('get-trial-balance-consolidated', async (_event, payload) => {
        try {
          const { entityIds, startDate, endDate, eliminateIntercompany } = payload || {};
          return Transactions.getTrialBalanceByEntities(
            Array.isArray(entityIds) ? entityIds : [],
            startDate,
            endDate,
            { eliminateIntercompany: eliminateIntercompany !== false }
          );
        } catch (e) {
          return { error: e.message };
        }
      });
    } catch {}
    try {
      safeHandle('get-trial-balance-advanced', async (_event, filters) => {
        try {
          return Transactions.getTrialBalanceAdvanced(filters || {});
        } catch (e) {
          return { error: e.message };
        }
      });
    } catch {}

    // Fallback dimension handlers
    try {
      safeHandle('classes-list', async () => {
        try { return Classes.list(); } catch (e) { return { error: e.message }; }
      });
    } catch {}
    try {
      safeHandle('classes-create', async (_e, payload) => {
        try { return Classes.create(payload || {}); } catch (e) { return { error: e.message }; }
      });
    } catch {}
    try {
      safeHandle('locations-list', async () => {
        try { return Locations.list(); } catch (e) { return { error: e.message }; }
      });
    } catch {}
    try {
      safeHandle('locations-create', async (_e, payload) => {
        try { return Locations.create(payload || {}); } catch (e) { return { error: e.message }; }
      });
    } catch {}
    try {
      safeHandle('departments-list', async () => {
        try { return Departments.list(); } catch (e) { return { error: e.message }; }
      });
    } catch {}
    try {
      safeHandle('departments-create', async (_e, payload) => {
        try { return Departments.create(payload || {}); } catch (e) { return { error: e.message }; }
      });
    } catch {}

    // Fallback COA import/export + versions
    try {
      safeHandle('coa-export-template', async () => {
        try {
          const header = 'number,name,type,status';
          const sample = '1000,Cash,Asset,Active';
          return { success: true, csv: `${header}\n${sample}\n` };
        } catch (e) {
          return { error: e.message };
        }
      });
    } catch {}
    try {
      safeHandle('coa-export-current', async () => {
        try {
          const rows = await ChartOfAccounts.getAllAccounts();
          const header = 'number,name,type,status';
          const body = (rows || []).map(r => {
            const num = r.accountNumber || r.number || '';
            const name = r.accountName || r.name || '';
            const type = r.type || '';
            const status = r.status || 'Active';
            return [num, name, type, status].map(v => String(v ?? '').replace(/"/g, '""')).join(',');
          }).join('\n');
          return { success: true, csv: `${header}\n${body}\n` };
        } catch (e) {
          return { error: e.message };
        }
      });
    } catch {}
    try {
      safeHandle('coa-import', async (_e, { csvText, note }) => {
        try {
          if (!csvText || typeof csvText !== 'string') throw new Error('csvText required');
          try { COAVersions.createFromCurrent(note || 'Pre-import snapshot'); } catch {}

          const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          if (lines.length <= 1) throw new Error('CSV has no data rows');
          const header = lines.shift();
          const cols = header.split(',').map(h => h.trim().toLowerCase());
          const idxNum = cols.indexOf('number');
          const idxName = cols.indexOf('name');
          const idxType = cols.indexOf('type');
          const idxStatus = cols.indexOf('status');
          let inserted = 0;
          for (const line of lines) {
            const parts = line.split(',').map(p => p.trim());
            const number = idxNum >= 0 ? parts[idxNum] : null;
            const name = idxName >= 0 ? parts[idxName] : null;
            const type = idxType >= 0 ? parts[idxType] : null;
            if (!name || !type) continue;
            try { await ChartOfAccounts.insertAccount(name, type, number || null, 'import'); inserted++; } catch {}
          }
          try { COAVersions.createFromCurrent(note || 'Post-import snapshot'); } catch {}
          return { success: true, inserted };
        } catch (e) {
          return { error: e.message };
        }
      });
    } catch {}
    try {
      safeHandle('coa-versions-list', async () => {
        try { return COAVersions.list(100); } catch (e) { return { error: e.message }; }
      });
    } catch {}
    try {
      safeHandle('coa-version-create', async (_e, note) => {
        try { return COAVersions.createFromCurrent(note || 'Manual snapshot'); } catch (e) { return { error: e.message }; }
      });
    } catch {}
    try {
      safeHandle('coa-version-restore', async (_e, id) => {
        try { return COAVersions.restore(id); } catch (e) { return { error: e.message }; }
      });
    } catch {}

    // Recurring reminders (smart notifications) - recent audit logs
    try {
      safeHandle('recurring-reminders', async (_e, { limit = 20 } = {}) => {
        try {
          const db = require('../models/dbmgr');
          const rows = db.prepare(`
            SELECT id, timestamp, action, entityType, entityId, details
            FROM audit_logs
            WHERE action='recurringReminder'
            ORDER BY timestamp DESC
            LIMIT ?
          `).all(limit);
          return rows;
        } catch (e) {
          return { error: e.message };
        }
      });
    } catch {}
  } catch {}
  
  // User handlers
  safeHandle('get-users', async () => {
    try {
      return await Users.getAllUsers();
    } catch (error) {
      console.error('Error fetching users:', error);
      return { error: error.message };
    }
  });

  // Handler to update user profile
  safeHandle('updateuser', async (event, userData) => {
    try {
      console.log('Updating user with data:', userData);
      const result = await Users.updateUser(userData);
      console.log('Update result:', result);
      return result;
    } catch (error) {
      console.error('Error updating user:', error);
      return { error: error.message };
    }
  });

  // Handler to insert an customer
  safeHandle('insert-customer', async (event, title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,
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
  safeHandle('get-suppliers', async () => {
    try {
      return await Suppliers.getAllSuppliers();
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      return { error: error.message };
    }
  });
  safeHandle('get-suppliers-paginated', async (event, page, pageSize, search) => {
    try {
      return await Suppliers.getPaginated(page, pageSize, search || '');
    } catch (error) {
      console.error('Error fetching suppliers (paginated):', error);
      return { error: error.message };
    }
  });

  // Handler to insert a supplier
safeHandle('insert-supplier', async (event, title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,
    fax,other,website,address1,address2,city,state,postal_code,country,supplier_terms,business_number,account_number,expense_category,opening_balance,as_of,entered_by,notes) => {
    try {
      return await Suppliers.insertSupplier(title,first_name,middle_name, last_name, suffix,email,display_name,company_name,phone_number,mobile_number,
        fax,other,website,address1,address2,city,state,postal_code,country,supplier_terms,business_number,account_number,expense_category,opening_balance,as_of,entered_by,notes);
    } catch (error) {
      console.error('Error inserting supplier:', error);
      return { error: error.message };
    }
  });

// Handler to get all Expenses
safeHandle('get-expenses', async () => {
  try {
    return await Expenses.getAllExpenses();
  } catch (error) {
    console.error('Error fetching expenses:', error);
    return { error: error.message };
  }
});
safeHandle('get-expenses-paginated', async (event, page, pageSize, search) => {
  try {
    return await Expenses.getPaginated(page, pageSize, search || '');
  } catch (error) {
    console.error('Error fetching expenses (paginated):', error);
    return { error: error.message };
  }
});

// Handler to insert an expense (auto-applies approval policy when configured)
safeHandle('insert-expense', async (event, payee,payment_account,payment_date, payment_method, ref_no,category,entered_by,approval_status,expenseLines) => {
  try {
    const totalAmount = Array.isArray(expenseLines) ? expenseLines.reduce((s, l) => s + (Number(l.amount) || 0), 0) : 0;
    const policy = Approvals.findMatchingPolicy('expense', totalAmount);
    const statusToUse = policy ? 'Pending' : (approval_status || 'Approved');
    const res = await Expenses.insertExpense(payee,payment_account,payment_date, payment_method, ref_no,category,entered_by,statusToUse,expenseLines);
    if (res && res.success && policy) {
      try {
        await Approvals.createApproval({
          policyId: policy.id,
          entityType: 'expense',
          entityId: res.expenseId,
          amount: totalAmount,
          requestedBy: entered_by,
          requiredLevels: policy.requiredLevels || 1
        });
      } catch {}
    }
    return res;
  } catch (error) {
    console.error('Error inserting expense:', error);
    return { error: error.message };
  }
});

// Mark an expense as paid (simple status update)
safeHandle('mark-expense-paid', async (event, id) => {
  try {
    const stmt = require('./../models').Expenses ? require('./../models').Expenses : require('../models').Expenses;
    // Use direct DB update for status to avoid changing lines
  const db = require('../models/dbmgr');
    const res = db.prepare('UPDATE expenses SET approval_status = ? WHERE id = ?').run('Paid', id);
    return { success: res.changes > 0 };
  } catch (error) {
    console.error('Error marking expense paid:', error);
    return { success: false, error: error.message };
  }
});

// Handler to get all Quotes
safeHandle('get-quotes', async () => {
  try {
    return await Quotes.getAllQuotes();
  } catch (error) {
    console.error('Error fetching quotes:', error);
    return { error: error.message };
  }
});

safeHandle('get-quotes-paginated', async (event, page, pageSize, search, status) => {
  try {
    return await Quotes.getPaginated(page, pageSize, search || '', status || '');
  } catch (error) {
    console.error('Error fetching quotes (paginated):', error);
    return { error: error.message };
  }
});

// Handler to get single Quote
safeHandle('get-singleQuote', async (event,quote_id) => {
  try {
    return await Quotes.getSingleQuote(quote_id);
  } catch (error) {
    console.log(quote_id);
    console.error('Error fetching quote:', error);
    return { error: error.message };
  }
});

// Handler to insert an quote
safeHandle('insert-quote', async (event, status,customer,customer_email, islater, billing_address,start_date,last_date,message,statement_message,number,entered_by,vat,quoteLines) => {
  try {
    return await Quotes.insertQuote(status,customer,customer_email, islater, billing_address,start_date,last_date,message,statement_message,number,entered_by,vat,quoteLines);
  } catch (error) {
    console.error('Error inserting quote:', error);
    return { error: error.message };
  }
});


// get-singleCustomer moved to customerHandlers.js

safeHandle('get-singleSupplier', async (event,supplier_id) => {
  try {
    return await Suppliers.getSingleSupplier(supplier_id);
  } catch (error) {    
    console.error('Error fetching supplier:', error);
    return { error: error.message };
  }
});



// Handler to get all Products
safeHandle('get-products', async () => {
  try {
    return await Products.getAllProducts();
  } catch (error) {
    console.error('Error fetching Products:', error);
    return { error: error.message };
  }
});

safeHandle('get-products-paginated', async (event, page, pageSize, search, typeFilter) => {
  try {
    return await Products.getPaginated(page, pageSize, search || '', typeFilter || '');
  } catch (error) {
    console.error('Error fetching products (paginated):', error);
    return { error: error.message };
  }
});

// Handler to insert an product
safeHandle('insert-product', async (event, type,name,sku, category, description,price,income_account,tax_inclusive,tax,isfromsupplier,entered_by) => {
  try {
    return await Products.insertProduct(type,name,sku, category, description,price,income_account,tax_inclusive,tax,isfromsupplier,entered_by);
  } catch (error) {
    console.error('Error inserting product:', error);
    return { error: error.message };
  }
});

// Handler to get all Vat
safeHandle('get-vat', async () => {
  try {
    return await Vat.getAllVat();
  } catch (error) {
    console.error('Error fetching Vat:', error);
    return { error: error.message };
  }
});

// Handler to get VAT report
safeHandle('get-vatreport', async (event, start_date, last_date) => {
  try {
    return await Vat.getVatReport(start_date, last_date);
  } catch (error) {
    console.error('Error fetching VAT report:', error);
    return { error: error.message };
  }
});

// Handler to insert an vat
safeHandle('insert-vat', async (event, vat_name,vat_percentage,entered_by) => {
  try {
    return await Vat.insertVat(vat_name,vat_percentage,entered_by);
  } catch (error) {
    console.error('Error inserting vat:', error);
    return { error: error.message };
  }
});

// Chart of Accounts handlers are provided by accountingHandlers.js
// Fixed assets handlers (get-fixed-assets, insert-fixed-asset, update-fixed-asset, delete-fixed-asset) are in accountingHandlers.js

// Asset events (revaluation / disposal)
try {
  const AssetEvents = require('../models/assetEvents');
  safeHandle('asset-events-list', async (_e, assetId) => {
    try { return AssetEvents.list(assetId); } catch (e) { return { error: e.message }; }
  });
  safeHandle('asset-event-add', async (_e, payload) => {
    try { return AssetEvents.add(payload || {}); } catch (e) { return { error: e.message }; }
  });
} catch {}


// Invoice handlers moved to invoiceHandlers.js

// Handler update Invoice
safeHandle('updatequote', async (event,quoteData) => {
  try {
    return await Quotes.updateQuote(quoteData);
  } catch (error) {    
    console.error('Error updating quote:', error);
    return { error: error.message };
  }
});

// Handler update vat
safeHandle('updatevat', async (event,vatData) => {
  try {
    return await Vat.updateVat(vatData);
  } catch (error) {    
    console.error('Error updating vat:', error);
    return { error: error.message };
  }
});

// Removed duplicate employee handlers - now handled in employeeHandlers.js

// Handler update expense
safeHandle('updateexpense', async (event,expenseData) => {
  try {
    return await Expenses.updateExpense(expenseData);
  } catch (error) {    
    console.error('Error updating expense:', error);
    return { error: error.message };
  }
});

// Handler update product
safeHandle('updateproduct', async (event,productData) => {
  try {
    return await Products.updateProduct(productData);
  } catch (error) {    
    console.error('Error updating product:', error);
    return { error: error.message };
  }
});

// Handler update customer
safeHandle('updatecustomer', async (event,customerData) => {
  try {
    return await Customers.updateCustomer(customerData);
  } catch (error) {    
    console.error('Error updating customer:', error);
    return { error: error.message };
  }
});

// Handler update supplier
safeHandle('updatesupplier', async (event,supplierData) => {
  try {
    return await Suppliers.updateSupplier(supplierData);
  } catch (error) {    
    console.error('Error updating supplier:', error);
    return { error: error.message };
  }
});

// Supplier toggle status (activate/deactivate)
safeHandle('supplier-toggle-status', async (event, id, status) => {
  try {
    return Suppliers.toggleStatus(id, status);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Delete supplier
safeHandle('delete-supplier', async (event, id) => {
  try {
    return Suppliers.deleteSupplier(id);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Deleting record
safeHandle('deletingrecord', async (event,id,table) => {
  try {
    table = (table || '').toLowerCase();
    switch (table) {
      case 'customers': {
        // Check for linked transactions before deleting
        const db = require('../models/dbmgr');
        const invCount = db.prepare('SELECT COUNT(*) AS cnt FROM invoices WHERE customer = ?').get(id)?.cnt || 0;
        const quoteCount = db.prepare('SELECT COUNT(*) AS cnt FROM quotes WHERE customer = ?').get(id)?.cnt || 0;
        const expCount = db.prepare("SELECT COUNT(*) AS cnt FROM expenses WHERE payee = ? AND category = 'customer'").get(id)?.cnt || 0;
        const totalLinked = invCount + quoteCount + expCount;
        if (totalLinked > 0) {
          const parts = [];
          if (invCount > 0) parts.push(`${invCount} invoice(s)`);
          if (quoteCount > 0) parts.push(`${quoteCount} quote(s)`);
          if (expCount > 0) parts.push(`${expCount} expense(s)`);
          return { success: false, error: `Cannot delete this customer because they have ${totalLinked} linked transaction(s): ${parts.join(', ')}. Please delete or reassign these transactions first.` };
        }
        return await Vat.deleteRecord(id, table);
      }
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



  // Banking handlers
  safeHandle('reconcile-transactions', async (event, data) => {
    try {
      return await Transactions.reconcileTransactions(data);
    } catch (error) {
      console.error('Error reconciling transactions:', error);
      return { error: error.message };
    }
  });

  safeHandle('create-bank-transfer', async (event, data) => {
    try {
      return await Transactions.createBankTransfer(data);
    } catch (error) {
      console.error('Error creating bank transfer:', error);
      return { error: error.message };
    }
  });

  safeHandle('create-deposit', async (event, data) => {
    try {
      return await Transactions.createDeposit(data);
    } catch (error) {
      console.error('Error creating deposit:', error);
      return { error: error.message };
    }
  });

  safeHandle('process-payroll', async (event, data) => {
    try {
      return await Transactions.processPayroll(data);
    } catch (error) {
      console.error('Error processing payroll:', error);
      return { error: error.message };
    }
  });

  // Tax Filing handlers
  safeHandle('get-tax-records', async () => {
    console.log('Getting tax records...');
    try {
      return await Tax.getTaxRecords();
    } catch (error) {
      console.error('Error in get-tax-records handler:', error);
      return { success: false, error: error.message };
    }
  });

  safeHandle('submit-tax-filing', async (_, filingData) => {
    console.log('Submitting tax filing:', filingData);
    try {
      return await Tax.submitTaxFiling(filingData);
    } catch (error) {
      console.error('Error in submit-tax-filing handler:', error);
      return { success: false, error: error.message };
    }
  });

  safeHandle('update-tax-filing', async (_, { id, updates }) => {
    console.log('Updating tax filing:', id, updates);
    try {
      return await Tax.updateTaxFiling(id, updates);
    } catch (error) {
      console.error('Error in update-tax-filing handler:', error);
      return { success: false, error: error.message };
    }
  });

  // Company handlers
  safeHandle('get-company', async () => {
    try {
      return await Company.getInfo();
    } catch (error) {
      console.error('Error fetching company info:', error);
      return { error: error.message };
    }
  });

  safeHandle('save-company', async (event, data) => {
    try {
      return await Company.saveInfo(data);
    } catch (error) {
      console.error('Error saving company info:', error);
      return { error: error.message };
    }
  });

  // Seed massive dummy data (invoices, customers, quotes, entities, etc.)
  safeHandle('seed-dummy-data', async (_event, countsOverride) => {
    try {
      const path = require('path');
      const seedPath = path.join(__dirname, '..', '..', 'scripts', 'seed-dummy-data.js');
      const { runSeed } = require(seedPath);
      const db = require('../models/dbmgr');
      const summary = runSeed(db, countsOverride || {});
      return { success: true, summary };
    } catch (error) {
      console.error('Error seeding dummy data:', error);
      return { success: false, error: error.message };
    }
  });
};

module.exports = registerIpcHandlers;
