#!/usr/bin/env node
/**
 * verify-form-field-grid.js
 *
 * Guards the "fields must sit side by side, not stacked" behaviour of every
 * `<Row><Col xs/md/lg>` grid inside a `layout="vertical"` antd form.
 *
 * WHY THIS EXISTS
 * ---------------
 * The vendored Jumbo theme (public/css/style.min.css) and the template's own
 * LESS (src/styles/ui/form.less) both shipped:
 *
 *     .ant-form-vertical .ant-row { flex-direction: column }
 *
 * Because that selector has specificity (0,2,0) it beats antd's own
 * `.ant-row { flex-direction: row }`, and because every form in this app uses
 * `layout="vertical"`, EVERY responsive grid collapsed into a vertical stack of
 * half-width fields (Add Customer, Add Vendor, New Lead, ...). No existing test
 * noticed, because none of them look at CSS.
 *
 * WHAT IT CHECKS
 * --------------
 *  1. src/styles/ui/form.less no longer forces a column on `.ant-row`.
 *  2. public/css/custom.css restores `flex-direction: row !important`.
 *  3. The compiled build (when present) has neither the bad rule in main.css
 *     nor is missing the restore in custom.css.
 *  4. (When a Chrome/Edge binary is available and a build exists) it actually
 *     renders the real DOM antd produces for a sectioned form + a lead form
 *     against the compiled stylesheets and asserts, from measured geometry,
 *     that the fields really are on the same row.
 *
 * Run:  node scripts/verify-form-field-grid.js [--no-layout]
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend');
const LESS_FILE = path.join(FE, 'src', 'styles', 'ui', 'form.less');
const CUSTOM_CSS = path.join(FE, 'public', 'css', 'custom.css');
const BUILD_CSS_DIR = path.join(FE, 'build', 'static', 'css');
const BUILD_PUBLIC_CSS = path.join(FE, 'build', 'css', 'custom.css');

const args = process.argv.slice(2);
const RUN_LAYOUT = args.indexOf('--no-layout') === -1;

let pass = 0;
let fail = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    pass++;
    console.log('  PASS  ' + label);
  } else {
    fail++;
    failures.push(label + (detail ? '  — ' + detail : ''));
    console.log('  FAIL  ' + label + (detail ? '  — ' + detail : ''));
  }
}

function readIfExists(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; }
}

/** Strip CSS comments so documentation text can never satisfy/break a rule check. */
function stripCssComments(css) {
  return css ? css.replace(/\/\*[\s\S]*?\*\//g, '') : css;
}

// Matches a declaration of `flex-direction: column` (with optional -ms- prefix)
// inside a rule whose selector ends with `.ant-row{`.
const BAD_RULE = /\.ant-row\s*\{[^}]*?(?:-ms-)?flex-direction:\s*column/;
// antd's own `.ant-form-vertical .ant-form-item-row{flex-direction:column}` is
// legitimate and must NOT be flagged — it only stacks the label above its
// control. The BAD_RULE regex above requires `.ant-row{` so it will not match
// `.ant-form-item-row{`.

console.log('\n=== 1. source: src/styles/ui/form.less ===');
{
  const src = readIfExists(LESS_FILE);
  check('form.less exists', !!src);
  if (src) {
    const stripped = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const bad = BAD_RULE.test(stripped);
    check('form.less does NOT force flex-direction:column on .ant-row', !bad,
      bad ? 'found `.ant-row { flex-direction: column }` — this collapses every grid in a vertical form' : null);
    check('form.less keeps `.ant-form-item { padding-bottom: 0 }` for vertical forms',
      /&-vertical\s*\{[\s\S]*?\.ant-form-item\s*\{[\s\S]*?padding-bottom/.test(stripped));
  }
}

console.log('\n=== 2. source: public/css/custom.css ===');
{
  const rawCss = readIfExists(CUSTOM_CSS);
  const css = stripCssComments(rawCss);
  check('custom.css exists', !!rawCss);
  if (css) {
    const restore = /\.ant-form-vertical\s+\.ant-row:not\(\.ant-form-item-row\)\s*\{[^}]*flex-direction:\s*row\s*!important/;
    const stack = /\.ant-form-vertical\s+\.ant-form-item-row\s*\{[^}]*flex-direction:\s*column\s*!important/;
    // An UNSCOPED `.ant-form-vertical .ant-row { flex-direction: row }` also hits
    // antd's `.ant-row.ant-form-item-row` and puts the label BESIDE its control.
    const unscopedRow = /\.ant-form-vertical\s+\.ant-row\s*\{[^}]*flex-direction:\s*row/;

    check('custom.css restores the grid ONLY on real rows (scoped with :not(.ant-form-item-row))',
      restore.test(css),
      restore.test(css) ? null : 'the grid would collapse again');
    check('custom.css does NOT force `flex-direction: row` on an unscoped `.ant-form-vertical .ant-row`',
      !unscopedRow.test(css),
      unscopedRow.test(css) ? 'unscoped row rule hits `.ant-form-item-row` → label beside control' : null);
    check('custom.css pins `.ant-form-item-row` to column (label above control)',
      stack.test(css),
      stack.test(css) ? null : 'labels could sit beside their controls');
  }
}

console.log('\n=== 3. compiled build (skipped if not built) ===');
{
  const mains = fs.existsSync(BUILD_CSS_DIR)
    ? fs.readdirSync(BUILD_CSS_DIR).filter(f => /^main\..*\.css$/.test(f))
    : [];
  if (!mains.length) {
    console.log('  SKIP  no build/static/css/main.*.css present');
  } else {
    mains.forEach(f => {
      const css = readIfExists(path.join(BUILD_CSS_DIR, f));
      check('build/' + f + ' has no `.ant-form-vertical .ant-row{flex-direction:column}`',
        css ? !BAD_RULE.test(css) : false);
    });
  }
  const builtCustom = readIfExists(BUILD_PUBLIC_CSS);
  if (builtCustom === null) {
    console.log('  SKIP  no build/css/custom.css present');
  } else {
    const bcss = stripCssComments(builtCustom);
    const restore = /\.ant-form-vertical\s+\.ant-row:not\(\.ant-form-item-row\)\s*\{[^}]*flex-direction:\s*row\s*!important/;
    const stack = /\.ant-form-vertical\s+\.ant-form-item-row\s*\{[^}]*flex-direction:\s*column\s*!important/;
    const unscopedRow = /\.ant-form-vertical\s+\.ant-row\s*\{[^}]*flex-direction:\s*row/;
    check('build/css/custom.css carries the scoped row restore', restore.test(bcss));
    check('build/css/custom.css pins `.ant-form-item-row` to column', stack.test(bcss));
    check('build/css/custom.css has no unscoped row rule', !unscopedRow.test(bcss));
  }
}

// ---------------------------------------------------------------------------
// 4. Real layout probe
// ---------------------------------------------------------------------------
function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null;
}

/** The exact DOM antd 4.24 renders for a `Row`/`Col` grid inside a vertical form.
 *  NOTE: the label+control wrapper is `<div class="ant-row ant-form-item-row">`
 *  — an earlier version of this harness omitted that wrapper, which is exactly
 *  why the "label beside control" regression slipped through. */
function field(id, label, colClasses) {
  return `
      <div class="ant-col ${colClasses}">
        <div class="ant-form-item" style="margin-bottom:12px">
          <div class="ant-row ant-form-item-row">
            <div class="ant-col ant-form-item-label"><label for="${id}">${label}</label></div>
            <div class="ant-col ant-form-item-control"><div class="ant-form-item-control-input">
              <div class="ant-form-item-control-input-content"><input id="${id}" class="ant-input" type="text"></div>
            </div></div>
          </div>
        </div>
      </div>`;
}

function buildHarness(mainCssHref) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>grid probe</title>
<link rel="stylesheet" href="./css/style.min.css" media="all"/>
<link rel="stylesheet" href="./css/custom.css" media="all"/>
<link rel="stylesheet" href="${mainCssHref}" rel="stylesheet">
<style>body{margin:0;padding:16px;background:#f0f2f5;font-family:sans-serif}</style>
</head><body>
<form class="ant-form ant-form-vertical" style="width:780px;background:#fff;padding:16px">
  <div class="ant-row" style="margin-left:-6px;margin-right:-6px">
    ${field('p1', 'First Name', 'ant-col-xs-24 ant-col-md-12 ant-col-lg-8')}
    ${field('p2', 'Last Name', 'ant-col-xs-24 ant-col-md-12 ant-col-lg-8')}
    ${field('p3', 'Display Name', 'ant-col-xs-24 ant-col-md-12 ant-col-lg-8')}
    ${field('p4', 'Company', 'ant-col-24')}
  </div>
  <div class="ant-row" style="margin-left:-6px;margin-right:-6px">
    ${field('q1', 'Pipeline Stage', 'ant-col-8')}
    ${field('q2', 'Priority', 'ant-col-8')}
    ${field('q3', 'Deal Value', 'ant-col-8')}
  </div>
</form>
<script>
window.addEventListener('load', function () {
  var ids = ['p1','p2','p3','p4','q1','q2','q3'];
  var out = { antRowFlexDirection: getComputedStyle(document.querySelector('.ant-row')).flexDirection, items: {} };
  ids.forEach(function (id) {
    var el = document.getElementById(id);
    var col = el.closest('.ant-col');
    var item = el.closest('.ant-form-item');
    var label = item.querySelector('.ant-form-item-label');
    var itemRow = item.querySelector('.ant-form-item-row');
    var r = el.getBoundingClientRect();
    var lr = label.getBoundingClientRect();
    out.items[id] = {
      top: Math.round(r.top),
      left: Math.round(r.left),
      colWidth: Math.round(col.getBoundingClientRect().width),
      labelBottom: Math.round(lr.bottom),
      inputTop: Math.round(r.top),
      itemRowDirection: itemRow ? getComputedStyle(itemRow).flexDirection : 'none'
    };
  });
  var pre = document.createElement('pre');
  pre.id = 'probe-out';
  pre.textContent = JSON.stringify(out);
  document.body.appendChild(pre);
});
</script></body></html>`;
}

console.log('\n=== 4. rendered layout (real browser) ===');
{
  const mains = fs.existsSync(BUILD_CSS_DIR)
    ? fs.readdirSync(BUILD_CSS_DIR).filter(f => /^main\..*\.css$/.test(f))
    : [];
  const browser = findBrowser();

  if (!RUN_LAYOUT) {
    console.log('  SKIP  --no-layout');
  } else if (!browser) {
    console.log('  SKIP  no Chrome/Edge binary found');
  } else if (!mains.length) {
    console.log('  SKIP  no compiled main.css — run the frontend build first');
  } else if (!fs.existsSync(path.join(FE, 'build', 'css', 'custom.css'))) {
    console.log('  SKIP  no build/css/custom.css');
  } else {
    const harnessPath = path.join(FE, 'build', '__verify_form_field_grid.html');
    const userDataDir = path.join(require('os').tmpdir(), 'gridprobe_' + process.pid);
    try {
      fs.writeFileSync(harnessPath, buildHarness('./static/css/' + mains[0]), 'utf8');
      const dom = execFileSync(browser, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
        '--user-data-dir=' + userDataDir,
        '--virtual-time-budget=6000',
        '--window-size=1400,1000',
        '--dump-dom',
        'file:///' + harnessPath.replace(/\\/g, '/'),
      ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

      const m = /<pre id="probe-out">([\s\S]*?)<\/pre>/.exec(dom);
      if (!m) {
        check('layout probe produced measurements', false, 'no #probe-out in the rendered DOM');
      } else {
        const data = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
        const it = data.items;
        check('`.ant-row` inside a vertical form is a row', data.antRowFlexDirection === 'row',
          'flex-direction=' + data.antRowFlexDirection);

        const sameRow = (a, b, c) => it[a].top === it[b].top && it[b].top === it[c].top;
        const spread = (a, b, c) => it[a].left < it[b].left && it[b].left < it[c].left;

        check('xs/md/lg row: First/Last/Display Name share one row', sameRow('p1', 'p2', 'p3'),
          JSON.stringify([it.p1, it.p2, it.p3]));
        check('xs/md/lg row: the three columns advance left→right', spread('p1', 'p2', 'p3'));
        check('xs/md/lg row: each column is ~1/3 of the row',
          Math.abs(it.p1.colWidth - it.p2.colWidth) <= 1 && it.p1.colWidth > 150 && it.p1.colWidth < 300,
          'colWidth=' + it.p1.colWidth);
        check('span={24} field drops to the next row', it.p4.top > it.p1.top);
        check('span={24} field spans the full row', it.p4.colWidth > it.p1.colWidth * 2.5,
          it.p1.colWidth + ' vs ' + it.p4.colWidth);

        check('span={8} row: Pipeline/Priority/Deal Value share one row', sameRow('q1', 'q2', 'q3'),
          JSON.stringify([it.q1, it.q2, it.q3]));
        check('span={8} row: the three columns advance left→right', spread('q1', 'q2', 'q3'));

        // The whole point of this guard: a label must sit ABOVE its control,
        // never beside it. `.ant-form-item-row` (which also carries `.ant-row`)
        // must stay a column.
        check('item row is a column (label above control): First Name',
          it.p1.itemRowDirection === 'column', 'flex-direction=' + it.p1.itemRowDirection);
        check('label sits above its control: First Name',
          it.p1.labelBottom <= it.p1.inputTop + 1, JSON.stringify(it.p1));
        check('label sits above its control: Company',
          it.p4.labelBottom <= it.p4.inputTop + 1, JSON.stringify(it.p4));
        check('label sits above its control: Pipeline Stage',
          it.q1.labelBottom <= it.q1.inputTop + 1, JSON.stringify(it.q1));
      }
    } catch (e) {
      check('layout probe ran', false, e.message);
    } finally {
      try { fs.unlinkSync(harnessPath); } catch (e) { /* ignore */ }
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
  }
}

console.log('\n' + '='.repeat(64));
console.log(pass + ' passed, ' + fail + ' failed');
if (fail) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  • ' + f));
}
console.log('='.repeat(64) + '\n');
process.exit(fail ? 1 : 0);
