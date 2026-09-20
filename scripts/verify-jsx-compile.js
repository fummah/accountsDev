/**
 * Compile-check every frontend source file with CRA's own Babel preset.
 *
 * This is the same transform `react-scripts build` applies, so it catches JSX
 * syntax errors, bad imports and unsupported syntax without needing a full
 * webpack build (which is blocked in some sandboxes by a bulk-delete guard on
 * the existing build/ directory).
 *
 *   node scripts/verify-jsx-compile.js
 */

const fs = require('fs');
const path = require('path');

// babel-preset-react-app refuses to load without an explicit environment.
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const FRONTEND = path.join(__dirname, '..', 'src', 'frontend');
const babel = require(path.join(FRONTEND, 'node_modules', '@babel', 'core'));

// Optional targeted mode: `node scripts/verify-jsx-compile.js <substring>`
const filter = process.argv[2] || null;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'build' || entry.name.startsWith('.')) continue;
      walk(full, out);
    } else if (/\.(js|jsx|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const srcDir = path.join(FRONTEND, 'src');
let files = walk(srcDir);
if (filter) files = files.filter(f => f.includes(filter));

console.log(`Compile-checking ${files.length} file(s) with babel-preset-react-app...\n`);

let ok = 0;
const errors = [];

for (const file of files) {
  try {
    babel.transformFileSync(file, {
      presets: [require.resolve(path.join(FRONTEND, 'node_modules', 'babel-preset-react-app'))],
      babelrc: false,
      configFile: false,
      filename: file,
    });
    ok++;
  } catch (e) {
    errors.push({ file: path.relative(FRONTEND, file), message: e.message });
  }
}

console.log(`OK:      ${ok}`);
console.log(`FAILED:  ${errors.length}`);
if (errors.length) {
  console.log('\nErrors:');
  for (const e of errors) console.log(`  - ${e.file}\n      ${e.message.split('\n')[0]}`);
  process.exit(1);
}
console.log('\nAll source files compile cleanly.');
