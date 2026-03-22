const { ipcMain } = require('electron');
const Invoices = require('../models/invoices');
const Transactions = require('../models/transactions');
const Expenses = require('../models/expenses');
const db = require('../models/dbmgr');
const Settings = require('../models/settings');
const { authorize } = require('../security/authz');
const AIForecast = require('../services/ai/forecast');

function registerAnalyticsHandlers() {
  // High-level dashboard KPIs
  ipcMain.handle('get-dashboard-kpis', async () => {
    try {
      // Use existing summarizers where possible
      const invoiceSummary = Invoices.getDashboardSummary ? Invoices.getDashboardSummary() : {};

      // Basic cash metrics from transactions
      const totals = db.prepare(`
        SELECT
          COALESCE(SUM(credit),0) AS credits,
          COALESCE(SUM(debit),0)  AS debits
        FROM transactions
        WHERE (status IS NULL OR LOWER(status) = 'active')
      `).get();

      const outstandingInvoices = db.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(balance),0) as amount
        FROM invoices WHERE LOWER(IFNULL(status,'')) != 'paid'
      `).get();

      return {
        success: true,
        kpis: {
          totalCredits: Number(totals.credits) || 0,
          totalDebits: Number(totals.debits) || 0,
          cashNet: (Number(totals.credits) || 0) - (Number(totals.debits) || 0),
          outstandingInvoicesCount: Number(outstandingInvoices.count) || 0,
          outstandingInvoicesAmount: Number(outstandingInvoices.amount) || 0
        },
        invoiceSummary
      };
    } catch (e) {
      console.error('Error computing dashboard KPIs:', e);
      return { success: false, error: e.message };
    }
  });

  // A/R Aging
  ipcMain.handle('get-ar-aging', async (event, referenceDate) => {
    try {
      authorize(event, { permissions: 'read:*' });
      return Invoices.getARAging(referenceDate);
    } catch (e) {
      console.error('Error computing AR aging:', e);
      return { success: false, error: e.message };
    }
  });

  // A/P Aging
  ipcMain.handle('get-ap-aging', async (event, referenceDate) => {
    try {
      authorize(event, { permissions: 'read:*' });
      return Expenses.getAPAging(referenceDate);
    } catch (e) {
      console.error('Error computing AP aging:', e);
      return { success: false, error: e.message };
    }
  });

  // Monthly revenue trend (paid + pending invoices) last 12 months
  ipcMain.handle('get-revenue-trend', async () => {
    try {
      const rows = db.prepare(`
        SELECT 
          strftime('%Y-%m', i.start_date) AS ym,
          SUM(l.amount * l.quantity * (1 + IFNULL(i.vat,0)/100)) as revenue
        FROM invoices i
        INNER JOIN invoice_lines l ON l.invoice_id = i.id
        WHERE i.start_date >= date('now', '-12 months') 
        GROUP BY ym 
        ORDER BY ym ASC`).all();
      return (rows || []).map(r => ({ ym: r.ym, revenue: Number(r.revenue)||0 }));
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // Simple cashflow forecast (naive moving average over last 6 months)
  ipcMain.handle('forecast-cashflow', async () => {
    try {
      const rows = db.prepare(`
        SELECT 
          strftime('%Y-%m', date) as ym,
          SUM(COALESCE(credit,0) - COALESCE(debit,0)) as net
        FROM transactions
        WHERE date >= date('now','-18 months')
        GROUP BY ym
        ORDER BY ym
      `).all();
      const nets = rows.map(r => ({ ym: r.ym, net: Number(r.net) || 0 }));
      const window = 6;
      const forecasts = [];
      // compute avg of last 6 months and project next 6 months
      const lastYm = nets.length ? nets[nets.length - 1].ym : new Date().toISOString().slice(0,7);
      const [yStr, mStr] = lastYm.split('-');
      let year = Number(yStr), month = Number(mStr);
      const hist = nets.map(n => n.net);
      const avg = hist.slice(-window).reduce((a,b)=>a+b,0) / Math.max(1, Math.min(window, hist.length));
      for (let i=1;i<=6;i++){
        month += 1;
        if (month > 12) { month = 1; year += 1; }
        const ym = `${year}-${String(month).padStart(2,'0')}`;
        forecasts.push({ ym, net: Number(avg.toFixed(2)) });
      }
      return { success: true, history: nets, forecast: forecasts };
    } catch (e) {
      console.error('Error computing forecast:', e);
      return { success: false, error: e.message };
    }
  });

  // AI-like dashboard insights (heuristics)
  ipcMain.handle('dashboard-insights', async () => {
    try {
      const insights = [];
      // Trend of cash net: compare last 3 months vs previous 3
      const rows = db.prepare(`
        SELECT strftime('%Y-%m', date) as ym, SUM(COALESCE(credit,0)-COALESCE(debit,0)) as net
        FROM transactions WHERE date >= date('now','-8 months') GROUP BY ym ORDER BY ym`).all();
      const nets = rows.map(r => Number(r.net)||0);
      if (nets.length >= 6) {
        const cur = nets.slice(-3).reduce((a,b)=>a+b,0);
        const prev = nets.slice(-6,-3).reduce((a,b)=>a+b,0);
        if (prev !== 0) {
          const change = ((cur - prev)/Math.abs(prev))*100;
          if (Math.abs(change) >= 5) {
            insights.push({ severity: change < 0 ? 'warning' : 'info', message: `Cash net ${change<0?'fell':'rose'} ${Math.abs(change).toFixed(1)}% vs previous quarter.` });
          }
        }
      }
      // A/R risk: 90+ bucket
      try {
        const aging = Invoices.getARAging(new Date().toISOString().slice(0,10));
        const over90 = aging?.summary ? Number(aging.summary['90+']||0) : 0;
        if (over90 > 0) insights.push({ severity: 'warning', message: `A/R >90 days is ${over90.toFixed(2)}; prioritize collections.` });
      } catch {}
      // Forecast risk: next month negative
      try {
        const cf = await (async () => {
          const rows = db.prepare(`
            SELECT strftime('%Y-%m', date) as ym, SUM(COALESCE(credit,0)-COALESCE(debit,0)) as net
            FROM transactions WHERE date >= date('now','-18 months') GROUP BY ym ORDER BY ym`).all();
          const nets = rows.map(r => Number(r.net)||0);
          const avg = nets.slice(-6).reduce((a,b)=>a+b,0)/Math.max(1,Math.min(6,nets.length));
          return avg;
        })();
        if (cf < 0) insights.push({ severity: 'warning', message: `Projected next-month cashflow ~ ${cf.toFixed(2)} (negative). Consider expense control.` });
      } catch {}
      return { insights };
    } catch (e) {
      return { insights: [], error: e.message };
    }
  });

  // Expense anomaly detection (z-score flagging by month and category)
  ipcMain.handle('detect-expense-anomalies', async () => {
    try {
      const rows = db.prepare(`
        SELECT strftime('%Y-%m', e.payment_date) as ym, el.category as cat, SUM(el.amount) as total
        FROM expense_lines el INNER JOIN expenses e ON e.id=el.expense_id
        WHERE e.payment_date >= date('now','-18 months')
        GROUP BY ym, cat ORDER BY ym ASC`).all();
      // Group by category
      const byCat = new Map();
      for (const r of rows) {
        const k = r.cat || 'Uncategorized';
        if (!byCat.has(k)) byCat.set(k, []);
        byCat.get(k).push({ ym: r.ym, total: Number(r.total)||0 });
      }
      const anomalies = [];
      for (const [cat, arr] of byCat.entries()) {
        const vals = arr.map(a=>a.total);
        const mean = vals.reduce((a,b)=>a+b,0)/Math.max(1,vals.length);
        const std = Math.sqrt(vals.reduce((a,b)=>a+Math.pow(b-mean,2),0)/Math.max(1,vals.length));
        arr.forEach(a => {
          const z = std ? (a.total - mean)/std : 0;
          if (Math.abs(z) >= 2.0) anomalies.push({ category: cat, ym: a.ym, amount: a.total, z: Number(z.toFixed(2)) });
        });
      }
      return { anomalies };
    } catch (e) { return { anomalies: [], error: e.message }; }
  });

  // Simple what-if forecast for next 6 months given growth and expense rates
  ipcMain.handle('whatif-forecast', async (_e, { revenueGrowthPct = 5, expenseGrowthPct = 2 } = {}) => {
    try {
      // Base on last 6 months averages
      const revRows = db.prepare(`
        SELECT strftime('%Y-%m', i.start_date) AS ym, SUM(l.amount * l.quantity * (1 + IFNULL(i.vat,0)/100)) as revenue
        FROM invoices i INNER JOIN invoice_lines l ON l.invoice_id = i.id
        WHERE i.start_date >= date('now','-12 months') GROUP BY ym ORDER BY ym ASC`).all();
      const expRows = db.prepare(`
        SELECT strftime('%Y-%m', e.payment_date) as ym, SUM(el.amount) as expense
        FROM expense_lines el INNER JOIN expenses e ON e.id=el.expense_id
        WHERE e.payment_date >= date('now','-12 months') GROUP BY ym ORDER BY ym ASC`).all();
      const revAvg = revRows.length ? revRows.slice(-6).reduce((s,r)=>s+Number(r.revenue||0),0)/Math.min(6, revRows.length) : 0;
      const expAvg = expRows.length ? expRows.slice(-6).reduce((s,r)=>s+Number(r.expense||0),0)/Math.min(6, expRows.length) : 0;
      const out = [];
      let r = revAvg, e = expAvg;
      const rGrow = 1 + (Number(revenueGrowthPct)||0)/100;
      const eGrow = 1 + (Number(expenseGrowthPct)||0)/100;
      const now = new Date();
      let year = now.getFullYear(); let month = now.getMonth()+1;
      for (let i=1;i<=6;i++) {
        month += 1; if (month>12) { month=1; year+=1; }
        r *= rGrow; e *= eGrow;
        const ym = `${year}-${String(month).padStart(2,'0')}`;
        out.push({ ym, revenue: Number(r.toFixed(2)), expense: Number(e.toFixed(2)), profit: Number((r-e).toFixed(2)) });
      }
      return { forecast: out };
    } catch (err) { return { error: err.message }; }
  });

  // Dashboard widgets per user (or defaults)
  ipcMain.handle('dashboard-widgets-get', async (_e, { userId, role } = {}) => {
    try {
      const userKey = userId ? `dashboard.widgets.${userId}` : null;
      const roleKey = role ? `dashboard.widgets.role.${role}` : null;
      const defKey = 'dashboard.widgets.default';
      const v = (userKey && Settings.get(userKey)) || (roleKey && Settings.get(roleKey)) || Settings.get(defKey) || { kpis:true, cashflow:true, revenue:true, aging:true, insights:true };
      return v;
    } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('dashboard-widgets-set', async (_e, { userId, role, widgets } = {}) => {
    try {
      const key = userId ? `dashboard.widgets.${userId}` : (role ? `dashboard.widgets.role.${role}` : 'dashboard.widgets.default');
      Settings.set(key, widgets || {});
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  });

  // Helper: monthly series builders
  function buildRevenueSeries(limitMonths = 24) {
    const rows = db.prepare(`
      SELECT strftime('%Y-%m', i.start_date) AS ym, SUM(l.amount * l.quantity * (1 + IFNULL(i.vat,0)/100)) as revenue
      FROM invoices i INNER JOIN invoice_lines l ON l.invoice_id = i.id
      WHERE i.start_date >= date('now', '-' || ? || ' months') GROUP BY ym ORDER BY ym ASC`).all(limitMonths);
    return rows.map(r => Number(r.revenue)||0);
  }
  function buildExpenseSeries(limitMonths = 24) {
    const rows = db.prepare(`
      SELECT strftime('%Y-%m', e.payment_date) as ym, SUM(el.amount) as expense
      FROM expense_lines el INNER JOIN expenses e ON e.id=el.expense_id
      WHERE e.payment_date >= date('now', '-' || ? || ' months') GROUP BY ym ORDER BY ym ASC`).all(limitMonths);
    return rows.map(r => Number(r.expense)||0);
  }
  function buildCashflowSeries(limitMonths = 24) {
    const rows = db.prepare(`
      SELECT strftime('%Y-%m', date) as ym, SUM(COALESCE(credit,0)-COALESCE(debit,0)) as net
      FROM transactions WHERE date >= date('now','-' || ? || ' months') GROUP BY ym ORDER BY ym`).all(limitMonths);
    return rows.map(r => Number(r.net)||0);
  }

  ipcMain.handle('ai-train-series', async (_e, { target='revenue', epochs=50, learningRate=0.01, windowSize=3 } = {}) => {
    try {
      let series = [];
      if (target === 'revenue') series = buildRevenueSeries(36);
      else if (target === 'expense') series = buildExpenseSeries(36);
      else if (target === 'cashflow') series = buildCashflowSeries(36);
      else return { success: false, error: 'Unknown target' };
      const res = await AIForecast.train(series, target, { epochs, learningRate, windowSize });
      return res;
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('ai-predict-series', async (_e, { target='revenue', months=6 } = {}) => {
    try {
      let history = [];
      if (target === 'revenue') history = buildRevenueSeries(36);
      else if (target === 'expense') history = buildExpenseSeries(36);
      else if (target === 'cashflow') history = buildCashflowSeries(36);
      else return { success: false, error: 'Unknown target' };
      return AIForecast.predict(history, target, Math.max(1, Number(months)||6));
    } catch (e) { return { success: false, error: e.message }; }
  });
}

module.exports = registerAnalyticsHandlers;


