import React from "react";
import {Redirect, Route, Switch} from "react-router-dom";
import asyncComponent from "util/asyncComponent";

const Dashboard = ({match}) => (
  <Switch>
    <Redirect exact from={`${match.url}/`} to={`${match.url}/home`}/>
    <Route path={`${match.url}/home`} component={asyncComponent(() => import('./Home/index'))}/>
  </Switch>
);

export default Dashboard;
