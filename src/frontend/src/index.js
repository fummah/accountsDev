import React from "react";
import ReactDOM from "react-dom";

import NextApp from './NextApp';
import * as serviceWorker from './registerServiceWorker';
import 'react-app-polyfill/ie11';
import 'react-app-polyfill/stable';

// Suppress benign ResizeObserver loop error (triggered by Ant Design / Recharts resize)
// Patch ResizeObserver at the source so the error never fires
if (typeof window !== 'undefined') {
  const OrigRO = window.ResizeObserver;
  if (OrigRO) {
    window.ResizeObserver = class PatchedResizeObserver extends OrigRO {
      constructor(callback) {
        super((entries, observer) => {
          // requestAnimationFrame prevents the "loop completed" error
          window.requestAnimationFrame(() => {
            try { callback(entries, observer); } catch (_) {}
          });
        });
      }
    };
  }
  // Belt-and-suspenders: also suppress in all event phases
  const roErr = /ResizeObserver loop/;
  const origErr = window.onerror;
  window.onerror = function (msg, ...args) {
    if (roErr.test(msg)) return true;
    if (origErr) return origErr.call(this, msg, ...args);
  };
  window.addEventListener('error', (e) => {
    if (roErr.test(e.message)) { e.stopImmediatePropagation(); e.stopPropagation(); e.preventDefault(); }
  }, true);
  window.addEventListener('error', (e) => {
    if (roErr.test(e.message)) { e.stopImmediatePropagation(); e.preventDefault(); }
  });
}

ReactDOM.render(<NextApp />, document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
