/**
 * services/inventoryStockStatus.js — THE single definition of In Stock /
 * Low Stock / Out of Stock for inventory-tracked items.
 *
 *   OUT_OF_STOCK  when Quantity On Hand <= 0   (negative counts too)
 *   LOW_STOCK     when On Hand > 0 AND On Hand <= Reorder Point
 *   IN_STOCK      otherwise
 *
 * Reorder Point is the threshold (never a separate "low stock level"). A NULL /
 * unconfigured Reorder Point never produces a Low Stock warning; a Reorder Point
 * of 0 applies the normal rule (which yields In Stock for any positive quantity).
 *
 * Status is DERIVED, never stored as user data, so it can never drift after a
 * sale, receipt, adjustment, return or Reorder Point change.
 *
 * On Hand comes from the authoritative inventory balance via
 * inventoryAvailabilityService (item_stock). This module never computes stock
 * itself.
 */

const db = require('../models/dbmgr');
const ItemTypes = require('./itemTypes');
const Availability = require('./inventoryAvailabilityService');

const STATUS = {
  IN_STOCK: 'IN_STOCK',
  LOW_STOCK: 'LOW_STOCK',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
};

const LABEL = {
  IN_STOCK: 'In Stock',
  LOW_STOCK: 'Low Stock',
  OUT_OF_STOCK: 'Out of Stock',
};

/**
 * Pure status calculation. `tracksInventory === false` returns null (Services /
 * Non-Inventory Parts have no stock status).
 */
const computeStatus = (tracksInventory, onHand, reorderPoint) => {
  if (!tracksInventory) return null;
  const q = Number(onHand) || 0;
  if (q <= 0) return STATUS.OUT_OF_STOCK;
  const rp = reorderPoint == null || reorderPoint === '' ? null : Number(reorderPoint);
  if (rp != null && q <= rp) return STATUS.LOW_STOCK;
  return STATUS.IN_STOCK;
};

/** Batch: status + the numbers behind it for a list of product ids (no N+1). */
const getStatusForItems = (productIds) => {
  const ids = [...new Set((productIds || []).map(Number).filter(Boolean))];
  const out = {};
  if (!ids.length) return out;

  const ph = ids.map(() => '?').join(',');
  const prods = db.prepare(`SELECT id, type, reorder_point FROM products WHERE id IN (${ph})`).all(...ids);
  const avail = Availability.getAvailabilityForItems(ids);

  for (const p of prods) {
    const pid = Number(p.id);
    const tracked = ItemTypes.tracksInventory(p.type);
    const a = avail[pid] || {};
    const reorderPoint = p.reorder_point == null || p.reorder_point === '' ? null : Number(p.reorder_point);
    out[pid] = {
      tracksInventory: tracked,
      onHand: a.onHand != null ? a.onHand : null,
      onPurchaseOrder: a.onPurchaseOrder != null ? a.onPurchaseOrder : null,
      expected: a.expected != null ? a.expected : null,
      reorderPoint,
      status: computeStatus(tracked, a.onHand, p.reorder_point),
    };
  }
  return out;
};

/** Status for one product. */
const getStatusForItem = (productId) => getStatusForItems([productId])[Number(productId)] || null;

module.exports = { STATUS, LABEL, computeStatus, getStatusForItems, getStatusForItem };
