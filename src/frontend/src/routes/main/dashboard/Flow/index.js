import React, { useState, useEffect, useRef } from "react";
import { useHistory } from "react-router-dom";
import { Row, Col, Card, Spin, Button, Modal, message, Table, Tag } from "antd";
import {
  BankOutlined, DollarOutlined, CreditCardOutlined, WalletOutlined,
  FundOutlined, RiseOutlined, FallOutlined,
  FileTextOutlined, SwapOutlined,
  BarChartOutlined, ShoppingCartOutlined, TeamOutlined, BookOutlined
} from "@ant-design/icons";
import Auxiliary from "util/Auxiliary";
import { useCurrency } from '../../../../utils/currency';


/* ──── helpers ──── */

// matchFn maps to the EXACT types/subtypes defined in chartOfAccounts.js backend model
const BALANCE_CATEGORIES = [
  {
    key: 'bank',
    label: 'Bank Accounts',
    route: '/main/banking/reconcile',
    matchFn: a => {
      const t = (a.accountType || '').toLowerCase();
      return t === 'bank' || t === 'cash';
    },
    icon: <BankOutlined />, color: '#1890ff',
  },
  {
    key: 'ar',
    label: 'Accounts Receivable',
    route: '/inner/sales?tab=5',
    matchFn: a => {
      const t  = (a.accountType    || '').toLowerCase();
      const st = (a.accountSubType || a.subType || '').toLowerCase();
      return st === 'accounts receivable' || t === 'accounts receivable';
    },
    icon: <RiseOutlined />, color: '#52c41a',
  },
  {
    key: 'ap',
    label: 'Accounts Payable',
    route: '/inner/expenses',
    matchFn: a => {
      const t  = (a.accountType    || '').toLowerCase();
      const st = (a.accountSubType || a.subType || '').toLowerCase();
      return st === 'accounts payable' || t === 'accounts payable';
    },
    icon: <FallOutlined />, color: '#fa541c',
  },
  {
    key: 'cc',
    label: 'Credit Cards',
    route: '/main/expenses/credit-cards',
    matchFn: a => {
      const t = (a.accountType || '').toLowerCase();
      return t === 'credit card';
    },
    icon: <CreditCardOutlined />, color: '#722ed1',
  },
  {
    key: 'loans',
    label: 'Loans',
    route: '/main/accountant/chart-of-accounts',
    matchFn: a => {
      const t  = (a.accountType    || '').toLowerCase();
      const st = (a.accountSubType || a.subType || '').toLowerCase();
      return t === 'loan' || st.includes('loan') || st === 'long-term liability' || st === 'line of credit' || st === 'mortgage';
    },
    icon: <WalletOutlined />, color: '#eb2f96',
  },
  {
    key: 'revenue',
    label: 'Revenue',
    route: '/main/reports/sales',
    matchFn: a => {
      const t = (a.accountType || '').toLowerCase();
      return t === 'income' || t === 'other income';
    },
    icon: <FundOutlined />, color: '#13c2c2',
  },
  {
    key: 'equity',
    label: 'Equity',
    route: '/main/accountant/chart-of-accounts',
    matchFn: a => (a.accountType || '').toLowerCase() === 'equity',
    icon: <DollarOutlined />, color: '#2f54eb',
  },
];

