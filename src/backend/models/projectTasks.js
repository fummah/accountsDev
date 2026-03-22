const db = require('./dbmgr');

const ProjectTasks = {
	createTable() {
		db.prepare(`
			CREATE TABLE IF NOT EXISTS project_tasks (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				projectId INTEGER NOT NULL,
				name TEXT NOT NULL,
				startDate TEXT,
				endDate TEXT,
				progress REAL DEFAULT 0,
				createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
	},

	list(projectId) {
		return db.prepare(`SELECT * FROM project_tasks WHERE projectId=? ORDER BY startDate ASC, id ASC`).all(projectId);
	},

	create(task) {
		const res = db.prepare(`
			INSERT INTO project_tasks (projectId, name, startDate, endDate, progress, createdAt)
			VALUES (?, ?, ?, ?, ?, datetime('now'))
		`).run(task.projectId, task.name, task.startDate || null, task.endDate || null, Number(task.progress) || 0);
		return { success: true, id: res.lastInsertRowid };
	},

	update(task) {
		const res = db.prepare(`
			UPDATE project_tasks SET name=?, startDate=?, endDate=?, progress=? WHERE id=?
		`).run(task.name, task.startDate || null, task.endDate || null, Number(task.progress) || 0, task.id);
		return { success: res.changes > 0 };
	},

	delete(id) {
		const res = db.prepare(`DELETE FROM project_tasks WHERE id=?`).run(id);
		return { success: res.changes > 0 };
	}
};

ProjectTasks.createTable();

module.exports = ProjectTasks;
