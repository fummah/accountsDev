import React from 'react';
import { Route, Switch } from 'react-router-dom';
import CreditCardCharges from './CreditCardCharges';
import CategoryManagement from './CategoryManagement';
import SupplierVendorList from '../vendors/SupplierVendorList';

const ExpenseRoutes = ({ match }) => {
  return (
    <Switch>
      <Route path={`${match.path}/credit-cards`} component={CreditCardCharges} />
      <Route path={`${match.path}/categories`} component={CategoryManagement} />
      <Route path={`${match.path}/suppliers`} component={SupplierVendorList} />
    </Switch>
  );
};

export default ExpenseRoutes;