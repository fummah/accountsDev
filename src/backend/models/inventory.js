const db = require('./dbmgr');

/**
 * inventory.js — THE single owner of stock movement in this application.
 *
 * Nothing else in the backend writes `item_stock`, `stock_movements` or
 * `inventory_adjustments`. Documents do not touch stock directly: a vendor bill
 * asks this module to RECEIVE stock, a sales invoice asks it to ISSUE stock.
 * Keeping every quantity change in one file is what makes Stock Levels, the
 * movement history and the reorder list trustworthy.
 *
 * ── The single source of truth ───────────────────────────────────────────────
 * `item_stock.quantity`, keyed on (itemId, warehouseId). The Stock Levels screen
 * reads exactly this. `stock_movements` is an append-only audit trail and is
 * NEVER summed to produce a balance. `products.stock` and `items.stock` are
 * legacy decorative columns — do not read them for stock.
 *
 * ── The id-space rule (important) ────────────────────────────────────────────
 * Every `itemId` in this file is an `items.id`, NOT a `products.id`. Documents
 * (invoice_lines.product, bill lines) reference `products.id`. Use
 * resolveInventoryItem() to cross from one to the other — never guess, and
 * never match on a product name (names repeat: 33 product rows share the names
 * of 7 items in the live database).
 *
 * ── Movement kinds ───────────────────────────────────────────────────────────
 *   adjustStock()    — a manual correction (Inventory → Adjustments)
 *   recordMovement() — a warehouse-to-warehouse transfer
 *   receiveStock()   — goods IN from a vendor bill        (sourceType 'bill')
 *   issueStock()     — goods OUT on a sales invoice       (sourceType 'invoice')
 * A purchase or a sale is never represented as a manual adjustment.
 */

// Source kinds for a stock movement. A movement is caused by exactly one of these.
const MOVEMENT_SOURCE = {
  BILL: 'bill',        // vendor bill  → receipt
  INVOICE: 'invoice',  // sales invoice → issue
  MANUAL: 'manual',    // adjustment / transfer (existing behaviour)
};

// Reason labels written to stock_movements.reason.
const MOVEMENT_REASON = {
  RECEIPT: 'PURCHASE RECEIPT',
  ISSUE: 'SALE ISSUE',
};

/** Is a transaction already open? Lets the new movers compose inside a caller's
 *  transaction (e.g. one transaction around a bill header + lines + journal +
 *  stock) instead of nesting BEGIN inside BEGIN, which SQLite rejects. */
