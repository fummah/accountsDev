import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card, Row, Col, Statistic, Table, Tag, Button, Space, Progress, Alert,
  Tooltip, Divider, Typography, Spin, message, Badge, DatePicker, Checkbox,
  Drawer, Timeline
} from 'antd';
import {
  DollarOutlined, RiseOutlined, FallOutlined, BankOutlined, FileTextOutlined,
  AuditOutlined, BarChartOutlined, CalculatorOutlined, BookOutlined,
  CheckCircleOutlined, WarningOutlined, ClockCircleOutlined, SyncOutlined,
  ArrowUpOutlined, ArrowDownOutlined, FundOutlined, SafetyOutlined,
  PrinterOutlined, SwapOutlined, ReconciliationOutlined, ScheduleOutlined,
  InfoCircleOutlined, ExclamationCircleOutlined, FileDoneOutlined,
  CreditCardOutlined, PieChartOutlined, DashboardOutlined, ThunderboltOutlined,
  TeamOutlined, ShopOutlined, FileSearchOutlined, SettingOutlined,
  AlertOutlined, RightOutlined, CalendarOutlined, ProfileOutlined,
  CarryOutOutlined, WalletOutlined, LineChartOutlined, FieldTimeOutlined,
  FileProtectOutlined
} from '@ant-design/icons';
import { useHistory } from 'react-router-dom';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { Title, Text } = Typography;

