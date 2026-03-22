const db = require('./dbmgr.js');

const FixedAssets = {
  createTable: () => {
    // Create table with only id if not exists, then add columns as needed
    db.prepare(`CREATE TABLE IF NOT EXISTS fixed_assets (id INTEGER PRIMARY KEY AUTOINCREMENT)`).run();
    const requiredColumns = [
      { name: 'assetName', type: 'TEXT', default: "''" },
      { name: 'name', type: 'TEXT', default: "''" },
      { name: 'purchaseDate', type: 'TEXT', default: "''" },
      { name: 'purchaseCost', type: 'REAL', default: '0' },
      { name: 'currentValue', type: 'REAL', default: '0' },
      { name: 'depreciationMethod', type: 'TEXT', default: "''" },
      { name: 'status', type: 'TEXT', default: "'Active'" },
      { name: 'entered_by', type: 'TEXT', default: "''" },
      { name: 'date_entered', type: 'DATETIME', default: 'CURRENT_TIMESTAMP' }
    ];
    const pragma = db.prepare("PRAGMA table_info('fixed_assets')").all();
    const existing = pragma.map(col => col.name);
    for (const col of requiredColumns) {
      if (!existing.includes(col.name)) {
        let alter = `ALTER TABLE fixed_assets ADD COLUMN ${col.name} ${col.type}`;
        if (col.default) alter += ` DEFAULT ${col.default}`;
        db.prepare(alter).run();
      }
    }
  },

  getAllAssets: () => {
    try {
      const rows = db.prepare(`SELECT * FROM fixed_assets ORDER BY id DESC`).all();
      return rows.map(r => ({
        id: r.id,
        assetName: r.assetName || '',
        purchaseDate: r.purchaseDate || '',
        purchaseCost: typeof r.purchaseCost === 'number' ? r.purchaseCost : Number(r.purchaseCost) || 0,
        currentValue: typeof r.currentValue === 'number' ? r.currentValue : Number(r.currentValue) || 0,
        depreciationMethod: r.depreciationMethod || '',
        status: r.status || 'Active',
        entered_by: r.entered_by || '',
        date_entered: r.date_entered || ''
      }));
    } catch (err) {
      return { error: err.message };
    }
  },

  // Accept either an asset object or positional params (name, purchaseDate, purchaseCost, entered_by)
  insertAsset: (asset) => {
    const stmt = db.prepare(`
      INSERT INTO fixed_assets (
        assetName, name, purchaseDate, purchaseCost, currentValue, depreciationMethod, status, entered_by, date_entered
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      asset.assetName || '',
      asset.assetName || '', // name
      asset.purchaseDate || '',
      typeof asset.purchaseCost === 'number' ? asset.purchaseCost : Number(asset.purchaseCost) || 0,
      typeof asset.currentValue === 'number' ? asset.currentValue : Number(asset.currentValue) || 0,
      asset.depreciationMethod || '',
      asset.status || 'Active',
      asset.entered_by || '',
      asset.date_entered || new Date().toISOString()
    );
    return { success: res.changes > 0, id: res.lastInsertRowid };
  },

  updateAsset: (asset) => {
    const stmt = db.prepare(`
      UPDATE fixed_assets SET
        assetName = ?,
        name = ?,
        purchaseDate = ?,
        purchaseCost = ?,
        currentValue = ?,
        depreciationMethod = ?,
        status = ?,
        entered_by = ?,
        date_entered = ?
      WHERE id = ?
    `);
    const res = stmt.run(
      asset.assetName || '',
      asset.assetName || '', // name
      asset.purchaseDate || '',
      typeof asset.purchaseCost === 'number' ? asset.purchaseCost : Number(asset.purchaseCost) || 0,
      typeof asset.currentValue === 'number' ? asset.currentValue : Number(asset.currentValue) || 0,
      asset.depreciationMethod || '',
      asset.status || 'Active',
      asset.entered_by || '',
      asset.date_entered || new Date().toISOString(),
      asset.id
    );
    return { success: res.changes > 0 };
  },

  getCount: () => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM fixed_assets');
    return stmt.get().count;
  },

  delete: (id) => {
    const stmt = db.prepare('DELETE FROM fixed_assets WHERE id = ?');
    const res = stmt.run(id);
    return { success: res.changes > 0 };
  }
};

FixedAssets.createTable();

module.exports = FixedAssets;
