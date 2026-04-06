import React, { useState, useEffect } from 'react';
import { Card, DatePicker, Button, Table, Row, Col, Statistic, Space, Typography, Alert, Tag, Progress, Tooltip, Select, message } from 'antd';
import { PrinterOutlined, DownloadOutlined, SyncOutlined, BankOutlined, CheckCircleOutlined, WarningOutlined, CalendarOutlined, SwapOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { Title, Text } = Typography;
const { Option } = Select;

const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BalanceSheet = () => {
  const { symbol: cSym } = useCurrency();
  const [date, setDate] = useState(moment());
  const [loading, setLoading] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [compareDate, setCompareDate] = useState(null);
  const [balanceSheet, setBalanceSheet] = useState({ assets: [], liabilities: [], equity: [], summary: { totalAssets: 0, totalLiabilities: 0, totalEquity: 0 } });
  const [priorBS, setPriorBS] = useState(null);

  useEffect(() => { if (date) loadBalanceSheet(); }, [date]);
  useEffect(() => { if (showCompare && compareDate) loadComparison(); else setPriorBS(null); }, [compareDate, showCompare]);

  const extractBS = (report) => {
    const data = report?.balanceSheet || {};
    return {
      assets: Array.isArray(data.assets) ? data.assets : [],
      liabilities: Array.isArray(data.liabilities) ? data.liabilities : [],
      equity: Array.isArray(data.equity) ? data.equity : [],
      summary: {
        totalAssets: Number(data.summary?.totalAssets || 0),
        totalLiabilities: Number(data.summary?.totalLiabilities || 0),
        totalEquity: Number(data.summary?.totalEquity || 0),
      },
    };
  };

  const loadBalanceSheet = async () => {
    try {
      setLoading(true);
      const d = date.clone();
      const report = await window.electronAPI.getFinancialReport(d.startOf('day').format('YYYY-MM-DD'), d.endOf('day').format('YYYY-MM-DD'));
      setBalanceSheet(extractBS(report));
    } catch (error) {
      console.error('Failed to load balance sheet:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadComparison = async () => {
    try {
      const d = compareDate.clone();
      const report = await window.electronAPI.getFinancialReport(d.startOf('day').format('YYYY-MM-DD'), d.endOf('day').format('YYYY-MM-DD'));
      setPriorBS(extractBS(report));
    } catch { setPriorBS(null); }
  };

  const s = balanceSheet.summary;
  const ps = priorBS?.summary;
  const liabPlusEquity = s.totalLiabilities + s.totalEquity;
  const isBalanced = Math.abs(s.totalAssets - liabPlusEquity) < 0.01;

  // Financial ratios
  const currentRatio = s.totalLiabilities > 0 ? (s.totalAssets / s.totalLiabilities) : 0;
  const debtToEquity = s.totalEquity > 0 ? (s.totalLiabilities / s.totalEquity) : 0;
  const equityRatio = s.totalAssets > 0 ? ((s.totalEquity / s.totalAssets) * 100) : 0;
  const workingCapital = s.totalAssets - s.totalLiabilities;

  const variance = (current, prior) => {
    if (prior == null) return null;
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

  const setPreset = (key) => {
    const now = moment();
    switch (key) {
      case 'today': setDate(now.clone()); break;
      case 'endLastMonth': setDate(now.clone().subtract(1, 'month').endOf('month')); break;
      case 'endLastQuarter': setDate(now.clone().subtract(1, 'quarter').endOf('quarter')); break;
      case 'endLastYear': setDate(now.clone().subtract(1, 'year').endOf('year')); break;
      default: break;
    }
  };

  const sectionColumns = (sectionTitle) => {
    const cols = [
      { title: sectionTitle, dataIndex: 'category', key: 'category', render: (text, record) => record.isSubcategory ? <Text style={{ paddingLeft: 20 }}>{text}</Text> : <Text strong>{text}</Text> },
      { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right', width: 150, render: v => <Text>{fmt(v)}</Text> },
    ];
    if (priorBS) {
      cols.push({
        title: 'Prior', key: 'prior', align: 'right', width: 150,
        render: (_, r) => {
          const sections = sectionTitle.toLowerCase().includes('asset') ? priorBS.assets : sectionTitle.toLowerCase().includes('liabilit') ? priorBS.liabilities : priorBS.equity;
          const pr = sections.find(p => p.category === r.category);
          return pr ? <Text type="secondary">{fmt(pr.amount)}</Text> : '-';
        },
      });
      cols.push({
        title: 'Change', key: 'change', align: 'right', width: 100,
        render: (_, r) => {
          const sections = sectionTitle.toLowerCase().includes('asset') ? priorBS.assets : sectionTitle.toLowerCase().includes('liabilit') ? priorBS.liabilities : priorBS.equity;
          const pr = sections.find(p => p.category === r.category);
          return pr ? renderVariance(Number(r.amount || 0), Number(pr.amount || 0)) : null;
        },
      });
    }
    return cols;
  };

  const handlePrint = () => {
    const assets = balanceSheet.assets;
    const liabilities = balanceSheet.liabilities;
    const equity = balanceSheet.equity;
    const section = (title, rows, total) => `<h3>${title}</h3><table><thead><tr><th style="text-align:left">Category</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.isSubcategory ? '&nbsp;&nbsp;&nbsp;&nbsp;' : ''}${r.category}</td><td style="text-align:right">${fmt(r.amount)}</td></tr>`).join('')}</tbody><tfoot><tr><td><strong>Total ${title}</strong></td><td style="text-align:right"><strong>${fmt(total)}</strong></td></tr></tfoot></table>`;
    const html = `<!doctype html><html><head><title>Balance Sheet</title><style>body{font-family:Arial,sans-serif;font-size:12px}table{width:100%;border-collapse:collapse;margin-bottom:16px}td,th{border:1px solid #ddd;padding:6px}th{background:#f5f5f5}tfoot td{border-top:2px solid #333;font-weight:bold}</style></head><body><h2>Balance Sheet</h2><p>As at ${date.format('DD MMM YYYY')}</p>${section('Assets', assets, s.totalAssets)}${section('Liabilities', liabilities, s.totalLiabilities)}${section('Equity', equity, s.totalEquity)}<h3>Accounting Equation</h3><p>Assets (${fmt(s.totalAssets)}) = Liabilities (${fmt(s.totalLiabilities)}) + Equity (${fmt(s.totalEquity)}) = ${fmt(liabPlusEquity)}</p><p style="color:${isBalanced ? 'green' : 'red'}"><strong>${isBalanced ? 'BALANCED' : 'NOT BALANCED — Difference: ' + fmt(Math.abs(s.totalAssets - liabPlusEquity))}</strong></p></body></html>`;
    const w = window.open('', '_blank'); w.document.open(); w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300);
  };

  const handleExport = () => {
    const lines = [['Section', 'Category', 'Amount'].join(',')];
    balanceSheet.assets.forEach(r => lines.push(['Assets', `"${r.category}"`, Number(r.amount || 0).toFixed(2)].join(',')));
    lines.push(['Assets', 'TOTAL ASSETS', s.totalAssets.toFixed(2)].join(','));
    balanceSheet.liabilities.forEach(r => lines.push(['Liabilities', `"${r.category}"`, Number(r.amount || 0).toFixed(2)].join(',')));
    lines.push(['Liabilities', 'TOTAL LIABILITIES', s.totalLiabilities.toFixed(2)].join(','));
    balanceSheet.equity.forEach(r => lines.push(['Equity', `"${r.category}"`, Number(r.amount || 0).toFixed(2)].join(',')));
    lines.push(['Equity', 'TOTAL EQUITY', s.totalEquity.toFixed(2)].join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `balance-sheet-${date.format('YYYYMMDD')}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}><BankOutlined style={{ marginRight: 8 }} />Balance Sheet</Title>
          <Text type="secondary">As at {date.format('DD MMM YYYY')}</Text>
        </div>
        <Space wrap>
          <Select defaultValue="today" style={{ width: 150 }} onChange={setPreset} suffixIcon={<CalendarOutlined />}>
            <Option value="today">Today</Option>
            <Option value="endLastMonth">End of Last Month</Option>
            <Option value="endLastQuarter">End of Last Quarter</Option>
            <Option value="endLastYear">End of Last Year</Option>
          </Select>
          <DatePicker value={date} onChange={setDate} />
          <Button icon={<SwapOutlined />} onClick={() => { setShowCompare(!showCompare); if (showCompare) setPriorBS(null); }}>{showCompare ? 'Hide Compare' : 'Compare'}</Button>
          <Button icon={<PrinterOutlined />} onClick={handlePrint}>Print</Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>Export</Button>
          <Button icon={<SyncOutlined spin={loading} />} onClick={loadBalanceSheet} />
        </Space>
      </div>

      {showCompare && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space>
            <Text>Compare with:</Text>
            <DatePicker value={compareDate} onChange={setCompareDate} />
          </Space>
        </Card>
      )}

      {/* Accounting Equation Alert */}
      <Alert
        message={isBalanced ? 'Accounting Equation Balanced' : 'Accounting Equation NOT Balanced'}
        description={`Assets (${fmt(s.totalAssets)}) ${isBalanced ? '=' : '\u2260'} Liabilities (${fmt(s.totalLiabilities)}) + Equity (${fmt(s.totalEquity)}) = ${fmt(liabPlusEquity)}`}
        type={isBalanced ? 'success' : 'error'}
        showIcon
        icon={isBalanced ? <CheckCircleOutlined /> : <WarningOutlined />}
        style={{ marginBottom: 16 }}
      />

      {/* Primary KPIs */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <Card hoverable size="small" style={{ borderTop: '3px solid #1890ff' }}>
            <Statistic title="Total Assets" value={s.totalAssets} precision={2} prefix={cSym} valueStyle={{ color: '#1890ff', fontSize: 20 }} />
            {ps && renderVariance(s.totalAssets, ps.totalAssets)}
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card hoverable size="small" style={{ borderTop: '3px solid #ff4d4f' }}>
            <Statistic title="Total Liabilities" value={s.totalLiabilities} precision={2} prefix={cSym} valueStyle={{ color: '#ff4d4f', fontSize: 20 }} />
            {ps && renderVariance(s.totalLiabilities, ps.totalLiabilities)}
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card hoverable size="small" style={{ borderTop: '3px solid #52c41a' }}>
            <Statistic title="Total Equity" value={s.totalEquity} precision={2} prefix={cSym} valueStyle={{ color: '#52c41a', fontSize: 20 }} />
            {ps && renderVariance(s.totalEquity, ps.totalEquity)}
          </Card>
        </Col>
      </Row>

      {/* Financial Ratios */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Current Ratio" value={currentRatio} precision={2} valueStyle={{ fontSize: 16, color: currentRatio >= 1.5 ? '#52c41a' : currentRatio >= 1 ? '#faad14' : '#ff4d4f' }} />
            <Text type="secondary" style={{ fontSize: 11 }}>{currentRatio >= 1.5 ? 'Healthy' : currentRatio >= 1 ? 'Adequate' : 'Low'}</Text>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Debt-to-Equity" value={debtToEquity} precision={2} valueStyle={{ fontSize: 16, color: debtToEquity <= 1 ? '#52c41a' : debtToEquity <= 2 ? '#faad14' : '#ff4d4f' }} />
            <Text type="secondary" style={{ fontSize: 11 }}>{debtToEquity <= 1 ? 'Conservative' : debtToEquity <= 2 ? 'Moderate' : 'Highly Leveraged'}</Text>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Equity Ratio</Text>
            <Progress percent={Math.min(Math.abs(equityRatio), 100)} format={() => `${equityRatio.toFixed(1)}%`} strokeColor={equityRatio >= 50 ? '#52c41a' : equityRatio >= 30 ? '#faad14' : '#ff4d4f'} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Working Capital" value={workingCapital} precision={2} prefix={cSym} valueStyle={{ fontSize: 16, color: workingCapital >= 0 ? '#52c41a' : '#ff4d4f' }} />
            <Text type="secondary" style={{ fontSize: 11 }}>{workingCapital >= 0 ? 'Positive' : 'Negative'}</Text>
          </Card>
        </Col>
      </Row>

      {/* Balance Sheet Sections */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title={<Text strong style={{ fontSize: 15, color: '#1890ff' }}>Assets</Text>} size="small" bodyStyle={{ padding: 0 }} style={{ marginBottom: 16 }}>
            <Table
              columns={sectionColumns('Asset Category')}
              dataSource={balanceSheet.assets}
              pagination={false}
              rowKey="category"
              loading={loading}
              size="small"
              summary={() => (
                <Table.Summary.Row style={{ background: '#e6f7ff' }}>
                  <Table.Summary.Cell><Text strong style={{ color: '#1890ff' }}>Total Assets</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong style={{ color: '#1890ff' }}>{fmt(s.totalAssets)}</Text></Table.Summary.Cell>
                  {priorBS && <Table.Summary.Cell align="right"><Text strong type="secondary">{fmt(ps.totalAssets)}</Text></Table.Summary.Cell>}
                  {priorBS && <Table.Summary.Cell align="right">{renderVariance(s.totalAssets, ps.totalAssets)}</Table.Summary.Cell>}
                </Table.Summary.Row>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title={<Text strong style={{ fontSize: 15, color: '#ff4d4f' }}>Liabilities</Text>} size="small" bodyStyle={{ padding: 0 }} style={{ marginBottom: 16 }}>
            <Table
              columns={sectionColumns('Liability Category')}
              dataSource={balanceSheet.liabilities}
              pagination={false}
              rowKey="category"
              loading={loading}
              size="small"
              summary={() => (
                <Table.Summary.Row style={{ background: '#fff2f0' }}>
                  <Table.Summary.Cell><Text strong style={{ color: '#ff4d4f' }}>Total Liabilities</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong style={{ color: '#ff4d4f' }}>{fmt(s.totalLiabilities)}</Text></Table.Summary.Cell>
                  {priorBS && <Table.Summary.Cell align="right"><Text strong type="secondary">{fmt(ps.totalLiabilities)}</Text></Table.Summary.Cell>}
                  {priorBS && <Table.Summary.Cell align="right">{renderVariance(s.totalLiabilities, ps.totalLiabilities)}</Table.Summary.Cell>}
                </Table.Summary.Row>
              )}
            />
          </Card>

          <Card title={<Text strong style={{ fontSize: 15, color: '#52c41a' }}>Equity</Text>} size="small" bodyStyle={{ padding: 0 }}>
            <Table
              columns={sectionColumns('Equity Category')}
              dataSource={balanceSheet.equity}
              pagination={false}
              rowKey="category"
              loading={loading}
              size="small"
              summary={() => (
                <Table.Summary.Row style={{ background: '#f6ffed' }}>
                  <Table.Summary.Cell><Text strong style={{ color: '#52c41a' }}>Total Equity</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong style={{ color: '#52c41a' }}>{fmt(s.totalEquity)}</Text></Table.Summary.Cell>
                  {priorBS && <Table.Summary.Cell align="right"><Text strong type="secondary">{fmt(ps.totalEquity)}</Text></Table.Summary.Cell>}
                  {priorBS && <Table.Summary.Cell align="right">{renderVariance(s.totalEquity, ps.totalEquity)}</Table.Summary.Cell>}
                </Table.Summary.Row>
              )}
            />
          </Card>
        </Col>
      </Row>

      {/* Accounting Equation Footer */}
      <Card style={{ marginTop: 16, background: isBalanced ? '#f6ffed' : '#fff2f0', border: isBalanced ? '1px solid #b7eb8f' : '1px solid #ffa39e' }}>
        <Row gutter={16} align="middle" justify="center">
          <Col>
            <Text strong style={{ fontSize: 16, color: '#1890ff' }}>Assets: ${fmt(s.totalAssets)}</Text>
          </Col>
          <Col><Text strong style={{ fontSize: 18 }}>=</Text></Col>
          <Col>
            <Text strong style={{ fontSize: 16, color: '#ff4d4f' }}>Liabilities: ${fmt(s.totalLiabilities)}</Text>
          </Col>
          <Col><Text strong style={{ fontSize: 18 }}>+</Text></Col>
          <Col>
            <Text strong style={{ fontSize: 16, color: '#52c41a' }}>Equity: ${fmt(s.totalEquity)}</Text>
          </Col>
          <Col>
            <Tag color={isBalanced ? 'success' : 'error'} style={{ fontSize: 13, padding: '4px 12px' }}>
              {isBalanced ? <CheckCircleOutlined style={{ marginRight: 4 }} /> : <WarningOutlined style={{ marginRight: 4 }} />}
              {isBalanced ? 'BALANCED' : `DIFFERENCE: ${fmt(Math.abs(s.totalAssets - liabPlusEquity))}`}
            </Tag>
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default BalanceSheet;