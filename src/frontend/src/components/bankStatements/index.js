import React from 'react';
import { Route, Switch, Redirect } from 'react-router-dom';
import UploadParse from './pages/UploadParse';
import Statements from './pages/Statements';

const BankStatementsRoutes = ({ match }) => {
  return (
    <Switch>
      <Route path={`${match.path}/upload`} component={UploadParse} />
      <Route path={`${match.path}/list`} component={Statements} />
      <Redirect exact from={match.path} to={`${match.path}/list`} />
    </Switch>
  );
};

export default BankStatementsRoutes;


