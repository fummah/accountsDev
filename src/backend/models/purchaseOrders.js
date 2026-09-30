const db = require('./dbmgr');
const { round2 } = require('../services/documentStatus');
const DeliveryStatus = require('../services/deliveryStatus');

/**
 * purchaseOrders.js — Purchase Orders + Goods Receipts.
 *
 * ── Accounting model (Option B: OPERATIONAL RECEIPT) ────────────────────────
 * A Purchase Order is a purchasing COMMITMENT: creating / opening / sending it
 * posts NOTHING to the ledger (no AP, no Inventory Asset, no COGS).
 *
 * A Goods Receipt moves INVENTORY QUANTITY only (through the existing inventory
 * engine) and records receipt history. It posts no journal.
 *
 * The vendor BILL is the financial event: it posts Dr Inventory Asset /
 * Cr Accounts Payable (the existing Enter Bill engine). A bill line that is
 * linked to a PO line was already received, so the bill must NOT move stock a
 * second time — `getBilledPoLineIds()` tells the bill engine which lines to
 * exclude from stock receipt, preventing double-counting.
 *
 * This preserves AccuLedger's existing "Enter Bill receives + posts Inventory
 * Asset" architecture while adding POs/receipts without a new clearing account.
 *
 * Status model: a workflow status (DRAFT/OPEN/CLOSED/CANCELLED) plus two
 * COMPUTED fulfilment indicators (receivingStatus / billingStatus), so
 * "partially received" and "partially billed" never fight over one column.
 */

