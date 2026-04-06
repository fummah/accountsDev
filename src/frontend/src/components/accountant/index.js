import React from 'react';
import { Route, Switch } from 'react-router-dom';
import ChartOfAccounts from './ChartOfAccounts';
import FixedAssets from './FixedAssets';
import Transaction from './Transaction';
import VoidTransaction from './VoidTransaction';
import Reconcile from './Reconcile';
import TrialBalance from './TrialBalance';
import ConsolidatedTrialBalance from './ConsolidatedTrialBalance';
import EntitiesManager from './EntitiesManager';
import DimensionsManager from './DimensionsManager';
import TrialBalanceAdvanced from './TrialBalanceAdvanced';
import COAImportExport from './COAImportExport';
import GeneralLedger from './GeneralLedger';
import JournalEntries from './JournalEntries';
import ClosingDate from './ClosingDate';
import ManageAssets from './ManageAssets';
import CheckPrinting from './CheckPrinting';
import QBImport from './QBImport';
import RecurringTransactions from './RecurringTransactions';
import AccountantCenter from './AccountantCenter';

const AccountantRoutes = ({ match }) => {
  return (
    <Switch>
      <Route exact path={`${match.path}/center`} component={AccountantCenter} />
      <Route path={`${match.path}/chart-of-accounts`} component={ChartOfAccounts} />
      <Route path={`${match.path}/fixed-assets`} component={FixedAssets} />
      <Route path={`${match.path}/enter-transaction`} component={Transaction} />
      <Route path={`${match.path}/void-transaction`} component={VoidTransaction} />
      <Route path={`${match.path}/reconcile`} component={Reconcile} />
      <Route path={`${match.path}/trial-balance`} component={TrialBalance} />
      <Route path={`${match.path}/consolidated-trial-balance`} component={ConsolidatedTrialBalance} />
      <Route path={`${match.path}/entities`} component={EntitiesManager} />
      <Route path={`${match.path}/dimensions`} component={DimensionsManager} />
      <Route path={`${match.path}/advanced-trial-balance`} component={TrialBalanceAdvanced} />
      <Route path={`${match.path}/coa-import-export`} component={COAImportExport} />
      <Route path={`${match.path}/qb-import`} component={QBImport} />
      <Route path={`${match.path}/general-ledger`} component={GeneralLedger} />
      <Route path={`${match.path}/journal-entries`} component={JournalEntries} />
      <Route path={`${match.path}/closing-date`} component={ClosingDate} />
      <Route path={`${match.path}/manage-assets`} component={FixedAssets} />
      <Route path={`${match.path}/check-printing`} component={CheckPrinting} />
      <Route path={`${match.path}/recurring`} component={RecurringTransactions} />
    </Switch>
  );
};

export default AccountantRoutes;