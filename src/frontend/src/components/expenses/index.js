import React from 'react';
import { Route, Switch } from 'react-router-dom';
import BillManagement from './BillManagement';
import ExpenseTracking from './ExpenseTracking';
import CreditCardCharges from './CreditCardCharges';
import Transactions from './Transactions';

const ExpenseRoutes = ({ match }) => {
  return (
    <Switch>
      <Route path={`${match.path}/bills`} component={BillManagement} />
      <Route path={`${match.path}/tracking`} component={ExpenseTracking} />
      <Route path={`${match.path}/credit-cards`} component={CreditCardCharges} />
      <Route path={`${match.path}/transactions`} component={Transactions} />
    </Switch>
  );
};

export default ExpenseRoutes;