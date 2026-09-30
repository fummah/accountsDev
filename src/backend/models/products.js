const db = require('./dbmgr.js');
const ItemTypes = require('../services/itemTypes');
const { round2 } = require('../services/documentStatus');

// ── Account-type predicates (backend is the authority, never the dropdown) ──
const ACCOUNT_TYPES = {
  income:        new Set(['income', 'other income']),
  expenseOrCogs: new Set(['expense', 'other expense', 'cost of goods sold']),
  cogs:          new Set(['cost of goods sold', 'expense', 'other expense']),
  inventoryAsset: new Set(['asset', 'bank', 'cash', 'fixed asset', 'other current asset', 'other asset', 'inventory']),
};

const numOrNull = (v) => (v == null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

/**
 * Validate that an account id exists and its real Chart-of-Accounts type is one
 * of the permitted classifications for the given role. Returns an error string
 * or null. Classification only — NEVER the account name.
 */
const validateAccountType = (accountId, allowedTypes, roleLabel) => {
  const COA = require('./chartOfAccounts');
  const acc = COA.getAccount(Number(accountId));
  if (!acc) return `${roleLabel} not found in the Chart of Accounts.`;
  const t = String(acc.type || acc.accountType || '').trim().toLowerCase();
  if (!allowedTypes.has(t)) {
    return `${roleLabel} must be a ${[...allowedTypes].join(' / ')} account (got "${acc.type || acc.accountType}").`;
  }
  return null;
};

const accountName = (accountId) => {
  try {
    const COA = require('./chartOfAccounts');
    const a = COA.getAccount(Number(accountId));
    return a ? (a.name || a.accountName || '') : '';
  } catch { return ''; }
};


/**
 * The REAL on-hand quantity for a product, summed across warehouses from the
 * inventory engine's single source of truth (`item_stock`), reached through the
 * `products.item_id` bridge that Inventory.resolveInventoryItem() writes.
 *
 * `products.stock` is a legacy decorative column and is NEVER authoritative —
 * nothing in the inventory engine writes it. This derived value is what the
 * Products & Services list shows, so the number a user sees there always matches
 * Inventory → Stock Levels instead of going stale.
 *
 * READ-ONLY: it only reads `products.item_id`; it never resolves or creates an
 * `items` row, so merely listing products has no side effects. A product that
 * has never been resolved to an item (item_id IS NULL) correctly reads 0.
 */
const INVENTORY_STOCK_SQL =
  `COALESCE((SELECT SUM(s.quantity) FROM item_stock s WHERE s.itemId = p.item_id), 0)`;

const Products = {
  createTable: () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        name TEXT,
        sku TEXT,
        category TEXT,
        description TEXT,
        price REAL NOT NULL,
        income_account TEXT,
        tax_inclusive TEXT,
        tax TEXT,
        isfromsupplier TEXT,
        stock INTEGER DEFAULT 0,
        entered_by TEXT,
        date_entered DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    db.prepare(`
      CREATE TABLE IF NOT EXISTS product_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    // Add stock column if missing (migration for existing databases)
    try { db.prepare("ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 0").run(); } catch {}
    // Add income_account_id column for exact (ID-based) income account identity
    try { db.prepare("ALTER TABLE products ADD COLUMN income_account_id INTEGER").run(); } catch {}
    // Add item_id: the authoritative link from a product to the inventory item
    // (items.id) that actually holds its stock. Documents reference products.id
    // while the stock engine is keyed on items.id, and there is no FK or mapping
    // table between the two — without this column they cannot be joined. Set by
    // Inventory.resolveInventoryItem(); NULL means "not resolved yet".
    try { db.prepare("ALTER TABLE products ADD COLUMN item_id INTEGER").run(); } catch {}
    // Create product_types table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS product_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // ── Item-master columns (Item redesign) ────────────────────────────────
    // ONE master record per item. Quotes/Invoices/Bills/Inventory reference it
    // by id; the accounting relationships live here, never duplicated per line.
    const addCol = (col, ddl) => { try { db.prepare(`ALTER TABLE products ADD COLUMN ${col} ${ddl}`).run(); } catch {} };
    addCol('subcategory', 'TEXT');
    addCol('unit_of_measure', 'TEXT');
    addCol('is_active', 'INTEGER DEFAULT 1');
    // Purchase Information
    addCol('purchase_cost', 'REAL DEFAULT 0');
    addCol('purchase_description', 'TEXT');
    addCol('preferred_vendor_id', 'INTEGER');
    addCol('purchase_expense_account_id', 'INTEGER');
    addCol('purchase_tax_rate_id', 'INTEGER');
    addCol('default_purchase_unit', 'TEXT');
    addCol('vendor_item_number', 'TEXT');
    // Sales Information
    addCol('sales_description', 'TEXT');
    addCol('sales_tax_rate_id', 'INTEGER');
    addCol('default_sales_unit', 'TEXT');
    // Inventory Information (Inventory Part only)
    addCol('inventory_asset_account_id', 'INTEGER');
    addCol('cogs_account_id', 'INTEGER');
    addCol('reorder_point', 'REAL DEFAULT 0');
    addCol('preferred_stock_level', 'REAL DEFAULT 0');
    addCol('valuation_method', "TEXT DEFAULT 'FIFO'");
    // Real Default Warehouse (FK to warehouses.id). Stock for this item defaults
    // into this warehouse on purchases/receipts/adjustments when the transaction
    // does not choose one. NULL falls back to the install's default warehouse.
    addCol('default_warehouse_id', 'INTEGER');

    // Lookup tables: subcategories + units of measure.
    db.prepare(`
      CREATE TABLE IF NOT EXISTS item_subcategories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    db.prepare(`
      CREATE TABLE IF NOT EXISTS units_of_measure (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    try {
      const cnt = db.prepare('SELECT COUNT(*) AS c FROM units_of_measure').get().c;
      if (!cnt) {
        const ins = db.prepare('INSERT OR IGNORE INTO units_of_measure (name) VALUES (?)');
        ['Each', 'Hour', 'Box', 'Case', 'Foot', 'Pound', 'Gallon', 'Meter'].forEach(u => ins.run(u));
      }
    } catch { /* seed is best-effort */ }

    // ── DB-level SKU uniqueness (Phase 3) ──────────────────────────────────
    // Normalised (case-insensitive + trimmed), blank SKUs excluded so several
    // items may legitimately have no SKU. Created only when existing data is
    // already clean; a legacy DB with duplicate SKUs is REPORTED rather than
    // failing to start, and the model-level check still rejects new dupes.
    try {
      const dups = db.prepare(`
        SELECT LOWER(TRIM(sku)) AS s, COUNT(*) AS c
        FROM products
        WHERE sku IS NOT NULL AND TRIM(sku) != ''
        GROUP BY LOWER(TRIM(sku)) HAVING c > 1
      `).all();
      if (dups.length) {
        console.warn('[products] duplicate SKUs prevent the unique index:', dups.map(d => d.s).join(', '));
      } else {
        db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_unique
                    ON products(LOWER(TRIM(sku)))
                    WHERE sku IS NOT NULL AND TRIM(sku) != ''`).run();
      }
    } catch (e) { console.error('[products] SKU unique index failed:', e.message); }

    // One-time, non-destructive migration of the legacy type vocabulary onto
    // the canonical codes (see services/itemTypes.js).
    try { Products.migrateLegacyTypes(); } catch (e) { console.error('item type migration failed:', e); }

    // Phase 4: backfill the ID relationship from the legacy text name so every
    // accounting path can use income_account_id. The TEXT column is retained
    // only as a denormalised display cache for legacy readers — all new code
    // resolves accounts by id.
    try {
      const rows = db.prepare(
        "SELECT id, income_account FROM products WHERE income_account_id IS NULL AND income_account IS NOT NULL AND TRIM(income_account) != ''"
      ).all();
      if (rows.length) {
        const find = db.prepare('SELECT id FROM chart_of_accounts WHERE LOWER(name) = LOWER(?) OR number = ? LIMIT 1');
        const upd = db.prepare('UPDATE products SET income_account_id = ? WHERE id = ?');
        for (const r of rows) {
          const a = find.get(r.income_account, r.income_account);
          if (a) upd.run(a.id, r.id);
        }
      }
    } catch (e) { console.error('[products] income_account_id backfill failed:', e.message); }
  },

  /** Map legacy type values ('Product', 'Service', …) onto canonical codes. */
  migrateLegacyTypes: () => {
    const rows = db.prepare('SELECT id, type FROM products').all();
    const upd = db.prepare('UPDATE products SET type = ? WHERE id = ?');
    let changed = 0;
    for (const r of rows) {
      const code = ItemTypes.normalizeTypeCode(r.type);
      if (code && code !== r.type) { upd.run(code, r.id); changed++; }
    }
    return changed;
  },


  insertProduct: async (type, name, sku, category, description, price, income_account, tax_inclusive, tax, isfromsupplier, entered_by, stock, income_account_id) => {
    // CENTRAL write path: the legacy positional shape is mapped onto the one
    // Item Master service so quick-add / importer rows get the same validation
    // (SKU uniqueness, type normalisation, account classification) as the full
    // New/Edit Item drawer.
    const ItemMaster = require('../services/itemMasterService');
    const res = ItemMaster.createFromLegacy(
      { type, name, sku, category, description, price, income_account, income_account_id },
      { userId: entered_by || 'system' }
    );
    if (res && res.success) return { success: true, id: res.id };
    return { success: false, error: (res && res.error) || 'Failed to add item' };
  },

  getAllProducts: () => {
    const stmt = db.prepare(
      `SELECT p.*, ${INVENTORY_STOCK_SQL} AS inventory_stock FROM products p ORDER BY p.id DESC`
    );
    return Products.attachAvailability(stmt.all());
  },

  /**
   * Merge derived availability (on PO / expected) onto product rows using the
   * ONE availability service — a single batch query, never per item.
   */
  attachAvailability: (rows) => {
    const list = Array.isArray(rows) ? rows : [];
    try {
      const Availability = require('../services/inventoryAvailabilityService');
      const ItemStatus = require('../services/inventoryStockStatus');
      const avail = Availability.getAvailabilityForItems(list.map((r) => r.id));
      return list.map((r) => {
        const a = avail[Number(r.id)];
        const onHand = a && a.onHand != null ? a.onHand : (r.inventory_stock != null ? Number(r.inventory_stock) : 0);
        return {
          ...r,
          on_po: a ? a.onPurchaseOrder : null,
          expected: a ? a.expected : null,
          stock_status: ItemStatus.computeStatus(ItemTypes.tracksInventory(r.type), onHand, r.reorder_point),
        };
      });
    } catch (e) {
      console.error('[products] availability merge failed:', e.message);
      return list;
    }
  },

  getPaginated: (page = 1, pageSize = 25, search = '', typeFilter = '', categoryFilter = '', statusFilter = '') => {
    const offset = (Math.max(1, page) - 1) * Math.max(1, pageSize);
    const limit = Math.max(1, Math.min(500, pageSize));
    const searchParam = search && search.trim() ? `%${search.trim()}%` : null;
    const typeParam = typeFilter && typeFilter.trim() ? typeFilter.trim() : null;
    const catParam = categoryFilter && categoryFilter.trim() ? categoryFilter.trim() : null;
    const statusParam = statusFilter && statusFilter.trim() ? statusFilter.trim().toUpperCase() : null;
    let total;
    let data;
    const whereParts = [];
    const params = [];
    if (searchParam) {
      whereParts.push('(p.name LIKE ? OR p.sku LIKE ? OR p.category LIKE ?)');
      params.push(searchParam, searchParam, searchParam);
    }
    if (typeParam) {
      whereParts.push('p.type = ?');
      params.push(typeParam);
    }
    if (catParam) {
      whereParts.push('p.category = ?');
      params.push(catParam);
    }
    if (statusParam) {
      // Stock-status filter (inventory-tracked items only), using the SAME
      // On-Hand expression and the same <= rule as the central status helper.
      const stock = INVENTORY_STOCK_SQL;
      whereParts.push("LOWER(p.type) IN ('inventory_part','inventory part','product','raw material','asset','bundle')");
      if (statusParam === 'OUT_OF_STOCK') whereParts.push(`(${stock}) <= 0`);
      else if (statusParam === 'LOW_STOCK') whereParts.push(`(${stock}) > 0 AND p.reorder_point IS NOT NULL AND (${stock}) <= p.reorder_point`);
      else if (statusParam === 'IN_STOCK') whereParts.push(`(${stock}) > 0 AND (p.reorder_point IS NULL OR (${stock}) > p.reorder_point)`);
    }
    const whereClause = whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : '';
    const selectSql = `SELECT p.*, ${INVENTORY_STOCK_SQL} AS inventory_stock FROM products p${whereClause}`;
    if (params.length) {
      total = db.prepare(`SELECT COUNT(*) AS total FROM products p${whereClause}`).get(...params).total;
      data = db.prepare(`${selectSql} ORDER BY p.id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    } else {
      total = db.prepare('SELECT COUNT(*) AS total FROM products p').get().total;
      data = db.prepare(`${selectSql} ORDER BY p.id DESC LIMIT ? OFFSET ?`).all(limit, offset);
    }
    return { data: Products.attachAvailability(data), total };
  },

  getById: (id) => db.prepare('SELECT * FROM products WHERE id = ?').get(Number(id)),

  /** The full item master row + the authoritative on-hand quantity. */
  getItemMaster: (id) => {
    const row = db.prepare(`SELECT p.*, ${INVENTORY_STOCK_SQL} AS inventory_stock FROM products p WHERE p.id = ?`).get(Number(id));
    if (!row) return null;
    // Convenience: the resolved counterpart names (read-only, display only).
    try {
      if (row.preferred_vendor_id) {
        const v = db.prepare('SELECT display_name, first_name, last_name, company_name FROM suppliers WHERE id = ?').get(Number(row.preferred_vendor_id));
        row.preferred_vendor_name = v ? (v.display_name || [v.first_name, v.last_name].filter(Boolean).join(' ') || v.company_name || '') : '';
      }
    } catch { /* vendor lookup optional */ }
    // Derived availability (On Hand / On PO / Expected) + stock status — read-only.
    try {
      const Availability = require('../services/inventoryAvailabilityService');
      const ItemStatus = require('../services/inventoryStockStatus');
      row.availability = Availability.getItemAvailability(Number(id));
      row.stock_status = ItemStatus.computeStatus(
        ItemTypes.tracksInventory(row.type),
        row.availability ? row.availability.onHand : 0,
        row.reorder_point
      );
    } catch { /* availability optional */ }
    return row;
  },

  /**
   * Everything the Item detail view needs: the master row, its stock by
   * warehouse, its movement history (via the inventory engine's items.id
   * bridge) and the bills / invoices that reference it. Read-only.
   */
  getItemDetail: (id) => {
    const master = Products.getItemMaster(id);
    if (!master) return null;
    const itemId = master.item_id != null ? Number(master.item_id) : null;

    let stock = [];
    let movements = [];
    if (itemId) {
      try { stock = require('./inventory').getStockForItem(itemId); } catch { stock = []; }
      try { movements = require('./inventory').getMovementsForItem(itemId, 200); } catch { movements = []; }
    }

    // Bills / invoices that reference this product (purchase + sales history).
    let purchases = [];
    let sales = [];
    try {
      purchases = db.prepare(`
        SELECT e.id AS source_id, e.ref_no AS reference, e.payment_date AS date, e.approval_status AS status,
               el.quantity, el.rate, el.amount, el.description,
               COALESCE(s.display_name, TRIM(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,'')), '') AS party
        FROM expense_lines el
        JOIN expenses e ON e.id = el.expense_id
        LEFT JOIN suppliers s ON s.id = e.payee
        WHERE el.product_id = ?
        ORDER BY e.payment_date DESC, e.id DESC
        LIMIT 200
      `).all(Number(id));
    } catch (e) { console.error('item purchases lookup failed:', e.message); }
    try {
      sales = db.prepare(`
        SELECT i.id AS source_id, i.number AS reference, i.start_date AS date, i.status,
               il.quantity, il.rate, il.amount, il.description,
               COALESCE(c.display_name, TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), '') AS party
        FROM invoice_lines il
        JOIN invoices i ON i.id = il.invoice_id
        LEFT JOIN customers c ON c.id = i.customer
        WHERE il.product = ?
        ORDER BY i.start_date DESC, i.id DESC
        LIMIT 200
      `).all(Number(id));
    } catch (e) { console.error('item sales lookup failed:', e.message); }

    const sum = (rows, f) => rows.reduce((s, r) => s + (Number(f(r)) || 0), 0);
    const summary = {
      onHand: itemId ? stock.reduce((s, r) => s + (Number(r.quantity) || 0), 0) : 0,
      purchaseCount: purchases.length,
      purchaseQty: sum(purchases, r => r.quantity),
      purchaseValue: sum(purchases, r => r.amount),
      salesCount: sales.length,
      salesQty: sum(sales, r => r.quantity),
      salesValue: sum(sales, r => r.amount),
    };

    let availabilityByWarehouse = [];
    try {
      const Availability = require('../services/inventoryAvailabilityService');
      availabilityByWarehouse = Availability.getAvailabilityByWarehouse(Number(id));
    } catch { availabilityByWarehouse = []; }
    let profitability = null;
    try {
      const ItemProfitability = require('../services/itemProfitabilityService');
      profitability = ItemProfitability.getItemProfitability(Number(id));
    } catch { profitability = null; }
    return { master, itemId, stock, movements, purchases, sales, summary, availability: master.availability || null, availabilityByWarehouse, stock_status: master.stock_status || null, profitability };
  },

  /**
   * Chronological inventory history for one item with a RUNNING BALANCE, plus
   * derived summary totals. Everything comes from the movement ledger — nothing
   * is stored twice, so the totals can never drift from the transactions.
   */
  getInventoryHistory: (productId, { from = null, to = null, type = null } = {}) => {
    const master = Products.getItemMaster(productId);
    if (!master) return null;
    const itemId = master.item_id != null ? Number(master.item_id) : null;

    let movements = [];
    if (itemId) {
      try { movements = require('./inventory').getMovementsForItem(itemId, 2000); } catch { movements = []; }
    }

    // Attach the PO id behind a receipt so the UI can link back to it.
    try {
      const recIds = [...new Set(movements.filter(m => m.sourceType === 'receipt' && m.sourceId != null).map(m => Number(m.sourceId)))];
      if (recIds.length) {
        const ph = recIds.map(() => '?').join(',');
        const map = new Map(db.prepare(`SELECT id, purchase_order_id, receipt_number, reference FROM goods_receipts WHERE id IN (${ph})`).all(...recIds).map(r => [r.id, r]));
        for (const m of movements) {
          if (m.sourceType === 'receipt') { const r = map.get(Number(m.sourceId)); if (r) { m.receiptNumber = r.receipt_number; m.purchaseOrderId = r.purchase_order_id; } }
        }
      }
    } catch { /* receipts table may not exist */ }

    // Chronological (oldest first) for the running balance.
    const asc = [...movements].sort((a, b) => String(a.movedAt || '').localeCompare(String(b.movedAt || '')) || Number(a.id) - Number(b.id));
    let balance = 0;
    const rowsAsc = asc.map(m => {
      balance += Number(m.quantityChange) || 0;
      return { ...m, balance };
    });

    // Date/type filters apply to the VIEW; the running balance is computed over
    // the full history so a filtered view still shows the true balance.
    const inRange = (d) => {
      if (!from && !to) return true;
      const s = String(d || '').slice(0, 10);
      if (from && s < from) return false;
      if (to && s > to) return false;
      return true;
    };
    const kind = (m) => {
      const r = String(m.reason || '').toUpperCase();
      if (r.includes('ADJUST')) return 'ADJUSTMENT';
      if (Number(m.quantityChange) >= 0) return m.sourceType === 'receipt' ? 'RECEIPT' : 'IN';
      return m.sourceType === 'invoice' ? 'SALE' : 'OUT';
    };
    const rows = rowsAsc.filter(m => inRange(m.movedAt) && (!type || kind(m) === type));

    const summary = {
      currentStock: itemId ? Number((db.prepare('SELECT COALESCE(SUM(quantity),0) AS q FROM item_stock WHERE itemId = ?').get(itemId) || {}).q) : 0,
      totalIn: asc.filter(m => Number(m.quantityChange) > 0).reduce((s, m) => s + Number(m.quantityChange), 0),
      totalOut: asc.filter(m => Number(m.quantityChange) < 0).reduce((s, m) => s - Number(m.quantityChange), 0),
      totalAdjustments: asc.filter(m => String(m.reason || '').toUpperCase().includes('ADJUST')).reduce((s, m) => s + Math.abs(Number(m.quantityChange) || 0), 0),
      // Value derived from the movement ledger (value in − value out).
      inventoryValue: round2(asc.reduce((s, m) => s + (Number(m.quantityChange) || 0) * (Number(m.unitCost) || 0), 0)),
    };

    return { master, itemId, rows, summary };
  },

  /**
   * Does this item have any real inventory activity? Used to protect against a
   * type change (or a direct quantity edit) that would orphan stock history.
   */
  hasInventoryActivity: (id) => {
    const row = db.prepare('SELECT item_id, stock FROM products WHERE id = ?').get(Number(id));
    if (!row) return false;
    if (Number(row.stock) > 0) return true;
    if (row.item_id) {
      try {
        const s = db.prepare('SELECT COALESCE(SUM(quantity),0) AS q FROM item_stock WHERE itemId = ?').get(Number(row.item_id));
        if (s && Number(s.q) !== 0) return true;
        const m = db.prepare('SELECT 1 FROM stock_movements WHERE itemId = ? LIMIT 1').get(Number(row.item_id));
        if (m) return true;
      } catch { /* tables may not exist yet */ }
    }
    return false;
  },

  /**
   * Create or update the ONE item master record. Validates name/type, SKU
   * uniqueness, account classifications, referenced vendor/tax ids, and blocks
   * a type change that would orphan inventory history. Writes an audit entry.
   * Returns { success, id } or { success:false, error }.
   */
  saveItemMaster: (data = {}, ctx = {}) => {
    const id = data.id != null && data.id !== '' ? Number(data.id) : null;
    const existing = id ? Products.getById(id) : null;
    if (id && !existing) return { success: false, error: 'Item not found.' };

    const name = String(data.name == null ? '' : data.name).trim();
    if (!name) return { success: false, error: 'Item Name is required.' };

    const typeCode = ItemTypes.normalizeTypeCode(data.type);
    if (!typeCode) return { success: false, error: 'A valid Item Type is required.' };
    const cap = ItemTypes.ITEM_TYPES[typeCode];

    // SKU / Item Code uniqueness (case-insensitive) within this company DB.
    const sku = data.sku == null ? '' : String(data.sku).trim();
    if (sku) {
      const dup = db.prepare('SELECT id FROM products WHERE LOWER(TRIM(COALESCE(sku,\'\'))) = LOWER(?) AND id != ?').get(sku, id || 0);
      if (dup) return { success: false, error: 'An item with this SKU / Item Code already exists.' };
    }

    // Type-change protection: an item with inventory activity must stay an
    // inventory-tracked type, otherwise its stock/accounting history is orphaned.
    if (existing && !cap.tracksQuantity && Products.hasInventoryActivity(id)) {
      return { success: false, error: 'This item has inventory transactions and cannot be changed to a non-inventory type.' };
    }

    // Account relationships (validated by real classification, stored by id).
    const incomeAccountId = numOrNull(data.incomeAccountId ?? data.income_account_id);
    if (cap.requiresIncomeAccount && !incomeAccountId) return { success: false, error: 'Income Account is required.' };
    if (incomeAccountId) {
      const err = validateAccountType(incomeAccountId, ACCOUNT_TYPES.income, 'Income Account');
      if (err) return { success: false, error: err };
    }

    const purchaseExpenseAccountId = numOrNull(data.purchaseExpenseAccountId);
    if (purchaseExpenseAccountId) {
      const err = validateAccountType(purchaseExpenseAccountId, ACCOUNT_TYPES.expenseOrCogs, 'Expense / COGS Account');
      if (err) return { success: false, error: err };
    }

    let inventoryAssetAccountId = numOrNull(data.inventoryAssetAccountId);
    let cogsAccountId = numOrNull(data.cogsAccountId);
    if (cap.needsInventoryAsset) {
      if (!inventoryAssetAccountId) return { success: false, error: 'Inventory Asset Account is required for an Inventory Part.' };
      const err = validateAccountType(inventoryAssetAccountId, ACCOUNT_TYPES.inventoryAsset, 'Inventory Asset Account');
      if (err) return { success: false, error: err };
      if (!cogsAccountId) return { success: false, error: 'COGS Account is required for an Inventory Part.' };
      const err2 = validateAccountType(cogsAccountId, ACCOUNT_TYPES.cogs, 'COGS Account');
      if (err2) return { success: false, error: err2 };
    } else {
      // Normalise: never keep stale inventory-account links on a non-inventory type.
      inventoryAssetAccountId = null;
      cogsAccountId = null;
    }

    // Referenced vendor / tax codes must exist (company-scoped by the database).
    const preferredVendorId = numOrNull(data.preferredVendorId);
    if (preferredVendorId) {
      const v = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(preferredVendorId);
      if (!v) return { success: false, error: 'Preferred Vendor not found.' };
    }
    const purchaseTaxRateId = numOrNull(data.purchaseTaxRateId);
    const salesTaxRateId = numOrNull(data.salesTaxRateId);
    for (const [tid, lbl] of [[purchaseTaxRateId, 'Purchase Tax Code'], [salesTaxRateId, 'Sales Tax Code']]) {
      if (tid) {
        const t = db.prepare('SELECT id FROM vat WHERE id = ?').get(tid);
        if (!t) return { success: false, error: `${lbl} not found.` };
      }
    }

    const isActive = (data.isActive === false || data.isActive === 0 || data.isActive === '0') ? 0 : 1;
    const salesPrice = numOrNull(data.salesPrice) ?? 0;
    const purchaseCost = numOrNull(data.purchaseCost) ?? 0;
    const reorderPoint = numOrNull(data.reorderPoint) ?? 0;
    const preferredStockLevel = numOrNull(data.preferredStockLevel) ?? 0;
    const valuationMethod = String(data.valuationMethod || 'FIFO').trim() || 'FIFO';
    const incomeAccountName = incomeAccountId ? accountName(incomeAccountId) : '';

    // Default Warehouse is a real, persisted reference (company-scoped DB).
    let defaultWarehouseId = numOrNull(data.defaultWarehouseId);
    if (defaultWarehouseId) {
      try {
        const w = db.prepare('SELECT id FROM warehouses WHERE id = ?').get(defaultWarehouseId);
        if (!w) return { success: false, error: 'Default Warehouse not found.' };
      } catch { /* warehouses table may not exist yet — treat as unset */ defaultWarehouseId = null; }
    }

    const params = [
      typeCode, name, sku || null,
      data.category || null, data.subcategory || null, data.description || null,
      salesPrice, incomeAccountName, incomeAccountId,
      data.unitOfMeasure || null, isActive,
      purchaseCost, data.purchaseDescription || null, preferredVendorId,
      purchaseExpenseAccountId, purchaseTaxRateId, data.defaultPurchaseUnit || null,
      data.vendorItemNumber || null, data.salesDescription || null, salesTaxRateId,
      data.defaultSalesUnit || null, inventoryAssetAccountId, cogsAccountId,
      reorderPoint, preferredStockLevel, valuationMethod, defaultWarehouseId,
    ];

    try {
      let savedId = id;
      if (id) {
        db.prepare(`
          UPDATE products SET type=?, name=?, sku=?, category=?, subcategory=?, description=?,
            price=?, income_account=?, income_account_id=?, unit_of_measure=?, is_active=?,
            purchase_cost=?, purchase_description=?, preferred_vendor_id=?,
            purchase_expense_account_id=?, purchase_tax_rate_id=?, default_purchase_unit=?,
            vendor_item_number=?, sales_description=?, sales_tax_rate_id=?, default_sales_unit=?,
            inventory_asset_account_id=?, cogs_account_id=?, reorder_point=?, preferred_stock_level=?,
            valuation_method=?, default_warehouse_id=?
          WHERE id=?
        `).run(...params, id);
      } else {
        const res = db.prepare(`
          INSERT INTO products (type, name, sku, category, subcategory, description,
            price, income_account, income_account_id, unit_of_measure, is_active,
            purchase_cost, purchase_description, preferred_vendor_id,
            purchase_expense_account_id, purchase_tax_rate_id, default_purchase_unit,
            vendor_item_number, sales_description, sales_tax_rate_id, default_sales_unit,
            inventory_asset_account_id, cogs_account_id, reorder_point, preferred_stock_level,
            valuation_method, default_warehouse_id, entered_by)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(...params, ctx.userId || 'system');
        savedId = res.lastInsertRowid;
      }
      try {
        const AuditLog = require('./auditLog');
        AuditLog.log({
          userId: ctx.userId || 'system',
          action: id ? 'update' : 'create',
          entityType: 'item',
          entityId: savedId,
          details: { type: typeCode, name, sku, incomeAccountId, purchaseExpenseAccountId, inventoryAssetAccountId, cogsAccountId },
        });
      } catch { /* audit is best-effort */ }
      return { success: true, id: savedId };
    } catch (e) {
      console.error('saveItemMaster failed:', e);
      // Translate the DB-level unique index into the same friendly message.
      if (/idx_products_sku_unique/i.test(e.message) || /UNIQUE constraint failed:.*sku/i.test(e.message)) {
        return { success: false, error: 'An item with this SKU / Item Code already exists.' };
      }
      return { success: false, error: e.message };
    }
  },

  /** Counts by canonical type, for the list stat cards. */
  getItemTypeCounts: () => {
    const out = { INVENTORY_PART: 0, NON_INVENTORY_PART: 0, SERVICE: 0, other: 0 };
    try {
      const rows = db.prepare('SELECT type, COUNT(*) AS c FROM products GROUP BY type').all();
      for (const r of rows) {
        const code = ItemTypes.normalizeTypeCode(r.type) || 'other';
        out[code] = (out[code] || 0) + r.c;
      }
    } catch { /* empty */ }
    return out;
  },

  // ── Subcategories ────────────────────────────────────────────────────────
  getItemSubcategories: (category) => {
    if (category) return db.prepare('SELECT * FROM item_subcategories WHERE category = ? ORDER BY name ASC').all(category);
    return db.prepare('SELECT * FROM item_subcategories ORDER BY category ASC, name ASC').all();
  },
  insertItemSubcategory: (category, name) => {
    const c = String(category || '').trim();
    const n = String(name || '').trim();
    if (!n) return { success: false, error: 'Subcategory name required' };
    try {
      const res = db.prepare('INSERT INTO item_subcategories (category, name) VALUES (?, ?)').run(c || null, n);
      return { success: true, id: res.lastInsertRowid };
    } catch (e) { return { success: false, error: e.message }; }
  },

  // ── Units of measure ─────────────────────────────────────────────────────
  getUnitsOfMeasure: () => db.prepare('SELECT * FROM units_of_measure ORDER BY name ASC').all(),
  insertUnitOfMeasure: (name) => {
    const n = String(name || '').trim();
    if (!n) return { success: false, error: 'Unit name required' };
    try {
      const res = db.prepare('INSERT INTO units_of_measure (name) VALUES (?)').run(n);
      return { success: true, id: res.lastInsertRowid };
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return { success: false, error: 'Unit already exists' };
      return { success: false, error: e.message };
    }
  },

  updateProduct: async (productData) => {
    // CENTRAL write path: merge onto the existing master so a partial legacy
    // update (Products tab rename, importer) cannot wipe the item's accounting
    // configuration, and all validation still applies.
    const ItemMaster = require('../services/itemMasterService');
    const res = ItemMaster.updateFromLegacy(productData, { userId: 'system' });
    if (res && res.success) return { success: true, message: 'Product updated successfully.' };
    return { success: false, error: (res && res.error) || 'Failed to update item' };
  },

  deleteProduct: (id) => {
    try {
      const result = db.prepare('DELETE FROM products WHERE id = ?').run(id);
      return { success: result.changes > 0 };
    } catch (error) {
      console.error('Error deleting product:', error);
      return { success: false, error: error.message };
    }
  },

  getAllCategories: () => {
    const stmt = db.prepare('SELECT * FROM product_categories ORDER BY name ASC');
    return stmt.all();
  },

  insertCategory: (name) => {
    try {
      const result = db.prepare('INSERT INTO product_categories (name) VALUES (?)').run(name);
      return { success: true, id: result.lastInsertRowid };
    } catch (error) {
      if (error.message && error.message.includes('UNIQUE')) {
        return { success: false, error: 'Category already exists' };
      }
      console.error('Error inserting category:', error);
      return { success: false, error: error.message };
    }
  },

  deleteCategory: (id) => {
    try {
      const result = db.prepare('DELETE FROM product_categories WHERE id = ?').run(id);
      return { success: result.changes > 0 };
    } catch (error) {
      console.error('Error deleting category:', error);
      return { success: false, error: error.message };
    }
  },

  getAllTypes: () => {
    const stmt = db.prepare('SELECT * FROM product_types ORDER BY name ASC');
    return stmt.all();
  },

  insertType: (name) => {
    try {
      const result = db.prepare('INSERT INTO product_types (name) VALUES (?)').run(name);
      return { success: true, id: result.lastInsertRowid };
    } catch (error) {
      if (error.message && error.message.includes('UNIQUE')) {
        return { success: false, error: 'Type already exists' };
      }
      console.error('Error inserting type:', error);
      return { success: false, error: error.message };
    }
  },

  deleteType: (id) => {
    try {
      const result = db.prepare('DELETE FROM product_types WHERE id = ?').run(id);
      return { success: result.changes > 0 };
    } catch (error) {
      console.error('Error deleting type:', error);
      return { success: false, error: error.message };
    }
  },
};

Products.createTable();

module.exports = Products;
