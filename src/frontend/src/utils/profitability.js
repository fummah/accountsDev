/**
 * profitability.js — renderer mirror of the itemProfitability formula.
 *
 * Gross Profit = Selling Price − Cost
 * Gross Margin = Gross Profit / Selling Price × 100   (NOT markup)
 *
 * Used only for the LIVE preview while editing an item. The backend
 * (services/itemProfitabilityService.js) is authoritative when saved.
 */

export const computeProfitability = (cost, sellingPrice) => {
  const c = cost === '' || cost == null ? null : Number(cost);
  const p = sellingPrice === '' || sellingPrice == null ? null : Number(sellingPrice);
  if (c == null || !Number.isFinite(c)) {
    return { cost: null, sellingPrice: Number.isFinite(p) ? p : null, grossProfit: null, marginPercent: null, status: 'MISSING_COST' };
  }
  if (p == null || !Number.isFinite(p)) {
    return { cost: c, sellingPrice: null, grossProfit: null, marginPercent: null, status: 'MISSING_PRICE' };
  }
  const grossProfit = p - c;
  const marginPercent = p !== 0 ? (grossProfit / p) * 100 : null;
  let status = 'POSITIVE';
  if (p === 0) status = 'ZERO_PRICE';
  else if (grossProfit < 0) status = 'NEGATIVE';
  else if (grossProfit === 0) status = 'ZERO';
  return { cost: c, sellingPrice: p, grossProfit, marginPercent, status };
};

export default computeProfitability;
