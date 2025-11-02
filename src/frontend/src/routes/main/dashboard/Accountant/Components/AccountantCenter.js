
import { Card, Col, Row, Typography, Space, Divider } from "antd";
import {
  DollarCircleOutlined,
  MoneyCollectOutlined,
  BookOutlined,
  AppstoreOutlined,
  SwapOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import React, { useState, useEffect } from "react";
import {
  ChartOfAccountsModal,
  FixedAssetsModal,
  TransactionsModal,
  ReconcileModal,
  LedgerModal,
  AssetManagementModal,
} from "./Popups";

const { Title, Text } = Typography;

const AccountantCenter = () => {
  const [showChart, setShowChart] = useState(false);
  const [showFixedAssets, setShowFixedAssets] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const [showReconcile, setShowReconcile] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  const [showAssetMgmt, setShowAssetMgmt] = useState(false);

  // State for dynamic card data
  const [cardStats, setCardStats] = useState({
    moneyIn: { total: 0, overdue: 0, open: 0 },
    moneyOut: { total: 0, overdue: 0, open: 0 },
    chartAccounts: 0,
    fixedAssets: 0,
    transactions: 0,
    reconcile: 0,
    ledger: 0,
    manageAssets: 0,
  });

  useEffect(() => {
    async function fetchStats() {
      // Money In/Out
      let dashboard = await window.electronAPI.getDashboardSummary();
      let moneyIn = { total: 0, overdue: 0, open: 0 };
      let moneyOut = { total: 0, overdue: 0, open: 0 };
      if (dashboard && dashboard.performance) {
        moneyIn.total = Number(dashboard.performance.moneyIn) || 0;
        moneyOut.total = Number(dashboard.performance.moneyOut) || 0;
        moneyIn.overdue = Number(dashboard.performance.overdueInvoices) || 0;
        moneyIn.open = Number(dashboard.performance.openInvoices) || 0;
        moneyOut.overdue = Number(dashboard.performance.overdueBills) || 0;
        moneyOut.open = Number(dashboard.performance.openBills) || 0;
      }
      // Chart of Accounts
      let chartAccounts = 0;
      try {
        const accounts = await window.electronAPI.getChartOfAccounts();
        chartAccounts = Array.isArray(accounts) ? accounts.length : 0;
      } catch {}
      // Fixed Assets
      let fixedAssets = 0;
      try {
        const assets = await window.electronAPI.getFixedAssets();
        fixedAssets = Array.isArray(assets) ? assets.length : 0;
      } catch {}
      // Transactions
      let transactions = 0;
      try {
        const txs = await window.electronAPI.getTransactions();
        transactions = Array.isArray(txs) ? txs.length : 0;
      } catch {}
      // Reconcile & Journal
      let reconcile = 0;
      try {
        const journal = await window.electronAPI.getJournal();
        reconcile = Array.isArray(journal) ? journal.length : 0;
      } catch {}
      // General Ledger
      let ledger = 0;
      try {
        const ledgerEntries = await window.electronAPI.getLedger();
        ledger = Array.isArray(ledgerEntries) ? ledgerEntries.length : 0;
      } catch {}
      // Manage Fixed Assets (depreciation count = fixed assets count for now)
      let manageAssets = fixedAssets;
      setCardStats({
        moneyIn,
        moneyOut,
        chartAccounts,
        fixedAssets,
        transactions,
        reconcile,
        ledger,
        manageAssets,
      });
    }
    fetchStats();
  }, []);

  const cardData = [
    {
      title: "Money In",
      description: "This Month",
      icon: <DollarCircleOutlined style={{ fontSize: 30, color: "#52c41a" }} />,
      stat1: `Overdue invoices (${cardStats.moneyIn.overdue})`,
      stat2: `Open invoices (${cardStats.moneyIn.open})`,
      total: `R${cardStats.moneyIn.total.toFixed(2)}`,
      links: [{ label: "View", path: "/dashboard/home-dash" }],
    },
    {
      title: "Money Out",
      description: "This Month",
      icon: <MoneyCollectOutlined style={{ fontSize: 30, color: "#f5222d" }} />,
      stat1: `Overdue bills (${cardStats.moneyOut.overdue})`,
      stat2: `Open bills (${cardStats.moneyOut.open})`,
      total: `R${cardStats.moneyOut.total.toFixed(2)}`,
      links: [
        { label: "View paid bills", path: "/dashboard/home-dash" },
      ],
    },
    {
      title: "Chart of Accounts",
      description: "Financial structure",
      icon: <BookOutlined style={{ fontSize: 30, color: "#1890ff" }} />,
      total: `${cardStats.chartAccounts}`,
      links: [{ label: "Open", key: "chart" }],
    },
    {
      title: "Fixed Assets List",
      description: "Track asset items",
      icon: <AppstoreOutlined style={{ fontSize: 30, color: "#9254de" }} />,
      total: `${cardStats.fixedAssets}`,
      links: [{ label: "Open", key: "fixedAssets" }],
    },
    {
      title: "Transactions",
      description: "Enter / Void",
      icon: <SwapOutlined style={{ fontSize: 30, color: "#fa8c16" }} />,
      total: `${cardStats.transactions}`,
      links: [{ label: "Open", key: "transactions" }],
    },
    {
      title: "Reconcile & Journal",
      description: "Bank + Entries",
      icon: <FileSearchOutlined style={{ fontSize: 30, color: "#fadb14" }} />,
      total: `${cardStats.reconcile}`,
      links: [{ label: "Open", key: "reconcile" }],
    },
    {
      title: "General Ledger",
      description: "Ledger View",
      icon: <FileTextOutlined style={{ fontSize: 30, color: "#eb2f96" }} />,
      total: `${cardStats.ledger}`,
      links: [{ label: "Open", key: "ledger" }],
    },
    {
      title: "Manage Fixed Assets",
      description: "Depreciation",
      icon: <ToolOutlined style={{ fontSize: 30, color: "#595959" }} />,
      total: `${cardStats.manageAssets}`,
      links: [{ label: "Open", key: "assetMgmt" }],
    },
  ];

    const handleOpen = (key) => {
      switch (key) {
        case "chart":
          setShowChart(true);
          break;
        case "fixedAssets":
          setShowFixedAssets(true);
          break;
        case "transactions":
          setShowTransactions(true);
          break;
        case "reconcile":
          setShowReconcile(true);
          break;
        case "ledger":
          setShowLedger(true);
          break;
        case "assetMgmt":
          setShowAssetMgmt(true);
          break;
        default:
          break;
      }
    };

    return (
      <div style={{ padding: 24 }}>
        <Title level={2}>🧾 Accountant Center</Title>
        <Text type="secondary">Central dashboard for core financial tasks</Text>

        <Divider />

        <Row gutter={[24, 24]}>
          {cardData.map((item, idx) => (
            <Col xs={24} sm={12} lg={8} xl={6} key={idx}>
              <Card
                hoverable
                bordered
                title={
                  <Space size="middle">
                    {item.icon}
                    <span>{item.title}</span>
                  </Space>
                }
                extra={<Text strong>{item.total}</Text>}
              >
                <Text type="secondary">{item.description}</Text>
                <Divider />
                {item.stat1 && <p>{item.stat1}</p>}
                {item.stat2 && <p>{item.stat2}</p>}
                <Space direction="vertical">
                  {item.links.map((link, i) => (
                    <a key={i} onClick={() => handleOpen(link.key)}>{link.label}</a>
                  ))}
                </Space>
              </Card>
            </Col>
          ))}
        </Row>

        {/* Popup Modals */}
        <ChartOfAccountsModal visible={showChart} onClose={() => setShowChart(false)} />
        <FixedAssetsModal visible={showFixedAssets} onClose={() => setShowFixedAssets(false)} />
        <TransactionsModal visible={showTransactions} onClose={() => setShowTransactions(false)} />
        <ReconcileModal visible={showReconcile} onClose={() => setShowReconcile(false)} />
        <LedgerModal visible={showLedger} onClose={() => setShowLedger(false)} />
        <AssetManagementModal visible={showAssetMgmt} onClose={() => setShowAssetMgmt(false)} />
      </div>
    );
  };

  export default AccountantCenter;