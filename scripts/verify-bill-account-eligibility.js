/**
 * verify-bill-account-eligibility.js
 *
 * Proves, against the LIVE chart of accounts, that the new bill-line account
 * eligibility rule satisfies its contract exactly:
 *
 *   (a) Income / Other Income accounts are NEVER offered (and are unreachable
 *       through the picker's search index).
 *   (b) Loan accounts ARE offered.
 *   (c) Nothing else that was valid under the OLD rule was removed — i.e.
 *       NEW ⊇ OLD minus the Income family. This is the "do not remove any
 *       other currently-valid Bill account type" guarantee.
 *   (d) Non-Posting and AR/AP control accounts are not offered.
 *   (e) The frontend rule (utils/accounts.js) and the backend rule
 *       (services/accountEligibility.js) agree exactly — no drift.
 *   (f) Classification is type-driven: an Expense account whose NAME contains
 *       "Loan" stays in, and a revenue account named "Egg Sales" stays out.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');
const dbPath = path.join(ROOT, 'src', 'backend', 'db', 'accounts.db');
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

const backend = require(path.join(ROOT, 'src', 'backend', 'services', 'accountEligibility.js'));

// The frontend util is plain ESM with no imports — copy it to a .mjs so Node
// can import it and we can compare the two implementations directly.
const feSrc = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'src', 'utils', 'accounts.js'), 'utf8');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'billacct-'));
const tmpMjs = path.join(tmpDir, 'accounts.mjs');
fs.writeFileSync(tmpMjs, feSrc);

// The rule that shipped in EnterBill.js BEFORE this fix — used to prove the
// only accounts removed are the Income family.
const OLD_ACCOUNT_TYPES_ALLOWED = [
  'Expense', 'Cost of Goods Sold', 'Other Expense',
  'Asset', 'Inventory', 'Bank', 'Cash', 'Liability',
  'Credit Card', 'Long Term Liability', 'Other Current Liability',
  'Income', 'Other Income', 'Equity',
];
const oldRule = (a) => OLD_ACCOUNT_TYPES_ALLOWED.includes(a.accountType || a.type);

let pass = 0, fail = 0;
const results = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; results.push(`  PASS  ${name}`); }
  else { fail++; results.push(`  FAIL  ${name}${detail ? `  → ${detail}` : ''}`); }
};

(async () => {
  const fe = await import('file://' + tmpMjs.replace(/\\/g, '/'));

  const rows = db.prepare(`
    SELECT id, name, type, subType, number, status
    FROM chart_of_accounts ORDER BY id
  `).all();
  const accounts = rows.map(r => ({
    id: r.id, accountName: r.name, name: r.name,
    accountType: r.type, type: r.type,
    accountSubType: r.subType, subType: r.subType,
    accountNumber: r.number, status: r.status,
  }));

  const active = accounts.filter(a => a.status === 'Active');
  const isIncome = (a) => /^(income|other income)$/i.test(String(a.type).trim());
  const isLoan = (a) => /^loan$/i.test(String(a.type).trim());

  const beOut = backend.getBillLineAccounts(active);
  const feOut = fe.getBillLineAccounts(active);
  const beIds = new Set(beOut.map(a => a.id));
  const feIds = new Set(feOut.map(a => a.id));

  // ── (e) Parity ─────────────────────────────────────────────────────────
  const sameSet = beIds.size === feIds.size && [...beIds].every(id => feIds.has(id));
  check('frontend and backend eligibility rules agree exactly', sameSet,
    `be=${beIds.size} fe=${feIds.size}`);

  // ── (a) Revenue accounts are gone ──────────────────────────────────────
  const activeIncome = active.filter(isIncome);
  check('the live DB contains active Income accounts (so the test is meaningful)',
    activeIncome.length > 0, `count=${activeIncome.length}`);
  check('no Income / Other Income account is offered on a bill line',
    activeIncome.every(a => !beIds.has(a.id)),
    activeIncome.filter(a => beIds.has(a.id)).map(a => `${a.id}:${a.name}`).join(', '));

  const oldIncome = active.filter(a => oldRule(a) && isIncome(a));
  check('the OLD rule did offer revenue accounts (so the bug was real)',
    oldIncome.length > 0, `count=${oldIncome.length}`);

  // ── (b) Loans are in ───────────────────────────────────────────────────
  const activeLoans = active.filter(isLoan);
  check('the live DB contains an active Loan account (so the test is meaningful)',
    activeLoans.length > 0, activeLoans.map(a => `${a.id}:${a.name}`).join(', '));
  check('every active Loan account is offered on a bill line',
    activeLoans.every(a => beIds.has(a.id)),
    activeLoans.filter(a => !beIds.has(a.id)).map(a => `${a.id}:${a.name}`).join(', '));
  check('the OLD rule did NOT offer Loan accounts (so the bug was real)',
    activeLoans.every(a => !oldRule(a)));

  // ── (c) Nothing else currently valid was removed ───────────────────────
  const oldValid = active.filter(oldRule);
  const removedByNewRule = oldValid.filter(a => !beIds.has(a.id));
  const removedNonIncome = removedByNewRule.filter(a => !isIncome(a));
  check('no currently-valid bill account type was removed (only the Income family was)',
    removedNonIncome.length === 0,
    removedNonIncome.map(a => `${a.id}:${a.name} [${a.type}]`).join(', '));

  const addedByNewRule = beOut.filter(a => !oldRule(a));
  check('new rule only ADDS accounts (Loan / Fixed Asset / Other Current Asset), never removes others',
    addedByNewRule.every(a => isLoan(a) || /^(fixed asset|other current asset)$/i.test(String(a.type).trim())),
    addedByNewRule.map(a => `${a.id}:${a.name} [${a.type}]`).join(', '));

  // ── (d) Non-Posting / control accounts ─────────────────────────────────
  const nonPosting = active.filter(a => /^non[- ]?posting$/i.test(String(a.type).trim()));
  check('Non-Posting accounts are not offered',
    nonPosting.every(a => !beIds.has(a.id)), nonPosting.map(a => `${a.id}:${a.name}`).join(', '));

  const control = active.filter(a => /^(accounts receivable|accounts payable)$/i.test(String(a.type).trim()));
  check('AR / AP control accounts (by Type) are not offered',
    control.every(a => !beIds.has(a.id)), control.map(a => `${a.id}:${a.name}`).join(', '));

  // ── (f) Classification is type-driven, not name-driven ─────────────────
  const eggSales = beOut.filter(a => /egg\s*sales/i.test(a.name));
  check('a revenue account named "Egg Sales" cannot appear', eggSales.length === 0,
    eggSales.map(a => `${a.id}:${a.name}`).join(', '));

  const namedLoanExpense = active.filter(a => /^expense$/i.test(String(a.type).trim()) && /loan/i.test(a.name));
  if (namedLoanExpense.length) {
    check('an Expense account whose NAME contains "Loan" is still included',
      namedLoanExpense.every(a => beIds.has(a.id)),
      namedLoanExpense.map(a => `${a.id}:${a.name}`).join(', '));
  } else {
    results.push('  SKIP  no Expense account with "Loan" in its name in this DB');
  }

  // A Loan-typed account whose name does NOT contain "loan" must still be in.
  const loanTypedNoName = active.filter(a => isLoan(a) && !/loan/i.test(a.name));
  if (loanTypedNoName.length) {
    check('a Loan-typed account whose name omits "loan" is still included (type-driven)',
      loanTypedNoName.every(a => beIds.has(a.id)),
      loanTypedNoName.map(a => `${a.id}:${a.name}`).join(', '));
  } else {
    results.push('  SKIP  no Loan-typed account without "loan" in its name');
  }

  // ── (a2) Search cannot surface an excluded account ─────────────────────
  // AccountSelect builds its search index from the accounts it is handed, so
  // filtering the list is what makes search safe. Prove it end to end.
  const searchIndex = beOut
    .map(a => `${a.accountName} ${a.accountNumber || ''} ${a.type}`.toLowerCase())
    .join('\n');
  const leaked = activeIncome
    .map(a => a.accountName)
    .filter(n => n && searchIndex.includes(n.toLowerCase()));
  check('no revenue account name is reachable through the picker search index',
    leaked.length === 0, leaked.join(', '));

  // ── (g) Backend wiring: opt-in context must not change the shared endpoint ─
  const handlersSrc = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'handlers', 'accountingHandlers.js'), 'utf8');
  check('the accounts handler imports the bill eligibility service',
    /require\('\.\.\/services\/accountEligibility'\)/.test(handlersSrc));
  check('the accounts handler only filters when context === "bill" is explicitly requested',
    /context === 'bill'[\s\S]{0,120}?getBillLineAccounts\(accounts\)/.test(handlersSrc));
  check('the unfiltered list is still returned when no context is given',
    /if \(context === 'bill' && Array\.isArray\(accounts\)\) \{\s*return getBillLineAccounts\(accounts\);\s*\}\s*return accounts;/.test(handlersSrc));

  // Only the Enter-Bill screen may request the bill context; every other caller
  // must keep getting the full, unfiltered chart of accounts.
  const feRoot = path.join(ROOT, 'src', 'frontend', 'src');
  const contextCallers = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(full); continue; }
      if (!/\.(js|jsx)$/.test(e.name)) continue;
      const t = fs.readFileSync(full, 'utf8');
      if (/getChartOfAccounts\?*\.\(\s*\{\s*context/.test(t)) {
        contextCallers.push(path.relative(feRoot, full).replace(/\\/g, '/'));
      }
    }
  };
  walk(feRoot);
  check('only EnterBill.js asks for the bill-specific account list',
    contextCallers.length === 1 && contextCallers[0] === 'components/vendors/bills/EnterBill.js',
    contextCallers.join(', '));

  // ── Report ─────────────────────────────────────────────────────────────
  console.log('\n=== Bill-line account eligibility ===');
  console.log(results.join('\n'));
  console.log(`\n  active accounts:            ${active.length}`);
  console.log(`  offered under OLD rule:     ${oldValid.length}`);
  console.log(`  offered under NEW rule:     ${beOut.length}`);
  console.log(`  removed (Income family):    ${removedByNewRule.length}`);
  console.log(`  added (Loan/asset types):   ${addedByNewRule.length}  ${addedByNewRule.map(a => `${a.name}[${a.type}]`).join(', ')}`);
  const famCount = {};
  for (const a of beOut) famCount[backend.accountFamily(a)] = (famCount[backend.accountFamily(a)] || 0) + 1;
  console.log(`  families offered:           ${JSON.stringify(famCount)}`);
  console.log(`\n  ${pass} passed, ${fail} failed\n`);

  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})();
