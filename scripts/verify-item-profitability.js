/**
 * verify-item-profitability.js
 *
 * Proves the Simple Item Profitability feature:
 *   Gross Profit = Selling Price − Cost
 *   Gross Margin = Gross Profit / Selling Price × 100      (NOT markup)
 *
 * Cost source: Inventory Part = current inventory carrying cost (value / qty on
 * hand from the movement ledger), falling back to the configured Purchase Cost
 * when there is no stock; Non-Inventory = Purchase Cost; Service = Purchase Cost.
 * Selling price is the Item Master price, tax EXCLUSIVE.
 *
 * Nothing is stored (derived). Runs on a SCRATCH COPY of the company file.
 */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-item-profitability' });

const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const BE = path.join(ROOT, 'src', 'backend');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
const db = require(path.join(BE, 'models', 'dbmgr.js'));
const Products = require(path.join(BE, 'models', 'products.js'));
const Inventory = require(path.join(BE, 'models', 'inventory.js'));
const Warehouses = require(path.join(BE, 'models', 'warehouses.js'));
const COA = require(path.join(BE, 'models', 'chartOfAccounts.js'));
const Profit = require(path.join(BE, 'services', 'itemProfitabilityService.js'));

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

const income = COA.getByName('Sales Revenue') || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('income','other income') AND status='Active' ORDER BY id LIMIT 1").get();
const expense = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('expense','cost of goods sold','other expense') AND status='Active' ORDER BY id LIMIT 1").get();
const invAsset = COA.getSystemAccount('Inventory Asset') || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('asset','other current asset','inventory') AND status='Active' ORDER BY id LIMIT 1").get();
const cogs = COA.getSystemAccount('Cost of Goods Sold') || expense;
const W = Warehouses.getOrCreateDefault();
const stamp = Date.now();
let seq = 0;

const mkItem = (type, name, extra = {}) => Products.saveItemMaster({
  type, name, sku: `${name}-${stamp}`, salesPrice: 100, purchaseCost: 5,
  incomeAccountId: income.id,
  ...(type === 'INVENTORY_PART' ? { inventoryAssetAccountId: invAsset.id, cogsAccountId: cogs.id, valuationMethod: 'FIFO' } : { purchaseExpenseAccountId: expense.id }),
  ...extra,
});
const setStock = (productId, qty, cost = 5) => {
  const itemId = Inventory.resolveItemId(productId);
  if (qty > 0) return Inventory.receiveStock(itemId, W.id, qty, cost, { sourceType: 'receipt', sourceId: ++seq + 700000 });
  if (qty < 0) return Inventory.issueStock(itemId, W.id, -qty, cost, { sourceType: 'invoice', sourceId: ++seq + 700000 });
  return null;
};

console.log('\n=== A. pure formula (the ONE place GP/margin are computed) ===');
const f1 = Profit.computeProfitability(60, 100, 'X');
check('A1 cost 60 / price 100 → GP 40, margin 40% (NOT markup 66.67%)', f1.grossProfit === 40 && Math.abs(f1.marginPercent - 40) < 1e-9, JSON.stringify(f1));
check('A1 margin is GP/price, not GP/cost', Math.abs(f1.marginPercent - 66.6666667) > 1, `margin=${f1.marginPercent}`);
check('A2 cost null → MISSING_COST, no profit', Profit.computeProfitability(null, 100).status === 'MISSING_COST' && Profit.computeProfitability(null, 100).grossProfit === null);
check('A3 price null → MISSING_PRICE, cost kept', (() => { const r = Profit.computeProfitability(60, null); return r.status === 'MISSING_PRICE' && r.cost === 60 && r.grossProfit === null; })());
check('A4 price 0 → ZERO_PRICE, margin null (no divide by zero)', (() => { const r = Profit.computeProfitability(60, 0); return r.status === 'ZERO_PRICE' && r.marginPercent === null; })());
check('A5 cost 120 / price 100 → NEGATIVE, margin −20%', (() => { const r = Profit.computeProfitability(120, 100); return r.status === 'NEGATIVE' && r.grossProfit === -20 && Math.abs(r.marginPercent + 20) < 1e-9; })());
check('A6 cost == price → ZERO profit, 0% margin', (() => { const r = Profit.computeProfitability(100, 100); return r.status === 'ZERO' && r.grossProfit === 0 && r.marginPercent === 0; })());
check('A7 cost 0 is allowed (not treated as missing)', (() => { const r = Profit.computeProfitability(0, 100); return r.status === 'POSITIVE' && r.cost === 0 && r.grossProfit === 100; })());

