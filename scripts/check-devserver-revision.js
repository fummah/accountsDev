/* Robust: what revision is the dev server serving for CheckPrinting?
   Uses the jsx-dev-runtime `lineNumber:` metadata, which records ORIGINAL source lines. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DISK = path.join(ROOT, 'src', 'frontend', 'src', 'components', 'accountant', 'CheckPrinting.js');
const BUNDLE_TMP = path.join(ROOT, '.workbuddy-ai', 'tmp', 'devbundle.js');

function fetch(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

// find the line number of the Nth JSX occurrence of a literal string in a module
function jsxLines(mod, literal) {
  const out = [];
  let from = 0;
  for (;;) {
    const i = mod.indexOf(literal, from);
    if (i < 0) break;
    const seg = mod.slice(Math.max(0, i - 800), i);
    const m = [...seg.matchAll(/lineNumber:\s*(\d+)/g)];
    out.push(m.length ? Number(m[m.length - 1][1]) : null);
    from = i + literal.length;
  }
  return out;
}

function diskLines(literal) {
  return fs.readFileSync(DISK, 'utf8').split(/\r?\n/)
    .map((l, i) => (l.includes(literal) ? i + 1 : null)).filter(Boolean);
}

(async () => {
  const bundle = await fetch('http://localhost:3000/static/js/bundle.js');
  fs.writeFileSync(BUNDLE_TMP, bundle);
  console.log('bundle bytes =', bundle.length);

  const marker = '/***/ "./src/components/accountant/CheckPrinting.js":';
  const i = bundle.indexOf(marker);
  if (i < 0) { console.log('!! CheckPrinting module NOT in bundle'); return; }
  const next = bundle.indexOf('/***/ "./src/', i + marker.length);
  const mod = bundle.slice(i, next > 0 ? next : i + 300000);
  console.log('module chars =', mod.length);

  for (const lit of ['"Check Details"', '"Attachments"', '"Split Lines (Expense Accounts)"']) {
    console.log('\n' + lit);
    console.log('  disk  lines = ' + JSON.stringify(diskLines(lit)));
    console.log('  served lines = ' + JSON.stringify(jsxLines(mod, lit)));
  }

  console.log('\nkit binding resolution in the SERVED module:');
  for (const id of ['FormSection', 'FormGrid', 'FormCol', 'DocumentActionBar', 'FORM_ITEM_STYLE']) {
    const wired = mod.includes('_shared_FormSection__WEBPACK_IMPORTED_MODULE_41__.' + id);
    const bare = new RegExp('(?<![\\.\\w])' + id + '(?=[\\s,;)>])').test(mod);
    console.log('  ' + id.padEnd(20) + ' wired=' + (wired ? 'Y' : 'N') + '  bareGlobal=' + (bare ? 'Y' : 'N'));
  }
})();
