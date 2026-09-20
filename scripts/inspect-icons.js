/* Inspect ICO frames + PNG dimensions (plain node, no deps). */
const fs = require('fs');
const path = require('path');

function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function icoFrames(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 6) return { error: 'too small' };
  const reserved = buf.readUInt16LE(0), type = buf.readUInt16LE(2), count = buf.readUInt16LE(4);
  const frames = [];
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 16;
    if (o + 16 > buf.length) break;
    const w = buf[o] === 0 ? 256 : buf[o];
    const h = buf[o + 1] === 0 ? 256 : buf[o + 1];
    const bpp = buf.readUInt16LE(o + 6);
    const bytes = buf.readUInt32LE(o + 8);
    const off = buf.readUInt32LE(o + 12);
    const isPng = off + 8 <= buf.length && buf.readUInt32BE(off) === 0x89504e47;
    frames.push({ w, h, bpp, bytes, isPng });
  }
  return { reserved, type, count, size: buf.length, frames };
}

const files = process.argv.slice(2);
for (const f of files) {
  if (!fs.existsSync(f)) { console.log(`${f}: MISSING`); continue; }
  const buf = fs.readFileSync(f);
  if (f.toLowerCase().endsWith('.ico')) {
    const r = icoFrames(f);
    console.log(`\n${f}  (${r.size} bytes) type=${r.type} frames=${r.count}`);
    for (const fr of r.frames) console.log(`   ${fr.w}x${fr.h}  bpp=${fr.bpp}  ${fr.isPng ? 'PNG' : 'BMP'}  ${fr.bytes}B`);
  } else {
    const s = pngSize(buf);
    console.log(`\n${f}  ${s ? `${s.w}x${s.h}` : 'not a PNG'}  (${buf.length} bytes)`);
  }
}
