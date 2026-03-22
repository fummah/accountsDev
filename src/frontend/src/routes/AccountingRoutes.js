import React from 'react';
import { Routes, Route } from 'react-router-dom';

// Accountant Components
import ChartOfAccounts from '../components/accountant/ChartOfAccounts';
import FixedAssets from '../components/accountant/FixedAssets';
import Transaction from '../components/accountant/Transaction';
import JournalEntries from '../components/accountant/JournalEntries';
import GeneralLedger from '../components/accountant/GeneralLedger';
import Reconcile from '../components/accountant/Reconcile';
import TrialBalance from '../components/accountant/TrialBalance';
import ConsolidatedTrialBalance from '../components/accountant/ConsolidatedTrialBalance';
import EntitiesManager from '../components/accountant/EntitiesManager';
import DimensionsManager from '../components/accountant/DimensionsManager';
import TrialBalanceAdvanced from '../components/accountant/TrialBalanceAdvanced';
import COAImportExport from '../components/accountant/COAImportExport';
import QBImport from '../components/accountant/QBImport';
import ClosingDate from '../components/accountant/ClosingDate';

// Banking Components
import MakeDeposits from '../components/banking/MakeDeposits';
import TransferFunds from '../components/banking/TransferFunds';
import BankReconciliation from '../components/banking/BankReconciliation';

// Reports Components
import ProfitLoss from '../components/reports/ProfitLoss';
import CashFlow from '../components/reports/CashFlow';
import BalanceSheet from '../components/reports/BalanceSheet';
import JobCosting from '../components/reports/JobCosting';
import ProjectProfitability from '../components/reports/ProjectProfitability';
import TimeTracking from '../components/reports/TimeTracking';
import ReportBuilder from '../components/reports/Builder';

const AccountingRoutes = () => {
  return (
    <Routes>
      {/* Accountant Routes */}
      <Route path="/main/accountant/chart-of-accounts" element={<ChartOfAccounts />} />
      <Route path="/main/accountant/fixed-assets" element={<FixedAssets />} />
      <Route path="/main/accountant/enter-transaction" element={<Transaction />} />
      <Route path="/main/accountant/journal-entries" element={<JournalEntries />} />
      <Route path="/main/accountant/general-ledger" element={<GeneralLedger />} />
      <Route path="/main/accountant/reconcile" element={<Reconcile />} />
      <Route path="/main/accountant/trial-balance" element={<TrialBalance />} />
      <Route path="/main/accountant/consolidated-trial-balance" element={<ConsolidatedTrialBalance />} />
      <Route path="/main/accountant/advanced-trial-balance" element={<TrialBalanceAdvanced />} />
      <Route path="/main/accountant/entities" element={<EntitiesManager />} />
      <Route path="/main/accountant/dimensions" element={<DimensionsManager />} />
      <Route path="/main/accountant/coa-import-export" element={<COAImportExport />} />
      <Route path="/main/accountant/qb-import" element={<QBImport />} />
      <Route path="/main/accountant/closing-date" element={<ClosingDate />} />

      {/* Banking Routes */}
      <Route path="/main/banking/deposits" element={<MakeDeposits />} />
      <Route path="/main/banking/transfers" element={<TransferFunds />} />
      <Route path="/main/banking/reconcile" element={<BankReconciliation />} />

      {/* Reports Routes */}
      <Route path="/main/reports/profit-loss" element={<ProfitLoss />} />
      <Route path="/main/reports/cash-flow" element={<CashFlow />} />
      <Route path="/main/reports/balance-sheet" element={<BalanceSheet />} />
      <Route path="/main/reports/job-costing" element={<JobCosting />} />
      <Route path="/main/reports/project-profitability" element={<ProjectProfitability />} />
      <Route path="/main/reports/time-tracking" element={<TimeTracking />} />
      <Route path="/main/reports/builder" element={<ReportBuilder />} />
    </Routes>
  );
};

export default AccountingRoutes;