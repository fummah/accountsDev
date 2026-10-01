/**
 * verify-inventory-adjustments.js — the redesigned Inventory Adjustments.
 *
 * Proves an adjustment is a proper transaction that never overwrites QOH:
 *   adjustment row + inventory MOVEMENT + stock delta + journal entry, atomic,
 *   idempotent (requestId), with before/after quantity AND value, a backend
 *   reference, and a reversal that preserves the audit trail.
 *
 * Runs on a SCRATCH COPY.
 */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-inventory-adjustments' });

const path = require('path');
const fs = require('fs');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
const BE = path.join(ROOT, 'src', 'backend');
const FE = path.join(ROOT, 'src', 'frontend', 'src');

let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  -> ${d}` : ''}`); } };
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

// ── Stub electron (bridge + handlers) ───────────────────────────────────────
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

const db = require(path.join(BE, 'models', 'dbmgr.js')).raw;
const Products = require(path.join(BE, 'models', 'products.js'));
const Inventory = require(path.join(BE, 'models', 'inventory.js'));
const Warehouses = require(path.join(BE, 'models', 'warehouses.js'));
const COA = require(path.join(BE, 'models', 'chartOfAccounts.js'));
const ItemStatus = require(path.join(BE, 'services', 'inventoryStockStatus.js'));
const Valuation = require(path.join(BE, 'services', 'inventoryValuation.js'));

const W = Warehouses.getOrCreateDefault();
const income = COA.getByName('Sales Revenue') || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('income','other income') AND status='Active' LIMIT 1").get();
const invAsset = COA.getSystemAccount('Inventory Asset');
const cogs = COA.getSystemAccount('Cost of Goods Sold');
const stamp = Date.now();
let seq = 0;
const mkProduct = (name, extra = {}) => Products.saveItemMaster({ type: 'INVENTORY_PART', name, sku: `${name}-${stamp}-${++seq}`, salesPrice: 35, purchaseCost: 20, incomeAccountId: income.id, inventoryAssetAccountId: invAsset.id, cogsAccountId: cogs.id, valuationMethod: 'FIFO', ...extra });
const itemIdOf = (pid) => Inventory.resolveItemId(Number(pid));
const qoh = (pid) => Number(db.prepare('SELECT COALESCE(SUM(quantity),0) q FROM item_stock WHERE itemId=?').get(itemIdOf(pid)).q);
const moves = (pid) => db.prepare("SELECT * FROM stock_movements WHERE itemId=? AND refType='ADJUSTMENT' ORDER BY id").all(itemIdOf(pid));