const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ─── Mini bar chart ────────────────────────────────────────────────── */
const MiniBarChart = ({ data, labelKey, valueKey, color = '#1890ff', height = 120, prefix = '' }) => {
  if (!data || !data.length) return <div style={{ color: '#999', textAlign: 'center', padding: 16, fontSize: 12 }}>No data available</div>;
  const max = Math.max(...data.map(d => Math.abs(Number(d[valueKey]) || 0)), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height, padding: '0 4px' }}>
      {data.map((d, i) => {
        const val = Number(d[valueKey]) || 0;
        const barH = Math.max(4, (Math.abs(val) / max) * (height - 24));
        const barColor = val < 0 ? '#ff4d4f' : color;
        return (
          <Tooltip key={i} title={`${d[labelKey]}: ${prefix} ${fmt(val)}`}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
              <div style={{ width: '100%', height: barH, background: `linear-gradient(180deg, ${barColor} 0%, ${barColor}88 100%)`, borderRadius: '4px 4px 0 0', minHeight: 4, transition: 'height 0.4s ease' }} />
              <Text type="secondary" style={{ fontSize: 9, marginTop: 3, whiteSpace: 'nowrap' }}>{(d[labelKey] || '').slice(-5)}</Text>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
};

/* ─── Aging bar visualization ───────────────────────────────────────── */
const AgingBreakdown = ({ data, title, color, currencyFmt }) => {
  const buckets = [
    { key: 'current', label: 'Current', color: '#52c41a' },
    { key: '1-30', label: '1-30 days', color: '#1890ff' },
    { key: '31-60', label: '31-60 days', color: '#faad14' },
    { key: '61-90', label: '61-90 days', color: '#fa8c16' },
    { key: '90+', label: '90+ days', color: '#ff4d4f' },
  ];
  const total = Number(data?.total || 0) || 1;
  return (
    <div>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
        {buckets.map(b => {
          const val = Number(data?.[b.key] || 0);
          const pct = (val / total) * 100;
          return pct > 0 ? <Tooltip key={b.key} title={`${b.label}: ${currencyFmt ? currencyFmt(val) : fmt(val)} (${pct.toFixed(0)}%)`}><div style={{ width: `${pct}%`, background: b.color, transition: 'width 0.3s' }} /></Tooltip> : null;
        })}
      </div>
      {buckets.map(b => {
        const val = Number(data?.[b.key] || 0);
        if (val <= 0) return null;
        return (
          <div key={b.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12 }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: b.color, marginRight: 6 }} />{b.label}</span>
            <Text strong>{currencyFmt ? currencyFmt(val) : fmt(val)}</Text>
          </div>
        );
      })}
      <Divider style={{ margin: '8px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <Text strong>Total</Text>
        <Text strong style={{ color }}>{currencyFmt ? currencyFmt(data?.total || 0) : fmt(data?.total || 0)}</Text>
      </div>
    </div>
  );
};

/* ─── Financial Health Score Calculator ─────────────────────────────── */
const calcHealthScore = (kpis, tbBalanced, collectionRate) => {
  let score = 50;
  const profitMargin = kpis.revenue > 0 ? (kpis.netIncome / kpis.revenue) * 100 : 0;
  if (profitMargin >= 20) score += 15; else if (profitMargin >= 10) score += 10; else if (profitMargin >= 0) score += 5; else score -= 10;
  if (tbBalanced) score += 15; else score -= 20;
  if (collectionRate >= 90) score += 10; else if (collectionRate >= 70) score += 5; else score -= 5;
  if (kpis.overdueInvoices === 0) score += 5; else if (kpis.overdueInvoices <= 3) score += 2; else score -= 5;
  if (kpis.ar90Plus <= 0) score += 5; else score -= 5;
  return Math.max(0, Math.min(100, score));
};
const getHealthLabel = (s) => s >= 80 ? 'Excellent' : s >= 60 ? 'Good' : s >= 40 ? 'Fair' : 'Needs Attention';
const getHealthColor = (s) => s >= 80 ? '#52c41a' : s >= 60 ? '#1890ff' : s >= 40 ? '#faad14' : '#ff4d4f';

/* ─── Period presets ───────────────────────────────────────────────── */
const PERIOD_PRESETS = [
  { label: 'MTD', start: () => moment().startOf('month'), end: () => moment() },
  { label: 'QTD', start: () => moment().startOf('quarter'), end: () => moment() },
  { label: 'YTD', start: () => moment().startOf('year'), end: () => moment() },
  { label: 'Last Month', start: () => moment().subtract(1, 'month').startOf('month'), end: () => moment().subtract(1, 'month').endOf('month') },
  { label: 'Last Quarter', start: () => moment().subtract(1, 'quarter').startOf('quarter'), end: () => moment().subtract(1, 'quarter').endOf('quarter') },
  { label: 'Last Year', start: () => moment().subtract(1, 'year').startOf('year'), end: () => moment().subtract(1, 'year').endOf('year') },
];

/* ═══════════════════════════════════════════════════════════════════════
   ACCOUNTANT CENTER COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */
const AccountantCenter = () => {
  const history = useHistory();
  const { symbol: cSym } = useCurrency();
  const fmtC = (v) => `${cSym} ${fmt(v)}`;
  const [loading, setLoading] = useState(true);
  const [periodLabel, setPeriodLabel] = useState('YTD');
  const [dateRange, setDateRange] = useState([moment().startOf('year'), moment()]);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklist, setChecklist] = useState({
    reconciled: false, journalReviewed: false, tbBalanced: false,
    arReviewed: false, apReviewed: false, depreciationRun: false,
    closingSet: false, reportsGenerated: false,
  });

  const [kpis, setKpis] = useState({
    revenue: 0, cogs: 0, expenses: 0, grossProfit: 0, netIncome: 0,
    cashNet: 0, totalDebits: 0, totalCredits: 0,
    arTotal: 0, arOverdue: 0, ar90Plus: 0,
    apTotal: 0, apOverdue: 0,
    openInvoices: 0, openInvoiceAmt: 0,
    overdueInvoices: 0, overdueInvoiceAmt: 0,
    openExpenses: 0, openExpenseAmt: 0,
    overdueExpenses: 0, overdueExpenseAmt: 0,
    outstandingCount: 0, outstandingAmt: 0,
  });
  const [accountCount, setAccountCount] = useState(0);
  const [recentTxns, setRecentTxns] = useState([]);
  const [revenueTrend, setRevenueTrend] = useState([]);
  const [insights, setInsights] = useState([]);
  const [tbBalanced, setTbBalanced] = useState(true);
  const [arAging, setArAging] = useState(null);
  const [apAging, setApAging] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [expenseBreakdown, setExpenseBreakdown] = useState([]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const startDate = dateRange[0]?.format('YYYY-MM-DD') || moment().startOf('year').format('YYYY-MM-DD');
      const endDate = dateRange[1]?.format('YYYY-MM-DD') || moment().format('YYYY-MM-DD');

      const safe = (fn) => fn?.()?.catch?.(() => null) || Promise.resolve(null);

      const [dashKpis, financialReport, invoiceSummary, arAgingRes, apAgingRes,
             accounts, ledger, trend, insightData, trialBalance, forecastRes] = await Promise.all([
        safe(() => window.electronAPI.getDashboardKpis?.(startDate, endDate)),
        safe(() => window.electronAPI.getFinancialReport?.(startDate, endDate)),
        safe(() => window.electronAPI.getInvoiceSummary?.()),
        safe(() => window.electronAPI.getARAging?.(endDate)),
        safe(() => window.electronAPI.getAPAging?.(endDate)),
        safe(() => window.electronAPI.getChartOfAccounts?.()),
        safe(() => window.electronAPI.getLedger?.()),
        safe(() => window.electronAPI.getRevenueTrend?.(startDate, endDate)),
        safe(() => window.electronAPI.dashboardInsights?.(startDate, endDate)),
        safe(() => window.electronAPI.getTrialBalance?.(startDate, endDate)),
        safe(() => window.electronAPI.forecastCashflow?.()),
      ]);

      const accts = Array.isArray(accounts) ? accounts : [];
      setAccountCount(accts.length);

      // P&L
      const pl = financialReport?.profitLoss || {};
      const revenue = Number(pl.revenue || 0);
      const cogs = Number(pl.cogs || 0);
      const expenses = Number(pl.operatingExpenses || 0);
      const grossProfit = Number(pl.grossProfit || 0) || (revenue - cogs);
      const netIncome = Number(pl.netProfit || 0) || (grossProfit - expenses);

      // Expense breakdown from P&L categories
      const expCats = financialReport?.profitLoss?.expenseCategories || financialReport?.expenseBreakdown || null;
      if (expCats && typeof expCats === 'object' && !Array.isArray(expCats)) {
        setExpenseBreakdown(Object.entries(expCats).map(([cat, amt]) => ({ category: cat, amount: Number(amt) || 0 })).sort((a, b) => b.amount - a.amount).slice(0, 8));
      } else if (Array.isArray(expCats)) {
        setExpenseBreakdown(expCats.slice(0, 8));
      } else {
        setExpenseBreakdown([]);
      }

      // Dashboard KPIs
      const dk = dashKpis?.kpis || {};
      const cashNet = Number(dk.cashNet || 0);
      const totalDebits = Number(dk.totalDebits || 0);
      const totalCredits = Number(dk.totalCredits || 0);
      const outstandingCount = Number(dk.outstandingInvoicesCount || 0);
      const outstandingAmt = Number(dk.outstandingInvoicesAmount || 0);

      // A/R & A/P Aging
      const arSummary = arAgingRes?.summary || {};
      const arTotal = Number(arSummary.total || 0);
      const ar90Plus = Number(arSummary['90+'] || 0);
      const arOverdue = Number(arSummary['1-30'] || 0) + Number(arSummary['31-60'] || 0) + Number(arSummary['61-90'] || 0) + ar90Plus;
      setArAging(arSummary);

      const apSummary = apAgingRes?.summary || {};
      const apTotal = Number(apSummary.total || 0);
      const apOverdue = Number(apSummary['1-30'] || 0) + Number(apSummary['31-60'] || 0) + Number(apSummary['61-90'] || 0) + Number(apSummary['90+'] || 0);
      setApAging(apSummary);

      // Invoice summary
      const invOpen = invoiceSummary?.open_invoice?.[0] || {};
      const invDue = invoiceSummary?.due_invoice?.[0] || {};
      const expOpen = invoiceSummary?.open_expense?.[0] || {};
      const expDue = invoiceSummary?.due_expense?.[0] || {};

      setKpis({
        revenue, cogs, expenses, grossProfit, netIncome,
        cashNet, totalDebits, totalCredits,
        arTotal, arOverdue, ar90Plus,
        apTotal, apOverdue,
        openInvoices: Number(invOpen.open_invoice || 0),
        openInvoiceAmt: Number(invOpen.open_total_amount || 0),
        overdueInvoices: Number(invDue.due_invoice || 0),
        overdueInvoiceAmt: Number(invDue.due_total_amount || 0),
        openExpenses: Number(expOpen.open_expense || 0),
        openExpenseAmt: Number(expOpen.open_total_amount_expense || 0),
        overdueExpenses: Number(expDue.due_expense || 0),
        overdueExpenseAmt: Number(expDue.due_total_amount_expense || 0),
        outstandingCount, outstandingAmt,
      });

      // Trial balance
      const tb = Array.isArray(trialBalance) ? trialBalance : [];
      const tbDebit = tb.reduce((s, r) => s + Number(r.debit || 0), 0);
      const tbCredit = tb.reduce((s, r) => s + Number(r.credit || 0), 0);
      setTbBalanced(Math.abs(tbDebit - tbCredit) < 0.01);

      // Recent transactions
      const txns = Array.isArray(ledger) ? ledger : [];
      setRecentTxns([...txns].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 12));

      // Revenue trend
      setRevenueTrend(Array.isArray(trend) ? trend : []);

      // Forecast
      const fc = forecastRes?.forecast || [];
      setForecast(Array.isArray(fc) ? fc : []);

      // Insights
      const insArr = Array.isArray(insightData) ? insightData : (insightData?.insights || []);
      setInsights(Array.isArray(insArr) ? insArr : []);
    } catch (e) {
      console.error('Dashboard load error:', e);
      message.error('Failed to load some dashboard data');
    }
    setLoading(false);
  }, [dateRange]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const handlePeriod = (preset) => {
    setPeriodLabel(preset.label);
    setDateRange([preset.start(), preset.end()]);
  };

  const handleCustomRange = (dates) => {
    if (dates && dates[0] && dates[1]) {
      setPeriodLabel('Custom');
      setDateRange(dates);
    }
  };

  // Computed metrics
  const profitMargin = kpis.revenue > 0 ? ((kpis.netIncome / kpis.revenue) * 100) : 0;
  const grossMargin = kpis.revenue > 0 ? ((kpis.grossProfit / kpis.revenue) * 100) : 0;
  const collectionRate = kpis.arTotal > 0 ? Math.max(0, 100 - ((kpis.arOverdue / kpis.arTotal) * 100)) : 100;
  const workingCapital = kpis.arTotal - kpis.apTotal;
  const currentRatio = kpis.apTotal > 0 ? (kpis.arTotal / kpis.apTotal) : kpis.arTotal > 0 ? 999 : 1;
  const healthScore = calcHealthScore(kpis, tbBalanced, collectionRate);
  const checklistDone = Object.values(checklist).filter(Boolean).length;
  const checklistTotal = Object.keys(checklist).length;

  // Quick links
  const quickLinks = [
    { icon: <BookOutlined />, title: 'Chart of Accounts', desc: 'Manage account structure', path: '/main/accountant/chart-of-accounts', color: '#1890ff' },
    { icon: <FileTextOutlined />, title: 'Journal Entries', desc: 'Record adjustments', path: '/main/accountant/journal-entries', color: '#52c41a' },
    { icon: <CalculatorOutlined />, title: 'Trial Balance', desc: 'Verify book balance', path: '/main/accountant/trial-balance', color: '#722ed1' },
    { icon: <BarChartOutlined />, title: 'General Ledger', desc: 'Full transaction ledger', path: '/main/accountant/general-ledger', color: '#fa8c16' },
    { icon: <ReconciliationOutlined />, title: 'Reconcile', desc: 'Bank reconciliation', path: '/main/accountant/reconcile', color: '#13c2c2' },
    { icon: <SafetyOutlined />, title: 'Fixed Assets', desc: 'Asset register', path: '/main/accountant/fixed-assets', color: '#eb2f96' },
    { icon: <FundOutlined />, title: 'Profit & Loss', desc: 'Income statement', path: '/main/reports/profit-loss', color: '#2f54eb' },
    { icon: <BankOutlined />, title: 'Balance Sheet', desc: 'Financial position', path: '/main/reports/balance-sheet', color: '#faad14' },
    { icon: <LineChartOutlined />, title: 'Cash Flow', desc: 'Cash movements', path: '/main/reports/cash-flow', color: '#389e0d' },
    { icon: <PieChartOutlined />, title: 'Advanced TB', desc: 'Multi-dimensional', path: '/main/accountant/advanced-trial-balance', color: '#531dab' },
    { icon: <FileDoneOutlined />, title: 'Closing Date', desc: 'Period lock', path: '/main/accountant/closing-date', color: '#c41d7f' },
    { icon: <DashboardOutlined />, title: 'Analytics', desc: 'AI-powered insights', path: '/main/analytics', color: '#08979c' },
  ];

  const txnColumns = [
    { title: 'Date', dataIndex: 'date', key: 'date', width: 90, render: v => v ? moment(v).format('DD MMM') : '-' },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Ref', dataIndex: 'reference', key: 'reference', width: 80, ellipsis: true, render: v => v ? <Tag style={{ fontSize: 11 }}>{v}</Tag> : '-' },
    { title: 'Debit', dataIndex: 'debit', key: 'debit', width: 100, align: 'right', render: v => Number(v) ? <Text style={{ color: '#3f8600', fontWeight: 500 }}>{fmtC(v)}</Text> : <Text type="secondary">-</Text> },
    { title: 'Credit', dataIndex: 'credit', key: 'credit', width: 100, align: 'right', render: v => Number(v) ? <Text style={{ color: '#cf1322', fontWeight: 500 }}>{fmtC(v)}</Text> : <Text type="secondary">-</Text> },
  ];

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1440, margin: '0 auto' }}>
      {/* ═══ HEADER ═══════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #1890ff, #722ed1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AuditOutlined style={{ fontSize: 20, color: '#fff' }} />
            </div>
            <div>
              <Title level={3} style={{ margin: 0, lineHeight: 1.2 }}>Accountant Center</Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {periodLabel} &middot; {dateRange[0]?.format('DD MMM YYYY')} to {dateRange[1]?.format('DD MMM YYYY')}
              </Text>
            </div>
          </div>
        </div>
        <Space wrap size={6}>
          {PERIOD_PRESETS.map(p => (
            <Button key={p.label} size="small" type={periodLabel === p.label ? 'primary' : 'default'}
              onClick={() => handlePeriod(p)} style={{ borderRadius: 4 }}>{p.label}</Button>
          ))}
          <DatePicker.RangePicker size="small" value={dateRange} onChange={handleCustomRange}
            format="DD/MM/YYYY" allowClear={false} style={{ borderRadius: 4 }} />
        </Space>
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space wrap size={6}>
          <Button icon={<SyncOutlined spin={loading} />} onClick={loadDashboard} style={{ borderRadius: 6 }}>Refresh</Button>
          <Button type="primary" icon={<SwapOutlined />} onClick={() => history.push('/main/accountant/enter-transaction')} style={{ borderRadius: 6 }}>New Transaction</Button>
          <Button icon={<FileTextOutlined />} onClick={() => history.push('/main/accountant/journal-entries')} style={{ borderRadius: 6 }}>Journal Entry</Button>
          <Button icon={<ReconciliationOutlined />} onClick={() => history.push('/main/accountant/reconcile')} style={{ borderRadius: 6 }}>Reconcile</Button>
        </Space>
        <Space wrap size={6}>
          <Button icon={<CarryOutOutlined />} onClick={() => setChecklistOpen(true)} style={{ borderRadius: 6 }}>
            Month-end ({checklistDone}/{checklistTotal})
          </Button>
          <Button icon={<DashboardOutlined />} onClick={() => history.push('/main/analytics')} style={{ borderRadius: 6 }}>Analytics</Button>
        </Space>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" tip="Loading financial data..." /></div>}

      {!loading && (
        <>
          {/* ═══ ALERTS ════════════════════════════════════════════════ */}
          {!tbBalanced && (
            <Alert message="Trial Balance Imbalance" description="Debits and credits are not equal. Review journal entries immediately."
              type="error" showIcon icon={<WarningOutlined />}
              action={<Button size="small" type="primary" danger onClick={() => history.push('/main/accountant/trial-balance')}>Review</Button>}
              style={{ marginBottom: 12, borderRadius: 8 }} closable />
          )}
          {kpis.overdueInvoices > 0 && (
            <Alert message={`${kpis.overdueInvoices} Overdue Invoice${kpis.overdueInvoices > 1 ? 's' : ''} (${fmtC(kpis.overdueInvoiceAmt)})`}
              description="Follow up on overdue receivables to maintain healthy cash flow."
              type="warning" showIcon
              action={<Button size="small" onClick={() => history.push('/main/customers/invoices/list')}>View Invoices</Button>}
              style={{ marginBottom: 12, borderRadius: 8 }} closable />
          )}
          {kpis.ar90Plus > 0 && (
            <Alert message={`A/R 90+ Days: ${fmtC(kpis.ar90Plus)}`}
              description="Long-outstanding receivables may indicate collection issues."
              type="warning" showIcon
              action={<Button size="small" onClick={() => history.push('/main/reports/ar-aging')}>View Aging</Button>}
              style={{ marginBottom: 12, borderRadius: 8 }} closable />
          )}
          {insights.filter(i => i.severity === 'warning').slice(0, 3).map((ins, idx) => (
            <Alert key={idx} message={ins.message} type="warning" showIcon closable style={{ marginBottom: 8, borderRadius: 8 }} />
          ))}

          {/* ═══ ROW 1: HEALTH SCORE + PRIMARY KPIs ════════════════════ */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            {/* Financial Health Score */}
            <Col xs={24} sm={12} lg={4}>
              <Card size="small" bodyStyle={{ textAlign: 'center', padding: '16px 12px' }}
                style={{ borderRadius: 10, height: '100%', background: `linear-gradient(135deg, ${getHealthColor(healthScore)}08, ${getHealthColor(healthScore)}18)` }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <Progress type="circle" percent={healthScore} width={90}
                    strokeColor={getHealthColor(healthScore)} strokeWidth={8}
                    format={p => <span style={{ fontSize: 22, fontWeight: 700, color: getHealthColor(healthScore) }}>{p}</span>} />
                </div>
                <div style={{ marginTop: 8 }}>
                  <Text strong style={{ fontSize: 13 }}>Financial Health</Text>
                  <br />
                  <Tag color={getHealthColor(healthScore)} style={{ marginTop: 4, borderRadius: 4 }}>{getHealthLabel(healthScore)}</Tag>
                </div>
              </Card>
            </Col>

            {/* Revenue */}
            <Col xs={24} sm={12} lg={5}>
              <Card size="small" hoverable style={{ borderRadius: 10, borderLeft: '4px solid #52c41a', height: '100%' }}
                onClick={() => history.push('/main/reports/profit-loss')}>
                <Statistic title={<span style={{ fontSize: 12 }}>Revenue</span>} value={kpis.revenue} precision={2} prefix={cSym}
                  valueStyle={{ color: '#52c41a', fontSize: 22, fontWeight: 700 }} />
                <div style={{ marginTop: 4 }}>
                  {kpis.cogs > 0 && <Text type="secondary" style={{ fontSize: 11 }}>COGS: {fmtC(kpis.cogs)}</Text>}
                  {kpis.cogs <= 0 && <Text type="secondary" style={{ fontSize: 11 }}>Gross: {fmtC(kpis.grossProfit)}</Text>}
                </div>
              </Card>
            </Col>

            {/* Expenses */}
            <Col xs={24} sm={12} lg={5}>
              <Card size="small" hoverable style={{ borderRadius: 10, borderLeft: '4px solid #ff4d4f', height: '100%' }}
                onClick={() => history.push('/main/reports/profit-loss')}>
                <Statistic title={<span style={{ fontSize: 12 }}>Expenses</span>} value={kpis.expenses} precision={2} prefix={cSym}
                  valueStyle={{ color: '#ff4d4f', fontSize: 22, fontWeight: 700 }} />
                <Text type="secondary" style={{ fontSize: 11 }}>Gross margin: {grossMargin.toFixed(1)}%</Text>
              </Card>
            </Col>

            {/* Net Income */}
            <Col xs={24} sm={12} lg={5}>
              <Card size="small" hoverable style={{ borderRadius: 10, borderLeft: `4px solid ${kpis.netIncome >= 0 ? '#1890ff' : '#ff4d4f'}`, height: '100%' }}
                onClick={() => history.push('/main/reports/profit-loss')}>
                <Statistic title={<span style={{ fontSize: 12 }}>Net Income</span>} value={kpis.netIncome} precision={2} prefix={cSym}
                  valueStyle={{ color: kpis.netIncome >= 0 ? '#1890ff' : '#ff4d4f', fontSize: 22, fontWeight: 700 }}
                  suffix={kpis.netIncome >= 0 ? <ArrowUpOutlined style={{ fontSize: 14 }} /> : <ArrowDownOutlined style={{ fontSize: 14 }} />} />
                <Text type="secondary" style={{ fontSize: 11 }}>Margin: {profitMargin.toFixed(1)}%</Text>
              </Card>
            </Col>

            {/* Cash Position */}
            <Col xs={24} sm={12} lg={5}>
              <Card size="small" hoverable style={{ borderRadius: 10, borderLeft: '4px solid #722ed1', height: '100%' }}>
                <Statistic title={<span style={{ fontSize: 12 }}>Cash Position</span>} value={kpis.cashNet} precision={2} prefix={cSym}
                  valueStyle={{ color: kpis.cashNet >= 0 ? '#722ed1' : '#ff4d4f', fontSize: 22, fontWeight: 700 }} />
                <Text type="secondary" style={{ fontSize: 11 }}>In: {fmtC(kpis.totalCredits)} | Out: {fmtC(kpis.totalDebits)}</Text>
              </Card>
            </Col>
          </Row>

          {/* ═══ ROW 2: RECEIVABLES, PAYABLES, WORKING CAPITAL ═════════ */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small" hoverable style={{ borderRadius: 10, borderTop: '3px solid #fa8c16' }}
                onClick={() => history.push('/main/reports/ar-aging')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 11 }}>Accounts Receivable</Text>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#fa8c16' }}>{fmtC(kpis.arTotal)}</div>
                  </div>
                  {kpis.arOverdue > 0 && <Tag color="orange" style={{ borderRadius: 4 }}>Overdue: {fmtC(kpis.arOverdue)}</Tag>}
                </div>
                <Progress percent={Math.min(100, collectionRate)} size="small" strokeColor="#52c41a" showInfo={false} style={{ marginTop: 8 }} />
                <Text type="secondary" style={{ fontSize: 10 }}>Collection rate: {collectionRate.toFixed(0)}%</Text>
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small" hoverable style={{ borderRadius: 10, borderTop: '3px solid #f5222d' }}
                onClick={() => history.push('/main/reports/ap-aging')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 11 }}>Accounts Payable</Text>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#f5222d' }}>{fmtC(kpis.apTotal)}</div>
                  </div>
                  {kpis.apOverdue > 0 && <Tag color="red" style={{ borderRadius: 4 }}>Overdue: {fmtC(kpis.apOverdue)}</Tag>}
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small" style={{ borderRadius: 10, borderTop: '3px solid #1890ff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 11 }}>Open Invoices</Text>
                    <div><Text strong style={{ fontSize: 18 }}>{kpis.openInvoices}</Text> <Text type="secondary" style={{ fontSize: 11 }}>({fmtC(kpis.openInvoiceAmt)})</Text></div>
                  </div>
                  {kpis.overdueInvoices > 0 && <Badge count={kpis.overdueInvoices} overflowCount={99} style={{ backgroundColor: '#ff4d4f' }} />}
                </div>
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Open Expenses: {kpis.openExpenses} ({fmtC(kpis.openExpenseAmt)})</Text>
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small" style={{ borderRadius: 10, borderTop: `3px solid ${workingCapital >= 0 ? '#52c41a' : '#ff4d4f'}` }}>
                <Text type="secondary" style={{ fontSize: 11 }}>Working Capital</Text>
                <div style={{ fontSize: 20, fontWeight: 700, color: workingCapital >= 0 ? '#52c41a' : '#ff4d4f' }}>{fmtC(workingCapital)}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <Tag style={{ fontSize: 10, borderRadius: 4 }}>Current Ratio: {currentRatio > 100 ? '99+' : currentRatio.toFixed(2)}</Tag>
                </div>
              </Card>
            </Col>
          </Row>

          {/* ═══ ROW 3: HEALTH RATIOS ════════════════════════════════── */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={8}>
              <Card size="small" style={{ borderRadius: 10 }} bodyStyle={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 12 }}><FundOutlined /> Net Profit Margin</Text>
                  <Text style={{ fontSize: 18, fontWeight: 700, color: profitMargin >= 20 ? '#52c41a' : profitMargin >= 0 ? '#faad14' : '#ff4d4f' }}>{profitMargin.toFixed(1)}%</Text>
                </div>
                <Progress percent={Math.min(Math.abs(profitMargin), 100)} showInfo={false} size="small"
                  strokeColor={profitMargin >= 20 ? '#52c41a' : profitMargin >= 0 ? '#faad14' : '#ff4d4f'} />
                <Text type="secondary" style={{ fontSize: 10 }}>{profitMargin >= 20 ? 'Healthy - strong profitability' : profitMargin >= 10 ? 'Moderate - room for improvement' : profitMargin >= 0 ? 'Low - review cost structure' : 'Negative - immediate attention needed'}</Text>
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card size="small" style={{ borderRadius: 10 }} bodyStyle={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 12 }}><BarChartOutlined /> Gross Margin</Text>
                  <Text style={{ fontSize: 18, fontWeight: 700, color: grossMargin >= 40 ? '#52c41a' : grossMargin >= 20 ? '#faad14' : '#ff4d4f' }}>{grossMargin.toFixed(1)}%</Text>
                </div>
                <Progress percent={Math.min(Math.abs(grossMargin), 100)} showInfo={false} size="small"
                  strokeColor={grossMargin >= 40 ? '#52c41a' : grossMargin >= 20 ? '#faad14' : '#ff4d4f'} />
                <Text type="secondary" style={{ fontSize: 10 }}>Revenue less cost of goods sold</Text>
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card size="small" style={{ borderRadius: 10 }} bodyStyle={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 12 }}><CheckCircleOutlined /> Collection Rate</Text>
                  <Text style={{ fontSize: 18, fontWeight: 700, color: collectionRate >= 80 ? '#52c41a' : collectionRate >= 60 ? '#faad14' : '#ff4d4f' }}>{collectionRate.toFixed(0)}%</Text>
                </div>
                <Progress percent={Math.min(collectionRate, 100)} showInfo={false} size="small"
                  strokeColor={collectionRate >= 80 ? '#52c41a' : collectionRate >= 60 ? '#faad14' : '#ff4d4f'} />
                <Text type="secondary" style={{ fontSize: 10 }}>Percentage of A/R that is current</Text>
              </Card>
            </Col>
          </Row>

          {/* ═══ ROW 4: CHARTS (Revenue Trend + Forecast) ═══════════── */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={12}>
              <Card title={<span style={{ fontSize: 13, fontWeight: 600 }}><LineChartOutlined /> Revenue Trend</span>}
                size="small" style={{ borderRadius: 10 }} bodyStyle={{ padding: '12px 16px' }}>
                <MiniBarChart data={revenueTrend} labelKey="ym" valueKey="revenue" color="#1890ff" height={140} prefix={cSym} />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title={<span style={{ fontSize: 13, fontWeight: 600 }}><FundOutlined /> Cash Flow Forecast</span>}
                size="small" style={{ borderRadius: 10 }} bodyStyle={{ padding: '12px 16px' }}
                extra={<Button type="link" size="small" onClick={() => history.push('/main/reports/cash-flow')}>Full Report</Button>}>
                {forecast.length > 0 ? (
                  <MiniBarChart data={forecast} labelKey="ym" valueKey="net" color="#52c41a" height={140} prefix={cSym} />
                ) : (
                  <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Forecast data not available</Text>
                  </div>
                )}
              </Card>
            </Col>
          </Row>

          {/* ═══ ROW 5: A/R & A/P AGING + EXPENSE BREAKDOWN ═══════════ */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={8}>
              <Card title={<span style={{ fontSize: 13, fontWeight: 600 }}><WalletOutlined style={{ color: '#fa8c16' }} /> A/R Aging</span>}
                size="small" style={{ borderRadius: 10 }}
                extra={<Button type="link" size="small" onClick={() => history.push('/main/reports/ar-aging')}>Details</Button>}>
                <AgingBreakdown data={arAging} title="A/R" color="#fa8c16" currencyFmt={fmtC} />
              </Card>
            </Col>
            <Col xs={24} lg={8}>
              <Card title={<span style={{ fontSize: 13, fontWeight: 600 }}><CreditCardOutlined style={{ color: '#f5222d' }} /> A/P Aging</span>}
                size="small" style={{ borderRadius: 10 }}
                extra={<Button type="link" size="small" onClick={() => history.push('/main/reports/ap-aging')}>Details</Button>}>
                <AgingBreakdown data={apAging} title="A/P" color="#f5222d" currencyFmt={fmtC} />
              </Card>
            </Col>
            <Col xs={24} lg={8}>
              <Card title={<span style={{ fontSize: 13, fontWeight: 600 }}><PieChartOutlined style={{ color: '#722ed1' }} /> Expense Breakdown</span>}
                size="small" style={{ borderRadius: 10 }}
                extra={<Button type="link" size="small" onClick={() => history.push('/main/reports/profit-loss')}>P&L</Button>}>
                {expenseBreakdown.length > 0 ? (
                  <div>
                    {expenseBreakdown.map((exp, i) => {
                      const maxAmt = expenseBreakdown[0]?.amount || 1;
                      const pct = (exp.amount / maxAmt) * 100;
                      const colors = ['#722ed1', '#1890ff', '#13c2c2', '#52c41a', '#faad14', '#fa8c16', '#eb2f96', '#f5222d'];
                      return (
                        <div key={i} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                            <Text ellipsis style={{ maxWidth: '60%', fontSize: 11 }}>{exp.category || `Category ${i + 1}`}</Text>
                            <Text strong style={{ fontSize: 11 }}>{fmtC(exp.amount)}</Text>
                          </div>
                          <div style={{ height: 4, background: '#f0f0f0', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: colors[i % colors.length], borderRadius: 2, transition: 'width 0.3s' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: 20, color: '#999', fontSize: 12 }}>
                    No expense category data available
                  </div>
                )}
              </Card>
            </Col>
          </Row>

          {/* ═══ ROW 6: RECENT TRANSACTIONS + QUICK ACCESS ═════════════ */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={14}>
              <Card title={<span style={{ fontSize: 13, fontWeight: 600 }}><FieldTimeOutlined /> Recent Activity</span>}
                size="small" style={{ borderRadius: 10 }}
                extra={<Button type="link" size="small" onClick={() => history.push('/main/accountant/general-ledger')}>View All <RightOutlined /></Button>}>
                <Table columns={txnColumns} dataSource={recentTxns} rowKey={(r, i) => r.id || i}
                  size="small" pagination={false} scroll={{ x: 500 }}
                  locale={{ emptyText: 'No recent transactions' }}
                  style={{ fontSize: 12 }} />
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card title={<span style={{ fontSize: 13, fontWeight: 600 }}><ThunderboltOutlined /> Quick Access</span>}
                size="small" style={{ borderRadius: 10 }} bodyStyle={{ padding: '8px 12px' }}>
                <Row gutter={[8, 8]}>
                  {quickLinks.map((link, i) => (
                    <Col span={8} key={i}>
                      <div onClick={() => history.push(link.path)}
                        style={{ padding: '10px 6px', textAlign: 'center', cursor: 'pointer', borderRadius: 8, transition: 'all 0.2s', border: '1px solid transparent' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f6f8fa'; e.currentTarget.style.borderColor = '#e8e8e8'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>
                        <div style={{ color: link.color, fontSize: 20, marginBottom: 4 }}>{link.icon}</div>
                        <Text style={{ fontSize: 11, fontWeight: 600, display: 'block' }}>{link.title}</Text>
                        <Text type="secondary" style={{ fontSize: 9 }}>{link.desc}</Text>
                      </div>
                    </Col>
                  ))}
                </Row>
              </Card>
            </Col>
          </Row>

          {/* ═══ INSIGHTS PANEL ════════════════════════════════════════ */}
          {insights.length > 0 && (
            <Card title={<span style={{ fontSize: 13, fontWeight: 600 }}><AlertOutlined /> AI Insights & Recommendations</span>}
              size="small" style={{ borderRadius: 10, marginBottom: 16 }}>
              <Row gutter={[12, 8]}>
                {insights.slice(0, 6).map((ins, idx) => (
                  <Col xs={24} sm={12} lg={8} key={idx}>
                    <div style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #f0f0f0', background: ins.severity === 'warning' ? '#fffbe6' : ins.severity === 'error' ? '#fff2f0' : '#f6ffed', height: '100%' }}>
                      <Text style={{ fontSize: 12 }}>
                        {ins.severity === 'warning' && <WarningOutlined style={{ color: '#faad14', marginRight: 6 }} />}
                        {ins.severity === 'error' && <ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 6 }} />}
                        {ins.severity === 'info' && <InfoCircleOutlined style={{ color: '#1890ff', marginRight: 6 }} />}
                        {(!ins.severity || ins.severity === 'success') && <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />}
                        {ins.message}
                      </Text>
                    </div>
                  </Col>
                ))}
              </Row>
            </Card>
          )}

          {/* ═══ STATUS BAR ═══════════════════════════════════════════ */}
          <Card size="small" bodyStyle={{ padding: '8px 16px' }} style={{ borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <Space wrap size={6}>
                <Tag icon={tbBalanced ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
                  color={tbBalanced ? 'success' : 'error'} style={{ borderRadius: 4 }}>Books {tbBalanced ? 'Balanced' : 'Imbalanced'}</Tag>
                <Tag icon={<CalendarOutlined />} color="processing" style={{ borderRadius: 4 }}>{periodLabel} {dateRange[1]?.format('YYYY')}</Tag>
                <Tag icon={<BookOutlined />} color="default" style={{ borderRadius: 4 }}>{accountCount} Accounts</Tag>
                {kpis.outstandingCount > 0 && (
                  <Tag icon={<CreditCardOutlined />} color="warning" style={{ borderRadius: 4 }}>
                    {kpis.outstandingCount} Outstanding ({fmtC(kpis.outstandingAmt)})
                  </Tag>
                )}
              </Space>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Last refreshed: {moment().format('HH:mm:ss')}
              </Text>
            </div>
          </Card>
        </>
      )}

      {/* ═══ MONTH-END CHECKLIST DRAWER ═══════════════════════════════ */}
      <Drawer title={<span><CarryOutOutlined style={{ marginRight: 8 }} />Month-End Checklist</span>}
        width={420} visible={checklistOpen} onClose={() => setChecklistOpen(false)}
        footer={
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <Progress percent={Math.round((checklistDone / checklistTotal) * 100)}
              format={p => `${checklistDone}/${checklistTotal}`}
              strokeColor={checklistDone === checklistTotal ? '#52c41a' : '#1890ff'} />
          </div>
        }>
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">Complete these tasks to ensure accurate month-end financial reporting.</Text>
        </div>
        {[
          { key: 'reconciled', label: 'Bank Accounts Reconciled', desc: 'Match all bank transactions', icon: <ReconciliationOutlined />, path: '/main/accountant/reconcile' },
          { key: 'journalReviewed', label: 'Journal Entries Reviewed', desc: 'Verify all adjusting entries', icon: <FileTextOutlined />, path: '/main/accountant/journal-entries' },
          { key: 'tbBalanced', label: 'Trial Balance Verified', desc: 'Debits equal credits', icon: <CalculatorOutlined />, path: '/main/accountant/trial-balance' },
          { key: 'arReviewed', label: 'A/R Aging Reviewed', desc: 'Follow up on overdue invoices', icon: <WalletOutlined />, path: '/main/reports/ar-aging' },
          { key: 'apReviewed', label: 'A/P Aging Reviewed', desc: 'Schedule payments for due bills', icon: <CreditCardOutlined />, path: '/main/reports/ap-aging' },
          { key: 'depreciationRun', label: 'Depreciation Processed', desc: 'Run fixed asset depreciation', icon: <SafetyOutlined />, path: '/main/accountant/fixed-assets' },
          { key: 'closingSet', label: 'Closing Date Set', desc: 'Lock the period from changes', icon: <FileDoneOutlined />, path: '/main/accountant/closing-date' },
          { key: 'reportsGenerated', label: 'Financial Reports Generated', desc: 'P&L, Balance Sheet, Cash Flow', icon: <BarChartOutlined />, path: '/main/reports/profit-loss' },
        ].map(item => (
          <div key={item.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
            <Checkbox checked={checklist[item.key]}
              onChange={e => setChecklist(prev => ({ ...prev, [item.key]: e.target.checked }))} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: checklist[item.key] ? '#52c41a' : '#595959' }}>{item.icon}</span>
                <Text strong style={{ fontSize: 13, textDecoration: checklist[item.key] ? 'line-through' : 'none', color: checklist[item.key] ? '#999' : '#262626' }}>
                  {item.label}
                </Text>
              </div>
              <Text type="secondary" style={{ fontSize: 11 }}>{item.desc}</Text>
            </div>
            <Button type="link" size="small" icon={<RightOutlined />}
              onClick={() => { setChecklistOpen(false); history.push(item.path); }} />
          </div>
        ))}
      </Drawer>
    </div>
  );
};

export default AccountantCenter;
