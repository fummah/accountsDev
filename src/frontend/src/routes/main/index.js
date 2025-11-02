import React from "react";
import { Route, Switch } from "react-router-dom";
import Dashboard from "./dashboard";
import BankingRoutes from "../../components/banking";
import EmployeeRoutes from "../../components/employees";
import AccountantRoutes from "../../components/accountant";
import ExpenseRoutes from "../../components/expenses";
import ReportRoutes from "../../components/reports";
import SettingsRoutes from "../../components/settings";

const Main = () => (
  <Switch>
    <Route path="/main/dashboard" component={Dashboard} />
    <Route path="/main/banking" component={BankingRoutes} />
    <Route path="/main/employees" component={EmployeeRoutes} />
    <Route path="/main/accountant" component={AccountantRoutes} />
    <Route path="/main/expenses" component={ExpenseRoutes} />
    <Route path="/main/reports" component={ReportRoutes} />
    <Route path="/main/settings" component={SettingsRoutes} />
  </Switch>
);

export default Main;
