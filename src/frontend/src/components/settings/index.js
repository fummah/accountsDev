import React from 'react';
import { Route, Switch } from 'react-router-dom';
import Language from './Language';
import Theme from './Theme';
import Preferences from './Preferences';
import ClosingDate from './ClosingDate';
import BackupExport from './BackupExport';
import Scheduler from './Scheduler';
import ApprovalPolicies from './ApprovalPolicies';
import PaymentGateways from './PaymentGateways';
import CloudSync from './CloudSync';
import PayrollSettings from './PayrollSettings';
import APIServer from './APIServer';
import SyncVPN from './SyncVPN';
import DatabaseShare from './DatabaseShare';
import CurrencySettings from './CurrencySettings';
import Accessibility from './Accessibility';

const SettingsRoutes = ({ match }) => {
  return (
    <Switch>
      <Route path={`${match.path}/language`} component={Language} />
      <Route path={`${match.path}/theme`} component={Theme} />
      <Route path={`${match.path}/preferences`} component={Preferences} />
      <Route path={`${match.path}/closing-date`} component={ClosingDate} />
      <Route path={`${match.path}/backup-export`} component={BackupExport} />
      <Route path={`${match.path}/scheduler`} component={Scheduler} />
      <Route path={`${match.path}/approval-policies`} component={ApprovalPolicies} />
      <Route path={`${match.path}/payment-gateways`} component={PaymentGateways} />
      <Route path={`${match.path}/cloud-sync`} component={CloudSync} />
      <Route path={`${match.path}/payroll`} component={PayrollSettings} />
      <Route path={`${match.path}/api`} component={APIServer} />
      <Route path={`${match.path}/sync-vpn`} component={SyncVPN} />
      <Route path={`${match.path}/database`} component={DatabaseShare} />
      <Route path={`${match.path}/currencies`} component={CurrencySettings} />
      <Route path={`${match.path}/accessibility`} component={Accessibility} />
    </Switch>
  );
};

export default SettingsRoutes;