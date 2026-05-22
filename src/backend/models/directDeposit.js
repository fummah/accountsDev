const db = require('./dbmgr');

const DirectDeposit = {
  createTable() {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS direct_deposit_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payroll_run_id INTEGER,
        file_format TEXT NOT NULL DEFAULT 'ACH',
        file_content TEXT,
        total_amount REAL DEFAULT 0,
        record_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'Generated',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        notes TEXT
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS employee_bank_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL UNIQUE,
        bank_name TEXT,
        routing_number TEXT,
        account_number TEXT,
        account_type TEXT DEFAULT 'checking',
        branch_code TEXT,
        swift_code TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id)
      )
    `).run();
  },

  saveEmployeeBank(data) {
    const { employee_id, bank_name, routing_number, account_number, account_type, branch_code, swift_code } = data;
    if (!employee_id) throw new Error('employee_id required');
    const existing = db.prepare(`SELECT id FROM employee_bank_accounts WHERE employee_id = ?`).get(employee_id);
    if (existing) {
      db.prepare(`UPDATE employee_bank_accounts SET bank_name=?, routing_number=?, account_number=?, account_type=?, branch_code=?, swift_code=? WHERE employee_id=?`)
        .run(bank_name || '', routing_number || '', account_number || '', account_type || 'checking', branch_code || '', swift_code || '', employee_id);
      return { success: true, id: existing.id };
    }
    const res = db.prepare(`INSERT INTO employee_bank_accounts (employee_id, bank_name, routing_number, account_number, account_type, branch_code, swift_code) VALUES (?,?,?,?,?,?,?)`)
      .run(employee_id, bank_name || '', routing_number || '', account_number || '', account_type || 'checking', branch_code || '', swift_code || '');
    return { success: true, id: res.lastInsertRowid };
  },

  getEmployeeBank(employeeId) {
    return db.prepare(`SELECT * FROM employee_bank_accounts WHERE employee_id = ?`).get(employeeId);
  },

  generateACH(payrollRunId, companyInfo = {}) {
    const details = db.prepare(`
      SELECT pd.*, e.first_name, e.last_name,
             ba.routing_number, ba.account_number, ba.account_type, ba.bank_name
      FROM payroll_details pd
      JOIN employees e ON e.id = pd.employee_id
      LEFT JOIN employee_bank_accounts ba ON ba.employee_id = pd.employee_id
      WHERE pd.payroll_run_id = ? AND pd.net_pay > 0
    `).all(payrollRunId);

    if (!details.length) throw new Error('No payroll details found for this run');
    const noBank = details.filter(d => !d.routing_number || !d.account_number);
    if (noBank.length) {
      throw new Error(`Missing bank info for: ${noBank.map(d => `${d.first_name} ${d.last_name}`).join(', ')}`);
    }

    const now = new Date();
    const fileDate = now.toISOString().slice(0,10).replace(/-/g,'');
    const compName = (companyInfo.name || 'COMPANY').substring(0, 23).padEnd(23);
    const compId = (companyInfo.tax_id || '000000000').substring(0, 10).padEnd(10);
    const originRouting = (companyInfo.routing || '000000000').substring(0, 9).padEnd(9);
    let totalAmount = 0;
    let recordCount = 0;

    const lines = [];
    // File Header
    lines.push(`101 ${originRouting}${compId}${fileDate.slice(2)}0000A094101${compName}FEDERAL RESERVE       `);
    // Batch Header
    lines.push(`5220${compName}                    ${compId}PPD PAYROLL ${fileDate}   1${originRouting}0000001`);

    for (const d of details) {
      recordCount++;
      const txCode = (d.account_type || 'checking').toLowerCase() === 'savings' ? '32' : '22';
      const routing = d.routing_number.padEnd(9);
      const acct = d.account_number.substring(0, 17).padEnd(17);
      const amt = Math.round(d.net_pay * 100).toString().padStart(10, '0');
      const name = `${d.first_name} ${d.last_name}`.substring(0, 22).padEnd(22);
      totalAmount += d.net_pay;
      lines.push(`6${txCode}${routing}${acct}${amt}${d.employee_id.toString().padEnd(15)}${name}  0${originRouting}${recordCount.toString().padStart(7,'0')}`);
    }

    const totalCents = Math.round(totalAmount * 100).toString().padStart(12, '0');
    // Batch Control
    lines.push(`8220${recordCount.toString().padStart(6,'0')}${'0'.repeat(10)}${totalCents}${compId}                         ${originRouting}0000001`);
    // File Control
    const blockCount = Math.ceil((lines.length + 1) / 10);
    lines.push(`9${blockCount.toString().padStart(6,'0')}${'1'.padStart(6,'0')}${recordCount.toString().padStart(8,'0')}${'0'.repeat(10)}${totalCents}${'0'.repeat(12)}${''.padEnd(39)}`);

    const fileContent = lines.join('\n');

    const res = db.prepare(`INSERT INTO direct_deposit_files (payroll_run_id, file_format, file_content, total_amount, record_count, status) VALUES (?,?,?,?,?,?)`)
      .run(payrollRunId, 'ACH', fileContent, totalAmount, recordCount, 'Generated');
    return { success: true, id: res.lastInsertRowid, fileContent, totalAmount, recordCount };
  },

  generateBACS(payrollRunId, companyInfo = {}) {
    const details = db.prepare(`
      SELECT pd.*, e.first_name, e.last_name,
             ba.routing_number AS sort_code, ba.account_number, ba.bank_name
      FROM payroll_details pd
      JOIN employees e ON e.id = pd.employee_id
      LEFT JOIN employee_bank_accounts ba ON ba.employee_id = pd.employee_id
      WHERE pd.payroll_run_id = ? AND pd.net_pay > 0
    `).all(payrollRunId);

    if (!details.length) throw new Error('No payroll details found');
    let totalAmount = 0;
    const lines = [];
    lines.push(`VOL1                               BACS PAYMENT FILE`);
    lines.push(`HDR1 PAYMENT    ${new Date().toISOString().slice(0,10)}`);
    for (const d of details) {
      const sortCode = (d.sort_code || '000000').replace(/-/g, '').padEnd(6);
      const acct = (d.account_number || '00000000').padEnd(8);
      const amt = d.net_pay.toFixed(2).padStart(11);
      const name = `${d.first_name} ${d.last_name}`.substring(0, 18).padEnd(18);
      totalAmount += d.net_pay;
      lines.push(`${sortCode}${acct}0 99 ${amt} ${name}SALARY`);
    }
    lines.push(`EOF ${details.length} ${totalAmount.toFixed(2)}`);
    const fileContent = lines.join('\n');
    const res = db.prepare(`INSERT INTO direct_deposit_files (payroll_run_id, file_format, file_content, total_amount, record_count, status) VALUES (?,?,?,?,?,?)`)
      .run(payrollRunId, 'BACS', fileContent, totalAmount, details.length, 'Generated');
    return { success: true, id: res.lastInsertRowid, fileContent, totalAmount, recordCount: details.length };
  },

  generateEFT(payrollRunId, companyInfo = {}) {
    const details = db.prepare(`
      SELECT pd.*, e.first_name, e.last_name,
             ba.routing_number AS branch_code, ba.account_number, ba.account_type, ba.bank_name
      FROM payroll_details pd
      JOIN employees e ON e.id = pd.employee_id
      LEFT JOIN employee_bank_accounts ba ON ba.employee_id = pd.employee_id
      WHERE pd.payroll_run_id = ? AND pd.net_pay > 0
    `).all(payrollRunId);

    if (!details.length) throw new Error('No payroll details found');
    let totalAmount = 0;
    const lines = [];
    const now = new Date();
    lines.push(`EFT,${now.toISOString().slice(0,10)},${companyInfo.name || 'COMPANY'},${companyInfo.account || ''}`);
    lines.push(`Branch Code,Account Number,Account Type,Amount,Name,Reference`);
    for (const d of details) {
      totalAmount += d.net_pay;
      lines.push(`${d.branch_code || ''},${d.account_number || ''},${d.account_type || 'checking'},${d.net_pay.toFixed(2)},${d.first_name} ${d.last_name},SALARY`);
    }
    lines.push(`TOTAL,${details.length},${totalAmount.toFixed(2)}`);
    const fileContent = lines.join('\n');
    const res = db.prepare(`INSERT INTO direct_deposit_files (payroll_run_id, file_format, file_content, total_amount, record_count, status) VALUES (?,?,?,?,?,?)`)
      .run(payrollRunId, 'EFT', fileContent, totalAmount, details.length, 'Generated');
    return { success: true, id: res.lastInsertRowid, fileContent, totalAmount, recordCount: details.length };
  },

  list(limit) {
    return db.prepare(`SELECT * FROM direct_deposit_files ORDER BY created_at DESC LIMIT ?`).all(limit || 100);
  },

  get(id) {
    return db.prepare(`SELECT * FROM direct_deposit_files WHERE id = ?`).get(id);
  },

  markSubmitted(id) {
    db.prepare(`UPDATE direct_deposit_files SET status = 'Submitted' WHERE id = ?`).run(id);
    return { success: true };
  }
};

DirectDeposit.createTable();

module.exports = DirectDeposit;