const inTransaction = () => {
  try { return !!db.raw.inTransaction; } catch { return false; }
};

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

    // ── Source linkage (migration for existing databases) ──────────────────
    // Which document caused this movement, so a bill/invoice can be traced to
    // its stock effect and re-posting can be detected. These are NEW columns
    // rather than a reuse of refType/refId: those are already written by
    // adjustStock ('ADJUSTMENT') and recordMovement ('MANUAL'), so overloading
    // them would make hasMovement('bill', 2034) ambiguous.
    //
    // sourceLineId is INFORMATIONAL ONLY. Both expenses.updateExpense and
    // invoices.updateInvoice delete and re-insert their lines, so a line id is
    // not stable across an edit — reconciliation keys on
    // (sourceType, sourceId, itemId, warehouseId) instead.
    try {
      const cols = new Set(db.prepare("PRAGMA table_info('stock_movements')").all().map(r => r.name));
      const add = (col, ddl) => {
        if (!cols.has(col)) db.prepare(`ALTER TABLE stock_movements ADD COLUMN ${col} ${ddl}`).run();
      };
      add('sourceType',   'TEXT');
      add('sourceId',     'INTEGER');
      add('sourceLineId', 'INTEGER');
      add('unitCost',     'REAL');
    } catch (e) {
      console.error('stock_movements migration failed:', e);
    }

    // ── inventory_adjustments review / accounting metadata (migration) ─────
    // Makes an adjustment a proper, auditable transaction: reference, date,
    // reason + details, before/after quantity AND value, status, and the linked
    // movement + journal entry (so it can be viewed and reversed).
    try {
      const acols = new Set(db.prepare("PRAGMA table_info('inventory_adjustments')").all().map(r => r.name));
      const aadd = (col, ddl) => { if (!acols.has(col)) db.prepare(`ALTER TABLE inventory_adjustments ADD COLUMN ${col} ${ddl}`).run(); };
      aadd('reference', 'TEXT');
      aadd('adjustmentDate', 'TEXT');
      aadd('productId', 'INTEGER');
      aadd('reasonDetails', 'TEXT');
      aadd('notes', 'TEXT');
      aadd('qtyBefore', 'REAL');
      aadd('qtyAfter', 'REAL');
      aadd('unitCost', 'REAL');
      aadd('valueBefore', 'REAL');
      aadd('valueChange', 'REAL');
      aadd('valueAfter', 'REAL');
      aadd('status', "TEXT DEFAULT 'Posted'");
      aadd('movementId', 'INTEGER');
      aadd('journalId', 'INTEGER');
      aadd('createdBy', 'TEXT');
      aadd('requestId', 'TEXT');
      aadd('reversedById', 'INTEGER');
      aadd('reversalOfId', 'INTEGER');
      aadd('reversedAt', 'DATETIME');
    } catch (e) {
      console.error('inventory_adjustments migration failed:', e);
    }

    // ── products.item_id (the id-space bridge) ────────────────────────────
    // resolveInventoryItem() READS and WRITES this column, so it must exist
    // before that function can ever be called. models/products.js also adds it,
    // but relying on that made the resolver depend on MODULE LOAD ORDER: a
    // caller that loaded inventory.js without products.js first (a service, a
    // script) hit `no such column: item_id`. The module that uses the column
    // owns ensuring it, in the same defensive style as stock_movements above.
    try {
      const pcols = new Set(db.prepare("PRAGMA table_info('products')").all().map(r => r.name));
      if (pcols.size && !pcols.has('item_id')) {
        db.prepare('ALTER TABLE products ADD COLUMN item_id INTEGER').run();
      }
    } catch (e) {
      console.error('products.item_id migration failed:', e);
    }

    // Lookup indexes. Deliberately NOT a UNIQUE constraint on the source tuple:
    // a bill may legitimately carry two lines for the same product in the same
    // warehouse, so uniqueness has to be enforced per document by the caller,
    // not per row by the schema.
    db.prepare('CREATE INDEX IF NOT EXISTS idx_stock_movements_source ON stock_movements(sourceType, sourceId)').run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(itemId, warehouseId)').run();
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

  /** Backend-generated adjustment reference (ADJ-000001). */
  generateAdjustmentReference: () => {
    const last = db.prepare("SELECT reference FROM inventory_adjustments WHERE reference IS NOT NULL ORDER BY id DESC LIMIT 1").get();
    const n = last && last.reference ? (parseInt(String(last.reference).replace(/\D/g, ''), 10) || 0) : 0;
    return `ADJ-${String(n + 1).padStart(6, '0')}`;
  },

  /**
   * Record a stock adjustment as a proper transaction.
   *
   * Never overwrites Quantity On Hand: it writes an item_stock delta + an
   * inventory MOVEMENT + an inventory_adjustments row + a journal entry, all in
   * ONE transaction, and returns the before/after quantity AND value.
   *
   * Backward compatible: the 4th arg may be a plain reason string (legacy) or an
   * options object { reason, reasonDetails, notes, adjustmentDate, productId,
   * unitCost, createdBy, requestId, reversalOfId }.
   */
  adjustStock: (itemId, warehouseId, quantity, reasonOrOpts) => {
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const opts = (reasonOrOpts && typeof reasonOrOpts === 'object') ? reasonOrOpts : { reason: reasonOrOpts };
    const itemIdN = Number(itemId);
    const whN = Number(warehouseId);
    const qty = Number(quantity) || 0;
    if (!itemIdN || !whN) return { success: false, error: 'Item and warehouse are required.' };
    if (!qty) return { success: false, error: 'Adjustment quantity cannot be zero.' };

    // Idempotency: a repeated requestId returns the existing adjustment (no double post).
    if (opts.requestId) {
      const dup = db.prepare('SELECT id, reference FROM inventory_adjustments WHERE requestId = ? LIMIT 1').get(String(opts.requestId));
      if (dup) return { success: true, adjustmentId: Number(dup.id), reference: dup.reference, duplicate: true };
    }

    const tx = db.transaction(() => {
      const Valuation = require('../services/inventoryValuation');
      const COA = require('./chartOfAccounts');
      const JournalEntries = require('./journalEntries');

      const prod = db.prepare('SELECT id, inventory_asset_account_id, valuation_method, purchase_cost FROM products WHERE item_id = ? LIMIT 1').get(itemIdN);
      const method = (prod && prod.valuation_method) || 'FIFO';
      const standardCost = prod ? Number(prod.purchase_cost) || 0 : 0;
      const invAccountId = prod && prod.inventory_asset_account_id != null ? Number(prod.inventory_asset_account_id) : null;

      // Quantity before/after (authoritative item_stock balance for this warehouse).
      const beforeRow = db.prepare('SELECT quantity FROM item_stock WHERE itemId = ? AND warehouseId = ?').get(itemIdN, whN);
      const qtyBefore = Number(beforeRow ? beforeRow.quantity : 0);
      const qtyAfter = qtyBefore + qty;

      // Cost basis: an explicit unit cost wins (a positive adjustment with no
      // existing basis must not silently create zero-cost stock); otherwise the
      // CENTRAL valuation engine supplies it.
      let unitCost;
      if (opts.unitCost != null && opts.unitCost !== '' && Number(opts.unitCost) >= 0) {
        unitCost = Number(opts.unitCost);
      } else if (qty < 0) {
        unitCost = Valuation.costOfRemoval(itemIdN, -qty, method, { standardCost }).unitCost || 0;
      } else {
        const state = Valuation.replay(itemIdN, method);
        unitCost = state.qtyOn > 0 ? state.value / state.qtyOn : standardCost;
      }
      unitCost = round2(unitCost);

      const valueBefore = round2(Valuation.currentValue(itemIdN, method));
      const valueChange = round2(qty * unitCost);
      const valueAfter = round2(valueBefore + valueChange);

      db.prepare(`
        INSERT INTO item_stock (itemId, warehouseId, quantity, reorderPoint)
        VALUES (?, ?, ?, 0)
        ON CONFLICT(itemId, warehouseId) DO UPDATE SET quantity = item_stock.quantity + excluded.quantity
      `).run(itemIdN, whN, qty);

      const mv = db.prepare(`
        INSERT INTO stock_movements (itemId, warehouseId, quantityChange, reason, refType, refId, unitCost, movedAt)
        VALUES (?, ?, ?, ?, 'ADJUSTMENT', NULL, ?, datetime('now'))
      `).run(itemIdN, whN, qty, opts.reason || null, unitCost);
      const movementId = Number(mv.lastInsertRowid);

      const reference = Inventory.generateAdjustmentReference();
      const adjDate = opts.adjustmentDate || new Date().toISOString().slice(0, 10);
      const adj = db.prepare(`
        INSERT INTO inventory_adjustments
          (itemId, warehouseId, quantity, reason, createdAt, reference, adjustmentDate, productId, reasonDetails, notes,
           qtyBefore, qtyAfter, unitCost, valueBefore, valueChange, valueAfter, status, movementId, createdBy, requestId, reversalOfId)
        VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Posted', ?, ?, ?, ?)
      `).run(
        itemIdN, whN, qty, opts.reason || null, reference, adjDate,
        prod ? Number(prod.id) : (opts.productId != null ? Number(opts.productId) : null),
        opts.reasonDetails || null, opts.notes || null,
        qtyBefore, qtyAfter, unitCost, valueBefore, valueChange, valueAfter,
        movementId, opts.createdBy || 'system', opts.requestId || null,
        opts.reversalOfId != null ? Number(opts.reversalOfId) : null
      );
      const adjId = Number(adj.lastInsertRowid);

      // Accounting: configured Inventory Asset + configured offset (system
      // "Inventory Adjustment"). Shrink: Dr offset / Cr Inventory Asset.
      // Gain: Dr Inventory Asset / Cr offset. Never hardcoded by name.
      let journalId = null;
      const amount = round2(Math.abs(qty) * unitCost);
      if (amount > 0) {
        const invAcct = invAccountId || ((COA.getSystemAccount('Inventory Asset') || {}).id);
        const offset = (COA.getSystemAccount('Inventory Adjustment') || {}).id;
        if (!invAcct || !offset) {
          throw new Error('Inventory adjustment cannot post: an Inventory Asset / Inventory Adjustment account is missing.');
        }
        const lines = qty < 0
          ? [{ account_id: offset, debit: amount, credit: 0, description: 'Inventory shrinkage' },
             { account_id: invAcct, debit: 0, credit: amount, description: 'Inventory adjusted down' }]
          : [{ account_id: invAcct, debit: amount, credit: 0, description: 'Inventory adjusted up' },
             { account_id: offset, debit: 0, credit: amount, description: 'Inventory gain' }];
        const res = JournalEntries.post({
          date: adjDate,
          reference,
          description: `Inventory adjustment ${reference}: ${opts.reason || 'manual'}`,
          source_type: 'adjustment', source_id: adjId, lines,
        });
        if (res && res.error) throw new Error(res.error);
        journalId = res && res.id != null ? Number(res.id) : null;
        db.prepare('UPDATE inventory_adjustments SET journalId = ? WHERE id = ?').run(journalId, adjId);
      }

      return {
        success: true, adjustmentId: adjId, reference, movementId, journalId,
        quantity: qty,
        qtyBefore, qtyAfter, unitCost, valueBefore, valueChange, valueAfter,
        reason: opts.reason || null, itemId: itemIdN, warehouseId: whN,
      };
    });
    try {
      return tx();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  /** Adjustment history with product / warehouse names (newest first). */
  listAdjustments: (filters = {}) => {
    const where = [];
    const params = [];
    if (filters.search) { where.push('(p.name LIKE ? OR p.sku LIKE ? OR a.reference LIKE ?)'); const q = `%${filters.search}%`; params.push(q, q, q); }
    if (filters.reason) { where.push('a.reason = ?'); params.push(String(filters.reason)); }
    if (filters.warehouseId) { where.push('a.warehouseId = ?'); params.push(Number(filters.warehouseId)); }
    if (filters.direction === 'increase') where.push('a.quantity > 0');
    else if (filters.direction === 'decrease') where.push('a.quantity < 0');
    if (filters.dateFrom) { where.push('a.adjustmentDate >= ?'); params.push(filters.dateFrom); }
    if (filters.dateTo) { where.push('a.adjustmentDate <= ?'); params.push(filters.dateTo); }
    const wc = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return db.prepare(`
      SELECT a.*, p.name AS productName, p.sku AS sku, w.name AS warehouseName
      FROM inventory_adjustments a
      LEFT JOIN products p ON p.id = a.productId
      LEFT JOIN warehouses w ON w.id = a.warehouseId
      ${wc}
      ORDER BY a.id DESC LIMIT 500
    `).all(...params);
  },

  getAdjustment: (id) => {
    const a = db.prepare(`
      SELECT a.*, p.name AS productName, p.sku AS sku, w.name AS warehouseName
      FROM inventory_adjustments a
      LEFT JOIN products p ON p.id = a.productId
      LEFT JOIN warehouses w ON w.id = a.warehouseId
      WHERE a.id = ?
    `).get(Number(id));
    if (!a) return null;
    const reversal = db.prepare('SELECT id, reference FROM inventory_adjustments WHERE reversalOfId = ? LIMIT 1').get(Number(id));
    const original = a.reversalOfId ? db.prepare('SELECT id, reference FROM inventory_adjustments WHERE id = ?').get(Number(a.reversalOfId)) : null;
    return { ...a, reversal: reversal || null, original: original || null };
  },

  /** Reverse a posted adjustment: creates the opposite adjustment + GL, and
   *  marks the original Reversed (audit trail preserved — never a hard delete). */
  reverseAdjustment: (id, opts = {}) => {
    const a = db.prepare('SELECT * FROM inventory_adjustments WHERE id = ?').get(Number(id));
    if (!a) return { success: false, error: 'Adjustment not found.' };
    if (String(a.status) === 'Reversed') return { success: false, error: 'This adjustment is already reversed.' };
    const res = Inventory.adjustStock(a.itemId, a.warehouseId, -Number(a.quantity), {
      reason: 'Correction',
      reasonDetails: `Reversal of ${a.reference || `#${a.id}`}`,
      notes: opts.notes || null,
      adjustmentDate: opts.date || new Date().toISOString().slice(0, 10),
      createdBy: opts.createdBy || 'system',
      productId: a.productId,
      reversalOfId: a.id,
      requestId: `reversal-of-${a.id}`,
    });
    if (res && res.success) {
      db.prepare("UPDATE inventory_adjustments SET status = 'Reversed', reversedById = ?, reversedAt = datetime('now') WHERE id = ?")
        .run(res.adjustmentId, Number(id));
    }
    return res;
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

  // ───────────────────────────────────────────────────────────────────────────
  // Source linkage + idempotency
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Has anything already been posted to stock for this document?
   * The inventory-side twin of JournalEntries.hasPosting(source_type, source_id),
   * so a double-click, a retry or a stale form cannot double-post a receipt.
   * The BACKEND is authoritative here — disabling a button is not enough.
   */
  hasMovement: (sourceType, sourceId) => {
    if (!sourceType || sourceId == null || sourceId === '') return false;
    const row = db.prepare(
      `SELECT id FROM stock_movements WHERE sourceType = ? AND sourceId = ? LIMIT 1`
    ).get(String(sourceType), Number(sourceId));
    return !!row;
  },

  /**
   * Net quantity already posted to stock for one document line, identified by
   * the STABLE tuple (sourceType, sourceId, itemId, warehouseId).
   *
   * This is what makes an edit reconcile rather than duplicate: editing a bill
   * line from 50 to 60 posts a delta of +10, not a second +50.
   */
  getPostedQuantity: (sourceType, sourceId, itemId, warehouseId) => {
    if (!sourceType || sourceId == null) return 0;
    const row = db.prepare(`
      SELECT COALESCE(SUM(quantityChange), 0) AS qty
      FROM stock_movements
      WHERE sourceType = ? AND sourceId = ? AND itemId = ? AND warehouseId = ?
    `).get(String(sourceType), Number(sourceId), Number(itemId), Number(warehouseId));
    return Number((row && row.qty) || 0);
  },

  /** All movements a document caused, oldest first (Inventory History trace). */
  getMovementsForSource: (sourceType, sourceId) => {
    if (!sourceType || sourceId == null) return [];
    return db.prepare(`
      SELECT m.*, i.name AS itemName, i.code AS itemCode, w.name AS warehouseName
      FROM stock_movements m
      LEFT JOIN items i ON i.id = m.itemId
      LEFT JOIN warehouses w ON w.id = m.warehouseId
      WHERE m.sourceType = ? AND m.sourceId = ?
      ORDER BY m.id ASC
    `).all(String(sourceType), Number(sourceId));
  },

  /**
   * Inventory History for ONE item — newest first (the brief's Part 24).
   *
   * Each row is resolved back to the document that caused it, so the history can
   * say "Vendor bill 7877 — Acme Supplies" or "Invoice INV-00042 — Jane Doe"
   * instead of a bare signed number. That trace is the whole reason the source
   * columns exist: `reason` alone ('PURCHASE RECEIPT') cannot tell a user WHICH
   * bill moved the goods.
   *
   * A movement with no source is a manual adjustment or transfer, and falls back
   * to `refType` (written by adjustStock / recordMovement) and the reason.
   *
   * The `source` label is built HERE, in one place, so a screen never has to
   * know the shape of `expenses` or `invoices` to caption a movement.
   */
  getMovementsForItem: (itemId, limit = 200) => {
    const id = Number(itemId);
    if (!id) return [];
    const cap = Math.max(1, Math.min(2000, Number(limit) || 200));
    let rows = [];
    try {
      rows = db.prepare(`
        SELECT m.id, m.itemId, m.warehouseId, m.quantityChange, m.reason, m.refType, m.refId,
               m.sourceType, m.sourceId, m.sourceLineId, m.unitCost, m.movedAt,
               w.name AS warehouseName, w.code AS warehouseCode,
               e.ref_no AS billRef, e.payment_date AS billDate,
               COALESCE(s.display_name, s.first_name || ' ' || s.last_name, s.first_name) AS vendorName,
               i.number AS invoiceNumber, i.start_date AS invoiceDate,
               COALESCE(NULLIF(c.display_name, ''), NULLIF(c.company_name, ''),
                        NULLIF(TRIM(c.first_name || ' ' || c.last_name), ''), c.first_name) AS customerName
        FROM stock_movements m
        LEFT JOIN warehouses w ON w.id = m.warehouseId
        LEFT JOIN expenses    e ON m.sourceType = 'bill'    AND e.id = m.sourceId
        LEFT JOIN suppliers   s ON s.id = e.payee
        LEFT JOIN invoices    i ON m.sourceType = 'invoice' AND i.id = m.sourceId
        LEFT JOIN customers   c ON c.id = i.customer
        WHERE m.itemId = ?
        ORDER BY m.movedAt DESC, m.id DESC
        LIMIT ?
      `).all(id, cap);
    } catch {
      // `sourceType`/`sourceId` are additive; on a database that predates them
      // fall back to the original columns rather than returning nothing.
      try {
        rows = db.prepare(`
          SELECT m.*, w.name AS warehouseName, w.code AS warehouseCode
          FROM stock_movements m
          LEFT JOIN warehouses w ON w.id = m.warehouseId
          WHERE m.itemId = ?
          ORDER BY m.movedAt DESC, m.id DESC
          LIMIT ?
        `).all(id, cap);
      } catch { return []; }
    }

    return rows.map((r) => {
      let source = '';
      if (r.sourceType === 'bill') {
        source = `Vendor bill ${r.billRef || `#${r.sourceId}`}`;
        if (r.vendorName) source += ` — ${r.vendorName}`;
      } else if (r.sourceType === 'invoice') {
        source = `Invoice ${r.invoiceNumber || `#${r.sourceId}`}`;
        if (r.customerName) source += ` — ${r.customerName}`;
      } else if (r.refType) {
        source = String(r.refType);
      }
      return {
        ...r,
        quantityChange: Number(r.quantityChange || 0),
        unitCost: r.unitCost == null ? null : Number(r.unitCost),
        source,
        sourceLabel: source || r.reason || 'Movement',
      };
    });
  },

  /**
   * Internal: apply one signed movement and write its audit row.
   * MUST already be inside a transaction — it never opens or commits one.
   * Writes only the NEW source columns; refType/refId stay untouched so the
   * existing adjustment/transfer semantics are preserved.
   */
  _applyMovement: (itemId, warehouseId, quantityChange, reason, source) => {
    const s = source || {};
    const upsert = db.prepare(`
      INSERT INTO item_stock (itemId, warehouseId, quantity, reorderPoint)
      VALUES (?, ?, ?, 0)
      ON CONFLICT(itemId, warehouseId) DO UPDATE SET quantity = item_stock.quantity + excluded.quantity
    `);
    upsert.run(itemId, warehouseId, quantityChange);

    db.prepare(`
      INSERT INTO stock_movements
        (itemId, warehouseId, quantityChange, reason, refType, refId,
         sourceType, sourceId, sourceLineId, unitCost, movedAt)
      VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, datetime('now'))
    `).run(
      itemId,
      warehouseId,
      quantityChange,
      reason || null,
      s.sourceType || null,
      s.sourceId != null ? Number(s.sourceId) : null,
      s.sourceLineId != null ? Number(s.sourceLineId) : null,
      s.unitCost != null ? Number(s.unitCost) : null
    );
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Document-driven movement
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Goods IN — a vendor bill (purchase / receipt). Quantity is POSITIVE.
   *
   * `source` = { sourceType, sourceId, sourceLineId, reason, unitCost }
   * Composes inside a caller's transaction when one is already open.
   *
   * No "insufficient stock" check: stock only ever goes up here.
   */
  receiveStock: (itemId, warehouseId, quantity, unitCost, source) => {
    const qty = Number(quantity);
    const iId = Number(itemId);
    const wId = Number(warehouseId);
    if (!iId || !wId) return { success: false, error: 'itemId and warehouseId are required' };
    if (!qty || qty <= 0) return { success: false, error: 'Quantity must be positive' };

    const s = Object.assign({}, source || {});
    if (s.unitCost == null && unitCost != null) s.unitCost = unitCost;
    if (!s.reason) s.reason = MOVEMENT_REASON.RECEIPT;

    const own = !inTransaction();
    if (own) db.prepare('BEGIN').run();
    try {
      Inventory._applyMovement(iId, wId, qty, s.reason, s);
      if (own) db.prepare('COMMIT').run();
      return { success: true, quantityChange: qty };
    } catch (e) {
      if (own) db.prepare('ROLLBACK').run();
      return { success: false, error: e.message };
    }
  },

  /**
   * Goods OUT — a sales invoice (sale / issue). Quantity is POSITIVE and is
   * applied as a reduction.
   *
   * Deliberately does NOT block on insufficient stock. A sale must still be
   * recordable when the count is wrong; the resulting negative balance is
   * surfaced to the caller via `negative` so the UI can warn, and it shows up
   * on Stock Levels rather than being silently swallowed.
   */
  issueStock: (itemId, warehouseId, quantity, unitCost, source) => {
    const qty = Number(quantity);
    const iId = Number(itemId);
    const wId = Number(warehouseId);
    if (!iId || !wId) return { success: false, error: 'itemId and warehouseId are required' };
    if (!qty || qty <= 0) return { success: false, error: 'Quantity must be positive' };

    const s = Object.assign({}, source || {});
    if (s.unitCost == null && unitCost != null) s.unitCost = unitCost;
    if (!s.reason) s.reason = MOVEMENT_REASON.ISSUE;

    const own = !inTransaction();
    if (own) db.prepare('BEGIN').run();
    try {
      Inventory._applyMovement(iId, wId, 0 - qty, s.reason, s);
      let balance = 0;
      try {
        const row = db.prepare('SELECT quantity FROM item_stock WHERE itemId = ? AND warehouseId = ?').get(iId, wId);
        balance = Number((row && row.quantity) || 0);
      } catch { /* non-fatal: balance is advisory only */ }
      if (own) db.prepare('COMMIT').run();
      return { success: true, quantityChange: 0 - qty, balance, negative: balance < 0 };
    } catch (e) {
      if (own) db.prepare('ROLLBACK').run();
      return { success: false, error: e.message };
    }
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Product ↔ Item resolution
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Resolve a products.id to the items.id that holds its stock.
   *
   * Deterministic and backend-authoritative. Order:
   *   1. products.item_id, if it is already set and still valid
   *   2. an items row whose `code` equals the product's SKU — SKU ONLY
   *   3. otherwise create exactly one items row and remember it
   *
   * NEVER matches on name: product names repeat (33 product rows share the
   * names of 7 items in the live DB), so a name join would silently move the
   * wrong product's stock. The frontend's Stock.js does match on name — this
   * function exists so documents never have to.
   *
   * Returns the items row, or null when the product does not exist.
   */
  resolveInventoryItem: (productId) => {
    const pid = Number(productId);
    if (!pid) return null;

    const prod = db.prepare(
      'SELECT id, name, sku, description, category, price, item_id FROM products WHERE id = ?'
    ).get(pid);
    if (!prod) return null;

    // 1. Follow an existing link.
    if (prod.item_id) {
      const linked = db.prepare('SELECT * FROM items WHERE id = ?').get(Number(prod.item_id));
      if (linked) return linked;
      // Link points at a deleted item — fall through and repair it.
    }

    // 2. Match by SKU only.
    const sku = prod.sku == null ? '' : String(prod.sku).trim();
    if (sku) {
      const bySku = db.prepare('SELECT * FROM items WHERE code = ? ORDER BY id ASC LIMIT 1').get(sku);
      if (bySku) {
        db.prepare('UPDATE products SET item_id = ? WHERE id = ?').run(bySku.id, pid);
        return bySku;
      }
    }

    // 3. Create exactly one item and remember the link.
    const created = db.prepare(`
      INSERT INTO items (code, name, description, category, unitPrice, stock, createdAt)
      VALUES (?, ?, ?, ?, ?, 0, datetime('now'))
    `).run(
      sku || String(pid),
      prod.name || ('Product ' + pid),
      prod.description || '',
      prod.category || '',
      Number(prod.price || 0)
    );
    db.prepare('UPDATE products SET item_id = ? WHERE id = ?').run(created.lastInsertRowid, pid);
    return db.prepare('SELECT * FROM items WHERE id = ?').get(created.lastInsertRowid);
  },

  /** Convenience: the items.id for a product, or null. */
  resolveItemId: (productId) => {
    const item = Inventory.resolveInventoryItem(productId);
    return item ? item.id : null;
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

Inventory.MOVEMENT_SOURCE = MOVEMENT_SOURCE;
Inventory.MOVEMENT_REASON = MOVEMENT_REASON;

module.exports = Inventory;