(async () => {
  console.log('\n=== increase / decrease with before/after qty + value ===');
  const P = mkProduct('ADJ Widget'); Inventory.receiveStock(itemIdOf(P.id), W.id, 20, 20, { sourceType: 'receipt', sourceId: ++seq + 300000 });
  const inc = Inventory.adjustStock(itemIdOf(P.id), W.id, 5, { reason: 'Found', productId: P.id, createdBy: 'tester' });
  check('increase +5 succeeds with a backend reference', inc.success && /^ADJ-\d{6}$/.test(inc.reference || ''), JSON.stringify(inc));
  check('before/after quantity correct (20 → 25)', inc.qtyBefore === 20 && inc.qtyAfter === 25);
  check('value change = +100, new value tracked', near(inc.valueChange, 100) && near(inc.valueAfter, inc.valueBefore + 100));
  check('an inventory MOVEMENT was created (+5)', moves(P.id).some((m) => near(m.quantityChange, 5)));

  const dec = Inventory.adjustStock(itemIdOf(P.id), W.id, -5, { reason: 'Damaged', productId: P.id });
  check('decrease -5 → 20, value -100', dec.qtyAfter === 20 && near(dec.valueChange, -100), JSON.stringify(dec));

  console.log('\n=== never overwrites QOH (movement ledger == item_stock) ===');
  const mvSum = db.prepare('SELECT COALESCE(SUM(quantityChange),0) q FROM stock_movements WHERE itemId=?').get(itemIdOf(P.id)).q;
  check('item_stock equals the movement ledger', near(qoh(P.id), mvSum), `${qoh(P.id)} vs ${mvSum}`);

  console.log('\n=== accounting posted (Inventory Asset / configured offset) ===');
  check('the increase posted a journal entry', inc.journalId != null && db.prepare('SELECT id FROM journal_entries WHERE id=?').get(inc.journalId));
  const gl = db.prepare('SELECT account_id, debit, credit FROM journal_lines WHERE journal_id=?').all(inc.journalId);
  const offset = COA.getSystemAccount('Inventory Adjustment');
  check('increase: Dr Inventory Asset / Cr configured offset', gl.some((l) => Number(l.account_id) === Number(invAsset.id) && near(l.debit, 100)) && gl.some((l) => Number(l.account_id) === Number(offset.id) && near(l.credit, 100)));

  console.log('\n=== idempotency (requestId) ===');
  const beforeMoves = moves(P.id).length;
  const reqId = `req-${stamp}`;
  const a1 = Inventory.adjustStock(itemIdOf(P.id), W.id, 3, { reason: 'Correction', productId: P.id, requestId: reqId });
  const a2 = Inventory.adjustStock(itemIdOf(P.id), W.id, 3, { reason: 'Correction', productId: P.id, requestId: reqId });
  check('the second post with the same requestId is a no-op', a1.success && a2.success && a2.duplicate === true && a2.adjustmentId === a1.adjustmentId);
  check('only ONE movement was created for the requestId', moves(P.id).length === beforeMoves + 1, `${beforeMoves} → ${moves(P.id).length}`);

  console.log('\n=== positive adjustment needs a cost basis when there is none ===');
  const P2 = mkProduct('ADJ NoStock', { purchaseCost: 0 });
  const noCost = Inventory.adjustStock(itemIdOf(P2.id), W.id, 10, { reason: 'Found', productId: P2.id });
  check('positive with no basis and no unit cost → value change 0 (flagged to the user)', near(noCost.valueChange, 0), JSON.stringify(noCost));
  const withCost = Inventory.adjustStock(itemIdOf(P2.id), W.id, 10, { reason: 'Found', productId: P2.id, unitCost: 15 });
  check('unit cost override gives a real value change (+150)', near(withCost.valueChange, 150), JSON.stringify(withCost));

  console.log('\n=== low stock / out of stock derive from central status ===');
  const P3 = mkProduct('ADJ Low', { reorderPoint: 10 });
  Inventory.receiveStock(itemIdOf(P3.id), W.id, 12, 20, { sourceType: 'receipt', sourceId: ++seq + 300000 });
  Inventory.adjustStock(itemIdOf(P3.id), W.id, -3, { reason: 'Damaged', productId: P3.id });
  check('12 → 9 crosses reorder → Low Stock', qoh(P3.id) === 9 && ItemStatus.getStatusForItem(P3.id).status === 'LOW_STOCK');
  Inventory.adjustStock(itemIdOf(P3.id), W.id, -9, { reason: 'Lost', productId: P3.id });
  check('9 → 0 → Out of Stock', qoh(P3.id) === 0 && ItemStatus.getStatusForItem(P3.id).status === 'OUT_OF_STOCK');

  console.log('\n=== history / detail / reversal ===');
  const rows = Inventory.listAdjustments({ search: 'ADJ Widget' });
  check('listAdjustments returns our item adjustments newest first', rows.length >= 2 && Number(rows[0].id) > Number(rows[rows.length - 1].id));
  check('history rows carry product + warehouse names', rows.every((r) => 'productName' in r && 'warehouseName' in r));
  const upOnly = Inventory.listAdjustments({ search: 'ADJ Widget', direction: 'increase' });
  check('direction=increase filter', upOnly.every((r) => Number(r.quantity) > 0));

  const detail = Inventory.getAdjustment(inc.adjustmentId);
  check('getAdjustment returns the full record', detail && detail.reference === inc.reference && near(detail.valueChange, 100));

  const rev = Inventory.reverseAdjustment(dec.adjustmentId, { createdBy: 'tester' });
  check('reverseAdjustment posts an opposite adjustment', rev.success && near(rev.quantity, 5), JSON.stringify(rev));
  const origAfter = Inventory.getAdjustment(dec.adjustmentId);
  check('the original is marked Reversed and links the reversal', origAfter.status === 'Reversed' && origAfter.reversedById === rev.adjustmentId);
  const revDetail = Inventory.getAdjustment(rev.adjustmentId);
  check('the reversal links back to the original', revDetail.reversalOfId === dec.adjustmentId);
  check('a second reverse is rejected', Inventory.reverseAdjustment(dec.adjustmentId).success === false);

  console.log('\n=== atomic rollback (GL failure) ===');
  const JournalEntries = require(path.join(BE, 'models', 'journalEntries.js'));
  const P4 = mkProduct('ADJ Atomic'); Inventory.receiveStock(itemIdOf(P4.id), W.id, 10, 20, { sourceType: 'receipt', sourceId: ++seq + 300000 });
  const qohBefore = qoh(P4.id); const mvBefore = moves(P4.id).length;
  const origPost = JournalEntries.post;
  JournalEntries.post = () => ({ error: 'forced GL failure' });
  const failed = Inventory.adjustStock(itemIdOf(P4.id), W.id, -2, { reason: 'Damaged', productId: P4.id });
  JournalEntries.post = origPost;
  check('a failed GL post rolls the whole adjustment back (no stock, no movement)', failed.success === false && qoh(P4.id) === qohBefore && moves(P4.id).length === mvBefore, `qoh ${qohBefore}→${qoh(P4.id)}`);

  console.log('\n=== bridge (renderer → preload → IPC → engine) ===');
  const api = bridge.electronAPI || {};
  for (const [method, channel] of [['adjustInventory', 'adjust-inventory'], ['getAdjustments', 'get-adjustments'], ['getAdjustment', 'get-adjustment'], ['reverseAdjustment', 'reverse-adjustment'], ['getAdjustmentContext', 'get-adjustment-context']]) {
    invoked.length = 0;
    const exposed = typeof api[method] === 'function';
    if (exposed) { try { api[method](1, {}); } catch { /* args irrelevant */ } }
    check(`${method} → ${channel}`, exposed && invoked.includes(channel) && handlers.has(channel), `exposed=${exposed} invoked=${invoked.includes(channel)} handler=${handlers.has(channel)}`);
  }

  console.log('\n=== page wiring ===');
  const page = fs.readFileSync(path.join(FE, 'components', 'inventory', 'pages', 'Adjustments.js'), 'utf8');
  check('page has a structured reason dropdown with the required reasons', ['Damaged', 'Lost', 'Found', 'Physical Count', 'Correction'].every((r) => page.includes(r)) && /Select reason/.test(page));
  check('page has Increase / Decrease / Physical Count modes', /Physical Count/.test(page) && /increase/.test(page) && /decrease/.test(page));
  check('page shows read-only Current Quantity + New Quantity', /Current Quantity/.test(page) && /New Quantity/.test(page) && /readOnly/.test(page));
  check('page shows a valuation preview', /Carrying Cost/.test(page) && /Value Change/.test(page) && /New Inventory Value/.test(page));
  check('page loads authoritative context on item select', /getAdjustmentContext/.test(page));
  check('page has adjustment history + detail + reverse', /getAdjustments/.test(page) && /getAdjustment\b/.test(page) && /reverseAdjustment/.test(page));
  check('page uses labels (not placeholder-only) for the core fields', /Adjustment Date/.test(page) && /Reason Details/.test(page) && /Notes/.test(page));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e && e.stack ? e.stack : e); process.exit(1); });
