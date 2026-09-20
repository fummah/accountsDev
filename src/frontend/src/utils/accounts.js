/**
 * Chart-of-accounts helpers for hierarchical display.
 *
 * Account names may repeat across different parent accounts (e.g. several
 * "Taxi" children under Travel / Vehicle / Employee Expenses). These are
 * DIFFERENT accounts and must never be identified by name alone. Dropdowns
 * and reports should display the parent path to disambiguate, and always use
 * the unique account id internally.
 */

// Build a map id -> hierarchical display label, e.g. "Expenses → Travel → Taxi"
export const buildAccountLabelMap = (accounts = []) => {
  const byId = new Map(accounts.map(a => [Number(a.id), a]));
  const cache = new Map();

  const pathFor = (a) => {
    const id = Number(a.id);
    if (cache.has(id)) return cache.get(id);
    const name = (a.accountName || a.name || '').trim();
    const parts = [name];
    let cur = a;
    const guard = new Set([id]);
    let depth = 0;
    while (cur && cur.parentId != null && depth++ < 20) {
      const pid = Number(cur.parentId);
      if (guard.has(pid)) break;
      const parent = byId.get(pid);
      if (!parent) break;
      guard.add(pid);
      parts.unshift((parent.accountName || parent.name || '').trim());
      cur = parent;
    }
    const label = parts.filter(Boolean).join(' → ');
    cache.set(id, label);
    return label;
  };

  const map = new Map();
  accounts.forEach(a => map.set(Number(a.id), pathFor(a)));
  return map;
};

// ── Account tree (parent/child hierarchy for reports) ─────────────────────
//
// Reports must preserve the Chart-of-Accounts parent→child structure and must
// NEVER flatten by name: two child accounts called "Fuel" under different
// parents are DIFFERENT accounts. The tree is therefore linked strictly by
// `id` → `parentId`.
//
// `buildAccountTree` also separates the two amounts the spec requires:
//   • `amount`        — the account's DIRECT posted activity only
//   • `amountDisplay` — direct + every descendant (the rollup)
// so a parent with its own postings and children shows the correct total
// without double counting. Ordering is inherited from the input array, so the
// caller controls sibling order (e.g. account number, then name).

export const buildAccountTree = (accounts = []) => {
  const nodes = {};
  (Array.isArray(accounts) ? accounts : []).forEach(a => {
    const id = Number(a.id);
    nodes[id] = {
      ...a,
      key: a.key || `acct-${id}`,
      accountId: id,
      name: a.name || a.accountName || 'Account',
      parentId: a.parentId != null && a.parentId !== '' ? Number(a.parentId) : null,
      amount: Number(a.amount || 0),
      txnCount: Number(a.txnCount || 0),
      lastDate: a.lastDate || null,
      children: [],
      descendantIds: [id],
      amountDisplay: Number(a.amount || 0),
      txnCountDisplay: Number(a.txnCount || 0),
      lastDateDisplay: a.lastDate || null,
    };
  });

  const roots = [];
  Object.keys(nodes).forEach(k => {
    const n = nodes[k];
    const parent = n.parentId != null ? nodes[n.parentId] : null;
    if (parent && parent !== n) parent.children.push(n);
    else roots.push(n);
  });

  const compute = (n) => {
    let amt = n.amount;
    let txn = n.txnCount;
    let last = n.lastDate;
    const ids = [n.accountId];
    n.children.forEach(c => {
      const r = compute(c);
      amt += r.amount;
      txn += r.txnCount;
      ids.push(...r.ids);
      if (r.lastDate && (!last || r.lastDate > last)) last = r.lastDate;
    });
    n.amountDisplay = amt;
    n.txnCountDisplay = txn;
    n.lastDateDisplay = last;
    n.descendantIds = ids;
    return { amount: amt, txnCount: txn, lastDate: last, ids };
  };
  roots.forEach(compute);

  return roots;
};

// Depth-first flatten with an `indent` level for text/PDF/CSV exports.
export const flattenAccountTree = (nodes, out = [], indent = 0) => {
  (Array.isArray(nodes) ? nodes : []).forEach(n => {
    out.push({ ...n, indent });
    if (n.children && n.children.length) flattenAccountTree(n.children, out, indent + 1);
  });
  return out;
};

// Visit every node in the tree.
export const walkAccountTree = (nodes, fn) => {
  (Array.isArray(nodes) ? nodes : []).forEach(n => {
    fn(n);
    if (n.children && n.children.length) walkAccountTree(n.children, fn);
  });
};

// Hide zero-activity accounts, but KEEP a parent that still has a visible child
// so an indented child is never orphaned under a missing parent label.
export const pruneZeroAccounts = (nodes, hide) => {
  const out = [];
  (Array.isArray(nodes) ? nodes : []).forEach(n => {
    const kids = n.children && n.children.length ? pruneZeroAccounts(n.children, hide) : [];
    const keep = !hide || Number(n.amount) !== 0 || Number(n.txnCount) > 0 || kids.length > 0;
    if (keep) out.push({ ...n, children: kids });
  });
  return out;
};

// Resolve a single account's hierarchical label given the full account list.
export const accountDisplayLabel = (account, accounts = []) => {
  if (!account) return '';
  const map = Array.isArray(accounts) ? buildAccountLabelMap(accounts) : null;
  if (map) {
    const l = map.get(Number(account.id));
    if (l) return l;
  }
  return (account.accountName || account.name || '').trim();
};

/**
 * Dedupe a chart-of-accounts array by FULL HIERARCHY PATH (case-insensitive),
 * keeping the canonical (lowest id) account for each path.
 * Child accounts with the same name under DIFFERENT parents are kept
 * (they are distinct accounts); only true duplicates (same path) are removed.
 */
