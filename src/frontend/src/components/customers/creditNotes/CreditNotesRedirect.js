import React from 'react';
import { Redirect, useLocation } from 'react-router-dom';

/**
 * CreditNotesRedirect — the standalone "Credit Notes / Refunds" page was removed
 * from the active UI. Customer credits and refunds are managed inside
 * Customer Details. This keeps the old route working as a safe redirect (no 404
 * after an upgrade): if a customer is known it opens that customer, otherwise
 * the Customers list.
 *
 * No data, tables, APIs or accounting are touched — only the old page's route.
 */
const CreditNotesRedirect = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const customerId = params.get('customerId') || params.get('customer');
  const target = customerId ? `/main/customers/details/${customerId}` : '/main/customers/center';
  return <Redirect to={target} />;
};

export default CreditNotesRedirect;
