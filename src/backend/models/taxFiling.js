const db = require('./dbmgr');
const TaxForms = require('./taxForms');

const TaxFiling = {
  createTable() {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS tax_filing_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        form_id INTEGER,
        filing_type TEXT NOT NULL,
        jurisdiction TEXT NOT NULL DEFAULT 'US-Federal',
        tax_year INTEGER NOT NULL,
        quarter INTEGER,
        file_format TEXT DEFAULT 'XML',
        file_content TEXT,
        status TEXT DEFAULT 'Generated',
        confirmation_number TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        submitted_at DATETIME,
        notes TEXT,
        FOREIGN KEY (form_id) REFERENCES tax_forms(id)
      )
    `).run();
  },

  generateFilingFile(params) {
    const { form_id, filing_type, file_format } = params;
    let fileContent = '';
    let jurisdiction = 'US-Federal';
    let tax_year = new Date().getFullYear();
    let quarter = null;

    if (form_id) {
      const form = TaxForms.get(form_id);
      if (!form) throw new Error('Tax form not found');
      const data = JSON.parse(form.form_data || '{}');
      jurisdiction = form.jurisdiction;
      tax_year = form.tax_year;
      quarter = form.quarter;

      if (file_format === 'CSV') {
        const lines = ['field,value'];
        const flattenObj = (obj, prefix = '') => {
          for (const [k, v] of Object.entries(obj)) {
            if (typeof v === 'object' && v !== null) {
              flattenObj(v, `${prefix}${k}.`);
            } else {
              lines.push(`"${prefix}${k}","${String(v || '').replace(/"/g, '""')}"`);
            }
          }
        };
        flattenObj(data);
        fileContent = lines.join('\n');
      } else {
        // XML format
        fileContent = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        fileContent += `<TaxFiling>\n`;
        fileContent += `  <FormType>${form.form_type}</FormType>\n`;
        fileContent += `  <TaxYear>${form.tax_year}</TaxYear>\n`;
        fileContent += `  <Jurisdiction>${form.jurisdiction}</Jurisdiction>\n`;
        fileContent += `  <Quarter>${form.quarter || ''}</Quarter>\n`;
        fileContent += `  <GeneratedAt>${new Date().toISOString()}</GeneratedAt>\n`;
        const toXml = (obj, indent = '  ') => {
          let xml = '';
          for (const [k, v] of Object.entries(obj)) {
            const tag = k.replace(/[^a-zA-Z0-9_]/g, '_');
            if (typeof v === 'object' && v !== null) {
              xml += `${indent}<${tag}>\n${toXml(v, indent + '  ')}${indent}</${tag}>\n`;
            } else {
              xml += `${indent}<${tag}>${String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</${tag}>\n`;
            }
          }
          return xml;
        };
        fileContent += `  <Data>\n${toXml(data, '    ')}  </Data>\n`;
        fileContent += `</TaxFiling>`;
      }
    }

    // EMP501 (South Africa annual reconciliation)
    if (filing_type === 'EMP501') {
      const empRows = db.prepare(`
        SELECT e.id, e.first_name, e.last_name, e.tax_number,
               SUM(pd.gross_pay) as total_gross, SUM(pd.tax_deductions) as total_paye,
               SUM(pd.other_deductions) as total_deductions
        FROM employees e
        LEFT JOIN payroll_details pd ON pd.employee_id = e.id
        LEFT JOIN payroll_runs pr ON pr.id = pd.payroll_run_id
        WHERE strftime('%Y', pr.pay_period_start) = ?
        GROUP BY e.id
      `).all(String(tax_year));

      if (file_format === 'CSV') {
        const lines = ['Employee Number,Tax Reference,Name,Gross Remuneration,PAYE,UIF,SDL'];
        for (const e of empRows) {
          const uif = (Number(e.total_gross || 0) * 0.01).toFixed(2);
          const sdl = (Number(e.total_gross || 0) * 0.01).toFixed(2);
          lines.push(`${e.id},"${e.tax_number || ''}","${e.first_name || ''} ${e.last_name || ''}",${Number(e.total_gross||0).toFixed(2)},${Number(e.total_paye||0).toFixed(2)},${uif},${sdl}`);
        }
        fileContent = lines.join('\n');
      } else {
        fileContent = `<?xml version="1.0" encoding="UTF-8"?>\n<EMP501>\n  <TaxYear>${tax_year}</TaxYear>\n`;
        for (const e of empRows) {
          fileContent += `  <Employee>\n    <Id>${e.id}</Id>\n    <Name>${e.first_name || ''} ${e.last_name || ''}</Name>\n`;
          fileContent += `    <TaxRef>${e.tax_number || ''}</TaxRef>\n    <Gross>${Number(e.total_gross||0).toFixed(2)}</Gross>\n`;
          fileContent += `    <PAYE>${Number(e.total_paye||0).toFixed(2)}</PAYE>\n  </Employee>\n`;
        }
        fileContent += `</EMP501>`;
      }
      jurisdiction = 'ZA-SARS';
    }

    // EFILE (IRS electronic filing format)
    if (filing_type === 'EFILE') {
      // Generate fixed-width text file format for IRS e-filing
      const allForms = TaxForms.list({ tax_year });
      const lines = [];
      lines.push(`EFILE|${tax_year}|${new Date().toISOString().slice(0,10)}|${allForms.length}`);
      for (const f of allForms) {
        const d = JSON.parse(f.form_data || '{}');
        lines.push(`FORM|${f.form_type}|${f.tax_year}|${f.quarter || ''}|${JSON.stringify(d)}`);
      }
      fileContent = lines.join('\n');
    }

    const stmt = db.prepare(`
      INSERT INTO tax_filing_submissions (form_id, filing_type, jurisdiction, tax_year, quarter, file_format, file_content, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Generated')
    `);
    const res = stmt.run(form_id || null, filing_type || 'Generic', jurisdiction, tax_year, quarter, file_format || 'XML', fileContent);
    return { success: true, id: res.lastInsertRowid, fileContent, fileFormat: file_format || 'XML' };
  },

  list({ tax_year, jurisdiction } = {}) {
    let sql = `SELECT id, form_id, filing_type, jurisdiction, tax_year, quarter, file_format, status, confirmation_number, created_at, submitted_at, notes FROM tax_filing_submissions WHERE 1=1`;
    const params = [];
    if (tax_year) { sql += ` AND tax_year = ?`; params.push(tax_year); }
    if (jurisdiction) { sql += ` AND jurisdiction = ?`; params.push(jurisdiction); }
    sql += ` ORDER BY created_at DESC`;
    return db.prepare(sql).all(...params);
  },

  get(id) {
    return db.prepare(`SELECT * FROM tax_filing_submissions WHERE id = ?`).get(id);
  },

  markSubmitted(id, confirmationNumber) {
    db.prepare(`UPDATE tax_filing_submissions SET status = 'Submitted', submitted_at = datetime('now'), confirmation_number = ? WHERE id = ?`)
      .run(confirmationNumber || '', id);
    return { success: true };
  },

  delete(id) {
    return db.prepare(`DELETE FROM tax_filing_submissions WHERE id = ?`).run(id);
  }
};

TaxFiling.createTable();

module.exports = TaxFiling;
