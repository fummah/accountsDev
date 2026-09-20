#!/usr/bin/env node
/**
 * verify-drawer-width.js
 *
 * Renders the real antd Drawer DOM (with `className="app-form-drawer"`) against
 * the compiled stylesheets and measures the drawer width at desktop / tablet /
 * mobile widths, asserting the responsive contract:
 *
 *   desktop (>=992px)  -> 600px
 *   tablet  (576-991)  -> 80vw
 *   mobile  (<=575)    -> 100vw
 *
 * The inline width is deliberately set to 700px in the harness to prove the
 * shared CSS (not the component prop) governs the width.
 *
 * Run: node scripts/verify-drawer-width.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend');
const BUILD_CSS = path.join(FE, 'build', 'css');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail ? '  — ' + detail : '')); }
};

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

// ── source checks ───────────────────────────────────────────────────────────
console.log('\n=== source: custom.css + component ===');
{
  const css = fs.readFileSync(path.join(FE, 'public', 'css', 'custom.css'), 'utf8');
  check('custom.css defines the desktop 600px drawer width',
    /\.app-form-drawer \.ant-drawer-content-wrapper\s*\{[^}]*width:\s*600px\s*!important/.test(css));
  check('custom.css has a tablet 80vw breakpoint',
    /@media[^{]*max-width:\s*991px[^{]*\{[\s\S]*?\.app-form-drawer \.ant-drawer-content-wrapper\s*\{[^}]*width:\s*80vw/.test(css));
  check('custom.css has a mobile 100vw breakpoint',
    /@media[^{]*max-width:\s*575px[^{]*\{[\s\S]*?\.app-form-drawer \.ant-drawer-content-wrapper\s*\{[^}]*width:\s*100vw/.test(css));
  const comp = fs.readFileSync(path.join(FE, 'src', 'components', 'vendors', 'SupplierVendorList.js'), 'utf8');
  check('SupplierVendorList Add/Edit drawer opts into app-form-drawer',
    /Add Supplier \/ Vendor'[\s\S]{0,120}className="app-form-drawer"/.test(comp));
}

// ── real layout probe ───────────────────────────────────────────────────────
const browser = findBrowser();
const mains = fs.existsSync(path.join(FE, 'build', 'static', 'css'))
  ? fs.readdirSync(path.join(FE, 'build', 'static', 'css')).filter(f => /^main\..*\.css$/.test(f))
  : [];
const builtCustom = path.join(BUILD_CSS, 'custom.css');

console.log('\n=== rendered width (real browser) ===');
if (!browser) {
  console.log('  SKIP  no Chrome/Edge binary found');
} else if (!mains.length || !fs.existsSync(builtCustom)) {
  console.log('  SKIP  build/css not present — run the frontend build first');
} else {
  const harness = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="./css/style.min.css" media="all"/>
<link rel="stylesheet" href="./css/custom.css" media="all"/>
<link rel="stylesheet" href="./static/css/${mains[0]}" media="all"/>
</head><body>
<div class="ant-drawer ant-drawer-right ant-drawer-open app-form-drawer" style="position:fixed;inset:0">
  <div class="ant-drawer-mask"></div>
  <div class="ant-drawer-content-wrapper" style="width:700px">
    <div class="ant-drawer-content"><div class="ant-drawer-body">body</div></div>
  </div>
</div>
<script>
window.addEventListener('load', function () {
  var w = document.querySelector('.app-form-drawer .ant-drawer-content-wrapper');
  var pre = document.createElement('pre'); pre.id = 'probe-out';
  pre.textContent = JSON.stringify({ width: Math.round(w.getBoundingClientRect().width), vw: window.innerWidth });
  document.body.appendChild(pre);
});
</script></body></html>`;
  const harnessPath = path.join(FE, 'build', '__verify_drawer_width.html');
  fs.writeFileSync(harnessPath, harness, 'utf8');

  const measure = (winW) => {
    const userDataDir = path.join(os.tmpdir(), 'drawerprobe_' + process.pid + '_' + winW);
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

    check('desktop 1440px: drawer is 600px', desktop && desktop.width === 600, JSON.stringify(desktop));
    check('tablet 768px: drawer is ~80vw (614px)', tablet && Math.abs(tablet.width - Math.round(0.8 * tablet.vw)) <= 2, JSON.stringify(tablet));
    check('mobile 375px: drawer is full width', mobile && Math.abs(mobile.width - mobile.vw) <= 1, JSON.stringify(mobile));
    check('desktop drawer is not full screen (600 < 95vw)', desktop && desktop.width < desktop.vw);
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
