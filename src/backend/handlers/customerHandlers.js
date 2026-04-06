const { ipcMain } = require('electron');
const db = require('../models/dbmgr');
const { Customers } = require('../models');

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
    ipcMain.handle('get-customers-paginated', async (event, page, pageSize, search) => {
        try {
            return await Customers.getPaginated(page, pageSize, search || '');
        } catch (error) {
            console.error('Error fetching customers (paginated):', error);
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
                       COALESCE(NULLIF(c.display_name, ''), c.first_name || ' ' || c.last_name) AS customerName,
                       COALESCE(lt.lineTotal, 0) AS amount,
                       COALESCE(lt.lineTotal, 0) * (1 + COALESCE(i.vat, 0) / 100.0) AS total,
                       COALESCE(pt.totalPaid, 0) AS totalPaid,
                       COALESCE(lt.lineTotal, 0) * (1 + COALESCE(i.vat, 0) / 100.0) - COALESCE(pt.totalPaid, 0) AS balance
                FROM invoices i
                JOIN customers c ON i.customer = c.id
                LEFT JOIN (SELECT invoice_id, SUM(amount * quantity) AS lineTotal FROM invoice_lines GROUP BY invoice_id) lt ON lt.invoice_id = i.id
                LEFT JOIN (SELECT invoiceId, SUM(amount) AS totalPaid FROM payments GROUP BY invoiceId) pt ON pt.invoiceId = i.id
                WHERE LOWER(IFNULL(i.status, '')) NOT IN ('paid', 'cancelled', 'void')`;

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

            // Insert payment record
            await db.run(
                `INSERT INTO payments (invoiceId, amount, paymentMethod, date, createdAt) 
                 VALUES (?, ?, ?, ?, datetime('now'))`,
                [invoiceId, payAmount, paymentData.paymentMethod, paymentData.date || paymentData.paymentDate]
            );

            // Compute total from invoice_lines (with VAT)
            const lineTotal = await db.get(
                `SELECT COALESCE(SUM(l.amount * l.quantity), 0) AS total, COALESCE(i.vat, 0) AS vat
                 FROM invoice_lines l
                 JOIN invoices i ON i.id = l.invoice_id
                 WHERE l.invoice_id = ?`,
                [invoiceId]
            );
            const invoiceTotal = (Number(lineTotal?.total) || 0) * (1 + (Number(lineTotal?.vat) || 0) / 100);

            // Compute total payments made
            const paidRow = await db.get(
                `SELECT COALESCE(SUM(amount), 0) AS totalPaid FROM payments WHERE invoiceId = ?`,
                [invoiceId]
            );
            const totalPaid = Number(paidRow?.totalPaid) || 0;

            // Calculate remaining balance and determine status
            const remaining = invoiceTotal - totalPaid;
            let newStatus;
            if (remaining <= 0.01) {
                newStatus = 'Paid';
            } else if (totalPaid > 0) {
                newStatus = 'Partially Paid';
            } else {
                newStatus = 'Pending';
            }

            // Update invoice balance and status
            await db.run(
                `UPDATE invoices SET balance = ?, status = ? WHERE id = ?`,
                [Math.max(0, remaining), newStatus, invoiceId]
            );

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
                                COALESCE(NULLIF(c.display_name, ''), c.first_name || ' ' || c.last_name) AS customerName
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
    ipcMain.handle('get-payments-paginated', async (event, { page = 1, pageSize = 20, search = '' }) => {
        try {
            const offset = (Math.max(1, Number(page)) - 1) * Number(pageSize);
            const size = Number(pageSize) || 20;
            let where = '';
            let params = [];
            if (search) {
                where = `WHERE (i.number LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR c.display_name LIKE ?)`;
                const s = `%${search}%`;
                params = [s, s, s, s];
            }
            const countSql = `SELECT COUNT(*) AS total FROM payments p JOIN invoices i ON p.invoiceId = i.id JOIN customers c ON i.customer = c.id ${where}`;
            const dataSql = `SELECT p.*, i.number AS invoiceNumber,
                                    COALESCE(NULLIF(c.display_name, ''), c.first_name || ' ' || c.last_name) AS customerName
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
                    COALESCE(NULLIF(c.display_name, ''), c.first_name || ' ' || c.last_name) as customerName
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
                    await Invoices.insertInvoice(payload.customer, payload.customer_email, payload.islater, payload.billing_address, payload.terms, payload.start_date || today, payload.last_date || today, payload.message, payload.statement_message, payload.number, payload.entered_by, payload.vat, payload.status || 'Pending', payload.invoiceLines || payload.lines);
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
}

module.exports = registerCustomerHandlers;