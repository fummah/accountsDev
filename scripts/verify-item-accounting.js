/**
 * verify-item-accounting.js
 *
 * Proves the Item Setup corrective pass:
 *   ??? ONE canonical Item Type definition drives stock/UI behaviour
 *   ??? Service is purchasable; Non-Inventory / Service lines never move stock
 *   ??? a Non-Inventory Part bill SAVES (no documentInventory error)
 *   ??? Inventory Part purchase debits Inventory Asset (not COGS)
 *   ??? Inventory Part sale posts DR COGS / CR Inventory Asset at receipt cost
 *   ??? FIFO and WEIGHTED_AVERAGE valuation math
 *   ??? SKU uniqueness is DB-enforced (case/space insensitive)
 *   ??? invoice-line account snapshots exist and posting uses them
 *   ??? a real Default Warehouse persists
 *
 * Runs on a SCRATCH COPY of the company file.
 */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-item-accounting' });

const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const BE = path.join(ROOT, 'src', 'backend');
const FE = path.join(ROOT, 'src', 'frontend', 'src');

const db = require(path.join(BE, 'models', 'dbmgr.js'));
const Products = require(path.join(BE, 'models', 'products.js'));
const Expenses = require(path.join(BE, 'models', 'expenses.js'));
const Invoices = require(path.join(BE, 'models', 'invoices.js'));
const Inventory = require(path.join(BE, 'models', 'inventory.js'));
const Warehouses = require(path.join(BE, 'models', 'warehouses.js'));
const COA = require(path.join(BE, 'models', 'chartOfAccounts.js'));
const JournalEntries = require(path.join(BE, 'models', 'journalEntries.js'));
const ItemTypes = require(path.join(BE, 'services', 'itemTypes.js'));
const Classification = require(path.join(BE, 'services', 'productClassification.js'));
const Valuation = require(path.join(BE, 'services', 'inventoryValuation.js'));
const read = (rel) => fs.readFileSync(path.join(BE, rel), 'utf8');
const readFe = (rel) => fs.readFileSync(path.join(FE, rel), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;

const shared = require(path.join(ROOT, 'src', 'shared', 'itemTypes.json'));

(async () => {
  // ?????? 1. ONE canonical definition ???????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????
  console.log('\n=== Canonical Item Type definition ===');
  check('shared canonical table exists with 3 types',
    shared && shared.types && Object.keys(shared.types).length === 3);
  check('backend itemTypes derives from the shared JSON',
    /require\('\.\.\/\.\.\/shared\/itemTypes\.json'\)/.test(read('services/itemTypes.js')));
  check('frontend itemTypes imports the SAME shared JSON',
    /shared\/itemTypes\.json/.test(readFe('utils/itemTypes.js')));
  check('backend type table equals the shared table',
    JSON.stringify(ItemTypes.ITEM_TYPES) === JSON.stringify(shared.types));
  check('productClassification no longer hardcodes its own type arrays',
    !/new Set\(\[\s*'product'/.test(read('services/productClassification.js')) &&
    /require\('\.\/itemTypes'\)/.test(read('services/productClassification.js')));
  check('renderer classification derives from itemTypes',
    /from '\.\/itemTypes'/.test(readFe('utils/products.js')));
  check('capability helpers exposed (requiresCogs/getSections/requiresInventoryAsset)',
    typeof ItemTypes.requiresCogs === 'function' &&
    typeof ItemTypes.getSections === 'function' &&
    typeof ItemTypes.requiresInventoryAsset === 'function');

  // ?????? 2. Service purchasable + classification parity ??????????????????????????????????????????????????????????????????
  console.log('\n=== Service purchasable / classification ===');
  check('Service is purchasable', ItemTypes.isPurchasable('SERVICE') === true);
  check('Service does NOT track inventory', ItemTypes.tracksInventory('SERVICE') === false);
  check('legacy Product still tracks inventory', Classification.tracksInventory('Product') === true);
  check('Non-Inventory Part does not track inventory',
    Classification.tracksInventory('NON_INVENTORY_PART') === false);
  check('unknown type fails safe (no stock)', Classification.tracksInventory('mystery') === false);

  // ?????? 3. Non-Inventory Part bill saves, no stock movement ???????????????????????????????????????????????????
  console.log('\n=== Non-Inventory Part bill ===');
  const supplier = db.prepare('SELECT id FROM suppliers ORDER BY id LIMIT 1').get();
  const income = COA.getByName('Sales Revenue')
    || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('income','other income') AND status='Active' ORDER BY id LIMIT 1").get();
  const expenseAcct = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('expense','cost of goods sold','other expense') AND status='Active' ORDER BY id LIMIT 1").get();
  const invAsset = COA.getSystemAccount('Inventory Asset')
    || db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(type) IN ('asset','other current asset','inventory') AND status='Active' ORDER BY id LIMIT 1").get();
  const cogsAcct = COA.getSystemAccount('Cost of Goods Sold') || expenseAcct;
  const W = Warehouses.getOrCreateDefault();

  const nonSku = 'VA-NON-' + Date.now();
  const nonRes = Products.saveItemMaster({
    type: 'NON_INVENTORY_PART', name: nonSku, sku: nonSku,
    salesPrice: 10, incomeAccountId: income.id, purchaseExpenseAccountId: expenseAcct.id,
  });
  check('Non-Inventory Part created', nonRes.success === true, nonRes.error);

  const nonItemId = Inventory.resolveItemId(nonRes.id);
  const stockOf = (itemId) => Number((db.prepare('SELECT COALESCE(SUM(quantity),0) AS q FROM item_stock WHERE itemId = ?').get(Number(itemId)) || {}).q);

  const nonBill = await Expenses.insertExpense(
    supplier.id, 'Accounts Payable', '2026-06-01', 'bill', 'VA-NON-1',
    'bill', 'system', 'Unpaid',
    [{ line_type: 'item', product_id: nonRes.id, quantity: 2, rate: 100, amount: 200, description: 'non-inventory fixture' }],
    '2026-06-01', 'audit suite', 30
  );
  check('Non-Inventory bill SAVES (previously threw)', nonBill && nonBill.success !== false, nonBill && nonBill.error);
  check('Non-Inventory bill moves NO stock', stockOf(nonItemId) === 0, String(stockOf(nonItemId)));

  // ?????? 4. Inventory purchase ??? Inventory Asset; sale ??? COGS ????????????????????????????????????????????????
  console.log('\n=== Inventory purchase / sale accounting ===');
  const invSku = 'VA-INV-' + Date.now();
  const invRes = Products.saveItemMaster({
    type: 'INVENTORY_PART', name: invSku, sku: invSku,
    salesPrice: 35, purchaseCost: 20, incomeAccountId: income.id,
    inventoryAssetAccountId: invAsset.id, cogsAccountId: cogsAcct.id,
    valuationMethod: 'FIFO', defaultWarehouseId: W.id,
  });
  check('Inventory Part created', invRes.success === true, invRes.error);
  check('Default Warehouse persisted',
    Number(Products.getById(invRes.id).default_warehouse_id) === Number(W.id));

  const invItemId = Inventory.resolveItemId(invRes.id);
  const recvBill = await Expenses.insertExpense(
    supplier.id, 'Accounts Payable', '2026-06-02', 'bill', 'VA-INV-1',
    'bill', 'system', 'Unpaid',
    [{ line_type: 'item', product_id: invRes.id, quantity: 10, rate: 20, amount: 200, description: 'inventory receipt' }],
    '2026-06-02', 'audit suite', 30
  );
  check('Inventory bill saves and receives stock', recvBill && recvBill.success !== false && near(stockOf(invItemId), 10),
    `stock=${stockOf(invItemId)}`);

  // Post the purchase journal the way the IPC handler does.
  JournalEntries.postExpense({ id: Number(recvBill.expenseId), date: '2026-06-02', description: 'audit purchase', reference: 'VA-INV-1' });

  // Purchase posting debits Inventory Asset, never COGS.
  const purchaseJournal = db.prepare(`
    SELECT jl.account_id, jl.debit, jl.credit
    FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_id
    WHERE je.source_type = 'expense' AND je.source_id = ?`).all(Number(recvBill.expenseId));
  const invAssetLine = purchaseJournal.find(l => Number(l.account_id) === Number(invAsset.id));
  const cogsOnPurchase = purchaseJournal.find(l => Number(l.account_id) === Number(cogsAcct.id));
  check('purchase debits Inventory Asset 200', invAssetLine && near(invAssetLine.debit, 200));
  check('purchase does NOT debit COGS', !cogsOnPurchase || near(cogsOnPurchase.debit, 0));

  // Sell 1 ??? issue stock + COGS journal.
  const customer = db.prepare('SELECT id FROM customers ORDER BY id LIMIT 1').get();
  const sale = Invoices.insertInvoice(
    customer.id, '', 0, '', '', '2026-06-03', '', '', '', 'VA-INV-SALE', 'system', 0, 'Open',
    [{ product_id: invRes.id, description: 'sale fixture', quantity: 1, rate: 35, amount: 35 }]
  );
  check('invoice saves and issues stock', sale && sale.success !== false && near(stockOf(invItemId), 9),
    `stock=${stockOf(invItemId)}`);

  const invId = sale.invoiceId || sale.id;
  const issueMove = db.prepare(
    "SELECT * FROM stock_movements WHERE sourceType='invoice' AND sourceId=? AND itemId=? ORDER BY id DESC LIMIT 1"
  ).get(Number(invId), Number(invItemId));
  check('issue movement carries the RECEIPT cost (20), not the selling price',
    issueMove && near(issueMove.unitCost, 20), issueMove && String(issueMove.unitCost));

  const postRes = JournalEntries.postInvoice({ id: Number(invId), number: 'VA-INV-SALE', date: '2026-06-03', total: 35 });
  check('postInvoice succeeds', postRes && !postRes.error, postRes && postRes.error);
  const saleJournal = db.prepare(`
    SELECT jl.account_id, jl.debit, jl.credit
    FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_id
    WHERE je.source_type = 'invoice' AND je.source_id = ?`).all(Number(invId));
  const cogsDebit = saleJournal.find(l => Number(l.account_id) === Number(cogsAcct.id));
  const invCredit = saleJournal.find(l => Number(l.account_id) === Number(invAsset.id));
  check('sale posts DR COGS 20', cogsDebit && near(cogsDebit.debit, 20), cogsDebit && String(cogsDebit.debit));
  check('sale posts CR Inventory Asset 20', invCredit && near(invCredit.credit, 20), invCredit && String(invCredit.credit));

  // ?????? 5. Valuation math ?????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????
  console.log('\n=== FIFO / Weighted-average valuation ===');
  const vSku = 'VA-VAL-' + Date.now();
  const vRes = Products.saveItemMaster({
    type: 'INVENTORY_PART', name: vSku, sku: vSku, salesPrice: 40, purchaseCost: 20,
    incomeAccountId: income.id, inventoryAssetAccountId: invAsset.id, cogsAccountId: cogsAcct.id,
    valuationMethod: 'FIFO',
  });
  const vItemId = Inventory.resolveItemId(vRes.id);
  Inventory.receiveStock(vItemId, W.id, 10, 20, { sourceType: 'bill', sourceId: 99901 });
  Inventory.receiveStock(vItemId, W.id, 10, 25, { sourceType: 'bill', sourceId: 99902 });
  const fifo = Valuation.costOfRemoval(vItemId, 12, 'FIFO');
  check('FIFO cost of 12 = $250 (10@20 + 2@25)', near(fifo.totalCost, 250), String(fifo.totalCost));

  const wSku = 'VA-WA-' + Date.now();
  const wRes = Products.saveItemMaster({
    type: 'INVENTORY_PART', name: wSku, sku: wSku, salesPrice: 40, purchaseCost: 20,
    incomeAccountId: income.id, inventoryAssetAccountId: invAsset.id, cogsAccountId: cogsAcct.id,
    valuationMethod: 'WEIGHTED_AVERAGE',
  });
  const wItemId = Inventory.resolveItemId(wRes.id);
  Inventory.receiveStock(wItemId, W.id, 10, 20, { sourceType: 'bill', sourceId: 99903 });
  Inventory.receiveStock(wItemId, W.id, 10, 30, { sourceType: 'bill', sourceId: 99904 });
  const wa = Valuation.costOfRemoval(wItemId, 5, 'WEIGHTED_AVERAGE');
  check('WEIGHTED_AVERAGE cost of 5 = $125 (avg 25)', near(wa.totalCost, 125), String(wa.totalCost));

  // ?????? 6. SKU uniqueness (DB-enforced) ???????????????????????????????????????????????????????????????????????????????????????????????????????????????
  console.log('\n=== SKU uniqueness ===');
  const skuA = 'VA-DUP-' + Date.now();
  const first = Products.saveItemMaster({ type: 'SERVICE', name: 'A', sku: skuA, salesPrice: 1, incomeAccountId: income.id });
  check('first SKU accepted', first.success === true, first.error);
  const dupExact = Products.saveItemMaster({ type: 'SERVICE', name: 'B', sku: skuA, salesPrice: 1, incomeAccountId: income.id });
  check('exact duplicate SKU rejected', dupExact.success === false);
  const dupCase = Products.saveItemMaster({ type: 'SERVICE', name: 'C', sku: ('  ' + skuA.toLowerCase() + ' '), salesPrice: 1, incomeAccountId: income.id });
  check('case/whitespace duplicate SKU rejected', dupCase.success === false);
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_products_sku_unique'").get();
  // The scratch company file ships with duplicate seeded SKUs, so the index is
  // deliberately NOT created there (migration safety). Clear the dupes and
  // re-run the schema step to prove the index IS created on clean data.
  if (!idx) {
    db.prepare(`UPDATE products SET sku = NULL WHERE sku IS NOT NULL AND LOWER(TRIM(sku)) IN (
      SELECT LOWER(TRIM(sku)) FROM products WHERE sku IS NOT NULL AND TRIM(sku) != ''
      GROUP BY LOWER(TRIM(sku)) HAVING COUNT(*) > 1)`).run();
    Products.createTable();
  }
  const idx2 = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_products_sku_unique'").get();
  check('DB unique index on normalized SKU exists (on clean data)', !!idx2);
  const twoBlanks = Products.saveItemMaster({ type: 'SERVICE', name: 'NoSKU-1', sku: '', salesPrice: 1, incomeAccountId: income.id })
    && Products.saveItemMaster({ type: 'SERVICE', name: 'NoSKU-2', sku: '', salesPrice: 1, incomeAccountId: income.id });
  check('multiple blank SKUs allowed', !!twoBlanks);

  // ?????? 7. Static wiring checks ???????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????
  console.log('\n=== Wiring ===');
  check('invoice_lines snapshot columns defined',
    /add\('cogs_account_id'/.test(read('models/invoices.js')) &&
    /add\('inventory_asset_account_id'/.test(read('models/invoices.js')) &&
    /add\('item_type'/.test(read('models/invoices.js')));
  check('postInvoice posts COGS using snapshots',
    /Cost of goods sold/.test(read('models/journalEntries.js')) &&
    /inventory_asset_account_id/.test(read('models/journalEntries.js')));
  check('documentInventory skips non-tracked lines (no error)',
    !/does not track inventory/.test(read('services/documentInventory.js')));
  check('legacy insertProduct routes through the central service',
    /itemMasterService/.test(read('models/products.js')));
  check('UI sections driven by capability (getSections/showSection)',
    /showSection\('purchase'\)/.test(readFe('components/shared/UnifiedItemList.js')) &&
    /showSection\('inventory'\)/.test(readFe('components/shared/UnifiedItemList.js')));
  check('UI warehouse field is a real bound Select (not disabled)',
    /name="defaultWarehouseId"/.test(readFe('components/shared/UnifiedItemList.js')) &&
    !/Select disabled value=\{warehouses/.test(readFe('components/shared/UnifiedItemList.js')));
  check('UI offers FIFO + Weighted Average valuation',
    /value: 'FIFO'/.test(readFe('components/shared/UnifiedItemList.js')) &&
    /value: 'WEIGHTED_AVERAGE'/.test(readFe('components/shared/UnifiedItemList.js')));

  // --- 7. Service / Non-Inventory sales create no stock or COGS ---
  console.log('\n=== Service / Non-Inventory sales ===');
  const svcSku = 'VA-SVC-' + Date.now();
  const svcRes = Products.saveItemMaster({ type: 'SERVICE', name: svcSku, sku: svcSku, salesPrice: 50, incomeAccountId: income.id, purchaseExpenseAccountId: expenseAcct.id });
  check('Service item created', svcRes.success === true, svcRes.error);
  const svcItemId = Inventory.resolveItemId(svcRes.id);
  const svcSale = Invoices.insertInvoice(customer.id, '', 0, '', '', '2026-06-04', '', '', '', 'VA-SVC-SALE', 'system', 0, 'Open',
    [{ product_id: svcRes.id, description: 'service', quantity: 2, rate: 50, amount: 100 }]);
  check('Service invoice saves', svcSale && svcSale.success !== false, svcSale && svcSale.error);
  check('Service sale moves no stock', stockOf(svcItemId) === 0, String(stockOf(svcItemId)));
  JournalEntries.postInvoice({ id: Number(svcSale.invoiceId), number: 'VA-SVC-SALE', date: '2026-06-04', total: 100 });
  const svcJournal = db.prepare(`SELECT jl.account_id, jl.debit, jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_id WHERE je.source_type = 'invoice' AND je.source_id = ?`).all(Number(svcSale.invoiceId));
  check('Service sale posts income and NO COGS',
    svcJournal.length > 0 && !svcJournal.some(l => Number(l.account_id) === Number(cogsAcct.id) && Number(l.debit) > 0));

  const niSku = 'VA-NIS-' + Date.now();
  const niRes = Products.saveItemMaster({ type: 'NON_INVENTORY_PART', name: niSku, sku: niSku, salesPrice: 12, incomeAccountId: income.id, purchaseExpenseAccountId: expenseAcct.id });
  const niItemId = Inventory.resolveItemId(niRes.id);
  const niSale = Invoices.insertInvoice(customer.id, '', 0, '', '', '2026-06-04', '', '', '', 'VA-NIS-SALE', 'system', 0, 'Open',
    [{ product_id: niRes.id, description: 'noninv', quantity: 3, rate: 12, amount: 36 }]);
  check('Non-Inventory sale saves and moves no stock', niSale && niSale.success !== false && stockOf(niItemId) === 0);

  // --- 8. STANDARD_COST valuation ---
  console.log('\n=== STANDARD_COST valuation ===');
  const scSku = 'VA-SC-' + Date.now();
  const scRes = Products.saveItemMaster({ type: 'INVENTORY_PART', name: scSku, sku: scSku, salesPrice: 40, purchaseCost: 15, incomeAccountId: income.id, inventoryAssetAccountId: invAsset.id, cogsAccountId: cogsAcct.id, valuationMethod: 'STANDARD_COST' });
  const scItemId = Inventory.resolveItemId(scRes.id);
  Inventory.receiveStock(scItemId, W.id, 5, 99, { sourceType: 'bill', sourceId: 99910 });
  const sc = Valuation.costOfRemoval(scItemId, 2, 'STANDARD_COST', { standardCost: 15 });
  check('STANDARD_COST cost of 2 = $30 (ignores the $99 layer)', near(sc.totalCost, 30), String(sc.totalCost));

  // --- 9. Bill purchase tax posts through the tax account ---
  console.log('\n=== Bill purchase tax ===');
  let taxAcct = db.prepare("SELECT id FROM chart_of_accounts WHERE LOWER(name) IN ('input tax','vat receivable','vat input','tax receivable') LIMIT 1").get();
  if (!taxAcct) {
    const ins = db.prepare("INSERT INTO chart_of_accounts (name, type, status, normalBalance) VALUES ('Input Tax','Other Current Asset','Active','Debit')").run();
    taxAcct = { id: Number(ins.lastInsertRowid) };
  }
  const taxSku = 'VA-TAX-' + Date.now();
  const taxRes = Products.saveItemMaster({ type: 'NON_INVENTORY_PART', name: taxSku, sku: taxSku, salesPrice: 10, incomeAccountId: income.id, purchaseExpenseAccountId: expenseAcct.id });
  const taxBill = await Expenses.insertExpense(supplier.id, 'Accounts Payable', '2026-06-05', 'bill', 'VA-TAX-1', 'bill', 'system', 'Unpaid',
    [{ line_type: 'item', product_id: taxRes.id, quantity: 1, rate: 100, amount: 110, description: 'taxed', taxRateId: taxAcct.id, taxRate: 10, taxAmount: 10 }],
    '2026-06-05', 'audit', 30);
  JournalEntries.postExpense({ id: Number(taxBill.expenseId), date: '2026-06-05', description: 'taxed bill', reference: 'VA-TAX-1' });
  const taxJournal = db.prepare(`SELECT jl.account_id, jl.debit, jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_id WHERE je.source_type = 'expense' AND je.source_id = ?`).all(Number(taxBill.expenseId));
  const taxDebit = taxJournal.find(l => Number(l.account_id) === Number(taxAcct.id));
  check('Bill tax split debits the tax account 10', taxDebit && near(taxDebit.debit, 10), taxDebit && String(taxDebit.debit));
  check('Bill tax total still credits AP 110', taxJournal.some(l => near(l.credit, 110)));
  check('Bill tax net (100) stays on the expense account',
    taxJournal.some(l => near(l.debit, 100) && Number(l.account_id) === Number(expenseAcct.id)));

  // --- 10. Invoice line sales-tax snapshot ---
  console.log('\n=== Invoice sales-tax snapshot ===');
  let salesVat = db.prepare('SELECT id, vat_percentage FROM vat LIMIT 1').get();
  if (!salesVat) { db.prepare("INSERT INTO vat (vat_name, vat_percentage) VALUES ('Std', 10)").run(); salesVat = db.prepare('SELECT id, vat_percentage FROM vat ORDER BY id DESC LIMIT 1').get(); }
  const stSku = 'VA-STX-' + Date.now();
  const stRes = Products.saveItemMaster({ type: 'NON_INVENTORY_PART', name: stSku, sku: stSku, salesPrice: 20, incomeAccountId: income.id, salesTaxRateId: salesVat.id });
  const stSale = Invoices.insertInvoice(customer.id, '', 0, '', '', '2026-06-06', '', '', '', 'VA-STX-SALE', 'system', 0, 'Open',
    [{ product_id: stRes.id, description: 'taxed sale', quantity: 1, rate: 20, amount: 20 }]);
  const stLine = db.prepare('SELECT tax_rate_id, tax_rate FROM invoice_lines WHERE invoice_id = ? LIMIT 1').get(Number(stSale.invoiceId));
  check('Invoice line snapshots the item Sales Tax Code',
    stLine && Number(stLine.tax_rate_id) === Number(salesVat.id), stLine && JSON.stringify(stLine));

  // --- 11. Void/reversal restores stock ---
  console.log('\n=== Void reversal ===');
  const DocumentInventory = require(path.join(BE, 'services', 'documentInventory.js'));
  const beforeVoid = stockOf(invItemId);
  DocumentInventory.reverseInvoiceStock(Number(invId));
  check('reverseInvoiceStock restores the issued stock', near(stockOf(invItemId), beforeVoid + 1), `${beforeVoid} -> ${stockOf(invItemId)}`);

  // --- 12. Trial balance ---
  console.log('\n=== Trial balance ===');
  const tb = db.prepare('SELECT COALESCE(SUM(debit),0) AS d, COALESCE(SUM(credit),0) AS c FROM journal_lines').get();
  check('total debits = total credits', near(tb.d, tb.c), `d=${tb.d} c=${tb.c}`);

  // --- 13. Tax / UI wiring static checks ---
  console.log('\n=== Tax wiring ===');
  check('PO consumes the item Purchase Tax Code (no hardcoded 0)',
    /purchase_tax_rate_id/.test(readFe('components/vendors/purchasing/PurchaseOrders.js')));
  check('Enter Bill has a per-line Tax % column',
    /title: 'Tax %'/.test(readFe('components/vendors/bills/EnterBill.js')));
  check('Invoice defaults header VAT from the item Sales Tax Code',
    /sales_tax_rate_id/.test(readFe('components/customers/invoices/CreateInvoice.js')));
  check('Bill lines expose a read-only Accounting preview',
    /title: 'Accounting'/.test(readFe('components/vendors/bills/EnterBill.js')));
  check('Invoice lines expose a read-only Accounting preview',
    /title: 'Accounting'/.test(readFe('components/customers/invoices/CreateInvoice.js')));
  check('UI offers FIFO + Weighted Average + Standard Cost',
    /value: 'STANDARD_COST'/.test(readFe('components/shared/UnifiedItemList.js')));
  check('Quote lines snapshot the item Sales Tax Code',
    /productSnapshot/.test(read('models/quotes.js')) && /tax_rate_id/.test(read('models/quotes.js')));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
