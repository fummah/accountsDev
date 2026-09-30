/**
 * services/inventoryAlertsService.js — Simple Inventory Alerts.
 *
 * A read-only OPERATIONAL EXCEPTION system. It surfaces five conditions and
 * owns NO business logic of its own — every condition is delegated to the
 * central service that already defines it:
 *
 *   LOW_STOCK             services/inventoryStockStatus  (On Hand > 0 AND On Hand <= Reorder Point)
 *   OUT_OF_STOCK          services/inventoryStockStatus  (On Hand <= 0)
 *   PO_OVERDUE            services/expectedDeliveryService + services/deliveryStatus
 *   PARTIAL_RECEIPT       models/purchaseOrders computeStatus (receivingStatus)
 *   BILL_RECEIPT_MISMATCH purchase_order_lines.qty_billed vs qty_received
 *                         (the same cumulative three-way match Enter Bill uses)
 *
 * Alerts are DERIVED on every call — nothing is stored, so an alert can never
 * drift from the condition and resolves automatically the moment the underlying
 * data is corrected. There are no manual "resolved" flags.
 *
 * Overlap rules:
 *   - Low Stock and Out of Stock are MUTUALLY EXCLUSIVE (the central status
 *     already returns exactly one), so an item is never double-counted.
 *   - PO Overdue and Partial Receipt MAY overlap (a PO that is partially
 *     received and past its expected date legitimately appears in both).
 *
 * Performance: batch queries only — no per-item / per-PO / per-bill N+1.
 *
 * Company / tenant: AccuLedger is one company per database file and `dbmgr`
 * points at the active company, so every query is inherently company-scoped and
 * can never leak another company's items, POs, receipts or bills.
 */

const db = require('../models/dbmgr');
const ItemTypes = require('./itemTypes');
const ItemStatus = require('./inventoryStockStatus');
const ExpectedDelivery = require('./expectedDeliveryService');

const TOLERANCE = 0.005;
const NON_BILL_STATES = "'draft','void','voided','cancelled','canceled'";
const EXCLUDED_PO_STATUSES = ['DRAFT', 'CANCELLED'];

const TYPE = {
  LOW_STOCK: 'LOW_STOCK',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  PO_OVERDUE: 'PO_OVERDUE',
  PARTIAL_RECEIPT: 'PARTIAL_RECEIPT',
  BILL_RECEIPT_MISMATCH: 'BILL_RECEIPT_MISMATCH',
};

const SEVERITY = {
  LOW_STOCK: 'warning',
  OUT_OF_STOCK: 'critical',
  PO_OVERDUE: 'warning',
  PARTIAL_RECEIPT: 'info',
  BILL_RECEIPT_MISMATCH: 'critical',
};

const CATEGORY = {
  LOW_STOCK: 'INVENTORY',
  OUT_OF_STOCK: 'INVENTORY',
  PO_OVERDUE: 'PURCHASING',
  PARTIAL_RECEIPT: 'PURCHASING',
  BILL_RECEIPT_MISMATCH: 'BILLING',
};

const num = (v) => Number(v) || 0;
const vendorName = (r) => r.display_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || r.company_name || '';
const itemLabel = (r) => r.item_name || r.description || (r.sku ? r.sku : `Item #${r.item_id}`);

/* ── Alert 1 & 2 — Low Stock / Out of Stock ─────────────────────────────── */

/** Active, inventory-tracked items with their central stock status (batch). */
const loadTrackedStatus = () => {
  const rows = db.prepare(
    "SELECT id, name, sku, type, reorder_point FROM products WHERE (is_active IS NULL OR is_active = 1)"
  ).all().filter((r) => ItemTypes.tracksInventory(r.type));
  if (!rows.length) return [];
  const status = ItemStatus.getStatusForItems(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, ...(status[Number(r.id)] || {}) }));
};

const stockAlerts = () => {
  const out = [];
  for (const r of loadTrackedStatus()) {
    const pid = Number(r.id);
    const onHand = num(r.onHand);
    const reorderPoint = r.reorderPoint == null ? null : num(r.reorderPoint);
    const onPo = num(r.onPurchaseOrder);
    const expected = num(r.expected);
    const base = {
      productId: pid, name: r.name || r.sku || `Item #${pid}`, sku: r.sku || '',
      onHand, reorderPoint, onPo, expected, stockStatus: r.status,
    };
    if (r.status === ItemStatus.STATUS.OUT_OF_STOCK) {
      out.push({
        id: `OUT_OF_STOCK:item:${pid}`,
        type: TYPE.OUT_OF_STOCK, severity: SEVERITY.OUT_OF_STOCK, category: CATEGORY.OUT_OF_STOCK,
        entityType: 'ITEM', entityId: pid,
        title: 'Out of Stock',
        message: `${base.name} is out of stock (on hand ${onHand}).`,
        date: null,
        status: onPo > 0 ? `Out of Stock — ${onPo} On PO` : (onHand < 0 ? 'Negative Stock' : 'Out of Stock'),
        action: { label: 'View Item', route: `/main/inventory/items?item=${pid}` },
        meta: base,
      });
    } else if (r.status === ItemStatus.STATUS.LOW_STOCK) {
      out.push({
        id: `LOW_STOCK:item:${pid}`,
        type: TYPE.LOW_STOCK, severity: SEVERITY.LOW_STOCK, category: CATEGORY.LOW_STOCK,
        entityType: 'ITEM', entityId: pid,
        title: 'Low Stock',
        message: `${base.name} has ${onHand} unit(s) on hand; reorder point is ${reorderPoint}.`,
        date: null,
        status: onPo > 0 ? 'Low Stock — Stock On Order' : 'Low Stock',
        action: { label: 'View Item', route: `/main/inventory/items?item=${pid}` },
        meta: base,
      });
    }
  }
  return out;
};