console.log('\n=== B. Inventory Part cost = carrying cost, not the default purchase cost ===');
const A = mkItem('INVENTORY_PART', 'PFZ Inv A', { salesPrice: 100, purchaseCost: 5 }); setStock(A.id, 10, 8);
const pa = Profit.getItemProfitability(A.id);
check('B1 carrying cost 8 wins over default 5', pa.cost === 8 && pa.costSource === 'FIFO_CARRYING_COST', JSON.stringify(pa));
check('B1 GP 92 / margin 92%', pa.grossProfit === 92 && Math.abs(pa.marginPercent - 92) < 1e-9);
setStock(A.id, -2, 8);
const pa2 = Profit.getItemProfitability(A.id);
check('B2 selling stock does not change the unit carrying cost', pa2.cost === 8 && pa2.costSource === 'FIFO_CARRYING_COST', JSON.stringify(pa2));

const WA = mkItem('INVENTORY_PART', 'PFZ Inv WA', { salesPrice: 50, purchaseCost: 5, valuationMethod: 'WEIGHTED_AVERAGE' }); setStock(WA.id, 10, 6);
const pwa = Profit.getItemProfitability(WA.id);
check('B3 weighted-average method → WEIGHTED_AVERAGE source, cost 6', pwa.cost === 6 && pwa.costSource === 'WEIGHTED_AVERAGE', JSON.stringify(pwa));

const B = mkItem('INVENTORY_PART', 'PFZ Inv B', { salesPrice: 100, purchaseCost: 7 });
const pb = Profit.getItemProfitability(B.id);
check('B4 no stock → falls back to default purchase cost 7', pb.cost === 7 && pb.costSource === 'DEFAULT_PURCHASE_COST', JSON.stringify(pb));
check('B4 GP 93', pb.grossProfit === 93);

const C = mkItem('INVENTORY_PART', 'PFZ Inv C', { salesPrice: 100, purchaseCost: 0 });
const pc = Profit.getItemProfitability(C.id);
check('B5 no stock and no positive cost → MISSING_COST', pc.status === 'MISSING_COST' && pc.grossProfit === null, JSON.stringify(pc));

console.log('\n=== C. Non-Inventory Part / Service ===');
const NI = mkItem('NON_INVENTORY_PART', 'PFZ NI', { salesPrice: 100, purchaseCost: 30 });
const pni = Profit.getItemProfitability(NI.id);
check('C1 non-inventory cost = purchase cost 30, GP 70', pni.cost === 30 && pni.grossProfit === 70 && pni.costSource === 'DEFAULT_PURCHASE_COST', JSON.stringify(pni));

const S = mkItem('SERVICE', 'PFZ Svc', { salesPrice: 200, purchaseCost: 50 });
const ps = Profit.getItemProfitability(S.id);
check('C2 service cost = purchase cost 50, source SERVICE_COST, GP 150', ps.cost === 50 && ps.costSource === 'SERVICE_COST' && ps.grossProfit === 150, JSON.stringify(ps));
check('C2 service margin 75%', Math.abs(ps.marginPercent - 75) < 1e-9);

console.log('\n=== D. zero selling price ===');
const Z = mkItem('SERVICE', 'PFZ Zero', { salesPrice: 0, purchaseCost: 10 });
const pz = Profit.getItemProfitability(Z.id);
check('D1 price 0 → ZERO_PRICE, margin null', pz.status === 'ZERO_PRICE' && pz.marginPercent === null, JSON.stringify(pz));

console.log('\n=== E. list + summary + filters ===');
const all = Profit.getItemProfitabilities({});
const rows = all.items;
const summary = all.summary;
check('E1 returns every product', rows.length === db.prepare('SELECT COUNT(*) AS n FROM products').get().n, `${rows.length}`);
check('E2 summary.total matches', summary.total === rows.length);
check('E3 summary.withData == rows with grossProfit', summary.withData === rows.filter((i) => i.grossProfit != null).length);
check('E4 summary.missingCost == MISSING_COST rows', summary.missingCost === rows.filter((i) => i.status === 'MISSING_COST').length);
check('E5 summary.negative == NEGATIVE rows', summary.negative === rows.filter((i) => i.status === 'NEGATIVE').length);

const searched = Profit.getItemProfitabilities({ search: 'pfz' }).items;
check('E6 search matches name/sku case-insensitively', searched.length >= 7 && searched.every((i) => `${i.name} ${i.sku}`.toLowerCase().includes('pfz')), `${searched.length}`);
const svcOnly = Profit.getItemProfitabilities({ type: 'SERVICE' }).items;
check('E7 type filter → only services', svcOnly.length > 0 && svcOnly.every((i) => i.type === 'SERVICE'));

db.prepare('UPDATE products SET category = ? WHERE id IN (?, ?)').run('PFZCAT', A.id, NI.id);
const catOnly = Profit.getItemProfitabilities({ category: 'PFZCAT' }).items;
check('E8 category filter', catOnly.length === 2 && catOnly.every((i) => i.category === 'PFZCAT'), `${catOnly.length}`);

