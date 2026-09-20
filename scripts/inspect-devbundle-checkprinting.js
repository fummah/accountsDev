/* Extract the ENTIRE CheckPrinting module from the served dev bundle. */
const fs = require('fs');
const p = 'C:/wamp64/www/accountsDev/.workbuddy-ai/tmp/devbundle.js';
const src = fs.readFileSync(p, 'utf8');

const marker = '/***/ "./src/components/accountant/CheckPrinting.js":';
const i = src.indexOf(marker);
if (i < 0) { console.log('MODULE NOT FOUND'); process.exit(1); }

// module ends at the next module marker
const next = src.indexOf('/***/ "./src/', i + marker.length);
const mod = src.slice(i, next > 0 ? next : i + 200000);
console.log('module length =', mod.length, 'chars');

console.log('\n=== does the module import the shared form kit? ===');
console.log('contains "shared/FormSection"   :', mod.includes('shared/FormSection'));
console.log('contains "FormSection"          :', mod.includes('FormSection'));
console.log('contains "FORM_ITEM_STYLE"      :', mod.includes('FORM_ITEM_STYLE'));
console.log('contains "DocumentActionBar"    :', mod.includes('DocumentActionBar'));
console.log('contains "FormGrid"             :', mod.includes('FormGrid'));

console.log('\n=== import statements (all) ===');
const imports = mod.match(/\/\* harmony import \*\/ var [^\n]{0,220}/g) || [];
imports.forEach(s => {
  const m = s.match(/require\(\/\*!\s*([^*]+?)\s*\*\/\s*"([^"]+)"\)/);
  console.log('  ' + (m ? m[2] : s.slice(0, 120)));
});

console.log('\n=== how the kit identifiers are referenced ===');
for (const id of ['FormSection', 'FormGrid', 'FormCol', 'DocumentActionBar', 'FORM_ITEM_STYLE', 'UnorderedListOutlined']) {
  const re = new RegExp('[A-Za-z_0-9.$]{0,55}' + id, 'g');
  const hits = mod.match(re) || [];
  const uniq = [...new Set(hits)];
  console.log('-- ' + id + ' : ' + hits.length + ' refs, ' + uniq.length + ' distinct');
  uniq.slice(0, 6).forEach(h => console.log('     ' + h));
}

console.log('\n=== first 900 chars around "Check Details" JSX ===');
const cd = mod.indexOf('Check Details');
console.log(cd >= 0 ? mod.slice(Math.max(0, cd - 700), cd + 200) : '(not found)');
