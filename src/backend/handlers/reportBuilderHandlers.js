const { ipcMain } = require('electron');
const db = require('../models/dbmgr');

// Very simple safe query builder: restricts to known tables/columns and basic filters
const ALLOWED = {
	invoices: ['id','customer','start_date','last_date','status','number','balance','vat'],
	expenses: ['id','payee','payment_date','payment_method','category','approval_status'],
	transactions: ['id','date','type','amount','description','status','accountId','debit','credit']
};

function sanitizeIdentifier(name) {
	return String(name || '').replace(/[^a-zA-Z0-9_]/g, '');
}

function buildQuery({ entity, fields = [], filters = {}, dateField, startDate, endDate, limit = 500 }) {
	const table = sanitizeIdentifier(entity);
	if (!ALLOWED[table]) throw new Error('Unsupported entity');
	const cols = (fields.length ? fields : ALLOWED[table]).map(c => sanitizeIdentifier(c)).filter(c => ALLOWED[table].includes(c));
	let sql = `SELECT ${cols.join(', ')} FROM ${table} WHERE 1=1`;
	const params = [];
	for (const [k, v] of Object.entries(filters || {})) {
		const col = sanitizeIdentifier(k);
		if (!ALLOWED[table].includes(col)) continue;
		sql += ` AND ${col} = ?`;
		params.push(v);
	}
	if (dateField && (startDate || endDate) && ALLOWED[table].includes(sanitizeIdentifier(dateField))) {
		if (startDate) { sql += ` AND ${sanitizeIdentifier(dateField)} >= ?`; params.push(startDate); }
		if (endDate) { sql += ` AND ${sanitizeIdentifier(dateField)} <= ?`; params.push(endDate); }
	}
	sql += ` LIMIT ${Math.max(1, Math.min(5000, Number(limit) || 500))}`;
	return { sql, params };
}

async function register() {
	ipcMain.handle('report-builder-run', async (_e, payload) => {
		const { sql, params } = buildQuery(payload || {});
		return db.prepare(sql).all(...params);
	});
	ipcMain.handle('report-builder-metadata', async () => {
		return ALLOWED;
	});

	// Templates CRUD
	try {
		const Templates = require('../models/reportTemplates');
		ipcMain.handle('report-builder-templates-list', async () => {
			try { return Templates.list(); } catch (e) { return { error: e.message }; }
		});
		ipcMain.handle('report-builder-template-get', async (_e, id) => {
			try { return Templates.get(id); } catch (e) { return { error: e.message }; }
		});
		ipcMain.handle('report-builder-template-save', async (_e, payload) => {
			try { return Templates.save(payload || {}); } catch (e) { return { error: e.message }; }
		});
		ipcMain.handle('report-builder-template-delete', async (_e, id) => {
			try { return Templates.delete(id); } catch (e) { return { error: e.message }; }
		});
	} catch {}
}

module.exports = register;


