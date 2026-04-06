import React, { useState, useEffect, useMemo } from 'react';
import { Card, Table, DatePicker, Select, Row, Col, Statistic, Button, Space, Input, Tag, message } from 'antd';
import { DownloadOutlined, ReloadOutlined, SearchOutlined, RiseOutlined, FallOutlined, DollarOutlined } from '@ant-design/icons';
import { useCurrency } from '../../utils/currency';

const { RangePicker } = DatePicker;
const { Option } = Select;

const IncomeTracker = () => {
  const { symbol: cSym } = useCurrency();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState([]);
  const [period, setPeriod] = useState('monthly');
  const [search, setSearch] = useState('');
  const [statistics, setStatistics] = useState({
    totalIncome: 0,
    averageIncome: 0,
    outstandingAmount: 0
  });

  useEffect(() => {
    fetchTransactions();
  }, [dateRange, period]);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const startDate = dateRange[0]?.toISOString();
      const endDate = dateRange[1]?.toISOString();
      
      const data = await window.electronAPI.getIncomeTransactions({
        startDate,
        endDate,
        period
      });
      
      const tx = Array.isArray(data?.transactions) ? data.transactions.map(t => ({
        ...t,
        amount: Number(t.amount || 0),
      })) : [];
      setTransactions(tx);
      setStatistics({
        totalIncome: Number(data?.totalIncome || 0),
        averageIncome: Number(data?.averageIncome || 0),
        outstandingAmount: Number(data?.outstandingAmount || 0)
      });
    } catch (error) {
      message.error('Failed to load income transactions');
      setTransactions([]);
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return transactions;
    const q = search.toLowerCase();
    return transactions.filter(t =>
      (t.description || '').toLowerCase().includes(q) ||
      (t.customerName || '').toLowerCase().includes(q) ||
      (t.status || '').toLowerCase().includes(q)
    );
  }, [transactions, search]);

  const paidTotal = useMemo(() => filtered.filter(t => (t.status || '').toLowerCase() === 'paid').reduce((s, t) => s + Number(t.amount || 0), 0), [filtered]);

  const columns = [
    { title: 'Date', dataIndex: 'date', key: 'date', sorter: (a, b) => (a.date || '').localeCompare(b.date || ''),
      render: (date) => date ? new Date(date).toLocaleDateString() : '-' },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Customer', dataIndex: 'customerName', key: 'customerName', sorter: (a, b) => (a.customerName || '').localeCompare(b.customerName || '') },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', sorter: (a, b) => Number(a.amount || 0) - Number(b.amount || 0),
      render: (amount) => <strong style={{ color: '#3f8600' }}>{cSym} {Number(amount || 0).toFixed(2)}</strong> },
    { title: 'Status', dataIndex: 'status', key: 'status',
      render: (status) => {
        const s = (status || '').toLowerCase();
        const color = s === 'paid' ? 'green' : s === 'overdue' ? 'red' : s === 'pending' ? 'orange' : 'blue';
        return <Tag color={color}>{status || 'Unknown'}</Tag>;
      }
    }
  ];

  const exportCSV = () => {
    try {
      const headers = ['date', 'description', 'customerName', 'amount', 'status'];
      const rows = filtered.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `income_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (_) { message.error('Export failed'); }
  };

  return (
    <div style={{ padding: 24 }}>
      <Card title={<span style={{ fontSize: 18, fontWeight: 600 }}><DollarOutlined style={{ marginRight: 8 }} />Income Tracker</span>}
        extra={<Space><Button icon={<DownloadOutlined />} onClick={exportCSV}>Export CSV</Button><Button icon={<ReloadOutlined />} onClick={fetchTransactions}>Refresh</Button></Space>}>

        <Row gutter={16} style={{ marginBottom: 16, flexDirection: 'row', flexWrap: 'wrap' }}>
          <Col span={6}>
            <Card size="small" style={{ textAlign: 'center' }}>
              <Statistic title="Total Income" value={statistics.totalIncome} prefix={cSym} precision={2} valueStyle={{ color: '#3f8600' }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" style={{ textAlign: 'center' }}>
              <Statistic title="Average Income" value={statistics.averageIncome} prefix={cSym} precision={2} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" style={{ textAlign: 'center' }}>
              <Statistic title="Outstanding" value={statistics.outstandingAmount} prefix={cSym} precision={2} valueStyle={{ color: '#cf1322' }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" style={{ textAlign: 'center' }}>
              <Statistic title="Paid Income" value={paidTotal} prefix={cSym} precision={2} valueStyle={{ color: '#1890ff' }} />
            </Card>
          </Col>
        </Row>

        <Space style={{ marginBottom: 16 }} wrap>
          <RangePicker onChange={(dates) => setDateRange(dates || [])} format="DD/MM/YYYY" />
          <Select style={{ width: 140 }} value={period} onChange={(value) => setPeriod(value)}>
            <Option value="daily">Daily</Option>
            <Option value="weekly">Weekly</Option>
            <Option value="monthly">Monthly</Option>
            <Option value="yearly">Yearly</Option>
          </Select>
          <Input.Search allowClear placeholder="Search description, customer..." prefix={<SearchOutlined />}
            onSearch={v => setSearch(v)} onChange={e => { if (!e.target.value) setSearch(''); }} style={{ width: 280 }} />
        </Space>

        <Table columns={columns} dataSource={filtered} loading={loading} rowKey={(r) => r.id || String(Math.random())}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} transactions` }} size="middle" />
      </Card>
    </div>
  );
};

export default IncomeTracker;
