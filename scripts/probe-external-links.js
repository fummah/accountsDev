/**
 * probe-external-links.js
 *
 * Measures what Electron ACTUALLY does with external links in a renderer,
 * instead of assuming. Uses a hidden BrowserWindow (show:false) so it does not
 * disturb the desktop, clicks two links programmatically, and reports which
 * lifecycle events fired.
 *
 * Run as a PLAIN Electron process — NOT with ELECTRON_RUN_AS_NODE=1:
 *     ./node_modules/electron/dist/electron.exe scripts/probe-external-links.js
 *
 * Links exercised:
 *   A. <a href="mailto:...">            (no target)        -> in-page navigation
 *   B. <a href="https://..." target="_blank">              -> window.open path
 */

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

// This sandbox has no usable GPU process ("GPU process isn't usable. Goodbye."),
// so force software rendering before anything else touches the compositor.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('in-process-gpu');

const PAGE = `<!doctype html><html><body>
  <a id="mail" href="mailto:probe@example.invalid?subject=Probe">mail</a>
  <a id="web" href="https://example.invalid/probe" target="_blank">web</a>
</body></html>`;

const pagePath = path.join(os.tmpdir(), 'acculedger-link-probe.html');
fs.writeFileSync(pagePath, PAGE, 'utf8');

const events = [];

function record(name, detail) {
  events.push({ name, detail });
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 400,
    height: 300,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  const wc = win.webContents;

  wc.on('will-navigate', (e, url) => record('will-navigate', { url, prevented: e.defaultPrevented }));
  wc.on('did-start-navigation', (_e, url, isInPlace, isMainFrame) =>
    record('did-start-navigation', { url, isInPlace, isMainFrame }));
  wc.on('did-navigate', (_e, url) => record('did-navigate', { url }));
  wc.on('did-fail-load', (_e, code, desc, url) => record('did-fail-load', { code, desc, url }));

  // A new-window request arrives here. Electron's DEFAULT is action:'allow',
  // which is what would create a bare Electron window.
  wc.setWindowOpenHandler(({ url }) => {
    record('setWindowOpenHandler', { url, note: 'default would be action:allow' });
    return { action: 'deny' };
  });

  await win.loadFile(pagePath);
  record('loaded', { url: wc.getURL().slice(0, 60) });

  const before = wc.getURL();

  // --- A. click the mailto link -------------------------------------------------
  events.push({ name: '--- click mailto ---', detail: null });
  await wc.executeJavaScript(`document.getElementById('mail').click(); true`);
  await new Promise((r) => setTimeout(r, 1500));

  const afterMail = wc.getURL();
  record('after-mailto', {
    urlChanged: afterMail !== before,
    sameAsBefore: afterMail === before,
  });

  // --- B. click the target=_blank https link ------------------------------------
  events.push({ name: '--- click https target=_blank ---', detail: null });
  await wc.executeJavaScript(`document.getElementById('web').click(); true`);
  await new Promise((r) => setTimeout(r, 1500));

  record('after-https-blank', {
    urlChanged: wc.getURL() !== afterMail,
    windowCount: BrowserWindow.getAllWindows().length,
  });

  const verdict = {
    mailto_navigation_attempted: events.some(
      (e) => (e.name === 'will-navigate' || e.name === 'did-start-navigation') && /mailto:/i.test(JSON.stringify(e.detail))
    ),
    mailto_opened_window: events.some(
      (e) => e.name === 'setWindowOpenHandler' && /mailto:/i.test(JSON.stringify(e.detail))
    ),
    https_blank_hit_window_open_handler: events.some(
      (e) => e.name === 'setWindowOpenHandler' && /https:/i.test(JSON.stringify(e.detail))
    ),
    window_navigated_away_from_app: wc.getURL() !== before,
    windows_open: BrowserWindow.getAllWindows().length,
  };

  process.stdout.write('\n=== events ===\n' + JSON.stringify(events, null, 2) + '\n');
  process.stdout.write('\n=== verdict ===\n' + JSON.stringify(verdict, null, 2) + '\n');

  win.destroy();
  app.exit(0);
});
