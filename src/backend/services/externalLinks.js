'use strict';

/**
 * externalLinks.js — the single place that decides what happens to a URL the
 * renderer tries to open or navigate to.
 *
 * Why this exists: `src/backend/main.js` used to attach NO navigation handlers
 * at all. That left three behaviours to Electron's defaults:
 *
 *   1. `<a href="mailto:...">` (4 of them: customer and vendor email addresses)
 *      starts an in-page navigation to a scheme Electron cannot load, which
 *      fails — and the app's own `did-fail-load` handler then calls
 *      `loadFile(index.html)`, i.e. the whole app reloads itself.
 *   2. `<a href="https://..." target="_blank">` (2 of them, on the Email
 *      Settings page) goes through Electron's default window-open handler,
 *      whose default is `{ action: 'allow' }` — a BARE Electron window with no
 *      preload and no app chrome, showing a third-party page.
 *   3. Nothing ever reaches the OS.
 *
 * The decision is extracted here, as a pure function, because the fix has one
 * genuinely dangerous edge: this app opens its PRINT WINDOWS with
 * `window.open('', '_blank')` in at least nine components (CheckPrinting,
 * GeneralLedger, TrialBalance, TrialBalanceAdvanced, ChartOfAccounts,
 * FixedAssets, InvoiceList, QuoteList, CustomerPaymentHistory) plus
 * generateDocumentPDF. A window-open handler that denies by default would break
 * printing across the entire application. That case is pinned by tests.
 */

/** Schemes we are willing to hand to the operating system. */
const EXTERNAL_SCHEME = /^(https?|mailto|tel|sms):/i;

/** Schemes the app itself uses. Never handed to the OS. */
const INTERNAL_SCHEME = /^(file|about|data|blob|chrome-extension|devtools):/i;

/**
 * Fragment-only (`#x`), query-only (`?p=2`) and relative (`/x`, `./x`, `../x`)
 * targets are references INSIDE the app, so they must never be blocked — in
 * development `/customers` is a perfectly ordinary in-app route. They cannot be
 * parsed by `new URL()` without a base, which is exactly why they need naming
 * here: without this, every one of them fell through to 'block'.
 */
const IN_APP_REFERENCE = /^[#?]|^\.{0,2}\//;

/**
 * @param {string} targetUrl the URL Electron is about to open/navigate to
 * @param {string} [appUrl] the URL the window is currently showing
 * @returns {'allow'|'external'|'block'}
 *   allow    — let Electron do its default thing (in-app navigation, print windows)
 *   external — hand to the OS (browser, mail client, dialer)
 *   block    — refuse: a scheme we do not recognise, so it is not given to the OS
 */
function classifyNavigation(targetUrl, appUrl) {
  const target = String(targetUrl == null ? '' : targetUrl).trim();

  // `window.open('', '_blank')` arrives as '' (or 'about:blank'). Every print
  // feature depends on this being ALLOWED. Do not "tidy" this away.
  if (!target || target === 'about:blank') return 'allow';

  // Reloading the page we are already on is not a navigation away from the app.
  if (appUrl && target === appUrl) return 'allow';

  // Fragment / query / relative references stay inside the app. Checked BEFORE
  // the scheme tests because none of them parse as absolute URLs.
  if (IN_APP_REFERENCE.test(target)) return 'allow';

  // Same-origin http(s) is the app talking to itself — in development the
  // renderer is served from http://localhost:<port>, so treating all http(s) as
  // external would push the app's own pages into the browser.
  if (sameOrigin(target, appUrl)) return 'allow';

  if (EXTERNAL_SCHEME.test(target)) return 'external';
  if (INTERNAL_SCHEME.test(target)) return 'allow';

  // Everything else — javascript:, vbscript:, unknown custom schemes — is
  // refused rather than passed to the OS.
  return 'block';
}

/**
 * True when both URLs are http(s) and share an origin. Never throws.
 *
 * Only http(s) counts. Non-special schemes report origin `"null"`, and so does
 * `file:` — so a naive `new URL(a).origin === new URL(b).origin` makes
 * `mailto:x@y.com` look like the SAME origin as `file:///C:/app/index.html`,
 * which classified every email link as 'allow' and left it broken. That mistake
 * was caught by the suite, not by reading the code.
 */
function sameOrigin(a, b) {
  if (!b) return false;
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    if (!/^https?:$/i.test(ua.protocol) || !/^https?:$/i.test(ub.protocol)) return false;
    return ua.origin === ub.origin;
  } catch {
    return false;
  }
}

module.exports = { classifyNavigation, sameOrigin, EXTERNAL_SCHEME, INTERNAL_SCHEME };
