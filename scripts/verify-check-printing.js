// Verification for the Write Check PREPRINTED STOCK print template.
//
// Run with:  ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe scripts/verify-check-printing.js
//   (or via scripts/run-verification.js, which supplies the Electron runtime)
//
// The DB section needs better-sqlite3, which is built for Electron's ABI. When
// the script is run with plain `node` that section reports SKIP rather than
// failing — the static/template sections still run either way.
/* eslint-disable no-console */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC_PATH = path.join(__dirname, '..', 'src', 'frontend', 'src', 'components', 'accountant', 'CheckPrinting.js');
const src = fs.readFileSync(SRC_PATH, 'utf8');

let pass = 0, fail = 0, skip = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? ' -> ' + extra : ''}`); }
};
const skipNote = (label) => { skip++; console.log(`  SKIP  ${label}`); };

// ── Extract and eval the money helpers + toWords ────────────────────────────
function slice(startMarker, endMarker) {
  const s = src.indexOf(startMarker);
  const e = src.indexOf(endMarker, s);
  if (s < 0 || e < 0) throw new Error(`marker not found: ${startMarker}`);
  return src.slice(s, e);
}
const helpersSrc = slice('const toCents = (v)', 'const CheckPrinting = () => {');
const fn = new Function(`${helpersSrc}\nreturn { toCents, sumMoney, toWords };`);
const { toCents, sumMoney, toWords } = fn();

const wordsFor = (amt) => {
  const dollars = Math.floor(amt);
  const cents = Math.round((amt - dollars) * 100);
  return `${toWords(dollars)} and ${String(cents).padStart(2, '0')}/100`;
};

console.log('\nTEST 10 — amount in words');
check('$550.00', wordsFor(550) === 'Five Hundred Fifty and 00/100 Dollars' || wordsFor(550) === 'Five Hundred Fifty and 00/100', wordsFor(550));
check('$550.25', wordsFor(550.25) === 'Five Hundred Fifty and 25/100', wordsFor(550.25));
check('$1,250.00', wordsFor(1250) === 'One Thousand Two Hundred Fifty and 00/100', wordsFor(1250));

console.log('\nTEST 1/2/3/4 — money-safe split totals');
check('525 + 25 = 550', sumMoney([525, 25]) === 550, String(sumMoney([525, 25])));
check('525 + 50 = 575', sumMoney([525, 50]) === 575, String(sumMoney([525, 50])));
check('single 525 = 525', sumMoney([525]) === 525, String(sumMoney([525])));
check('525+25+100 = 650', sumMoney([525, 25, 100]) === 650, String(sumMoney([525, 25, 100])));
check('float drift 0.1+0.2 = 0.30', sumMoney([0.1, 0.2]) === 0.3, String(sumMoney([0.1, 0.2])));
check('blank line ignored (0 amount)', sumMoney([525, 25, 0]) === 550, String(sumMoney([525, 25, 0])));

// ── Template assertions ─────────────────────────────────────────────────────
const tplStart = src.indexOf('return `<!doctype html>');
const tplEnd = src.indexOf('</body></html>`;', tplStart);
const tpl = src.slice(tplStart, tplEnd);
const styleBlock = tpl.slice(tpl.indexOf('<style>'), tpl.indexOf('</style>'));

