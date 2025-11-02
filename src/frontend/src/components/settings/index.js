import React from 'react';
import { Route, Switch } from 'react-router-dom';
import Language from './Language';
import Theme from './Theme';
import Preferences from './Preferences';

const SettingsRoutes = ({ match }) => {
  return (
    <Switch>
      <Route path={`${match.path}/language`} component={Language} />
      <Route path={`${match.path}/theme`} component={Theme} />
      <Route path={`${match.path}/preferences`} component={Preferences} />
    </Switch>
  );
};

export default SettingsRoutes;