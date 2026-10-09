const { ipcMain } = require('electron');
const db = require('../models/dbmgr');
const { Customers } = require('../models');
const Payments = require('../models/payments');
const JournalEntries = require('../models/journalEntries');
const { recalcInvoiceFinancials } = require('../services/invoiceFinancials');
const { customerNameSql, getCustomerName } = require('../services/contactIdentity');

function registerCustomerHandlers() {
    // Statements
    ipcMain.handle('create-statement', async (event, statementData) => {
        try {
            const result = await db.run(
                `INSERT INTO statements (customerId, startDate, endDate, notes, createdAt) 
                 VALUES (?, ?, ?, ?, datetime('now'))`,
                [statementData.customerId, statementData.startDate, statementData.endDate, statementData.notes]
            );
            return result;
        } catch (error) {
            console.error('Error creating statement:', error);
            throw error;
        }
    });

    // Customers
    ipcMain.handle('get-customers', async () => {
        try {
            return await Customers.getAllCustomers();
        } catch (error) {
            console.error('Error fetching customers:', error);
            return { error: error.message };
        }
    });
    ipcMain.handle('get-customers-paginated', async (event, page, pageSize, search, status) => {
        try {
            return await Customers.getPaginated(page, pageSize, search || '', status || '');
        } catch (error) {
            console.error('Error fetching customers (paginated):', error);
            return { error: error.message };
        }
    });
    // Export source: every customer matching the current search + status filter,
    // with NO pagination cap. Accepts only the plain search/status DTO strings —
    // never raw SQL or arbitrary filter objects from the renderer.
    ipcMain.handle('get-customers-for-export', async (event, search, status) => {
        try {
            const s = typeof search === 'string' ? search : '';
            const st = typeof status === 'string' ? status : '';
            return await Customers.getExportRows(s, st);
        } catch (error) {
            console.error('Error fetching customers for export:', error);
            return { error: error.message };
        }
    });
    ipcMain.handle('get-customer-report', async () => {
        try {
            return await Customers.getCustomerReport();
        } catch (error) {
            console.error('Error fetching customer report:', error);
            return { error: error.message };
        }
    });

    ipcMain.handle('customer-toggle-status', async (event, id, status) => {
        try {
            return await Customers.toggleStatus(id, status);
        } catch (error) {
            console.error('Error toggling customer status:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-singleCustomer', async (event, customer_id) => {
        try {
            return await Customers.getSingleCustomer(customer_id);
        } catch (error) {
            console.error('Error fetching single customer:', error);
            return { error: error.message };
        }
    });

    // Payments
    ipcMain.handle('get-unpaid-invoices', async (event, customerId) => {
        try {
            const baseSql = `
                SELECT i.*,
                       ${customerNameSql('c')} AS customerName,
                       COALESCE(lt.lineTotal, 0) AS amount,
                       COALESCE(lt.lineTotal, 0) * (1 + COALESCE(i.vat, 0) / 100.0) AS total,
                       COALESCE(pt.totalPaid, 0) AS totalPaid,
                       COALESCE(lt.lineTotal, 0) * (1 + COALESCE(i.vat, 0) / 100.0) - COALESCE(pt.totalPaid, 0) AS balance
                FROM invoices i
                JOIN customers c ON i.customer = c.id
                LEFT JOIN (SELECT invoice_id, SUM(amount) AS lineTotal FROM invoice_lines GROUP BY invoice_id) lt ON lt.invoice_id = i.id
                LEFT JOIN (SELECT i.id AS invoiceId,
                           COALESCE((SELECT SUM(a.amount) FROM payment_allocations a WHERE a.invoiceId = i.id), 0)
                         + COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoiceId = i.id AND NOT EXISTS (SELECT 1 FROM payment_allocations x WHERE x.paymentId = p.id)), 0) AS totalPaid
                    FROM invoices i) pt ON pt.invoiceId = i.id
                WHERE LOWER(IFNULL(i.status, '')) NOT IN ('paid', 'cancelled', 'void')
                  AND COALESCE(lt.lineTotal, 0) * (1 + COALESCE(i.vat, 0) / 100.0) - COALESCE(pt.totalPaid, 0) > 0.005`;

            if (customerId) {
                return db.all(baseSql + ` AND i.customer = ? ORDER BY i.id DESC`, [customerId]);
            }
            return db.all(baseSql + ` ORDER BY i.id DESC`);
        } catch (error) {
            console.error('Error fetching unpaid invoices:', error);
            throw error;
        }
    });

    ipcMain.handle('record-payment', async (event, paymentData) => {
        try {
            const invoiceId = paymentData.invoiceId;
            const payAmount = Number(paymentData.amount) || 0;

            // Insert payment record with Pending Deposit status
            const invForCust = await db.get('SELECT customer FROM invoices WHERE id = ?', [invoiceId]);
            const payRes = await db.run(
                `INSERT INTO payments (invoiceId, customerId, amount, paymentMethod, date, createdAt, status) 
                 VALUES (?, ?, ?, ?, ?, datetime('now'), 'Pending Deposit')`,
                [invoiceId, invForCust?.customer || null, payAmount, paymentData.paymentMethod, paymentData.date || paymentData.paymentDate]
            );
            const paymentId = payRes?.lastInsertRowid || payRes?.lastID;
            // Track the allocation so applied/unapplied math stays consistent
            try {
                await db.run(
                    `INSERT INTO payment_allocations (paymentId, invoiceId, amount) VALUES (?, ?, ?)`,
                    [paymentId, invoiceId, payAmount]
                );
            } catch (aErr) { console.warn('payment allocation insert failed:', aErr.message); }

            // Derive balance + payment status from persisted payment history
            // (single source of truth shared with invoice edit/list).
            const financials = recalcInvoiceFinancials(invoiceId);
            const newStatus = financials ? financials.status : undefined;
            const remaining = financials ? financials.balance : 0;

            // ── Auto-post to COA via journal entry ───────────────────────
            try {
                const lastPayment = db.prepare(
                    'SELECT id FROM payments WHERE invoiceId = ? ORDER BY id DESC LIMIT 1'
                ).get(invoiceId);
                if (lastPayment) {
                    // Fetch customer name for description
                    const inv = db.prepare('SELECT customer, number FROM invoices WHERE id = ?').get(invoiceId);
                    const cust = inv?.customer ? db.prepare('SELECT first_name, last_name, company_name, display_name FROM customers WHERE id = ? LIMIT 1').get(inv.customer) : null;
                    JournalEntries.postPayment({
                        id: lastPayment.id,
                        amount: payAmount,
                        date: paymentData.date || paymentData.paymentDate || new Date().toISOString().slice(0, 10),
                        reference: paymentData.reference || (inv?.number ? `Pmt-${inv.number}` : null),
                    customerName: cust ? getCustomerName(cust) : '',
                        bankAccountName: paymentData.depositTo || null,
                    });
                }
            } catch (jErr) { console.warn('Journal auto-post (payment) failed:', jErr.message); }

            return { success: true, newStatus, remaining: Math.max(0, remaining) };
        } catch (error) {
            console.error('Error recording payment:', error);
            throw error;
        }
    });

    // Payments history
    ipcMain.handle('get-payments', async (event, limit = 100) => {
        try {
            const lim = Number(limit) > 0 ? Number(limit) : 100;
            const sql = `SELECT p.*, 
                                i.number AS invoiceNumber,
                                ${customerNameSql('c')} AS customerName
                         FROM payments p
                         JOIN invoices i ON p.invoiceId = i.id
                         JOIN customers c ON i.customer = c.id
                         ORDER BY datetime(COALESCE(p.date, p.createdAt)) DESC
                         LIMIT ${lim}`;
            return await db.all(sql);
        } catch (error) {
            console.error('Error fetching payments history:', error);
            throw error;
        }
    });

    // Payments history - paginated
    ipcMain.handle('get-payments-paginated', async (event, { page = 1, pageSize = 20, search = '', dateFrom = '', dateTo = '' }) => {
        try {
            const offset = (Math.max(1, Number(page)) - 1) * Number(pageSize);
            const size = Number(pageSize) || 20;
            let where = '';
            let params = [];
            const conds = [];
            if (search) {
                conds.push(`(${customerNameSql('c')} LIKE ? OR i.number LIKE ?)`);
                const s = `%${search}%`;
                params.push(s, s);
            }
            if (dateFrom || dateTo) {
                // Inclusive date-range filter on the payment date (falls back to
                // createdAt when date is missing). date(?) normalizes a
                // 'YYYY-MM-DD HH:MM' value to its date part for the comparison.
                const bound = `date(COALESCE(p.date, p.createdAt))`;
                if (dateFrom) { conds.push(`${bound} >= date(?)`); params.push(dateFrom); }
                if (dateTo) { conds.push(`${bound} <= date(?)`); params.push(dateTo); }
            }
            if (conds.length) where = `WHERE ${conds.join(' AND ')}`;
            const countSql = `SELECT COUNT(*) AS total FROM payments p JOIN invoices i ON p.invoiceId = i.id JOIN customers c ON i.customer = c.id ${where}`;
            const dataSql = `SELECT p.*, i.number AS invoiceNumber,
                                    ${customerNameSql('c')} AS customerName
                             FROM payments p
                             JOIN invoices i ON p.invoiceId = i.id
                             JOIN customers c ON i.customer = c.id
                             ${where}
                             ORDER BY datetime(COALESCE(p.date, p.createdAt)) DESC
                             LIMIT ${size} OFFSET ${offset}`;
            const countRow = await db.get(countSql, params);
            const data = await db.all(dataSql, params);
            return { data: data || [], total: countRow?.total || 0 };
        } catch (error) {
            console.error('Error fetching paginated payments:', error);
            return { data: [], total: 0, error: error.message };
        }
    });

    // Income Tracking
    ipcMain.handle('get-income-transactions', async (event, params) => {
        try {
            let query = `
                SELECT 
                    t.id,
                    COALESCE(t.amount, 0) as amount,
                    t.date,
                    t.description,
                    t.status,
                    ${customerNameSql('c')} as customerName
                FROM transactions t
                LEFT JOIN customers c ON t.customerId = c.id
                WHERE t.type = 'income'
            `;
            const queryParams = [];
            let start = params && params.startDate;
            let end = params && params.endDate;
            if (!start && params && Array.isArray(params.dateRange) && params.dateRange.length === 2) {
                start = params.dateRange[0];
                end = params.dateRange[1];
            }
            if (start && end) {
                query += ` AND t.date BETWEEN ? AND ?`;
                queryParams.push(start, end);
            }
            query += ` ORDER BY t.date ${params && params.period === 'daily' ? 'ASC' : 'DESC'}`;
            const transactions = await db.all(query, queryParams);

            const statsParams = [];
            let statsQuery = `
                SELECT 
                    COALESCE(SUM(amount), 0) as totalIncome,
                    COALESCE(AVG(amount), 0) as averageIncome,
                    COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as outstandingAmount
                FROM transactions
                WHERE type = 'income'`;
            if (start && end) {
                statsQuery += ` AND date BETWEEN ? AND ?`;
                statsParams.push(start, end);
            }
            const stats = await db.get(statsQuery, statsParams);
            return { transactions, ...stats };
        } catch (error) {
            console.error('Error fetching income transactions:', error);
            throw error;
        }
    });

    // Recurring Transactions
    // Ensure table exists
    try {
        db.run(`CREATE TABLE IF NOT EXISTS recurring_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT,
            amount REAL,
            frequency TEXT,
            nextDate TEXT,
            kind TEXT,
            payload TEXT,
            status TEXT DEFAULT 'active',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME
        )`);
        try { db.prepare(`ALTER TABLE recurring_transactions ADD COLUMN kind TEXT`).run(); } catch(e) {}
        try { db.prepare(`ALTER TABLE recurring_transactions ADD COLUMN payload TEXT`).run(); } catch(e) {}
    } catch (e) {}
    ipcMain.handle('get-recurring-transactions', async () => {
        try {
            const stmt = db.prepare(`SELECT * FROM recurring_transactions ORDER BY nextDate ASC`);
            return stmt.all();
        } catch (error) {
            console.error('Error fetching recurring transactions:', error);
            throw error;
        }
    });

    ipcMain.handle('create-recurring-transaction', async (event, transactionData) => {
        try {
            const stmt = db.prepare(`INSERT INTO recurring_transactions (description, amount, frequency, nextDate, kind, payload, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`);
            const result = stmt.run(
                transactionData.description,
                transactionData.amount,
                transactionData.frequency,
                transactionData.nextDate,
                transactionData.kind || 'generic',
                transactionData.payload ? JSON.stringify(transactionData.payload) : null,
                transactionData.status || 'active'
            );
            return result;
        } catch (error) {
            console.error('Error creating recurring transaction:', error);
            throw error;
        }
    });

    ipcMain.handle('update-recurring-transaction', async (event, transactionData) => {
        try {
            const stmt = db.prepare(`UPDATE recurring_transactions SET description = ?, amount = ?, frequency = ?, nextDate = ?, kind = ?, payload = ?, status = ?, updatedAt = datetime('now') WHERE id = ?`);
            const result = stmt.run(
                transactionData.description,
                transactionData.amount,
                transactionData.frequency,
                transactionData.nextDate,
                transactionData.kind || 'generic',
                transactionData.payload ? JSON.stringify(transactionData.payload) : null,
                transactionData.status,
                transactionData.id
            );
            return result;
        } catch (error) {
            console.error('Error updating recurring transaction:', error);
            throw error;
        }
    });

    ipcMain.handle('delete-recurring-transaction', async (event, id) => {
        try {
            const stmt = db.prepare('DELETE FROM recurring_transactions WHERE id = ?');
            return stmt.run(id);
        } catch (error) {
            console.error('Error deleting recurring transaction:', error);
            throw error;
        }
    });

    // Pause/resume helpers
    ipcMain.handle('recurring-pause', async (_e, id) => {
        try {
            const stmt = db.prepare(`UPDATE recurring_transactions SET status='paused', updatedAt=datetime('now') WHERE id=?`);
            return stmt.run(id);
        } catch (e) { throw e; }
    });
    ipcMain.handle('recurring-resume', async (_e, id) => {
        try {
            const stmt = db.prepare(`UPDATE recurring_transactions SET status='active', updatedAt=datetime('now') WHERE id=?`);
            return stmt.run(id);
        } catch (e) { throw e; }
    });
    // Bulk pause/resume
    ipcMain.handle('recurring-bulk-pause', async (_e, ids = []) => {
        try {
            if (!Array.isArray(ids) || ids.length === 0) return { changes: 0 };
            const placeholders = ids.map(() => '?').join(',');
            const stmt = db.prepare(`UPDATE recurring_transactions SET status='paused', updatedAt=datetime('now') WHERE id IN (${placeholders})`);
            return stmt.run(...ids);
        } catch (e) { throw e; }
    });
    ipcMain.handle('recurring-bulk-resume', async (_e, ids = []) => {
        try {
            if (!Array.isArray(ids) || ids.length === 0) return { changes: 0 };
            const placeholders = ids.map(() => '?').join(',');
            const stmt = db.prepare(`UPDATE recurring_transactions SET status='active', updatedAt=datetime('now') WHERE id IN (${placeholders})`);
            return stmt.run(...ids);
        } catch (e) { throw e; }
    });
    // Run one now
    ipcMain.handle('recurring-run-now', async (_e, id) => {
        try {
            const row = db.prepare(`SELECT * FROM recurring_transactions WHERE id=?`).get(id);
            if (!row) throw new Error('Not found');
            const payload = row.payload ? JSON.parse(row.payload) : {};
            const kind = (row.kind || 'generic').toLowerCase();
            const today = new Date().toISOString().slice(0,10);
            switch (kind) {
                case 'invoice': {
                    const Invoices = require('../models/invoices');
                    await Invoices.insertInvoice(payload.customer, payload.customer_email, payload.islater, payload.billing_address, payload.terms, payload.start_date || today, payload.last_date || today, payload.message, payload.statement_message, payload.number, payload.entered_by, payload.vat, undefined, payload.invoiceLines || payload.lines);
                    break;
                }
                case 'bill': {
                    const Expenses = require('../models/expenses');
                    await Expenses.insertExpense(payload.payee, payload.payment_account, payload.payment_date || today, payload.payment_method, payload.ref_no, payload.category, payload.entered_by, payload.approval_status || 'Pending', payload.expenseLines || payload.lines || []);
                    break;
                }
                case 'journal': {
                    const Journal = require('../models/journal');
                    await Journal.insert(payload);
                    break;
                }
                case 'payroll': {
                    const Payroll = require('../models/payroll');
                    await Payroll.processPayroll(payload);
                    break;
                }
                default:
                    break;
            }
            // Advance nextDate using the same clamping rules as the scheduler so
            // manual "run now" stays consistent with auto-posting.
            const addMonthsClamped = (d, n) => {
                const x = new Date(d);
                const targetDay = x.getDate();
                x.setDate(1);
                x.setMonth(x.getMonth() + n);
                const lastDay = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
                x.setDate(Math.min(targetDay, lastDay));
                return x;
            };
            const fmt = (d) => d.toISOString().slice(0,10);
            if (row.nextDate) {
                let next = new Date(row.nextDate);
                const f = (row.frequency || '').toLowerCase();
                if (f === 'daily') next.setDate(next.getDate() + 1);
                else if (f === 'weekly') next.setDate(next.getDate() + 7);
                else if (f === 'monthly') next = addMonthsClamped(next, 1);
                else if (f === 'quarterly') next = addMonthsClamped(next, 3);
                else if (f === 'yearly') next = addMonthsClamped(next, 12);
                else next.setDate(next.getDate() + 1);
                db.prepare(`UPDATE recurring_transactions SET nextDate=? WHERE id=?`).run(fmt(next), id);
            }
            return { success: true };
        } catch (e) { throw e; }
    });

    // Items
    ipcMain.handle('get-items', async () => {
        try {
            return await db.all(
                'SELECT * FROM items ORDER BY code ASC'
            );
        } catch (error) {
            console.error('Error fetching items:', error);
            throw error;
        }
    });

    ipcMain.handle('create-item', async (event, itemData) => {
        try {
            const result = await db.run(
                `INSERT INTO items 
                 (code, name, description, category, unitPrice, stock, createdAt) 
                 VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
                [itemData.code, itemData.name, itemData.description,
                 itemData.category, itemData.unitPrice, itemData.stock]
            );
            return result;
        } catch (error) {
            console.error('Error creating item:', error);
            throw error;
        }
    });

    ipcMain.handle('update-item', async (event, itemData) => {
        try {
            const result = await db.run(
                `UPDATE items 
                 SET code = ?,
                     name = ?,
                     description = ?,
                     category = ?,
                     unitPrice = ?,
                     stock = ?,
                     updatedAt = datetime('now')
                 WHERE id = ?`,
                [itemData.code, itemData.name, itemData.description,
                 itemData.category, itemData.unitPrice, itemData.stock,
                 itemData.id]
            );
            return result;
        } catch (error) {
            console.error('Error updating item:', error);
            throw error;
        }
    });

    ipcMain.handle('delete-item', async (event, id) => {
        try {
            return await db.run(
                'DELETE FROM items WHERE id = ?',
                [id]
            );
        } catch (error) {
            console.error('Error deleting item:', error);
            throw error;
        }
    });

    // ── Customer Payment History ────────────────────────────────────────────
    ipcMain.handle('customer-payments-list', async (_e, customerId) => {
        try {
            return Payments.getByCustomer(Number(customerId));
        } catch (e) {
            console.error('customer-payments-list:', e);
            return [];
        }
    });

    ipcMain.handle('customer-payments-balance', async (_e, customerId) => {
        try {
            return Payments.getCustomerBalance(Number(customerId));
        } catch (e) {
            console.error('customer-payments-balance:', e);
            return { invoicedTotal: 0, paidTotal: 0, remainingBalance: 0, unappliedCredits: 0 };
        }
    });

    ipcMain.handle('customer-payments-all', async (_e, filters) => {
        try {
            return Payments.getAllPayments(filters || {});
        } catch (e) {
            console.error('customer-payments-all:', e);
            return [];
        }
    });

    ipcMain.handle('customer-payment-update', async (_e, id, data) => {
        try {
            const res = Payments.update(Number(id), data);
            return { success: res && res.success !== false, error: (res && res.error) || null };
        } catch (e) {
            console.error('customer-payment-update:', e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('customer-payment-delete', async (_e, id) => {
        try {
            const res = Payments.delete(Number(id));
            return { success: res && res.success !== false, error: (res && res.error) || null };
        } catch (e) {
            console.error('customer-payment-delete:', e);
            return { success: false, error: e.message };
        }
    });

    // ── Customer Refunds ─────────────────────────────────────────────────────
    const CustomerRefunds = require('../models/customerRefunds');
    ipcMain.handle('customer-refund-create', async (event, payload) => {
        try {
            const ctx = (() => { try { return require('../security/authz').authorize(event, { permissions: 'write:transactions' }); } catch { return null; } })();
            return CustomerRefunds.createRefund(payload || {}, { userId: (ctx && ctx.userId) || 'system' });
        } catch (e) { console.error('customer-refund-create:', e); return { success: false, error: e.message }; }
    });
    ipcMain.handle('customer-refund-preview', async (_e, paymentId, amount) => {
        try { return CustomerRefunds.previewRefund(Number(paymentId), Number(amount)); }
        catch (e) { return { error: e.message }; }
    });
    ipcMain.handle('customer-refundable', async (_e, paymentId) => {
        try { return CustomerRefunds.getRefundable(Number(paymentId)); }
        catch (e) { return { error: e.message }; }
    });
    ipcMain.handle('customer-refunds-by-customer', async (_e, customerId) => {
        try { return CustomerRefunds.getByCustomer(Number(customerId)); }
        catch (e) { return []; }
    });
    ipcMain.handle('customer-refunds-by-payment', async (_e, paymentId) => {
        try { return CustomerRefunds.getByPayment(Number(paymentId)); }
        catch (e) { return []; }
    });
    ipcMain.handle('customer-refund-get', async (_e, id) => {
        try { return CustomerRefunds.getById(Number(id)); }
        catch (e) { return { error: e.message }; }
    });
    ipcMain.handle('customer-refund-reverse', async (event, id) => {
        try {
            const ctx = (() => { try { return require('../security/authz').authorize(event, { permissions: 'write:transactions' }); } catch { return null; } })();
            return CustomerRefunds.reverseRefund(Number(id), { userId: (ctx && ctx.userId) || 'system' });
        } catch (e) { console.error('customer-refund-reverse:', e); return { success: false, error: e.message }; }
    });
    ipcMain.handle('invoice-refund-create', async (event, payload) => {
        try {
            const ctx = (() => { try { return require('../security/authz').authorize(event, { permissions: 'write:transactions' }); } catch { return null; } })();
            return CustomerRefunds.createInvoiceRefund(payload || {}, { userId: (ctx && ctx.userId) || 'system' });
        } catch (e) { console.error('invoice-refund-create:', e); return { success: false, error: e.message }; }
    });

    ipcMain.handle('invoice-payments-list', async (_e, invoiceId) => {
        try {
            return Payments.getByInvoice(Number(invoiceId));
        } catch (e) {
            console.error('invoice-payments-list:', e);
            return [];
        }
    });

    // ── Customer payment management (applied / unapplied) ───────────────────
    ipcMain.handle('customer-payment-create', async (_e, data) => {
        try {
            const customerId = Number(data.customerId);
            const date = data.date || new Date().toISOString().slice(0, 10);
            const res = Payments.createWithAllocations({
                customerId,
                amount: Number(data.amount) || 0,
                paymentMethod: data.paymentMethod || null,
                date,
                reference: data.reference || null,
                memo: data.memo || null,
                depositTo: data.depositTo || null,
            }, Array.isArray(data.allocations) ? data.allocations : []);
            if (!res.success) return res;

            // ── Auto-post to COA via journal entry (DR Undeposited Funds / CR AR)
            // A GL failure must be surfaced — a payment with no journal entry
            // would make the books inconsistent with the register.
            try {
                const cust = customerId
                    ? db.prepare('SELECT first_name, last_name, company_name, display_name FROM customers WHERE id = ?').get(customerId)
                    : null;
                const glRes = JournalEntries.postPayment({
                    id: res.id,
                    amount: Number(data.amount) || 0,
                    date,
                    reference: data.reference || null,
                    customerName: cust ? getCustomerName(cust) : '',
                    bankAccountName: data.depositTo || null,
                });
                if (glRes && glRes.error) {
                    throw new Error(glRes.error);
                }
                if (glRes && glRes.skipped) {
                    console.warn('customer-payment-create GL already posted (skipped)', res.id);
                }
            } catch (jErr) {
                console.warn('customer-payment-create GL:', jErr.message);
                return { success: false, error: `Payment saved, but the journal entry failed to post: ${jErr.message}` };
            }

            return res;
        } catch (e) {
            console.error('customer-payment-create:', e);
            return { success: false, error: e.message, appliedExceeds: !!e.appliedExceeds };
        }
    });

    ipcMain.handle('customer-payment-apply', async (_e, paymentId, invoiceId, amount) => {
        try {
            return Payments.applyCredit(Number(paymentId), Number(invoiceId), Number(amount));
        } catch (e) {
            console.error('customer-payment-apply:', e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('customer-payment-allocations', async (_e, paymentId) => {
        try {
            return Payments.getAllocations(Number(paymentId));
        } catch (e) {
            console.error('customer-payment-allocations:', e);
            return [];
        }
    });
}

module.exports = registerCustomerHandlers;