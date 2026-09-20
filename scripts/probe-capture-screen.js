/**
 * probe-capture-screen.js — screenshot the desktop so a human (or a
 * multimodal reader) can SEE what a launched mail client actually put on
 * screen.
 *
 * Why this exists: a command-line handoff to another program can only be
 * verified from inside that program's window. UI automation is unavailable in
 * this environment, so the cheapest honest alternative is to photograph the
 * screen and look at it.
 *
 * Run with plain Electron (NOT ELECTRON_RUN_AS_NODE, which has no GUI):
 *   ./node_modules/electron/dist/electron.exe scripts/probe-capture-screen.js --out=C:\...\shot.png
 */

const fs = require('fs');
const path = require('path');
const { app, desktopCapturer, screen } = require('electron');

const outArg = process.argv.find((a) => a.startsWith('--out='));
const out = outArg ? outArg.slice('--out='.length) : path.join(process.env.TEMP || '.', 'screen.png');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  try {
    const display = screen.getPrimaryDisplay();
    const { width, height } = display.size;
    const scale = display.scaleFactor || 1;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(width * scale), height: Math.round(height * scale) },
      fetchWindowIcons: false,
    });

    if (!sources.length) {
      console.log(JSON.stringify({ ok: false, error: 'no screen sources returned' }));
      app.exit(1);
      return;
    }

    const written = [];
    for (const source of sources) {
      const target = sources.length === 1
        ? out
        : out.replace(/\.png$/i, `-${source.id.replace(/[^a-z0-9]/gi, '_')}.png`);
      fs.writeFileSync(target, source.thumbnail.toPNG());
      written.push({
        id: source.id,
        name: source.name,
        bytes: fs.statSync(target).size,
        file: target,
      });
    }
    console.log(JSON.stringify({ ok: true, display: { width, height, scale }, sources: written }, null, 2));
    app.exit(0);
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: e.message }));
    app.exit(1);
  }
});
