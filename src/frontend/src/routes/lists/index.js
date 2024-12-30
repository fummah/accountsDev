import React from "react";
import {Redirect, Route, Switch} from "react-router-dom";

import asyncComponent from "util/asyncComponent";


const Lists = ({match}) => (
  <Switch>
    <Redirect exact from={`${match.url}/`} to={`${match.url}/home`}/>
    <Route path={`${match.url}/policyholders`} component={asyncComponent(() => import('./Policyholders'))}/>
    <Route path={`${match.url}/claims`} component={asyncComponent(() => import('./Claims'))}/>
    <Route path={`${match.url}/users`} component={asyncComponent(() => import('./Users'))}/>
  </Switch>
);

export default Lists;
