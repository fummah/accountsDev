const { ipcMain } = require('electron');
const { ParsedStatements } = require('../models');

function simpleCsvParse(csvText) {
  // Simple CSV parser: handles commas and quoted fields in a basic way
  const lines = (csvText || '').split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const parseLine = (line) => {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map(x => x.trim());
  };
  const headers = parseLine(lines[0]).map(h => h.toLowerCase());
  const rows = lines.slice(1).map(parseLine).filter(r => r.length > 0);
  return { headers, rows };
}

function normalizeRow(headers, row, map = {}) {
  const idxByName = (name) => name ? headers.indexOf(String(name).toLowerCase()) : -1;
  const idx = (candidates) => {
    for (const n of candidates) {
      const i = headers.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };

  // Prefer explicit mappings if provided
  let dateIdx = idxByName(map.date);
  let descIdx = idxByName(map.description);
  let amountIdx = idxByName(map.amount);
  let debitIdx = idxByName(map.debit);
  let creditIdx = idxByName(map.credit);

  if (dateIdx < 0) {
    dateIdx = idx(['date', 'transaction date', 'posting date']);
  }
  if (descIdx < 0) {
    descIdx = idx(['description', 'memo', 'details', 'narration']);
  }
  if (amountIdx < 0) {
    amountIdx = idx(['amount', 'amt', 'value', 'transaction amount']);
  }
  if (debitIdx < 0) {
    debitIdx = idx(['debit', 'withdrawal', 'debits']);
  }
  if (creditIdx < 0) {
    creditIdx = idx(['credit', 'deposit', 'credits']);
  }

  let amount = 0;
  if (amountIdx >= 0) {
    amount = parseFloat((row[amountIdx] || '0').replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')) || 0;
  } else {
    const debit = debitIdx >= 0 ? (parseFloat((row[debitIdx] || '0').replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')) || 0) : 0;
    const credit = creditIdx >= 0 ? (parseFloat((row[creditIdx] || '0').replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')) || 0) : 0;
    // Net: credit - debit
    amount = credit - debit;
  }
  const type = amount >= 0 ? 'credit' : 'debit';
  return {
    date: dateIdx >= 0 ? row[dateIdx] : null,
    description: descIdx >= 0 ? row[descIdx] : null,
    amount,
    type
  };
}

function registerBankStatementHandlers() {
  ipcMain.handle('parse-bank-statement', async (event, csvText, meta) => {
    try {
      const { headers, rows } = simpleCsvParse(csvText);
      const map = (meta && meta.map) ? Object.fromEntries(Object.entries(meta.map).map(([k,v]) => [k, String(v||'').toLowerCase()])) : {};
      const normRows = rows.map(r => normalizeRow(headers, r, map));
      const st = ParsedStatements.createStatement(meta || {});
      const res = ParsedStatements.insertTransactions(st.id, normRows);
      return { success: true, statementId: st.id, ...res };
    } catch (e) {
      console.error('Error parsing bank statement:', e);
      return { success: false, error: e.message };
    }
  });

  // Heuristic parser for plain text (e.g., pasted or pre-extracted PDF text)
  // Attempts to detect lines with a date and an amount, uses surrounding tokens as description.
  ipcMain.handle('parse-plaintext-statement', async (event, plainText, meta) => {
    try {
      const text = String(plainText || '');
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      // Common date patterns: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY
      const dp1 = /(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/;
      const dp2 = /(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/;
      const amountPattern = /([+-]?\d{1,3}(?:[\.,]\d{3})*(?:[\.,]\d{2})|[+-]?\d+(?:[\.,]\d{2})?)/;

      const parsed = [];
      for (const line of lines) {
        let dateStr = null;
        let m = line.match(dp1);
        if (m) {
          const y = m[1], mo = m[2], d = m[3];
          const mm = String(mo).padStart(2, '0');
          const dd = String(d).padStart(2, '0');
          dateStr = `${y}-${mm}-${dd}`;
        } else {
          m = line.match(dp2);
          if (m) {
            const d = m[1], mo = m[2], y = m[3];
            const mm = String(mo).padStart(2, '0');
            const dd = String(d).padStart(2, '0');
            dateStr = `${y}-${mm}-${dd}`;
          }
        }
        const amtMatch = line.match(amountPattern);
        if (!dateStr || !amtMatch) continue;
        const rawAmt = amtMatch[1] || '0';
        let amt = Number(rawAmt.replace(/\./g, '').replace(',', '.'));
        if (Number.isNaN(amt)) {
          amt = Number(rawAmt.replace(/,/g, ''));
          if (Number.isNaN(amt)) continue;
        }
        const type = amt >= 0 ? 'credit' : 'debit';
        const desc = line.replace(amtMatch[0], '').replace(/\s{2,}/g, ' ').trim();
        parsed.push({ date: dateStr, description: desc, amount: amt, type });
      }

      if (parsed.length === 0) {
        return { success: false, error: 'No transactions detected in text. Provide CSV/XLSX or clearer text.' };
      }
      const st = ParsedStatements.createStatement(meta || {});
      const res = ParsedStatements.insertTransactions(st.id, parsed);
      return { success: true, statementId: st.id, ...res, detected: parsed.length };
    } catch (e) {
      console.error('Error parsing plaintext bank statement:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('list-parsed-statements', async () => {
    try {
      return ParsedStatements.listStatements();
    } catch (e) {
      console.error('Error listing parsed statements:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('get-parsed-statement', async (event, id) => {
    try {
      return ParsedStatements.getStatementWithTransactions(id);
    } catch (e) {
      console.error('Error getting parsed statement:', e);
      return { error: e.message };
    }
  });
}

module.exports = registerBankStatementHandlers;


