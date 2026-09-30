/**
 * verify-preload-contract.js — the Electron bridge CONTRACT test.
 *
 * Loads the REAL preload (with a stubbed `electron`) and asserts that every
 * Inventory / Purchasing method the renderer calls is actually exposed on
 * `window.electronAPI`. This is the regression guard for the exact class of bug
 * where the renderer is rebuilt but the preload bridge is stale/missing a method.
 *
 * It also scans EVERY `electronAPI.<method>` used anywhere in the renderer and
 * reports any that the preload does not expose (an explicit, documented
 * allow-list covers known pre-existing non-inventory gaps).
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  -> ${d}` : ''}`); } };

// Known pre-existing gaps OUTSIDE the inventory/purchasing scope (documented).
const ALLOWLIST = new Set(['payTestConnection']);

// ── Load the real preload, capturing what contextBridge exposes ─────────────
const bridge = {};
const electronStub = {
  contextBridge: { exposeInMainWorld: (name, api) => { bridge[name] = api; } },
  ipcRenderer: { invoke: async () => ({}), on() {}, send() {}, removeAllListeners() {}, sendSync() {} },
  webUtils: { getPathForFile: () => '' },
  shell: { openExternal() {} },
};
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) { if (request === 'electron') return electronStub; return origLoad.apply(this, arguments); };
require(path.join(ROOT, 'src', 'backend', 'preload.js'));

const api = bridge.electronAPI || {};
const exposed = new Set(Object.keys(api));

console.log('\n=== contextBridge ===');
check('preload exposes exactly one global: electronAPI', Object.keys(bridge).length === 1 && !!bridge.electronAPI, Object.keys(bridge).join(','));
check('bridge self-description getBridgeInfo() reports the inventory methods', (() => { const i = api.getBridgeInfo && api.getBridgeInfo(); return i && i.hasInventoryDashboard === true && i.hasReorderNeeded === true && i.hasInventoryAlerts === true; })(), JSON.stringify(api.getBridgeInfo && api.getBridgeInfo()));

console.log('\n=== required Inventory / Purchasing bridge methods ===');
const REQUIRED = [
  'getInventoryDashboard', 'getInventoryAlerts', 'getInventoryReconciliation',
  'getReorderNeeded', 'getInventoryMovementReport', 'getItemProfitabilities',
  'getItemProfitability', 'getItemMovements', 'getItemHistory', 'getItemDetail',
  'adjustInventory', 'setReorderPoint', 'getWarehouses', 'getProductsFiltered',
  'getProductsPaginated', 'getAllProducts',
  'getPurchasingDashboard', 'getPurchasingReports', 'getExpectedDeliveries',
  'getVendorPurchasingSummary', 'getPurchaseOrders', 'getPurchaseOrder',
  'savePurchaseOrder', 'setPurchaseOrderStatus', 'receivePurchaseOrder',
  'getGoodsReceipt', 'getOpenPurchaseOrders', 'vendorCreditsUpdate',
];
for (const m of REQUIRED) check(`electronAPI.${m} is exposed`, exposed.has(m));

console.log('\n=== full renderer → preload usage audit ===');
const used = new Map();
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|build/.test(e.name)) walk(p); continue; }
    if (!/\.(js|jsx)$/.test(e.name)) continue;
    const src = fs.readFileSync(p, 'utf8');
    const re = /electronAPI\s*\??\.\s*([A-Za-z0-9_]+)/g; let m;
    while ((m = re.exec(src))) { if (!used.has(m[1])) used.set(m[1], p.replace(ROOT + '\\', '')); }
  }
};
walk(path.join(ROOT, 'src', 'frontend', 'src'));
const missing = [...used.entries()].filter(([k]) => !exposed.has(k) && !ALLOWLIST.has(k));
check(`every renderer electronAPI.<method> is exposed (${used.size} used, allowlist ${ALLOWLIST.size})`, missing.length === 0, missing.map(([k, f]) => `${k} (${f})`).join('; '));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
