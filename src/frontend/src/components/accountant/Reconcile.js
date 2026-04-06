import React from 'react';
import { Redirect } from 'react-router-dom';

// Redirect accountant Reconcile to unified Bank Reconciliation
const Reconcile = () => {
  return <Redirect to="/main/banking/reconcile" />;
};

export default Reconcile;