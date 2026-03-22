import React, { useEffect, useState } from "react";
import { Card, Col, Row, Progress, Tooltip, Tag, Typography } from "antd";
import {
  CheckCircleOutlined, WarningOutlined, ExclamationCircleOutlined,
  ArrowUpOutlined, ArrowDownOutlined, DashOutlined
} from "@ant-design/icons";

const { Text, Title } = Typography;

const fmtMoney = (v) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(0);
};

const HealthIndicator = ({ label, value, suffix, target, invertColor, tooltip }) => {
  const num = Number(value) || 0;
  let color = '#52c41a';
  let icon = <CheckCircleOutlined />;
  if (target) {
    const { good, warn } = target;
    const isGood = invertColor ? num <= good : num >= good;
    const isWarn = invertColor ? num <= warn : num >= warn;
    if (!isGood && !isWarn) { color = '#f5222d'; icon = <ExclamationCircleOutlined />; }
    else if (!isGood) { color = '#faad14'; icon = <WarningOutlined />; }
  }
  return (
    <Tooltip title={tooltip || label}>
      <div style={{ textAlign: 'center', padding: '8px 4px' }}>
        <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color }}>
          {icon} {typeof value === 'number' ? value.toFixed(suffix === '%' ? 1 : 2) : value}{suffix || ''}
        </div>
      </div>
    </Tooltip>
  );
};

