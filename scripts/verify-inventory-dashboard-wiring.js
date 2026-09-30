/**
 * verify-inventory-dashboard-wiring.js — the FULL Inventory Dashboard chain.
 *
 * Proves the exact chain the screenshot's error complains about:
 *   React page → window.electronAPI.getInventoryDashboard → IPC channel
 *   'get-inventory-dashboard' → inventoryHandlers → inventoryDashboardService
 *   → central stock/availability/valuation services → database.
 *
 * It loads the REAL preload (with a stubbed `electron`) and asserts the bridge
 * method exists and invokes the RIGHT channel, then loads the REAL handler and
 * asserts the channel is registered and returns the shape the page expects.
 */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-dashboard-wiring' });

const path = require('path');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
const BE = path.join(ROOT, 'src', 'backend');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
const fs = require('fs');

// ── Stub `electron` so we can load preload.js + handlers in plain Node ──────
const bridge = {};
const invoked = [];
const handlers = new Map();
const electronStub = {
  contextBridge: { exposeInMainWorld: (name, api) => { bridge[name] = api; } },
  ipcRenderer: { invoke: (ch) => { invoked.push(ch); return Promise.resolve({}); }, on() {}, send() {}, removeAllListeners() {}, sendSync() {} },
  ipcMain: { handle: (ch, fn) => { handlers.set(ch, fn); } },
  webUtils: { getPathForFile: () => '' },
  shell: { openExternal() {} },
};
const origLoad = Module._load;
Module._load = function (request) { if (request === 'electron') return electronStub; return origLoad.apply(this, arguments); };

let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  -> ${d}` : ''}`); } };
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

