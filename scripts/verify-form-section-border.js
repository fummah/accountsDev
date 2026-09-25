#!/usr/bin/env node
/**
 * verify-form-section-border.js
 *
 * Renders the REAL shared `FormSection` component (src/frontend/src/components/
 * shared/FormSection.js) with react-dom/server, then loads the rendered markup
 * in headless Chrome together with the app's real custom.css and asserts the
 * COMPUTED border on all four sides.
 *
 * This proves the boxed form sections (Invoice / Quote / Customer / Vendor /
 * Lead …) have a real, visible outline — not just a class name.
 *
 * Run: node scripts/verify-form-section-border.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend');
const CSS = path.join(FE, 'public', 'css', 'custom.css');
const FORM_SECTION = path.join(FE, 'src', 'components', 'shared', 'FormSection.js');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail ? '  — ' + detail : '')); }
};

// ── 1. source-level: the shared component defines the token-based border ──────
const sectionSrc = fs.readFileSync(FORM_SECTION, 'utf8');
check('FormSection uses a 1px outer border',
  /border:\s*'1px solid var\(--al-form-section-border/.test(sectionSrc), sectionSrc.match(/border:\s*'[^']+'/)?.[0]);
check('FormSection header divider is lighter than the outer border',
  /borderBottom:\s*'1px solid var\(--al-form-section-divider/.test(sectionSrc));
check('border radius preserved (8px)', /borderRadius:\s*8/.test(sectionSrc));
check('padding preserved (compact)', /padding:\s*'12px 16px 2px'/.test(sectionSrc));
check('background stays white', /background:\s*'#fff'/.test(sectionSrc));

// ── 2. real render of the shared component ────────────────────────────────────
let markup = '';
try {
  const babel = require(path.join(FE, 'node_modules', '@babel', 'core'));
  const React = require(path.join(FE, 'node_modules', 'react'));
  const ReactDOMServer = require(path.join(FE, 'node_modules', 'react-dom', 'server'));

  const tmpFile = path.join(FE, '.tmp_formsection_render.js');
  const { code } = babel.transformSync(sectionSrc, {
    filename: FORM_SECTION,
    presets: [path.join(FE, 'node_modules', '@babel', 'preset-react')],
  });
  fs.writeFileSync(tmpFile, code, 'utf8');
  // Always remove the transpiled helper, even if requiring it throws (the
  // module loader can hold the file open on Windows until process exit).
  process.on('exit', () => { try { fs.unlinkSync(tmpFile); } catch { /* ignore */ } });
  delete require.cache[tmpFile];
  const FormSection = require(tmpFile).default;
  markup = ReactDOMServer.renderToStaticMarkup(
    React.createElement(FormSection, { title: 'Source' },
      React.createElement('div', { id: 'probe-child' }, 'content'))
  );
  fs.unlinkSync(tmpFile);
  check('the real FormSection renders', /<div/.test(markup) && /Source/.test(markup));
} catch (e) {
  check('the real FormSection renders', false, e.message);
}

// ── 3. computed border in headless Chrome (real custom.css) ───────────────────
function findBrowser() {
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean).find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || null;
}

const browser = findBrowser();
if (!browser) {
  console.log('  SKIP  no Chrome/Edge binary found (computed-style check)');
} else {
  const harness = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file:///${CSS.replace(/\\/g, '/')}" media="all"/>
<style>body{margin:0;padding:20px;background:#f5f5f5;font-family:sans-serif}</style>
</head><body>
${markup}
<script>
window.addEventListener('load', function () {
  var el = document.querySelector('body > div');
  var cs = getComputedStyle(el);
  var pre = document.createElement('pre'); pre.id = 'probe-out';
  pre.textContent = JSON.stringify({
    top: cs.borderTopWidth, right: cs.borderRightWidth,
    bottom: cs.borderBottomWidth, left: cs.borderLeftWidth,
    color: cs.borderTopColor, style: cs.borderTopStyle,
    radius: cs.borderTopLeftRadius, background: cs.backgroundColor,
  });
  document.body.appendChild(pre);
});
</script></body></html>`;
  const harnessPath = path.join(os.tmpdir(), 'verify_formsection_' + process.pid + '.html');
  fs.writeFileSync(harnessPath, harness, 'utf8');
  const userDataDir = path.join(os.tmpdir(), 'fsborder_' + process.pid);
  try {
    const dom = execFileSync(browser, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--user-data-dir=' + userDataDir, '--virtual-time-budget=4000',
      '--window-size=1000,800', '--dump-dom',
      'file:///' + harnessPath.replace(/\\/g, '/'),
    ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    const m = /<pre id="probe-out">([\s\S]*?)<\/pre>/.exec(dom);
    const r = m ? JSON.parse(m[1].replace(/&quot;/g, '"')) : null;
    check('computed border is 1px on ALL four sides',
      r && r.top === '1px' && r.right === '1px' && r.bottom === '1px' && r.left === '1px',
      JSON.stringify(r));
    check('computed border is solid (not none/hidden)',
      r && r.style === 'solid', r && r.style);
    check('computed border color is the stronger neutral token (rgb(217, 217, 217))',
      r && r.color === 'rgb(217, 217, 217)', r && r.color);
    check('rounded corners preserved (8px)', r && r.radius === '8px', r && r.radius);
    check('card background is white', r && r.background === 'rgb(255, 255, 255)', r && r.background);
  } catch (e) {
    check('computed-style probe ran', false, e.message);
  } finally {
    try { fs.unlinkSync(harnessPath); } catch { /* ignore */ }
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

console.log('\n' + '='.repeat(56));
console.log(pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(56) + '\n');
process.exit(fail ? 1 : 0);
