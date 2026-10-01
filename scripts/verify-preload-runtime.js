/**
 * verify-preload-runtime.js — launches REAL Electron (not Node) with the app's
 * preload and asserts the bridge the renderer needs is actually exposed.
 *
 * This is the only test that proves `contextBridge` executes in the real
 * sandboxed renderer. Run with plain `node` (it spawns Electron itself), e.g.
 *   node scripts/verify-preload-runtime.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const PRELOAD = path.join(ROOT, 'src', 'backend', 'preload.js');

let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  -> ${d}` : ''}`); } };

const smokeMain = `
const path = require('path');
const { app, BrowserWindow } = require('electron');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 400, height: 300, webPreferences: { preload: ${JSON.stringify(PRELOAD)}, contextIsolation: true, sandbox: true } });
  win.webContents.on('preload-error', (_e, p, err) => console.log('PRELOAD-ERROR:' + (err && err.message)));
  try {
    await win.loadURL('data:text/html,<h1>bridge</h1>');
    const info = await win.webContents.executeJavaScript('(() => { const api = window.electronAPI || null; return { t: typeof window.electronAPI, n: api ? Object.keys(api).length : 0, dash: api ? typeof api.getInventoryDashboard : "NO_API", info: api && api.getBridgeInfo ? api.getBridgeInfo() : null }; })()');
    console.log('BRIDGE-SMOKE:' + JSON.stringify(info));
  } catch (e) { console.log('SMOKE-FATAL:' + (e && e.message)); }
  app.quit();
});
setTimeout(() => { console.log('SMOKE-TIMEOUT'); app.exit(0); }, 30000);
`;

const tmpMain = path.join(os.tmpdir(), `acculedger-bridge-smoke-${Date.now()}.js`);
fs.writeFileSync(tmpMain, smokeMain);

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE; // must run as a real Electron app

const child = spawn(ELECTRON, [tmpMain], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
child.stdout.on('data', (d) => { out += d.toString(); });
child.stderr.on('data', (d) => { out += d.toString(); });

const timer = setTimeout(() => { try { child.kill(); } catch {} }, 45000);

child.on('exit', () => {
  clearTimeout(timer);
  try { fs.unlinkSync(tmpMain); } catch {}
  const m = out.match(/BRIDGE-SMOKE:(\{.*\})/);
  console.log('\n=== real Electron preload bridge ===');
  if (!m) {
    const err = out.match(/PRELOAD-ERROR:.*/);
    const fatal = out.match(/SMOKE-FATAL:.*/);
    check('real Electron loads the preload and exposes window.electronAPI', false, (err || fatal || ['no BRIDGE-SMOKE output']).join(' '));
  } else {
    const info = JSON.parse(m[1]);
    check('window.electronAPI is an object', info.t === 'object', info.t);
    check('the bridge exposes many methods (>500)', info.n > 500, String(info.n));
    check('window.electronAPI.getInventoryDashboard is a function', info.dash === 'function', info.dash);
    check('getBridgeInfo() confirms the inventory methods', !!(info.info && info.info.hasInventoryDashboard === true && info.info.hasReorderNeeded === true), JSON.stringify(info.info));
  }
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