(async () => {
  const db = require(path.join(BE, 'models', 'dbmgr.js')).raw;
  const Products = require(path.join(BE, 'models', 'products.js'));
  const Inventory = require(path.join(BE, 'models', 'inventory.js'));
  const Warehouses = require(path.join(BE, 'models', 'warehouses.js'));
  const COA = require(path.join(BE, 'models', 'chartOfAccounts.js'));

  console.log('\n=== 1-5: preload bridge ===');
  require(path.join(BE, 'preload.js'));
  const api = bridge.electronAPI;
  check('preload exposes the electronAPI bridge', !!api);
  check('preload exposes getInventoryDashboard()', typeof api.getInventoryDashboard === 'function', `typeof=${typeof (api || {}).getInventoryDashboard}`);
  invoked.length = 0;
  await api.getInventoryDashboard();
  check('getInventoryDashboard invokes the exact channel "get-inventory-dashboard"', invoked.includes('get-inventory-dashboard'), invoked.join(','));

  console.log('\n=== 6-9: IPC handler registration + shape ===');
  const registerInventoryHandlers = require(path.join(BE, 'handlers', 'inventoryHandlers.js'));
  registerInventoryHandlers();
  check('handler "get-inventory-dashboard" is registered at startup', handlers.has('get-inventory-dashboard'));
  const handler = handlers.get('get-inventory-dashboard');
  const res = await handler({}, {});
  check('handler returns the dashboard shape (summary + sections)', !!res && !!res.summary
    && typeof res.summary.totalInventoryItems === 'number'
    && Array.isArray(res.stockAttention) && Array.isArray(res.incomingStock) && Array.isArray(res.recentActivity),
    JSON.stringify(res && Object.keys(res)));
  check('handler never returns an {error} object for a healthy DB', !(res && res.error));
  check('the service is the central inventoryDashboardService (no new engine)', fs.readFileSync(path.join(BE, 'handlers', 'inventoryHandlers.js'), 'utf8').includes("services/inventoryDashboardService"));

  console.log('\n=== 10-19: business rules with controlled data ===');
  const W = Warehouses.getOrCreateDefault();
  const income = COA.getByName('Sales Revenue') || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('income','other income') AND status='Active' LIMIT 1").get();
  const invAsset = COA.getSystemAccount('Inventory Asset');
  const cogs = COA.getSystemAccount('Cost of Goods Sold');
  const stamp = Date.now();
  let seq = 0;
  const mk = (name, rp) => Products.saveItemMaster({ type: 'INVENTORY_PART', name, sku: `${name}-${stamp}-${++seq}`, salesPrice: 35, purchaseCost: 20, incomeAccountId: income.id, inventoryAssetAccountId: invAsset.id, cogsAccountId: cogs.id, valuationMethod: 'FIFO', reorderPoint: rp });
  const setStock = (pid, qty, cost = 20) => { const i = Inventory.resolveItemId(pid); if (qty > 0) Inventory.receiveStock(i, W.id, qty, cost, { sourceType: 'receipt', sourceId: ++seq + 400000 }); else if (qty < 0) Inventory.issueStock(i, W.id, -qty, cost, { sourceType: 'invoice', sourceId: ++seq + 400000 }); };

  const A = mk('WDash A', 10); setStock(A.id, 20);              // In Stock
  const B = mk('WDash B', 10); setStock(B.id, 5);               // Low Stock
  const C = mk('WDash C', 10); setStock(C.id, 0);               // Out of Stock
  const D = mk('WDash D', 5); setStock(D.id, 3);                // Low Stock + On PO
  const poId = Number(db.prepare("INSERT INTO purchase_orders (po_number, vendor_id, po_date, status, subtotal, tax_total, total, created_by) VALUES (?,1,'2026-06-01','OPEN',0,0,0,'t')").run(`WDASH-${stamp}`).lastInsertRowid);
  db.prepare("INSERT INTO purchase_order_lines (purchase_order_id, item_id, line_no, description, item_type, unit, qty_ordered, qty_received, qty_billed, unit_cost, tax_rate, amount) VALUES (?,?,1,'x','INVENTORY_PART','Each',20,0,0,20,0,0)").run(poId, D.id);

  const dash = await handler({}, {});
  const att = dash.stockAttention || [];
  const rowOf = (pid) => att.find((r) => Number(r.productId) === Number(pid));
  check('ITEM A (20/10) is In Stock (not in Stock Attention)', !rowOf(A.id));
  check('ITEM B (5/10) is Low Stock', rowOf(B.id) && rowOf(B.id).status === 'Low Stock', rowOf(B.id) && rowOf(B.id).status);
  check('ITEM C (0/10) is Out of Stock', rowOf(C.id) && rowOf(C.id).status === 'Out of Stock', rowOf(C.id) && rowOf(C.id).status);
  check('ITEM D (3/5, On PO 20) is Low Stock WITH On PO context', rowOf(D.id) && rowOf(D.id).status === 'Low Stock' && Number(rowOf(D.id).onPo) === 20, rowOf(D.id) && JSON.stringify(rowOf(D.id)));

  const alerts = require(path.join(BE, 'services', 'inventoryAlertsService.js')).getAlerts({}).summary;
  check('Low Stock card count agrees with the Low Stock alert count', Number(dash.summary.lowStockItems) === Number(alerts.lowStock), `${dash.summary.lowStockItems} vs ${alerts.lowStock}`);
  check('Out of Stock card count agrees with the Out of Stock alert count', Number(dash.summary.outOfStockItems) === Number(alerts.outOfStock), `${dash.summary.outOfStockItems} vs ${alerts.outOfStock}`);
  check('On PO count agrees with the availability service', Number(dash.summary.itemsOnPO) >= 1 && dash.incomingStock.some((r) => Number(r.productId) === Number(D.id) && Number(r.remaining) === 20));
  check('Recently Received uses real receipt movements (>= 1)', Number(dash.summary.recentlyReceived) >= 1);
  check('Inventory Value comes from the central valuation engine', near(dash.summary.inventoryValue, require(path.join(BE, 'services', 'inventoryValuation.js')).totalValue()));

  console.log('\n=== 11-13: loading / error / retry (page) ===');
  const page = fs.readFileSync(path.join(FE, 'components', 'inventory', 'pages', 'Dashboard.js'), 'utf8');
  check('loading state uses Card loading (skeleton, not zeros)', /loading=\{loading\}/.test(page));
  check('cards are NOT rendered when an error occurs (no fake zeros)', /error \? \(/.test(page) && /\) : \(\s*<>/.test(page));
  check('error message is "Unable to load inventory summary."', /Unable to load inventory summary\./.test(page));
  check('no "restart the app" instruction remains', !/restart the app/i.test(page));
  check('Retry re-runs the dashboard query (onClick={load})', /onClick=\{load\}/.test(page));
  check('missing-bridge failure is self-diagnosing (logs bridge keys)', /getInventoryDashboard is not a function/.test(page));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e && e.stack ? e.stack : e); process.exit(1); });
