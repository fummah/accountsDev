/**
 * verify-financial-reports-pl.js
 *
 * The Profit & Loss inside the sidebar's Reports → "Financial Reports" tab must
 * be EXACTLY the same report as the standalone /main/reports/profit-loss route.
 * Both must render the one component, components/reports/ProfitLoss.js.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
const read = (rel) => fs.readFileSync(path.join(FE, rel), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

console.log('\n=== Financial Reports tab P&L ===');

const tab = read('routes/inner/Reports/Tabs/FinancialReportTab.js');
check('the tab imports the full ProfitLoss component',
  /import\s+ProfitLoss\s+from\s+["']components\/reports\/ProfitLoss["']/.test(tab));
check('the tab renders <ProfitLoss />', /<ProfitLoss\s*\/>/.test(tab));
check('the tab no longer renders the simplified ProfitAndLossSection',
  !/ProfitAndLossSection/.test(tab));
check('the tab still renders the Balance Sheet and Cash Flow sections',
  /BalanceSheetSection/.test(tab) && /CashFlowSection/.test(tab));

// The standalone route must point at the SAME module.
const reportRoutes = read('components/reports/index.js');
check('the standalone route uses ./ProfitLoss',
  /import\s+ProfitLoss\s+from\s+['"]\.\/ProfitLoss['"]/.test(reportRoutes) &&
  /component=\{ProfitLoss\}/.test(reportRoutes));

// The v6-style route file, if present, must agree too.
try {
  const acct = read('routes/AccountingRoutes.js');
  check('the accounting route also renders the same ProfitLoss',
    /import\s+ProfitLoss\s+from\s+['"]\.\.\/components\/reports\/ProfitLoss['"]/.test(acct) &&
    /<ProfitLoss\s*\/>/.test(acct));
} catch { /* file optional */ }

// One component, one implementation: the tab must not carry its own P&L markup.
check('the tab defines no bespoke P&L table of its own',
  !/Profit and Loss Statement/.test(tab) && !/Net Income/.test(tab));

// The shared component is self-contained (owns its own data + controls).
const pl = read('components/reports/ProfitLoss.js');
check('the shared P&L fetches its own data', /getFinancialReport\(/.test(pl));
check('the shared P&L owns its date range + presets', /PRESETS/.test(pl) && /RangePicker/.test(pl));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
