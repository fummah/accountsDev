import React from 'react';
import { Route, Switch } from 'react-router-dom';
import Warehouses from './pages/Warehouses';
import Stock from './pages/Stock';
import BOM from './pages/BOM';
import Serials from './pages/Serials';
import Barcodes from './pages/Barcodes';
import Adjustments from './pages/Adjustments';
import Alerts from './pages/Alerts';
import ItemList from '../customers/ItemList';

const InventoryRoutes = ({ match }) => {
  return (
    <Switch>
      <Route path={`${match.path}/items`} component={ItemList} />
      <Route path={`${match.path}/warehouses`} component={Warehouses} />
      <Route path={`${match.path}/stock`} component={Stock} />
      <Route path={`${match.path}/bom`} component={BOM} />
      <Route path={`${match.path}/serials`} component={Serials} />
      <Route path={`${match.path}/barcodes`} component={Barcodes} />
      <Route path={`${match.path}/adjustments`} component={Adjustments} />
      <Route path={`${match.path}/alerts`} component={Alerts} />
    </Switch>
  );
};

export default InventoryRoutes;


