import React from "react";
import {Route, Switch} from "react-router-dom";
import Sales from "./Sales";
import Expenses from "./Expenses";
import Transactions from "./Transactions";
import CustomersLeads from "./CustomersLeads";
import Employees from "./Employees";
import Reports from "./Reports";
import Vat from "./Vat";
import Profile from "./Profile";


const Inner = ({match}) => (
  <Switch>
    <Route path={`${match.url}/sales`} component={Sales}/>
    <Route path={`${match.url}/expenses`} component={Expenses}/>
    <Route path={`${match.url}/transactions`} component={Transactions}/>
    <Route path={`${match.url}/customersleads`} component={CustomersLeads}/>
    <Route path={`${match.url}/employees`} component={Employees}/>
    <Route path={`${match.url}/reports`} component={Reports}/>
    <Route path={`${match.url}/vat`} component={Vat}/>
    <Route path={`${match.url}/profile`} component={Profile}/>
    
  </Switch>
);

export default Inner;
