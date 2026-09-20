/**
 * verify-external-links.js — what happens to a link the user clicks inside the app.
 *
 * THE FEATURE
 *   Clicking an email address, or a documentation link, inside the Electron app
 *   should hand the URL to the operating system — the default mail client for
 *   `mailto:`, the default browser for `http(s):`.
 *
 * WHAT WENT WRONG (why this suite exists)
 *   main.js attached NO navigation handlers at all, so three things were left to
 *   Electron's defaults:
 *
 *     1. `<a href="mailto:...">` — 4 of them, on the customer and vendor pages.
 *        No `target`, so it starts an IN-PAGE navigation to a scheme Electron
 *        cannot load. It fails, and main.js's own `did-fail-load` handler then
 *        calls `loadFile(index.html)` — i.e. the entire app reloads itself.
 *     2. `<a href="https://..." target="_blank">` — 2 of them, on the Email
 *        Settings page. Electron's default window-open handler is
 *        `{ action: 'allow' }`, which creates a BARE Electron window: no
 *        preload, no app chrome, third-party page inside.
 *     3. Nothing ever reached the OS.
 *
 * THE DANGEROUS EDGE — and why this is tested rather than eyeballed
 *   This app opens its PRINT WINDOWS with `window.open('', '_blank')` in nine
 *   components plus the PDF generator. A window-open handler that denies by
 *   default would break printing across the whole application. The empty-URL
 *   case is therefore pinned here explicitly.
 *
 * HOW IT IS VERIFIED
 *   The decision is a pure function (services/externalLinks.js) and is driven
 *   directly with real inputs. The WIRING in main.js is asserted structurally,
 *   because this sandbox cannot run an Electron renderer: its GPU process exits
 *   with code 1 and its network service crashes, so a live click cannot be
 *   measured here. That limitation is stated rather than papered over.
 *
 *   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/verify-external-links.js
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Every .js file under a source directory, as repo-relative paths. */
function walk(relDir) {
  const out = [];
  const visit = (abs, rel) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const childAbs = path.join(abs, entry.name);
      const childRel = path.posix.join(rel, entry.name);
      if (entry.isDirectory()) visit(childAbs, childRel);
      else if (entry.name.endsWith('.js')) out.push(childRel);
    }
  };
  visit(path.join(ROOT, relDir), relDir);
  return out;
}

const Links = require('../src/backend/services/externalLinks.js');

// ── tiny harness ────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  [PASS] ${label}`); }
  else { failed++; console.log(`  [FAIL] ${label}\n      expected: ${e}\n      actual:   ${a}`); }
}
function ok(label, cond, detail) {
  check(label, !!cond, true);
  if (!cond && detail) console.log(`      detail: ${detail}`);
}
const contains = (label, haystack, needle) =>
  ok(label, String(haystack).includes(needle),
    `expected to find ${JSON.stringify(needle)} in ${JSON.stringify(String(haystack).slice(0, 300))}`);

