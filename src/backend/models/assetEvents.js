const db = require('./dbmgr');

const AssetEvents = {
	createTable() {
		db.prepare(`
			CREATE TABLE IF NOT EXISTS asset_events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				assetId INTEGER NOT NULL,
				type TEXT NOT NULL, -- 'revaluation' | 'disposal'
				amount REAL,
				newValue REAL,
				date TEXT,
				notes TEXT,
				createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (assetId) REFERENCES fixed_assets(id)
			)
		`).run();
	},

	list(assetId) {
		return db.prepare(`SELECT * FROM asset_events WHERE assetId=? ORDER BY date ASC, id ASC`).all(assetId);
	},

	add({ assetId, type, amount, newValue, date, notes }) {
		if (!assetId || !type) throw new Error('assetId and type required');
		db.prepare('BEGIN').run();
		try {
			const res = db.prepare(`
				INSERT INTO asset_events (assetId, type, amount, newValue, date, notes)
				VALUES (?,?,?,?,?,?)
			`).run(assetId, String(type), amount==null?null:Number(amount), newValue==null?null:Number(newValue), date || new Date().toISOString().slice(0,10), notes || null);
			// apply effect to fixed_assets
			const fa = db.prepare(`SELECT currentValue, status FROM fixed_assets WHERE id=?`).get(assetId);
			if (fa) {
				if (String(type).toLowerCase()==='revaluation') {
					const nv = (newValue!=null) ? Number(newValue) : (Number(fa.currentValue)||0) + (Number(amount)||0);
					db.prepare(`UPDATE fixed_assets SET currentValue=? WHERE id=?`).run(nv, assetId);
				} else if (String(type).toLowerCase()==='disposal') {
					db.prepare(`UPDATE fixed_assets SET status='Disposed', currentValue=0 WHERE id=?`).run(assetId);
				}
			}
			db.prepare('COMMIT').run();
			return { success: true, id: res.lastInsertRowid };
		} catch (e) {
			db.prepare('ROLLBACK').run();
			return { success: false, error: e.message };
		}
	}
};

AssetEvents.createTable();

module.exports = AssetEvents;
