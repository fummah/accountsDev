const db = require('./dbmgr');
const AuditLog = require('./auditLog');

const Approvals = {
	createTables() {
		db.prepare(`
			CREATE TABLE IF NOT EXISTS approval_policies (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				entityType TEXT NOT NULL,              -- e.g. 'expense','invoice','purchase'
				minAmount REAL DEFAULT 0,              -- threshold to require approval
				requiredLevels INTEGER DEFAULT 1,      -- number of approval levels
				rules TEXT,                            -- JSON: { rolesPerLevel: [ ['Manager'], ['Admin'] ] }
				createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
				updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		db.prepare(`
			CREATE TABLE IF NOT EXISTS approvals (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				policyId INTEGER,
				entityType TEXT NOT NULL,
				entityId TEXT NOT NULL,
				amount REAL DEFAULT 0,
				status TEXT DEFAULT 'PENDING',         -- PENDING | APPROVED | REJECTED
				level INTEGER DEFAULT 1,
				requiredLevels INTEGER DEFAULT 1,
				requestedBy TEXT,
				requestedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
				lastActionBy TEXT,
				lastActionAt DATETIME,
				lastComment TEXT,
				FOREIGN KEY (policyId) REFERENCES approval_policies(id)
			)
		`).run();
		// Backfill columns if upgrading
		try { db.prepare(`ALTER TABLE approvals ADD COLUMN lastComment TEXT`).run(); } catch {}
	},

	listPolicies() {
		return db.prepare(`SELECT * FROM approval_policies ORDER BY entityType, minAmount`).all();
	},

	savePolicy(policy) {
		const rulesJson = JSON.stringify(policy.rules || {});
		if (policy.id) {
			return db.prepare(`
				UPDATE approval_policies
				SET entityType=?, minAmount=?, requiredLevels=?, rules=?, updatedAt=datetime('now')
				WHERE id=?
			`).run(policy.entityType, Number(policy.minAmount) || 0, Number(policy.requiredLevels) || 1, rulesJson, policy.id);
		}
		return db.prepare(`
			INSERT INTO approval_policies (entityType, minAmount, requiredLevels, rules)
			VALUES (?, ?, ?, ?)
		`).run(policy.entityType, Number(policy.minAmount) || 0, Number(policy.requiredLevels) || 1, rulesJson);
	},

	deletePolicy(id) {
		return db.prepare(`DELETE FROM approval_policies WHERE id=?`).run(id);
	},

	findMatchingPolicy(entityType, amount) {
		const rows = db.prepare(`
			SELECT * FROM approval_policies
			WHERE entityType = ?
			ORDER BY minAmount DESC
		`).all(entityType);
		for (const r of rows) {
			const min = Number(r.minAmount) || 0;
			if ((Number(amount) || 0) >= min) {
				try { r.rules = JSON.parse(r.rules || '{}'); } catch { r.rules = {}; }
				return r;
			}
		}
		return null;
	},

	_getPolicyById(id) {
		const row = db.prepare(`SELECT * FROM approval_policies WHERE id=?`).get(id);
		if (!row) return null;
		try { row.rules = JSON.parse(row.rules || '{}'); } catch { row.rules = {}; }
		return row;
	},

	_canUserApprove(approvalRow, userRole) {
		if (!userRole) return true; // fallback allow
		const policy = approvalRow.policyId ? Approvals._getPolicyById(approvalRow.policyId) : null;
		if (!policy || !policy.rules || !Array.isArray(policy.rules.rolesPerLevel)) return true;
		const idx = Math.max(0, (approvalRow.level || 1) - 1);
		const allowedRoles = policy.rules.rolesPerLevel[idx];
		if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) return true;
		return allowedRoles.includes(userRole);
	},

	createApproval({ policyId, entityType, entityId, amount, requestedBy, requiredLevels }) {
		const stmt = db.prepare(`
			INSERT INTO approvals (policyId, entityType, entityId, amount, status, level, requiredLevels, requestedBy)
			VALUES (?, ?, ?, ?, 'PENDING', 1, ?, ?)
		`);
		const res = stmt.run(policyId || null, entityType, String(entityId), Number(amount) || 0, Number(requiredLevels) || 1, requestedBy || null);
		AuditLog.log({
			userId: requestedBy || 'system',
			action: 'approvalRequested',
			entityType,
			entityId,
			details: { policyId, amount, requiredLevels }
		});
		return res;
	},

	listApprovals(filter = {}) {
		let sql = `SELECT * FROM approvals WHERE 1=1`;
		const params = [];
		if (filter.entityType) { sql += ` AND entityType=?`; params.push(filter.entityType); }
		if (filter.status) { sql += ` AND status=?`; params.push(filter.status); }
		sql += ` ORDER BY requestedAt DESC`;
		return db.prepare(sql).all(...params);
	},

	approve({ id, approverId, approverRole, comment }) {
		const row = db.prepare(`SELECT * FROM approvals WHERE id=?`).get(id);
		if (!row) throw new Error('Approval not found');
		if (!Approvals._canUserApprove(row, approverRole)) {
			throw new Error('Not authorized for this approval level');
		}
		let status = row.status;
		let level = row.level;
		if (status === 'REJECTED' || status === 'APPROVED') return { success: true, status };
		level += 1;
		if (level > (row.requiredLevels || 1)) {
			status = 'APPROVED';
		} else {
			status = 'PENDING';
		}
		const res = db.prepare(`
			UPDATE approvals SET level=?, status=?, lastActionBy=?, lastActionAt=datetime('now'), lastComment=? WHERE id=?
		`).run(level, status, approverId || null, comment || null, id);
		AuditLog.log({
			userId: approverId || 'system',
			action: 'approvalAction',
			entityType: row.entityType,
			entityId: row.entityId,
			details: { approvalId: id, action: 'APPROVE', newStatus: status, level }
		});
		// Queue email notification in outbox
		try {
			const Notifications = require('./notifications');
			const subject = status === 'APPROVED' ? 'Approval completed' : 'Approval progressed';
			const body = `Entity ${row.entityType}#${row.entityId} is ${status} at level ${level}. Comment: ${comment || ''}`;
			Notifications.queueEmail({ to: null, subject, body });
		} catch {}
		return { success: res.changes > 0, status, level };
	},

	reject({ id, approverId, comment }) {
		const row = db.prepare(`SELECT * FROM approvals WHERE id=?`).get(id);
		if (!row) throw new Error('Approval not found');
		const res = db.prepare(`
			UPDATE approvals SET status='REJECTED', lastActionBy=?, lastActionAt=datetime('now'), lastComment=? WHERE id=?
		`).run(approverId || null, comment || null, id);
		AuditLog.log({
			userId: approverId || 'system',
			action: 'approvalAction',
			entityType: row.entityType,
			entityId: row.entityId,
			details: { approvalId: id, action: 'REJECT', comment }
		});
		try {
			const Notifications = require('./notifications');
			const subject = 'Approval rejected';
			const body = `Entity ${row.entityType}#${row.entityId} was rejected. Comment: ${comment || ''}`;
			Notifications.queueEmail({ to: null, subject, body });
		} catch {}
		return { success: res.changes > 0, status: 'REJECTED' };
	}
};

Approvals.createTables();

module.exports = Approvals;


