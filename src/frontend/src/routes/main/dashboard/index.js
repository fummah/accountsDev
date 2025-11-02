import React from "react";
import {Redirect, Route, Switch} from "react-router-dom";
import asyncComponent from "util/asyncComponent";

const Dashboard = ({match}) => (
  <Switch>
    <Redirect exact from={`${match.url}/`} to={`${match.url}/home`}/>    
    <Route path={`${match.url}/home`} component={asyncComponent(() => import('./Flow/index'))}/>
    <Route path={`${match.url}/home-dash`} component={asyncComponent(() => import('./Home/index'))}/>
    <Route path={`${match.url}/flow`} component={asyncComponent(() => import('./Flow/index'))}/>
    <Route path={`${match.url}/accountant`} component={asyncComponent(() => import('./Accountant/index'))}/>
    <Route path={`${match.url}/customer`} component={asyncComponent(() => import('./Customer/index'))}/>
    <Route path={`${match.url}/company`} component={asyncComponent(() => import('./Company/index'))}/>
  </Switch>
);

export default Dashboard;
