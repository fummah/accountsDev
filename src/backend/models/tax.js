const db = require('../db/db');
const dbmgr = require('./dbmgr');

class Tax {
    static createTable() {
        const sql = `
            CREATE TABLE IF NOT EXISTS tax_filings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                period_start DATE NOT NULL,
                period_end DATE NOT NULL,
                total_amount DECIMAL(10,2) DEFAULT 0,
                status TEXT DEFAULT 'pending',
                due_date DATE,
                submitted_date DATE,
                notes TEXT,
                documents TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;
        try {
            dbmgr.prepare(sql).run();
            console.log('Tax filings table created or already exists');
            return true;
        } catch (err) {
            console.error('Error creating tax_filings table:', err);
            return false;
        }
    }

    static getTaxRecords() {
        try {
            const sql = `
                SELECT * FROM tax_filings 
                ORDER BY created_at DESC
            `;
            const stmt = dbmgr.prepare(sql);
            const records = stmt.all();
            return { success: true, data: records };
        } catch (err) {
            console.error('Error fetching tax records:', err);
            return { success: false, error: err.message };
        }
    }

    static submitTaxFiling(filingData) {
        try {
            const {
                type,
                period: { start, end },
                notes = '',
                documents = '[]'
            } = filingData;

            // Calculate due date (30 days from period end by default)
            const dueDate = new Date(end);
            dueDate.setDate(dueDate.getDate() + 30);

            const sql = `
                INSERT INTO tax_filings (
                    type,
                    period_start,
                    period_end,
                    due_date,
                    notes,
                    documents,
                    submitted_date
                ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;

            const stmt = dbmgr.prepare(sql);
            const result = stmt.run(
                type,
                start,
                end,
                dueDate.toISOString().split('T')[0],
                notes,
                documents
            );
            
            if (result.changes > 0) {
                return { 
                    success: true, 
                    data: { 
                        id: result.lastInsertRowid,
                        message: 'Tax filing submitted successfully' 
                    } 
                };
            } else {
                throw new Error('Failed to insert tax filing record');
            }
        } catch (err) {
            console.error('Error submitting tax filing:', err);
            return { success: false, error: err.message };
        }
    }

    static updateTaxFiling(id, updates) {
        try {
            const allowedFields = ['status', 'total_amount', 'notes', 'documents'];
            const updateFields = [];
            const params = [];

            Object.keys(updates).forEach(key => {
                if (allowedFields.includes(key)) {
                    updateFields.push(`${key} = ?`);
                    params.push(updates[key]);
                }
            });

            if (updateFields.length === 0) {
                return { success: false, error: 'No valid fields to update' };
            }

            params.push(id); // Add id for WHERE clause
            const sql = `
                UPDATE tax_filings 
                SET ${updateFields.join(', ')} 
                WHERE id = ?
            `;

            const stmt = dbmgr.prepare(sql);
            const result = stmt.run(...params);
            
            if (result.changes > 0) {
                return { 
                    success: true, 
                    data: { message: 'Tax filing updated successfully' } 
                };
            } else {
                return { 
                    success: false, 
                    error: 'Tax filing not found or no changes made' 
                };
            }
        } catch (err) {
            console.error('Error updating tax filing:', err);
            return { success: false, error: err.message };
        }
    }
}

module.exports = Tax;