const db = require('./dbmgr');

const TaxForms = {
  createTable() {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS tax_forms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        form_type TEXT NOT NULL,
        jurisdiction TEXT NOT NULL DEFAULT 'US-Federal',
        tax_year INTEGER NOT NULL,
        quarter INTEGER,
        employee_id INTEGER,
        form_data TEXT,
        status TEXT DEFAULT 'Draft',
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        submitted_at DATETIME,
        notes TEXT
      )
    `).run();
  },

  generate(params) {
    const { form_type, jurisdiction, tax_year, quarter, employee_id } = params;
    if (!form_type || !tax_year) throw new Error('form_type and tax_year required');

    let formData = {};

    switch (form_type) {
      case 'W-2': {
        if (!employee_id) throw new Error('employee_id required for W-2');
        const emp = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(employee_id);
        if (!emp) throw new Error('Employee not found');
        const payrollDetails = db.prepare(`
          SELECT SUM(gross_pay) as total_gross, SUM(tax_deductions) as total_tax,
                 SUM(other_deductions) as total_deductions, SUM(net_pay) as total_net
          FROM payroll_details pd
          JOIN payroll_runs pr ON pr.id = pd.payroll_run_id
          WHERE pd.employee_id = ? AND strftime('%Y', pr.pay_period_start) = ?
        `).get(employee_id, String(tax_year));

        formData = {
          employee: {
            name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
            ssn: emp.ssn || emp.tax_number || '',
            address: `${emp.address || ''} ${emp.city || ''} ${emp.state || ''} ${emp.zip || ''}`.trim(),
          },
          wages: Number(payrollDetails?.total_gross || 0).toFixed(2),
          federal_tax_withheld: Number(payrollDetails?.total_tax || 0).toFixed(2),
          social_security_wages: Number(payrollDetails?.total_gross || 0).toFixed(2),
          social_security_tax: Number((payrollDetails?.total_gross || 0) * 0.062).toFixed(2),
          medicare_wages: Number(payrollDetails?.total_gross || 0).toFixed(2),
          medicare_tax: Number((payrollDetails?.total_gross || 0) * 0.0145).toFixed(2),
          other_deductions: Number(payrollDetails?.total_deductions || 0).toFixed(2),
        };
        break;
      }
      case '1099-NEC': {
        formData = {
          payer: {},
          recipient: {},
          nonemployee_compensation: '0.00',
        };
        break;
      }
      case '941': {
        const qStart = quarter ? `${tax_year}-${String((quarter-1)*3+1).padStart(2,'0')}-01` : `${tax_year}-01-01`;
        const qEnd = quarter ? `${tax_year}-${String(quarter*3).padStart(2,'0')}-31` : `${tax_year}-12-31`;
        const totals = db.prepare(`
          SELECT SUM(gross_pay) as total_gross, SUM(tax_deductions) as total_tax,
                 COUNT(DISTINCT pd.employee_id) as employee_count
          FROM payroll_details pd
          JOIN payroll_runs pr ON pr.id = pd.payroll_run_id
          WHERE pr.pay_period_start >= ? AND pr.pay_period_end <= ?
        `).get(qStart, qEnd);

        formData = {
          quarter,
          tax_year,
          num_employees: totals?.employee_count || 0,
          total_wages: Number(totals?.total_gross || 0).toFixed(2),
          federal_tax_withheld: Number(totals?.total_tax || 0).toFixed(2),
          social_security_tax: Number((totals?.total_gross || 0) * 0.124).toFixed(2),
          medicare_tax: Number((totals?.total_gross || 0) * 0.029).toFixed(2),
          total_taxes: Number(
            (totals?.total_tax || 0) +
            (totals?.total_gross || 0) * 0.124 +
            (totals?.total_gross || 0) * 0.029
          ).toFixed(2),
        };
        break;
      }
      case '940': {
        const annualGross = db.prepare(`
          SELECT SUM(gross_pay) as total_gross
          FROM payroll_details pd
          JOIN payroll_runs pr ON pr.id = pd.payroll_run_id
          WHERE strftime('%Y', pr.pay_period_start) = ?
        `).get(String(tax_year));
        const futa_wages = Math.min(Number(annualGross?.total_gross || 0), 7000);
        formData = {
          tax_year,
          total_payments: Number(annualGross?.total_gross || 0).toFixed(2),
          futa_taxable_wages: futa_wages.toFixed(2),
          futa_tax: (futa_wages * 0.006).toFixed(2),
        };
        break;
      }
      // South Africa
      case 'IRP5': {
        if (!employee_id) throw new Error('employee_id required for IRP5');
        const empSA = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(employee_id);
        if (!empSA) throw new Error('Employee not found');
        const pSA = db.prepare(`
          SELECT SUM(gross_pay) as total_gross, SUM(tax_deductions) as total_tax,
                 SUM(other_deductions) as total_deductions
          FROM payroll_details pd
          JOIN payroll_runs pr ON pr.id = pd.payroll_run_id
          WHERE pd.employee_id = ? AND strftime('%Y', pr.pay_period_start) = ?
        `).get(employee_id, String(tax_year));

        formData = {
          employee_name: `${empSA.first_name || ''} ${empSA.last_name || ''}`.trim(),
          id_number: empSA.id_number || empSA.tax_number || '',
          tax_reference: empSA.tax_reference || '',
          gross_remuneration: Number(pSA?.total_gross || 0).toFixed(2),
          paye_deducted: Number(pSA?.total_tax || 0).toFixed(2),
          uif_contribution: Number((pSA?.total_gross || 0) * 0.01).toFixed(2),
          pension_contribution: Number(pSA?.total_deductions || 0).toFixed(2),
        };
        break;
      }
      case 'EMP201': {
        const month = quarter;
        const mStart = `${tax_year}-${String(month || 1).padStart(2,'0')}-01`;
        const mEnd = `${tax_year}-${String(month || 1).padStart(2,'0')}-31`;
        const mTotals = db.prepare(`
          SELECT SUM(gross_pay) as total_gross, SUM(tax_deductions) as total_paye,
                 COUNT(DISTINCT pd.employee_id) as emp_count
          FROM payroll_details pd
          JOIN payroll_runs pr ON pr.id = pd.payroll_run_id
          WHERE pr.pay_period_start >= ? AND pr.pay_period_end <= ?
        `).get(mStart, mEnd);

        formData = {
          period: `${tax_year}-${String(month || 1).padStart(2,'0')}`,
          num_employees: mTotals?.emp_count || 0,
          total_paye: Number(mTotals?.total_paye || 0).toFixed(2),
          total_uif: Number((mTotals?.total_gross || 0) * 0.02).toFixed(2),
          total_sdl: Number((mTotals?.total_gross || 0) * 0.01).toFixed(2),
        };
        break;
      }
      default:
        formData = { message: 'Unsupported form type' };
    }

    const stmt = db.prepare(`
      INSERT INTO tax_forms (form_type, jurisdiction, tax_year, quarter, employee_id, form_data, status)
      VALUES (?, ?, ?, ?, ?, ?, 'Draft')
    `);
    const res = stmt.run(form_type, jurisdiction || 'US-Federal', tax_year, quarter || null, employee_id || null, JSON.stringify(formData));
    return { success: true, id: res.lastInsertRowid, formData };
  },

  list({ tax_year, form_type, jurisdiction } = {}) {
    let sql = `SELECT * FROM tax_forms WHERE 1=1`;
    const params = [];
    if (tax_year) { sql += ` AND tax_year = ?`; params.push(tax_year); }
    if (form_type) { sql += ` AND form_type = ?`; params.push(form_type); }
    if (jurisdiction) { sql += ` AND jurisdiction = ?`; params.push(jurisdiction); }
    sql += ` ORDER BY generated_at DESC`;
    return db.prepare(sql).all(...params);
  },

  get(id) {
    return db.prepare(`SELECT * FROM tax_forms WHERE id = ?`).get(id);
  },

  updateStatus(id, status) {
    db.prepare(`UPDATE tax_forms SET status = ?, submitted_at = CASE WHEN ? = 'Submitted' THEN datetime('now') ELSE submitted_at END WHERE id = ?`)
      .run(status, status, id);
    return { success: true };
  },

  delete(id) {
    return db.prepare(`DELETE FROM tax_forms WHERE id = ?`).run(id);
  },

  generateHtml(id) {
    const form = this.get(id);
    if (!form) return null;
    const data = JSON.parse(form.form_data || '{}');
    let html = `<html><head><style>body{font-family:Arial,sans-serif;margin:40px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #333;padding:8px}h1{text-align:center}.header{background:#f0f0f0;font-weight:bold}</style></head><body>`;
    html += `<h1>Form ${form.form_type} — Tax Year ${form.tax_year}</h1>`;
    html += `<p>Jurisdiction: ${form.jurisdiction} | Status: ${form.status}</p>`;
    html += `<table>`;
    for (const [key, val] of Object.entries(data)) {
      if (typeof val === 'object' && val !== null) {
        html += `<tr><td class="header" colspan="2">${key.replace(/_/g,' ').toUpperCase()}</td></tr>`;
        for (const [k2, v2] of Object.entries(val)) {
          html += `<tr><td>${k2.replace(/_/g,' ')}</td><td>${v2}</td></tr>`;
        }
      } else {
        html += `<tr><td>${key.replace(/_/g,' ')}</td><td>${val}</td></tr>`;
      }
    }
    html += `</table></body></html>`;
    return html;
  }
};

TaxForms.createTable();

module.exports = TaxForms;