/* ── Alerts 3 & 4 — PO Overdue / Partial Receipt ─────────────────────────── */

/** purchase_order_id -> last receipt date (one aggregate query). */
const lastReceiptMap = () => {
  const map = new Map();
  try {
    for (const r of db.prepare(
      'SELECT purchase_order_id AS po_id, MAX(receipt_date) AS last_receipt FROM goods_receipts WHERE purchase_order_id IS NOT NULL GROUP BY purchase_order_id'
    ).all()) {
      map.set(Number(r.po_id), r.last_receipt || null);
    }
  } catch { /* goods_receipts may not exist yet */ }
  return map;
};

const poAlerts = () => {
  const overdue = [];
  const partial = [];
  const lastReceipts = lastReceiptMap();

  for (const p of ExpectedDelivery.loadDeliveries()) {
    if (!p.active) continue;
    const common = {
      poId: p.poId, poNumber: p.poNumber, vendorId: p.vendorId, vendorName: p.vendorName,
      expectedDate: p.expectedDate, orderedQty: p.orderedQty, receivedQty: p.receivedQty,
      remainingQty: p.remainingQty, poStatus: p.poStatus, lastReceipt: lastReceipts.get(p.poId) || null,
    };
    if (p.deliveryStatus === 'OVERDUE') {
      overdue.push({
        id: `PO_OVERDUE:po:${p.poId}`,
        type: TYPE.PO_OVERDUE, severity: SEVERITY.PO_OVERDUE, category: CATEGORY.PO_OVERDUE,
        entityType: 'PURCHASE_ORDER', entityId: p.poId,
        title: 'PO Overdue',
        message: `${p.poNumber} was expected ${p.expectedDate} and ${p.remainingQty} unit(s) are still outstanding.`,
        date: p.expectedDate,
        status: 'Overdue',
        action: { label: 'View PO', route: `/main/vendors/purchasing/purchase-orders?po=${p.poId}` },
        meta: { ...common, overdue: true },
      });
    }
    if (p.receivingStatus === 'PARTIALLY_RECEIVED') {
      const isOverdue = p.deliveryStatus === 'OVERDUE';
      partial.push({
        id: `PARTIAL_RECEIPT:po:${p.poId}`,
        type: TYPE.PARTIAL_RECEIPT, severity: SEVERITY.PARTIAL_RECEIPT, category: CATEGORY.PARTIAL_RECEIPT,
        entityType: 'PURCHASE_ORDER', entityId: p.poId,
        title: 'Partial Receipt',
        message: `${p.poNumber}: ${p.receivedQty} of ${p.orderedQty} unit(s) received; ${p.remainingQty} remaining.`,
        date: common.lastReceipt || p.poDate || p.expectedDate || null,
        status: isOverdue ? 'Partially Received — Overdue' : 'Partially Received',
        action: { label: 'View PO', route: `/main/vendors/purchasing/purchase-orders?po=${p.poId}` },
        meta: { ...common, overdue: isOverdue },
      });
    }
  }
  return { overdue, partial };
};

/* ── Alert 5 — Bill Qty > Received Qty (cumulative three-way match) ───────── */

