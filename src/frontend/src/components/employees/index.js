import React from 'react';
import { Route, Switch } from 'react-router-dom';
import EmployeeCenter from './EmployeeCenter';
import EmployeeList from './EmployeeList';
import RunPayroll from './RunPayroll';
import TaxFiling from './TaxFiling';
import Payslips from './Payslips';

const EmployeeRoutes = ({ match }) => {
  return (
    <Switch>
      <Route path={`${match.path}/center`} component={EmployeeCenter} />
      <Route path={`${match.path}/list`} component={EmployeeList} />
      <Route path={`${match.path}/payroll`} component={RunPayroll} />
      <Route path={`${match.path}/tax-filing`} component={TaxFiling} />
      <Route path={`${match.path}/payslips`} component={Payslips} />
    </Switch>
  );
};

export default EmployeeRoutes;