// Shared helpers for repeatable line-item editors (invoices, quotes, sales
// orders, POS sales, ...).
//
// These back the "select a product/item and a fresh empty line is prepared"
// workflow. The app keeps every line-item list in a plain useState array, so a
// small pure utility (rather than a hook/component) lets all forms share the
// exact same behaviour without altering their layout or calculations.

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

// A line is empty when it has no product/item, no user-entered description and
// no meaningful quantity/rate/amount. Default values such as quantity=1 and
// amount=0 do NOT make a line meaningful, so a fresh convenience row still
// counts as empty.
export const isLineEmpty = (line) => {
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

// Ensure there is exactly ONE empty convenience line at the end of the list.
// If the last line is already empty the array is returned unchanged, so this
// can never accumulate duplicate blank rows.
export const ensureTrailingEmptyLine = (lines, createEmptyLine) => {
  const arr = Array.isArray(lines) ? lines : [];
  if (arr.length > 0 && isLineEmpty(arr[arr.length - 1])) return arr;
  return [...arr, createEmptyLine()];
};

// Remove a line by key/index and guarantee a trailing empty convenience row
// remains (but never more than one).
export const removeLineAndEnsureEmpty = (lines, predicate, createEmptyLine) => {
  const next = (Array.isArray(lines) ? lines : []).filter(predicate);
  if (next.length === 0) return [createEmptyLine()];
  return ensureTrailingEmptyLine(next, createEmptyLine);
};

// Remove ALL trailing empty lines then ensure exactly one convenience row.
// Used when a product is cleared so the reset row cannot create a second blank.
export const collapseToSingleTrailingEmpty = (lines, createEmptyLine) => {
  const arr = Array.isArray(lines) ? lines : [];
  let end = arr.length;
  while (end > 0 && isLineEmpty(arr[end - 1])) end--;
  return [...arr.slice(0, end), createEmptyLine()];
};
