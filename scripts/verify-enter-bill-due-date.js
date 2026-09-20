/**
 * verify-enter-bill-due-date.js
 *
 * Exercises the REAL shipped source of the Enter-Bill Due Date logic.
 *
 * The pure helpers (calculateDueDate / normalizeTerms) and the in-component
 * handlers (applyDueDate / handleBillDateChange / handleTermsChange /
 * applyVendorDefaultTerms) are sliced straight out of EnterBill.js and
 * evaluated in a sandbox with a fake antd form, so these tests fail if the
 * shipped code changes — they are not a re-implementation.
 *
 * Wiring that cannot be unit-tested without rendering React (which handler is
 * attached to which control, and the edit-mode guard) is asserted against the
 * source text.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'src', 'frontend', 'src', 'components', 'vendors', 'bills', 'EnterBill.js');
const src = fs.readFileSync(FILE, 'utf8');

const moment = require(path.join(ROOT, 'src', 'frontend', 'node_modules', 'moment'));

let pass = 0, fail = 0;
const results = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; results.push(`  PASS  ${name}`); }
  else { fail++; results.push(`  FAIL  ${name}${detail ? `  → ${detail}` : ''}`); }
};

// ── Slice the real source ────────────────────────────────────────────────
const sliceBetween = (startAnchor, endAnchor, label) => {
  const i = src.indexOf(startAnchor);
  const j = src.indexOf(endAnchor, i + 1);
  if (i === -1 || j === -1) throw new Error(`Could not slice ${label} (anchors not found)`);
  return src.slice(i, j);
};

const moduleHelpers = sliceBetween(
  'const calculateDueDate = (billDate, terms) => {',
  'const EnterBill = (',
  'module-level due-date helpers'
);
const componentHelpers = sliceBetween(
  'const applyDueDate = (billDate, terms) => {',
  '// Clear the form and re-apply',
  'in-component due-date helpers'
);

const TERMS_OPTIONS = [
  { value: 0, label: 'Due on receipt' },
  { value: 15, label: 'Net 15' },
  { value: 30, label: 'Net 30' },
  { value: 45, label: 'Net 45' },
  { value: 60, label: 'Net 60' },
  { value: 90, label: 'Net 90' },
];

const makeForm = (init = {}) => {
  const values = { ...init };
  const form = {
    values,
    writes: 0,
    getFieldValue: (k) => values[k],
    setFieldsValue: (obj) => { form.writes++; Object.assign(values, obj); },
  };
  return form;
};

// Build the sandbox once; each test gets a fresh form via the factory.
const build = (form) => new Function(
  'moment', 'form', 'TERMS_OPTIONS',
  `${moduleHelpers}\n${componentHelpers}\n
   return { calculateDueDate, normalizeTerms, applyDueDate, termsOrDefault,
            handleBillDateChange, handleTermsChange, applyVendorDefaultTerms };`
)(moment, form, TERMS_OPTIONS);

const fmt = (m) => (m ? moment(m).format('YYYY-MM-DD') : null);

// ── A. calculateDueDate ─────────────────────────────────────────────────
{
  const api = build(makeForm());
  const { calculateDueDate } = api;
  check('Due Date = Bill Date + Net 30', fmt(calculateDueDate(moment('2026-09-11'), 30)) === '2026-10-11',
    fmt(calculateDueDate(moment('2026-09-11'), 30)));
  check('Due Date = Bill Date + Due on receipt (0 days)', fmt(calculateDueDate(moment('2026-09-11'), 0)) === '2026-09-11',
    fmt(calculateDueDate(moment('2026-09-11'), 0)));
  check('Due Date = Bill Date + Net 45', fmt(calculateDueDate(moment('2026-09-11'), 45)) === '2026-10-26',
    fmt(calculateDueDate(moment('2026-09-11'), 45)));
  check('Due Date = Bill Date + Net 90', fmt(calculateDueDate(moment('2026-09-11'), 90)) === '2026-12-10',
    fmt(calculateDueDate(moment('2026-09-11'), 90)));
  check('month rollover is handled by the calendar (Jan 31 + 30d)', fmt(calculateDueDate(moment('2026-01-31'), 30)) === '2026-03-02',
    fmt(calculateDueDate(moment('2026-01-31'), 30)));
  check('missing Bill Date yields no Due Date', calculateDueDate(null, 30) === null);
  check('invalid Bill Date yields no Due Date', calculateDueDate(moment.invalid(), 30) === null);
  check('missing Terms falls back to Net 30', fmt(calculateDueDate(moment('2026-09-11'), undefined)) === '2026-10-11',
    fmt(calculateDueDate(moment('2026-09-11'), undefined)));
  const base = moment('2026-09-11');
  calculateDueDate(base, 30);
  check('calculation does not mutate the passed-in Bill Date', base.format('YYYY-MM-DD') === '2026-09-11',
    base.format('YYYY-MM-DD'));
}

// ── B. normalizeTerms ───────────────────────────────────────────────────
{
  const { normalizeTerms } = build(makeForm());
  const cases = [
    [30, 30], ['30', 30], ['Net 30', 30], ['Net 15', 15], ['Net 45', 45], ['Net 60', 60], ['Net 90', 90],
    ['Due on receipt', 0], ['30 days', 30], ['2/10 Net 30', 30],
    ['', null], [null, null], [undefined, null], ['fdgdg', null], ['   ', null],
  ];
  for (const [input, expected] of cases) {
    const got = normalizeTerms(input);
    check(`normalizeTerms(${JSON.stringify(input)}) === ${JSON.stringify(expected)}`, got === expected, `got ${JSON.stringify(got)}`);
  }
  // Every value the live suppliers table actually contains must map correctly.
  check('every real suppliers.supplier_terms value normalises sensibly',
    normalizeTerms('Net 60') === 60 && normalizeTerms('Net 15') === 15 &&
    normalizeTerms('Net 45') === 45 && normalizeTerms('Net 30') === 30 &&
    normalizeTerms('Due on receipt') === 0 && normalizeTerms('') === null && normalizeTerms('fdgdg') === null);
}

// ── C. applyDueDate — writes only when the value actually differs ────────
{
  const form = makeForm({ billDate: moment('2026-09-11'), terms: 30, dueDate: undefined });
  const { applyDueDate } = build(form);
  applyDueDate(form.getFieldValue('billDate'), 30);
  check('applyDueDate populates a blank Due Date on first call', fmt(form.getFieldValue('dueDate')) === '2026-10-11',
    fmt(form.getFieldValue('dueDate')));
  const writesAfterFirst = form.writes;
  applyDueDate(form.getFieldValue('billDate'), 30);
  check('applyDueDate does NOT write again when the Due Date is already correct (no effect loop)',
    form.writes === writesAfterFirst, `writes went ${writesAfterFirst} → ${form.writes}`);
  // Same day, different time-of-day object → still considered equal.
  form.values.dueDate = moment('2026-10-11T23:59:00');
  const before = form.writes;
  applyDueDate(form.getFieldValue('billDate'), 30);
  check('applyDueDate compares by calendar day, not timestamp', form.writes === before);
  // A real change must write.
  applyDueDate(form.getFieldValue('billDate'), 60);
  check('applyDueDate writes when the computed Due Date actually changes', fmt(form.getFieldValue('dueDate')) === '2026-11-10',
    fmt(form.getFieldValue('dueDate')));
  // No bill date → no write.
  const f2 = makeForm({ billDate: null, terms: 30, dueDate: undefined });
  const api2 = build(f2);
  api2.applyDueDate(null, 30);
  check('applyDueDate never writes a Due Date when there is no Bill Date', f2.getFieldValue('dueDate') === undefined);
}

// ── D. Bill Date change recalculates ────────────────────────────────────
{
  const form = makeForm({ billDate: moment('2026-09-11'), terms: 30, dueDate: moment('2026-10-11') });
  const { handleBillDateChange } = build(form);
  handleBillDateChange(moment('2026-09-20'));
  check('changing Bill Date recalculates Due Date (Bill Date + Terms)',
    fmt(form.getFieldValue('dueDate')) === '2026-10-20', fmt(form.getFieldValue('dueDate')));
}

// ── E. Terms change recalculates ────────────────────────────────────────
{
  const form = makeForm({ billDate: moment('2026-09-11'), terms: 30, dueDate: moment('2026-10-11') });
  const { handleTermsChange } = build(form);
  handleTermsChange(60);
  check('changing Terms recalculates Due Date',
    fmt(form.getFieldValue('dueDate')) === '2026-11-10', fmt(form.getFieldValue('dueDate')));
  handleTermsChange(0);
  check('switching to "Due on receipt" sets Due Date = Bill Date',
    fmt(form.getFieldValue('dueDate')) === '2026-09-11', fmt(form.getFieldValue('dueDate')));
}

// ── F. Vendor default terms drive Terms + Due Date ──────────────────────
{
  const form = makeForm({ billDate: moment('2026-09-11'), terms: 30, dueDate: moment('2026-10-11') });
  const { applyVendorDefaultTerms } = build(form);

  applyVendorDefaultTerms({ id: 1, supplier_terms: 'Net 60' });
  check('vendor default terms "Net 60" set Terms=60 and recalculate Due Date',
    form.getFieldValue('terms') === 60 && fmt(form.getFieldValue('dueDate')) === '2026-11-10',
    `terms=${form.getFieldValue('terms')} due=${fmt(form.getFieldValue('dueDate'))}`);

  applyVendorDefaultTerms({ id: 2, supplier_terms: 'Due on receipt' });
  check('vendor default terms "Due on receipt" set Terms=0 and Due Date=Bill Date',
    form.getFieldValue('terms') === 0 && fmt(form.getFieldValue('dueDate')) === '2026-09-11',
    `terms=${form.getFieldValue('terms')} due=${fmt(form.getFieldValue('dueDate'))}`);

  applyVendorDefaultTerms({ id: 3, supplier_terms: 'Net 45' });
  check('vendor default terms "Net 45" set Terms=45',
    form.getFieldValue('terms') === 45, `terms=${form.getFieldValue('terms')}`);

  // No-op paths must leave Terms untouched.
  const noop = (label, vendor) => {
    const f = makeForm({ billDate: moment('2026-09-11'), terms: 30, dueDate: moment('2026-10-11') });
    build(f).applyVendorDefaultTerms(vendor);
    check(label, f.getFieldValue('terms') === 30 && fmt(f.getFieldValue('dueDate')) === '2026-10-11',
      `terms=${f.getFieldValue('terms')} due=${fmt(f.getFieldValue('dueDate'))}`);
  };
  noop('vendor with blank terms leaves Terms/Due Date untouched', { supplier_terms: '' });
  noop('vendor with null terms leaves Terms/Due Date untouched', { supplier_terms: null });
  noop('vendor with unparseable terms ("fdgdg") leaves Terms/Due Date untouched', { supplier_terms: 'fdgdg' });
  noop('vendor whose terms are not in the Terms list ("Net 7") leaves the select valid', { supplier_terms: 'Net 7' });
  noop('a null vendor is a safe no-op', null);
}

// ── G. New-bill mount initialisation (simulated) ────────────────────────
{
  // The mount effect is: if (isEdit) return; applyDueDate(billDate || moment(), termsOrDefault(terms));
  const form = makeForm({ billDate: moment('2026-09-11'), terms: 30, dueDate: undefined });
  const api = build(form);
  api.applyDueDate(form.getFieldValue('billDate') || moment(), api.termsOrDefault(form.getFieldValue('terms')));
  check('opening a NEW bill populates Due Date immediately (no manual Terms change needed)',
    fmt(form.getFieldValue('dueDate')) === '2026-10-11', fmt(form.getFieldValue('dueDate')));

  const form2 = makeForm({ billDate: moment('2026-09-11'), terms: undefined, dueDate: undefined });
  const api2 = build(form2);
  api2.applyDueDate(form2.getFieldValue('billDate') || moment(), api2.termsOrDefault(form2.getFieldValue('terms')));
  check('opening a NEW bill with no Terms defaults to Net 30',
    fmt(form2.getFieldValue('dueDate')) === '2026-10-11', fmt(form2.getFieldValue('dueDate')));
}

// ── H. Wiring / source-level assertions ─────────────────────────────────
check('Bill Date control is wired to handleBillDateChange',
  /name="billDate"[\s\S]{0,200}?<DatePicker[^>]*onChange=\{handleBillDateChange\}/.test(src));
check('Terms control is wired to handleTermsChange',
  /name="terms"[\s\S]{0,200}?<Select onChange=\{handleTermsChange\}/.test(src));
check('Vendor control applies the vendor default terms',
  /name="vendorId"[\s\S]{0,1200}?applyVendorDefaultTerms\(selected\)/.test(src));
check('the pre-selected vendor applies its default terms only once (Refresh cannot clobber manual Terms)',
  /vendorTermsAppliedRef\.current !== preSelectedVendorId[\s\S]{0,120}?applyVendorDefaultTerms\(vendor\)/.test(src));
check('the mount initialiser is skipped in edit mode (stored Due Date wins)',
  /if \(isEdit\) return;[\s\S]{0,200}?applyDueDate\(/.test(src));
check('edit mode loads the stored Due Date and does not recompute it on mount',
  /dueDate: data\.due_date \? moment\(data\.due_date\) : null/.test(src));
check('the mount initialiser only runs when the edit target changes',
  /\}, \[isEdit\]\);/.test(src));
check('saving a new bill resets via resetForm (Due Date re-calculated, not left blank)',
  /if \(!isEdit\) \{\s*resetForm\(\);/.test(src));
check('the Clear button resets via resetForm', /<Button onClick=\{resetForm\}>/.test(src));
check('exactly one Due Date calculation exists (single shared calculateDueDate)',
  (src.match(/const calculateDueDate = /g) || []).length === 1);
check('no other place adds days to the bill date to build a Due Date',
  (src.match(/,\s*'days'\)/g) || []).length === 1);

// ── I. Issue 1 wiring ───────────────────────────────────────────────────
check('the line-item picker is fed by the classification-based bill filter',
  /const allAccounts = getBillLineAccounts\(/.test(src));
check('the accounts query asks the backend for bill-eligible accounts',
  /getChartOfAccounts\?\.\(\{ context: 'bill' \}\)/.test(src));
check('the old hand-maintained ACCOUNT_TYPES_ALLOWED list is gone',
  !/ACCOUNT_TYPES_ALLOWED/.test(src));
check('the "Add New Account" modal offers only bill-usable types',
  /\{BILL_LINE_ACCOUNT_TYPES\.map\(/.test(src));
check('no account-name matching is used for eligibility (no LIKE/lowercase-name tests)',
  !/name\.toLowerCase\(\)\.includes\(['"](loan|income)/i.test(src) && !/LIKE\s*'%loan%/i.test(src));

// ── Report ──────────────────────────────────────────────────────────────
console.log('\n=== Enter-Bill Due Date + account filter ===');
console.log(results.join('\n'));
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
