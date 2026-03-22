import React from 'react';
import { Route, Switch } from 'react-router-dom';
import Leads from './pages/Leads';
import Activities from './pages/Activities';

const CrmRoutes = ({ match }) => {
  return (
    <Switch>
      <Route path={`${match.path}/leads`} component={Leads} />
      <Route path={`${match.path}/activities`} component={Activities} />
    </Switch>
  );
};

export default CrmRoutes;