const FinancialHealth = ({ summary }) => {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    const compute = async () => {
      try {
        const s = summary || await window.electronAPI?.getDashboardSummary?.();
        if (!s) return;

        const totalRevenue = (s.monthlyPerformance || []).reduce((acc, m) => acc + (Number(m.revenue) || 0), 0);
        const totalExpenses = (s.expenseAnalysis || s.expenselist || []).reduce((acc, e) => acc + (Number(e.value || e.amount) || 0), 0);
        const netProfit = totalRevenue - totalExpenses;

        const openInvAmt = Number(s.open_invoice?.[0]?.open_total_amount) || 0;
        const dueInvAmt = Number(s.due_invoice?.[0]?.due_total_amount) || 0;
        const openExpAmt = Number(s.open_expense?.[0]?.open_total_amount_expense) || 0;
        const dueExpAmt = Number(s.due_expense?.[0]?.due_total_amount_expense) || 0;

        const grossMargin = totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0;
        const currentRatio = openExpAmt > 0 ? (openInvAmt / openExpAmt) : openInvAmt > 0 ? 99 : 0;
        const dso = totalRevenue > 0 ? (openInvAmt / (totalRevenue / 365)) : 0;
        const dpo = totalExpenses > 0 ? (openExpAmt / (totalExpenses / 365)) : 0;
        const burnRate = totalExpenses / Math.max((s.monthlyPerformance || []).length, 1);
        const runway = burnRate > 0 ? ((openInvAmt - openExpAmt) / burnRate) : 99;
        const collectionRate = openInvAmt > 0 ? ((1 - (dueInvAmt / openInvAmt)) * 100) : 100;
        const overduePct = openExpAmt > 0 ? ((dueExpAmt / openExpAmt) * 100) : 0;

        const overallScore = Math.min(100, Math.max(0,
          (grossMargin > 0 ? 25 : 0) +
          (currentRatio >= 1 ? 25 : currentRatio * 25) +
          (collectionRate >= 80 ? 25 : (collectionRate / 80) * 25) +
          (overduePct < 20 ? 25 : Math.max(0, (1 - overduePct / 100) * 25))
        ));

        setMetrics({
          totalRevenue, totalExpenses, netProfit,
          grossMargin, currentRatio, dso, dpo,
          burnRate, runway, collectionRate, overduePct,
          overallScore, openInvAmt, openExpAmt, dueInvAmt, dueExpAmt,
        });
      } catch (e) {
        console.error('FinancialHealth compute error:', e);
      }
    };
    compute();
  }, [summary]);

  if (!metrics) return null;

  const scoreColor = metrics.overallScore >= 75 ? '#52c41a' : metrics.overallScore >= 50 ? '#faad14' : '#f5222d';
  const scoreLabel = metrics.overallScore >= 75 ? 'Healthy' : metrics.overallScore >= 50 ? 'Needs Attention' : 'At Risk';

  return (
    <Card
      title={<span style={{ fontWeight: 600, fontSize: 15 }}>Financial Health Score</span>}
      size="small"
      style={{ marginBottom: 16 }}
      extra={<Tag color={scoreColor} style={{ fontSize: 13, padding: '2px 10px' }}>{scoreLabel}</Tag>}
    >
      <Row gutter={8} align="middle">
        <Col span={4} style={{ textAlign: 'center' }}>
          <Progress
            type="dashboard"
            percent={Math.round(metrics.overallScore)}
            strokeColor={scoreColor}
            width={90}
            format={p => <span style={{ fontSize: 20, fontWeight: 700 }}>{p}</span>}
          />
          <div style={{ fontSize: 11, color: '#8c8c8c' }}>Overall</div>
        </Col>
        <Col span={20}>
          <Row gutter={4}>
            <Col span={4}>
              <HealthIndicator
                label="Gross Margin"
                value={metrics.grossMargin}
                suffix="%"
                target={{ good: 30, warn: 10 }}
                tooltip="(Revenue - Expenses) / Revenue"
              />
            </Col>
            <Col span={4}>
              <HealthIndicator
                label="Current Ratio"
                value={metrics.currentRatio}
                suffix="x"
                target={{ good: 1.5, warn: 1.0 }}
                tooltip="Receivables / Payables — above 1.0 is good"
              />
            </Col>
            <Col span={4}>
              <HealthIndicator
                label="Days Sales O/S"
                value={metrics.dso}
                suffix="d"
                target={{ good: 30, warn: 60 }}
                invertColor
                tooltip="Avg days to collect payment"
              />
            </Col>
            <Col span={4}>
              <HealthIndicator
                label="Collection Rate"
                value={metrics.collectionRate}
                suffix="%"
                target={{ good: 80, warn: 60 }}
                tooltip="% of invoices paid on time"
              />
            </Col>
            <Col span={4}>
              <HealthIndicator
                label="Bills Overdue"
                value={metrics.overduePct}
                suffix="%"
                target={{ good: 10, warn: 30 }}
                invertColor
                tooltip="% of payables that are past due"
              />
            </Col>
            <Col span={4}>
              <HealthIndicator
                label="Cash Runway"
                value={metrics.runway}
                suffix="mo"
                target={{ good: 6, warn: 3 }}
                tooltip="Months of expenses covered by net receivables"
              />
            </Col>
          </Row>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, padding: '6px 8px', background: '#fafafa', borderRadius: 6, fontSize: 12 }}>
            <span><Text type="secondary">Revenue:</Text> <Text strong style={{ color: '#52c41a' }}>{fmtMoney(metrics.totalRevenue)}</Text></span>
            <span><Text type="secondary">Expenses:</Text> <Text strong style={{ color: '#f5222d' }}>{fmtMoney(metrics.totalExpenses)}</Text></span>
            <span><Text type="secondary">Net:</Text> <Text strong style={{ color: metrics.netProfit >= 0 ? '#52c41a' : '#f5222d' }}>{fmtMoney(metrics.netProfit)}</Text></span>
            <span><Text type="secondary">A/R:</Text> <Text strong>{fmtMoney(metrics.openInvAmt)}</Text></span>
            <span><Text type="secondary">A/P:</Text> <Text strong>{fmtMoney(metrics.openExpAmt)}</Text></span>
            <span><Text type="secondary">Burn/mo:</Text> <Text strong>{fmtMoney(metrics.burnRate)}</Text></span>
          </div>
        </Col>
      </Row>
    </Card>
  );
};

export default FinancialHealth;
