/**
 * services/inventoryMovementReportService.js — the Inventory Movement Report.
 *
 * A REPORT over the existing inventory ledger (`stock_movements`). It does NOT
 * own or duplicate any movement logic — it reads the same append-only ledger
 * that Item Inventory History reads, and computes the per-item running balance
 * from the same records in the same (movedAt, id) order.
 *
 *   opening balance (per item) = SUM(quantityChange) BEFORE dateFrom
 *   running balance            = opening + cumulative quantityChange
 *   balance is PER ITEM (and per warehouse when a warehouse filter is applied)
 *
 * Filters: date range, item, transaction type, reference, warehouse, party.
 * Rows are returned already balanced; pagination is applied AFTER balancing so
 * the balance never resets between pages.
 *
 * Company / tenant: one company per database; `dbmgr` targets the active file.
 */

const db = require('../models/dbmgr');

const TX = {
  BEGINNING: 'BEGINNING',
  RECEIPT: 'RECEIPT',
  BILL: 'BILL',
  INVOICE: 'INVOICE',
  ADJUSTMENT: 'ADJUSTMENT',
  TRANSFER: 'TRANSFER',
  MOVEMENT: 'MOVEMENT',
};

const TX_LABEL = {
  BEGINNING: 'Beginning Inventory',
  RECEIPT: 'Purchase Receipt',
  BILL: 'Bill Receipt',
  INVOICE: 'Invoice',
  ADJUSTMENT: 'Inventory Adjustment',
  TRANSFER: 'Transfer',
  MOVEMENT: 'Movement',
};

const movementType = (r) => {
  const reason = String(r.reason || '').toUpperCase();
  const refType = String(r.refType || '').toUpperCase();
  if (reason.includes('BEGINNING')) return TX.BEGINNING;
  if (r.sourceType === 'receipt') return TX.RECEIPT;
  if (r.sourceType === 'bill') return TX.BILL;
  if (r.sourceType === 'invoice') return TX.INVOICE;
  if (refType.includes('TRANSFER') || reason.includes('TRANSFER')) return TX.TRANSFER;
  if (refType.includes('ADJUST') || reason.includes('ADJUST')) return TX.ADJUSTMENT;
  return TX.MOVEMENT;
};

const referenceOf = (r) => {
  if (r.sourceType === 'receipt') return r.receipt_number || (r.sourceId != null ? `RCV-${r.sourceId}` : (r.refType || ''));
  if (r.sourceType === 'bill') return r.bill_ref || (r.sourceId != null ? `BILL-${r.sourceId}` : '');
  if (r.sourceType === 'invoice') return r.invoice_number || (r.sourceId != null ? `INV-${r.sourceId}` : '');
  if (r.refType === 'ADJUSTMENT' && r.refId != null) return `ADJ-${r.refId}`;
  return r.refType || (r.reason || '');
};

const ENRICH_SQL = `
  SELECT m.id, m.itemId, m.warehouseId, m.quantityChange, m.reason, m.refType, m.refId,
         m.sourceType, m.sourceId, m.movedAt,
         p.id AS product_id, p.name AS item_name, p.sku,
         w.name AS warehouse_name,
         e.ref_no AS bill_ref, e.payee AS bill_vendor,
         i.number AS invoice_number, i.customer AS invoice_customer,
         gr.receipt_number, gr.vendor_id AS receipt_vendor
  FROM stock_movements m
  LEFT JOIN products p ON p.item_id = m.itemId
  LEFT JOIN warehouses w ON w.id = m.warehouseId
  LEFT JOIN expenses e ON m.sourceType = 'bill' AND e.id = m.sourceId
  LEFT JOIN invoices i ON m.sourceType = 'invoice' AND i.id = m.sourceId
  LEFT JOIN goods_receipts gr ON m.sourceType = 'receipt' AND gr.id = m.sourceId
`;