console.log('\nTEST 5/6/7/11 — pre-printed template contents');
check('does NOT print check number variable', !/\$\{checkNum/.test(tpl) && !/\$\{vals\.checkNumber/.test(tpl));
check('does NOT contain AUTHORIZED SIGNATURE', !/AUTHORIZED SIGNATURE/i.test(tpl));
check('does NOT contain the signature rule (.sig-line)', !/sig-line/.test(tpl) && !/class="sig-row"/.test(tpl));
check('does NOT contain the amount rule (.words-line)', !/words-line/.test(tpl));
check('does NOT contain an <hr>', !/<hr[\s/>]/i.test(tpl));
check('still prints Date', /\$\{dateStr\}/.test(tpl));
check('still prints Payee', /\$\{payeeName/.test(tpl));
check('still prints numeric amount', /\$\{cSym\}\$\{amtStr\}/.test(tpl));
check('still prints amount in words', /\$\{wordsLine\}/.test(tpl));
check('still prints payee address', /payeeAddrLines/.test(tpl));
check('still prints memo conditionally', /memoLine \?/.test(tpl));
check('removes check# from stub header', !/check#/.test(tpl));

console.log('\nDEFECT 6 — the lower decorative rule is gone');
check('.check-wrap carries NO border', !/\.check-wrap\s*\{[^}]*border/.test(styleBlock));
check('payee name is NOT on the amount row any more', !/payto-name/.test(tpl));
check('the amount row exists and holds only the numeric amount',
  /class="amount-row"/.test(tpl) && /class="amount-row">\s*<span class="amount-box">/.test(tpl));

console.log('\nFONT SIZES — written largest, numeric smallest, all balanced');
const sizeOf = (sel) => {
  const m = styleBlock.match(new RegExp(`\\${sel}\\s*\\{[^}]*font-size:\\s*([\\d.]+)px`));
  return m ? Number(m[1]) : NaN;
};
const sizeWords = sizeOf('.words-text');
const sizeAmount = sizeOf('.amount-box');
const sizeName = sizeOf('.addr-name');
check('.words-text (written amount) = 16px, up from 14px', sizeWords === 16, String(sizeWords));
check('.amount-box (numeric amount) = 12px, down from 13px', sizeAmount === 12, String(sizeAmount));
check('.addr-name (payee name) = 14px, up from 13px', sizeName === 14, String(sizeName));
check('written amount is the LARGEST of the three', sizeWords > sizeName && sizeWords > sizeAmount,
  `${sizeWords}/${sizeName}/${sizeAmount}`);
check('written amount is not dramatically larger than numeric (<= 6px spread)', sizeWords - sizeAmount <= 6,
  String(sizeWords - sizeAmount));
check('all three sit within a 4px band (visually balanced)', (sizeWords - sizeAmount) <= 4,
  String(sizeWords - sizeAmount));

console.log('\nPHYSICAL CALIBRATION — offsets centralised in :root');
for (const v of ['--check-offset-x', '--check-offset-y', '--check-pad-left', '--check-pad-right',
  '--check-date-top', '--check-amount-top', '--check-words-top', '--check-addr-top', '--check-memo-top']) {
  check(`${v} declared in :root`, new RegExp(`${v}\\s*:`).test(styleBlock));
}
check('every row offset reads a var, none is hard-coded',
  /\.date-row\s*\{[^}]*margin-top:\s*var\(--check-date-top\)/.test(styleBlock) &&
  /\.amount-row\s*\{[^}]*margin-top:\s*var\(--check-amount-top\)/.test(styleBlock) &&
  /\.words-row\s*\{[^}]*margin-top:\s*var\(--check-words-top\)/.test(styleBlock) &&
  /\.addr-window\s*\{[^}]*margin-top:\s*var\(--check-addr-top\)/.test(styleBlock) &&
  /\.memo-sig-row\s*\{[^}]*margin-top:\s*var\(--check-memo-top\)/.test(styleBlock));
check('the whole body is nudged by the offset vars',
  /\.check-inner\s*\{[^}]*margin-left:\s*var\(--check-offset-x\)/.test(styleBlock) &&
  /\.check-inner\s*\{[^}]*margin-top:\s*var\(--check-offset-y\)/.test(styleBlock));
check('the check body has no inline margin/padding offsets left',
  !/<div style="[^"]*margin-(top|left|right|bottom)/.test(tpl));

// ── Execute the REAL generator against a fixture ────────────────────────────
console.log('\nGENERATED OUTPUT — the real generateCheckHtml(), not a copy');
const genSrc = slice('const generateCheckHtml = (vals, forPrint) => {', 'const handlePreview = () => {');
const makeGen = new Function('toWords', 'company', 'cSym', `${genSrc}\nreturn generateCheckHtml;`);
const generateCheckHtml = makeGen(toWords, {}, '$');

const FIXTURE = {
  date: { format: () => '09/30/2026' },
  payeeName: 'Acme Industrial Supplies',
  payeeAddress: 'Unit 4, Riverbend Park\n12 Marine Drive\nCape Town, Western Cape 7441',
  amount: 1234.56,
  checkNumber: '1042',
  memo: 'Invoice INV-88213',
  splitLines: [],
  _company: { name: 'Ledger Demo Co' },
};
const html = generateCheckHtml(FIXTURE, true);
const checkBody = html.slice(html.indexOf('CHECK BODY'), html.indexOf('STUB 1'));

check('date printed', html.includes('09/30/2026'));
check('numeric amount printed', html.includes('$1234.56'));
check('written amount printed', html.includes('One Thousand Two Hundred Thirty-Four and 56/100'),
  (html.match(/One Thousand[^<]*/) || [''])[0]);
check('payee name printed', html.includes('Acme Industrial Supplies'));
check('address line 1 printed', html.includes('Unit 4, Riverbend Park'));
check('address line 2 printed', html.includes('12 Marine Drive'));
check('city/state/zip printed', html.includes('Cape Town, Western Cape 7441'));
check('memo printed', html.includes('Invoice INV-88213'));

console.log('\nCHECK NUMBER — suppressed from print, never from the data');
check('check number 1042 does NOT appear anywhere in the printed HTML', !html.includes('1042'));
check('the generator never interpolates vals.checkNumber', !/\$\{[^}]*checkNumber/.test(genSrc));

console.log('\nVERTICAL ORDER — amount, then words, then payee name, then address, then memo');
const at = (s) => checkBody.indexOf(s);
check('numeric amount before written amount', at('$1234.56') < at('One Thousand Two Hundred Thirty-Four'));
check('written amount before payee name', at('One Thousand Two Hundred Thirty-Four') < at('Acme Industrial Supplies'));
check('payee name before address line 1', at('Acme Industrial Supplies') < at('Unit 4, Riverbend Park'));
check('address line 1 before city/state/zip', at('Unit 4, Riverbend Park') < at('Cape Town, Western Cape 7441'));
check('address before memo', at('Cape Town, Western Cape 7441') < at('Invoice INV-88213'));
check('date is the first printed field', at('09/30/2026') < at('$1234.56'));
check('payee name appears exactly ONCE in the check body',
  (checkBody.match(/Acme Industrial Supplies/g) || []).length === 1,
  String((checkBody.match(/Acme Industrial Supplies/g) || []).length));

// ── Headless render: computed styles + rendered text ────────────────────────
function findBrowser() {
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean).find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || null;
}

console.log('\nRENDERED DOM — headless browser, computed styles');
const browser = findBrowser();
if (!browser) {
  skipNote('headless render (no Chrome/Edge found)');
} else {
  const probe = `
<script>
window.addEventListener('load', function () {
  var px = function (el, prop) { return el ? parseFloat(getComputedStyle(el)[prop]) || 0 : null; };
  var q = function (s) { return document.querySelector(s); };
  var wrap = q('.check-wrap');
  var descendants = wrap ? Array.prototype.slice.call(wrap.querySelectorAll('*')) : [];
  var bordered = descendants.filter(function (el) {
    var cs = getComputedStyle(el);
    return parseFloat(cs.borderBottomWidth) > 0 || parseFloat(cs.borderTopWidth) > 0;
  }).map(function (el) { return el.className || el.tagName; });
  var out = {
    words: px(q('.words-text'), 'fontSize'),
    amount: px(q('.amount-box'), 'fontSize'),
    name: px(q('.addr-name'), 'fontSize'),
    date: px(q('.date-val'), 'fontSize'),
    wrapBorder: wrap ? parseFloat(getComputedStyle(wrap).borderBottomWidth) : null,
    bordered: bordered,
    hrCount: document.querySelectorAll('hr').length,
    wordsLine: !!q('.words-line'),
    text: (wrap ? wrap.innerText : document.body.innerText),
  };
  var pre = document.createElement('pre');
  pre.id = 'probe';
  pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
});
</script>`;
  const harnessHtml = html.replace('</body>', probe + '</body>');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkprint-'));
  const harness = path.join(tmpDir, 'check.html');
  fs.writeFileSync(harness, harnessHtml);

  let dom = '';
  try {
    dom = execFileSync(browser, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--user-data-dir=' + path.join(tmpDir, 'profile'),
      '--virtual-time-budget=6000',
      '--window-size=1100,1400',
      '--dump-dom',
      'file:///' + harness.replace(/\\/g, '/'),
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    dom = '';
  }

  const m = dom.match(/<pre id="probe">([\s\S]*?)<\/pre>/);
  if (!m) {
    check('headless probe produced measurements', false, 'no <pre id="probe"> in the dumped DOM');
  } else {
    const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'"));
    check('rendered written amount is 16px', r.words === 16, String(r.words));
    check('rendered numeric amount is 12px', r.amount === 12, String(r.amount));
    check('rendered payee name is 14px', r.name === 14, String(r.name));
    check('rendered date unchanged at 13px', r.date === 13, String(r.date));
    check('rendered: written amount is the largest', r.words > r.name && r.words > r.amount,
      `${r.words}/${r.name}/${r.amount}`);
    check('rendered check body carries NO bottom border', r.wrapBorder === 0, String(r.wrapBorder));
    check('no descendant of the check body draws a rule', r.bordered.length === 0, r.bordered.join(', '));
    check('no <hr> anywhere', r.hrCount === 0, String(r.hrCount));
    check('no .words-line element rendered', r.wordsLine === false);
    check('rendered text SHOWS the date', r.text.includes('09/30/2026'));
    check('rendered text SHOWS the numeric amount', r.text.includes('$1234.56'));
    check('rendered text SHOWS the written amount', /One Thousand Two Hundred Thirty-Four/.test(r.text));
    check('rendered text SHOWS the payee name', r.text.includes('Acme Industrial Supplies'));
    check('rendered text SHOWS the address', r.text.includes('Unit 4, Riverbend Park') && r.text.includes('Cape Town, Western Cape 7441'));
    check('rendered text does NOT show the check number', !r.text.includes('1042'));
    check('rendered text does NOT show Authorized Signature', !/authorized\s+signature/i.test(r.text));
  }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* scratch only */ }
}

// ── Form/state + backend assertions ─────────────────────────────────────────
console.log('\nTEST 11/12 — derived amount + no retained stale logic');
check('amount is derived (hasSplitAmounts sync effect present)',
  /if \(!hasSplitAmounts\) return;/.test(src) && /setFieldsValue\(\{ amount: splitTotal \}\)/.test(src));
check('amount field is read-only when splits exist', /readOnly=\{hasSplitAmounts\}/.test(src));
check('check number still recorded in payload', /reference: values\.checkNumber/.test(src));
check('check number still in form', /name="checkNumber"/.test(src));
check('check number still in history column', /dataIndex: 'reference'/.test(src));
check('stale "We do NOT auto-update" comment removed', !/We do NOT auto-update the amount/.test(src));

console.log('\nPAYEE ADDRESS — taken from the check, not re-looked-up at print time');
check('the check payload persists payee_address', /payee_address: values\.payeeAddress/.test(src));
check('reprint prefers the stored address', /const storedAddress = \(record\.payee_address \|\| ''\)\.trim\(\)/.test(src));
check('the name-based lookup is a fallback only (guarded by storedAddress)',
  (src.match(/const matchedPayee = storedAddress \? null : payees\.find/g) || []).length === 2,
  String((src.match(/const matchedPayee = storedAddress \? null : payees\.find/g) || []).length));
check('multiline addresses are split, not flattened', /payeeAddrLines = \(payeeAddr \|\| ''\)\.split\('\\n'\)/.test(src));

// ── Shared template across Preview / Print Only / Record & Print ────────────
console.log('\nSHARED TEMPLATE — Preview, Print Only and Record & Print agree');
check('exactly ONE check-template generator exists',
  (src.match(/generateCheckHtml = \(vals, forPrint\)/g) || []).length === 1);
check('Live Preview uses generateCheckHtml', /dangerouslySetInnerHTML=\{\{ __html: generateCheckHtml\(/.test(src));
check('Preview modal renders the same generated HTML', /dangerouslySetInnerHTML=\{\{ __html: previewHtml \}\}/.test(src));
check('Preview button builds it via handlePreview', /const handlePreview = \(\) => \{[\s\S]*?setPreviewHtml\(generateCheckHtml\(/.test(src));
check('Print Only goes through handlePrint', /handlePrint\(vals\)/.test(src));
check('Record & Print goes through handlePrint', /if \(!recordOnlyFlag\) \{[\s\S]{0,200}handlePrint\(vals\)/.test(src));
check('the print window writes the same generated HTML', /const html = generateCheckHtml\(vals, true\)/.test(src));

// ── Backend: the check number stays in the data ─────────────────────────────
console.log('\nACCOUNTING INTEGRITY — check number still persisted and unique');
const txSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'backend', 'models', 'transactions.js'), 'utf8');
check('transactions still stores `reference`', /reference, debit, credit, entered_by/.test(txSrc));
check('duplicate check numbers are still rejected', /assertUniqueCheckNumber/.test(txSrc));
check('payee_address column is added lazily to existing DBs', /payee_address.*sql: 'TEXT'/.test(txSrc));
check('payee_address is written on insert', /payee_address \|\| null/.test(txSrc));
check('payee_address is written on update', /payee_address != null \? payee_address : existing\.payee_address/.test(txSrc));

// ── DB round-trip (needs the Electron ABI for better-sqlite3) ───────────────
console.log('\nDB ROUND-TRIP — recorded internally, address preserved');
if (!process.versions.electron) {
  skipNote('DB round-trip (run via scripts/run-verification.js for the Electron runtime)');
} else {
  require('./lib/testDb.js').useScratchCopy({ label: 'verify-check-printing' });
  const Transactions = require('../src/backend/models/transactions');

  const ref = '900' + String(Date.now()).slice(-6);
  const ADDR = 'Unit 4, Riverbend Park\n12 Marine Drive\nCape Town, Western Cape 7441';
  const bank = require('../src/backend/models/dbmgr').get(
    "SELECT id FROM chart_of_accounts WHERE LOWER(type) = 'bank' ORDER BY id LIMIT 1"
  );

  const ins = Transactions.insert({
    date: '2026-09-30', type: 'Check', amount: 1234.56,
    description: `Check #${ref} to Acme Industrial Supplies`,
    reference: ref, accountId: bank && bank.id, debit: 0, credit: 1234.56,
    payee_name: 'Acme Industrial Supplies', payee_address: ADDR, entered_by: 'verify',
  });
  const id = ins.lastInsertRowid;
  const row = Transactions.getById(id);

  check('check number IS stored in the database', String(row.reference) === ref, String(row.reference));
  check('payee name IS stored', row.payee_name === 'Acme Industrial Supplies', String(row.payee_name));
  check('payee address IS stored', row.payee_address === ADDR, JSON.stringify(row.payee_address));
  check('payee address keeps its line breaks', (row.payee_address || '').split('\n').length === 3,
    String((row.payee_address || '').split('\n').length));
  check('the stored check still appears in the check register',
    Transactions.getPaginated(1, 500, ref, 'Check').data.some(t => String(t.reference) === ref));

  // Editing the check without sending an address must NOT wipe it.
  Transactions.update(id, { date: '2026-10-01', type: 'Check', amount: 1234.56, reference: ref, accountId: bank && bank.id });
  check('editing without an address preserves the stored one',
    Transactions.getById(id).payee_address === ADDR, JSON.stringify(Transactions.getById(id).payee_address));

  // Updating the address must persist the new value.
  Transactions.update(id, { date: '2026-10-01', type: 'Check', amount: 1234.56, reference: ref, accountId: bank && bank.id, payee_address: 'New Line 1\nNew Line 2' });
  check('editing the address persists the new value',
    Transactions.getById(id).payee_address === 'New Line 1\nNew Line 2',
    JSON.stringify(Transactions.getById(id).payee_address));

  // Uniqueness still enforced.
  let dupErr = '';
  try {
    Transactions.insert({
      date: '2026-09-30', type: 'Check', amount: 1, description: 'dup', reference: ref,
      accountId: bank && bank.id, debit: 0, credit: 1, entered_by: 'verify',
    });
  } catch (e) { dupErr = e.message; }
  check('a duplicate check number is still refused', /already exists/.test(dupErr), dupErr || '(no error thrown)');
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ''}`);
process.exit(fail === 0 ? 0 : 1);
