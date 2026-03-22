const { ipcMain } = require('electron');
const Invoices = require('../models/invoices');
const Expenses = require('../models/expenses');
const db = require('../models/dbmgr');

function sum(arr, sel) { return arr.reduce((s, x) => s + (Number(sel(x)) || 0), 0); }

function safeQuery(sql, params) {
	try { return db.prepare(sql).all(...(params || [])); } catch { return []; }
}
function safeGet(sql, params) {
	try { return db.prepare(sql).get(...(params || [])); } catch { return null; }
}

function computeNetProfitLastQuarter() {
	const now = new Date();
	const q = Math.floor((now.getMonth()) / 3);
	const startQ = new Date(now.getFullYear(), (q - 1 + 4) % 4 * 3, 1);
	const endQ = new Date(startQ); endQ.setMonth(startQ.getMonth() + 3);
	const start = startQ.toISOString().slice(0,10);
	const end = endQ.toISOString().slice(0,10);
	const inv = Invoices.getAllInvoices().all || [];
	const revenue = sum(inv.filter(i => i.start_date >= start && i.start_date < end), r => r.amount * (1 + (r.vat||0)/100));
	const exp = Expenses.getAllExpenses().filter(e => e.payment_date >= start && e.payment_date < end).reduce((tot, e) => tot + Number(e.amount || 0), 0);
	return { start, end, revenue, expenses: exp, netProfit: Number((revenue - exp).toFixed(2)) };
}

// Intent matching: returns first match from patterns
function matchIntent(q, patterns) {
	for (const p of patterns) {
		if (typeof p === 'string' && q.includes(p)) return true;
		if (p instanceof RegExp && p.test(q)) return true;
	}
	return false;
}

// Extract monetary threshold from query like "above $1000" or "over 500"
function extractAmount(q) {
	const m = q.match(/(?:above|over|more than|greater than|exceeding)\s*\$?\s*(\d[\d,]*\.?\d*)/i);
	return m ? Number(m[1].replace(/,/g, '')) : null;
}

