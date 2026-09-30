/**
 * verify-inventory-search.js
 *
 * Proves the Basic Inventory Search / Filters feature: search (name + SKU,
 * partial, case-insensitive), Category, Vendor (preferred vendor), Stock Status
 * (Low / Out) and On PO ??? all applied SERVER-SIDE across the whole dataset, and
 * all reusing the central stock/availability rules (no duplicate formulas).
 *
 * Runs on a SCRATCH COPY of the company file.
 */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-inventory-search' });

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
const ItemTypes = require(path.join(BE, 'services', 'itemTypes.js'));
const ItemStatus = require(path.join(BE, 'services', 'inventoryStockStatus.js'));
const Availability = require(path.join(BE, 'services', 'inventoryAvailabilityService.js'));

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
const vendorId = Number(db.prepare("INSERT INTO suppliers (title, first_name, mobile_number, display_name, entered_by) VALUES ('','V','',?,?)").run(`IVS Vendor ${stamp}`, 't').lastInsertRowid);

const mkItem = (type, name, extra = {}) => Products.saveItemMaster({
  type, name, sku: extra.sku || `${name}-${stamp}`, salesPrice: 10, purchaseCost: 5,
  incomeAccountId: income.id,
  ...(ItemTypes.tracksInventory(type) ? { inventoryAssetAccountId: invAsset.id, cogsAccountId: cogs.id, valuationMethod: 'FIFO' } : { purchaseExpenseAccountId: expense.id }),
  ...extra,
});
const setStock = (productId, qty, cost = 5) => {
  const itemId = Inventory.resolveItemId(productId);
  if (qty > 0) return Inventory.receiveStock(itemId, W.id, qty, cost, { sourceType: 'receipt', sourceId: ++seq + 950000 });
  if (qty < 0) return Inventory.issueStock(itemId, W.id, -qty, cost, { sourceType: 'invoice', sourceId: ++seq + 950000 });
  return null;
};
const addPo = ({ status = 'OPEN', lines = [] } = {}) => {
  const poId = Number(db.prepare("INSERT INTO purchase_orders (po_number, vendor_id, po_date, status, subtotal, tax_total, total, created_by) VALUES (?,?,?,?,?,?,?,?)")
    .run(`IVS${++seq}-${stamp}`, vendorId, '2026-09-01', status, 0, 0, 0, 't').lastInsertRowid);
  lines.forEach((l, i) => db.prepare("INSERT INTO purchase_order_lines (purchase_order_id, item_id, line_no, description, item_type, unit, qty_ordered, qty_received, qty_billed, unit_cost, tax_rate, amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(poId, Number(l.itemId), i + 1, l.desc || 'line', 'INVENTORY_PART', 'Each', l.ordered || 0, l.received || 0, l.billed || 0, 1, 0, 0));
  return poId;
};

const find = (opts, pred) => Products.getFiltered(opts).data.find(pred);
const has = (opts, id) => Products.getFiltered(opts).data.some((r) => Number(r.id) === Number(id));
const ids = (opts) => Products.getFiltered(opts).data.map((r) => Number(r.id));

(async () => {
  console.log('\n=== TEST 1-5: search name / SKU / partial / case-insensitive ===');
  const A = mkItem('INVENTORY_PART', 'IVS Widget A', { sku: 'IVS-WGT-100', category: 'IVSNetworking', preferredVendorId: vendorId, reorderPoint: 10 });
  const B = mkItem('INVENTORY_PART', 'IVS Reyee RG-EW1200G Pro', { sku: 'IVS-MIK-RB5009UG', category: 'IVSNetworking', preferredVendorId: vendorId });
  const C = mkItem('INVENTORY_PART', 'IVS CCTV Cam', { sku: 'IVS-DS-2CD2047', category: 'IVSCCTV' });
  check('TEST 1  search by item name', has({ search: 'IVS Widget A' }, A.id));
  check('TEST 2  search partial name (EW1200)', has({ search: 'EW1200' }, B.id));
  check('TEST 3  search by SKU', has({ search: 'IVS-WGT-100' }, A.id));
  check('TEST 4  search partial SKU (RB5009)', has({ search: 'RB5009' }, B.id));
  check('TEST 5  case-insensitive (widget)', has({ search: 'widget' }, A.id));
  check('TEST 5b SKU case-insensitive (ivs-wgt)', has({ search: 'ivs-wgt' }, A.id));

  console.log('\n=== TEST 6-8: Category / Vendor filters ===');
  const net = Products.getFiltered({ search: 'IVS', categoryFilter: 'IVSNetworking', pageSize: 500 }).data;
  check('TEST 6  category filter returns exact category only', net.length >= 2 && net.every((r) => r.category === 'IVSNetworking'), `${net.length}`);
  check('TEST 6b category is exact (CCTV not included)', !net.some((r) => r.category === 'IVSCCTV'));
  const byVendor = Products.getFiltered({ search: 'IVS', vendorId, pageSize: 500 }).data;
  check('TEST 7  vendor filter by preferred_vendor_id', byVendor.length >= 2 && byVendor.every((r) => Number(r.preferred_vendor_id) === vendorId));
  check('TEST 7b vendor name resolved', byVendor.some((r) => r.preferred_vendor_name && r.preferred_vendor_name.includes('IVS Vendor')));
  check('TEST 8  item with no vendor still visible under All Vendors', Products.getFiltered({ search: 'IVS CCTV Cam' }).data.some((r) => Number(r.id) === C.id) && Products.getFiltered({ search: 'IVS CCTV Cam' }).data.every((r) => !r.preferred_vendor_id));

  console.log('\n=== TEST 9-13: Low / Out of Stock / Service ===');
  const LS = mkItem('INVENTORY_PART', 'IVS LowStock', { sku: 'IVS-LS-1', reorderPoint: 10, category: 'IVSNetworking', preferredVendorId: vendorId }); setStock(LS.id, 4);
  const EX = mkItem('INVENTORY_PART', 'IVS ExactRP', { sku: 'IVS-EX-1', reorderPoint: 10 }); setStock(EX.id, 10);
  const OS = mkItem('INVENTORY_PART', 'IVS OutStock', { sku: 'IVS-OS-1', reorderPoint: 10 }); setStock(OS.id, 0);
  const NS = mkItem('INVENTORY_PART', 'IVS NegStock', { sku: 'IVS-NS-1', reorderPoint: 10 }); setStock(NS.id, 5); setStock(NS.id, -8);
  const SVC = mkItem('SERVICE', 'IVS Service', { sku: 'IVS-SVC-1' });
  check('TEST 9  on hand 4 / rp 10 ??? Low Stock filter', has({ search: 'IVS LowStock', stockStatus: 'LOW_STOCK' }, LS.id));
  check('TEST 10 exact reorder threshold 10/10 ??? Low Stock', has({ search: 'IVS ExactRP', stockStatus: 'LOW_STOCK' }, EX.id));
  check('TEST 11 on hand 0 ??? Out of Stock', has({ search: 'IVS OutStock', stockStatus: 'OUT_OF_STOCK' }, OS.id));
  check('TEST 12 on hand -3 ??? Out of Stock', has({ search: 'IVS NegStock', stockStatus: 'OUT_OF_STOCK' }, NS.id));
  check('TEST 13 Service is NOT Out of Stock', !has({ search: 'IVS Service', stockStatus: 'OUT_OF_STOCK' }, SVC.id));
  check('TEST 13b Service is not Low Stock either', !has({ search: 'IVS Service', stockStatus: 'LOW_STOCK' }, SVC.id));
  check('TEST 13c Service not in On PO', !has({ search: 'IVS Service', onPo: true }, SVC.id));

  console.log('\n=== TEST 14-17: On PO ===');
  const OP = mkItem('INVENTORY_PART', 'IVS OnPo', { sku: 'IVS-OP-1', category: 'IVSNetworking', preferredVendorId: vendorId });
  addPo({ lines: [{ itemId: OP.id, ordered: 20, received: 0 }] });
  check('TEST 14 On PO 20 ??? appears under On PO', has({ search: 'IVS OnPo', onPo: true }, OP.id));
  const FR = mkItem('INVENTORY_PART', 'IVS FullyRecv', { sku: 'IVS-FR-1' });
  addPo({ lines: [{ itemId: FR.id, ordered: 20, received: 20 }] });
  check('TEST 15 fully received PO ??? NOT On PO', !has({ search: 'IVS FullyRecv', onPo: true }, FR.id));
  const CX = mkItem('INVENTORY_PART', 'IVS Cancelled', { sku: 'IVS-CX-1' });
  addPo({ status: 'CANCELLED', lines: [{ itemId: CX.id, ordered: 20, received: 0 }] });
  check('TEST 16 cancelled PO ??? NOT On PO', !has({ search: 'IVS Cancelled', onPo: true }, CX.id));
  const BR = mkItem('INVENTORY_PART', 'IVS BilledNotRecv', { sku: 'IVS-BR-1' });
  addPo({ lines: [{ itemId: BR.id, ordered: 20, received: 0, billed: 20 }] });
  check('TEST 17 billed-before-receipt stays On PO', has({ search: 'IVS BilledNotRecv', onPo: true }, BR.id));
  check('TEST 17b Not On PO excludes it', !has({ search: 'IVS BilledNotRecv', onPo: false }, BR.id));

  console.log('\n=== TEST 18-20: combined filters ===');
  const c18 = Products.getFiltered({ search: 'IVS', categoryFilter: 'IVSNetworking', stockStatus: 'LOW_STOCK', pageSize: 500 }).data;
  check('TEST 18 category + Low Stock', c18.length >= 1 && c18.every((r) => r.category === 'IVSNetworking' && r.stock_status === 'LOW_STOCK'));
  const c19 = Products.getFiltered({ search: 'IVS', vendorId, onPo: true, pageSize: 500 }).data;
  check('TEST 19 vendor + On PO', c19.length >= 1 && c19.every((r) => Number(r.preferred_vendor_id) === vendorId && Number(r.on_po) > 0));
  const c20 = Products.getFiltered({ search: 'Widget', categoryFilter: 'IVSNetworking', vendorId, stockStatus: 'LOW_STOCK', onPo: true, pageSize: 500 }).data;
  check('TEST 20 all filters together returns only matching rows', c20.every((r) => r.category === 'IVSNetworking' && Number(r.preferred_vendor_id) === vendorId && r.stock_status === 'LOW_STOCK' && Number(r.on_po) > 0));
  // Widget A: low + vendor + networking, add On PO 20 ??? should now match all five.
  addPo({ lines: [{ itemId: A.id, ordered: 20, received: 0 }] });
  setStock(A.id, 4);
  check('TEST 20b Widget A (4/10, On PO 20) matches all five filters', has({ search: 'Widget', categoryFilter: 'IVSNetworking', vendorId, stockStatus: 'LOW_STOCK', onPo: true }, A.id));

  console.log('\n=== TEST 21: clear filters (empty opts == full active list) ===');
  const allActive = Products.getFiltered({ pageSize: 1 });
  const activeCount = db.prepare('SELECT COUNT(*) AS n FROM products WHERE (is_active IS NULL OR is_active = 1)').get().n;
  check('TEST 21 empty filters return every active item', allActive.total === activeCount, `${allActive.total} vs ${activeCount}`);

  console.log('\n=== TEST 22-25: pagination / count / server-side / sorting ===');
  const p22 = Products.getFiltered({ search: 'IVS', pageSize: 2, page: 1 });
  check('TEST 22 page size respected + total is dataset-wide', p22.data.length <= 2 && p22.total >= p22.data.length);
  const p23 = Products.getFiltered({ search: 'IVS', pageSize: 5, page: 2 });
  check('TEST 22b page 2 returns a different slice', p23.data.every((r) => !p22.data.some((x) => x.id === r.id)) || p23.data.length === 0);
  const count25 = Products.getFiltered({ search: 'IVS', pageSize: 5 }).total;
  check('TEST 24 result count independent of page size', count25 === Products.getFiltered({ search: 'IVS', pageSize: 500 }).total);
  const sortedAsc = Products.getFiltered({ search: 'IVS', sort: 'sku', sortDir: 'asc', pageSize: 500 }).data.map((r) => (r.sku || '').toLowerCase());
  const isSorted = sortedAsc.every((v, i) => i === 0 || sortedAsc[i - 1] <= v);
  check('TEST 25 sorting by SKU asc after filtering', isSorted, JSON.stringify(sortedAsc.slice(0, 4)));
  const sortedByName = Products.getFiltered({ search: 'IVS', sort: 'name', sortDir: 'asc', pageSize: 500 }).data.map((r) => (r.name || '').toLowerCase());
  check('TEST 25b sorting by name asc', sortedByName.every((v, i) => i === 0 || sortedByName[i - 1] <= v));

  console.log('\n=== TEST 37: special characters (no SQL error) ===');
  const sp = mkItem('INVENTORY_PART', 'IVS Special AP/PRO', { sku: 'IVS-AP/PRO' });
  const sp2 = mkItem('INVENTORY_PART', 'IVS Special CAM(4MP)', { sku: 'IVS-CAM-4MP(2.8)' });
  const sp3 = mkItem('INVENTORY_PART', 'IVS Special ABC+123', { sku: 'IVS-ABC+123' });
  let spOk = true, spErr = '';
  try {
    spOk = has({ search: 'AP/PRO' }, sp.id) && has({ search: 'CAM(4MP)' }, sp2.id) && has({ search: 'ABC+123' }, sp3.id) && has({ search: '50%' }, -1) === false;
  } catch (e) { spOk = false; spErr = e.message; }
  check('TEST 37 special chars search safely + correctly', spOk, spErr);

  console.log('\n=== TEST 38: duplicate names, independent ids ===');
  const D1 = mkItem('INVENTORY_PART', 'IVS Dup Item', { sku: 'IVS-DUP-1' });
  const D2 = mkItem('INVENTORY_PART', 'IVS Dup Item', { sku: 'IVS-DUP-2' });
  const dups = Products.getFiltered({ search: 'IVS Dup Item', pageSize: 500 }).data;
  check('TEST 38 both duplicates returned with distinct ids', dups.filter((r) => [D1.id, D2.id].includes(Number(r.id))).length === 2 && D1.id !== D2.id);

  console.log('\n=== TEST 23b/40: server-side filter across a large dataset ===');
  const bulk = [];
  for (let i = 0; i < 1000; i++) {
    const it = mkItem('INVENTORY_PART', `IVSBulk${i}`, { sku: `IVS-BULK-${i}`, reorderPoint: 10, category: 'IVSBulkCat' });
    setStock(it.id, i === 850 ? 3 : 50); // only #850 low stock
    bulk.push(it);
  }
  const lowPage1 = Products.getFiltered({ search: 'IVS', categoryFilter: 'IVSBulkCat', stockStatus: 'LOW_STOCK', pageSize: 25, page: 1 });
  check('TEST 23 low-stock filter finds item #850 off the current page', lowPage1.data.some((r) => Number(r.id) === bulk[850].id) && lowPage1.total === 1, `total=${lowPage1.total}`);
  const t0 = Date.now();
  Products.getFiltered({ search: 'IVS', stockStatus: 'LOW_STOCK', sort: 'onHand', sortDir: 'asc', pageSize: 25 });
  Products.getFiltered({ search: 'IVS', onPo: true, pageSize: 25 });
  const ms = Date.now() - t0;
  console.log(`  two filtered queries over 1000+ items in ${ms} ms`);
  check('TEST 40 large dataset efficient (< 3000ms)', ms < 3000, `${ms}ms`);

  console.log('\n=== consistency with the CENTRAL services (no duplicate formulas) ===');
  const ourIds = new Set(Products.getFiltered({ search: 'IVS', pageSize: 500 }).data.map((r) => Number(r.id)));
  const allOurs = [...ourIds];
  const centralStatus = ItemStatus.getStatusForItems(allOurs);
  const centralLow = allOurs.filter((id) => centralStatus[id].status === 'LOW_STOCK');
  const sqlLow = ids({ search: 'IVS', stockStatus: 'LOW_STOCK', pageSize: 500 }).filter((id) => ourIds.has(id));
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  check('SQL LOW_STOCK set == central inventoryStockStatus', sameSet(centralLow, sqlLow), `${centralLow.length} vs ${sqlLow.length}`);
  const centralOut = allOurs.filter((id) => centralStatus[id].status === 'OUT_OF_STOCK');
  const sqlOut = ids({ search: 'IVS', stockStatus: 'OUT_OF_STOCK', pageSize: 500 }).filter((id) => ourIds.has(id));
  check('SQL OUT_OF_STOCK set == central inventoryStockStatus', sameSet(centralOut, sqlOut), `${centralOut.length} vs ${sqlOut.length}`);
  const avail = Availability.getAvailabilityForItems(allOurs);
  const centralOnPo = allOurs.filter((id) => Number((avail[id] || {}).onPurchaseOrder) > 0);
  const sqlOnPo = ids({ search: 'IVS', onPo: true, pageSize: 500 }).filter((id) => ourIds.has(id));
  check('SQL On-PO set == central inventoryAvailabilityService', sameSet(centralOnPo, sqlOnPo), `${centralOnPo.length} vs ${sqlOnPo.length}`);

  console.log('\n=== TEST 30-36: refresh ??? conditions recalculate on the next query ===');
  const R = mkItem('INVENTORY_PART', 'IVS Refresh', { sku: 'IVS-RF-1', reorderPoint: 10, category: 'IVSNetworking', preferredVendorId: vendorId }); setStock(R.id, 12);
  check('TEST 30 before PO: not On PO', !has({ search: 'IVS Refresh', onPo: true }, R.id));
  const rPo = addPo({ lines: [{ itemId: R.id, ordered: 20, received: 0 }] });
  check('TEST 30 after PO created ??? On PO', has({ search: 'IVS Refresh', onPo: true }, R.id));
  db.prepare("UPDATE purchase_orders SET status='CANCELLED' WHERE id=?").run(rPo);
  check('TEST 31 after PO cancelled ??? not On PO', !has({ search: 'IVS Refresh', onPo: true }, R.id));
  const rPo2 = addPo({ lines: [{ itemId: R.id, ordered: 20, received: 0 }] });
  db.prepare('UPDATE purchase_order_lines SET qty_received = 20 WHERE purchase_order_id = ?').run(rPo2);
  check('TEST 32 after full receipt ??? not On PO', !has({ search: 'IVS Refresh', onPo: true }, R.id));
  check('TEST 33 before sale: not Low Stock (12 > 10)', !has({ search: 'IVS Refresh', stockStatus: 'LOW_STOCK' }, R.id));
  setStock(R.id, -3); // 12 ??? 9
  check('TEST 33 after sale (???9) ??? Low Stock', has({ search: 'IVS Refresh', stockStatus: 'LOW_STOCK' }, R.id));
  Inventory.adjustStock(Inventory.resolveItemId(R.id), W.id, 5, 'test'); // 9 ??? 14
  check('TEST 34 after adjustment above threshold ??? not Low Stock', !has({ search: 'IVS Refresh', stockStatus: 'LOW_STOCK' }, R.id));
  const rRow = Products.getById(R.id);
  Products.saveItemMaster({ id: R.id, type: 'INVENTORY_PART', name: rRow.name, sku: rRow.sku, category: 'IVSCCTV', preferredVendorId: vendorId, incomeAccountId: income.id, inventoryAssetAccountId: invAsset.id, cogsAccountId: cogs.id, reorderPoint: 10 });
  check('TEST 35 category change reflected in filter', has({ search: 'IVS Refresh', categoryFilter: 'IVSCCTV' }, R.id) && !has({ search: 'IVS Refresh', categoryFilter: 'IVSNetworking' }, R.id));
  const otherVendor = Number(db.prepare("INSERT INTO suppliers (title, first_name, mobile_number, display_name, entered_by) VALUES ('','V','',?,?)").run(`IVS Vendor2 ${stamp}`, 't').lastInsertRowid);
  Products.saveItemMaster({ id: R.id, type: 'INVENTORY_PART', name: rRow.name, sku: rRow.sku, category: 'IVSCCTV', preferredVendorId: otherVendor, incomeAccountId: income.id, inventoryAssetAccountId: invAsset.id, cogsAccountId: cogs.id, reorderPoint: 10 });
  check('TEST 36 preferred-vendor change reflected in filter', has({ search: 'IVS Refresh', vendorId: otherVendor }, R.id) && !has({ search: 'IVS Refresh', vendorId }, R.id));

  console.log('\n=== active/inactive ===');
  const INACT = mkItem('INVENTORY_PART', 'IVS Inactive', { sku: 'IVS-INACT', isActive: false });
  check('inactive item excluded by default', !has({ search: 'IVS Inactive' }, INACT.id));
  check('inactive item returned when includeInactive', has({ search: 'IVS Inactive', includeInactive: true }, INACT.id));

  console.log('\n=== TEST 26-29, 41-43: UI wiring (static) ===');
  const listPage = fs.readFileSync(path.join(FE, 'components/shared/UnifiedItemList.js'), 'utf8');
  const dash = fs.readFileSync(path.join(FE, 'components/inventory/pages/Dashboard.js'), 'utf8');
  const strip = fs.readFileSync(path.join(FE, 'components/shared/AlertStrip.js'), 'utf8');
  const preload = fs.readFileSync(path.join(BE, 'preload.js'), 'utf8');
  check('TEST 26 dashboard Low Stock ??? items?stockStatus=LOW_STOCK', /items\?stockStatus=LOW_STOCK/.test(dash));
  check('TEST 27 dashboard Out of Stock ??? items?stockStatus=OUT_OF_STOCK', /items\?stockStatus=OUT_OF_STOCK/.test(dash));
  check('TEST 28 dashboard On PO ??? items?onPo=true', /items\?onPo=true/.test(dash));
  check('TEST 29 alert strip drills into the same filters', /items\?stockStatus=OUT_OF_STOCK/.test(strip) && /purchase-orders\?delivery=OVERDUE/.test(strip));
  check('search placeholder "Search item name or SKU..."', /Search item name or SKU/.test(listPage));
  check('filter bar has Category, Vendor, Stock Status, On PO', /placeholder="Category"/.test(listPage) && /placeholder="Vendor"/.test(listPage) && /placeholder="Stock Status"/.test(listPage) && /placeholder="On PO"/.test(listPage));
  check('Clear Filters control exists', /Clear Filters/.test(listPage) && /clearFilters/.test(listPage));
  check('URL filter persistence (searchParams + replace)', /new URLSearchParams\(location\.search\)/.test(listPage) && /routerHistory\.replace/.test(listPage));
  check('debounced search (300ms)', /setTimeout\(\(\) => fetchItems\(\{ page: 1 \}\), 300\)/.test(listPage));
  check('TEST 41 loading state (no false empty)', /loading=\{loading\}/.test(listPage) && /Loading items/.test(listPage));
  check('TEST 42 error state "Unable to load inventory items."', /Unable to load inventory items\./.test(listPage));
  check('empty states for no items vs no match', /No inventory items available\./.test(listPage) && /No items match the selected filters\./.test(listPage));
  check('TEST 43 responsive controls (wrap)', /flexWrap: 'wrap'/.test(listPage));
  check('TEST 22b pagination resets to page 1 on filter change', /fetchItems\(\{ page: 1/.test(listPage));
  check('columns include On Hand / On PO / Expected / Reorder Point / Preferred Vendor', ['On Hand', 'On PO', 'Expected', 'Reorder Point', 'Preferred Vendor'].every((c) => listPage.includes(c)));
  check('IPC + preload wired for filtered list', /get-products-filtered/.test(fs.readFileSync(path.join(BE, 'handlers', 'ipcHandlers.js'), 'utf8')) && /getProductsFiltered:/.test(preload));
  check('inventoryTypeKeys is single-sourced from the shared JSON', /inventoryTypeKeys/.test(fs.readFileSync(path.join(BE, 'services', 'itemTypes.js'), 'utf8')) && /inventoryTypeKeys\(\)/.test(fs.readFileSync(path.join(BE, 'models', 'products.js'), 'utf8')));

  console.log('\n=== TEST 39: company isolation (architectural) ===');
  const prodSrc = fs.readFileSync(path.join(BE, 'models', 'products.js'), 'utf8');
  check('TEST 39 queries scoped to the active company db (dbmgr only)', /require\('\.\/dbmgr(\.js)?'\)/.test(prodSrc) && !/ATTACH|company_id|companyId/.test(prodSrc));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
