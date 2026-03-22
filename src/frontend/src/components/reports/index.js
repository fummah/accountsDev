import React from 'react';
import { Route, Switch } from 'react-router-dom';
import ProfitLoss from './ProfitLoss';
import CashFlow from './CashFlow';
import BalanceSheet from './BalanceSheet';
import JobCosting from './JobCosting';
import ProjectProfitability from './ProjectProfitability';
import TimeTracking from '../projects/pages/Timesheets';
import Builder from './Builder';
import ARAging from './ARAging';
import APAging from './APAging';
import BudgetVsActual from './BudgetVsActual';
import AuditTrail from './AuditTrail';
import VATReturn from './VATReturn';
import TaxSummary from './TaxSummary';

const ReportRoutes = ({ match }) => {
  return (
    <Switch>
      <Route path={`${match.path}/profit-loss`} component={ProfitLoss} />
      <Route path={`${match.path}/cash-flow`} component={CashFlow} />
      <Route path={`${match.path}/balance-sheet`} component={BalanceSheet} />
      <Route path={`${match.path}/ar-aging`} component={ARAging} />
      <Route path={`${match.path}/ap-aging`} component={APAging} />
      <Route path={`${match.path}/job-costing`} component={JobCosting} />
      <Route path={`${match.path}/project-profitability`} component={ProjectProfitability} />
      <Route path={`${match.path}/time-tracking`} component={TimeTracking} />
      <Route path={`${match.path}/builder`} component={Builder} />
      <Route path={`${match.path}/budget-vs-actual`} component={BudgetVsActual} />
      <Route path={`${match.path}/audit-trail`} component={AuditTrail} />
      <Route path={`${match.path}/vat-return`} component={VATReturn} />
      <Route path={`${match.path}/tax-summary`} component={TaxSummary} />
    </Switch>
  );
};

export default ReportRoutes;