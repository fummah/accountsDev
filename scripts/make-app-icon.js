/**
 * Generate the AccuLedger Windows app icon from the repository master artwork.
 *
 *   & node_modules\electron\dist\electron.exe scripts\make-app-icon.js
 *   & node_modules\electron\dist\electron.exe scripts\make-app-icon.js "C:\path\to\other.jpg"
 *
 * Source (default): <repo>\acculedger-icon.jpg — the checked-in master artwork.
 * It can be overridden with an argv path or ACCULEDGER_ICON_SRC, but it is NEVER
 * a machine-specific absolute path baked into the repo.
 *
 * It (1) crops the artwork's empty outer margin, (2) centres it on a square
 * canvas so the mark fills ~88% of the frame, (3) writes a 1024x1024 PNG
 * master, and (4) writes a real multi-resolution .ico (PNG-compressed entries)
 * with 16/24/32/48/64/128/256 frames — never a single 32x32.
 *
 * Runs in the Electron MAIN process (nativeImage is not available under
 * ELECTRON_RUN_AS_NODE).
 */
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// Repo-relative master artwork; override via argv[2] or ACCULEDGER_ICON_SRC.
const SRC = path.resolve(
  process.argv[2] || process.env.ACCULEDGER_ICON_SRC || path.join(ROOT, 'acculedger-icon.jpg')
);
const ASSETS = path.join(ROOT, 'assets');
const OUT_PNG = path.join(ASSETS, 'icon.png');
const OUT_ICO = path.join(ASSETS, 'icon.ico');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

// Threshold: a pixel counts as artwork when it is not near-white and not
// transparent (JPG has no alpha, so the background is near-white).
const WHITE = 245;

function contentBounds({ width, height, buf }) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const b = buf[o], g = buf[o + 1], r = buf[o + 2], a = buf[o + 3];
      const isWhite = r >= WHITE && g >= WHITE && b >= WHITE;
      const isTransparent = a < 16;
      if (!isWhite && !isTransparent) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: width, h: height };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function squareWithMargin(src, bbox, marginFactor) {
  const { w: cw, h: ch } = bbox;
  const content = Math.max(cw, ch);
  const canvas = Math.max(1, Math.round(content * marginFactor));
  const out = Buffer.alloc(canvas * canvas * 4); // transparent padding
  const offX = Math.round((canvas - cw) / 2);
  const offY = Math.round((canvas - ch) / 2);
  for (let y = 0; y < ch; y++) {
    const sy = bbox.y + y;
    for (let x = 0; x < cw; x++) {
      const sx = bbox.x + x;
      const so = (sy * src.width + sx) * 4;
      const dof = ((offY + y) * canvas + (offX + x)) * 4;
      out[dof] = src.buf[so];
      out[dof + 1] = src.buf[so + 1];
      out[dof + 2] = src.buf[so + 2];
      out[dof + 3] = src.buf[so + 3];
    }
  }
  return { width: canvas, height: canvas, buf: out };
}

// Multi-resolution ICO using PNG-compressed entries (Windows Vista+ supports
// PNG frames at every size).
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(entries.length * 16);
  let offset = 6 + entries.length * 16;
  entries.forEach((e, i) => {
    const o = i * 16;
    dir[o] = e.size === 256 ? 0 : e.size;      // width (0 => 256)
    dir[o + 1] = e.size === 256 ? 0 : e.size;  // height
    dir[o + 2] = 0;                            // palette count
    dir[o + 3] = 0;                            // reserved
    dir.writeUInt16LE(1, o + 4);               // planes
    dir.writeUInt16LE(32, o + 6);              // bits per pixel (RGBA)
    dir.writeUInt32LE(e.png.length, o + 8);    // bytes in resource
    dir.writeUInt32LE(offset, o + 12);         // offset
    offset += e.png.length;
  });

  return Buffer.concat([header, dir, ...entries.map(e => e.png)]);
}

app.whenReady().then(() => {
  try {
    const img = nativeImage.createFromPath(SRC);
    if (img.isEmpty()) throw new Error(`Could not load source image: ${SRC}`);

    const size = img.getSize();
    const src = { width: size.width, height: size.height, buf: img.getBitmap() };
    console.log(`source: ${src.width}x${src.height}`);

    const bbox = contentBounds(src);
    console.log(`content bounds: ${bbox.w}x${bbox.h} at (${bbox.x},${bbox.y})`);

    // ~88% fill: canvas = content / 0.88  →  marginFactor 1.136
    const sq = squareWithMargin(src, bbox, 1.136);
    console.log(`square canvas: ${sq.width}x${sq.height}`);

    const squareImg = nativeImage.createFromBitmap(sq.buf, { width: sq.width, height: sq.height });
    const master1024 = squareImg.resize({ width: 1024, height: 1024, quality: 'best' });
    const png1024 = master1024.toPNG();

    fs.mkdirSync(ASSETS, { recursive: true });
    fs.writeFileSync(OUT_PNG, png1024);
    console.log(`wrote ${OUT_PNG} (${png1024.length} bytes)`);

    const master = nativeImage.createFromBuffer(png1024);
    const entries = SIZES.map(s => ({ size: s, png: master.resize({ width: s, height: s, quality: 'best' }).toPNG() }));
    const ico = buildIco(entries);
    fs.writeFileSync(OUT_ICO, ico);
    console.log(`wrote ${OUT_ICO} (${ico.length} bytes) frames=${SIZES.join(',')}`);

    app.exit(0);
  } catch (e) {
    console.error('icon generation failed:', e.message);
    app.exit(1);
  }
});
