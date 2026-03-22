const db = require('./dbmgr');

const Inventory = {
  createTables: () => {
    // Item stock per warehouse with reorder points
    db.prepare(`
      CREATE TABLE IF NOT EXISTS item_stock (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        itemId INTEGER NOT NULL,
        warehouseId INTEGER NOT NULL,
        quantity REAL DEFAULT 0,
        reorderPoint REAL DEFAULT 0,
        UNIQUE(itemId, warehouseId)
      )
    `).run();

    // Stock movements for audit trail
    db.prepare(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        itemId INTEGER NOT NULL,
        warehouseId INTEGER NOT NULL,
        quantityChange REAL NOT NULL,
        reason TEXT,
        refType TEXT,
        refId INTEGER,
        movedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Manual adjustments
    db.prepare(`
      CREATE TABLE IF NOT EXISTS inventory_adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        itemId INTEGER NOT NULL,
        warehouseId INTEGER NOT NULL,
        quantity REAL NOT NULL,
        reason TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  },

  getStockForItem: (itemId) => {
    return db.prepare(`
      SELECT s.*, w.name AS warehouseName, w.code AS warehouseCode
      FROM item_stock s
      JOIN warehouses w ON w.id = s.warehouseId
      WHERE s.itemId = ?
      ORDER BY w.name ASC
    `).all(itemId);
  },

  getStockAtWarehouse: (itemId, warehouseId) => {
    return db.prepare(`
      SELECT quantity, reorderPoint FROM item_stock WHERE itemId = ? AND warehouseId = ?
    `).get(itemId, warehouseId);
  },

  setReorderPoint: (itemId, warehouseId, reorderPoint) => {
    const up = db.prepare(`
      INSERT INTO item_stock (itemId, warehouseId, quantity, reorderPoint)
      VALUES (?, ?, COALESCE((SELECT quantity FROM item_stock WHERE itemId=? AND warehouseId=?), 0), ?)
      ON CONFLICT(itemId, warehouseId) DO UPDATE SET reorderPoint=excluded.reorderPoint
    `);
    return up.run(itemId, warehouseId, itemId, warehouseId, reorderPoint);
  },

  adjustStock: (itemId, warehouseId, quantity, reason) => {
    // Upsert stock and add movement and adjustment records atomically
    db.prepare('BEGIN').run();
    try {
      const upsert = db.prepare(`
        INSERT INTO item_stock (itemId, warehouseId, quantity, reorderPoint)
        VALUES (?, ?, ?, 0)
        ON CONFLICT(itemId, warehouseId) DO UPDATE SET quantity = item_stock.quantity + excluded.quantity
      `);
      upsert.run(itemId, warehouseId, quantity);

      db.prepare(`
        INSERT INTO stock_movements (itemId, warehouseId, quantityChange, reason, refType, refId, movedAt)
        VALUES (?, ?, ?, ?, 'ADJUSTMENT', NULL, datetime('now'))
      `).run(itemId, warehouseId, quantity, reason || null);

      db.prepare(`
        INSERT INTO inventory_adjustments (itemId, warehouseId, quantity, reason, createdAt)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run(itemId, warehouseId, quantity, reason || null);

      db.prepare('COMMIT').run();
      return { success: true };
    } catch (e) {
      db.prepare('ROLLBACK').run();
      return { success: false, error: e.message };
    }
  },

  recordMovement: (itemId, fromWarehouseId, toWarehouseId, quantity, refType, refId) => {
    if (!quantity || quantity <= 0) {
      return { success: false, error: 'Quantity must be positive' };
    }
    db.prepare('BEGIN').run();
    try {
      // Ensure sufficient stock at source
      const cur = db.prepare(`SELECT quantity FROM item_stock WHERE itemId=? AND warehouseId=?`).get(itemId, fromWarehouseId);
      const currentQty = Number(cur?.quantity || 0);
      if (currentQty < quantity) {
        db.prepare('ROLLBACK').run();
        return { success: false, error: 'Insufficient stock at source warehouse' };
      }
      // Deduct from source
      db.prepare(`
        INSERT INTO item_stock (itemId, warehouseId, quantity, reorderPoint)
        VALUES (?, ?, ?, 0)
        ON CONFLICT(itemId, warehouseId) DO UPDATE SET quantity = item_stock.quantity - ?
      `).run(itemId, fromWarehouseId, 0 - quantity, quantity);
      db.prepare(`
        INSERT INTO stock_movements (itemId, warehouseId, quantityChange, reason, refType, refId, movedAt)
        VALUES (?, ?, ?, 'TRANSFER OUT', ?, ?, datetime('now'))
      `).run(itemId, fromWarehouseId, 0 - quantity, refType || null, refId || null);

      // Add to destination
      db.prepare(`
        INSERT INTO item_stock (itemId, warehouseId, quantity, reorderPoint)
        VALUES (?, ?, ?, 0)
        ON CONFLICT(itemId, warehouseId) DO UPDATE SET quantity = item_stock.quantity + ?
      `).run(itemId, toWarehouseId, quantity, quantity);
      db.prepare(`
        INSERT INTO stock_movements (itemId, warehouseId, quantityChange, reason, refType, refId, movedAt)
        VALUES (?, ?, ?, 'TRANSFER IN', ?, ?, datetime('now'))
      `).run(itemId, toWarehouseId, quantity, refType || null, refId || null);

      db.prepare('COMMIT').run();
      return { success: true };
    } catch (e) {
      db.prepare('ROLLBACK').run();
      return { success: false, error: e.message };
    }
  },

  getReorderList: () => {
    return db.prepare(`
      SELECT s.itemId, s.warehouseId, s.quantity, s.reorderPoint
      FROM item_stock s
      WHERE s.reorderPoint > 0 AND s.quantity <= s.reorderPoint
      ORDER BY s.itemId ASC
    `).all();
  }
};

Inventory.createTables();

module.exports = Inventory;


