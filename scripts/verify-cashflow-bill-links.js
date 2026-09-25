/**
 * verify-cashflow-bill-links.js
 *
 * The Cash Flow tab's Money Out actions must open the REAL bills pages, not the
 * unused legacy `/inner/expenses` page:
 *   • "Pay Bills"   -> /main/vendors/bills/pay   (PayBills — Auto-Create Check)
 *   • "Enter Bills" -> /main/vendors/bills/enter (EnterBill)
 */
/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
const read = (rel) => fs.readFileSync(path.join(FE, rel), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

const tab = read('routes/main/dashboard/Home/Tabs/CashFlowTab.js');
const vendorsRoutes = read('components/vendors/index.js');
const payBills = read('components/vendors/bills/PayBills.js');
const enterBill = read('components/vendors/bills/EnterBill.js');

console.log('\n=== Cash Flow tab Money Out links ===');
check('no longer points at the unused /inner/expenses page', !/\/inner\/expenses/.test(tab));
check('has a "Pay Bills" link to the Pay Bills page', /<Link to="\/main\/vendors\/bills\/pay">Pay Bills<\/Link>/.test(tab));
check('has an "Enter Bills" link to the Enter Bill page', /<Link to="\/main\/vendors\/bills\/enter">Enter Bills<\/Link>/.test(tab));
check('old "View paid bills" label is gone', !/View paid bills/.test(tab));
check('old "New bill" label is gone', !/New bill/.test(tab));

console.log('\n=== Destination routes exist ===');
check('vendors routes map /bills/pay -> PayBills', /path=\{`\$\{match\.path\}\/bills\/pay`\}\s+component=\{PayBills\}/.test(vendorsRoutes));
check('vendors routes map /bills/enter -> EnterBill', /path=\{`\$\{match\.path\}\/bills\/enter`\}\s+component=\{EnterBill\}/.test(vendorsRoutes));

console.log('\n=== Destination pages ===');
check('PayBills is titled "Pay Bills - Auto-Create Check"', /Pay Bills\s*[-\u2013\u2014]\s*Auto-Create Check/.test(payBills));
check('EnterBill renders the "Enter Bill" title', /'Edit Bill' : 'Enter Bill'/.test(enterBill));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
