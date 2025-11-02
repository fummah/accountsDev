import React from 'react';
import { Route, Switch } from 'react-router-dom';
import ChartOfAccounts from './ChartOfAccounts';
import FixedAssets from './FixedAssets';
import Transaction from './Transaction';
import VoidTransaction from './VoidTransaction';
import Reconcile from './Reconcile';
import TrialBalance from './TrialBalance';
import GeneralLedger from './GeneralLedger';
import JournalEntries from './JournalEntries';
import ClosingDate from './ClosingDate';
import ManageAssets from './ManageAssets';

const AccountantRoutes = ({ match }) => {
  return (
    <Switch>
      <Route path={`${match.path}/chart-of-accounts`} component={ChartOfAccounts} />
      <Route path={`${match.path}/fixed-assets`} component={FixedAssets} />
      <Route path={`${match.path}/enter-transaction`} component={Transaction} />
      <Route path={`${match.path}/void-transaction`} component={VoidTransaction} />
      <Route path={`${match.path}/reconcile`} component={Reconcile} />
      <Route path={`${match.path}/trial-balance`} component={TrialBalance} />
      <Route path={`${match.path}/general-ledger`} component={GeneralLedger} />
      <Route path={`${match.path}/journal-entries`} component={JournalEntries} />
      <Route path={`${match.path}/closing-date`} component={ClosingDate} />
      <Route path={`${match.path}/manage-assets`} component={ManageAssets} />
    </Switch>
  );
};

export default AccountantRoutes;