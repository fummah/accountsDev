const db = require('./dbmgr');

const Lots = {
	createTable() {
		db.prepare(`
			CREATE TABLE IF NOT EXISTS item_lots (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				itemId INTEGER NOT NULL,
				lot TEXT NOT NULL,
				expiryDate TEXT,              -- ISO date or NULL
				warehouseId INTEGER,
				quantity REAL DEFAULT 0,
				createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
				updatedAt DATETIME,
				UNIQUE(itemId, lot, warehouseId)
			)
		`).run();
	},

	addLot({ itemId, lot, expiryDate, warehouseId, quantity = 0 }) {
		const res = db.prepare(`
			INSERT INTO item_lots (itemId, lot, expiryDate, warehouseId, quantity, createdAt)
			VALUES (?, ?, ?, ?, ?, datetime('now'))
		`).run(itemId, lot, expiryDate || null, warehouseId || null, Number(quantity) || 0);
		return { success: res.changes > 0, id: res.lastInsertRowid };
	},

	adjustLot({ itemId, lot, warehouseId, delta }) {
		const res = db.prepare(`
			INSERT INTO item_lots (itemId, lot, warehouseId, quantity, createdAt)
			VALUES (?, ?, ?, ?, datetime('now'))
			ON CONFLICT(itemId, lot, warehouseId) DO UPDATE SET quantity = item_lots.quantity + excluded.quantity, updatedAt = datetime('now')
		`).run(itemId, lot, warehouseId || null, Number(delta) || 0);
		return { success: res.changes > 0 };
	},

	assignLotWarehouse({ itemId, lot, warehouseId }) {
		const res = db.prepare(`
			UPDATE item_lots SET warehouseId = ?, updatedAt = datetime('now')
			WHERE itemId = ? AND lot = ?
		`).run(warehouseId || null, itemId, lot);
		return { success: res.changes > 0 };
	},

	listLotsByItem(itemId) {
		return db.prepare(`
			SELECT * FROM item_lots WHERE itemId = ? ORDER BY COALESCE(expiryDate,'9999-12-31') ASC, lot ASC
		`).all(itemId);
	},

	getAvailableAtWarehouse(itemId, warehouseId) {
		const row = db.prepare(`
			SELECT COALESCE(SUM(quantity),0) as qty FROM item_lots WHERE itemId=? AND warehouseId IS ?
		`).get(itemId, warehouseId || null);
		return Number(row?.qty || 0);
	},

	listExpiringWithin(days = 30) {
		const d = Math.max(1, Number(days) || 30);
		return db.prepare(`
			SELECT id, itemId, lot, expiryDate, warehouseId, quantity
			FROM item_lots
			WHERE expiryDate IS NOT NULL
			  AND date(expiryDate) <= date('now', '+' || ? || ' days')
			ORDER BY expiryDate ASC
		`).all(d);
	}
};

Lots.createTable();

module.exports = Lots;


