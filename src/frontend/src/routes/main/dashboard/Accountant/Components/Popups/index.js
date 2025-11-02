// Popup modals for the modules with "Open" except Money In and Money Out
import React, { useState } from "react";
import { Modal, Form, Input, Button, Select, DatePicker, Table } from "antd";
import ChartOfAccounts from "./ChartOfAccounts";
import TransactionsCenter from "./TransactionsCenter";
import ReconcileAndJournal from "./ReconcileAndJournal";
import GeneralLedger from "./GeneralLedger";
import ManageFixedAssets from "./ManageFixedAssets";

const { Option } = Select;

// --- Chart of Accounts Modal ---
export const ChartOfAccountsModal = ({ visible, onClose }) => {
  return (
    <Modal
      title="Chart of Accounts"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1000}
    >
   <ChartOfAccounts/>
    </Modal>
  );
};

// --- Fixed Assets List Modal ---
export const FixedAssetsModal = ({ visible, onClose }) => {
  return (
    <Modal
      title="Fixed Assets List"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={800}
    >
      <ManageFixedAssets />
    </Modal>
  );
};

// --- Transactions Modal ---
export const TransactionsModal = ({ visible, onClose }) => {
  return (
    <Modal
      title="Transactions"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={650}
    >
   <TransactionsCenter/>
    </Modal>
  );
};

// --- Reconcile & Journal Modal ---
export const ReconcileModal = ({ visible, onClose }) => {
  return (
    <Modal
      title="Reconcile & Journal"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={700}
    >
      <ReconcileAndJournal/>
    </Modal>
  );
};

// --- General Ledger Modal ---
export const LedgerModal = ({ visible, onClose }) => {
  return (
    <Modal
      title="General Ledger"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={800}
    >
    <GeneralLedger/>
    </Modal>
  );
};

// --- Manage Fixed Assets Modal ---
export const AssetManagementModal = ({ visible, onClose }) => {
  return (
    <Modal
      title="Manage Fixed Assets"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={700}
    >
      <ManageFixedAssets/>
    </Modal>
  );
};
