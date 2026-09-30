import React from 'react';
import { Route, Switch } from 'react-router-dom';
import Warehouses from './pages/Warehouses';
import Stock from './pages/Stock';
import Dashboard from './pages/Dashboard';
import ReorderNeeded from './pages/ReorderNeeded';
import MovementReport from './pages/MovementReport';
import ItemProfitability from './pages/ItemProfitability';
import BOM from './pages/BOM';
import Serials from './pages/Serials';
import Barcodes from './pages/Barcodes';
import Adjustments from './pages/Adjustments';
import Alerts from './pages/Alerts';
import UnifiedItemList from '../shared/UnifiedItemList';
import PricingRules from './PricingRules';
import PickPackShip from './PickPackShip';

const InventoryRoutes = ({ match }) => {
  return (
    <Switch>
      <Route path={`${match.path}/dashboard`} component={Dashboard} />
      <Route path={`${match.path}/reorder`} component={ReorderNeeded} />
      <Route path={`${match.path}/movement-report`} component={MovementReport} />
      <Route path={`${match.path}/profitability`} component={ItemProfitability} />
      <Route path={`${match.path}/items`} component={UnifiedItemList} />
      <Route path={`${match.path}/warehouses`} component={Warehouses} />
      <Route path={`${match.path}/stock`} component={Stock} />
      <Route path={`${match.path}/bom`} component={BOM} />
      <Route path={`${match.path}/serials`} component={Serials} />
      <Route path={`${match.path}/barcodes`} component={Barcodes} />
      <Route path={`${match.path}/adjustments`} component={Adjustments} />
      <Route path={`${match.path}/alerts`} component={Alerts} />
      <Route path={`${match.path}/pricing-rules`} component={PricingRules} />
      <Route path={`${match.path}/pick-pack-ship`} component={PickPackShip} />
    </Switch>
  );
};

export default InventoryRoutes;