const PO_STATUS = { DRAFT: 'DRAFT', OPEN: 'OPEN', CLOSED: 'CLOSED', CANCELLED: 'CANCELLED' };
const RECEIVING_STATUS = { NOT_RECEIVED: 'NOT_RECEIVED', PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED', RECEIVED: 'RECEIVED' };
const BILLING_STATUS = { NOT_BILLED: 'NOT_BILLED', PARTIALLY_BILLED: 'PARTIALLY_BILLED', BILLED: 'BILLED' };

const num = (v) => Number(v) || 0;

const PurchaseOrders = {
  createTables: () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        po_number TEXT,
        vendor_id INTEGER NOT NULL,
        po_date TEXT,
        expected_date TEXT,
        ship_to TEXT,
        terms TEXT,
        memo TEXT,
        status TEXT DEFAULT 'DRAFT',
        subtotal REAL DEFAULT 0,
        tax_total REAL DEFAULT 0,
        total REAL DEFAULT 0,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS purchase_order_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_order_id INTEGER NOT NULL,
        item_id INTEGER,
        line_no INTEGER DEFAULT 1,
        description TEXT,
        item_type TEXT,
        unit TEXT,
        qty_ordered REAL DEFAULT 0,
        qty_received REAL DEFAULT 0,
        qty_billed REAL DEFAULT 0,
        unit_cost REAL DEFAULT 0,
        tax_rate REAL DEFAULT 0,
        amount REAL DEFAULT 0
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS goods_receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_number TEXT,
        purchase_order_id INTEGER NOT NULL,
        vendor_id INTEGER,
        receipt_date TEXT,
        reference TEXT,
        warehouse_id INTEGER,
        memo TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS goods_receipt_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_id INTEGER NOT NULL,
        purchase_order_line_id INTEGER,
        item_id INTEGER,
        qty_received REAL DEFAULT 0,
        unit_cost REAL DEFAULT 0
      )
    `).run();

    // Bill linkage (kept on the existing bill tables so the Bill engine stays
    // the single owner of bills). A bill line may point at the PO line it bills.
    const addExpenseLineCol = (col, ddl) => {
      try {
        const cols = new Set(db.prepare("PRAGMA table_info('expense_lines')").all().map(r => r.name));
        if (cols.size && !cols.has(col)) db.prepare(`ALTER TABLE expense_lines ADD COLUMN ${col} ${ddl}`).run();
      } catch { /* table may not exist yet */ }
    };
    addExpenseLineCol('purchase_order_id', 'INTEGER');
    addExpenseLineCol('purchase_order_line_id', 'INTEGER');

    // Destination warehouse for a PO line (used for warehouse-level On PO).
    try {
      const cols = new Set(db.prepare("PRAGMA table_info('purchase_order_lines')").all().map(r => r.name));
      if (cols.size && !cols.has('warehouse_id')) db.prepare('ALTER TABLE purchase_order_lines ADD COLUMN warehouse_id INTEGER').run();
    } catch { /* additive migration */ }

    db.prepare('CREATE INDEX IF NOT EXISTS idx_po_lines_po ON purchase_order_lines(purchase_order_id)').run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_receipt_lines_receipt ON goods_receipt_lines(receipt_id)').run();
  },

  generateNumber: () => {
    const last = db.prepare('SELECT po_number FROM purchase_orders ORDER BY id DESC LIMIT 1').get();
    if (!last || !last.po_number) return 'PO-0001';
    const n = parseInt(String(last.po_number).replace(/\D/g, ''), 10) || 0;
    return `PO-${String(n + 1).padStart(4, '0')}`;
  },

  generateReceiptNumber: () => {
    const last = db.prepare('SELECT receipt_number FROM goods_receipts ORDER BY id DESC LIMIT 1').get();
    if (!last || !last.receipt_number) return 'RCV-0001';
    const n = parseInt(String(last.receipt_number).replace(/\D/g, ''), 10) || 0;
    return `RCV-${String(n + 1).padStart(4, '0')}`;
  },

  /** Workflow status + computed receiving/billing indicators + display badge. */
  computeStatus: (po, lines) => {
    const ls = Array.isArray(lines) ? lines : (po && po.lines) || [];
    const totalOrdered = ls.reduce((s, l) => s + num(l.qty_ordered), 0);
    const totalReceived = ls.reduce((s, l) => s + num(l.qty_received), 0);
    const totalBilled = ls.reduce((s, l) => s + num(l.qty_billed), 0);

    let receivingStatus = RECEIVING_STATUS.NOT_RECEIVED;
    if (totalOrdered > 0) {
      if (totalReceived >= totalOrdered) receivingStatus = RECEIVING_STATUS.RECEIVED;
      else if (totalReceived > 0) receivingStatus = RECEIVING_STATUS.PARTIALLY_RECEIVED;
    }
    let billingStatus = BILLING_STATUS.NOT_BILLED;
    if (totalOrdered > 0) {
      if (totalBilled >= totalOrdered) billingStatus = BILLING_STATUS.BILLED;
      else if (totalBilled > 0) billingStatus = BILLING_STATUS.PARTIALLY_BILLED;
    }

    // User-friendly display badge (workflow status wins for terminal states).
    let displayStatus = po.status || PO_STATUS.DRAFT;
    if (displayStatus === PO_STATUS.OPEN) {
      if (receivingStatus === RECEIVING_STATUS.RECEIVED && billingStatus === BILLING_STATUS.BILLED) displayStatus = 'CLOSED';
      else if (billingStatus === BILLING_STATUS.BILLED) displayStatus = 'BILLED';
      else if (receivingStatus === RECEIVING_STATUS.RECEIVED) displayStatus = 'RECEIVED';
      else if (billingStatus === BILLING_STATUS.PARTIALLY_BILLED) displayStatus = 'PARTIALLY_BILLED';
      else if (receivingStatus === RECEIVING_STATUS.PARTIALLY_RECEIVED) displayStatus = 'PARTIALLY_RECEIVED';
    }
    return { status: po.status || PO_STATUS.DRAFT, receivingStatus, billingStatus, displayStatus, totalOrdered, totalReceived, totalBilled };
  },

  getAll: ({ search = '', status = '', vendorId = null } = {}) => {
    let where = '1=1';
    const params = [];
    if (search && search.trim()) { where += ' AND (po.po_number LIKE ? OR s.display_name LIKE ?)'; const q = `%${search.trim()}%`; params.push(q, q); }
    if (status && status.trim()) { where += ' AND po.status = ?'; params.push(status.trim()); }
    if (vendorId) { where += ' AND po.vendor_id = ?'; params.push(Number(vendorId)); }
    const rows = db.prepare(`
      SELECT po.*, COALESCE(s.display_name, TRIM(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,'')), '') AS vendor_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.vendor_id
      WHERE ${where}
      ORDER BY po.id DESC
    `).all(...params);
    return rows.map(po => {
      const lines = db.prepare('SELECT * FROM purchase_order_lines WHERE purchase_order_id = ? ORDER BY line_no, id').all(po.id);
      const st = PurchaseOrders.computeStatus(po, lines);
      const remainingToReceive = round2(Math.max(0, num(st.totalOrdered) - num(st.totalReceived)));
      const active = po.status !== 'DRAFT' && po.status !== 'CANCELLED' && po.status !== 'CLOSED';
      return {
        ...po,
        ...st,
        received_value: round2(lines.reduce((s, l) => s + num(l.qty_received) * num(l.unit_cost), 0)),
        billed_value: round2(lines.reduce((s, l) => s + num(l.qty_billed) * num(l.unit_cost), 0)),
        line_count: lines.length,
        remainingToReceive,
        deliveryStatus: DeliveryStatus.computeDeliveryStatus({ expectedDate: po.expected_date, remainingToReceive, active }),
      };
    });
  },

  getById: (id) => {
    const po = db.prepare(`
      SELECT po.*, COALESCE(s.display_name, TRIM(COALESCE(s.first_name,'') || ' ' || COALESCE(s.last_name,'')), '') AS vendor_name
      FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.vendor_id
      WHERE po.id = ?
    `).get(Number(id));
    if (!po) return null;
    po.lines = db.prepare('SELECT * FROM purchase_order_lines WHERE purchase_order_id = ? ORDER BY line_no, id').all(po.id);
    Object.assign(po, PurchaseOrders.computeStatus(po, po.lines));
    po.remainingToReceive = round2(Math.max(0, num(po.totalOrdered) - num(po.totalReceived)));
    po.deliveryStatus = DeliveryStatus.computeDeliveryStatus({
      expectedDate: po.expected_date,
      remainingToReceive: po.remainingToReceive,
      active: po.status !== 'DRAFT' && po.status !== 'CANCELLED' && po.status !== 'CLOSED',
    });
    po.receipts = db.prepare(`
      SELECT r.*, (SELECT COUNT(*) FROM goods_receipt_lines rl WHERE rl.receipt_id = r.id) AS line_count
      FROM goods_receipts r WHERE r.purchase_order_id = ? ORDER BY r.id DESC
    `).all(po.id);
    // Linked bills (via expense_lines.purchase_order_id).
    // Linked bills (via expense_lines.purchase_order_id), enriched with the
    // SAME bill position the Pay Bills screen uses (cash paid, vendor credits,
    // balance, automatic status). The PO itself is never paid — the payable
    // belongs to the bill.
    let bills = [];
    try {
      bills = db.prepare(`
        SELECT DISTINCT e.id, e.ref_no, e.payment_date AS date, e.approval_status AS status
        FROM expense_lines el JOIN expenses e ON e.id = el.expense_id
        WHERE el.purchase_order_id = ?
        ORDER BY e.id DESC
      `).all(po.id);
    } catch { bills = []; }

    const BillPayments = (() => { try { return require('./billPayments'); } catch { return null; } })();
    po.bills = bills.map(b => {
      const pos = (BillPayments && BillPayments.computeBillPosition(b.id)) || {};
      let cash = 0; let credits = 0;
      try { cash = round2(db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM bill_payments WHERE expense_id = ? AND status = 'Active'").get(b.id).t); } catch { cash = 0; }
      try { credits = round2(db.prepare('SELECT COALESCE(SUM(amount),0) AS t FROM credit_applications WHERE expense_id = ?').get(b.id).t); } catch { credits = 0; }
      return {
        id: b.id,
        ref_no: b.ref_no,
        date: b.date,
        amount: round2(pos.total != null ? pos.total : 0),
        paid: cash,
        credits,
        balance: round2(pos.remaining != null ? pos.remaining : 0),
        status: pos.status || b.status,
      };
    });

    const billIds = po.bills.map(b => Number(b.id));
    const ph = billIds.map(() => '?').join(',');

    // Payments recorded against those bills (PO → Bill → Payment), never a
    // payment on the PO itself.
    po.payments = [];
    if (billIds.length) {
      try {
        po.payments = db.prepare(`
          SELECT bp.id, bp.amount, bp.payment_date AS date, bp.status,
                 bp.expense_id AS billId, bp.transaction_id AS checkId,
                 e.ref_no AS billRef,
                 t.reference AS checkNumber, t.accountId AS bankAccountId,
                 ca.name AS bankName
          FROM bill_payments bp
          LEFT JOIN expenses e ON e.id = bp.expense_id
          LEFT JOIN transactions t ON t.id = bp.transaction_id
          LEFT JOIN chart_of_accounts ca ON ca.id = t.accountId
          WHERE bp.expense_id IN (${ph})
          ORDER BY bp.id DESC
        `).all(...billIds);
      } catch { po.payments = []; }
    }

    // Vendor credits applied to those bills.
    po.credits = [];
    if (billIds.length) {
      try {
        po.credits = db.prepare(`
          SELECT ca.id, ca.credit_id AS creditNoteId, ca.expense_id AS billId, ca.amount, ca.applied_date AS date,
                 vc.reference, e.ref_no AS billRef
          FROM credit_applications ca
          LEFT JOIN vendor_credits vc ON vc.id = ca.credit_id
          LEFT JOIN expenses e ON e.id = ca.expense_id
          WHERE ca.expense_id IN (${ph})
          ORDER BY ca.id DESC
        `).all(...billIds);
      } catch { po.credits = []; }
    }

    // Separated fulfillment (quantities) vs financial (money) summaries so the
    // UI never labels a bare "Remaining".
    const orderedQty = round2(po.lines.reduce((s, l) => s + num(l.qty_ordered), 0));
    const receivedQty = round2(po.lines.reduce((s, l) => s + num(l.qty_received), 0));
    const billedQty = round2(po.lines.reduce((s, l) => s + num(l.qty_billed), 0));
    const poTotal = round2(po.lines.reduce((s, l) => s + num(l.amount), 0));
    const billedAmount = round2(po.bills.reduce((s, b) => s + num(b.amount), 0));
    const creditsApplied = round2(po.bills.reduce((s, b) => s + num(b.credits), 0));
    const paidAmount = round2(po.bills.reduce((s, b) => s + num(b.paid), 0));
    const outstandingBills = round2(po.bills.reduce((s, b) => s + Math.max(0, num(b.balance)), 0));
    po.summary = {
      orderedQty,
      receivedQty,
      billedQty,
      remainingToReceive: round2(Math.max(0, orderedQty - receivedQty)),
      remainingToBillQty: round2(Math.max(0, orderedQty - billedQty)),
      poTotal,
      billedAmount,
      creditsApplied,
      paidAmount,
      outstandingBills,
      remainingToBill: round2(Math.max(0, poTotal - billedAmount)),
    };
    return po;
  },

  getOpenForVendor: (vendorId) => {
    if (!vendorId) return [];
    const rows = db.prepare(`
      SELECT po.* FROM purchase_orders po
      WHERE po.vendor_id = ? AND po.status = 'OPEN'
      ORDER BY po.id DESC
    `).all(Number(vendorId));
    return rows.map(po => {
      const lines = db.prepare('SELECT * FROM purchase_order_lines WHERE purchase_order_id = ? ORDER BY line_no, id').all(po.id);
      return { ...po, ...PurchaseOrders.computeStatus(po, lines), lines };
    });
  },

  /** Create or update a PO (header + lines) inside one transaction. */
  save: (data = {}, ctx = {}) => {
    const vendorId = Number(data.vendorId);
    if (!vendorId) return { success: false, error: 'Vendor is required.' };
    const vendor = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(vendorId);
    if (!vendor) return { success: false, error: 'Vendor not found.' };

    const lines = Array.isArray(data.lines) ? data.lines.filter(l => l && (l.itemId != null || num(l.qtyOrdered) > 0 || num(l.amount) > 0)) : [];
    if (!lines.length) return { success: false, error: 'Add at least one line item.' };

    // Destination warehouse for lines that do not specify one (warehouse-level
    // On PO). Falls back to the company default warehouse.
    let defaultWarehouseId = null;
    try {
      const Warehouses = require('./warehouses');
      const w = Warehouses.getOrCreateDefault();
      defaultWarehouseId = w && w.id != null ? Number(w.id) : null;
    } catch { defaultWarehouseId = null; }

    // Snapshots: the item's current defaults are stored ON the PO line so later
    // Item master edits never rewrite an existing PO.
    const prepared = lines.map((l, i) => {
      const qty = num(l.qtyOrdered);
      const cost = num(l.unitCost);
      const taxRate = num(l.taxRate);
      const amount = l.amount != null ? num(l.amount) : round2(qty * cost);
      return {
        line_no: i + 1,
        item_id: l.itemId != null ? Number(l.itemId) : null,
        warehouse_id: l.warehouseId != null ? Number(l.warehouseId) : defaultWarehouseId,
        description: l.description || '',
        item_type: l.itemType || '',
        unit: l.unit || '',
        qty_ordered: qty,
        unit_cost: cost,
        tax_rate: taxRate,
        amount: round2(amount),
      };
    });
    const subtotal = round2(prepared.reduce((s, l) => s + l.amount, 0));
    const taxTotal = round2(prepared.reduce((s, l) => s + l.amount * (num(l.tax_rate) / 100), 0));
    const total = round2(subtotal + taxTotal);

    const id = data.id != null && data.id !== '' ? Number(data.id) : null;
    const existing = id ? db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id) : null;
    if (id && !existing) return { success: false, error: 'Purchase Order not found.' };
    if (existing && (existing.status === PO_STATUS.CANCELLED || existing.status === PO_STATUS.CLOSED)) {
      return { success: false, error: `A ${existing.status} Purchase Order cannot be edited.` };
    }

    const status = existing ? existing.status : (data.status === PO_STATUS.OPEN ? PO_STATUS.OPEN : PO_STATUS.DRAFT);

    const tx = db.transaction(() => {
      let poId = id;
      if (id) {
        db.prepare(`UPDATE purchase_orders SET vendor_id=?, po_date=?, expected_date=?, ship_to=?, terms=?, memo=?, subtotal=?, tax_total=?, total=?, updated_at=datetime('now') WHERE id=?`)
          .run(vendorId, data.poDate || null, data.expectedDate || null, data.shipTo || null, data.terms || null, data.memo || null, subtotal, taxTotal, total, id);
        db.prepare('DELETE FROM purchase_order_lines WHERE purchase_order_id = ?').run(id);
      } else {
        const res = db.prepare(`INSERT INTO purchase_orders (po_number, vendor_id, po_date, expected_date, ship_to, terms, memo, status, subtotal, tax_total, total, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(data.poNumber || PurchaseOrders.generateNumber(), vendorId, data.poDate || null, data.expectedDate || null, data.shipTo || null, data.terms || null, data.memo || null, status, subtotal, taxTotal, total, ctx.userId || 'system');
        poId = res.lastInsertRowid;
      }
      const insLine = db.prepare(`INSERT INTO purchase_order_lines (purchase_order_id, item_id, warehouse_id, line_no, description, item_type, unit, qty_ordered, qty_received, qty_billed, unit_cost, tax_rate, amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const l of prepared) insLine.run(poId, l.item_id, l.warehouse_id, l.line_no, l.description, l.item_type, l.unit, l.qty_ordered, 0, 0, l.unit_cost, l.tax_rate, l.amount);
      return poId;
    });

    try {
      const poId = tx();
      return { success: true, id: poId };
    } catch (e) {
      console.error('PO save failed:', e);
      return { success: false, error: e.message };
    }
  },

  setStatus: (id, status) => {
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(Number(id));
    if (!po) return { success: false, error: 'Purchase Order not found.' };
    if (po.status === PO_STATUS.CANCELLED) return { success: false, error: 'This Purchase Order is cancelled.' };
    const allowed = [PO_STATUS.DRAFT, PO_STATUS.OPEN, PO_STATUS.CLOSED, PO_STATUS.CANCELLED];
    if (!allowed.includes(status)) return { success: false, error: 'Invalid status.' };
    db.prepare("UPDATE purchase_orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, Number(id));
    return { success: true };
  },

  /**
   * Receive items against a PO. Creates a goods receipt, records a stock
   * movement for each INVENTORY_PART line (via the inventory engine) and bumps
   * qty_received. Re-checks remaining quantities INSIDE the transaction so two
   * concurrent receipts can never over-receive.
   */
  receive: (poId, payload = {}, ctx = {}) => {
    const id = Number(poId);
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
    if (!po) return { success: false, error: 'Purchase Order not found.' };
    if (po.status === PO_STATUS.CANCELLED) return { success: false, error: 'A cancelled Purchase Order cannot be received.' };
    if (po.status === PO_STATUS.CLOSED) return { success: false, error: 'A closed Purchase Order cannot be received.' };

    const lines = db.prepare('SELECT * FROM purchase_order_lines WHERE purchase_order_id = ? ORDER BY line_no, id').all(id);
    const byId = new Map(lines.map(l => [Number(l.id), l]));
    const requested = Array.isArray(payload.lines) ? payload.lines : [];
    const toReceive = [];
    for (const r of requested) {
      const line = byId.get(Number(r.purchaseOrderLineId));
      const qty = num(r.qtyReceived);
      if (!line || qty <= 0) continue;
      const remaining = num(line.qty_ordered) - num(line.qty_received);
      if (qty > remaining + 1e-9 && !payload.allowOverReceipt) {
        return { success: false, error: `Cannot receive ${qty} of "${line.description}": only ${remaining} remaining.` };
      }
      toReceive.push({ line, qty });
    }
    if (!toReceive.length) return { success: false, error: 'Enter a quantity to receive.' };

    const Warehouses = require('./warehouses');
    const warehouseId = payload.warehouseId != null ? Number(payload.warehouseId) : Warehouses.getOrCreateDefault().id;

    const tx = db.transaction(() => {
      const receiptNumber = PurchaseOrders.generateReceiptNumber();
      const rres = db.prepare(`INSERT INTO goods_receipts (receipt_number, purchase_order_id, vendor_id, receipt_date, reference, warehouse_id, memo, created_by) VALUES (?,?,?,?,?,?,?,?)`)
        .run(receiptNumber, id, po.vendor_id, payload.receiptDate || new Date().toISOString().slice(0, 10), payload.reference || null, warehouseId, payload.memo || null, ctx.userId || 'system');
      const receiptId = rres.lastInsertRowid;

      const insRl = db.prepare('INSERT INTO goods_receipt_lines (receipt_id, purchase_order_line_id, item_id, qty_received, unit_cost) VALUES (?,?,?,?,?)');
      const updLine = db.prepare('UPDATE purchase_order_lines SET qty_received = qty_received + ? WHERE id = ?');

      for (const { line, qty } of toReceive) {
        // Re-check remaining inside the transaction (concurrency guard).
        const fresh = db.prepare('SELECT qty_ordered, qty_received FROM purchase_order_lines WHERE id = ?').get(line.id);
        const remaining = num(fresh.qty_ordered) - num(fresh.qty_received);
        if (qty > remaining + 1e-9 && !payload.allowOverReceipt) {
          throw new Error(`Cannot receive ${qty} of "${line.description}": only ${remaining} remaining.`);
        }
        insRl.run(receiptId, line.id, line.item_id, qty, num(line.unit_cost));
        updLine.run(qty, line.id);

        // Inventory movement — INVENTORY_PART only. Non-inventory / service lines
        // are received for history but never move stock.
        const Classification = require('../services/productClassification');
        if (line.item_id != null && Classification.tracksInventory(line.item_type)) {
          const Inventory = require('./inventory');
          const item = Inventory.resolveInventoryItem(Number(line.item_id));
          if (item) {
            const res = Inventory.receiveStock(item.id, warehouseId, qty, num(line.unit_cost), {
              sourceType: 'receipt', sourceId: receiptId, sourceLineId: line.id, reason: 'PO RECEIPT',
            });
            if (res && res.success === false) throw new Error(res.error || 'Stock receipt failed');
          }
        }
      }
      return { receiptId, receiptNumber };
    });

    try {
      const out = tx();
      return { success: true, ...out };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  /** Everything a Vendor Activity view needs, in one call. */
  getVendorActivity: (vendorId) => {
    const vid = Number(vendorId);
    const empty = { purchaseOrders: [], receipts: [], bills: [], payments: [], credits: [] };
    if (!vid) return empty;
    const out = { ...empty };
    try {
      out.purchaseOrders = db.prepare('SELECT id, po_number, po_date, total, status FROM purchase_orders WHERE vendor_id = ? ORDER BY id DESC').all(vid);
    } catch { /* table may not exist */ }
    try {
      out.receipts = db.prepare('SELECT id, receipt_number, receipt_date, reference, purchase_order_id FROM goods_receipts WHERE vendor_id = ? ORDER BY id DESC').all(vid);
    } catch { /* table may not exist */ }
    try {
      out.bills = db.prepare(`
        SELECT e.id, e.ref_no, e.payment_date AS date, e.approval_status AS status,
               (SELECT COALESCE(SUM(el.amount),0) FROM expense_lines el WHERE el.expense_id = e.id) AS amount
        FROM expenses e WHERE e.payee = ? AND e.category IN ('bill','supplier')
        ORDER BY e.id DESC
      `).all(vid);
    } catch { /* table may not exist */ }
    try {
      out.payments = db.prepare(`
        SELECT bp.id, bp.amount, bp.payment_date AS date, bp.status, bp.expense_id, e.ref_no
        FROM bill_payments bp LEFT JOIN expenses e ON e.id = bp.expense_id
        WHERE bp.supplier_id = ? ORDER BY bp.id DESC
      `).all(vid);
    } catch { /* table may not exist */ }
    try {
      out.credits = db.prepare('SELECT id, date, amount, remaining_amount, reference, status FROM vendor_credits WHERE supplier_id = ? ORDER BY id DESC').all(vid);
    } catch { /* table may not exist */ }
    return out;
  },

  getReceipt: (receiptId) => {
    const r = db.prepare('SELECT * FROM goods_receipts WHERE id = ?').get(Number(receiptId));
    if (!r) return null;
    r.lines = db.prepare(`
      SELECT rl.*, pol.description, pol.unit, pol.item_type, pol.unit_cost AS po_unit_cost
      FROM goods_receipt_lines rl
      LEFT JOIN purchase_order_lines pol ON pol.id = rl.purchase_order_line_id
      WHERE rl.receipt_id = ? ORDER BY rl.id
    `).all(r.id);
    return r;
  },

  /** PO ids of lines already billed — used by the Bill engine to avoid
   *  receiving the same stock twice. */
  getBilledPoLineIds: (expenseId) => {
    try {
      const rows = db.prepare('SELECT purchase_order_line_id FROM expense_lines WHERE expense_id = ? AND purchase_order_line_id IS NOT NULL').all(Number(expenseId));
      return rows.map(r => Number(r.purchase_order_line_id));
    } catch { return []; }
  },

  /** Record how much of each PO line a bill consumed (called by the Bill engine). */
  applyBill: (expenseId, allocations = []) => {
    const upd = db.prepare('UPDATE purchase_order_lines SET qty_billed = qty_billed + ? WHERE id = ?');
    const tx = db.transaction(() => {
      for (const a of allocations) {
        const lineId = Number(a.purchaseOrderLineId);
        const qty = num(a.qty);
        if (!lineId || qty <= 0) continue;
        const line = db.prepare('SELECT id FROM purchase_order_lines WHERE id = ?').get(lineId);
        if (line) upd.run(qty, lineId);
      }
    });
    try { tx(); return { success: true }; } catch (e) { return { success: false, error: e.message }; }
  },

  /**
   * Recompute qty_billed for the given PO lines from ALL posting bills. Robust
   * against bill edits/deletes: it always derives the total, so it can never
   * double-count. Draft/Void/Cancelled bills are excluded.
   */
  syncBilled: (lineIds = []) => {
    const upd = db.prepare(`
      UPDATE purchase_order_lines
      SET qty_billed = COALESCE((
        SELECT SUM(el.quantity)
        FROM expense_lines el JOIN expenses e ON e.id = el.expense_id
        WHERE el.purchase_order_line_id = purchase_order_lines.id
          AND LOWER(COALESCE(e.approval_status, '')) NOT IN ('draft','void','voided','cancelled','canceled')
      ), 0)
      WHERE id = ?
    `);
    const tx = db.transaction(() => { for (const id of lineIds) upd.run(Number(id)); });
    try { tx(); return { success: true }; } catch (e) { return { success: false, error: e.message }; }
  },
};

PurchaseOrders.createTables();

PurchaseOrders.PO_STATUS = PO_STATUS;
PurchaseOrders.RECEIVING_STATUS = RECEIVING_STATUS;
PurchaseOrders.BILLING_STATUS = BILLING_STATUS;

module.exports = PurchaseOrders;
