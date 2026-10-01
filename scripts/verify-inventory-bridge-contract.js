/**
 * verify-inventory-bridge-contract.js — ONE contract, enforced across layers.
 *
 * Reads src/frontend/src/shared/inventoryBridge.json (the single source of
 * truth) and proves, for EVERY entry:
 *   • the REAL preload exposes the method,
 *   • calling it invokes EXACTLY the contract channel,
 *   • an ipcMain handler is registered for that channel,
 *   • the preload's self-reported inventoryApiVersion matches the contract.
 *
 * This is what makes "renderer contract = preload = IPC = main handler" a tested
 * invariant instead of a hope.
 */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-bridge-contract' });

const path = require('path');
const fs = require('fs');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
const BE = path.join(ROOT, 'src', 'backend');
const FE = path.join(ROOT, 'src', 'frontend', 'src');

let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  -> ${d}` : ''}`); } };

const contract = JSON.parse(fs.readFileSync(path.join(FE, 'shared', 'inventoryBridge.json'), 'utf8'));

// ── Stub electron: capture the exposed bridge AND the registered handlers ───
const bridge = {};
const invoked = [];
const handlers = new Map();
const electronStub = {
  contextBridge: { exposeInMainWorld: (n, a) => { bridge[n] = a; } },
  ipcRenderer: { invoke: (ch) => { invoked.push(ch); return Promise.resolve({}); }, on() {}, send() {}, removeAllListeners() {}, sendSync() {} },
  ipcMain: { handle: (ch, fn) => { handlers.set(ch, fn); } },
  webUtils: { getPathForFile: () => '' },
  shell: { openExternal() {} },
};
const origLoad = Module._load;
Module._load = function (request) { if (request === 'electron') return electronStub; return origLoad.apply(this, arguments); };

require(path.join(BE, 'preload.js'));
require(path.join(BE, 'handlers', 'inventoryHandlers.js'))();
require(path.join(BE, 'handlers', 'vendorCreditHandlers.js'))();
require(path.join(BE, 'handlers', 'ipcHandlers.js'))();

const api = bridge[contract.bridge];
console.log(`\n=== contract v${contract.version} (bridge: ${contract.bridge}) ===`);
check(`preload exposes the "${contract.bridge}" bridge`, !!api);
check('preload self-reports the SAME inventoryApiVersion as the contract', (() => { const i = api.getBridgeInfo && api.getBridgeInfo(); return i && i.inventoryApiVersion === contract.version; })(), JSON.stringify(api.getBridgeInfo && api.getBridgeInfo()));

console.log('\n=== per-entry: preload method + channel + IPC handler ===');
for (const e of contract.entries) {
  const exposed = typeof api[e.method] === 'function';
  invoked.length = 0;
  if (exposed) { try { api[e.method](1, {}); } catch { /* args irrelevant */ } }
  const channelOk = invoked.includes(e.channel);
  const handlerOk = handlers.has(e.channel);
  check(`${e.method} → ${e.channel}`, exposed && channelOk && handlerOk,
    `exposed=${exposed} channelInvoked=${channelOk} handlerRegistered=${handlerOk}`);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