const billMismatchAlerts = () => {
  const ph = EXCLUDED_PO_STATUSES.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT pol.id AS po_line_id, pol.purchase_order_id AS po_id, pol.item_id, pol.description,
           pol.qty_ordered, pol.qty_received, pol.qty_billed,
           po.po_number, po.status AS po_status, po.vendor_id,
           s.display_name, s.first_name, s.last_name, s.company_name,
           p.name AS item_name, p.sku
    FROM purchase_order_lines pol
    JOIN purchase_orders po ON po.id = pol.purchase_order_id
    LEFT JOIN suppliers s ON s.id = po.vendor_id
    LEFT JOIN products p ON p.id = pol.item_id
    WHERE po.status NOT IN (${ph})
      AND pol.qty_billed > pol.qty_received + ?
    ORDER BY po.id DESC, pol.id ASC
  `).all(...EXCLUDED_PO_STATUSES, TOLERANCE);

  if (!rows.length) return [];

  // Latest POSTING bill per PO line — ONE query, no N+1.
  const lineIds = [...new Set(rows.map((r) => Number(r.po_line_id)))];
  const ph2 = lineIds.map(() => '?').join(',');
  const billByLine = new Map();
  for (const b of db.prepare(`
    SELECT el.purchase_order_line_id AS line_id, e.id AS bill_id, e.ref_no, e.payment_date
    FROM expense_lines el
    JOIN expenses e ON e.id = el.expense_id
    WHERE el.purchase_order_line_id IN (${ph2})
      AND LOWER(COALESCE(e.approval_status, '')) NOT IN (${NON_BILL_STATES})
    ORDER BY e.id DESC
  `).all(...lineIds)) {
    const key = Number(b.line_id);
    if (!billByLine.has(key)) billByLine.set(key, b); // first = newest (ORDER BY id DESC)
  }

  return rows.map((r) => {
    const billed = num(r.qty_billed);
    const received = num(r.qty_received);
    const difference = Math.round((billed - received) * 100) / 100;
    const bill = billByLine.get(Number(r.po_line_id));
    const label = itemLabel(r);
    return {
      id: `BILL_RECEIPT_MISMATCH:line:${r.po_line_id}`,
      type: TYPE.BILL_RECEIPT_MISMATCH, severity: SEVERITY.BILL_RECEIPT_MISMATCH, category: CATEGORY.BILL_RECEIPT_MISMATCH,
      entityType: 'BILL', entityId: bill ? Number(bill.bill_id) : null,
      title: 'Bill Qty > Received Qty',
      message: `${label}: billed ${billed} but only ${received} received (exceeds by ${difference}).`,
      date: bill ? (bill.payment_date || null) : null,
      status: 'Review',
      action: bill
        ? { label: 'View Bill', route: `/main/vendors/bills/edit/${bill.bill_id}` }
        : { label: 'View PO', route: `/main/vendors/purchasing/purchase-orders?po=${r.po_id}` },
      meta: {
        poLineId: Number(r.po_line_id), poId: Number(r.po_id), poNumber: r.po_number || `PO-${r.po_id}`,
        vendorId: r.vendor_id != null ? Number(r.vendor_id) : null, vendorName: vendorName(r),
        productId: r.item_id != null ? Number(r.item_id) : null, itemName: label, sku: r.sku || '',
        ordered: num(r.qty_ordered), received, billed, difference,
        billId: bill ? Number(bill.bill_id) : null, billNumber: bill ? (bill.ref_no || `BILL-${bill.bill_id}`) : null,
        billDate: bill ? (bill.payment_date || null) : null,
      },
    };
  });
};

/* ── Public API ──────────────────────────────────────────────────────────── */

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };

const emptySummary = () => ({ lowStock: 0, outOfStock: 0, poOverdue: 0, partialReceipt: 0, billReceiptMismatch: 0, total: 0 });

const summarize = (alerts) => {
  const s = emptySummary();
  for (const a of alerts) {
    if (a.type === TYPE.LOW_STOCK) s.lowStock++;
    else if (a.type === TYPE.OUT_OF_STOCK) s.outOfStock++;
    else if (a.type === TYPE.PO_OVERDUE) s.poOverdue++;
    else if (a.type === TYPE.PARTIAL_RECEIPT) s.partialReceipt++;
    else if (a.type === TYPE.BILL_RECEIPT_MISMATCH) s.billReceiptMismatch++;
  }
  s.total = alerts.length;
  return s;
};

const applyFilters = (alerts, f = {}) => {
  let out = alerts;
  const type = String(f.type || '').trim().toUpperCase();
  const category = String(f.category || '').trim().toUpperCase();
  const severity = String(f.severity || '').trim().toLowerCase();
  if (type) out = out.filter((a) => a.type === type);
  if (category) out = out.filter((a) => a.category === category);
  if (severity) out = out.filter((a) => a.severity === severity);
  if (f.search) {
    const q = String(f.search).toLowerCase();
    out = out.filter((a) => `${a.title} ${a.message} ${a.meta?.name || ''} ${a.meta?.sku || ''} ${a.meta?.poNumber || ''} ${a.meta?.billNumber || ''} ${a.meta?.vendorName || ''}`.toLowerCase().includes(q));
  }
  return out;
};

const sortAlerts = (alerts) => [...alerts].sort((a, b) =>
  (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  || String(a.type).localeCompare(String(b.type))
  || String(a.meta?.name || a.meta?.poNumber || a.meta?.billNumber || '').localeCompare(String(b.meta?.name || b.meta?.poNumber || b.meta?.billNumber || '')));

/** All current alerts for the active company. `{ summary, alerts, generatedAt }`. */
const getAlerts = (filters = {}) => {
  const { overdue, partial } = poAlerts();
  const alerts = sortAlerts([
    ...stockAlerts(),
    ...overdue,
    ...partial,
    ...billMismatchAlerts(),
  ]);
  return {
    summary: summarize(alerts),
    alerts: applyFilters(alerts, filters),
    generatedAt: new Date().toISOString(),
  };
};

/** Lightweight counts for dashboards (same builders, no list filtering). */
const getAlertSummary = () => summarize([
  ...stockAlerts(),
  ...(() => { const { overdue, partial } = poAlerts(); return [...overdue, ...partial]; })(),
  ...billMismatchAlerts(),
]);

module.exports = { TYPE, SEVERITY, CATEGORY, getAlerts, getAlertSummary };
