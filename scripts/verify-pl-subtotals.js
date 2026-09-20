/**
 * verify-pl-subtotals.js — the QuickBooks-style hierarchy presentation.
 *
 *   ▼ Parent
 *       Child
 *   Total Parent
 *
 * It loads the PURE frontend utils (no React) and exercises the presentation
 * rules against real trees built by the shared buildAccountTree(), then asserts
 * the P&L component wires it in and no longer uses antd's tree expandable.
 *
 * Presentation must never change money: every assertion here is about ROW ORDER
 * and the subtotal row RE-USING the parent's already-computed rollup.
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const FE = path.join(__dirname, '..', 'src', 'frontend', 'src');

// Load a pure ESM module (only `export const`/`export function`, no imports).
const loadPure = (rel, names) => {
  let code = fs.readFileSync(path.join(FE, rel), 'utf8');
  code = code.replace(/^\s*export\s+/gm, '');
  // eslint-disable-next-line no-new-func
  return new Function(`${code}\n;return { ${names.join(', ')} };`)();
};

const { buildAccountTree } = loadPure('utils/accounts.js', ['buildAccountTree']);
const { buildDisplayRows, allGroupKeys } = loadPure('utils/reportHierarchy.js', ['buildDisplayRows', 'allGroupKeys']);

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9;
const kinds = (rows) => rows.map(r => r.rowKind).join(',');
const names = (rows) => rows.map(r => r.name).join(' | ');
const allKeys = (nodes) => new Set(allGroupKeys(nodes));

// Helper: build a tree and fully expand it.
const expanded = (accounts) => { const t = buildAccountTree(accounts); return { tree: t, set: allKeys(t) }; };

console.log('\n=== P&L hierarchy subtotals ===');

// ── Test 1 — simple parent ────────────────────────────────────────────────
{
  const { tree, set } = expanded([
    { id: 1, name: 'Bank Fees', parentId: null, amount: 0 },
    { id: 2, name: 'Fees', parentId: 1, amount: 275.80 },
  ]);
  const rows = buildDisplayRows(tree, set);
  check('T1: group header, one child, one subtotal', kinds(rows) === 'group,leaf,subtotal', kinds(rows));
  check('T1: subtotal is labelled "Total Bank Fees"', rows[2].name === 'Total Bank Fees', names(rows));
  check('T1: subtotal re-uses the rollup (275.80)', near(rows[2].amountDisplay, 275.80), rows[2].amountDisplay);
  check('T1: the child is indented one level', rows[1].indent === 1 && rows[2].indent === 0, JSON.stringify(rows.map(r => r.indent)));
  check('T1: rows are FLAT (no children, so antd cannot re-nest them)',
    rows.every(r => r.children === undefined), JSON.stringify(rows.map(r => !!r.children)));
}

// ── Test 2 — multiple children sum, subtotal AFTER the last child ─────────
{
  const { tree, set } = expanded([
    { id: 10, name: 'BEEF', parentId: null, amount: 0 },
    { id: 11, name: 'Electric', parentId: 10, amount: 26.93 },
    { id: 12, name: 'Hay', parentId: 10, amount: 3520.50 },
    { id: 13, name: 'Milk Replacer', parentId: 10, amount: 81.00 },
    { id: 14, name: 'Minerals', parentId: 10, amount: 167.82 },
    { id: 15, name: 'Murry Grey Membership', parentId: 10, amount: 75.00 },
    { id: 16, name: 'Supplies', parentId: 10, amount: 619.50 },
  ]);
  const rows = buildDisplayRows(tree, set);
  const expected = 26.93 + 3520.50 + 81.00 + 167.82 + 75.00 + 619.50;
  const total = rows[rows.length - 1];
  check('T2: subtotal is the LAST row', total.rowKind === 'subtotal' && total.name === 'Total BEEF', kinds(rows));
  check('T2: subtotal equals the sum of children', near(total.amountDisplay, expected), `${total.amountDisplay} vs ${expected}`);
  check('T2: six children are shown', rows.filter(r => r.rowKind === 'leaf').length === 6);
}

// ── Test 3 — CHARITY (regression shape) ───────────────────────────────────
{
  const { tree, set } = expanded([
    { id: 20, name: 'CHARITY', parentId: null, amount: 0 },
    { id: 21, name: 'CAM Charity', parentId: 20, amount: 75.00 },
    { id: 22, name: 'Church Charity', parentId: 20, amount: 810.00 },
    { id: 23, name: 'Funds For Locals', parentId: 20, amount: 500.00 },
    { id: 24, name: 'CHARITY - Other', parentId: 20, amount: 163.00 },
  ]);
  const rows = buildDisplayRows(tree, set);
  check('T3: Total CHARITY = 1,548.00 after the last child', near(rows[rows.length - 1].amountDisplay, 1548.00), rows[rows.length - 1].amountDisplay);
}

// ── Test 4 — DIRECT parent activity must not be lost or double-counted ────
{
  const { tree, set } = expanded([
    { id: 30, name: 'Parent', parentId: null, amount: 100 },
    { id: 31, name: 'Child A', parentId: 30, amount: 300 },
    { id: 32, name: 'Child B', parentId: 30, amount: 200 },
  ]);
  const rows = buildDisplayRows(tree, set);
  const total = rows[rows.length - 1].amountDisplay;
  check('T4: Total = direct 100 + 300 + 200 = 600', near(total, 600), total);
  check('T4: not 500 (direct activity lost)', !near(total, 500));
  check('T4: not 700 (direct activity double-counted)', !near(total, 700));
}

// ── Test 5 — three levels, recursive ──────────────────────────────────────
{
  const { tree, set } = expanded([
    { id: 40, name: 'Parent', parentId: null, amount: 0 },
    { id: 41, name: 'Child Parent', parentId: 40, amount: 0 },
    { id: 42, name: 'Leaf A', parentId: 41, amount: 100 },
    { id: 43, name: 'Leaf B', parentId: 41, amount: 50 },
    { id: 44, name: 'Leaf C', parentId: 40, amount: 200 },
  ]);
  const rows = buildDisplayRows(tree, set);
  check('T5: recursive order group,group,leaf,leaf,subtotal,leaf,subtotal',
    kinds(rows) === 'group,group,leaf,leaf,subtotal,leaf,subtotal', kinds(rows));
  const childTotal = rows.find(r => r.name === 'Total Child Parent');
  const parentTotal = rows.find(r => r.name === 'Total Parent');
  check('T5: Total Child Parent = 150', near(childTotal.amountDisplay, 150), childTotal.amountDisplay);
  check('T5: Total Parent = 150 + 200 = 350', near(parentTotal.amountDisplay, 350), parentTotal.amountDisplay);
  check('T5: the inner subtotal precedes the outer subtotal',
    rows.indexOf(childTotal) < rows.indexOf(parentTotal));
}

// ── Test 6 — duplicate child names stay distinct by id ────────────────────
{
  const { tree, set } = expanded([
    { id: 50, name: 'Vehicle Expenses', parentId: null, amount: 0 },
    { id: 51, name: 'Fuel', parentId: 50, amount: 100 },
    { id: 60, name: 'Farm Expenses', parentId: null, amount: 0 },
    { id: 61, name: 'Fuel', parentId: 60, amount: 500 },
  ]);
  const rows = buildDisplayRows(tree, set);
  const fuels = rows.filter(r => r.name === 'Fuel');
  check('T6: two distinct "Fuel" rows', fuels.length === 2, JSON.stringify(fuels.map(f => f.accountId)));
  check('T6: each Fuel keeps its own account id', fuels[0].accountId !== fuels[1].accountId);
  check('T6: Total Vehicle Expenses = 100', near(rows.find(r => r.name === 'Total Vehicle Expenses').amountDisplay, 100));
  check('T6: Total Farm Expenses = 500', near(rows.find(r => r.name === 'Total Farm Expenses').amountDisplay, 500));
}

// ── Test 7 — leaf accounts get NO Total row ───────────────────────────────
{
  const { tree, set } = expanded([
    { id: 70, name: 'Rent', parentId: null, amount: 1000 },
    { id: 71, name: 'Insurance', parentId: null, amount: 250 },
  ]);
  const rows = buildDisplayRows(tree, set);
  check('T7: two leaves, no subtotal rows', kinds(rows) === 'leaf,leaf', kinds(rows));
  check('T7: no "Total" label for a leaf', !rows.some(r => /^Total /.test(r.name)), names(rows));
}

// ── Test 8 — collapsed parent shows its total on the single row ───────────
{
  const tree = buildAccountTree([
    { id: 80, name: 'BEEF', parentId: null, amount: 0 },
    { id: 81, name: 'Hay', parentId: 80, amount: 3000 },
    { id: 82, name: 'Supplies', parentId: 80, amount: 500 },
  ]);
  const rows = buildDisplayRows(tree, new Set()); // nothing expanded
  check('T8: collapsed parent is a single group row', rows.length === 1 && rows[0].rowKind === 'group', kinds(rows));
  check('T8: collapsed row still shows the rollup (3500)', near(rows[0].amountDisplay, 3500), rows[0].amountDisplay);
  check('T8: no children or subtotal while collapsed', !rows.some(r => r.rowKind === 'subtotal' || r.rowKind === 'leaf'));
}

// ── Test 9 — no double counting at the section level ──────────────────────
{
  const accounts = [
    { id: 90, name: 'BEEF', parentId: null, amount: 0 },
    { id: 91, name: 'Hay', parentId: 90, amount: 3000 },
    { id: 92, name: 'Supplies', parentId: 90, amount: 500 },
    { id: 93, name: 'Rent', parentId: null, amount: 1000 },
  ];
  const { tree, set } = expanded(accounts);
  const rows = buildDisplayRows(tree, set);
  const sectionTotal = tree.reduce((sum, n) => sum + n.amountDisplay, 0);   // 3500 + 1000
  const subtotalSum = rows.filter(r => r.rowKind === 'subtotal').reduce((sum, r) => sum + r.amountDisplay, 0); // 3500 only
  const leafSum = rows.filter(r => r.rowKind === 'leaf').reduce((sum, r) => sum + r.amountDisplay, 0);         // 3000+500+1000
  check('T9: section total = sum of root rollups (4500)', near(sectionTotal, 4500), sectionTotal);
  check('T9: leaf rows alone sum to 4500 (no leaf hidden by a parent)', near(leafSum, 4500), leafSum);
  check('T9: subtotal rows are DISPLAY ONLY (3500, not added again)', near(subtotalSum, 3500), subtotalSum);
}

// ── Test 10 — source wiring (rendering, exports, no antd tree) ────────────
{
  const pl = fs.readFileSync(path.join(FE, 'components/reports/ProfitLoss.js'), 'utf8');
  check('the P&L imports the shared presentation helpers',
    /import\s*\{\s*buildDisplayRows,\s*allGroupKeys\s*\}\s*from\s*['"]\.\.\/\.\.\/utils\/reportHierarchy['"]/.test(pl));
  check('the on-screen tables use the flattened rows',
    /dataSource=\{incomeRows\}/.test(pl) && /dataSource=\{cogsRows\}/.test(pl) && /dataSource=\{expenseRows\}/.test(pl));
  check('antd tree expandable is gone', !/expandable=\{\{/.test(pl));
  check('the old flatten-by-indent export helper is gone', !/flattenAccountTree|flatten\(rowsArr\)/.test(pl));
  check('a "Total <Parent>" row is rendered for open groups', /rowKind === 'subtotal'/.test(pl));
  check('exports/print/PDF use the same hierarchy builder',
    (pl.match(/buildDisplayRows\(/g) || []).length >= 4, (pl.match(/buildDisplayRows\(/g) || []).length);
  check('the P&L total (summary) is untouched by presentation',
    /const s = data\.summary;/.test(pl) && /netIncome: net/.test(pl));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
