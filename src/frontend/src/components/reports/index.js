import React from 'react';
import { Route, Switch } from 'react-router-dom';
import ProfitLoss from './ProfitLoss';
import CashFlow from './CashFlow';
import BalanceSheet from './BalanceSheet';
import JobCosting from './JobCosting';
import ProjectProfitability from './ProjectProfitability';
import TimeTracking from './TimeTracking';

const ReportRoutes = ({ match }) => {
  return (
    <Switch>
      <Route path={`${match.path}/profit-loss`} component={ProfitLoss} />
      <Route path={`${match.path}/cash-flow`} component={CashFlow} />
      <Route path={`${match.path}/balance-sheet`} component={BalanceSheet} />
      <Route path={`${match.path}/job-costing`} component={JobCosting} />
      <Route path={`${match.path}/project-profitability`} component={ProjectProfitability} />
      <Route path={`${match.path}/time-tracking`} component={TimeTracking} />
    </Switch>
  );
};

export default ReportRoutes;