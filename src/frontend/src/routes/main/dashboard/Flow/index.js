import React, { useState, useEffect } from "react";
import { useHistory } from "react-router-dom";
import { Row, Col, Card, Spin, Button, Steps, Modal, Form, Input, Select, message, Divider } from "antd";
import {
  BankOutlined, DollarOutlined, CreditCardOutlined, WalletOutlined,
  FundOutlined, RiseOutlined, FallOutlined, PieChartOutlined,
  FileTextOutlined, CheckSquareOutlined, FormOutlined,
  ReconciliationOutlined, SwapOutlined,
  BarChartOutlined, AppstoreOutlined, CalendarOutlined,
  ProfileOutlined, RocketOutlined, CheckCircleOutlined
} from "@ant-design/icons";
import Auxiliary from "util/Auxiliary";
import Xarrow from "react-xarrows";

const { Step } = Steps;
const { Option } = Select;

/* ──── helpers ──── */
const fmt = (v) => {
  const n = Number(v || 0);
  const abs = Math.abs(n);
  return (n < 0 ? '-' : '') + '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const BALANCE_CATEGORIES = [
  { key: 'bank',       label: 'Bank Accounts',        types: ['Bank'],                     icon: <BankOutlined />,       color: '#1890ff' },
  { key: 'ar',         label: 'Accounts Receivable',   types: ['Accounts Receivable'],       icon: <RiseOutlined />,      color: '#52c41a' },
  { key: 'ap',         label: 'Accounts Payable',      types: ['Accounts Payable'],          icon: <FallOutlined />,      color: '#fa541c' },
  { key: 'cc',         label: 'Credit Cards',          types: ['Credit Card'],               icon: <CreditCardOutlined />,color: '#722ed1' },
  { key: 'loans',      label: 'Loans',                 types: ['Other Current Liability','Long Term Liability','Loan'], icon: <WalletOutlined />,    color: '#eb2f96' },
  { key: 'revenue',    label: 'Revenue',               types: ['Income','Other Income'],     icon: <FundOutlined />,      color: '#13c2c2' },
  { key: 'expenses',   label: 'Expenses',              types: ['Expense','Other Expense','Cost of Goods Sold'], icon: <PieChartOutlined />,  color: '#faad14' },
  { key: 'equity',     label: 'Equity',                types: ['Equity'],                    icon: <DollarOutlined />,    color: '#2f54eb' },
];

