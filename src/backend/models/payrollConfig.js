const db = require('./dbmgr');
const Settings = require('./settings');

const PayrollConfig = {
	createTables() {
		// Custom payroll formulas (single active row)
		db.prepare(`
			CREATE TABLE IF NOT EXISTS payroll_formulas (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				formula_js TEXT NOT NULL,
				active INTEGER DEFAULT 1,
				createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`).run();

		// Progressive tax brackets
		db.prepare(`
			CREATE TABLE IF NOT EXISTS tax_brackets (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				country TEXT DEFAULT 'DEFAULT',
				effective_date DATE,
				min_amount REAL NOT NULL,
				max_amount REAL,
				rate REAL DEFAULT 0,
				fixed_amount REAL DEFAULT 0
			)
		`).run();

		// Global deductions (pension/insurance) and optional employee overrides
		db.prepare(`
			CREATE TABLE IF NOT EXISTS deductions_config (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				type TEXT DEFAULT 'percent', -- percent | fixed
				rate REAL DEFAULT 0,
				active INTEGER DEFAULT 1
			)
		`).run();
		db.prepare(`
			CREATE TABLE IF NOT EXISTS employee_deductions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				employee_id INTEGER NOT NULL,
				deduction_name TEXT NOT NULL,
				type TEXT DEFAULT 'percent',
				rate REAL DEFAULT 0,
				active INTEGER DEFAULT 1
			)
		`).run();

		// Defaults
		try {
			const cnt = db.prepare(`SELECT COUNT(1) AS c FROM deductions_config`).get().c;
			if (!cnt) {
				db.prepare(`INSERT INTO deductions_config (name, type, rate, active) VALUES ('Pension', 'percent', 5, 1), ('Insurance', 'percent', 2, 1)`).run();
			}
		} catch {}
	},

	getActiveFormula() {
		const row = db.prepare(`SELECT formula_js FROM payroll_formulas WHERE active=1 ORDER BY id DESC LIMIT 1`).get();
		if (row && row.formula_js) return row.formula_js;
		// Default formula: gross = regular*rate + overtime*rate*1.5; tax via tax tables; net = gross - tax - sum(deductions)
		return `({ regularHours=0, overtimeHours=0, rate=0, grossBase, employeeId, date, country, helpers }) => {
			const gross = (Number(regularHours)||0)* (Number(rate)||0) + (Number(overtimeHours)||0) * (Number(rate)||0) * 1.5 + (Number(grossBase)||0);
			const tax = helpers.computeTax(gross, country, date);
			const deductions = helpers.computeDeductions(employeeId, gross, date);
			const net = gross - tax - deductions.total;
			return { gross, tax, deductions: deductions.items, net };
		}`;
	},

	saveFormula({ name, formula_js, active = true }) {
		if (!formula_js) throw new Error('formula_js required');
		if (active) db.prepare(`UPDATE payroll_formulas SET active=0`).run();
		const res = db.prepare(`INSERT INTO payroll_formulas (name, formula_js, active) VALUES (?, ?, ?)`)
			.run(name || 'Custom', String(formula_js), active ? 1 : 0);
		return { success: true, id: res.lastInsertRowid };
	},

	importTaxCsv(csvText, { country = 'DEFAULT', effective_date } = {}) {
		if (!csvText) throw new Error('CSV text required');
		const lines = String(csvText).split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
		if (lines.length <= 1) throw new Error('No data rows');
		const header = lines.shift().toLowerCase();
		const cols = header.split(',').map(h=>h.trim());
		const iMin = cols.indexOf('min');
		const iMax = cols.indexOf('max');
		const iRate = cols.indexOf('rate');
		const iFixed = cols.indexOf('fixed');
		const date = effective_date || new Date().toISOString().slice(0,10);
		const tx = db.transaction(() => {
			for (const line of lines) {
				const p = line.split(',').map(x=>x.trim());
				const min = Number(p[iMin]||0);
				const max = p[iMax] ? Number(p[iMax]) : null;
				const rate = Number(p[iRate]||0);
				const fixed = Number(p[iFixed]||0);
				db.prepare(`INSERT INTO tax_brackets (country, effective_date, min_amount, max_amount, rate, fixed_amount) VALUES (?, ?, ?, ?, ?, ?)`)
					.run(country, date, min, max, rate, fixed);
			}
		});
		tx();
		return { success: true };
	},

	listTax({ country = 'DEFAULT' } = {}) {
		return db.prepare(`SELECT * FROM tax_brackets WHERE country=? ORDER BY effective_date DESC, min_amount ASC`).all(country);
	},

	computeTax(gross, country = 'DEFAULT', date) {
		const g = Number(gross) || 0;
		// pick latest brackets for country
		const row = db.prepare(`SELECT effective_date FROM tax_brackets WHERE country=? ORDER BY effective_date DESC LIMIT 1`).get(country);
		if (!row) return 0;
		const brackets = db.prepare(`SELECT min_amount, max_amount, rate, fixed_amount FROM tax_brackets WHERE country=? AND effective_date=? ORDER BY min_amount ASC`).all(country, row.effective_date);
		let tax = 0;
		let remaining = g;
		for (const b of brackets) {
			const lower = Number(b.min_amount)||0;
			const upper = (b.max_amount==null || b.max_amount==='' ) ? Infinity : Number(b.max_amount);
			const span = Math.max(0, Math.min(remaining, Math.max(0, Math.min(upper, g) - lower)));
			if (span > 0) {
				tax += (span * (Number(b.rate)||0)/100) + (Number(b.fixed_amount)||0);
			}
		}
		return Number(tax.toFixed(2));
	},

	computeDeductions(employeeId, gross, date) {
		const base = db.prepare(`SELECT name, type, rate FROM deductions_config WHERE active=1`).all();
		const overrides = db.prepare(`SELECT deduction_name AS name, type, rate FROM employee_deductions WHERE active=1 AND employee_id=?`).all(employeeId);
		const all = [...base, ...overrides];
		let total = 0;
		const items = all.map(d => {
			const val = (String(d.type||'percent').toLowerCase()==='fixed') ? (Number(d.rate)||0) : ((Number(d.rate)||0)/100) * (Number(gross)||0);
			total += val;
			return { name: d.name, amount: Number(val.toFixed(2)) };
		});
		return { total: Number(total.toFixed(2)), items };
	},

	getDeductionsConfig() {
		return db.prepare(`SELECT id, name, type, rate, active FROM deductions_config ORDER BY id ASC`).all();
	},

	saveDeductionsConfig(items = []) {
		const tx = db.transaction(() => {
			db.prepare(`DELETE FROM deductions_config`).run();
			for (const it of (Array.isArray(items)?items:[])) {
				db.prepare(`INSERT INTO deductions_config (name, type, rate, active) VALUES (?, ?, ?, ?)`)
					.run(String(it.name||''), String(it.type||'percent'), Number(it.rate)||0, it.active?1:0);
			}
		});
		tx();
		return { success: true };
	}
};

PayrollConfig.createTables();

module.exports = PayrollConfig;
