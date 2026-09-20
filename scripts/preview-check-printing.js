// Renders the REAL check-print template (sliced out of CheckPrinting.js and
// executed) in headless Chrome and writes a PNG so the physical layout can be
// eyeballed without printing a cheque.
//
// Run:  node scripts/preview-check-printing.js
//
// Writes CHECK_PRINTING_PREVIEW.png at the repo root (816px = 8.5in at 96dpi,
// captured at 2x for legibility).
/* eslint-disable no-console */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC_PATH = path.join(ROOT, 'src', 'frontend', 'src', 'components', 'accountant', 'CheckPrinting.js');
const OUT_PNG = path.join(ROOT, 'CHECK_PRINTING_PREVIEW.png');

const src = fs.readFileSync(SRC_PATH, 'utf8');
const slice = (a, b) => {
  const s = src.indexOf(a), e = src.indexOf(b, s);
  if (s < 0 || e < 0) throw new Error(`marker not found: ${a}`);
  return src.slice(s, e);
};

// Pull the money helpers + the template generator straight out of the component
// so the preview can never drift from what actually prints.
const helpers = slice('const toCents = (v)', 'const CheckPrinting = () => {');
const { toWords } = new Function(`${helpers}\nreturn { toWords };`)();
const genSrc = slice('const generateCheckHtml = (vals, forPrint) => {', 'const handlePreview = () => {');
const generateCheckHtml = new Function('toWords', 'company', 'cSym', `${genSrc}\nreturn generateCheckHtml;`)(toWords, {}, '$');

const FIXTURE = {
  date: { format: () => '09/30/2026' },
  payeeName: 'Acme Industrial Supplies',
  payeeAddress: 'Unit 4, Riverbend Park\n12 Marine Drive\nCape Town, Western Cape 7441',
  amount: 1234.56,
  checkNumber: '1042',
  memo: 'Invoice INV-88213',
  splitLines: [
    { description: 'Steel fittings', amount: 1000.00 },
    { description: 'Freight', amount: 234.56 },
  ],
  _company: { name: 'Ledger Demo Co' },
};

const html = generateCheckHtml(FIXTURE, false);

function findBrowser() {
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean).find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || null;
}

const browser = findBrowser();
if (!browser) {
  console.error('No Chrome/Edge found — cannot render the preview.');
  process.exit(1);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpreview-'));
const harness = path.join(tmpDir, 'check.html');
fs.writeFileSync(harness, html);

execFileSync(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--user-data-dir=' + path.join(tmpDir, 'profile'),
  '--virtual-time-budget=6000',
  '--force-device-scale-factor=2',
  '--window-size=816,700',
  '--screenshot=' + OUT_PNG,
  'file:///' + harness.replace(/\\/g, '/'),
], { stdio: ['ignore', 'ignore', 'ignore'] });

try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* scratch only */ }

const kb = (fs.statSync(OUT_PNG).size / 1024).toFixed(0);
console.log(`Wrote ${path.relative(ROOT, OUT_PNG)} (${kb} KB)`);
console.log('Fixture: Acme Industrial Supplies · $1,234.56 · 3-line address · memo · check #1042 (must NOT appear).');
