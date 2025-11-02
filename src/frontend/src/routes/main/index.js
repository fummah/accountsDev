import React from "react";
import { Route, Switch } from "react-router-dom";
import Dashboard from "./dashboard";
import BankingRoutes from "../../components/banking";
import EmployeeRoutes from "../../components/employees";
import AccountantRoutes from "../../components/accountant";
import ExpenseRoutes from "../../components/expenses";
import ReportRoutes from "../../components/reports";
import SettingsRoutes from "../../components/settings";

const Main = ({ match }) => (
  <Switch>
    <Route path={`${match.path}/dashboard`} component={Dashboard} />
    <Route path={`${match.path}/banking`} component={BankingRoutes} />
    <Route path={`${match.path}/employees`} component={EmployeeRoutes} />
    <Route path={`${match.path}/accountant`} component={AccountantRoutes} />
    <Route path={`${match.path}/expenses`} component={ExpenseRoutes} />
    <Route path={`${match.path}/reports`} component={ReportRoutes} />
    <Route path={`${match.path}/settings`} component={SettingsRoutes} />
  </Switch>
);

export default Main;