const getInventoryMovementReport = (opts = {}) => {
  const dateFrom = opts.dateFrom || null;
  const dateTo = opts.dateTo || null;
  const warehouseId = opts.warehouseId != null && opts.warehouseId !== '' ? Number(opts.warehouseId) : null;
  const transactionType = String(opts.transactionType || '').trim().toUpperCase();
  const reference = String(opts.reference || '').trim().toLowerCase();
  const partyId = opts.partyId != null && opts.partyId !== '' ? Number(opts.partyId) : null;
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.max(1, Math.min(1000, Number(opts.pageSize) || 50));

  // Item filter: the UI passes products.id; the ledger keys on items.id.
  let filterItemId = null;
  if (opts.itemId != null && opts.itemId !== '') {
    const p = db.prepare('SELECT item_id FROM products WHERE id = ?').get(Number(opts.itemId));
    filterItemId = p && p.item_id != null ? Number(p.item_id) : -1; // -1 → no match
  }

  const scopeWhere = [];
  const scopeParams = [];
  if (filterItemId != null) { scopeWhere.push('m.itemId = ?'); scopeParams.push(filterItemId); }
  if (warehouseId) { scopeWhere.push('m.warehouseId = ?'); scopeParams.push(warehouseId); }
  const scopeSql = scopeWhere.length ? ` AND ${scopeWhere.join(' AND ')}` : '';

  // Opening balances (per item) from movements strictly before dateFrom.
  const opening = new Map();
  if (dateFrom) {
    const rows = db.prepare(`
      SELECT m.itemId, SUM(m.quantityChange) AS q
      FROM stock_movements m
      WHERE date(m.movedAt) < date(?)${scopeSql}
      GROUP BY m.itemId
    `).all(dateFrom, ...scopeParams);
    for (const r of rows) opening.set(Number(r.itemId), Number(r.q) || 0);
  }

  // In-range movements (scope only) in stable order.
  const rangeWhere = [...scopeWhere];
  const rangeParams = [...scopeParams];
  if (dateFrom) { rangeWhere.push('date(m.movedAt) >= date(?)'); rangeParams.push(dateFrom); }
  if (dateTo) { rangeWhere.push('date(m.movedAt) <= date(?)'); rangeParams.push(dateTo); }
  const rangeSql = rangeWhere.length ? ` WHERE ${rangeWhere.join(' AND ')}` : '';

  const raw = db.prepare(`${ENRICH_SQL}${rangeSql} ORDER BY m.itemId ASC, m.movedAt ASC, m.id ASC`).all(...rangeParams);

  // Running balance per item over ALL in-range movements (so filtering by
  // transaction type / reference still shows the true physical balance).
  const running = new Map(opening);
  const balanced = raw.map((r) => {
    const key = Number(r.itemId);
    const balance = (running.get(key) || 0) + Number(r.quantityChange || 0);
    running.set(key, balance);
    const type = movementType(r);
    const ref = referenceOf(r);
    const change = Number(r.quantityChange || 0);
    const party = r.sourceType === 'bill' ? (r.bill_vendor != null ? Number(r.bill_vendor) : null)
      : r.sourceType === 'invoice' ? (r.invoice_customer != null ? Number(r.invoice_customer) : null)
      : r.sourceType === 'receipt' ? (r.receipt_vendor != null ? Number(r.receipt_vendor) : null) : null;
    return {
      movementId: Number(r.id),
      date: r.movedAt,
      itemId: Number(r.itemId),
      productId: r.product_id != null ? Number(r.product_id) : null,
      itemName: r.item_name || r.sku || `Item #${r.itemId}`,
      sku: r.sku || '',
      transactionType: type,
      transactionLabel: TX_LABEL[type] || type,
      sourceType: r.sourceType || null,
      sourceId: r.sourceId != null ? Number(r.sourceId) : null,
      reference: ref,
      qtyIn: change > 0 ? change : 0,
      qtyOut: change < 0 ? -change : 0,
      signedQty: change,
      balance,
      warehouseId: r.warehouseId != null ? Number(r.warehouseId) : null,
      warehouseName: r.warehouse_name || '—',
      partyId: party,
      reason: r.reason || '',
    };
  });

  // Display filters (applied AFTER balancing).
  let displayed = balanced;
  if (transactionType) displayed = displayed.filter((r) => r.transactionType === transactionType);
  if (reference) displayed = displayed.filter((r) => String(r.reference || '').toLowerCase().includes(reference));
  if (partyId) displayed = displayed.filter((r) => r.partyId === partyId);

  const summary = {
    itemsMoved: new Set(displayed.map((r) => r.itemId)).size,
    totalQtyIn: displayed.reduce((s, r) => s + r.qtyIn, 0),
    totalQtyOut: displayed.reduce((s, r) => s + r.qtyOut, 0),
  };
  summary.netMovement = summary.totalQtyIn - summary.totalQtyOut;

  const total = displayed.length;
  const start = (page - 1) * pageSize;
  const rows = opts.all ? displayed : displayed.slice(start, start + pageSize);

  return {
    rows,
    total,
    page,
    pageSize,
    openingBalances: [...opening.entries()].map(([itemId, balance]) => ({ itemId, balance })),
    summary,
    filters: { dateFrom, dateTo, itemId: opts.itemId || null, transactionType: transactionType || null, reference: opts.reference || null, warehouseId, partyId },
  };
};

module.exports = { getInventoryMovementReport, TX, TX_LABEL, movementType };
