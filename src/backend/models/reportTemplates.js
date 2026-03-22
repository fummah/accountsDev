const db = require('./dbmgr');

const ReportTemplates = {
	createTable() {
		db.prepare(`
			CREATE TABLE IF NOT EXISTS report_templates (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				entity TEXT NOT NULL,
				fields TEXT NOT NULL,      -- JSON array
				filters TEXT,               -- JSON object
				dateField TEXT,
				savedAt DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
	},

	list() {
		return db.prepare(`SELECT id, name, entity, dateField, savedAt FROM report_templates ORDER BY savedAt DESC, id DESC`).all();
	},

	get(id) {
		return db.prepare(`SELECT * FROM report_templates WHERE id=?`).get(id);
	},

	save({ id, name, entity, fields, filters, dateField }) {
		if (!name || !entity) throw new Error('name and entity are required');
		const fieldsJson = JSON.stringify(Array.isArray(fields) ? fields : []);
		const filtersJson = filters ? JSON.stringify(filters) : null;
		if (id) {
			const res = db.prepare(`UPDATE report_templates SET name=?, entity=?, fields=?, filters=?, dateField=?, savedAt=datetime('now') WHERE id=?`)
				.run(name, entity, fieldsJson, filtersJson, dateField || null, id);
			return { success: res.changes > 0, id };
		}
		const res = db.prepare(`INSERT INTO report_templates (name, entity, fields, filters, dateField, savedAt) VALUES (?, ?, ?, ?, ?, datetime('now'))`)
			.run(name, entity, fieldsJson, filtersJson, dateField || null);
		return { success: true, id: res.lastInsertRowid };
	},

	delete(id) {
		const res = db.prepare(`DELETE FROM report_templates WHERE id=?`).run(id);
		return { success: res.changes > 0 };
	}
};

ReportTemplates.createTable();

module.exports = ReportTemplates;
