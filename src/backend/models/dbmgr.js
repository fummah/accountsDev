const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// Resolve database path for dev vs packaged builds.
// In dev, keep it under src/backend/db/accounts.db.
// In production, place it under userData so it's writable (ASAR is read-only).
function resolveDbPath() {
    const devPath = path.join(__dirname, '../db/accounts.db');
    try {
        const isPackaged = app && app.isPackaged;
        if (!isPackaged) {
            // Development
            const devDir = path.dirname(devPath);
            if (!fs.existsSync(devDir)) fs.mkdirSync(devDir, { recursive: true });
            return devPath;
        }

        // Packaged app
        const userDbDir = path.join(app.getPath('userData'), 'db');
        const userDbPath = path.join(userDbDir, 'accounts.db');
        if (!fs.existsSync(userDbDir)) fs.mkdirSync(userDbDir, { recursive: true });

        if (!fs.existsSync(userDbPath)) {
            // Try to seed from packaged template if present
            const candidates = [
                path.join(process.resourcesPath, 'src', 'backend', 'db', 'accounts.db'),
                path.join(process.resourcesPath, 'backend', 'db', 'accounts.db'),
                path.join(process.resourcesPath, 'db', 'accounts.db')
            ];
            const seed = candidates.find(p => fs.existsSync(p));
            if (seed) {
                try { fs.copyFileSync(seed, userDbPath); } catch {/* ignore and create fresh */}
            }
        }
        return userDbPath;
    } catch {
        // Fallback to dev path if anything goes wrong resolving packaged paths
        const devDir = path.dirname(devPath);
        if (!fs.existsSync(devDir)) fs.mkdirSync(devDir, { recursive: true });
        return devPath;
    }
}

const dbPath = resolveDbPath();

// Initialize the database connection
const options = {};
// Enable verbose logging only in development
try {
    if (!app || !app.isPackaged) {
        options.verbose = console.log;
    }
} catch {
    // ignore
}
const db = new Database(dbPath, options);

// Initialize tables if they don't exist
db.exec(`
    CREATE TABLE IF NOT EXISTS recurring_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        description TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        frequency TEXT NOT NULL,
        nextDate DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME
    );
`);
// Ensure statements table exists for customer statements feature
try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS statements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customerId INTEGER,
            startDate TEXT,
            endDate TEXT,
            notes TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customerId) REFERENCES customers(id)
        );
    `);
} catch (err) {
    console.error('[dbmgr] Failed to ensure statements table:', err);
}

// Provide small compatibility wrappers so older code using db.all/db.get/db.run works
const wrap = {
    raw: db,
    all: (sql, params) => {
        const stmt = db.prepare(sql);
        if (params === undefined) return stmt.all();
        return Array.isArray(params) ? stmt.all(...params) : stmt.all(params);
    },
    get: (sql, params) => {
        const stmt = db.prepare(sql);
        if (params === undefined) return stmt.get();
        return Array.isArray(params) ? stmt.get(...params) : stmt.get(params);
    },
    run: (sql, params) => {
        const stmt = db.prepare(sql);
        if (params === undefined) return stmt.run();
        return Array.isArray(params) ? stmt.run(...params) : stmt.run(params);
    },
    exec: (sql) => db.exec(sql),
    prepare: (sql) => db.prepare(sql),
    // expose better-sqlite3 transaction helper
    transaction: (fn) => db.transaction(fn),
};

module.exports = wrap;
