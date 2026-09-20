// Suppress the benign "ResizeObserver loop completed with undelivered
// notifications." error.
//
// Why this module MUST be imported before the app (see index.js):
// 1. antd's rc-resize-observer captures the native `window.ResizeObserver`
//    at MODULE-EVAL time (resize-observer-polyfill re-exports the native
//    implementation when available) and creates a module-level singleton.
//    So a patch placed in index.js' own body runs too late — the native
//    reference is already captured by the time antd finishes loading.
// 2. The CRA dev overlay (react-error-overlay, wired up by
//    webpackHotDevClient BEFORE this bundle runs) registers its window
//    `error` listener first. At the target node, listeners fire in
//    registration order, so no window-level suppression added here can beat
//    the overlay.
// Patching ResizeObserver here prevents the loop error from ever being
// generated, so neither the overlay nor the console sees it.
if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
  const OrigRO = window.ResizeObserver;
  // Guard against re-entry on HMR/fast-refresh so we never double-wrap.
  if (OrigRO && OrigRO.__roLoopGuard__ !== true) {
    window.ResizeObserver = class PatchedResizeObserver extends OrigRO {
      constructor(callback) {
        super((entries, observer) => {
          // Defer to the next frame so callback-driven layout changes are
          // observed in a LATER cycle instead of the current one — this is
          // what breaks Chrome's infinite-loop detection.
          window.requestAnimationFrame(() => {
            try {
              callback(entries, observer);
            } catch (_) {
              /* observer errors are non-fatal */
            }
          });
        });
      }
    };
    Object.defineProperty(window.ResizeObserver, '__roLoopGuard__', {
      value: true,
      enumerable: false,
    });
  }
}

// Belt-and-suspenders: swallow any ResizeObserver loop error that still
// reaches window, so it never spams the console.
const roErr = /ResizeObserver loop/;
const isROLoop = (v) => v && roErr.test(String(v));
const origOnError = window.onerror;
window.onerror = function (msg, ...rest) {
  if (isROLoop(msg)) return true;
  return origOnError ? origOnError.call(this, msg, ...rest) : false;
};
window.addEventListener('error', (e) => {
  if (isROLoop(e.message) || isROLoop(e.error && e.error.message)) {
    e.stopImmediatePropagation();
    e.stopPropagation();
    e.preventDefault();
  }
}, true);
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason && isROLoop(e.reason && e.reason.message)) {
    e.preventDefault();
  }
});
