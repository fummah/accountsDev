import React from "react";
import { Route, Switch } from "react-router-dom";
import Dashboard from "./dashboard";
import BankingRoutes from "../../components/banking";
import EmployeeRoutes from "../../components/employees";
import VendorRoutes from "../../components/vendors";
import AccountantRoutes from "../../components/accountant";
import ExpenseRoutes from "../../components/expenses";
import ReportRoutes from "../../components/reports";
import SettingsRoutes from "../../components/settings";
import CustomerRoutes from "../../components/customers";
import InventoryRoutes from "../../components/inventory";
import ProjectsRoutes from "../../components/projects";
import PosRoutes from "../../components/pos";
import CrmRoutes from "../../components/crm";
import BankStatementsRoutes from "../../components/bankStatements";
import AnalyticsDashboard from "../../components/analytics/Dashboard";
import ApprovalsCenter from "../../components/approvals";
import DocumentCenter from "../../components/documents";
import Assistant from "../../components/assistant";

const Main = () => (
  <Switch>
    <Route path="/main/dashboard" component={Dashboard} />
    <Route path="/main/banking" component={BankingRoutes} />
    <Route path="/main/employees" component={EmployeeRoutes} />
    <Route path="/main/accountant" component={AccountantRoutes} />
    <Route path="/main/expenses" component={ExpenseRoutes} />
    <Route path="/main/vendors" component={VendorRoutes} />
    <Route path="/main/customers" component={CustomerRoutes} />
    <Route path="/main/reports" component={ReportRoutes} />
    <Route path="/main/settings" component={SettingsRoutes} />
    <Route path="/main/inventory" component={InventoryRoutes} />
    <Route path="/main/projects" component={ProjectsRoutes} />
    <Route path="/main/pos" component={PosRoutes} />
    <Route path="/main/crm" component={CrmRoutes} />
    <Route path="/main/bank-statements" component={BankStatementsRoutes} />
    <Route path="/main/analytics" component={AnalyticsDashboard} />
    <Route path="/main/documents" component={DocumentCenter} />
    <Route path="/main/approvals/center" component={ApprovalsCenter} />
    <Route path="/main/assistant" component={Assistant} />
  </Switch>
);

export default Main;
