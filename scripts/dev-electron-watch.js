/**
 * dev-electron-watch.js — dev launcher that RESTARTS Electron when the main
 * process or the preload changes.
 *
 * WHY: Electron loads `preload.js` ONCE per process at window creation. The CRA
 * dev server hot-reloads the RENDERER only — it never reloads the preload. So
 * after editing `src/backend/preload.js` (e.g. adding an API method) the running
 * app keeps the OLD bridge until the Electron process is restarted, which is
 * exactly the "getInventoryDashboard is not exposed by the preload bridge" bug.
 *
 * This launcher removes that manual step: it spawns `electron .` and, whenever a
 * file under `src/backend/` changes, kills and respawns the whole Electron
 * process so the renderer AND the preload are always in sync.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WATCH_DIR = path.join(ROOT, 'src', 'backend');

let electronPath;
try { electronPath = require('electron'); } catch { electronPath = null; }
if (typeof electronPath !== 'string') {
  // Fall back to the local binary.
  electronPath = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
}

let child = null;
let restarting = false;

const killChild = () => new Promise((resolve) => {
  if (!child || child.killed) { resolve(); return; }
  const pid = child.pid;
  const done = () => { child = null; resolve(); };
  try {
    if (process.platform === 'win32') {
      const tk = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
      tk.on('exit', done);
      tk.on('error', done);
    } else {
      child.on('exit', done);
      child.kill('SIGTERM');
    }
  } catch { done(); }
});

const start = () => {
  child = spawn(electronPath, ['.'], { cwd: ROOT, stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    if (!restarting) {
      // User closed the app normally — stop the watcher too.
      process.exit(code == null ? 0 : code);
    }
  });
};

const restart = async () => {
  if (restarting) return;
  restarting = true;
  console.log('\n[dev-electron-watch] backend changed — restarting Electron to reload main + preload...');
  await killChild();
  restarting = false;
/**
 * Kill any OTHER Electron instance belonging to THIS project before starting.
 * A leftover process holds the OLD preload (Electron loads preload once per
 * process), which is exactly why the renderer can be current while the bridge
 * is stale. Scoped to electron.exe whose command line points at this repo.
 */
const killLeftovers = () => new Promise((resolve) => {
  if (process.platform !== 'win32') { resolve(); return; }
  try {
    const pattern = `*${ROOT}*`;
    const script = `Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.CommandLine -like '${pattern}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    const ps = spawn('powershell', ['-NoProfile', '-Command', script], { stdio: 'ignore' });
    ps.on('exit', resolve);
    ps.on('error', resolve);
  } catch { resolve(); }
});

killLeftovers().finally(start);
};

start();

let timer = null;
try {
  fs.watch(WATCH_DIR, { recursive: true }, (_event, filename) => {
    if (!filename || !/\.js$/.test(String(filename))) return;
    clearTimeout(timer);
    timer = setTimeout(restart, 250);
  });
} catch (e) {
  console.warn('[dev-electron-watch] watch failed:', e.message);
}

process.on('SIGINT', async () => { restarting = true; await killChild(); process.exit(0); });
