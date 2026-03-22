import React from "react";
import ReactDOM from "react-dom";

import NextApp from './NextApp';
import * as serviceWorker from './registerServiceWorker';
import 'react-app-polyfill/ie11';
import 'react-app-polyfill/stable';

// Suppress benign ResizeObserver loop error (triggered by Ant Design / Recharts resize)
const resizeObserverErr = /ResizeObserver loop/;
const origError = window.onerror;
window.onerror = function (message, ...args) {
  if (resizeObserverErr.test(message)) return true;
  if (origError) return origError.call(this, message, ...args);
};
window.addEventListener('error', (e) => {
  if (resizeObserverErr.test(e.message)) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

ReactDOM.render(<NextApp />, document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
