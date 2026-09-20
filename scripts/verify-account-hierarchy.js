// Verifies the shared account-hierarchy helpers used by the P&L report.
// Pure test (no DB): loads src/frontend/src/utils/accounts.js and drives it.
//   node scripts/verify-account-hierarchy.js
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`); }
};

const src = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'frontend', 'src', 'utils', 'accounts.js'),
  'utf8'
);
const stripped = src.replace(/export const /g, 'const ').replace(/export function /g, 'function ');
const mod = new Function(`${stripped}\nreturn { buildAccountTree, flattenAccountTree, walkAccountTree, pruneZeroAccounts };`)();
const { buildAccountTree, flattenAccountTree, walkAccountTree, pruneZeroAccounts } = mod;

// ── Fixture: two parents, a duplicated child name, three levels ─────────────
// Expenses
//   Vehicle Expenses        (direct 100)
//     Fuel        (V)       (300)
//     Repairs               (200)
//   Farm Expenses           (0 direct)
//     Fuel        (F)       (50)     <- same NAME as Fuel (V), different id
//   Empty Parent            (0, no active child)
const accounts = [
  { id: 1, name: 'Expenses', parentId: null, amount: 0, number: '6000' },
  { id: 2, name: 'Vehicle Expenses', parentId: 1, amount: 100, number: '6100' },
  { id: 3, name: 'Fuel', parentId: 2, amount: 300, number: '6110' },
  { id: 4, name: 'Repairs', parentId: 2, amount: 200, number: '6120' },
  { id: 5, name: 'Farm Expenses', parentId: 1, amount: 0, number: '6200' },
  { id: 6, name: 'Fuel', parentId: 5, amount: 50, number: '6210' },
  { id: 7, name: 'Empty Parent', parentId: 1, amount: 0, number: '6300' },
];

const tree = buildAccountTree(accounts);
const flat = flattenAccountTree(tree);
const byId = (id) => flat.find(n => n.accountId === id);
const node = (id) => { let found = null; walkAccountTree(tree, n => { if (n.accountId === id) found = n; }); return found; };

console.log('\nTEST 1/2/3 — hierarchy, levels, duplicate names');
check('single root (Expenses)', tree.length === 1 && tree[0].accountId === 1, tree.map(t => t.name));
check('Vehicle Expenses has 2 children', node(2).children.length === 2);
check('Farm Expenses has 1 child', node(5).children.length === 1);
check('three levels deep (Expenses > Vehicle > Fuel)', byId(3).indent === 2, byId(3).indent);
check('two distinct Fuel accounts kept', flat.filter(n => n.name === 'Fuel').length === 2);
check('Fuel(V) and Fuel(F) are different ids', byId(3).accountId !== byId(6).accountId);
check('Fuel(V) under Vehicle', node(2).children.some(c => c.accountId === 3));
check('Fuel(F) under Farm', node(5).children.some(c => c.accountId === 6));

console.log('\nTEST 4 — parent direct + child postings (no double count)');
check('Vehicle direct amount = 100', node(2).amount === 100);
check('Vehicle rollup = 600 (100 + 300 + 200)', node(2).amountDisplay === 600, node(2).amountDisplay);
check('rollup is not 500 (children only)', node(2).amountDisplay !== 500);
check('rollup is not 1100 (double counted)', node(2).amountDisplay !== 1100);
check('Fuel(V) rollup = direct (300)', node(3).amountDisplay === 300);

console.log('\nTEST 5 — parent with no direct activity but active child');
check('Farm direct = 0', node(5).amount === 0);
check('Farm rollup = 50 (child)', node(5).amountDisplay === 50, node(5).amountDisplay);

console.log('\nTEST 7 — grand total = sum of DIRECT amounts (no double counting)');
{
  const grandRollup = tree.reduce((s, n) => s + n.amountDisplay, 0);
  const grandDirect = accounts.reduce((s, a) => s + a.amount, 0);
  check('sum(roots.rollup) === sum(direct)', grandRollup === grandDirect, { grandRollup, grandDirect });
  check('grand total = 650', grandDirect === 650, grandDirect);
}

console.log('\nTEST 6 — zero-balance handling');
{
  const pruned = pruneZeroAccounts(tree, true);
  const pIds = [];
  walkAccountTree(pruned, n => pIds.push(n.accountId));
  check('active parent with active child kept (Farm)', pIds.includes(5));
  check('active child kept (Fuel F)', pIds.includes(6));
  check('fully-empty parent hidden (Empty Parent)', !pIds.includes(7));
  check('root kept (has visible descendants)', pIds.includes(1));
  const notPruned = pruneZeroAccounts(tree, false);
  const allIds = []; walkAccountTree(notPruned, n => allIds.push(n.accountId));
  check('hide=false keeps everything', allIds.length === accounts.length, allIds.length);
}

console.log('\nTEST 8 — flatten indentation for exports');
{
  check('flat has every node', flat.length === accounts.length, flat.length);
  check('Expenses indent 0', byId(1).indent === 0);
  check('Vehicle indent 1', byId(2).indent === 1);
  check('Fuel(V) indent 2', byId(3).indent === 2);
}

console.log('\nOrdering preserved from input');
{
  check('Vehicle children order = Fuel then Repairs',
    node(2).children.map(c => c.accountId).join(',') === '3,4');
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
