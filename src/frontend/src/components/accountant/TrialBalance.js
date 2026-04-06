import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Card, Table, DatePicker, Select, Button, Alert, Form, Row, Col, message, Space, Input, Tag, Typography, Statistic, Tooltip } from 'antd';
import { PrinterOutlined, DownloadOutlined, FileExcelOutlined, SyncOutlined, SearchOutlined, CalendarOutlined, CheckCircleOutlined, WarningOutlined, CalculatorOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Title, Text } = Typography;

const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseNum = (v) => parseFloat((v || '0').toString().replace(/,/g, '')) || 0;

const TYPE_COLORS = { asset: 'blue', liability: 'red', equity: 'purple', income: 'green', revenue: 'green', expense: 'orange', 'cost of goods': 'volcano' };
const getTypeColor = (type) => {
  const t = (type || '').toLowerCase();
  for (const [k, v] of Object.entries(TYPE_COLORS)) { if (t.includes(k)) return v; }
  return 'default';
};

const TrialBalance = () => {
  const { symbol: cSym } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateRange, setDateRange] = useState(null);
  const [balanceType, setBalanceType] = useState('unadjusted');

  useEffect(() => { loadTrialBalance(); }, []);

  const loadTrialBalance = async (dr) => {
    try {
      setLoading(true);
      const range = dr || dateRange;
      if (range && range[0] && range[1]) {
        const start = range[0].format('YYYY-MM-DD');
        const end = range[1].format('YYYY-MM-DD');
        const tb = await window.electronAPI.getTrialBalance(start, end);
        if (!tb || tb.error) {
          message.error(tb?.error || 'Failed to load trial balance');
          setData([]);
        } else {
          const rows = (Array.isArray(tb) ? tb : []).map((r, idx) => ({
            key: r.accountId || idx,
            accountCode: r.accountCode || r.accountNumber || '',
            accountName: r.accountName || '',
            accountType: r.accountType || r.type || '',
            debitNum: Number(r.debit) || 0,
            creditNum: Number(r.credit) || 0,
            debit: fmt(Number(r.debit) || 0),
            credit: fmt(Number(r.credit) || 0),
          }));
          setData(rows);
        }
      } else {
        const accounts = await window.electronAPI.getChartOfAccounts();
        if (!accounts || accounts.error) {
          message.error(accounts?.error || 'Failed to load trial balance');
          setData([]);
          return;
        }
        const rows = (Array.isArray(accounts) ? accounts : []).map((acc, idx) => {
          const balance = Number(acc.balance) || 0;
          const type = (acc.accountType || acc.type || '').toLowerCase();
          let debit = 0, credit = 0;
          const debitNormal = type.includes('asset') || type.includes('expense');
          if (balance >= 0) { if (debitNormal) debit = balance; else credit = balance; }
          else { if (debitNormal) credit = Math.abs(balance); else debit = Math.abs(balance); }
          return {
            key: acc.id || idx,
            accountCode: acc.accountNumber || acc.number || acc.accountCode || '',
            accountName: acc.accountName || acc.name || '',
            accountType: acc.accountType || acc.type || '',
            debitNum: debit,
            creditNum: credit,
            debit: fmt(debit),
            credit: fmt(credit),
          };
        });
        setData(rows);
      }
    } catch (error) {
      console.error('Failed to load trial balance:', error);
      message.error('Failed to load trial balance');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return data.filter(r => {
      const matchSearch = !searchText ||
        (r.accountCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
        (r.accountName || '').toLowerCase().includes(searchText.toLowerCase());
      const matchType = typeFilter === 'all' || (r.accountType || '').toLowerCase().includes(typeFilter.toLowerCase());
      return matchSearch && matchType;
    });
  }, [data, searchText, typeFilter]);

  const totalDebit = useMemo(() => filtered.reduce((s, r) => s + r.debitNum, 0), [filtered]);
  const totalCredit = useMemo(() => filtered.reduce((s, r) => s + r.creditNum, 0), [filtered]);
  const difference = Math.abs(totalDebit - totalCredit);
  const isBalanced = difference < 0.01;

  const accountTypes = useMemo(() => {
    const types = new Set(data.map(r => r.accountType).filter(Boolean));
    return Array.from(types).sort();
  }, [data]);

  const setPreset = (key) => {
    const now = moment();
    let range;
    switch (key) {
      case 'thisMonth': range = [now.clone().startOf('month'), now.clone().endOf('month')]; break;
      case 'lastMonth': range = [now.clone().subtract(1, 'month').startOf('month'), now.clone().subtract(1, 'month').endOf('month')]; break;
      case 'thisQuarter': range = [now.clone().startOf('quarter'), now.clone().endOf('quarter')]; break;
      case 'thisYear': range = [now.clone().startOf('year'), now.clone().endOf('year')]; break;
      case 'lastYear': range = [now.clone().subtract(1, 'year').startOf('year'), now.clone().subtract(1, 'year').endOf('year')]; break;
      default: return;
    }
    setDateRange(range);
    loadTrialBalance(range);
  };

  const handleExport = () => {
    if (!filtered.length) { message.warning('No data to export'); return; }
    const lines = [['Account Code', 'Account Name', 'Type', 'Debit', 'Credit'].join(',')];
    filtered.forEach(r => {
      lines.push([`"${r.accountCode}"`, `"${r.accountName}"`, `"${r.accountType}"`, r.debitNum.toFixed(2), r.creditNum.toFixed(2)].join(','));
    });
    lines.push(['', 'TOTALS', '', totalDebit.toFixed(2), totalCredit.toFixed(2)].join(','));
    lines.push(['', 'DIFFERENCE', '', '', difference.toFixed(2)].join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `trial-balance-${moment().format('YYYYMMDD')}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleExportXLSX = () => {
    if (!filtered.length) { message.warning('No data to export'); return; }
    try {
      const sheetData = filtered.map(r => ({ 'Account Code': r.accountCode, 'Account Name': r.accountName, 'Type': r.accountType, 'Debit': r.debitNum, 'Credit': r.creditNum }));
      sheetData.push({ 'Account Code': '', 'Account Name': 'TOTALS', 'Type': '', 'Debit': totalDebit, 'Credit': totalCredit });
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(wb, ws, 'Trial Balance');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `trial-balance-${moment().format('YYYYMMDD')}.xlsx`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch { message.error('XLSX export failed'); }
  };

  const handlePrint = () => {
    if (!filtered.length) { message.warning('No data to print'); return; }
    const rowsHtml = filtered.map(r => `<tr><td>${r.accountCode}</td><td>${r.accountName}</td><td>${r.accountType}</td><td style="text-align:right">${r.debit}</td><td style="text-align:right">${r.credit}</td></tr>`).join('');
    const html = `<!doctype html><html><head><title>Working Trial Balance</title><style>body{font-family:Arial,sans-serif;font-size:12px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px}th{background:#f5f5f5;text-align:left}tfoot td{font-weight:bold;border-top:2px solid #333}</style></head><body><h2>Working Trial Balance</h2><p>${dateRange ? dateRange[0].format('DD MMM YYYY') + ' to ' + dateRange[1].format('DD MMM YYYY') : 'As at ' + moment().format('DD MMM YYYY')}</p><table><thead><tr><th>Code</th><th>Account Name</th><th>Type</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th></tr></thead><tbody>${rowsHtml}</tbody><tfoot><tr><td colspan="3">Totals (${filtered.length} accounts)</td><td style="text-align:right">${fmt(totalDebit)}</td><td style="text-align:right">${fmt(totalCredit)}</td></tr><tr><td colspan="3">Difference</td><td colspan="2" style="text-align:right;color:${isBalanced ? 'green' : 'red'}">${fmt(difference)} ${isBalanced ? '(Balanced)' : '(IMBALANCED)'}</td></tr></tfoot></table></body></html>`;
    const w = window.open('', '_blank'); w.document.open(); w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300);
  };

  const columns = [
    { title: 'Code', dataIndex: 'accountCode', key: 'accountCode', width: 110, sorter: (a, b) => (a.accountCode || '').localeCompare(b.accountCode || '') },
    { title: 'Account Name', dataIndex: 'accountName', key: 'accountName', sorter: (a, b) => (a.accountName || '').localeCompare(b.accountName || ''), filteredValue: searchText ? [searchText] : null, onFilter: (v, r) => (r.accountName || '').toLowerCase().includes(v.toLowerCase()) },
    { title: 'Type', dataIndex: 'accountType', key: 'accountType', width: 130, render: v => v ? <Tag color={getTypeColor(v)}>{v}</Tag> : '-' },
    { title: 'Debit', dataIndex: 'debit', key: 'debit', width: 140, align: 'right', sorter: (a, b) => a.debitNum - b.debitNum, render: (v, r) => r.debitNum > 0 ? <Text style={{ color: '#3f8600' }}>{v}</Text> : <Text type="secondary">-</Text> },
    { title: 'Credit', dataIndex: 'credit', key: 'credit', width: 140, align: 'right', sorter: (a, b) => a.creditNum - b.creditNum, render: (v, r) => r.creditNum > 0 ? <Text style={{ color: '#cf1322' }}>{v}</Text> : <Text type="secondary">-</Text> },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}><CalculatorOutlined style={{ marginRight: 8 }} />Working Trial Balance</Title>
          <Text type="secondary">{dateRange ? `${dateRange[0].format('DD MMM YYYY')} — ${dateRange[1].format('DD MMM YYYY')}` : 'All periods (snapshot)'} &middot; {balanceType === 'adjusted' ? 'Adjusted' : 'Unadjusted'}</Text>
        </div>
        <Space wrap>
          <Button icon={<PrinterOutlined />} onClick={handlePrint} disabled={!filtered.length}>Print</Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport} disabled={!filtered.length}>CSV</Button>
          <Button icon={<FileExcelOutlined />} onClick={handleExportXLSX} disabled={!filtered.length}>Excel</Button>
          <Button icon={<SyncOutlined spin={loading} />} onClick={() => loadTrialBalance()} />
        </Space>
      </div>

      {/* Balance Status Alert */}
      {data.length > 0 && (
        <Alert
          message={isBalanced ? 'Trial Balance is Balanced' : 'Trial Balance is NOT Balanced'}
          description={isBalanced ? `Total Debits (${fmt(totalDebit)}) = Total Credits (${fmt(totalCredit)})` : `Difference of ${fmt(difference)} detected. Total Debits: ${fmt(totalDebit)}, Total Credits: ${fmt(totalCredit)}`}
          type={isBalanced ? 'success' : 'error'}
          showIcon
          icon={isBalanced ? <CheckCircleOutlined /> : <WarningOutlined />}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #52c41a' }}>
            <Statistic title="Total Debits" value={totalDebit} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: '#3f8600' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #ff4d4f' }}>
            <Statistic title="Total Credits" value={totalCredit} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: '#cf1322' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: isBalanced ? '3px solid #52c41a' : '3px solid #ff4d4f' }}>
            <Statistic title="Difference" value={difference} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: isBalanced ? '#52c41a' : '#ff4d4f' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #1890ff' }}>
            <Statistic title="Accounts" value={filtered.length} valueStyle={{ fontSize: 18, color: '#1890ff' }} suffix={`/ ${data.length}`} />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={5}>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Period</Text>
            <Select style={{ width: '100%' }} placeholder="Quick period" onChange={setPreset} suffixIcon={<CalendarOutlined />} allowClear>
              <Option value="thisMonth">This Month</Option>
              <Option value="lastMonth">Last Month</Option>
              <Option value="thisQuarter">This Quarter</Option>
              <Option value="thisYear">This Year</Option>
              <Option value="lastYear">Last Year</Option>
            </Select>
          </Col>
          <Col xs={24} sm={7}>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Custom Date Range</Text>
            <RangePicker style={{ width: '100%' }} value={dateRange} onChange={(v) => { setDateRange(v); if (v && v[0] && v[1]) loadTrialBalance(v); }} />
          </Col>
          <Col xs={24} sm={4}>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Balance Type</Text>
            <Select style={{ width: '100%' }} value={balanceType} onChange={setBalanceType}>
              <Option value="unadjusted">Unadjusted</Option>
              <Option value="adjusted">Adjusted</Option>
            </Select>
          </Col>
          <Col xs={24} sm={4}>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Account Type</Text>
            <Select style={{ width: '100%' }} value={typeFilter} onChange={setTypeFilter}>
              <Option value="all">All Types</Option>
              {accountTypes.map(t => <Option key={t} value={t}>{t}</Option>)}
            </Select>
          </Col>
          <Col xs={24} sm={4}>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Search</Text>
            <Input placeholder="Filter..." prefix={<SearchOutlined />} value={searchText} onChange={e => setSearchText(e.target.value)} allowClear />
          </Col>
        </Row>
      </Card>

      {/* Table */}
      <Card size="small" bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={filtered}
          loading={loading}
          size="small"
          pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['25', '50', '100', '200'], showTotal: (t) => `${t} accounts` }}
          scroll={{ x: 700 }}
          rowClassName={(r) => r.debitNum === 0 && r.creditNum === 0 ? 'ant-table-row-muted' : ''}
          summary={pageData => {
            if (!pageData.length) return null;
            let pgDebit = 0, pgCredit = 0;
            pageData.forEach(r => { pgDebit += r.debitNum; pgCredit += r.creditNum; });
            return (
              <>
                <Table.Summary.Row style={{ background: '#fafafa' }}>
                  <Table.Summary.Cell colSpan={3}><Text strong>Totals ({filtered.length} accounts)</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong style={{ color: '#3f8600' }}>{fmt(totalDebit)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong style={{ color: '#cf1322' }}>{fmt(totalCredit)}</Text></Table.Summary.Cell>
                </Table.Summary.Row>
                <Table.Summary.Row style={{ background: isBalanced ? '#f6ffed' : '#fff2f0' }}>
                  <Table.Summary.Cell colSpan={3}>
                    <Text strong style={{ color: isBalanced ? '#52c41a' : '#ff4d4f' }}>
                      {isBalanced ? <CheckCircleOutlined style={{ marginRight: 4 }} /> : <WarningOutlined style={{ marginRight: 4 }} />}
                      Difference
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell colSpan={2} align="right">
                    <Text strong style={{ color: isBalanced ? '#52c41a' : '#ff4d4f' }}>{fmt(difference)}</Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </>
            );
          }}
        />
      </Card>
    </div>
  );
};

export default TrialBalance;