const neg = Profit.getItemProfitabilities({ dataStatus: 'NEGATIVE' }).items;
check('E9 dataStatus NEGATIVE', neg.every((i) => i.status === 'NEGATIVE') && neg.length === rows.filter((i) => i.status === 'NEGATIVE').length);
const mc = Profit.getItemProfitabilities({ dataStatus: 'MISSING_COST' }).items;
check('E10 dataStatus MISSING_COST', mc.every((i) => i.status === 'MISSING_COST') && mc.length === summary.missingCost);
const hd = Profit.getItemProfitabilities({ dataStatus: 'HAS_DATA' }).items;
check('E11 dataStatus HAS_DATA', hd.every((i) => i.grossProfit != null) && hd.length === summary.withData);

console.log('\n=== F. item detail integration ===');
const detail = Products.getItemDetail(A.id);
check('F1 getItemDetail includes profitability', !!detail.profitability);
check('F2 detail profitability matches the service', detail.profitability.cost === pa2.cost && detail.profitability.grossProfit === pa2.grossProfit && detail.profitability.marginPercent === pa2.marginPercent, JSON.stringify(detail.profitability));
check('F3 unknown id → null', Profit.getItemProfitability(99999999) === null);

console.log('\n=== G. efficiency (one batch carrying-cost query, no N+1) ===');
for (let i = 0; i < 1200; i++) { const it = mkItem('INVENTORY_PART', `PFZBulk${i}`, { salesPrice: 20, purchaseCost: 5 }); setStock(it.id, 5, 4); }
const t0 = Date.now();
const big = Profit.getItemProfitabilities({});
const ms = Date.now() - t0;
console.log(`  profitability for the whole company in ${ms} ms`);
check('G1 large list computed efficiently (< 3000ms)', ms < 3000 && big.items.length >= 1200, `${ms}ms / ${big.items.length}`);

console.log('\n=== H. wiring / UI static checks ===');
check('H1 service exports the expected API', typeof Profit.computeProfitability === 'function' && typeof Profit.getItemProfitability === 'function' && typeof Profit.getItemProfitabilities === 'function');
const ipc = fs.readFileSync(path.join(BE, 'handlers', 'ipcHandlers.js'), 'utf8');
check('H2 IPC handlers registered', /get-item-profitability'/.test(ipc) && /get-item-profitabilities'/.test(ipc));
const preload = fs.readFileSync(path.join(BE, 'preload.js'), 'utf8');
check('H3 preload exposes getItemProfitability/getItemProfitabilities', /getItemProfitability:/.test(preload) && /getItemProfitabilities:/.test(preload));
const util = fs.readFileSync(path.join(FE, 'utils', 'profitability.js'), 'utf8');
check('H4 renderer util computes margin = GP / selling price', /grossProfit \/ p\) \* 100/.test(util));
const page = fs.readFileSync(path.join(FE, 'components/inventory/pages/ItemProfitability.js'), 'utf8');
check('H5 report page has the required columns', ['Cost', 'Selling Price', 'Gross Profit', 'Margin', 'Status'].every((c) => page.includes(c)));
check('H6 report page has summary cards + filters', /Items With Profitability/.test(page) && /Missing Cost/.test(page) && /getItemProfitabilities/.test(page));
check('H7 report page drills into the item detail', /items\?item=/.test(page));
const idx = fs.readFileSync(path.join(FE, 'components/inventory/index.js'), 'utf8');
check('H8 route registered', /inventory\/profitability|match\.path\}\/profitability/.test(idx));
const sidebar = fs.readFileSync(path.join(FE, 'containers/Sidebar/SidebarContent.js'), 'utf8');
check('H9 sidebar link added', /Item Profitability/.test(sidebar));
const uil = fs.readFileSync(path.join(FE, 'components/shared/UnifiedItemList.js'), 'utf8');
check('H10 item detail shows a Profitability section', /Profitability<\/Space>|title="Profitability"|Profitability\n/.test(uil) && /viewDetail\.profitability/.test(uil));
check('H11 item form shows a live read-only preview', /computeProfitability\(watchCost, watchPrice\)/.test(uil));
check('H12 item list supports ?item= deep link', /URLSearchParams\(location\.search\)\.get\('item'\)/.test(uil));

console.log('\n=== I. no accounting impact ===');
check('I1 no new journal entries created by profitability', db.prepare("SELECT COUNT(*) AS n FROM journal_entries WHERE memo LIKE '%profitab%'").get().n === 0);
check('I2 service stores nothing (no profitability table)', (() => { try { db.prepare('SELECT 1 FROM item_profitability LIMIT 1').get(); return false; } catch { return true; } })());

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
