import React from "react";
import {Redirect, Route, Switch} from "react-router-dom";

import asyncComponent from "util/asyncComponent";


const Details = ({match}) => (
  <Switch>
    <Redirect exact from={`${match.url}/`} to={`${match.url}/home`}/>
    <Route path={`${match.url}/policyholder/:id`} component={asyncComponent(() => import('./Policyholder'))}/>
     <Route path={`${match.url}/claim/:id`} component={asyncComponent(() => import('./Claim'))}/>
    <Route path={`${match.url}/profile`} component={asyncComponent(() => import('./Profile'))}/>
    <Route path={`${match.url}/wall`} component={asyncComponent(() => import('./Wall'))}/>
  </Switch>
);

export default Details;
