import React from 'react';
import { Route, Switch, Redirect } from 'react-router-dom';
import VendorCenter from './VendorCenter';
import BillTracker from './BillTracker';
import EnterBill from './bills/EnterBill';
import PayBills from './bills/PayBills';
import SupplierVendorList from './SupplierVendorList';
import VendorDetails from './VendorDetails';
import VendorCredits from './VendorCredits';
import UnifiedItemList from '../shared/UnifiedItemList';
import ExpenseTracking from '../expenses/ExpenseTracking';

const VendorRoutes = ({ match }) => {
  return (
    <Switch>
      <Route exact path={`${match.path}/center`} component={VendorCenter} />
      <Route exact path={`${match.path}/list`} component={SupplierVendorList} />
      <Route exact path={`${match.path}/details/:id`} component={VendorDetails} />
      <Route exact path={`${match.path}/bills/tracker`} component={BillTracker} />
      <Route exact path={`${match.path}/bills/enter`} component={EnterBill} />
      <Route exact path={`${match.path}/bills/new`} component={EnterBill} />
      <Route exact path={`${match.path}/bills/edit/:id`} component={EnterBill} />
      <Redirect exact from={`${match.path}/bills/pay`} to={`${match.path}/bills/tracker`} />
      <Route exact path={`${match.path}/bills/expenses`} component={ExpenseTracking} />
      <Route exact path={`${match.path}/credits`} component={VendorCredits} />
      <Route exact path={`${match.path}/items`} component={UnifiedItemList} />
    </Switch>
  );
};

export default VendorRoutes;