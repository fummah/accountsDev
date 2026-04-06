import React, { useState, useEffect } from 'react';
import { Card, DatePicker, Button, Table, Statistic, Row, Col, Space, Tag, Typography, Tooltip, Select, Divider, message, Progress } from 'antd';
import { PrinterOutlined, DownloadOutlined, SyncOutlined, CalendarOutlined, ArrowUpOutlined, ArrowDownOutlined, SwapOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;
const { Option } = Select;

const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v, total) => total ? ((v / total) * 100).toFixed(1) + '%' : '0.0%';

const ProfitLoss = () => {
  const { symbol: cSym } = useCurrency();
  const fmtC = (v) => `${cSym} ${fmt(v)}`;
  const [dateRange, setDateRange] = useState([moment().startOf('year'), moment().endOf('year')]);
  const [compareRange, setCompareRange] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [data, setData] = useState({ income: [], cogs: [], expenses: [], summary: { totalIncome: 0, totalCOGS: 0, grossProfit: 0, totalExpenses: 0, operatingProfit: 0, netIncome: 0 } });
  const [priorData, setPriorData] = useState(null);

  useEffect(() => { if (dateRange && dateRange[0] && dateRange[1]) loadReport(); }, [dateRange]);
  useEffect(() => { if (showCompare && compareRange && compareRange[0] && compareRange[1]) loadComparison(); else setPriorData(null); }, [compareRange, showCompare]);

  const mapReport = (result) => {
    const profit = result?.profitLoss || {};
    const revenue = Number(profit.revenue || 0);
    const cogs = Number(profit.cogs || 0);
    const opex = Number(profit.operatingExpenses || 0);
    const gross = revenue - cogs;
    const net = Number(profit.netProfit != null ? profit.netProfit : (revenue - cogs - opex));
    return {
      income: [{ key: 'revenue', category: 'Sales Revenue', amount: revenue, isHeader: false }],
      cogs: [{ key: 'cogs', category: 'Cost of Goods Sold', amount: cogs, isHeader: false }],
      expenses: [{ key: 'opex', category: 'Operating Expenses', amount: opex, isHeader: false }],
      summary: { totalIncome: revenue, totalCOGS: cogs, grossProfit: gross, totalExpenses: opex, operatingProfit: gross - opex, netIncome: net },
    };
  };

  const loadReport = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.getFinancialReport(dateRange[0].format('YYYY-MM-DD'), dateRange[1].format('YYYY-MM-DD'));
      setData(mapReport(result));
    } catch (e) { console.error('P&L load error:', e); }
    finally { setLoading(false); }
  };

  const loadComparison = async () => {
    try {
      const result = await window.electronAPI.getFinancialReport(compareRange[0].format('YYYY-MM-DD'), compareRange[1].format('YYYY-MM-DD'));
      setPriorData(mapReport(result));
    } catch { setPriorData(null); }
  };

  const setPreset = (key) => {
    const now = moment();
    switch (key) {
      case 'thisMonth': setDateRange([now.clone().startOf('month'), now.clone().endOf('month')]); break;
      case 'lastMonth': setDateRange([now.clone().subtract(1, 'month').startOf('month'), now.clone().subtract(1, 'month').endOf('month')]); break;
      case 'thisQuarter': setDateRange([now.clone().startOf('quarter'), now.clone().endOf('quarter')]); break;
      case 'lastQuarter': setDateRange([now.clone().subtract(1, 'quarter').startOf('quarter'), now.clone().subtract(1, 'quarter').endOf('quarter')]); break;
      case 'thisYear': setDateRange([now.clone().startOf('year'), now.clone().endOf('year')]); break;
      case 'lastYear': setDateRange([now.clone().subtract(1, 'year').startOf('year'), now.clone().subtract(1, 'year').endOf('year')]); break;
      default: break;
    }
  };

  const variance = (current, prior) => {
    if (!prior) return null;
    const diff = current - prior;
    const pctChange = prior !== 0 ? ((diff / Math.abs(prior)) * 100) : (current !== 0 ? 100 : 0);
    return { diff, pctChange };
  };

  const renderVariance = (current, prior) => {
    const v = variance(current, prior);
    if (!v) return null;
    const isUp = v.diff > 0;
    return (
      <Tooltip title={`${isUp ? '+' : ''}${fmt(v.diff)} (${isUp ? '+' : ''}${v.pctChange.toFixed(1)}%)`}>
        <Tag color={isUp ? 'green' : v.diff < 0 ? 'red' : 'default'} style={{ marginLeft: 4, fontSize: 11 }}>
          {isUp ? <ArrowUpOutlined /> : v.diff < 0 ? <ArrowDownOutlined /> : null} {Math.abs(v.pctChange).toFixed(1)}%
        </Tag>
      </Tooltip>
    );
  };

  const handlePrint = () => {
    const s = data.summary;
    const rows = [
      ['INCOME', '', ''], ...data.income.map(r => ['  ' + r.category, fmt(r.amount), pct(r.amount, s.totalIncome)]),
      ['Total Income', fmt(s.totalIncome), '100.0%'], ['', '', ''],
      ['COST OF GOODS SOLD', '', ''], ...data.cogs.map(r => ['  ' + r.category, fmt(r.amount), pct(r.amount, s.totalIncome)]),
      ['Total COGS', fmt(s.totalCOGS), pct(s.totalCOGS, s.totalIncome)], ['', '', ''],
      ['GROSS PROFIT', fmt(s.grossProfit), pct(s.grossProfit, s.totalIncome)], ['', '', ''],
      ['OPERATING EXPENSES', '', ''], ...data.expenses.map(r => ['  ' + r.category, fmt(r.amount), pct(r.amount, s.totalIncome)]),
      ['Total Operating Expenses', fmt(s.totalExpenses), pct(s.totalExpenses, s.totalIncome)], ['', '', ''],
      ['NET INCOME', fmt(s.netIncome), pct(s.netIncome, s.totalIncome)],
    ];
    const rowsHtml = rows.map(r => `<tr><td style="padding:4px 8px">${r[0]}</td><td style="text-align:right;padding:4px 8px">${r[1]}</td><td style="text-align:right;padding:4px 8px">${r[2]}</td></tr>`).join('');
    const html = `<!doctype html><html><head><title>Profit & Loss</title><style>body{font-family:Arial,sans-serif}table{width:100%;border-collapse:collapse}td{border-bottom:1px solid #eee}tr:last-child td{border-bottom:2px solid #333;font-weight:bold}</style></head><body><h2>Profit & Loss Statement</h2><p>${dateRange[0].format('DD MMM YYYY')} — ${dateRange[1].format('DD MMM YYYY')}</p><table><thead><tr><th style="text-align:left">Account</th><th style="text-align:right">Amount</th><th style="text-align:right">% of Revenue</th></tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`;
    const w = window.open('', '_blank'); w.document.open(); w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300);
  };

  const handleExport = () => {
    const s = data.summary;
    const lines = [['Category', 'Amount', '% of Revenue'].join(',')];
    data.income.forEach(r => lines.push([r.category, r.amount, pct(r.amount, s.totalIncome)].join(',')));
    lines.push(['Total Income', s.totalIncome, '100.0%'].join(','));
    data.cogs.forEach(r => lines.push([r.category, r.amount, pct(r.amount, s.totalIncome)].join(',')));
    lines.push(['Total COGS', s.totalCOGS, pct(s.totalCOGS, s.totalIncome)].join(','));
    lines.push(['Gross Profit', s.grossProfit, pct(s.grossProfit, s.totalIncome)].join(','));
    data.expenses.forEach(r => lines.push([r.category, r.amount, pct(r.amount, s.totalIncome)].join(',')));
    lines.push(['Total Operating Expenses', s.totalExpenses, pct(s.totalExpenses, s.totalIncome)].join(','));
    lines.push(['Net Income', s.netIncome, pct(s.netIncome, s.totalIncome)].join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `profit-loss-${dateRange[0].format('YYYYMMDD')}-${dateRange[1].format('YYYYMMDD')}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const s = data.summary;
  const ps = priorData?.summary;
  const profitMargin = s.totalIncome > 0 ? (s.netIncome / s.totalIncome * 100) : 0;
  const grossMargin = s.totalIncome > 0 ? (s.grossProfit / s.totalIncome * 100) : 0;

  const sectionColumns = (sectionTitle, totalKey) => [
    { title: sectionTitle, dataIndex: 'category', key: 'category', render: (t, r) => r.isHeader ? <Text strong>{t}</Text> : <Text style={{ paddingLeft: 16 }}>{t}</Text> },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right', width: 150, render: v => <Text>{fmt(v)}</Text> },
    { title: '% of Revenue', dataIndex: 'amount', key: 'pct', align: 'right', width: 120, render: v => <Text type="secondary">{pct(v, s.totalIncome)}</Text> },
    ...(priorData ? [{ title: 'Prior Period', key: 'prior', align: 'right', width: 150, render: (_, r) => { const pr = priorData[totalKey]?.find(p => p.key === r.key); return pr ? <Text type="secondary">{fmt(pr.amount)}</Text> : '-'; } }] : []),
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Profit & Loss Statement</Title>
          <Text type="secondary">{dateRange[0]?.format('DD MMM YYYY')} — {dateRange[1]?.format('DD MMM YYYY')}</Text>
        </div>
        <Space wrap>
          <Select defaultValue="thisYear" style={{ width: 140 }} onChange={setPreset} suffixIcon={<CalendarOutlined />}>
            <Option value="thisMonth">This Month</Option>
            <Option value="lastMonth">Last Month</Option>
            <Option value="thisQuarter">This Quarter</Option>
            <Option value="lastQuarter">Last Quarter</Option>
            <Option value="thisYear">This Year</Option>
            <Option value="lastYear">Last Year</Option>
          </Select>
          <RangePicker value={dateRange} onChange={setDateRange} />
          <Button icon={<SwapOutlined />} onClick={() => { setShowCompare(!showCompare); if (showCompare) setPriorData(null); }}>{showCompare ? 'Hide Compare' : 'Compare'}</Button>
          <Button icon={<PrinterOutlined />} onClick={handlePrint}>Print</Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>Export</Button>
          <Button icon={<SyncOutlined spin={loading} />} onClick={loadReport} />
        </Space>
      </div>

      {showCompare && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space>
            <Text>Comparison Period:</Text>
            <RangePicker value={compareRange} onChange={setCompareRange} />
          </Space>
        </Card>
      )}

      {/* Summary KPIs */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable size="small" style={{ borderTop: '3px solid #52c41a' }}>
            <Statistic title="Total Revenue" value={s.totalIncome} precision={2} prefix={cSym} valueStyle={{ color: '#52c41a', fontSize: 20 }} />
            {ps && renderVariance(s.totalIncome, ps.totalIncome)}
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable size="small" style={{ borderTop: '3px solid #1890ff' }}>
            <Statistic title="Gross Profit" value={s.grossProfit} precision={2} prefix={cSym} valueStyle={{ color: '#1890ff', fontSize: 20 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>Margin: {grossMargin.toFixed(1)}%</Text>
            {ps && renderVariance(s.grossProfit, ps.grossProfit)}
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable size="small" style={{ borderTop: '3px solid #ff4d4f' }}>
            <Statistic title="Total Expenses" value={s.totalExpenses} precision={2} prefix={cSym} valueStyle={{ color: '#ff4d4f', fontSize: 20 }} />
            {ps && renderVariance(s.totalExpenses, ps.totalExpenses)}
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable size="small" style={{ borderTop: s.netIncome >= 0 ? '3px solid #52c41a' : '3px solid #ff4d4f' }}>
            <Statistic title="Net Income" value={s.netIncome} precision={2} prefix={cSym} valueStyle={{ color: s.netIncome >= 0 ? '#52c41a' : '#ff4d4f', fontSize: 20 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>Margin: {profitMargin.toFixed(1)}%</Text>
            {ps && renderVariance(s.netIncome, ps.netIncome)}
          </Card>
        </Col>
      </Row>

      {/* Margin Bars */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Card size="small">
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Gross Margin</Text>
            <Progress percent={Math.min(Math.abs(grossMargin), 100)} status={grossMargin >= 0 ? 'active' : 'exception'} format={() => `${grossMargin.toFixed(1)}%`} strokeColor={grossMargin >= 40 ? '#52c41a' : grossMargin >= 20 ? '#faad14' : '#ff4d4f'} />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card size="small">
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Net Profit Margin</Text>
            <Progress percent={Math.min(Math.abs(profitMargin), 100)} status={profitMargin >= 0 ? 'active' : 'exception'} format={() => `${profitMargin.toFixed(1)}%`} strokeColor={profitMargin >= 20 ? '#52c41a' : profitMargin >= 10 ? '#faad14' : '#ff4d4f'} />
          </Card>
        </Col>
      </Row>

      {/* Income Section */}
      <Card title={<Text strong style={{ fontSize: 15 }}>Revenue / Income</Text>} size="small" style={{ marginBottom: 16 }} bodyStyle={{ padding: 0 }}>
        <Table columns={sectionColumns('Category', 'income')} dataSource={data.income} rowKey="key" loading={loading} pagination={false} size="small"
          summary={() => (
            <Table.Summary.Row style={{ background: '#fafafa' }}>
              <Table.Summary.Cell><Text strong>Total Revenue</Text></Table.Summary.Cell>
              <Table.Summary.Cell align="right"><Text strong>{fmt(s.totalIncome)}</Text></Table.Summary.Cell>
              <Table.Summary.Cell align="right"><Text strong>100.0%</Text></Table.Summary.Cell>
              {priorData && <Table.Summary.Cell align="right"><Text strong type="secondary">{fmt(ps?.totalIncome)}</Text></Table.Summary.Cell>}
            </Table.Summary.Row>
          )} />
      </Card>

      {/* COGS Section */}
      <Card title={<Text strong style={{ fontSize: 15 }}>Cost of Goods Sold</Text>} size="small" style={{ marginBottom: 16 }} bodyStyle={{ padding: 0 }}>
        <Table columns={sectionColumns('Category', 'cogs')} dataSource={data.cogs} rowKey="key" loading={loading} pagination={false} size="small"
          summary={() => (
            <>
              <Table.Summary.Row style={{ background: '#fafafa' }}>
                <Table.Summary.Cell><Text strong>Total COGS</Text></Table.Summary.Cell>
                <Table.Summary.Cell align="right"><Text strong>{fmt(s.totalCOGS)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell align="right"><Text strong type="secondary">{pct(s.totalCOGS, s.totalIncome)}</Text></Table.Summary.Cell>
                {priorData && <Table.Summary.Cell align="right"><Text strong type="secondary">{fmt(ps?.totalCOGS)}</Text></Table.Summary.Cell>}
              </Table.Summary.Row>
              <Table.Summary.Row style={{ background: '#e6f7ff' }}>
                <Table.Summary.Cell><Text strong style={{ color: '#1890ff' }}>GROSS PROFIT</Text></Table.Summary.Cell>
                <Table.Summary.Cell align="right"><Text strong style={{ color: '#1890ff' }}>{fmt(s.grossProfit)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell align="right"><Text strong style={{ color: '#1890ff' }}>{pct(s.grossProfit, s.totalIncome)}</Text></Table.Summary.Cell>
                {priorData && <Table.Summary.Cell align="right"><Text strong style={{ color: '#1890ff' }}>{fmt(ps?.grossProfit)}</Text></Table.Summary.Cell>}
              </Table.Summary.Row>
            </>
          )} />
      </Card>

      {/* Operating Expenses Section */}
      <Card title={<Text strong style={{ fontSize: 15 }}>Operating Expenses</Text>} size="small" style={{ marginBottom: 16 }} bodyStyle={{ padding: 0 }}>
        <Table columns={sectionColumns('Category', 'expenses')} dataSource={data.expenses} rowKey="key" loading={loading} pagination={false} size="small"
          summary={() => (
            <>
              <Table.Summary.Row style={{ background: '#fafafa' }}>
                <Table.Summary.Cell><Text strong>Total Operating Expenses</Text></Table.Summary.Cell>
                <Table.Summary.Cell align="right"><Text strong>{fmt(s.totalExpenses)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell align="right"><Text strong type="secondary">{pct(s.totalExpenses, s.totalIncome)}</Text></Table.Summary.Cell>
                {priorData && <Table.Summary.Cell align="right"><Text strong type="secondary">{fmt(ps?.totalExpenses)}</Text></Table.Summary.Cell>}
              </Table.Summary.Row>
            </>
          )} />
      </Card>

      {/* Net Income Summary */}
      <Card style={{ background: s.netIncome >= 0 ? '#f6ffed' : '#fff2f0', border: s.netIncome >= 0 ? '1px solid #b7eb8f' : '1px solid #ffa39e' }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Title level={4} style={{ margin: 0, color: s.netIncome >= 0 ? '#52c41a' : '#ff4d4f' }}>
              NET INCOME: ${fmt(s.netIncome)}
            </Title>
            <Text type="secondary">Net Profit Margin: {profitMargin.toFixed(1)}% &middot; Gross Margin: {grossMargin.toFixed(1)}%</Text>
          </Col>
          {ps && (
            <Col>
              <Text type="secondary">Prior Period: ${fmt(ps.netIncome)}</Text>
              {renderVariance(s.netIncome, ps.netIncome)}
            </Col>
          )}
        </Row>
      </Card>
    </div>
  );
};

export default ProfitLoss;