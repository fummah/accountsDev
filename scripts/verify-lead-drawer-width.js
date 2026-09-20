#!/usr/bin/env node
/**
 * verify-lead-drawer-width.js
 *
 * CRM → Leads → View Lead drawer:
 *   desktop (>=992px) -> 680px
 *   tablet  (576-991) -> 88vw
 *   mobile  (<=575)   -> 100vw
 * and the header wraps / long values wrap (no horizontal overflow).
 *
 * The rendered probe loads the SOURCE theme (style.min.css) + custom.css and
 * sets the inline width to 520px (the old value) to prove the shared CSS wins.
 *
 * Run: node scripts/verify-lead-drawer-width.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend');
const CSS = path.join(FE, 'public', 'css', 'custom.css');
const THEME = path.join(FE, 'public', 'css', 'style.min.css');
const LEADS = path.join(FE, 'src', 'components', 'customers', 'Leads.js');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail ? '  — ' + detail : '')); }
};

console.log('\n=== source ===');
{
  const css = fs.readFileSync(CSS, 'utf8');
  check('custom.css defines 680px for .app-detail-drawer',
    /\.ant-drawer\.app-detail-drawer \.ant-drawer-content-wrapper\s*\{[^}]*width:\s*680px\s*!important/.test(css));
  check('tablet breakpoint (88vw)',
    /@media[^{]*max-width:\s*991px[^{]*\{[\s\S]*?\.ant-drawer\.app-detail-drawer \.ant-drawer-content-wrapper\s*\{[^}]*width:\s*88vw/.test(css));
  check('mobile breakpoint (100vw)',
    /@media[^{]*max-width:\s*575px[^{]*\{[\s\S]*?\.ant-drawer\.app-detail-drawer \.ant-drawer-content-wrapper\s*\{[^}]*width:\s*100vw/.test(css));
  check('body wraps long values (overflow-wrap:anywhere)',
    /\.ant-drawer\.app-detail-drawer \.ant-drawer-body\s*\{[^}]*overflow-wrap:\s*anywhere/.test(css));

  const leads = fs.readFileSync(LEADS, 'utf8');
  check('View Lead drawer opts into app-detail-drawer', /className="app-detail-drawer"/.test(leads));
  check('View Lead drawer width is 680', /width=\{680\}\s+visible=\{!!drawerLead\}/.test(leads));
  check('header title wraps (flexWrap + Space wrap)',
    /flexWrap:'wrap'[\s\S]{0,120}<Space wrap>/.test(leads.replace(/\s+/g, '')) || /flexWrap: 'wrap'/.test(leads) && /<Space wrap>/.test(leads));
  check('no leftover width={520} for the lead drawer', !/width=\{520\} visible=\{!!drawerLead\}/.test(leads));
}

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  return candidates.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null;
}

const browser = findBrowser();
console.log('\n=== rendered width (real browser, source CSS) ===');
if (!browser) {
  console.log('  SKIP  no Chrome/Edge binary found');
} else {
  const harness = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file:///${THEME.replace(/\\/g, '/')}" media="all"/>
<link rel="stylesheet" href="file:///${CSS.replace(/\\/g, '/')}" media="all"/>
</head><body>
<div class="ant-drawer ant-drawer-right ant-drawer-open app-detail-drawer" style="position:fixed;inset:0">
  <div class="ant-drawer-mask"></div>
  <div class="ant-drawer-content-wrapper" style="width:520px">
    <div class="ant-drawer-content"><div class="ant-drawer-body">body</div></div>
  </div>
</div>
<script>
window.addEventListener('load', function () {
  var w = document.querySelector('.app-detail-drawer .ant-drawer-content-wrapper');
  var pre = document.createElement('pre'); pre.id = 'probe-out';
  pre.textContent = JSON.stringify({ width: Math.round(w.getBoundingClientRect().width), vw: window.innerWidth });
  document.body.appendChild(pre);
});
</script></body></html>`;
  const harnessPath = path.join(os.tmpdir(), 'verify_lead_drawer.html');
  fs.writeFileSync(harnessPath, harness, 'utf8');

  const measure = (winW) => {
    const userDataDir = path.join(os.tmpdir(), 'leaddrawer_' + process.pid + '_' + winW);
    try {
      const dom = execFileSync(browser, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
        '--user-data-dir=' + userDataDir,
        '--virtual-time-budget=4000',
        '--window-size=' + winW + ',900',
        '--dump-dom',
        'file:///' + harnessPath.replace(/\\/g, '/'),
      ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
      const m = /<pre id="probe-out">([\s\S]*?)<\/pre>/.exec(dom);
      return m ? JSON.parse(m[1].replace(/&quot;/g, '"')) : null;
    } finally {
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
  };

  try {
    const desktop = measure(1440);
    const tablet = measure(768);
    const mobile = measure(375);
    check('desktop 1440px: drawer is 680px', desktop && desktop.width === 680, JSON.stringify(desktop));
    check('tablet 768px: drawer is ~88vw', tablet && Math.abs(tablet.width - Math.round(0.88 * tablet.vw)) <= 2, JSON.stringify(tablet));
    check('mobile 375px: drawer is full width', mobile && Math.abs(mobile.width - mobile.vw) <= 1, JSON.stringify(mobile));
    check('desktop drawer is not full screen', desktop && desktop.width < desktop.vw);
  } catch (e) {
    check('drawer probe ran', false, e.message);
  } finally {
    try { fs.unlinkSync(harnessPath); } catch (e) { /* ignore */ }
  }
}

console.log('\n' + '='.repeat(56));
console.log(pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(56) + '\n');
process.exit(fail ? 1 : 0);
