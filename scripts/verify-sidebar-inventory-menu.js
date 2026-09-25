/**
 * verify-sidebar-inventory-menu.js
 *
 * Inventory must be its OWN top-level sidebar menu (like Sales / Expenses /
 * Banking), NOT nested inside the "More" submenu. Products & Services must not
 * be duplicated in the Sales menu, and no Menu.Item key may be duplicated.
 */
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const SIDEBAR = path.join(ROOT, 'src', 'frontend', 'src', 'containers', 'Sidebar', 'SidebarContent.js');
const src = fs.readFileSync(SIDEBAR, 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

const TOP = '\n              <SubMenu ';   // 14 spaces = top-level menu
const NESTED = '\n                <SubMenu '; // 16 spaces = nested submenu

console.log('\n=== Inventory is a top-level menu ===');
check('sub-inventory is declared at top level (14-space indent)',
  src.includes(`${TOP}key="sub-inventory"`));
check('sub-inventory is NOT nested inside another submenu (no 16-space indent)',
  !src.includes(`${NESTED}key="sub-inventory"`));
check('sub-inventory sits alongside Sales / Expenses / Banking',
  src.indexOf('key="sub-sales"') > -1 &&
  src.indexOf('key="sub-expenses"') > -1 &&
  src.indexOf('key="sub-banking"') > -1 &&
  src.indexOf('key="sub-inventory"') > -1);
check('sub-inventory comes before sub-more (own menu, not the catch-all)',
  src.indexOf('key="sub-inventory"') < src.indexOf('key="sub-more"'));

console.log('\n=== Inventory items live under the new menu ===');
const inventoryMenu = src.slice(src.indexOf('key="sub-inventory"'), src.indexOf('key="sub-accounting"'));
for (const label of ['Products &amp; Services', 'Stock Levels', 'Warehouses', 'Bill of Materials',
  'Serial Numbers', 'Barcodes', 'Adjustments', 'Pricing Rules', 'Pick &#38; Pack &#38; Ship', 'Low Stock Alerts']) {
  check(`Inventory menu contains "${label.replace(/&amp;/g, '&').replace(/&#38;/g, '&')}"`,
    inventoryMenu.includes(label));
}

console.log('\n=== More menu no longer holds Inventory ===');
const moreMenu = src.slice(src.indexOf('key="sub-more"'), src.indexOf('</MenuItemGroup>', src.indexOf('key="sub-more"')));
check('More menu has no inventory items', !/main\/inventory/.test(moreMenu));
check('More menu still keeps its other entries',
  ['main/employees/center', 'main/projects/center', 'main/pos/session', 'main/analytics',
    'inner/profile', 'main/dashboard/company'].every(k => moreMenu.includes(k)));

console.log('\n=== No duplicate menu keys ===');
const keys = [...src.matchAll(/<Menu\.Item key="([^"]+)"/g)].map(m => m[1]);
const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
check('no duplicate Menu.Item keys', dupes.length === 0, dupes.join(', '));
check('Products & Services route appears exactly once', keys.filter(k => k === 'main/inventory/items').length === 1);
check('Products & Services is not also in the Sales menu',
  !src.slice(src.indexOf('key="sub-sales"'), src.indexOf('key="sub-expenses"')).includes('main/inventory/items'));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
