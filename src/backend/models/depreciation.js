const db = require('./dbmgr');

const Depreciation = {
	createTable() {
		db.prepare(`
			CREATE TABLE IF NOT EXISTS depreciation_entries (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				assetId INTEGER NOT NULL,
				periodStart TEXT NOT NULL,
				periodEnd TEXT NOT NULL,
				amount REAL NOT NULL,
				accumulated REAL NOT NULL,
				method TEXT NOT NULL,          -- 'straight_line' | 'declining_balance' | 'custom'
				rate REAL,                     -- for declining balance
				createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (assetId) REFERENCES fixed_assets(id)
			)
		`).run();
	},

	clearForAsset(assetId) {
		return db.prepare(`DELETE FROM depreciation_entries WHERE assetId=?`).run(assetId);
	},

	listForAsset(assetId) {
		return db.prepare(`SELECT * FROM depreciation_entries WHERE assetId=? ORDER BY periodStart ASC`).all(assetId);
	},

	_generateStraightLine({ assetId, cost, salvage = 0, lifeYears = 5, startDate }) {
		const annual = (Number(cost) - Number(salvage)) / Number(lifeYears);
		let accumulated = 0;
		const rows = [];
		let start = new Date(startDate || new Date().toISOString().slice(0,10));
		for (let y = 0; y < lifeYears; y++) {
			const end = new Date(start);
			end.setFullYear(end.getFullYear() + 1);
			accumulated += annual;
			rows.push({
				assetId,
				periodStart: start.toISOString().slice(0,10),
				periodEnd: end.toISOString().slice(0,10),
				amount: Number(annual.toFixed(2)),
				accumulated: Number(accumulated.toFixed(2)),
				method: 'straight_line',
				rate: null
			});
			start = end;
		}
		return rows;
	},

	_generateDeclining({ assetId, cost, rate = 0.2, lifeYears = 5, startDate }) {
		let book = Number(cost);
		let accumulated = 0;
		const rows = [];
		let start = new Date(startDate || new Date().toISOString().slice(0,10));
		for (let y = 0; y < lifeYears; y++) {
			const end = new Date(start);
			end.setFullYear(end.getFullYear() + 1);
			const amount = Number((book * rate).toFixed(2));
			book = Math.max(0, book - amount);
			accumulated += amount;
			rows.push({
				assetId,
				periodStart: start.toISOString().slice(0,10),
				periodEnd: end.toISOString().slice(0,10),
				amount,
				accumulated: Number(accumulated.toFixed(2)),
				method: 'declining_balance',
				rate
			});
			start = end;
		}
		return rows;
	},

	_generateCustom({ assetId, cost, salvage = 0, lifeYears = 5, startDate, formula_js }) {
		let book = Number(cost);
		let accumulated = 0;
		const rows = [];
		let start = new Date(startDate || new Date().toISOString().slice(0,10));
		let fn;
		try { fn = (0, eval)(`(${formula_js})`); } catch { fn = null; }
		for (let y = 0; y < lifeYears; y++) {
			const end = new Date(start); end.setFullYear(end.getFullYear() + 1);
			let amount = 0;
			try {
				amount = Number(fn ? fn({ yearIndex: y, bookValue: book, cost: Number(cost), salvage: Number(salvage), lifeYears: Number(lifeYears) }) : 0) || 0;
			} catch { amount = 0; }
			amount = Math.max(0, Math.min(book, amount));
			book = Math.max(0, book - amount);
			accumulated += amount;
			rows.push({
				assetId,
				periodStart: start.toISOString().slice(0,10),
				periodEnd: end.toISOString().slice(0,10),
				amount: Number(amount.toFixed(2)),
				accumulated: Number(accumulated.toFixed(2)),
				method: 'custom',
				rate: null
			});
			start = end;
		}
		return rows;
	},

	generateSchedule({ assetId, method = 'straight_line', cost, salvage, lifeYears, rate, startDate, formula_js }) {
		this.clearForAsset(assetId);
		const rows = method === 'declining_balance'
			? this._generateDeclining({ assetId, cost, rate: rate || 0.2, lifeYears: Number(lifeYears) || 5, startDate })
			: (method === 'custom'
				? this._generateCustom({ assetId, cost, salvage: salvage || 0, lifeYears: Number(lifeYears) || 5, startDate, formula_js })
				: this._generateStraightLine({ assetId, cost, salvage: salvage || 0, lifeYears: Number(lifeYears) || 5, startDate })
			);
		const stmt = db.prepare(`
			INSERT INTO depreciation_entries (assetId, periodStart, periodEnd, amount, accumulated, method, rate)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`);
		db.prepare('BEGIN').run();
		try {
			for (const r of rows) {
				stmt.run(r.assetId, r.periodStart, r.periodEnd, r.amount, r.accumulated, r.method, r.rate);
			}
			db.prepare('COMMIT').run();
		} catch (e) {
			db.prepare('ROLLBACK').run();
			throw e;
		}
		return this.listForAsset(assetId);
	}
};

Depreciation.createTable();

module.exports = Depreciation;


