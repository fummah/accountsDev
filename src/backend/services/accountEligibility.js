/**
 * accountEligibility.js — which Chart-of-Accounts accounts may appear where.
 *
 * A vendor BILL line posts to the account representing *what was bought*
 * (expense / asset) or *which liability is being settled* (credit card / loan).
 * It must NEVER post to a revenue account — a bill does not recognise income.
 *
 * Eligibility is decided by the account's real accounting CLASSIFICATION (its
 * Type, and for control accounts its Sub-Type) and NEVER by its name. There is
 * deliberately no `LIKE '%loan%'` / `LIKE '%income%'` matching anywhere here:
 *   • "Egg Sales"      → Type = Income      → excluded (revenue, not a bill line)
 *   • "Loan Fees"      → Type = Expense     → included (it is a real expense)
 *   • "Equipment Loan" → Type = Loan        → included (settles a liability)
 *
 * NOTE: the classification table is mirrored on the renderer side by
 * src/frontend/src/utils/accounts.js (isBillLineAccount / getBillLineAccounts).
 * Keep both in sync when the Chart-of-Accounts type vocabulary changes.
 */

// Chart-of-Accounts type → accounting family. Includes the legacy values that
// exist in real databases where a Sub-Type was historically stored as the Type
// (e.g. "Other Current Liability", "Fixed Asset", "Other Current Asset").
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
  // Expense family
  expense: 'Expense',
  'other expense': 'Expense',
  'cost of goods sold': 'Expense',
  // Income family — never valid on a bill line
  income: 'Income',
  'other income': 'Income',
  // Non-posting / memorandum accounts never reach the ledger
  'non-posting': 'NonPosting',
  'non posting': 'NonPosting',
  nonposting: 'NonPosting',
};

// Families that can never appear on a bill line.
const BILL_EXCLUDED_FAMILIES = new Set(['Income', 'NonPosting']);

// Control accounts that must never be chosen on a bill line: Accounts
// Receivable is unrelated to a vendor bill, and Accounts Payable is the bill's
// own offset account — selecting it would double-count the liability.
// Matched on the account Type (classification), never on the account name.
const BILL_EXCLUDED_TYPES = new Set(['accounts receivable', 'accounts payable']);

const typeKey = (account = {}) =>
  String(account.accountType || account.type || '').trim().toLowerCase();

/** Accounting family of an account, or '' when the classification is unknown. */
const accountFamily = (account = {}) => ACCOUNT_TYPE_FAMILY[typeKey(account)] || '';

/** True when an account may be selected on a vendor-bill line item. */
const isBillLineAccount = (account = {}) => {
  const t = typeKey(account);
  if (!t) return false;
  if (BILL_EXCLUDED_TYPES.has(t)) return false;
  const family = ACCOUNT_TYPE_FAMILY[t];
  if (!family) return false; // unknown classification → not safe to offer
  return !BILL_EXCLUDED_FAMILIES.has(family);
};

/** Filter a chart-of-accounts list down to the accounts valid on a bill line. */
const getBillLineAccounts = (accounts) =>
  (Array.isArray(accounts) ? accounts : []).filter(isBillLineAccount);

// ── Manual Deposit source-account eligibility ───────────────────────────────
//
// A Manual Deposit line credits "where the money came from". That is NOT always
// revenue: it may be Sales/Other Income, a Loan/Liability, an Owner/Equity
// contribution, or a Credit-Card liability. So the source account is NOT
// restricted to Income — it is restricted to the POSTABLE Income / Liability /
// Equity families.
//
// Deliberately EXCLUDED:
//   • Asset family (Bank, Cash, Accounts Receivable, …) — bank-to-bank belongs
//     to the Bank Transfer workflow, and AR is a protected control account.
//   • Expense family — a deposit is not a purchase (kept narrow on purpose).
//   • Accounts Payable — a protected control account (never credited here).
//   • NonPosting accounts — never hit the ledger.
//   • System control accounts (isSystem) — e.g. AR/AP/Undeposited Funds/
//     Retained Earnings/Opening Balance Equity must not be posted to directly.
//   • Inactive accounts.
const MANUAL_DEPOSIT_SOURCE_FAMILIES = new Set(['Income', 'Liability', 'Equity']);
const MANUAL_DEPOSIT_EXCLUDED_TYPES = new Set(['accounts payable']);

const isManualDepositSourceAccount = (account = {}) => {
  const t = typeKey(account);
  if (!t) return false;
  if (String(account.status || 'Active').trim().toLowerCase() !== 'active') return false;
  if (Number(account.isSystem) === 1 || account.isSystem === true) return false;
  if (MANUAL_DEPOSIT_EXCLUDED_TYPES.has(t)) return false;
  return MANUAL_DEPOSIT_SOURCE_FAMILIES.has(ACCOUNT_TYPE_FAMILY[t]);
};

/** Filter a chart-of-accounts list down to valid Manual Deposit source accounts. */
const getManualDepositSourceAccounts = (accounts) =>
  (Array.isArray(accounts) ? accounts : []).filter(isManualDepositSourceAccount);

module.exports = {
  ACCOUNT_TYPE_FAMILY,
  BILL_EXCLUDED_FAMILIES,
  BILL_EXCLUDED_TYPES,
  accountFamily,
  isBillLineAccount,
  getBillLineAccounts,
  MANUAL_DEPOSIT_SOURCE_FAMILIES,
  MANUAL_DEPOSIT_EXCLUDED_TYPES,
  isManualDepositSourceAccount,
  getManualDepositSourceAccounts,
};