export const dedupeAccounts = (accounts = []) => {
  const labelMap = buildAccountLabelMap(accounts);
  const seen = new Map();
  const out = [];
  for (const a of accounts) {
    const label = labelMap.get(Number(a.id));
    const key = (label || String(a.accountName || a.name || '')).trim().toLowerCase();
    if (!key) { out.push(a); continue; }
    if (!seen.has(key)) {
      seen.set(key, a);
      out.push(a);
    } else {
      const existing = seen.get(key);
      if (Number(a.id) < Number(existing.id)) {
        const idx = out.indexOf(existing);
        if (idx !== -1) out[idx] = a;
        seen.set(key, a);
      }
    }
  }
  return out;
};

// ── Bank-account eligibility ──────────────────────────────────────────────
// Eligibility is driven by the real Chart of Accounts type classification
// (e.g. type === 'Bank'), NEVER by account names ("Bank", "Checking", ...).
// A "BANK FEES" expense or a "US Bank" Credit Card account is NOT a bank
// account and must never be offered as a check/deposit destination.
const BANK_ACCOUNT_TYPES = new Set(['bank']);

export const isBankAccount = (account = {}) => {
  const t = String(account.accountType || account.type || '').trim().toLowerCase();
  return BANK_ACCOUNT_TYPES.has(t);
};

export const getBankAccounts = (accounts = []) =>
  (Array.isArray(accounts) ? accounts : []).filter(isBankAccount);

// ── Bill-line account eligibility ─────────────────────────────────────────
//
// A vendor BILL line posts to the account that represents *what was bought*
// (an expense / asset) or *which liability is being settled* (a credit card /
// loan). It must NEVER post to a revenue account: a bill does not recognise
// income, so an Income / Other Income account is invalid on a bill line no
// matter what it is called.
//
// Eligibility is decided by the account's real accounting CLASSIFICATION —
// its Type (and, for control accounts, its Sub-Type) — and NEVER by its name.
// There is deliberately no `name.includes('loan')` / `LIKE '%income%'` check:
// an expense account called "Loan Fees" stays an expense, and a revenue
// account called "Egg Sales" is excluded because its Type is Income.
//
// IMPORTANT: this table is mirrored by src/backend/services/accountEligibility.js
// (the backend applies the same rule for the opt-in `context: 'bill'` query).
// Keep the two in sync when the Chart-of-Accounts type vocabulary changes.
const ACCOUNT_TYPE_FAMILY = {
  // Asset family
  asset: 'Asset',
  bank: 'Asset',
  cash: 'Asset',
  'fixed asset': 'Asset',
  'other current asset': 'Asset',
  'other asset': 'Asset',
  inventory: 'Asset',
  'accounts receivable': 'Asset',
  // Liability family
  liability: 'Liability',
  'credit card': 'Liability',
  loan: 'Liability',
  'other current liability': 'Liability',
  'long term liability': 'Liability',
  'other liability': 'Liability',
  'accounts payable': 'Liability',
  // Equity family
  equity: 'Equity',
  // Expense family (profit & loss, debit)
  expense: 'Expense',
  'other expense': 'Expense',
  'cost of goods sold': 'Expense',
  // Income family (profit & loss, credit) — never valid on a bill
  income: 'Income',
  'other income': 'Income',
  // Non-posting (memorandum) accounts never hit the ledger
  'non-posting': 'NonPosting',
  'non posting': 'NonPosting',
  nonposting: 'NonPosting',
};

// Families that can never appear on a bill line.
const BILL_EXCLUDED_FAMILIES = new Set(['Income', 'NonPosting']);

// Control accounts that must never be chosen on a bill line: Accounts
// Receivable is unrelated to a vendor bill, and Accounts Payable is the bill's
// own offset account — selecting it would double-count the liability. Matched
// on the account Type (classification), never on the account name.
const BILL_EXCLUDED_TYPES = new Set(['accounts receivable', 'accounts payable']);

// Canonical, bill-eligible account types offered when creating a new account
// from the Enter-Bill line-item picker. This is the project's canonical type
// vocabulary (ChartOfAccounts.js → ACCOUNT_TYPES / ACCOUNT_SUBTYPES) minus the
// Income family, so every type offered has a matching Sub-Type list and can
// actually be used on a bill line.
export const BILL_LINE_ACCOUNT_TYPES = [
  'Expense',
  'Cost of Goods Sold',
  'Other Expense',
  'Asset',
  'Bank',
  'Cash',
  'Liability',
  'Credit Card',
  'Loan',
  'Equity',
];

const accountTypeKey = (account = {}) =>
  String(account.accountType || account.type || '').trim().toLowerCase();

/** Accounting family of an account (Asset / Liability / Equity / Expense / Income / NonPosting), or '' when unknown. */
export const accountFamily = (account = {}) => ACCOUNT_TYPE_FAMILY[accountTypeKey(account)] || '';

/** True when an account may be selected on a vendor-bill line item. */
export const isBillLineAccount = (account = {}) => {
  const typeKey = accountTypeKey(account);
  if (!typeKey) return false;
  if (BILL_EXCLUDED_TYPES.has(typeKey)) return false;
  const family = ACCOUNT_TYPE_FAMILY[typeKey];
  if (!family) return false; // unknown classification → not safe to offer
  return !BILL_EXCLUDED_FAMILIES.has(family);
};

/** Filter a chart-of-accounts list down to the accounts valid on a bill line. */
export const getBillLineAccounts = (accounts = []) =>
  (Array.isArray(accounts) ? accounts : []).filter(isBillLineAccount);