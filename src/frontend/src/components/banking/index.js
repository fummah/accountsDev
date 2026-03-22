import React from 'react';
import { Route, Switch } from 'react-router-dom';
import BankReconciliation from './BankReconciliation';
import BankTransfer from './BankTransfer';
import Deposits from './Deposits';
import RunPayroll from './RunPayroll';
import PayrollCalendar from './PayrollCalendar';
import BankFeeds from './BankFeeds';

const BankingRoutes = ({ match }) => {
  return (
    <Switch>
      <Route path={`${match.path}/reconcile`} component={BankReconciliation} />
      <Route path={`${match.path}/transfers`} component={BankTransfer} />
      <Route path={`${match.path}/deposits`} component={Deposits} />
  <Route path={`${match.path}/payroll`} component={RunPayroll} />
  <Route path={`${match.path}/payroll-calendar`} component={PayrollCalendar} />
      <Route path={`${match.path}/feeds`} component={BankFeeds} />
    </Switch>
  );
};

export default BankingRoutes;