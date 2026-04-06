import React, { useState, useEffect, useMemo } from 'react';
import { Table, Select, DatePicker, Space, Card, Statistic, Button, Row, Col, Input, Tag, Typography, Tooltip, Divider, message } from 'antd';
import { PrinterOutlined, DownloadOutlined, SyncOutlined, SearchOutlined, CalendarOutlined, FilterOutlined, BookOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { Option } = Select;
const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const GeneralLedger = () => {
  const { symbol: cSym } = useCurrency();
  const [accounts, setAccounts] = useState([]);
  const [allLedger, setAllLedger] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [dateRange, setDateRange] = useState([moment().startOf('year'), moment().endOf('year')]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  useEffect(() => { loadAccounts(); }, []);

  useEffect(() => {
    if (selectedAccount) loadLedger();
  }, [selectedAccount, dateRange]);

  const loadAccounts = async () => {
    try {
      const accountsData = await window.electronAPI.getChartOfAccounts();
      setAccounts(Array.isArray(accountsData) ? accountsData : []);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  const loadLedger = async () => {
    try {
      setLoading(true);
      const raw = await window.electronAPI.getLedger();
      setAllLedger(Array.isArray(raw) ? raw : []);
    } catch (error) {
      console.error('Failed to load ledger:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedAccountData = accounts.find(a => a.id === selectedAccount);

  const filteredLedger = useMemo(() => {
    if (!selectedAccount || !dateRange || !dateRange[0] || !dateRange[1]) return [];
    return allLedger
      .filter(entry =>
        entry.accountId === selectedAccount &&
        moment(entry.date).isBetween(dateRange[0], dateRange[1], 'day', '[]')
      )
      .filter(entry =>
        !searchText || (entry.description || '').toLowerCase().includes(searchText.toLowerCase()) ||
        (entry.reference || '').toLowerCase().includes(searchText.toLowerCase())
      )
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [allLedger, selectedAccount, dateRange, searchText]);

  const withRunningBalance = useMemo(() => {
    let balance = 0;
    return filteredLedger.map((entry, idx) => {
      balance += (Number(entry.debit) || 0) - (Number(entry.credit) || 0);
      return { ...entry, _idx: idx, balance };
    });
  }, [filteredLedger]);

  const totalDebit = filteredLedger.reduce((s, e) => s + (Number(e.debit) || 0), 0);
  const totalCredit = filteredLedger.reduce((s, e) => s + (Number(e.credit) || 0), 0);
  const netMovement = totalDebit - totalCredit;
  const closingBalance = Number(selectedAccountData?.balance || 0);

  const columns = [
    { title: 'Date', dataIndex: 'date', key: 'date', width: 110, sorter: (a, b) => new Date(a.date) - new Date(b.date), render: v => v ? moment(v).format('DD MMM YYYY') : '-' },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true, filteredValue: searchText ? [searchText] : null, onFilter: (val, record) => (record.description || '').toLowerCase().includes(val.toLowerCase()) },
    { title: 'Reference', dataIndex: 'reference', key: 'reference', width: 120 },
    { title: 'Type', dataIndex: 'type', key: 'type', width: 100, render: v => v ? <Tag>{v}</Tag> : '-' },
    { title: 'Debit', dataIndex: 'debit', key: 'debit', width: 130, align: 'right', render: v => Number(v) ? <Text style={{ color: '#3f8600' }}>{fmt(v)}</Text> : '' },
    { title: 'Credit', dataIndex: 'credit', key: 'credit', width: 130, align: 'right', render: v => Number(v) ? <Text style={{ color: '#cf1322' }}>{fmt(v)}</Text> : '' },
    { title: 'Balance', dataIndex: 'balance', key: 'balance', width: 140, align: 'right', render: v => <Text strong style={{ color: v >= 0 ? '#1890ff' : '#ff4d4f' }}>{fmt(v)}</Text> },
  ];

  const handlePrint = () => {
    if (!withRunningBalance.length) { message.warning('No data to print'); return; }
    const acct = selectedAccountData;
    const rowsHtml = withRunningBalance.map(r => `<tr><td>${moment(r.date).format('DD/MM/YYYY')}</td><td>${r.description || ''}</td><td>${r.reference || ''}</td><td style="text-align:right">${Number(r.debit) ? fmt(r.debit) : ''}</td><td style="text-align:right">${Number(r.credit) ? fmt(r.credit) : ''}</td><td style="text-align:right">${fmt(r.balance)}</td></tr>`).join('');
    const html = `<!doctype html><html><head><title>General Ledger</title><style>body{font-family:Arial,sans-serif;font-size:12px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px}th{background:#f5f5f5;text-align:left}tfoot td{font-weight:bold;border-top:2px solid #333}</style></head><body><h2>General Ledger</h2><p><strong>${acct ? (acct.accountNumber || acct.accountCode || '') + ' - ' + (acct.accountName || acct.name || '') : ''}</strong></p><p>${dateRange[0].format('DD MMM YYYY')} to ${dateRange[1].format('DD MMM YYYY')}</p><table><thead><tr><th>Date</th><th>Description</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>${rowsHtml}</tbody><tfoot><tr><td colspan="3">Totals</td><td style="text-align:right">${fmt(totalDebit)}</td><td style="text-align:right">${fmt(totalCredit)}</td><td style="text-align:right">${fmt(netMovement)}</td></tr></tfoot></table></body></html>`;
    const w = window.open('', '_blank'); w.document.open(); w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300);
  };

  const handleExport = () => {
    if (!withRunningBalance.length) { message.warning('No data to export'); return; }
    const lines = [['Date', 'Description', 'Reference', 'Debit', 'Credit', 'Balance'].join(',')];
    withRunningBalance.forEach(r => {
      lines.push([moment(r.date).format('YYYY-MM-DD'), `"${(r.description || '').replace(/"/g, '""')}"`, `"${(r.reference || '').replace(/"/g, '""')}"`, Number(r.debit) || 0, Number(r.credit) || 0, r.balance.toFixed(2)].join(','));
    });
    lines.push(['Totals', '', '', totalDebit.toFixed(2), totalCredit.toFixed(2), netMovement.toFixed(2)].join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `general-ledger-${selectedAccountData?.accountCode || 'all'}-${dateRange[0].format('YYYYMMDD')}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const setPreset = (key) => {
    const now = moment();
    switch (key) {
      case 'thisMonth': setDateRange([now.clone().startOf('month'), now.clone().endOf('month')]); break;
      case 'lastMonth': setDateRange([now.clone().subtract(1, 'month').startOf('month'), now.clone().subtract(1, 'month').endOf('month')]); break;
      case 'thisQuarter': setDateRange([now.clone().startOf('quarter'), now.clone().endOf('quarter')]); break;
      case 'thisYear': setDateRange([now.clone().startOf('year'), now.clone().endOf('year')]); break;
      default: break;
    }
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>General Ledger</Title>
          <Text type="secondary">
            {selectedAccountData ? `${selectedAccountData.accountNumber || selectedAccountData.accountCode || ''} — ${selectedAccountData.accountName || selectedAccountData.name || ''}` : 'Select an account to view ledger entries'}
          </Text>
        </div>
        <Space wrap>
          <Button icon={<PrinterOutlined />} onClick={handlePrint} disabled={!withRunningBalance.length}>Print</Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport} disabled={!withRunningBalance.length}>Export</Button>
          <Button icon={<SyncOutlined spin={loading} />} onClick={loadLedger} disabled={!selectedAccount} />
        </Space>
      </div>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={8}>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Account</Text>
            <Select
              showSearch
              optionFilterProp="children"
              style={{ width: '100%' }}
              placeholder="Search & select account..."
              value={selectedAccount}
              onChange={setSelectedAccount}
              suffixIcon={<BookOutlined />}
              filterOption={(input, option) => (option?.children || '').toLowerCase().includes(input.toLowerCase())}
            >
              {accounts.map(a => (
                <Option key={a.id} value={a.id}>
                  {(a.accountNumber || a.accountCode || '')} — {a.accountName || a.name || ''}
                </Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={6}>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Period</Text>
            <Select style={{ width: '100%' }} defaultValue="thisYear" onChange={setPreset} suffixIcon={<CalendarOutlined />}>
              <Option value="thisMonth">This Month</Option>
              <Option value="lastMonth">Last Month</Option>
              <Option value="thisQuarter">This Quarter</Option>
              <Option value="thisYear">This Year</Option>
            </Select>
          </Col>
          <Col xs={24} sm={6}>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Custom Dates</Text>
            <RangePicker value={dateRange} onChange={setDateRange} style={{ width: '100%' }} />
          </Col>
          <Col xs={24} sm={4}>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Search</Text>
            <Input placeholder="Filter..." prefix={<SearchOutlined />} value={searchText} onChange={e => setSearchText(e.target.value)} allowClear />
          </Col>
        </Row>
      </Card>

      {/* Account Summary Cards */}
      {selectedAccountData && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card size="small" style={{ borderTop: '3px solid #1890ff' }}>
              <Statistic title="Account" value={selectedAccountData.accountNumber || selectedAccountData.accountCode || '-'} valueStyle={{ fontSize: 18 }} />
              <Text type="secondary">{selectedAccountData.accountType || selectedAccountData.type || ''}</Text>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" style={{ borderTop: '3px solid #52c41a' }}>
              <Statistic title="Total Debits" value={totalDebit} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: '#3f8600' }} />
              <Text type="secondary">{filteredLedger.filter(e => Number(e.debit) > 0).length} entries</Text>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" style={{ borderTop: '3px solid #ff4d4f' }}>
              <Statistic title="Total Credits" value={totalCredit} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: '#cf1322' }} />
              <Text type="secondary">{filteredLedger.filter(e => Number(e.credit) > 0).length} entries</Text>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" style={{ borderTop: '3px solid #722ed1' }}>
              <Statistic title="Current Balance" value={closingBalance} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: closingBalance >= 0 ? '#1890ff' : '#ff4d4f' }} />
              <Text type="secondary">Net movement: {fmt(netMovement)}</Text>
            </Card>
          </Col>
        </Row>
      )}

      {/* Ledger Table */}
      <Card size="small" bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={withRunningBalance}
          rowKey={(r, i) => r.id || r._idx || i}
          loading={loading}
          size="small"
          pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['25', '50', '100', '200'], showTotal: (total) => `${total} entries` }}
          scroll={{ x: 900 }}
          summary={pageData => {
            if (!pageData.length) return null;
            let pgDebit = 0, pgCredit = 0;
            pageData.forEach(r => { pgDebit += Number(r.debit) || 0; pgCredit += Number(r.credit) || 0; });
            return (
              <>
                <Table.Summary.Row style={{ background: '#fafafa' }}>
                  <Table.Summary.Cell colSpan={4}><Text strong>Page Totals</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong style={{ color: '#3f8600' }}>{fmt(pgDebit)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong style={{ color: '#cf1322' }}>{fmt(pgCredit)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong>{fmt(pgDebit - pgCredit)}</Text></Table.Summary.Cell>
                </Table.Summary.Row>
                <Table.Summary.Row style={{ background: '#e6f7ff' }}>
                  <Table.Summary.Cell colSpan={4}><Text strong>Grand Totals ({filteredLedger.length} entries)</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong style={{ color: '#3f8600' }}>{fmt(totalDebit)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong style={{ color: '#cf1322' }}>{fmt(totalCredit)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong style={{ color: '#1890ff' }}>{fmt(netMovement)}</Text></Table.Summary.Cell>
                </Table.Summary.Row>
              </>
            );
          }}
          locale={{ emptyText: selectedAccount ? 'No entries found for this period' : 'Select an account to view ledger entries' }}
        />
      </Card>
    </div>
  );
};

export default GeneralLedger;