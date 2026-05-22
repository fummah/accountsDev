const db = require('./dbmgr');

const HelpSystem = {
  createTable() {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS help_articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        keywords TEXT,
        context_key TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS training_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        module TEXT NOT NULL,
        step_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        target_selector TEXT,
        placement TEXT DEFAULT 'bottom',
        action_type TEXT,
        action_value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS user_training_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        module TEXT NOT NULL,
        completed_steps TEXT DEFAULT '[]',
        completed INTEGER DEFAULT 0,
        last_step INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Seed default help articles if empty
    try {
      const cnt = db.prepare(`SELECT COUNT(1) AS c FROM help_articles`).get().c;
      if (!cnt) {
        const ins = db.prepare(`INSERT INTO help_articles (title, category, content, keywords, context_key, sort_order) VALUES (?,?,?,?,?,?)`);
        const tx = db.transaction(() => {
          ins.run('Getting Started', 'General', 'Welcome to AccountsDev! This guide will help you set up your company and start managing your finances.\n\n**Step 1**: Go to Settings > Company to enter your business details.\n**Step 2**: Set up your Chart of Accounts under Accountant > Chart of Accounts.\n**Step 3**: Add your customers and vendors.\n**Step 4**: Create your first invoice under Customers > Invoices.\n\nFor detailed help on any feature, press F1 or click the help icon.', 'setup,getting started,onboarding', 'dashboard', 1);
          ins.run('Creating an Invoice', 'Sales', 'To create a new invoice:\n\n1. Navigate to Customers > Invoices > Create Invoice\n2. Select a customer from the dropdown\n3. Add line items with products/services\n4. Set payment terms and due date\n5. Click Save Invoice\n\n**Tips**:\n- The due date auto-calculates based on payment terms\n- You can add new customers and products inline\n- Use Save as Draft to return later', 'invoice,bill,create,sales', 'invoices', 2);
          ins.run('Recording Expenses', 'Expenses', 'To record a business expense:\n\n1. Go to Vendors > Enter Bill\n2. Select the vendor\n3. Choose an expense account/category\n4. Enter the amount and date\n5. Click Save\n\n**Payment Methods**: Bank Transfer, Cash, Check, Credit Card\n**Categories**: Use expense categories to classify spending for reports.', 'expense,bill,cost,spend,vendor', 'expenses', 3);
          ins.run('Bank Reconciliation', 'Banking', 'Bank reconciliation ensures your books match your bank statement:\n\n1. Go to Banking > Reconcile\n2. Enter the statement ending balance and date\n3. Check off transactions that appear on your statement\n4. Resolve any discrepancies\n5. Click Finish when balanced\n\n**Important**: Reconcile monthly for accurate financial reporting.', 'reconcile,bank,balance,statement', 'reconciliation', 4);
          ins.run('Running Payroll', 'Payroll', 'To process payroll:\n\n1. Go to Employees > Process Payroll\n2. Select the pay period dates\n3. Review employee hours and deductions\n4. Click Process Payroll\n5. Generate payslips and payment files\n\n**Tax Setup**: Configure tax brackets under Settings > Payroll Settings.\n**Direct Deposit**: Set up employee bank details for ACH/EFT file generation.', 'payroll,salary,wage,pay,employee', 'payroll', 5);
          ins.run('Chart of Accounts', 'Accounting', 'The Chart of Accounts (COA) is the foundation of your accounting system. It categorizes all financial transactions.\n\n**Account Types**:\n- **Asset**: Cash, Receivables, Equipment\n- **Liability**: Payables, Loans, Credit Cards\n- **Equity**: Owner Investment, Retained Earnings\n- **Income**: Sales Revenue, Service Income\n- **Expense**: Rent, Utilities, Salaries\n\nGo to Accountant > Chart of Accounts to manage your COA.', 'chart,accounts,COA,ledger,account type', 'chart-of-accounts', 6);
          ins.run('Financial Reports', 'Reports', 'Key financial reports:\n\n- **Profit & Loss**: Revenue minus expenses for a period\n- **Balance Sheet**: Assets, Liabilities, and Equity at a point in time\n- **Cash Flow**: Money in and out of the business\n- **Trial Balance**: All account balances to verify books are balanced\n\nAccess these under Reports menu or Accountant section.', 'report,P&L,profit,loss,balance sheet,cash flow', 'reports', 7);
          ins.run('Journal Entries', 'Accounting', 'Journal entries record transactions using double-entry bookkeeping:\n\n1. Go to Accountant > Journal Entries\n2. Enter the date and reference\n3. Add debit and credit lines (must balance)\n4. Save the entry\n\n**Every transaction must have equal debits and credits.** This is the fundamental rule of accounting.', 'journal,entry,debit,credit,double entry', 'journal-entries', 8);
          ins.run('Multi-Currency Transactions', 'Banking', 'To work with multiple currencies:\n\n1. Go to Settings > Multi-Currency to activate currencies\n2. Set exchange rates manually or import them\n3. When creating invoices or expenses, select the foreign currency\n4. The system calculates the home-currency equivalent\n\n**Exchange gains/losses** are calculated automatically on payment.', 'currency,exchange,rate,foreign,multi-currency', 'currencies', 9);
          ins.run('Data Backup', 'Settings', 'Protect your data with regular backups:\n\n1. Go to Settings > Backup & Export\n2. Click Backup Database\n3. Choose a save location\n\n**Best Practices**:\n- Back up daily or after major changes\n- Keep copies in a separate location\n- Test restoring backups periodically', 'backup,export,restore,data,save', 'backup', 10);
        });
        tx();
      }
    } catch (e) { console.error('HelpSystem seed error:', e); }

    // Seed training steps if empty
    try {
      const cnt2 = db.prepare(`SELECT COUNT(1) AS c FROM training_steps`).get().c;
      if (!cnt2) {
        const ins2 = db.prepare(`INSERT INTO training_steps (module, step_number, title, description, target_selector, placement) VALUES (?,?,?,?,?,?)`);
        const tx2 = db.transaction(() => {
          // Getting Started module
          ins2.run('getting-started', 1, 'Welcome!', 'Welcome to your accounting software. Let\'s walk through the basics to get you productive quickly.', 'body', 'center');
          ins2.run('getting-started', 2, 'Company Setup', 'First, set up your company details. Click Settings in the sidebar to configure your business information.', '.ant-menu', 'right');
          ins2.run('getting-started', 3, 'Chart of Accounts', 'Your Chart of Accounts organizes all financial activity. Navigate to Accountant > Chart of Accounts.', '.ant-menu', 'right');
          ins2.run('getting-started', 4, 'Add Customers', 'Add your customers so you can create invoices. Go to Customers > Customer List.', '.ant-menu', 'right');
          ins2.run('getting-started', 5, 'Create First Invoice', 'Create your first invoice! Go to Customers > Invoices > Create Invoice.', '.ant-menu', 'right');
          // Invoicing module
          ins2.run('invoicing', 1, 'Invoice Overview', 'The invoice form lets you bill customers for products and services.', '.ant-card', 'top');
          ins2.run('invoicing', 2, 'Select Customer', 'Start by selecting a customer. Their details will auto-fill.', '[data-testid="customer-select"]', 'bottom');
          ins2.run('invoicing', 3, 'Add Line Items', 'Add products or services. Each line has a description, quantity, and rate.', '.ant-table', 'top');
          ins2.run('invoicing', 4, 'Set Terms', 'Choose payment terms. The due date calculates automatically.', '[data-testid="terms-select"]', 'bottom');
          ins2.run('invoicing', 5, 'Save & Send', 'Click Save to create the invoice, or Save & Send to email it to the customer.', '.ant-btn-primary', 'top');
          // Expenses module
          ins2.run('expenses', 1, 'Expense Tracking', 'Track all business expenses to maintain accurate records and maximize deductions.', '.ant-card', 'top');
          ins2.run('expenses', 2, 'Enter Vendor', 'Select or add the vendor who billed you.', '.ant-select', 'bottom');
          ins2.run('expenses', 3, 'Categorize', 'Assign the expense to the correct category for proper financial reporting.', '.ant-select', 'bottom');
          ins2.run('expenses', 4, 'Save', 'Click Save to record the expense. It will appear in your reports.', '.ant-btn-primary', 'top');
          // Payroll module
          ins2.run('payroll', 1, 'Payroll Processing', 'Process payroll for all employees in one run.', '.ant-card', 'top');
          ins2.run('payroll', 2, 'Select Period', 'Choose the pay period start and end dates.', '.ant-picker', 'bottom');
          ins2.run('payroll', 3, 'Review Calculations', 'Review gross pay, deductions, and net pay for each employee.', '.ant-table', 'top');
          ins2.run('payroll', 4, 'Process', 'Click Process to finalize payroll and generate payslips.', '.ant-btn-primary', 'top');
        });
        tx2();
      }
    } catch (e) { console.error('TrainingSteps seed error:', e); }
  },

  // Help Articles
  searchArticles(query) {
    if (!query) return db.prepare(`SELECT id, title, category, keywords, context_key, sort_order FROM help_articles ORDER BY sort_order ASC`).all();
    const q = `%${query}%`;
    return db.prepare(`SELECT id, title, category, keywords, context_key, sort_order FROM help_articles WHERE title LIKE ? OR content LIKE ? OR keywords LIKE ? ORDER BY sort_order ASC`).all(q, q, q);
  },

  getArticle(id) {
    return db.prepare(`SELECT * FROM help_articles WHERE id = ?`).get(id);
  },

  getArticleByContext(contextKey) {
    return db.prepare(`SELECT * FROM help_articles WHERE context_key = ?`).get(contextKey);
  },

  saveArticle(article) {
    if (article.id) {
      db.prepare(`UPDATE help_articles SET title=?, category=?, content=?, keywords=?, context_key=?, sort_order=? WHERE id=?`)
        .run(article.title, article.category, article.content, article.keywords || '', article.context_key || '', article.sort_order || 0, article.id);
      return { success: true };
    }
    const res = db.prepare(`INSERT INTO help_articles (title, category, content, keywords, context_key, sort_order) VALUES (?,?,?,?,?,?)`)
      .run(article.title, article.category, article.content, article.keywords || '', article.context_key || '', article.sort_order || 0);
    return { success: true, id: res.lastInsertRowid };
  },

  // Training Steps
  getTrainingModule(module) {
    return db.prepare(`SELECT * FROM training_steps WHERE module = ? ORDER BY step_number ASC`).all(module);
  },

  listTrainingModules() {
    return db.prepare(`SELECT module, COUNT(*) as step_count, MIN(title) as first_step FROM training_steps GROUP BY module`).all();
  },

  // Progress Tracking
  getProgress(userId, module) {
    return db.prepare(`SELECT * FROM user_training_progress WHERE user_id = ? AND module = ?`).get(userId || 'default', module);
  },

  updateProgress(userId, module, stepNumber) {
    const existing = this.getProgress(userId, module);
    if (existing) {
      let completed = JSON.parse(existing.completed_steps || '[]');
      if (!completed.includes(stepNumber)) completed.push(stepNumber);
      const total = db.prepare(`SELECT COUNT(*) as c FROM training_steps WHERE module = ?`).get(module).c;
      const isCompleted = completed.length >= total ? 1 : 0;
      db.prepare(`UPDATE user_training_progress SET completed_steps = ?, last_step = ?, completed = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(JSON.stringify(completed), stepNumber, isCompleted, existing.id);
    } else {
      db.prepare(`INSERT INTO user_training_progress (user_id, module, completed_steps, last_step, completed) VALUES (?,?,?,?,0)`)
        .run(userId || 'default', module, JSON.stringify([stepNumber]), stepNumber);
    }
    return { success: true };
  },

  getAllProgress(userId) {
    return db.prepare(`SELECT * FROM user_training_progress WHERE user_id = ?`).all(userId || 'default');
  }
};

HelpSystem.createTable();

module.exports = HelpSystem;