/* ──── Main Component ──── */
const Flow = () => {
  const history = useHistory();
  const { fmt } = useCurrency();
  const [loading, setLoading] = useState(true);
  const rowRef = useRef(null);
  const [balances, setBalances] = useState({});
  const [accountNames, setAccountNames] = useState({});
  const [categoryAccounts, setCategoryAccounts] = useState({});
  const [drillDown, setDrillDown] = useState(null); // { key, label, color, icon }

  const P = (p) => (process.env.PUBLIC_URL + p);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Primary: pre-aggregated balances from journal_lines (authoritative GL source)
      const dbBals = await window.electronAPI?.getDashboardBalances?.() || {};
      // Secondary: full account list for drill-down names
      const accounts = await window.electronAPI?.getChartOfAccounts?.() || [];
      const acctList = Array.isArray(accounts) ? accounts : [];

      const bals = {};
      const names = {};
      const catAccounts = {};
      BALANCE_CATEGORIES.forEach(cat => {
        // Balance comes from the pre-aggregated backend endpoint
        bals[cat.key] = Number(dbBals[cat.key] || 0);
        // Account names and drill-down list still come from COA
        const matching = acctList.filter(cat.matchFn);
        names[cat.key] = matching.map(a => a.accountName || a.name || '').filter(Boolean);
        catAccounts[cat.key] = matching;
      });
      setBalances(bals);
      setAccountNames(names);
      setCategoryAccounts(catAccounts);

    } catch (e) { console.error(e); }
    setLoading(false);
  };

  if (loading) {
    return <Auxiliary><div style={{ textAlign: "center", padding: 80 }}><Spin size="large" tip="Loading..." /></div></Auxiliary>;
  }

  return (
    <Auxiliary>
      {/* ──── Account Balances ──── */}
      <div style={{ marginBottom: 20, width: '100%' }}>
        <Row gutter={[12, 12]}>
          {BALANCE_CATEGORIES.map(cat => {
            const acctNamesForCat = accountNames[cat.key] || [];
            const count = acctNamesForCat.length;
            return (
              <Col flex="1 1 0" key={cat.key}>
                <Card
                  size="small"
                  hoverable
                  style={{ borderTop: `3px solid ${cat.color}`, borderRadius: 6, cursor: 'pointer' }}
                  bodyStyle={{ padding: "12px 14px" }}
                  onClick={() => setDrillDown(cat)}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 16, color: cat.color }}>{cat.icon}</span>
                      <span style={{ fontSize: 11, color: "#888", fontWeight: 500 }}>{cat.label}</span>
                    </div>
                    {count > 0 && (
                      <Tag color={cat.color} style={{ fontSize: 9, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                        {count}
                      </Tag>
                    )}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: (balances[cat.key] || 0) < 0 ? '#f5222d' : '#262626' }}>
                    {fmt(balances[cat.key])}
                  </div>
                  {count === 1 && (
                    <div style={{ fontSize: 10, color: '#aaa', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {acctNamesForCat[0]}
                    </div>
                  )}
                  {count > 1 && (
                    <div style={{ fontSize: 10, color: cat.color, marginTop: 2 }}>
                      {count} accounts — click to view
                    </div>
                  )}
                  {count === 0 && (
                    <div style={{ fontSize: 10, color: '#ccc', marginTop: 2 }}>No accounts yet</div>
                  )}
                </Card>
              </Col>
            );
          })}
        </Row>
      </div>

      {/* ──── Module-based Workflow Diagram + Quick Actions ──── */}
      <Row ref={rowRef} gutter={16} style={{ position: 'relative' }}>
        {/* Left: Sales column + Purchasing/Payroll column */}
        <Col xl={17} lg={16} md={24} sm={24} xs={24}>
          <Row gutter={[16, 0]}>
            {/* ── Sales Module (vertical) ── */}
            <Col xs={24} sm={11}>
              <Card size="small" bodyStyle={{ padding: 12 }} style={{ borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#52c41a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, letterSpacing: 1 }}>
                  <DollarOutlined /> SALES
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {[
                    { icon: P('/assets/icons/customers.svg'), label: 'Customers', route: '/main/customers/center' },
                    { icon: P('/assets/icons/products.svg'), label: 'Products', route: '/main/inventory/items' },
                    { icon: P('/assets/icons/quotes.svg'), label: 'Quotes', route: '/main/customers/quotes/list' },
                    { icon: P('/assets/icons/invoices.svg'), label: 'Create Invoice', route: '/main/customers/invoices/new' },
                    { icon: P('/assets/icons/payments.svg'), label: 'Payments', route: '/main/customers/payments' },
                  ].map((n, i) => (
                    <React.Fragment key={n.label}>
                      <div onClick={() => history.push(n.route)}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', padding: '6px 0', transition: 'transform 0.15s', zIndex: 2 }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                      >
                        <img src={n.icon} alt={n.label} style={{ width: 34, height: 34, objectFit: 'contain' }} />
                        <span style={{ fontSize: 10, textAlign: 'center', color: '#333', fontWeight: 500, marginTop: 2, lineHeight: '13px' }}>{n.label}</span>
                      </div>
                      {i < 4 && (
                        <svg width={20} height={24} style={{ display: 'block' }}>
                          <line x1={10} y1={0} x2={10} y2={24} stroke="#52c41a" strokeWidth={2} strokeDasharray="6 4" className="flow-arrow" markerEnd="url(#ah-green)" />
                        </svg>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </Card>
            </Col>

            {/* ── Right column: Purchasing + Payroll stacked ── */}
            <Col xs={24} sm={13} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Purchasing */}
              <Card size="small" bodyStyle={{ padding: 12 }} style={{ borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fa541c', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, letterSpacing: 1 }}>
                  <ShoppingCartOutlined /> PURCHASING
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {[
                    { icon: P('/assets/icons/vendors.svg'), label: 'Vendors / Suppliers', route: '/main/expenses/suppliers' },
                    { icon: P('/assets/icons/expenses.svg'), label: 'Enter Bills', route: '/main/vendors/bills/enter' },
                    { icon: P('/assets/icons/pay.svg'), label: 'Pay Bills', route: '/main/vendors/bills/pay' },
                    { icon: P('/assets/icons/card.svg'), label: 'Credit Card Charges', route: '/main/expenses/credit-cards' },
                  ].map((n, i) => (
                    <React.Fragment key={n.label}>
                      <div onClick={() => history.push(n.route)}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', padding: '8px 10px', transition: 'transform 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                      >
                        <img src={n.icon} alt={n.label} style={{ width: 36, height: 36, objectFit: 'contain' }} />
                        <span style={{ fontSize: 10, textAlign: 'center', color: '#333', fontWeight: 500, marginTop: 2 }}>{n.label}</span>
                      </div>
                      {i < 3 && (
                        <svg width={40} height={20} style={{ flexShrink: 0 }}>
                          <line x1={0} y1={10} x2={40} y2={10} stroke="#fa541c" strokeWidth={2} strokeDasharray="6 4" className="flow-arrow" markerEnd="url(#ah-orange)" />
                        </svg>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </Card>

              {/* Payroll */}
              <Card size="small" bodyStyle={{ padding: 12 }} style={{ borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#722ed1', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, letterSpacing: 1 }}>
                  <TeamOutlined /> PAYROLL
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {[
                    { icon: P('/assets/icons/employee.svg'), label: 'Create Employee', route: '/main/employees/center' },
                    { icon: P('/assets/icons/payroll.svg'), label: 'Payroll', route: '/main/employees/payroll' },
                  ].map((n, i) => (
                    <React.Fragment key={n.label}>
                      <div onClick={() => history.push(n.route)}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', padding: '8px 10px', transition: 'transform 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                      >
                        <img src={n.icon} alt={n.label} style={{ width: 36, height: 36, objectFit: 'contain' }} />
                        <span style={{ fontSize: 10, textAlign: 'center', color: '#333', fontWeight: 500, marginTop: 2 }}>{n.label}</span>
                      </div>
                      {i < 1 && (
                        <svg width={40} height={20} style={{ flexShrink: 0 }}>
                          <line x1={0} y1={10} x2={40} y2={10} stroke="#722ed1" strokeWidth={2} strokeDasharray="6 4" className="flow-arrow" markerEnd="url(#ah-purple)" />
                        </svg>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </Card>
            {/* Banking */}
              <Card size="small" bodyStyle={{ padding: 12 }} style={{ borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1890ff', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, letterSpacing: 1 }}>
                  <BankOutlined /> BANKING
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {[
                    { icon: P('/assets/icons/cash.svg'), label: 'Bank Accounts', route: '/main/banking/accounts' },
                    { icon: P('/assets/icons/pay.svg'), label: 'Write Checks', route: '/main/accountant/check-printing' },
                    { icon: P('/assets/icons/deposit.svg'), label: 'Deposits', route: '/main/banking/deposits' },
                    { icon: P('/assets/icons/transfer.svg'), label: 'Transfer Funds', route: '/main/banking/transfers' },
                    { icon: P('/assets/icons/statement.svg'), label: 'Reconcile', route: '/main/banking/reconcile' },
                  ].map((n, i) => (
                    <React.Fragment key={n.label}>
                      <div onClick={() => history.push(n.route)}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', padding: '8px 6px', transition: 'transform 0.15s', zIndex: 2 }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                      >
                        <img src={n.icon} alt={n.label} style={{ width: 34, height: 34, objectFit: 'contain' }} />
                        <span style={{ fontSize: 10, textAlign: 'center', color: '#333', fontWeight: 500, marginTop: 2, lineHeight: '12px' }}>{n.label}</span>
                      </div>
                      {i < 4 && (
                        <svg width={32} height={20} style={{ flexShrink: 0 }}>
                          <line x1={0} y1={10} x2={32} y2={10} stroke="#1890ff" strokeWidth={2} strokeDasharray="6 4" className="flow-arrow" markerEnd="url(#ah-blue)" />
                        </svg>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </Card>
            </Col>
          </Row>
        </Col>

        {/* Animated arrow styles + SVG markers */}
        <style>{`
          @keyframes marchDash {
            from { stroke-dashoffset: 40; }
            to   { stroke-dashoffset: 0; }
          }
          .flow-arrow {
            animation: marchDash 1.2s linear infinite;
          }
        `}</style>
        <svg style={{ position: 'absolute', width: 0, height: 0 }}>
          <defs>
            <marker id="ah-green" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="#52c41a" />
            </marker>
            <marker id="ah-orange" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="#fa541c" />
            </marker>
            <marker id="ah-purple" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="#722ed1" />
            </marker>
            <marker id="ah-blue" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="#1890ff" />
            </marker>
          </defs>
        </svg>

        {/* Right: QB-style quick access panel */}
        <Col xl={7} lg={8} md={24} sm={24} xs={24}>
          {/* ACCOUNTING & REPORTING section */}
          <Card size="small"
            title={
              <div style={{ textAlign: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#1890ff",
                  letterSpacing: 1.5, borderBottom: "2px solid #1890ff", paddingBottom: 2 }}>
                  ACCOUNTING & REPORTING
                </span>
              </div>
            }
            bodyStyle={{ padding: 8 }}
            style={{ borderRadius: 8, border: "1px solid #bae0ff" }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 2 }}>
              {[
                { icon: <BankOutlined />, label: 'Chart of\nAccounts', route: '/main/accountant/chart-of-accounts', color: '#1890ff' },
                { icon: <BookOutlined />, label: 'Journal\nEntries', route: '/main/accountant/journal-entries', color: '#2f54eb' },
                { icon: <BarChartOutlined />, label: 'Analysis', route: '/main/analytics', color: '#13c2c2' },
                { icon: <FileTextOutlined />, label: 'Reports', route: '/main/reports/sales', color: '#722ed1' },
                { icon: <SwapOutlined />, label: 'Reconcile', route: '/main/banking/reconcile', color: '#eb2f96' },
              ].map((qa, i) => (
                <div key={i} onClick={() => history.push(qa.route)}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", padding: "12px 4px", cursor: "pointer",
                    borderRadius: 6, transition: "all 0.15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#e6f7ff"; e.currentTarget.style.transform = "scale(1.05)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.transform = "scale(1)"; }}
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

      {/* ──── Drill-Down Modal ──── */}
      {drillDown && (() => {
        const accts = categoryAccounts[drillDown.key] || [];
        const total = accts.reduce((s, a) => s + Number(a.balance || 0), 0);
        const isIncomeOrExpense = ['revenue','expenses'].includes(drillDown.key);
        const drillColumns = [
          {
            title: 'Account',
            dataIndex: 'accountName',
            key: 'accountName',
            render: (v, r) => (
              <div>
                <a
                  style={{ fontWeight: 500, color: '#1890ff', cursor: 'pointer' }}
                  onClick={() => { setDrillDown(null); history.push(`/main/accountant/general-ledger?account=${r.id}`); }}
                >
                  {v}
                </a>
                {r.accountNumber && <div style={{ fontSize: 11, color: '#aaa' }}>#{r.accountNumber}</div>}
              </div>
            ),
          },
          {
            title: 'Sub-type',
            dataIndex: 'accountSubType',
            key: 'accountSubType',
            render: v => v ? <Tag style={{ fontSize: 11 }}>{v}</Tag> : null,
            responsive: ['sm'],
          },
          {
            title: 'Balance',
            dataIndex: 'balance',
            key: 'balance',
            align: 'right',
            render: v => (
              <span style={{ fontWeight: 600, color: Number(v) < 0 ? '#f5222d' : '#262626' }}>
                {fmt(v)}
              </span>
            ),
          },
        ];
        return (
          <Modal
            visible={!!drillDown}
            title={
              <span style={{ color: drillDown.color }}>
                {drillDown.icon}&nbsp;&nbsp;{drillDown.label}
              </span>
            }
            onCancel={() => setDrillDown(null)}
            width={580}
            footer={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>
                  Total:&nbsp;
                  <span style={{ color: total < 0 ? '#f5222d' : drillDown.color }}>{fmt(total)}</span>
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button type="default" onClick={() => { setDrillDown(null); history.push(drillDown.route); }}>
                    {isIncomeOrExpense ? 'View P&L Report' : 'View Detail'}
                  </Button>
                  <Button onClick={() => { setDrillDown(null); history.push('/main/accountant/chart-of-accounts'); }}>
                    Manage Accounts
                  </Button>
                  <Button type="primary" onClick={() => setDrillDown(null)}>Close</Button>
                </div>
              </div>
            }
          >
            {accts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#aaa' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>{drillDown.icon}</div>
                <div>No {drillDown.label} accounts yet.</div>
                <Button type="link" onClick={() => { setDrillDown(null); history.push('/main/accountant/chart-of-accounts'); }}>
                  + Add an account
                </Button>
              </div>
            ) : (
              <Table
                dataSource={accts.map((a, i) => ({ ...a, key: a.id || i }))}
                columns={drillColumns}
                size="small"
                onRow={(r) => ({ onClick: () => { setDrillDown(null); history.push(`/main/accountant/general-ledger?account=${r.id}`); }, style: { cursor: 'pointer' } })}
                pagination={accts.length > 10 ? { defaultPageSize: 10, size: 'small' } : false}
                summary={() => (
                  <Table.Summary.Row>
                    <Table.Summary.Cell colSpan={2}>
                      <span style={{ fontWeight: 700 }}>Total {drillDown.label}</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell align="right">
                      <span style={{ fontWeight: 700, color: total < 0 ? '#f5222d' : drillDown.color }}>
                        {fmt(total)}
                      </span>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                )}
              />
            )}
          </Modal>
        );
      })()}

    </Auxiliary>
  );
};

export default Flow;