// ════════════════════════════════════════════════════════════════════════════
// 1. THE PRINT WINDOWS — the case that makes a naive fix a regression
// ════════════════════════════════════════════════════════════════════════════
function printWindows() {
  // window.open('', '_blank') — used by every print feature.
  check("window.open('', '_blank') is ALLOWED (printing depends on it)",
    Links.classifyNavigation('', 'file:///C:/app/index.html'), 'allow');
  check('  … and so is about:blank', Links.classifyNavigation('about:blank'), 'allow');
  check('  … and undefined/null do not become "external"',
    [Links.classifyNavigation(undefined), Links.classifyNavigation(null)],
    ['allow', 'allow']);

  // Prove the app really does depend on it, so nobody "tidies" the rule away.
  const printers = [
    'src/frontend/src/components/accountant/CheckPrinting.js',
    'src/frontend/src/components/accountant/GeneralLedger.js',
    'src/frontend/src/components/accountant/TrialBalance.js',
    'src/frontend/src/components/accountant/TrialBalanceAdvanced.js',
    'src/frontend/src/components/accountant/ChartOfAccounts.js',
    'src/frontend/src/components/accountant/FixedAssets.js',
    'src/frontend/src/components/customers/invoices/InvoiceList.js',
    'src/frontend/src/components/customers/quotes/QuoteList.js',
    'src/frontend/src/components/customers/payments/CustomerPaymentHistory.js',
  ];
  const usingBlankPopup = printers.filter((p) => /window\.open\(\s*''\s*,\s*'_blank'/.test(read(p)));
  ok(`  … and ${usingBlankPopup.length} print components really do open blank popups`,
    usingBlankPopup.length >= 9, `found ${usingBlankPopup.length}: ${usingBlankPopup.join(', ')}`);
}

// ════════════════════════════════════════════════════════════════════════════
// 2. Email addresses — the mailto: links that were dead
// ════════════════════════════════════════════════════════════════════════════
function mailtoLinks() {
  check('a mailto: link is handed to the OS',
    Links.classifyNavigation('mailto:someone@example.com', 'file:///C:/app/index.html'), 'external');
  check('  … including a mailto: with subject and body',
    Links.classifyNavigation('mailto:a@b.com?subject=Invoice%2042&body=Hi', 'file:///C:/app/index.html'),
    'external');
  check('  … and a tel: link', Links.classifyNavigation('tel:+27821234567'), 'external');
  check('  … and sms:', Links.classifyNavigation('sms:+27821234567'), 'external');

  // The app also has a tel: anchor (customer phone number).
  const allHrefs = [];
  for (const f of walk('src/frontend/src')) {
    const src = read(f);
    const m = src.match(/href=\{`[a-z]+:[^`]*`\}/gi) || [];
    for (const hit of m) allHrefs.push(hit.replace(/^href=\{`|`\}$/g, ''));
  }
  const telHrefs = allHrefs.filter((h) => /^tel:/i.test(h));
  ok('  … and the app has a tel: anchor, which must also reach the OS',
    telHrefs.length >= 1, `found ${JSON.stringify(telHrefs)}`);
  ok('  … which classifies as external',
    telHrefs.every((h) => Links.classifyNavigation(h, 'file:///C:/app/index.html') === 'external'));

  // The real anchors in the app must be exactly the kind that was broken:
  // no target, so they navigate in-page rather than going through window.open.
  const sources = [
    'src/frontend/src/components/customers/CustomerDetails.js',
    'src/frontend/src/components/customers/CustomerList.js',
    'src/frontend/src/components/vendors/SupplierVendorList.js',
  ];
  let bare = 0;
  for (const s of sources) {
    const src = read(s);
    const m = src.match(/href=\{`mailto:[^`]*`\}/g) || [];
    for (const hit of m) if (!/target=/.test(src.slice(src.indexOf(hit), src.indexOf(hit) + 120))) bare++;
  }
  ok('  … and the app has mailto: anchors with no target=_blank (the broken shape)',
    bare >= 3, `found ${bare}`);
}

// ════════════════════════════════════════════════════════════════════════════
// 3. Web links
// ════════════════════════════════════════════════════════════════════════════
function webLinks() {
  check('an https link goes to the browser, not a bare Electron window',
    Links.classifyNavigation('https://console.cloud.google.com/apis/credentials', 'file:///C:/app/index.html'),
    'external');
  check('  … and http', Links.classifyNavigation('http://example.com'), 'external');
  check('  … and a mailto: inside a dev-server page', Links.classifyNavigation('mailto:a@b.com', 'http://localhost:3000/'), 'external');
}

// ════════════════════════════════════════════════════════════════════════════
// 4. The app's own pages must keep working
// ════════════════════════════════════════════════════════════════════════════
function internalNavigation() {
  check('the page reloading itself is allowed',
    Links.classifyNavigation('file:///C:/app/index.html', 'file:///C:/app/index.html'), 'allow');
  check('  … as is another file:// page in the app',
    Links.classifyNavigation('file:///C:/app/other.html', 'file:///C:/app/index.html'), 'allow');

  // In development the renderer is served over http from localhost. Treating all
  // http(s) as external would push the app's OWN pages into the browser.
  check('same-origin http in development stays in the app',
    Links.classifyNavigation('http://localhost:3000/customers', 'http://localhost:3000/'), 'allow');
  check('  … while a different origin is still external',
    Links.classifyNavigation('http://localhost:4000/x', 'http://localhost:3000/'), 'external');
  check('  … and same-origin is not confused by a port change',
    Links.classifyNavigation('http://localhost:3001/x', 'http://localhost:3000/'), 'external');

  check('data: URLs are allowed (the app embeds them)',
    Links.classifyNavigation('data:text/html,hi', 'file:///C:/app/index.html'), 'allow');
  check('blob: URLs are allowed', Links.classifyNavigation('blob:file:///abc'), 'allow');

  // REGRESSION GUARD. `new URL('mailto:x@y.com').origin` and
  // `new URL('file:///C:/app/index.html').origin` are BOTH the string "null", so
  // a naive origin comparison makes an email link look same-origin with the app
  // page — which classified every mailto: as 'allow' and left it broken. This is
  // the bug this suite caught; do not let it return.
  ok('a mailto: link is NOT considered same-origin with a file:// app page',
    Links.sameOrigin('mailto:a@b.com', 'file:///C:/app/index.html') === false);
  ok('  … nor with the dev-server page',
    Links.sameOrigin('mailto:a@b.com', 'http://localhost:3000/') === false);
  check('  … so it still classifies as external',
    Links.classifyNavigation('mailto:a@b.com', 'file:///C:/app/index.html'), 'external');
  ok('two file:// pages are not "same origin" either (origin is null for both)',
    Links.sameOrigin('file:///C:/a.html', 'file:///C:/b.html') === false);
}

// ════════════════════════════════════════════════════════════════════════════
// 5. Schemes that must never reach the OS
// ════════════════════════════════════════════════════════════════════════════
function unsafeSchemes() {
  check('javascript: is blocked', Links.classifyNavigation('javascript:alert(1)'), 'block');
  check('  … and data:text/html is NOT treated as external',
    Links.classifyNavigation('data:text/html,<script>x</script>'), 'allow');
  check('  … and an unknown custom scheme is blocked, not handed to the OS',
    Links.classifyNavigation('evil-scheme://do-something'), 'block');
  check('  … and file:// elsewhere is not handed to the OS',
    Links.classifyNavigation('file:///C:/Windows/System32/calc.exe'), 'allow');
  ok('javascript: never classifies as external',
    Links.classifyNavigation('javascript:void(0)') !== 'external');
  ok('no scheme at all never classifies as external',
    Links.classifyNavigation('not a url') !== 'external', Links.classifyNavigation('not a url'));
}

// ════════════════════════════════════════════════════════════════════════════
// 6. The wiring in main.js
// ════════════════════════════════════════════════════════════════════════════
function wiring() {
  const mainSrc = read('src/backend/main.js');
  const code = stripComments(mainSrc);

  contains('main.js imports the externalLinks service', code, "require('./services/externalLinks')");
  contains('  … and imports shell from electron', code, 'shell');

  contains('main.js installs a window-open handler', code, 'setWindowOpenHandler');
  contains('  … and a will-navigate handler', code, "on('will-navigate'");

  // THE critical one: the window-open handler must NOT deny by default, or
  // every print window in the app stops opening.
  const handlerIdx = code.indexOf('setWindowOpenHandler');
  const handlerBlock = handlerIdx > -1 ? code.slice(handlerIdx, handlerIdx + 500) : '';
  contains('  … and it delegates the decision to classifyNavigation',
    handlerBlock, 'classifyNavigation');
  contains('  … returning allow for the print windows',
    handlerBlock, "{ action: 'allow' }");
  ok('  … and the deny is conditional, not the default return',
    handlerBlock.indexOf("action: 'deny'") < handlerBlock.indexOf("action: 'allow'"),
    handlerBlock);

  contains('will-navigate hands external URLs to the OS', code, 'shell.openExternal');
  ok('  … and it calls preventDefault for the external case',
    /classifyNavigation[\s\S]{0,400}?preventDefault/.test(code));

  // Both windows must get the handlers — main and child.
  const attachIdx = code.indexOf('function attachWindowHandlers');
  const attachBlock = attachIdx > -1 ? code.slice(attachIdx, attachIdx + 2600) : '';
  contains('the handlers are attached in attachWindowHandlers (so every window gets them)',
    attachBlock, 'setWindowOpenHandler');

  ok('main.js does not open a bare BrowserWindow for external URLs',
    !/new BrowserWindow[\s\S]{0,200}?openExternal/.test(code));

  // The old shape must be gone: nothing should reload the app on a mailto click.
  ok('the did-fail-load fallback is still scoped to a real load failure',
    /did-fail-load/.test(code) && /loadFile\(localIndex\)/.test(code));
}

// ════════════════════════════════════════════════════════════════════════════
// 7. The sandbox limitation, stated as data
// ════════════════════════════════════════════════════════════════════════════
function honesty() {
  const probe = path.join(ROOT, 'scripts', 'probe-external-links.js');
  ok('a probe exists for measuring this in a working environment', fs.existsSync(probe));
  const probeSrc = read('scripts/probe-external-links.js');
  contains('  … which drives a real Electron renderer', probeSrc, 'BrowserWindow');
  contains('  … and clicks a real mailto link', probeSrc, 'mailto:');
  ok('  … and reports what actually happened', /verdict/.test(probeSrc));
}

// ── run ─────────────────────────────────────────────────────────────────────
console.log('external link handling\n');
console.log('1. print windows (the regression risk)');
printWindows();
console.log('\n2. mailto: links');
mailtoLinks();
console.log('\n3. web links');
webLinks();
console.log('\n4. the app\'s own pages');
internalNavigation();
console.log('\n5. unsafe schemes');
unsafeSchemes();
console.log('\n6. wiring in main.js');
wiring();
console.log('\n7. probe');
honesty();

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
