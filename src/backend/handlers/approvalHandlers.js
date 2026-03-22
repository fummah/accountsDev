const { ipcMain } = require('electron');
const Approvals = require('../models/approvals');
const Expenses = require('../models/expenses');

async function register() {
	// Policy CRUD
	ipcMain.handle('approval-policy-list', async () => {
		return Approvals.listPolicies();
	});
	ipcMain.handle('approval-policy-save', async (_e, policy) => {
		return Approvals.savePolicy(policy);
	});
	ipcMain.handle('approval-policy-delete', async (_e, id) => {
		return Approvals.deletePolicy(id);
	});

	// Approvals listing and actions
	ipcMain.handle('approvals-list', async (_e, filter) => {
		return Approvals.listApprovals(filter || {});
	});
	ipcMain.handle('approval-approve', async (event, payload) => {
		// Enforce role-based per-level routing
		try {
			const { authorize } = require('../security/authz');
			const ctx = authorize(event, { permissions: 'read:*' });
			return Approvals.approve({ ...payload, approverId: ctx.userId, approverRole: ctx.role });
		} catch (e) {
			return { error: e.message };
		}
	});
	ipcMain.handle('approval-reject', async (event, payload) => {
		try {
			const { authorize } = require('../security/authz');
			const ctx = authorize(event, { permissions: 'read:*' });
			return Approvals.reject({ ...payload, approverId: ctx.userId });
		} catch (e) {
			return { error: e.message };
		}
	});

	// Intercepted expense creation with auto-approval
	ipcMain.handle('expense-create-with-approval', async (_e, payee,payment_account,payment_date, payment_method, ref_no,category,entered_by,_approval_status,expenseLines) => {
		// compute total
		const totalAmount = Array.isArray(expenseLines) ? expenseLines.reduce((s, l) => s + (Number(l.amount) || 0), 0) : 0;
		const policy = Approvals.findMatchingPolicy('expense', totalAmount);
		const approval_status = policy ? 'Pending' : (_approval_status || 'Approved');
		const res = await Expenses.insertExpense(payee,payment_account,payment_date, payment_method, ref_no,category,entered_by,approval_status,expenseLines);
		if (res && res.success && policy) {
			try {
				await Approvals.createApproval({
					policyId: policy.id,
					entityType: 'expense',
					entityId: res.expenseId,
					amount: totalAmount,
					requestedBy: entered_by,
					requiredLevels: policy.requiredLevels || 1
				});
			} catch (e) {
				// do not fail the expense creation if approval insert fails
			}
		}
		return res;
	});
}

module.exports = register;


