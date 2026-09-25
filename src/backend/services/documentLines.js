/**
 * documentLines.js — server-side guard for document line items.
 *
 * A Quote/Invoice line list may arrive from the renderer with the empty
 * "convenience" row the editor keeps at the bottom of the form. That row is
 * UI-only and must never be persisted as a real document line.
 *
 * A line is MEANINGFUL when it has a product/item reference, a non-blank
 * description, or a genuinely user-entered quantity/rate/amount. The defaults
 * (quantity = 1, rate = 0, amount = 0) do NOT make a line meaningful, and a
 * legitimate free item (product selected, rate 0) DOES survive.
 *
 * This mirrors `src/frontend/src/utils/lineItems.js` (isLineEmpty) so the two
 * can never drift. Keep them in sync if the line schema changes.
 */

const ID_KEYS = ['product_id', 'productId', 'item_id', 'itemId', 'product', 'item'];
const DESC_KEYS = ['description', 'desc', 'name'];
const QTY_KEYS = ['quantity', 'qty'];
const RATE_KEYS = ['rate', 'price', 'unit_price', 'unitPrice'];
const AMOUNT_KEYS = ['amount', 'lineTotal', 'total'];

const firstDefined = (obj, keys) => {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  return undefined;
};

const isLineEmpty = (line) => {
  if (!line) return true;
  const id = firstDefined(line, ID_KEYS);
  const hasId = id !== undefined;
  const desc = firstDefined(line, DESC_KEYS);
  const hasDesc = typeof desc === 'string' ? desc.trim().length > 0 : !!desc;
  const qty = Number(firstDefined(line, QTY_KEYS) ?? 0);
  const rate = Number(firstDefined(line, RATE_KEYS) ?? 0);
  const amount = Number(firstDefined(line, AMOUNT_KEYS) ?? 0);
  const hasQty = Number.isFinite(qty) && qty > 0 && qty !== 1;
  const hasMoney = (Number.isFinite(rate) && rate !== 0) || (Number.isFinite(amount) && amount !== 0);
  return !(hasId || hasDesc || hasQty || hasMoney);
};

/** True when the line is a real document line (not an empty convenience row). */
const isMeaningfulDocumentLine = (line) => !isLineEmpty(line);

/** Drop every empty convenience row. Always returns an array. */
const filterDocumentLines = (lines) =>
  (Array.isArray(lines) ? lines : []).filter(isMeaningfulDocumentLine);

module.exports = { isLineEmpty, isMeaningfulDocumentLine, filterDocumentLines };
