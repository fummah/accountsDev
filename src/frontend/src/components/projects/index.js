import React from 'react';
import { Route, Switch } from 'react-router-dom';
import ProjectsCenter from './pages/ProjectsCenter';
import Timesheets from './pages/Timesheets';
import Profitability from './pages/Profitability';
import Gantt from './pages/Gantt';

const ProjectsRoutes = ({ match }) => {
  return (
    <Switch>
      <Route path={`${match.path}/center`} component={ProjectsCenter} />
      <Route path={`${match.path}/timesheets`} component={Timesheets} />
      <Route path={`${match.path}/profitability`} component={Profitability} />
      <Route path={`${match.path}/gantt`} component={Gantt} />
    </Switch>
  );
};

export default ProjectsRoutes;


