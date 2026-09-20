/**
 * Renders a faithful visual preview of the new sectioned Create-Invoice layout
 * using the REAL compiled stylesheets from `src/frontend/build/`.
 *
 * This is a rendering aid, not a test: `verify-form-field-grid.js` is the suite
 * that asserts geometry. Here we just want a picture the reviewer can look at,
 * including proof that the grid degrades on a narrow viewport.
 *
 * The harness reproduces the exact DOM antd 4.24 emits for
 * `<Form layout="vertical">` + `<Row gutter={16}>` + `<Col xs/md/lg>` +
 * `<Form.Item>`, and the exact inline styles `FormSection` / `FormGrid` /
 * `FormCol` / `TotalsBlock` / `DocumentActionBar` apply — so what renders is
 * what the app renders.
 *
 *   node scripts/preview-transactional-forms.js
 *
 * Output: TRANSACTIONAL_FORMS_PREVIEW.png (desktop) and
 *         TRANSACTIONAL_FORMS_PREVIEW_MOBILE.png (narrow)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend');
const BUILD = path.join(FE, 'build');

// ── browser discovery (same candidates as verify-form-field-grid.js) ─────────
function findBrowser() {
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean).find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null;
}

// ── antd 4.24 control markup ────────────────────────────────────────────────
const GUTTER_HALF = 8; // FormGrid gutter 16

const control = (kind, text) => {
  switch (kind) {
    case 'select':
      return `<div class="ant-select ant-select-single ant-select-show-arrow" style="width:100%">
        <div class="ant-select-selector"><span class="ant-select-selection-item">${text}</span>
        <span class="ant-select-arrow"><span role="img" class="anticon">▾</span></span></div></div>`;
    case 'date':
      return `<div class="ant-picker" style="width:100%"><div class="ant-picker-input">
        <input readonly value="${text}"><span class="ant-picker-suffix"><span class="anticon">▦</span></span></div></div>`;
    case 'textarea':
      return `<textarea class="ant-input" rows="2" readonly>${text}</textarea>`;
    case 'number':
      return `<div class="ant-input-number" style="width:100%"><div class="ant-input-number-input-wrap">
        <input class="ant-input-number-input" readonly value="${text}"></div></div>`;
    default:
      return `<input class="ant-input" type="text" readonly value="${text}">`;
  }
};

/** One grid cell: <Col><Form.Item label + control></Form.Item></Col> */
const cell = (label, kind, text, col = 'ant-col-xs-24 ant-col-md-12 ant-col-lg-8') => `
    <div class="ant-col ${col}" style="padding-left:${GUTTER_HALF}px;padding-right:${GUTTER_HALF}px">
      <div class="ant-form-item" style="margin-bottom:12px">
        <div class="ant-form-item-row">
          <div class="ant-form-item-label"><label>${label}</label></div>
          <div class="ant-form-item-control"><div class="ant-form-item-control-input">
            <div class="ant-form-item-control-input-content">${control(kind, text)}</div>
          </div></div>
        </div>
      </div>
    </div>`;

const row = (cells) => `
  <div class="ant-row" style="margin-left:-${GUTTER_HALF}px;margin-right:-${GUTTER_HALF}px">${cells}
  </div>`;

// ── FormSection / TotalsBlock / DocumentActionBar, inline styles verbatim ────
const SECTION = 'border:1px solid #f0f0f0;border-radius:8px;padding:12px 16px 2px;margin-bottom:12px;background:#fff';
const HEADER = 'display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;'
  + 'letter-spacing:0.04em;text-transform:uppercase;color:#595959;line-height:18px;'
  + 'margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f5f5f5';
const ICON = 'font-size:13px;color:#8c8c8c;display:inline-flex;align-items:center';

const section = (title, glyph, body, extra) => `
  <div style="${SECTION}">
    <div style="${HEADER}"><span style="${ICON}">${glyph}</span><span>${title}</span>${
  extra ? `<span style="margin-left:auto;text-transform:none;letter-spacing:0;font-weight:400;color:#8c8c8c">${extra}</span>` : ''
}</div>
    <div>${body}</div>
  </div>`;

const totalsRow = (label, value, strong) => `
      <div style="display:flex;justify-content:space-between;gap:24px;line-height:22px;font-size:${strong ? 15 : 13}px;font-weight:${strong ? 600 : 400}">
        <span style="color:#595959">${label}</span><span style="font-variant-numeric:tabular-nums">${value}</span>
      </div>`;

const totals = (rows) => `
    <div style="text-align:right;min-width:260px;padding:4px 0 12px">${rows}</div>`;

const actionBar = (left, right) => `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-top:12px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${left}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end">${right}</div>
    </div>`;

const btn = (label, cls = '') => `<button class="ant-btn ant-btn-lg ${cls}">${label}</button>`;