async function register() {
	ipcMain.handle('assistant-ask', async (_e, question) => {
		const q = String(question || '').toLowerCase().trim();

		// 1. Net profit last quarter
		if (matchIntent(q, ['net profit', 'profit last quarter'])) {
			return { answerType: 'kpi', data: computeNetProfitLastQuarter() };
		}

		// 2. Overdue invoices
		if (matchIntent(q, ['overdue invoice', 'over due invoice', 'unpaid invoice'])) {
			const threshold = extractAmount(q);
			const all = Invoices.getAllInvoices().all || [];
			const today = new Date().toISOString().slice(0,10);
			let overdue = all.filter(i => (i.status === 'Pending' || i.status === 'Overdue') && i.last_date < today);
			if (threshold) overdue = overdue.filter(i => Number(i.amount || 0) >= threshold);
			const total = sum(overdue, r => Number(r.amount || 0));
			return { answerType: 'list', data: overdue.slice(0, 20), summary: `${overdue.length} overdue invoices totalling ${total.toFixed(2)}` };
		}

		// 3. Total revenue / sales this year/month
		if (matchIntent(q, ['total revenue', 'total sales', 'revenue this year', 'sales this year', 'revenue this month', 'sales this month'])) {
			const isMonth = q.includes('month');
			const dateFilter = isMonth ? "date('now','start of month')" : "date('now','start of year')";
			const row = safeGet(`
				SELECT COALESCE(SUM(l.amount * l.quantity * (1 + IFNULL(i.vat,0)/100)),0) as total
				FROM invoices i INNER JOIN invoice_lines l ON l.invoice_id = i.id
				WHERE i.start_date >= ${dateFilter}
			`);
			const period = isMonth ? 'this month' : 'this year';
			return { answerType: 'kpi', data: { total: Number(row?.total || 0).toFixed(2), period }, summary: `Total revenue ${period}: ${Number(row?.total || 0).toFixed(2)}` };
		}

		// 4. Total expenses this year/month
		if (matchIntent(q, ['total expense', 'expenses this year', 'expenses this month', 'how much spent', 'spending'])) {
			const isMonth = q.includes('month');
			const dateFilter = isMonth ? "date('now','start of month')" : "date('now','start of year')";
			const row = safeGet(`
				SELECT COALESCE(SUM(el.amount),0) as total
				FROM expense_lines el INNER JOIN expenses e ON e.id=el.expense_id
				WHERE e.payment_date >= ${dateFilter}
			`);
			const period = isMonth ? 'this month' : 'this year';
			return { answerType: 'kpi', data: { total: Number(row?.total || 0).toFixed(2), period }, summary: `Total expenses ${period}: ${Number(row?.total || 0).toFixed(2)}` };
		}

		// 5. Best month / best performing month
		if (matchIntent(q, ['best month', 'highest revenue month', 'top month', 'best performing'])) {
			const rows = safeQuery(`
				SELECT strftime('%Y-%m', i.start_date) AS ym,
					SUM(l.amount * l.quantity * (1 + IFNULL(i.vat,0)/100)) as revenue
				FROM invoices i INNER JOIN invoice_lines l ON l.invoice_id = i.id
				GROUP BY ym ORDER BY revenue DESC LIMIT 5
			`);
			if (rows.length) {
				return { answerType: 'list', data: rows.map(r => ({ month: r.ym, revenue: Number(r.revenue).toFixed(2) })), summary: `Best month: ${rows[0].ym} with revenue ${Number(rows[0].revenue).toFixed(2)}` };
			}
			return { answerType: 'text', data: 'No invoice data available to determine the best month.' };
		}

		// 6. Top customers
		if (matchIntent(q, ['top customer', 'biggest customer', 'best customer', 'highest paying'])) {
			const rows = safeQuery(`
				SELECT i.customer as name, SUM(l.amount * l.quantity) as total
				FROM invoices i INNER JOIN invoice_lines l ON l.invoice_id = i.id
				GROUP BY i.customer ORDER BY total DESC LIMIT 10
			`);
			return { answerType: 'list', data: rows.map(r => ({ customer: r.name, total: Number(r.total).toFixed(2) })), summary: `Top ${rows.length} customers by invoice value` };
		}

		// 7. Cash balance / cash position
		if (matchIntent(q, ['cash balance', 'cash position', 'how much cash', 'bank balance'])) {
			const row = safeGet(`
				SELECT COALESCE(SUM(credit),0) as credits, COALESCE(SUM(debit),0) as debits
				FROM transactions WHERE (status IS NULL OR LOWER(status)='active')
			`);
			const net = (Number(row?.credits || 0) - Number(row?.debits || 0));
			return { answerType: 'kpi', data: { credits: Number(row?.credits||0).toFixed(2), debits: Number(row?.debits||0).toFixed(2), net: net.toFixed(2) }, summary: `Cash position: ${net.toFixed(2)} (Credits: ${Number(row?.credits||0).toFixed(2)}, Debits: ${Number(row?.debits||0).toFixed(2)})` };
		}

		// 8. Number of customers
		if (matchIntent(q, ['how many customer', 'customer count', 'number of customer', 'total customer'])) {
			const row = safeGet(`SELECT COUNT(*) as cnt FROM customers`);
			return { answerType: 'kpi', data: { count: row?.cnt || 0 }, summary: `You have ${row?.cnt || 0} customers.` };
		}

		// 9. Number of employees
		if (matchIntent(q, ['how many employee', 'employee count', 'number of employee', 'total employee', 'staff count'])) {
			const row = safeGet(`SELECT COUNT(*) as cnt FROM employees`);
			return { answerType: 'kpi', data: { count: row?.cnt || 0 }, summary: `You have ${row?.cnt || 0} employees.` };
		}

		// 10. Outstanding bills / vendor bills
		if (matchIntent(q, ['outstanding bill', 'unpaid bill', 'vendor bill', 'bills to pay', 'accounts payable'])) {
			const rows = safeQuery(`
				SELECT e.id, e.payee, e.payment_date, COALESCE(SUM(el.amount),0) as total
				FROM expenses e INNER JOIN expense_lines el ON el.expense_id=e.id
				WHERE LOWER(IFNULL(e.approval_status,''))!='paid'
				GROUP BY e.id ORDER BY e.payment_date ASC LIMIT 20
			`);
			const total = rows.reduce((s,r) => s + Number(r.total||0), 0);
			return { answerType: 'list', data: rows, summary: `${rows.length} outstanding bills totalling ${total.toFixed(2)}` };
		}

		// 11. Profit margin
		if (matchIntent(q, ['profit margin', 'margin'])) {
			const rev = safeGet(`SELECT COALESCE(SUM(l.amount * l.quantity * (1 + IFNULL(i.vat,0)/100)),0) as total FROM invoices i INNER JOIN invoice_lines l ON l.invoice_id = i.id WHERE i.start_date >= date('now','start of year')`);
			const exp = safeGet(`SELECT COALESCE(SUM(el.amount),0) as total FROM expense_lines el INNER JOIN expenses e ON e.id=el.expense_id WHERE e.payment_date >= date('now','start of year')`);
			const revenue = Number(rev?.total || 0);
			const expenses = Number(exp?.total || 0);
			const margin = revenue > 0 ? ((revenue - expenses) / revenue * 100) : 0;
			return { answerType: 'kpi', data: { revenue: revenue.toFixed(2), expenses: expenses.toFixed(2), profit: (revenue-expenses).toFixed(2), margin: margin.toFixed(1) + '%' }, summary: `Profit margin this year: ${margin.toFixed(1)}% (Revenue: ${revenue.toFixed(2)}, Expenses: ${expenses.toFixed(2)})` };
		}

		// 12. Cashflow forecast
		if (matchIntent(q, ['cashflow forecast', 'cash flow forecast', 'cash flow projection', 'project cash'])) {
			const rows = safeQuery(`
				SELECT strftime('%Y-%m', date) as ym, SUM(COALESCE(credit,0)-COALESCE(debit,0)) as net
				FROM transactions WHERE date >= date('now','-12 months') GROUP BY ym ORDER BY ym
			`);
			const nets = rows.map(r => Number(r.net||0));
			const avg = nets.length ? nets.slice(-6).reduce((a,b)=>a+b,0)/Math.min(6,nets.length) : 0;
			return { answerType: 'kpi', data: { monthlyAverage: avg.toFixed(2), projectedNext3Months: (avg*3).toFixed(2) }, summary: `Average monthly cashflow: ${avg.toFixed(2)}. Projected next 3 months: ${(avg*3).toFixed(2)}` };
		}

		// 13. Budget vs actual
		if (matchIntent(q, ['budget', 'budget vs actual', 'over budget', 'under budget'])) {
			const rows = safeQuery(`SELECT * FROM budgets ORDER BY period DESC LIMIT 20`);
			if (rows.length) {
				return { answerType: 'list', data: rows.map(r => ({ department: r.department, period: r.period, budget: r.amount, forecast: r.forecast })), summary: `${rows.length} budget records found.` };
			}
			return { answerType: 'text', data: 'No budget data available. Set up budgets in Company > Planning and Budgeting.' };
		}

		// 14. Inventory / stock levels
		if (matchIntent(q, ['stock level', 'inventory', 'low stock', 'reorder'])) {
			const rows = safeQuery(`
				SELECT p.name, COALESCE(i.quantity,0) as qty, COALESCE(i.reorder_point,0) as reorder
				FROM products p LEFT JOIN inventory i ON i.item_id=p.id
				ORDER BY qty ASC LIMIT 20
			`);
			const low = rows.filter(r => Number(r.qty) <= Number(r.reorder) && Number(r.reorder) > 0);
			return { answerType: 'list', data: rows, summary: `${rows.length} products tracked. ${low.length} items at or below reorder point.` };
		}

		// 15. Recent transactions
		if (matchIntent(q, ['recent transaction', 'latest transaction', 'last transaction'])) {
			const rows = safeQuery(`SELECT * FROM transactions ORDER BY date DESC, id DESC LIMIT 10`);
			return { answerType: 'list', data: rows, summary: `Showing last ${rows.length} transactions.` };
		}

		// 16. Sync / VPN status
		if (matchIntent(q, ['sync status', 'vpn status', 'sync engine'])) {
			try {
				const syncEngine = require('../services/syncEngine');
				const status = syncEngine.getStatus();
				return { answerType: 'kpi', data: status, summary: `Device: ${status.deviceId}, Pending changes: ${status.pendingChanges}, Active locks: ${status.locks}, Pending conflicts: ${status.pendingConflicts}` };
			} catch { return { answerType: 'text', data: 'Sync engine not available.' }; }
		}

		// 17. Help / what can you do
		if (matchIntent(q, ['help', 'what can you', 'what do you', 'capabilities', 'commands'])) {
			return { answerType: 'text', data: 'I can answer questions about:\n' +
				'- Net profit last quarter\n' +
				'- Overdue invoices (+ "above $X")\n' +
				'- Total revenue/sales this year/month\n' +
				'- Total expenses this year/month\n' +
				'- Best performing month\n' +
				'- Top customers\n' +
				'- Cash balance / cash position\n' +
				'- Customer count / employee count\n' +
				'- Outstanding bills / accounts payable\n' +
				'- Profit margin\n' +
				'- Cashflow forecast\n' +
				'- Budget vs actual\n' +
				'- Stock levels / inventory\n' +
				'- Recent transactions\n' +
				'- Sync / VPN status\n\nTry asking in natural language!'
			};
		}

		// Fallback
		return { answerType: 'text', data: 'I didn\'t understand that question. Try asking about: revenue, expenses, overdue invoices, profit margin, cash balance, top customers, best month, stock levels, budget, or type "help" to see all capabilities.' };
	});
}

module.exports = register;


