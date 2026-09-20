import 'react-app-polyfill/ie11';
import 'react-app-polyfill/stable';
// Must be evaluated BEFORE the app (NextApp) so the ResizeObserver patch is
// in place before antd's rc-resize-observer captures the native global.
import './errorSuppression';

import React from 'react';
import ReactDOM from 'react-dom';

import NextApp from './NextApp';
import * as serviceWorker from './registerServiceWorker';

ReactDOM.render(<NextApp />, document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
