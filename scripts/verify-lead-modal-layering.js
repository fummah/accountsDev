#!/usr/bin/env node
/**
 * verify-lead-modal-layering.js
 *
 * Guards the CRM → Leads → New Lead fixes:
 *   1. The "Source" creation-mode control is a horizontal Radio.Group with both
 *      options (not a stacked control).
 *   2. The "Switch creation mode?" confirmation is raised ABOVE the New Lead
 *      dialog (Z.CONFIRM > Z.MODAL), so it can never hide behind it.
 *
 * Run: node scripts/verify-lead-modal-layering.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, 'src', 'frontend');
const LAYERS = path.join(FE, 'src', 'utils', 'layers.js');
const LEADS = path.join(FE, 'src', 'components', 'customers', 'Leads.js');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail ? '  — ' + detail : '')); }
};

console.log('\n=== z-index scale ===');
{
  const src = fs.readFileSync(LAYERS, 'utf8');
  const num = (k) => { const m = new RegExp(k + ':\\s*(\\d+)').exec(src); return m ? Number(m[1]) : null; };
  const modal = num('MODAL');
  const nested = num('NESTED_MODAL');
  const confirm = num('CONFIRM');
  check('layers.js defines MODAL/NESTED_MODAL/CONFIRM', modal && nested && confirm, `${modal}/${nested}/${confirm}`);
  check('CONFIRM sits above MODAL', confirm > modal, `${confirm} > ${modal}`);
  check('NESTED_MODAL sits above MODAL', nested > modal, `${nested} > ${modal}`);
  check('scale is not a giant arbitrary value', confirm <= 2000, String(confirm));
}

console.log('\n=== Leads.js ===');
{
  const src = fs.readFileSync(LEADS, 'utf8');
  // Source control: a horizontal Radio.Group with both modes.
  check('Source uses Radio.Group (not Segmented)', /<Radio\.Group/.test(src) && !/Segmented/.test(src));
  check('Source lays the options out in a wrapping flex row',
    /<Radio\.Group[\s\S]{0,220}flexWrap:\s*'wrap'/.test(src));
  check('Source has both Existing Customer and New / From Scratch radios',
    /<Radio value=\{MODE_EXISTING\}/.test(src) && /<Radio value=\{MODE_SCRATCH\}/.test(src));
  check('mode-switch logic unchanged (handleModeChange still the onChange)',
    /onChange=\{\(e\) => handleModeChange\(e\.target\.value\)\}/.test(src));
  check('confirmation keeps the required copy',
    /title: 'Switch creation mode\?'/.test(src) && /okText: 'Switch'/.test(src) && /cancelText: 'Keep editing'/.test(src));
  check('confirmation uses Z.CONFIRM', /Modal\.confirm\(\{[\s\S]{0,400}zIndex:\s*Z\.CONFIRM/.test(src));
  check('New Lead dialog uses Z.MODAL', /title=\{editingLead \? 'Edit Lead' : 'New Lead'\}[\s\S]{0,80}zIndex=\{Z\.MODAL\}/.test(src));
  check('no hard-coded 1050/1100 left in Leads.js', !/zIndex=\{1050\}|zIndex=\{1100\}/.test(src));
  check('file has no UTF-8 BOM', fs.readFileSync(LEADS)[0] !== 0xEF);
}

console.log('\n=== shared confirm (documentEditGuard) ===');
{
  const src = fs.readFileSync(path.join(FE, 'src', 'components', 'customers', 'shared', 'documentEditGuard.js'), 'utf8');
  check('shared confirmModal uses Z.CONFIRM', /zIndex:\s*Z\.CONFIRM/.test(src));
}

console.log('\n' + '='.repeat(56));
console.log(pass + ' passed, ' + fail + ' failed');
console.log('='.repeat(56) + '\n');
process.exit(fail ? 1 : 0);
