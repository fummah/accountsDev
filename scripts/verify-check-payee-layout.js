/**
 * verify-check-payee-layout.js â€” Check payee layout audit.
 *
 * Confirms the ONE authoritative check template renders:
 *   Payee Name  â†’  Amount in Words  (main "Pay to the Order of" area)
 * and that the mailing/address block BELOW also begins with the same resolved
 * payee name â€” while the +0.50in physical calibration is untouched. Also proves
 * the payee name comes from the ONE shared resolver for every check source
 * (Write Check / Customer Refund / Vendor bill payment).
 *
 * Plain node (source checks only).
 *   node scripts/verify-check-payee-layout.js
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend', 'src');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`); }
};

const cp = read('src/frontend/src/components/accountant/CheckPrinting.js');

console.log('\n=== the ONE check template: main Payee name ABOVE amount-in-words ===');
{
  // The check BODY section only (between the body marker and STUB 1).
  const body = cp.slice(cp.indexOf('CHECK BODY'), cp.indexOf('STUB 1'));
  const iPayee = body.indexOf('class="payee-name"');
  const iWords = body.indexOf('class="words-text"');
  const iAmount = body.indexOf('class="amount-box"');
  const iAddr = body.indexOf('class="addr-window"');
  check('payee-name element exists in the check body', iPayee !== -1);
  check('amount-in-words (words-text) element exists', iWords !== -1);
  check('payee name comes BEFORE amount-in-words (main Pay to the Order line)', iPayee !== -1 && iWords !== -1 && iPayee < iWords, { iPayee, iWords });
  check('numeric amount BEFORE the payee name (unchanged order)', iAmount !== -1 && iAmount < iPayee);
  check('address window is BELOW the amount-in-words', iAddr !== -1 && iWords < iAddr);
  check('payee name is directly above words (both are single dedicated rows)', /payee-row[\s\S]{0,400}words-row/.test(body));
}

console.log('\n=== mailing / address block begins with the SAME resolved payee name ===');
{
  check('mailing lines prepend the payee name', /const mailingLines = \(payeeName && payeeAddrLines\[0\] !== payeeName\)[\s\S]{0,80}\[payeeName, \.\.\.payeeAddrLines\]/.test(cp));
  check('address window renders mailingLines (name + address)', /class="addr-window"[\s\S]{0,120}mailingLines\.map/.test(cp));
  check('guard prevents a duplicate name when the snapshot already has it', /payeeAddrLines\[0\] !== payeeName/.test(cp));
}

console.log('\n=== long-name overflow guard (no collision with date/amount) ===');
{
  check('payee name is single-line with ellipsis overflow', /\.payee-name\s*\{[^}]*white-space:\s*nowrap[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis/.test(cp));
}

console.log('\n=== physical calibration preserved (do NOT reset the offset) ===');
{
  check('vertical/horizontal offset variables still drive the whole body', /--check-offset-y: \$\{Number\(alignYIn/.test(cp) && /--check-offset-x: \$\{Number\(alignXIn/.test(cp));
  check('default vertical offset remains 0.5in', /useState\(0\.5\)/.test(cp));
  check('offset applied to .check-inner (whole body moves as one)', /\.check-inner\s*\{[^}]*margin-top:\s*var\(--check-offset-y\)/.test(cp));
}

console.log('\n=== Preview + Print + Reprint use the SAME template ===');
{
  check('Preview uses generateCheckHtml', /handlePreview[\s\S]{0,600}generateCheckHtml\(vals, false\)/.test(cp));
  check('Print uses generateCheckHtml', /handlePrint[\s\S]{0,600}generateCheckHtml\(vals, true\)/.test(cp));
  check('Reprint uses generateCheckHtml', /generateCheckHtml\(/.test(cp) && (cp.match(/generateCheckHtml\(/g) || []).length >= 3);
  check('stub uses the same resolved payeeName', /<td style="font-size:11px; width:70%;">\$\{payeeName\}<\/td>/.test(cp) || /width:70%;">\$\{payeeName\}/.test(cp));
}

console.log('\n=== ONE shared payee-name resolver for every check source ===');
{
  check('Write Check payee list uses getCustomerName', /import \{ getCustomerName \} from '\.\.\/\.\.\/utils\/contactIdentity'/.test(cp) && /getCustomerName\(v\)/.test(cp) && /getCustomerName\(c\)/.test(cp));
  const cr = read('src/backend/models/customerRefunds.js');
  check('Customer Refund check payee uses the shared resolver', /Contacts\.getCustomerName\(cust\)/.test(cr));
  const bp = read('src/backend/models/billPayments.js');
  check('Vendor bill-payment check payee uses the shared resolver', /ContactIdentity\.getCustomerName/.test(bp));
  // No duplicated inline person-name formula for the printed payee.
  check('no duplicate inline first+last payee formula in the check template', !/<span class="payee-name">\$\{.*first_name/.test(cp));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
