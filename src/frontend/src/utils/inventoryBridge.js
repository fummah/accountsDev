import contract from '../shared/inventoryBridge.json';

/**
 * inventoryBridge.js — the RENDERER side of the single Inventory bridge contract.
 *
 * It reads src/shared/inventoryBridge.json (the same file the contract test uses
 * to check the preload + IPC handlers) and validates that the ACTUAL runtime
 * bridge exposes every Inventory method before the app uses it. If the running
 * preload is stale/incomplete, it logs the exact missing methods + the loaded
 * bridge's self-reported version — and throws ONE clean error. No fake data.
 */
export const INVENTORY_BRIDGE_VERSION = contract.version;
export const REQUIRED_INVENTORY_METHODS = contract.entries.map((e) => e.method);

export const missingInventoryMethods = () => {
  const api = (typeof window !== 'undefined' && window.electronAPI) || null;
  if (!api) return REQUIRED_INVENTORY_METHODS.slice();
  return contract.entries.filter((e) => typeof api[e.method] !== 'function').map((e) => e.method);
};

/** The validated bridge, or a controlled throw. */
export const getInventoryApi = () => {
  const api = (typeof window !== 'undefined' && window.electronAPI) || null;
  const missing = missingInventoryMethods();
  if (missing.length) {
    let info = null;
    try { info = api && typeof api.getBridgeInfo === 'function' ? api.getBridgeInfo() : null; } catch { /* ignore */ }
    console.error(
      `[inventory bridge] the loaded preload is stale/incomplete. Expected contract v${contract.version}.`,
      { missingMethods: missing, bridgePresent: !!api, bridgeInfo: info }
    );
    const err = new Error('The Inventory bridge is unavailable in this build.');
    err.code = 'INVENTORY_BRIDGE_INCOMPLETE';
    err.missingMethods = missing;
    throw err;
  }
  return api;
};

export default getInventoryApi;
