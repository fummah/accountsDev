/**
 * verify-gl-presentation.js — the General Ledger reads like a real ledger.
 *
 * Proves (a) the normal-balance-aware math for every account family via the
 * authoritative engine (services/normalBalance.js → balanceOf), and (b) the GL
 * screen presents Opening / Debits / Credits / Net Movement / Closing with the
 * "Balance" column renamed "Running Balance" and Net Movement never labelled as
 * the account balance.
 *
 * Plain node (normalBalance.js is pure; the screen is checked by source).
 *   node scripts/verify-gl-presentation.js
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const GL = path.join(ROOT, 'src', 'frontend', 'src', 'components', 'accountant', 'GeneralLedger.js');
const { balanceOf, getExpectedNormalBalance } = require(path.join(ROOT, 'src', 'backend', 'services', 'normalBalance'));

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`); }
};
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9;

console.log('\n=== normal-balance rules by account family ===');
check('Bank is Debit-normal', getExpectedNormalBalance('Bank') === 'Debit');
check('Asset is Debit-normal', getExpectedNormalBalance('Asset') === 'Debit');
check('Expense is Debit-normal', getExpectedNormalBalance('Expense') === 'Debit');
check('Cost of Goods Sold is Debit-normal', getExpectedNormalBalance('Cost of Goods Sold') === 'Debit');
check('Liability is Credit-normal', getExpectedNormalBalance('Liability') === 'Credit');
check('Credit Card is Credit-normal', getExpectedNormalBalance('Credit Card') === 'Credit');
check('Loan is Credit-normal', getExpectedNormalBalance('Loan') === 'Credit');
check('Equity is Credit-normal', getExpectedNormalBalance('Equity') === 'Credit');
check('Income is Credit-normal', getExpectedNormalBalance('Income') === 'Credit');
check('Other Income is Credit-normal', getExpectedNormalBalance('Other Income') === 'Credit');

console.log('\n=== screenshot example (debit-normal Bank) ===');
{
  const opening = 200.77, debits = 3128.97, credits = 227.87;
  const nb = getExpectedNormalBalance('Bank');
  const netMovement = nb === 'Credit' ? (credits - debits) : (debits - credits);
  const closing = balanceOf({ normalBalance: nb, openingBalance: opening, debit: debits, credit: credits });
  check('Net Movement = +2,901.10 (NOT the balance)', near(netMovement, 2901.10), netMovement);
  check('Closing Balance = 3,101.87', near(closing, 3101.87), closing);
  check('Opening + Net Movement = Closing', near(opening + netMovement, closing));
  check('Opening + Debits - Credits = Closing', near(opening + debits - credits, closing));
  // Running balances after each row.
  let b = opening;
  const running = [];
  for (const [d, c] of [[3128.97, 0], [0, 50], [0, 177.87]]) { b += (nb === 'Credit' ? c - d : d - c); running.push(Number(b.toFixed(2))); }
  check('running balances: 3329.74, 3279.74, 3101.87', JSON.stringify(running) === JSON.stringify([3329.74, 3279.74, 3101.87]), running);
}

console.log('\n=== TEST: credit-normal Liability ===');
{
  const nb = getExpectedNormalBalance('Liability');
  const netMovement = nb === 'Credit' ? (2000 - 500) : (500 - 2000);
  const closing = balanceOf({ normalBalance: nb, openingBalance: 10000, debit: 500, credit: 2000 });
  check('liability movement = +1,500 (credit increases)', near(netMovement, 1500), netMovement);
  check('liability closing = 11,500 (credit-normal)', near(closing, 11500), closing);
}

console.log('\n=== TEST: Equity / Revenue (credit increases) / Expense (debit increases) ===');
{
  check('Equity: credit increases', near(balanceOf({ normalBalance: 'Credit', openingBalance: 0, debit: 0, credit: 5000 }), 5000));
  check('Revenue(Income): credit increases', near(balanceOf({ normalBalance: 'Credit', openingBalance: 0, debit: 0, credit: 800 }), 800));
  check('Expense: debit increases', near(balanceOf({ normalBalance: 'Debit', openingBalance: 0, debit: 300, credit: 0 }), 300));
}

console.log('\n=== General Ledger screen presentation ===');
{
  const src = fs.readFileSync(GL, 'utf8');
  check('column renamed to "Running Balance"', /Running Balance/.test(src) && /title: <Tooltip title="Account balance immediately after this transaction\.">/.test(src));
  check('no column titled "Balance" remains', !/title: 'Balance',\s*dataIndex: 'balance'/.test(src));
  check('Net Movement is normal-balance aware', /const netMovement = normalBalance === 'Credit'\s*\? \(periodCredits - periodDebits\)\s*: \(periodDebits - periodCredits\)/.test(src));
  check('Closing Balance = Opening + Net Movement', /const closingBalance = startingBalance \+ netMovement/.test(src));
  check('summary cards: Opening Balance, Period Debits, Period Credits, Net Movement, Closing Balance',
    /Opening Balance/.test(src) && /Period Debits/.test(src) && /Period Credits/.test(src) && /Net Movement/.test(src) && /Closing Balance/.test(src));
  check('balance reconciliation line present', /Balance Reconciliation/.test(src));
  check('debit-normal reconciliation shows Opening + Debits − Credits', /Period Debits[\s\S]{0,120}Period Credits/.test(src) && /normalBalance === 'Credit' \?/.test(src));
  check('Normal Balance indicator in the header', /Normal Balance: <Text strong>\{normalBalance\}/.test(src));
  check('period totals derive from the UNFILTERED activity (allSorted)', /const periodDebits = allSorted\.reduce/.test(src) && /const periodCredits = allSorted\.reduce/.test(src));
  check('running balance computed over the full period (search never changes balances)', /withRunningBalanceFull/.test(src) && /openingRow\.concat\(allSorted\.map/.test(src));
  check('footer Running Balance column shows the ENDING running balance, not Net Movement', /pageEndBalance/.test(src) && /fmt\(closingBalance\)/.test(src));
  check('footer labels Net Movement in the total label (not under Running Balance)', /Page Totals[\s\S]{0,200}Net Movement/.test(src) && /Grand Totals[\s\S]{0,220}Net Movement/.test(src));
  check('no summary cell renders netMovement as the Balance column total', !/<Table\.Summary\.Cell align="right"><Text strong style=\{\{ color: '#1890ff' \}\}>\{fmt\(netMovement\)\}/.test(src));
  check('search shows a Filtered subtotal warning', /Search active/.test(src) && /Filtered: Debits/.test(src));
  check('print uses Running Balance + clear summary terminology', /Running Balance<\/th>/.test(src) && /Net Movement<\/td>/.test(src) && /Closing Balance<\/td>/.test(src));
  check('export header uses Running Balance + summary metadata', /'Credit', 'Running Balance'\]/.test(src) && /Net Movement', netMovement\.toFixed/.test(src));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
