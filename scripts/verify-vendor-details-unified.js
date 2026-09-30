/**
 * verify-vendor-details-unified.js — ONE Vendor detail experience.
 *
 * Proves:
 *   • Both entry points (PO → View Vendor = page; Suppliers/Vendors = drawer)
 *     render the SAME shared VendorDetailsContent component.
 *   • The old simplified Suppliers/Vendors drawer markup is gone.
 *   • The shared content uses the SAME backend services for vendor info,
 *     Purchasing Summary and Vendor Activity — so the values cannot differ.
 *
 * Runs on a SCRATCH COPY.
 */
require('./lib/testDb.js').useScratchCopy({ label: 'verify-vendor-unified' });

const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const BE = path.join(ROOT, 'src', 'backend');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
const db = require(path.join(BE, 'models', 'dbmgr.js')).raw;
const PurchaseOrders = require(path.join(BE, 'models', 'purchaseOrders.js'));
const VendorSummary = require(path.join(BE, 'services', 'vendorPurchasingSummaryService.js'));

let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  -> ${d}` : ''}`); } };

const read = (rel) => fs.readFileSync(path.join(FE, rel), 'utf8');
const content = read('components/vendors/VendorDetailsContent.js');
const page = read('components/vendors/VendorDetails.js');
const list = read('components/vendors/SupplierVendorList.js');

console.log('\n=== one shared component ===');
check('VendorDetailsContent.js exists and is the shared content', /const VendorDetailsContent = \(\{ vendorId, mode/.test(content));
check('page shell (PO → View Vendor) renders the shared content', /<VendorDetailsContent[\s\S]{0,120}mode="page"/.test(page));
check('Suppliers/Vendors drawer renders the SAME shared content', /<VendorDetailsContent[\s\S]{0,200}mode="drawer"/.test(list));
check('the shared content is imported by both shells', /import VendorDetailsContent from '\.\/VendorDetailsContent'/.test(page) && /import VendorDetailsContent from '\.\/VendorDetailsContent'/.test(list));

console.log('\n=== old simplified drawer removed ===');
for (const marker of ['Amount Pending', 'Open Bills', 'getOpenBills', 'pendingBills', 'vendorColor', 'describeTaxRate']) {
  check(`SupplierVendorList no longer contains "${marker}"`, !list.includes(marker));
}
check('the drawer no longer fetches vendor/bills itself (only the page stat cards use getAllExpenses)', !/getSingleSupplier|getOpenBills/.test(list));
check('the drawer no longer has its own Info/Bills tab implementation', !/TabPane tab=/.test(list));

console.log('\n=== shared content wiring ===');
check('content loads vendor via getSingleSupplier', /getSingleSupplier/.test(content));
check('content loads activity via getVendorActivity', /getVendorActivity/.test(content));
check('content loads summary via getVendorPurchasingSummary', /getVendorPurchasingSummary/.test(content));
check('content has all 5 activity tabs', ['pos', 'receipts', 'bills', 'payments', 'credits'].every((k) => content.includes(`key="${k}"`)));
check('content shows the vendor information fields', ['Name', 'Company', 'Email', 'Phone', 'Mobile', 'Fax', 'Address', 'Opening Balance', 'Due Amount', 'Notes'].every((f) => content.includes(`label="${f}"`)));
check('PO references are clickable and use ?po=<id>', /purchase-orders\?po=\$\{r\.id\}/.test(content));
check('Bill references are clickable and use billId', /bills\/edit\/\$\{r\.id\}/.test(content));
check('content has loading skeleton (no zero flash)', /Spin tip="Loading vendor/.test(content));
check('content has controlled error + Retry', /Unable to load vendor details\./.test(content) && /onClick=\{\(\) => loadVendor\(id\)\}/.test(content));

console.log('\n=== drawer width / scrolling ===');
check('drawer uses a wide responsive width (90vw, capped 1600, min 1000)', /Math\.min\(Math\.max\(1000, Math\.round\([\s\S]{0,80}\* 0\.9\)\), 1600\)/.test(list));
check('drawer destroys on close so reopening refetches (no stale vendor)', /destroyOnClose/.test(list));
check('drawer header shows "Vendor: <name>"', /Vendor: \$\{viewingSupplier/.test(list));

console.log('\n=== data sources are shared + correct (functional) ===');
const sup = db.prepare("INSERT INTO suppliers (title, first_name, mobile_number, display_name, entered_by) VALUES ('','V','','ZZ Unified Vendor','test')").run();
const vendorId = Number(sup.lastInsertRowid);
const before = VendorSummary.getVendorPurchasingSummary(vendorId);
check('summary has the shared shape', before && ['openPurchaseOrders', 'received', 'bills', 'paid', 'outstanding', 'credits'].every((k) => k in before), JSON.stringify(before && Object.keys(before)));
check('a fresh vendor has 0 open POs', Number(before.openPurchaseOrders.count) === 0);

const poId = Number(db.prepare("INSERT INTO purchase_orders (po_number, vendor_id, po_date, status, subtotal, tax_total, total, created_by) VALUES (?,?,?,?,?,0,?, 't')").run(`ZZU-${Date.now()}`, vendorId, '2026-06-01', 'OPEN', 900, 900).lastInsertRowid);
db.prepare("INSERT INTO purchase_order_lines (purchase_order_id, item_id, line_no, description, item_type, unit, qty_ordered, qty_received, qty_billed, unit_cost, tax_rate, amount) VALUES (?,NULL,1,'x','SERVICE','Each',1,0,0,900,0,900)").run(poId);

const after = VendorSummary.getVendorPurchasingSummary(vendorId);
check('the new PO appears in Purchasing Summary (Open POs +1)', Number(after.openPurchaseOrders.count) === 1 && Number(after.openPurchaseOrders.amount) === 900, JSON.stringify(after.openPurchaseOrders));

const activity = PurchaseOrders.getVendorActivity(vendorId);
check('Vendor Activity has the shared 5 collections', activity && ['purchaseOrders', 'receipts', 'bills', 'payments', 'credits'].every((k) => Array.isArray(activity[k])));
check('Vendor Activity includes the new PO', activity.purchaseOrders.some((p) => Number(p.id) === poId));

// Both shells pass the SAME vendorId to the SAME component which calls the SAME
// services → identical values by construction. Assert the shells pass the id.
check('both shells pass vendorId (not a name) to the shared content', /vendorId=\{id\}/.test(page) && /vendorId=\{viewingSupplier\.id\}/.test(list));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
