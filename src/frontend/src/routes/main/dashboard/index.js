import React from "react";
import {Redirect, Route, Switch} from "react-router-dom";
import asyncComponent from "util/asyncComponent";

const Dashboard = ({match}) => (
  <Switch>
    <Redirect exact from="/main/dashboard" to="/main/dashboard/home"/>    
    <Route exact path="/main/dashboard/home" component={asyncComponent(() => import('./Flow/index'))}/>
    <Route exact path="/main/dashboard/home-dash" component={asyncComponent(() => import('./Home/index'))}/>
    <Route exact path="/main/dashboard/flow" component={asyncComponent(() => import('./Flow/index'))}/>
    <Route exact path="/main/dashboard/accountant" component={asyncComponent(() => import('./Accountant/index'))}/>
    <Route exact path="/main/dashboard/customer" component={asyncComponent(() => import('./Customer/index'))}/>
    <Route exact path="/main/dashboard/company" component={asyncComponent(() => import('./Company/index'))}/>
  </Switch>
);

export default Dashboard;
