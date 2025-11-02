import React from 'react';
import { Route, Switch } from 'react-router-dom';
import VendorCenter from './VendorCenter';
import BillTracker from './bills/BillTracker';
import EnterBill from './bills/EnterBill';
import PayBills from './bills/PayBills';
import ItemList from './ItemList';
import VendorList from './VendorList';
import VendorDetails from './VendorDetails';

const VendorRoutes = ({ match }) => {
  return (
    <Switch>
      <Route exact path={`${match.path}/center`} component={VendorCenter} />
      <Route exact path={`${match.path}/list`} component={VendorList} />
      <Route exact path={`${match.path}/details/:id`} component={VendorDetails} />
      <Route exact path={`${match.path}/bills/tracker`} component={BillTracker} />
      <Route exact path={`${match.path}/bills/new`} component={EnterBill} />
      <Route exact path={`${match.path}/bills/edit/:id`} component={EnterBill} />
      <Route exact path={`${match.path}/bills/pay`} component={PayBills} />
      <Route exact path={`${match.path}/items`} component={ItemList} />
    </Switch>
  );
};

export default VendorRoutes;