/* ──── Main Component ──── */
const Flow = () => {
  const history = useHistory();
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState({});
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardStep, setOnboardStep] = useState(0);
  const [onboardForm] = Form.useForm();

  const P = (p) => (process.env.PUBLIC_URL + p);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const accounts = await window.electronAPI?.getChartOfAccounts?.() || [];
      const acctList = Array.isArray(accounts) ? accounts : [];
      // Aggregate balances by category
      const bals = {};
      BALANCE_CATEGORIES.forEach(cat => {
        const matching = acctList.filter(a =>
          cat.types.some(t => (a.accountType || a.type || '').toLowerCase() === t.toLowerCase())
        );
        bals[cat.key] = matching.reduce((sum, a) => sum + Number(a.balance || 0), 0);
      });
      setBalances(bals);

      // Check if onboarding needed
      const comp = await window.electronAPI?.getCompany?.();
      const wizStatus = await window.electronAPI?.setupWizardStatus?.();
      if ((!comp?.name) || (wizStatus && !wizStatus.completed)) {
        setShowOnboarding(true);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleOnboardFinish = async () => {
    try {
      const vals = onboardForm.getFieldsValue(true);
      if (vals.companyName) {
        await window.electronAPI?.saveCompany?.({ name: vals.companyName, industry: vals.industry });
      }
      if (vals.baseCurrency) {
        await window.electronAPI?.currencySetBase?.(vals.baseCurrency);
      }
      setShowOnboarding(false);
      message.success('Setup complete! Welcome aboard.');
      loadData();
    } catch (e) { message.error(e.message); }
  };

  /* ──── Layout constants ──── */
  const CELL_W = 175;
  const CELL_H = 130;

  /* ──── Workflow nodes ──── */
  const nodes = [
    // Row 0
    { id: "n-products",      icon: P("/assets/icons/products.svg"),  label: "Products",         col: 0, row: 0, route: "/inner/sales?tab=10" },
    { id: "n-expenses",      icon: P("/assets/icons/expenses.svg"),  label: "Expenses",         col: 1, row: 0, route: "/inner/expenses" },
    { id: "n-paybills",      icon: P("/assets/icons/pay.svg"),       label: "Pay Bills",        col: 2, row: 0, route: "/inner/expenses" },
    { id: "n-analysis",      icon: P("/assets/icons/analysis.svg"),  label: "Analysis",         col: 3, row: 0, route: "/main/accountant/reports" },
    // Row 1
    { id: "n-createsales",   icon: P("/assets/icons/track.svg"),     label: "Create\nSales",    col: 1, row: 1, route: "/inner/sales?tab=1" },
    { id: "n-cashreceipts",  icon: P("/assets/icons/cash.svg"),      label: "Cash\nReceipts",   col: 2, row: 1, route: "/inner/sales?tab=6" },
    { id: "n-reports",       icon: P("/assets/icons/statement.svg"), label: "Reports",          col: 3, row: 1, route: "/main/accountant/reports" },
    // Row 2
    { id: "n-quotes",        icon: P("/assets/icons/quotes.svg"),    label: "Quotes",           col: 0, row: 2, route: "/inner/sales?tab=3" },
    { id: "n-createinvoice", icon: P("/assets/icons/invoices.svg"),  label: "Create\nInvoice",  col: 1, row: 2, route: "/inner/sales?tab=2" },
    { id: "n-payments",      icon: P("/assets/icons/payments.svg"),  label: "Payments",         col: 2, row: 2, route: "/inner/sales?tab=5" },
    { id: "n-deposits",      icon: P("/assets/icons/deposit.svg"),   label: "Deposits",         col: 3, row: 2, route: "/main/banking/deposits" },
    // Row 3
    { id: "n-createemp",     icon: P("/assets/icons/employee.svg"),  label: "Create\nEmployee", col: 1, row: 3, route: "/main/employees/center" },
    { id: "n-payroll",       icon: P("/assets/icons/payroll.svg"),   label: "Payroll",          col: 2, row: 3, route: "/main/employees/payroll" },
    { id: "n-reconcile",     icon: P("/assets/icons/refund.svg"),    label: "Reconcile",        col: 3, row: 3, route: "/main/banking/reconcile" },
  ];

  const arrows = [
    // Horizontal — row 0
    ["n-products",      "n-expenses",      "h"],
    ["n-expenses",      "n-paybills",      "h"],
    ["n-paybills",      "n-analysis",      "h"],
    // Horizontal — row 1
    ["n-createsales",   "n-cashreceipts",  "h"],
    ["n-cashreceipts",  "n-reports",       "h"],
    // Horizontal — row 2
    ["n-quotes",        "n-createinvoice", "h"],
    ["n-createinvoice", "n-payments",      "h"],
    ["n-payments",      "n-deposits",      "h"],
    // Horizontal — row 3
    ["n-createemp",     "n-payroll",       "h"],
    ["n-payroll",       "n-reconcile",     "h"],
    // Vertical
    ["n-products",      "n-quotes",        "v"],
    ["n-createsales",   "n-createinvoice", "v"],
    ["n-cashreceipts",  "n-payments",      "v"],
    ["n-analysis",      "n-reports",       "v"],
    ["n-reports",       "n-deposits",      "v"],
    ["n-deposits",      "n-reconcile",     "v"],
  ];

  const GridNode = ({ id, icon, label, col, row, route }) => (
    <div
      id={id}
      onClick={() => history.push(route)}
      style={{
        position: "absolute",
        left: col * CELL_W + 30,
        top:  row * CELL_H + 28,
        width: 80,
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", cursor: "pointer",
        transition: "transform 0.15s", zIndex: 2,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.1)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      <div style={{ width: 52, height: 52, borderRadius: 10, background: "transparent",
        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 5 }}>
        <img src={icon} alt={label} style={{ width: 42, height: 42, objectFit: "contain" }} />
      </div>
      <span style={{ fontSize: 11, textAlign: "center", color: "#333", lineHeight: "14px",
        fontWeight: 500, whiteSpace: "pre-line" }}>{label}</span>
    </div>
  );

  const totalH = CELL_H * 4 + 20;
  const totalW = CELL_W * 4 + 60;

  /* ──── Quick action lists (QB right panel) ──── */
  const quickTop = [
    { icon: <AppstoreOutlined />,    label: "Chart of\nAccounts",  route: "/main/accountant/chart-of-accounts", color: "#1890ff" },
    { icon: <ProfileOutlined />,     label: "Items &\nServices",   route: "/inner/sales?tab=10",                color: "#fa8c16" },
    { icon: <CheckSquareOutlined />, label: "Order\nChecks",       route: "/main/accountant/check-printing",    color: "#2f54eb" },
    { icon: <CalendarOutlined />,    label: "Calendar",            route: "/main/employees/payroll",            color: "#13c2c2" },
  ];

  const quickBanking = [
    { id: "qa-record-deposits", icon: <ReconciliationOutlined />, label: "Record\nDeposits",            route: "/main/banking/deposits",          color: "#1890ff" },
    { id: "qa-reconcile",       icon: <SwapOutlined />,           label: "Reconcile",                   route: "/main/banking/reconcile",         color: "#13c2c2" },
    { id: "qa-write-checks",    icon: <FormOutlined />,           label: "Write\nChecks",               route: "/main/accountant/check-printing", color: "#2f54eb" },
    { id: "qa-check-register",  icon: <FileTextOutlined />,       label: "Check\nRegister",             route: "/main/accountant/general-ledger", color: "#722ed1" },
    { id: "qa-print-checks",    icon: <BarChartOutlined />,       label: "Print\nChecks",               route: "/main/accountant/check-printing", color: "#fa541c" },
    { id: "qa-cc-charges",      icon: <CreditCardOutlined />,     label: "Enter Credit\nCard Charges",  route: "/main/expenses/credit-cards",     color: "#eb2f96" },
  ];

  if (loading) {
    return <Auxiliary><div style={{ textAlign: "center", padding: 80 }}><Spin size="large" tip="Loading..." /></div></Auxiliary>;
  }

  return (
    <Auxiliary>
      {/* ──── Account Balances ──── */}
      <div style={{ marginBottom: 20 }}>
        <Row gutter={[12, 12]}>
          {BALANCE_CATEGORIES.map(cat => (
            <Col xl={3} lg={6} md={6} sm={12} xs={12} key={cat.key}>
              <Card
                size="small"
                hoverable
                style={{ borderTop: `3px solid ${cat.color}`, borderRadius: 6 }}
                bodyStyle={{ padding: "12px 14px" }}
                onClick={() => history.push("/main/accountant/chart-of-accounts")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 18, color: cat.color }}>{cat.icon}</span>
                  <span style={{ fontSize: 11, color: "#888", fontWeight: 500 }}>{cat.label}</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: (balances[cat.key] || 0) < 0 ? '#f5222d' : '#262626' }}>
                  {fmt(balances[cat.key])}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      {/* ──── Workflow Diagram + Quick Actions ──── */}
      <Row gutter={16}>
        {/* Left: QB-style workflow diagram */}
        <Col xl={17} lg={16} md={24} sm={24} xs={24}>
          <Card bodyStyle={{ padding: 16, overflowX: "auto" }} style={{ borderRadius: 8 }}>
            <div style={{ position: "relative", width: totalW, height: totalH, minHeight: 560 }}>

              {/* ── Workflow nodes ── */}
              {nodes.map(n => <GridNode key={n.id} {...n} />)}

              {/* ── Workflow arrows ── */}
              {arrows.map(([s, e, dir], i) => (
                <Xarrow key={i} start={s} end={e}
                  path="straight"
                  startAnchor={dir === "h" ? "right" : "bottom"}
                  endAnchor={dir === "h" ? "left" : "top"}
                  strokeWidth={1.8} headSize={6}
                  color="#4096ff"
                />
              ))}
            </div>
          </Card>
        </Col>

        {/* ── Cross-panel arrow: Reports → Record Deposits (BANKING) ── */}
        <Xarrow
          start="n-reports"
          end="qa-record-deposits"
          startAnchor="right"
          endAnchor="left"
          strokeWidth={2} headSize={7}
          color="#1890ff"
          dashness={{ animation: 1.2, strokeLen: 10, nonStrokeLen: 5 }}
        />

        {/* Right: QB-style quick access panel */}
        <Col xl={7} lg={8} md={24} sm={24} xs={24}>
          {/* Top section — no title (matches QB) */}
          <Card size="small" bodyStyle={{ padding: 8 }}
            style={{ borderRadius: 8, marginBottom: 12, border: "1px solid #e8e8e8" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 2 }}>
              {quickTop.map((qa, i) => (
                <div key={i} onClick={() => history.push(qa.route)}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", padding: "16px 4px", cursor: "pointer",
                    borderRadius: 6, transition: "background 0.15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#f0f7ff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ fontSize: 26, color: qa.color, marginBottom: 5 }}>{qa.icon}</span>
                  <span style={{ fontSize: 11, textAlign: "center", whiteSpace: "pre-line",
                    color: "#333", lineHeight: "14px", fontWeight: 500 }}>{qa.label}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* BANKING section */}
          <Card size="small"
            title={
              <div style={{ textAlign: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#1890ff",
                  letterSpacing: 1.5, borderBottom: "2px solid #1890ff", paddingBottom: 2 }}>
                  BANKING
                </span>
              </div>
            }
            bodyStyle={{ padding: 8 }}
            style={{ borderRadius: 8, border: "1px solid #bae0ff" }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 2 }}>
              {quickBanking.map((qa, i) => (
                <div key={i} id={qa.id} onClick={() => history.push(qa.route)}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", padding: "12px 4px", cursor: "pointer",
                    borderRadius: 6, transition: "background 0.15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#e6f7ff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ fontSize: 24, color: qa.color, marginBottom: 4 }}>{qa.icon}</span>
                  <span style={{ fontSize: 11, textAlign: "center", whiteSpace: "pre-line",
                    color: "#333", lineHeight: "14px", fontWeight: 500 }}>{qa.label}</span>
                </div>
              ))}
            </div>
          </Card>
        </Col>
      </Row>

      {/* ──── Guided Onboarding Modal ──── */}
      <Modal
        title={<span><RocketOutlined style={{ color: '#1890ff', marginRight: 8 }} />Welcome — Let's Get You Started</span>}
        visible={showOnboarding}
        closable={true}
        maskClosable={false}
        width={560}
        footer={null}
        onCancel={() => setShowOnboarding(false)}
      >
        <Steps current={onboardStep} size="small" style={{ marginBottom: 24 }}>
          <Step title="Company" />
          <Step title="Settings" />
          <Step title="Done" />
        </Steps>

        {onboardStep === 0 && (
          <Form form={onboardForm} layout="vertical">
            <Form.Item name="companyName" label="Company Name" rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="e.g. My Business Pty Ltd" size="large" />
            </Form.Item>
            <Form.Item name="industry" label="Industry">
              <Select placeholder="Select your industry">
                <Option value="general">General / Other</Option>
                <Option value="retail">Retail</Option>
                <Option value="professional-services">Professional Services</Option>
                <Option value="construction">Construction</Option>
                <Option value="manufacturing">Manufacturing</Option>
                <Option value="non-profit">Non-Profit</Option>
                <Option value="hospitality">Hospitality</Option>
                <Option value="healthcare">Healthcare</Option>
                <Option value="technology">Technology / SaaS</Option>
              </Select>
            </Form.Item>
            <div style={{ textAlign: "right" }}>
              <Button type="primary" onClick={() => setOnboardStep(1)}>Next</Button>
            </div>
          </Form>
        )}

        {onboardStep === 1 && (
          <Form form={onboardForm} layout="vertical">
            <Form.Item name="baseCurrency" label="Base Currency" initialValue="USD">
              <Select showSearch>
                <Option value="USD">USD — US Dollar</Option>
                <Option value="EUR">EUR — Euro</Option>
                <Option value="GBP">GBP — British Pound</Option>
                <Option value="ZAR">ZAR — South African Rand</Option>
                <Option value="CAD">CAD — Canadian Dollar</Option>
                <Option value="AUD">AUD — Australian Dollar</Option>
                <Option value="INR">INR — Indian Rupee</Option>
              </Select>
            </Form.Item>
            <Form.Item name="fiscalYear" label="Fiscal Year Start" initialValue="January">
              <Select>
                {['January','February','March','April','May','June','July','August','September','October','November','December'].map(m =>
                  <Option key={m} value={m}>{m}</Option>
                )}
              </Select>
            </Form.Item>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Button onClick={() => setOnboardStep(0)}>Back</Button>
              <Button type="primary" onClick={() => setOnboardStep(2)}>Next</Button>
            </div>
          </Form>
        )}

        {onboardStep === 2 && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <CheckCircleOutlined style={{ fontSize: 48, color: "#52c41a", marginBottom: 16 }} />
            <h3>You're All Set!</h3>
            <p style={{ color: "#666", marginBottom: 24 }}>
              Your company is ready. You can always adjust settings later from the Settings menu.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 20 }}>
              <Button onClick={() => history.push("/main/accountant/chart-of-accounts")}>Set Up Accounts</Button>
              <Button onClick={() => history.push("/inner/sales?tab=2")}>Create First Invoice</Button>
              <Button onClick={() => history.push("/main/customers/center")}>Add Customers</Button>
            </div>
            <Button type="primary" size="large" onClick={handleOnboardFinish}>
              Go to Dashboard
            </Button>
          </div>
        )}
      </Modal>
    </Auxiliary>
  );
};

export default Flow;
