/**
 * services/depositAccounts.js — the ONE backend rule for "Deposit From Account".
 *
 * A Manual Deposit credits the account the money came from: revenue, a loan
 * (liability), an owner/equity contribution, or a credit-card liability. The
 * dropdown and the POSTING validation both use the eligibility rule in
 * services/accountEligibility.js, so the renderer can never widen it and the
 * backend can never accept an account the UI would not offer.
 *
 * This module is the single source of truth for:
 *   • the list of selectable source accounts (active, postable, right family)
 *   • validating a submitted source account (owned, active, allowed, ≠ bank)
 */

const db = require('../models/dbmgr');
const { isManualDepositSourceAccount } = require('./accountEligibility');

const SELECT_SQL = `
  SELECT id, name, type, subType, number, parentId, status, isSystem
  FROM chart_of_accounts`;
const ORDER = ` ORDER BY CAST(number AS INTEGER) ASC, name ASC`;

const shape = (r) => ({
  id: Number(r.id),
  name: r.name,
  type: r.type,
  subType: r.subType || '',
  number: r.number || '',
  parentId: r.parentId != null ? Number(r.parentId) : null,
  status: r.status || 'Active',
});

/** Every account a Manual Deposit line may credit (server-authoritative). */
function listValidDepositSourceAccounts() {
  let rows = [];
  try { rows = db.prepare(SELECT_SQL + ORDER).all(); } catch { return []; }
  return rows.filter(isManualDepositSourceAccount).map(shape);
}

/**
 * Validate a submitted Deposit From account.
 * @returns {{ ok:boolean, account?:object, error?:string }}
 */
function validateDepositSourceAccount(accountId, { receivingBankAccountId } = {}) {
  const id = Number(accountId);
  if (!id) return { ok: false, error: 'Each deposit line needs a Deposit From Account.' };

  let acc = null;
  try { acc = db.prepare(SELECT_SQL + ' WHERE id = ?').get(id); } catch { acc = null; }
  if (!acc) return { ok: false, error: `Deposit From Account #${id} was not found.` };

  if (receivingBankAccountId != null && Number(id) === Number(receivingBankAccountId)) {
    return { ok: false, error: 'The Deposit From Account cannot be the same as the receiving Bank account. Use a bank transfer for bank-to-bank moves.' };
  }
  if (String(acc.status || 'Active').trim().toLowerCase() !== 'active') {
    return { ok: false, error: `The account "${acc.name}" is inactive and cannot be used for a new deposit.` };
  }
  if (!isManualDepositSourceAccount(acc)) {
    return {
      ok: false,
      error: `"${acc.name}" (${acc.type || 'unknown type'}) is not a valid Deposit From account. Choose an active Income, Liability or Equity account.`,
    };
  }
  return { ok: true, account: shape(acc) };
}

module.exports = { listValidDepositSourceAccounts, validateDepositSourceAccount };
