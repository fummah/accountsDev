/**
 * Shared customer/contact validation.
 *
 * The rule itself now lives in src/utils/contactIdentity.js — the frontend
 * mirror of src/backend/services/contactIdentity.js. This module keeps the
 * customer-facing names and the antd rule-factory shape that the forms here
 * have always used, and re-exports the rule so there is exactly one definition.
 *
 * Consumers:
 *
 *   • CustomerContactFields.js — the shared field block used by every
 *     customer-capturing form (Create/Edit Customer, Create Invoice,
 *     Create Quote, New Lead → From Scratch)
 *   • Leads.js — the lead form, which composes these rules so a lead captured
 *     "from scratch" obeys exactly the same rules as a customer.
 *
 * There is no schema library (yup/zod) in this codebase, so the schema is
 * expressed as antd rule factories — the format every form here already uses.
 */

import {
  IDENTITY_REQUIRED_MESSAGE,
  firstOrCompanyValidator,
  identityRule,
  isIdentified,
  deriveDisplayName,
  normIdentity,
} from '../../../utils/contactIdentity';

export {
  IDENTITY_REQUIRED_MESSAGE,
  firstOrCompanyValidator,
  identityRule,
  isIdentified,
  deriveDisplayName,
  normIdentity,
};

/**
 * Per-field rule factories. A factory takes the antd form instance so a rule
 * can look at sibling fields (e.g. first_name consulting company_name).
 */
export const customerContactSchema = {
  first_name: (form) => identityRule(form),
};

/** Read the rules for one contact field. Returns [] for unconstrained fields. */
export const getContactRules = (field, form) => {
  const factory = customerContactSchema[field];
  return typeof factory === 'function' ? factory(form) : [];
};

export default customerContactSchema;
