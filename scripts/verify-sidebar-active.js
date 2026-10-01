/**
 * verify-sidebar-active.js — the sidebar highlights the CURRENT ROUTE.
 *
 * Proves:
 *   • resolveActiveMenuKey maps list/new/detail/query routes to the right item,
 *   • nested Invoice/PO/vendor routes keep their parent item active,
 *   • the owning SubMenu is expanded for an active child,
 *   • the sidebar uses route-derived state (no click-only active state),
 *   • the active style (#F5C542) is defined once in CSS.
 *
 * The sidebarActive util is ESM; this verifier evaluates it in CJS (it has no
 * imports) so the real matcher logic is exercised.
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend', 'src');

let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  -> ${d}` : ''}`); } };

// ── Load the real matcher (transform the ESM util to CJS) ───────────────────
const utilSrc = fs.readFileSync(path.join(FE, 'utils', 'sidebarActive.js'), 'utf8');
const cjs = `${utilSrc.replace(/export const /g, 'const ')}
module.exports = { normalizePath, isRouteActive, resolveActiveMenuKey, parentOf, SIDEBAR_MENU };`;
const mod = { exports: {} };
// eslint-disable-next-line no-new-func
new Function('module', 'exports', cjs)(mod, mod.exports);
const { resolveActiveMenuKey, isRouteActive, parentOf, SIDEBAR_MENU } = mod.exports;

console.log('\n=== route → active menu item ===');
const cases = [
  ['/main/customers/invoices/list', 'main/customers/invoices/list', 'Invoices list'],
  ['/main/customers/invoices/new', 'main/customers/invoices/list', 'New Invoice'],
  ['/main/customers/invoices/edit/123', 'main/customers/invoices/list', 'Invoice detail'],
  ['/main/customers/invoices/list?status=Open', 'main/customers/invoices/list', 'Invoices with query'],
  ['/main/customers/quotes/new', 'main/customers/quotes/list', 'New Quote'],
  ['/main/vendors/purchasing/purchase-orders', 'main/vendors/purchasing/purchase-orders', 'Purchase Orders'],
  ['/main/vendors/purchasing/purchase-orders?po=5', 'main/vendors/purchasing/purchase-orders', 'PO detail (query)'],
  ['/main/vendors/details/9', 'main/expenses/suppliers', 'Vendor detail → Suppliers/Vendors'],
  ['/main/vendors/bills/edit/4', 'main/vendors/bills/tracker', 'Bill edit → Bill Management'],
  ['/main/inventory/dashboard', 'main/inventory/dashboard', 'Inventory Dashboard'],
  ['/main/inventory/reorder', 'main/inventory/reorder', 'Reorder Needed'],
  ['/main/inventory/movement-report', 'main/inventory/movement-report', 'Movement Report'],
  ['/main/inventory/profitability', 'main/inventory/profitability', 'Item Profitability'],
  ['/main/customers/payment-history/7', 'main/customers/payments', 'Payment history → Payments'],
];
for (const [route, expected, label] of cases) {
  check(`${label}: ${route} → ${expected}`, resolveActiveMenuKey(route) === expected, String(resolveActiveMenuKey(route)));
}

console.log('\n=== no false matches ===');
check('/main/dashboard/home → home (not home-dash)', resolveActiveMenuKey('/main/dashboard/home') === 'main/dashboard/home');
check('/main/dashboard/home-dash → home-dash', resolveActiveMenuKey('/main/dashboard/home-dash') === 'main/dashboard/home-dash');
check('/main/customers/invoices/list does NOT match Quotes', resolveActiveMenuKey('/main/customers/invoices/list') !== 'main/customers/quotes/list');
check('an unknown route resolves to nothing', resolveActiveMenuKey('/totally/unknown') === null);
check('isRouteActive nested + alias', isRouteActive('/main/customers/invoices/123', 'main/customers/invoices') === true && isRouteActive('/main/customers/invoices', 'main/customers/quotes') === false);

console.log('\n=== parent expansion ===');
check('Invoices → Sales group', parentOf('main/customers/invoices/list') === 'sub-sales');
check('Inventory Dashboard → Inventory group', parentOf('main/inventory/dashboard') === 'sub-inventory');
check('Purchase Orders → Expenses group', parentOf('main/vendors/purchasing/purchase-orders') === 'sub-expenses');
check('every menu entry declares a parent (or top-level null)', SIDEBAR_MENU.every((e) => 'parent' in e));

console.log('\n=== sidebar uses route-derived state ===');
const sidebar = fs.readFileSync(path.join(FE, 'containers', 'Sidebar', 'SidebarContent.js'), 'utf8');
check('active key derived from the route', /resolveActiveMenuKey\(pathname\)/.test(sidebar));
check('Menu selectedKeys uses the derived active key', /selectedKeys=\{activeKey \? \[activeKey\] : \[\]\}/.test(sidebar));
check('Menu controls openKeys from the active parent', /openKeys=\{sidebarCollapsed \? undefined : openKeys\}/.test(sidebar) && /parentOf\(activeKey\)/.test(sidebar));
check('adds aria-current="page" to the active link', /setAttribute\('aria-current', 'page'\)/.test(sidebar));
check('NO click-only active state (setActiveMenu / onClick set state)', !/setActiveMenu|onClick=\{[^}]*setActive/.test(sidebar));

console.log('\n=== active style ===');
const css = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'public', 'css', 'custom.css'), 'utf8');
check('active text/icon colour is #F5C542', (css.match(/#F5C542/gi) || []).length >= 3);
check('active row tint + left indicator defined once (scoped)', /\.gx-sidebar-nav-menu\.ant-menu-dark \.ant-menu-item-selected/.test(css) && /inset 3px 0 0 0 #F5C542/.test(css));
check('collapsed/popup selected items also styled', /\.ant-menu-submenu-popup \.ant-menu-item-selected/.test(css));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