// ── a small antd Table (the line-items table) ────────────────────────────────
// `scroll={{ x: 'max-content' }}` makes antd emit an overflow container around the
// table body — that is what keeps a 7-column table from widening the whole page on
// a phone. Reproduced here so the narrow preview shows the real behaviour.
const table = (cols, rowsData) => `
    <div class="ant-table-wrapper">
      <div class="ant-spin-nested-loading"><div class="ant-spin-container">
        <div class="ant-table"><div class="ant-table-container"><div class="ant-table-content" style="overflow:auto hidden">
          <table style="table-layout:auto;min-width:100%">
            <thead class="ant-table-thead"><tr>${cols.map((c) => `<th class="ant-table-cell">${c}</th>`).join('')}</tr></thead>
            <tbody class="ant-table-tbody">${rowsData.map((r) => `<tr class="ant-table-row ant-table-row-level-0">${r.map((c) => `<td class="ant-table-cell">${c}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div></div></div>
      </div></div>
    </div>`;

// ── the preview page: Create Invoice, exactly as the app composes it ─────────
const buildHarness = (mainCssHref) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Create Invoice — preview</title>
<link rel="stylesheet" href="./css/style.min.css" media="all"/>
<link rel="stylesheet" href="./css/custom.css" media="all"/>
<link rel="stylesheet" href="${mainCssHref}"/>
<style>
  html,body{margin:0;padding:0}
  body{background:#f0f2f5;font-family:-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:rgba(0,0,0,.85)}
  .preview-badge{position:fixed;top:0;right:0;background:#1890ff;color:#fff;font:600 11px/1 sans-serif;
    padding:6px 10px;border-bottom-left-radius:6px;z-index:9;letter-spacing:.04em}
</style>
</head><body>
<div class="preview-badge">LAYOUT PREVIEW</div>
<div style="padding:24px;max-width:1280px;margin:0 auto">

  <!-- page header: Back + title, document actions -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
    <div style="display:inline-flex;align-items:center;gap:8px">
      <button class="ant-btn" style="border-radius:8px;color:#595959;border-color:#d9d9d9">← Back</button>
      <h2 style="margin:0;font-size:24px;font-weight:500">Create Invoice</h2>
    </div>
    <div style="display:inline-flex;gap:8px;flex-wrap:wrap">
      <button class="ant-btn">View Customer</button>
      <button class="ant-btn">Customize Template</button>
    </div>
  </div>

  <div class="ant-card"><div class="ant-card-body">
  <form class="ant-form ant-form-vertical">

    ${section('Invoice Details', '▤', `
      ${row(
    cell('Customer', 'select', 'Acme Corporation') +
        cell('Invoice Number', 'text', 'INV-1042') +
        cell('Payment Terms', 'select', 'Net 30')
  )}
      ${row(
    cell('Invoice Date', 'date', '09/11/2026') +
        cell('Due Date', 'date', '10/11/2026') +
        cell('Email', 'text', 'billing@acme.com')
  )}
      ${row(
    cell('Billing Address', 'textarea', 'Acme Corporation&#10;500 Industrial Way, Suite 200&#10;Springfield, IL 62704', 'ant-col-xs-24 ant-col-md-24 ant-col-lg-16') +
        cell('Tax Rate (%)', 'select', 'Standard (10%)') +
        `<div class="ant-col ant-col-xs-24 ant-col-md-12 ant-col-lg-8" style="padding-left:8px;padding-right:8px">
          <div class="ant-form-item" style="margin-bottom:12px"><div class="ant-form-item-row">
            <div class="ant-form-item-label"><label>Status</label></div>
            <div class="ant-form-item-control"><div class="ant-form-item-control-input">
              <div class="ant-form-item-control-input-content">
                <div style="display:flex;align-items:center;gap:8px;min-height:32px">
                  <span class="ant-tag ant-tag-green" style="margin:0">Open</span>
                  <span style="color:#8c8c8c;font-size:12px">Set automatically from payments</span>
                </div>
              </div></div></div>
          </div></div>
        </div>`
  )}
    `)}

    ${section('Line Items', '▦',
    table(
      ['Product / Service', 'Description', 'Qty', 'Price', 'Tax', 'Amount', ''],
      [
        ['Consulting', 'Implementation support', '10', '$120.00', '10%', '$1,320.00', '🗑'],
        ['Support Plan', 'Annual maintenance', '1', '$480.00', '10%', '$528.00', '🗑'],
      ]
    )
    + `<div style="display:flex;justify-content:flex-start;padding:8px 0 0">
         <button class="ant-btn ant-btn-dashed">+ Add Line</button>
       </div>`
    + totals(
      totalsRow('Subtotal', '$1,680.00') +
        totalsRow('Tax (10%)', '$168.00') +
        totalsRow('Total', '$1,848.00', true) +
        totalsRow('Paid to Date', '$0.00') +
        totalsRow('Balance Due', '$1,848.00', true)
    ), '')}

    <div class="ant-row" style="margin-left:-8px;margin-right:-8px">
      <div class="ant-col ant-col-xs-24 ant-col-md-12 ant-col-lg-12" style="padding-left:8px;padding-right:8px">
        ${section('Message on Invoice', '✉',
    `<div class="ant-form-item" style="margin-bottom:12px"><div class="ant-form-item-row">
          <div class="ant-form-item-control"><div class="ant-form-item-control-input">
            <div class="ant-form-item-control-input-content">
              <textarea class="ant-input" rows="2" readonly>Thank you for your business. Payment is due within 30 days.</textarea>
            </div></div></div>
        </div></div>`)}
      </div>
      <div class="ant-col ant-col-xs-24 ant-col-md-12 ant-col-lg-12" style="padding-left:8px;padding-right:8px">
        ${section('Statement Memo', '▤',
      `<div class="ant-form-item" style="margin-bottom:12px"><div class="ant-form-item-row">
          <div class="ant-form-item-control"><div class="ant-form-item-control-input">
            <div class="ant-form-item-control-input-content">
              <textarea class="ant-input" rows="2" readonly>PO 88431 — project phase 2.</textarea>
            </div></div></div>
        </div></div>`)}
      </div>
    </div>

    ${section('Actions', '⌸',
    actionBar(
      btn('Cancel'),
      btn('Save Invoice', 'ant-btn-primary') + btn('Save &amp; Email')
    ))}

  </form>
  </div></div>
</div>
<script>
window.addEventListener('load', function () {
  var widest = null, max = 0;
  document.querySelectorAll('*').forEach(function (el) {
    var r = el.getBoundingClientRect();
    if (r.right > max) { max = r.right; widest = el.tagName + '.' + String(el.className || '').split(' ')[0]; }
  });
  var pre = document.createElement('pre');
  pre.id = 'probe-out';
  pre.style.display = 'none'; // parsed from --dump-dom; must not appear in the screenshot
  pre.textContent = JSON.stringify({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    widestRight: Math.round(max),
    widest: widest
  });
  document.body.appendChild(pre);
});
</script>
</body></html>`;

// ── run ─────────────────────────────────────────────────────────────────────
const mains = fs.existsSync(path.join(BUILD, 'static', 'css'))
  ? fs.readdirSync(path.join(BUILD, 'static', 'css')).filter((f) => /^main\..*\.css$/.test(f))
  : [];
const browser = findBrowser();

if (!browser) { console.error('No Chrome/Edge binary found.'); process.exit(1); }
if (!mains.length) { console.error('No compiled main.css — run the frontend build first.'); process.exit(1); }

const harnessInBuild = path.join(BUILD, '__preview_forms.html');
const parkDir = path.join(ROOT, '.workbuddy-ai', 'tmp');
const parked = path.join(parkDir, '__preview_forms.html');

// NOTE: Chrome on Windows clamps its window to ~504px, so asking for 430 gives a
// 504px layout written into a 430px image — i.e. a CROPPED screenshot that looks
// like overflow when there is none. 540 keeps the image (540) wider than the
// layout viewport (540 - 18 = 522), so nothing is cut, and 522px is still below
// antd's `xs` breakpoint (max-width: 575px) so the single-column layout applies.
const SHOTS = [
  ['TRANSACTIONAL_FORMS_PREVIEW.png', '1440,1400'],
  ['TRANSACTIONAL_FORMS_PREVIEW_MOBILE.png', '540,1900'],
];
const PROBE_SIZE = '540,1900';

try {
  fs.mkdirSync(parkDir, { recursive: true });
  fs.writeFileSync(harnessInBuild, buildHarness('./static/css/' + mains[0]), 'utf8');

  for (const [out, size] of SHOTS) {
    const png = path.join(ROOT, out);
    const userDataDir = path.join(os.tmpdir(), 'formpreview_' + process.pid + '_' + size.replace(',', 'x'));
    const common = [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--user-data-dir=' + userDataDir,
      '--virtual-time-budget=6000',
      '--window-size=' + size,
    ];
    execFileSync(browser, common.concat(['--screenshot=' + png, 'file:///' + harnessInBuild.replace(/\\/g, '/')]),
      { stdio: ['ignore', 'ignore', 'ignore'], timeout: 180000 });
    const kb = fs.existsSync(png) ? Math.round(fs.statSync(png).size / 1024) : 0;
    console.log(`${out}  (${size})  ${kb} KB`);
  }

  // Overflow check: the narrow viewport must NOT produce a horizontal scrollbar.
  const dom = execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--user-data-dir=' + path.join(os.tmpdir(), 'formprobe_' + process.pid),
    '--virtual-time-budget=6000',
    '--window-size=' + PROBE_SIZE,
    '--dump-dom',
    'file:///' + harnessInBuild.replace(/\\/g, '/'),
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

  const m = /<pre id="probe-out"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
  if (!m) {
    console.log('overflow probe: no output');
  } else {
    const d = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    const overflow = d.scrollWidth - d.clientWidth;
    console.log(`overflow probe @${d.clientWidth}px viewport: scrollWidth=${d.scrollWidth} `
      + `→ ${overflow <= 0 ? 'no horizontal scroll' : 'OVERFLOW of ' + overflow + 'px (widest: ' + d.widest + ')'}`);
  }
} finally {
  // Move the harness OUT of build/ (never delete) so it cannot ship.
  try {
    if (fs.existsSync(harnessInBuild)) {
      fs.renameSync(harnessInBuild, parked);
      console.log('harness parked at .workbuddy-ai/tmp/__preview_forms.html');
    }
  } catch (e) {
    console.log('could not park the harness:', e.code || e.message);
  }
}
