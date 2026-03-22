const { ipcMain } = require('electron');
const Database = require('../models/dbmgr');

function listTables() {
  const rows = Database.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all();
  return rows.map(r => r.name);
}

async function register() {
  ipcMain.handle('export-data-json', async () => {
    try {
      const tables = listTables();
      const payload = {};
      for (const t of tables) {
        const rows = Database.prepare(`SELECT * FROM ${t}`).all();
        payload[t] = rows;
      }
      return { success: true, data: payload, exportedAt: new Date().toISOString() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('import-data-json', async (_e, data) => {
    try {
      const payload = data?.data || data;
      if (!payload || typeof payload !== 'object') throw new Error('Invalid payload');
      Database.prepare('PRAGMA foreign_keys = OFF').run();
      Database.prepare('BEGIN').run();
      try {
        for (const [table, rows] of Object.entries(payload)) {
          if (!Array.isArray(rows)) continue;
          // simple replace: clear table then insert all rows
          Database.prepare(`DELETE FROM ${table}`).run();
          if (rows.length) {
            const cols = Object.keys(rows[0]);
            const placeholders = '(' + cols.map(() => '?').join(',') + ')';
            const insert = Database.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${placeholders}`.replace(') VALUES (', ') VALUES (' ));
            const insertTx = Database.transaction((entries) => {
              for (const r of entries) {
                const values = cols.map(c => r[c]);
                insert.run(values);
              }
            });
            insertTx(rows);
          }
        }
        Database.prepare('COMMIT').run();
      } catch (err) {
        Database.prepare('ROLLBACK').run();
        throw err;
      } finally {
        Database.prepare('PRAGMA foreign_keys = ON').run();
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = register;


