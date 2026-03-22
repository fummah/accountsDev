import React from 'react';
import { Route, Switch } from 'react-router-dom';
import Session from './pages/Session';
import NewSale from './pages/NewSale';
import Sales from './pages/Sales';

const PosRoutes = ({ match }) => {
  return (
    <Switch>
      <Route path={`${match.path}/session`} component={Session} />
      <Route path={`${match.path}/sale`} component={NewSale} />
      <Route path={`${match.path}/sales`} component={Sales} />
    </Switch>
  );
};

export default PosRoutes;


