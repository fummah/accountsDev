import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Table, Button, Space, Tabs, message, Tag, Input } from 'antd';
import { UserOutlined, DollarOutlined, FileDoneOutlined, ClockCircleOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Link, useHistory } from 'react-router-dom';
import moment from 'moment';

const { TabPane } = Tabs;
const statusColors = { Draft: 'default', Sent: 'processing', Pending: 'warning', Unpaid: 'warning', Paid: 'success', 'Partially Paid': 'orange', Overdue: 'error', Cancelled: 'default', Open: 'blue', Accepted: 'success', Declined: 'error', Expired: 'default', Invoiced: 'purple' };

const CustomerCenter = () => {
  const history = useHistory();
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('customers');
  const [custSearch, setCustSearch] = useState('');
  const [custPage, setCustPage] = useState(1);
  const [custTotal, setCustTotal] = useState(0);
  const PAGE_SIZE = 25;
  const [stats, setStats] = useState({
    totalCustomers: 0,
    totalReceivables: 0,
    overdueAmount: 0,
    quotesOpen: 0
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadCustomersPage();
  }, [custPage, custSearch]);

  const loadCustomersPage = async () => {
    try {
      const res = await window.electronAPI.getCustomersPaginated?.(custPage, PAGE_SIZE, custSearch);
      if (res && res.data) {
        setCustomers(res.data);
        setCustTotal(res.total || 0);
      } else {
        const c = await window.electronAPI.getAllCustomers?.();
        const arr = Array.isArray(c) ? c : (c?.all || []);
        setCustomers(arr);
        setCustTotal(arr.length);
      }
    } catch { }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [customersRaw, invoicesRaw, quotesRaw] = await Promise.all([
        window.electronAPI.getAllCustomers?.(),
        window.electronAPI.getAllInvoices?.(),
        window.electronAPI.getAllQuotes?.()
      ]);

      const customersArr = Array.isArray(customersRaw) ? customersRaw : (customersRaw?.all || []);
      const invoicesArr = Array.isArray(invoicesRaw) ? invoicesRaw : (invoicesRaw?.all || []);
      const quotesArr = Array.isArray(quotesRaw) ? quotesRaw : quotesRaw || [];

      setCustomers(customersArr);
      setCustTotal(customersArr.length);
      setInvoices(invoicesArr);
      setQuotes(quotesArr);

      const totalReceivables = invoicesArr.reduce((sum, inv) => 
        sum + ((inv.status !== 'Paid' && inv.status !== 'Cancelled' && inv.status !== 'Draft') ? Number(inv.amount || 0) : 0), 0);
      const overdueAmount = invoicesArr.reduce((sum, inv) => 
        sum + ((inv.status !== 'Paid' && inv.status !== 'Cancelled' && inv.status !== 'Draft') && inv.last_date && moment(inv.last_date).isBefore(moment()) ? Number(inv.amount || 0) : 0), 0);
      const openQuotes = quotesArr.filter(q => q.status === 'Open' || q.status === 'Sent').length;

      setStats({
        totalCustomers: customersArr.length,
        totalReceivables,
        overdueAmount,
        quotesOpen: openQuotes
      });
    } catch (error) {
      message.error('Failed to load customer data');
    } finally {
      setLoading(false);
    }
  };

  const custName = (record) => record.display_name || record.name || `${record.first_name || ''} ${record.last_name || ''}`.trim() || '—';

  const customerColumns = [
    { title: 'Name', key: 'name', sorter: (a, b) => custName(a).localeCompare(custName(b)),
      render: (_, record) => <Link to={`/main/customers/details/${record.id}`}>{custName(record)}</Link> },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Phone', dataIndex: 'phone_number', key: 'phone' },
    { title: 'Balance', key: 'balance',
      render: (_, record) => `R ${Number(record.opening_balance || 0).toFixed(2)}` },
    { title: 'Actions', key: 'actions', width: 200,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => history.push(`/main/customers/invoices/new?customer=${record.id}`)}>New Invoice</Button>
          <Button type="link" size="small" onClick={() => history.push(`/main/customers/quotes/new?customer=${record.id}`)}>New Quote</Button>
        </Space>
      ),
    },
  ];

  const invoiceColumns = [
    { title: 'Invoice #', dataIndex: 'number', key: 'number',
      render: (text, record) => <Link to={`/main/customers/invoices/edit/${record.id}`}>{text || `#${record.id}`}</Link> },
    { title: 'Customer', dataIndex: 'customer_name', key: 'customer' },
    { title: 'Date', dataIndex: 'start_date', key: 'date',
      render: (d) => d ? moment(d).format('DD/MM/YYYY') : '-' },
    { title: 'Due Date', dataIndex: 'last_date', key: 'dueDate',
      render: (d) => d ? moment(d).format('DD/MM/YYYY') : '-' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount',
      render: (v) => <span style={{ fontWeight: 500 }}>R {Number(v || 0).toFixed(2)}</span> },
    { title: 'Status', dataIndex: 'status', key: 'status',
      render: (s) => <Tag color={statusColors[s] || 'default'}>{s}</Tag> },
  ];

  const quoteColumns = [
    { title: 'Quote #', dataIndex: 'number', key: 'number',
      render: (text, record) => <Link to={`/main/customers/quotes/edit/${record.id}`}>{text || `#${record.id}`}</Link> },
    { title: 'Customer', dataIndex: 'customer_name', key: 'customer' },
    { title: 'Date', dataIndex: 'start_date', key: 'date',
      render: (d) => d ? moment(d).format('DD/MM/YYYY') : '-' },
    { title: 'Expiry', dataIndex: 'last_date', key: 'expiry',
      render: (d) => d ? moment(d).format('DD/MM/YYYY') : '-' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount',
      render: (v) => <span style={{ fontWeight: 500 }}>R {Number(v || 0).toFixed(2)}</span> },
    { title: 'Status', dataIndex: 'status', key: 'status',
      render: (s) => <Tag color={statusColors[s] || 'default'}>{s}</Tag> },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2>Customer Center</h2>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card size="small"><Statistic title="Total Customers" value={stats.totalCustomers} prefix={<UserOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="Total Receivables" value={stats.totalReceivables.toFixed(2)} prefix="R" /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="Overdue Amount" value={stats.overdueAmount.toFixed(2)} prefix="R"
            valueStyle={{ color: stats.overdueAmount > 0 ? '#cf1322' : '#52c41a' }} /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="Open Quotes" value={stats.quotesOpen} prefix={<FileDoneOutlined />} /></Card>
        </Col>
      </Row>

      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane tab={`Customers (${custTotal})`} key="customers">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => history.push('/main/customers/list')}>Manage Customers</Button>
              <Input.Search placeholder="Search customers..." allowClear style={{ width: 280 }}
                onSearch={v => { setCustSearch(v); setCustPage(1); }} />
            </div>
            <Table columns={customerColumns} dataSource={customers} rowKey="id" loading={loading} size="small"
              pagination={{ current: custPage, pageSize: PAGE_SIZE, total: custTotal, showTotal: t => `${t} customers`,
                onChange: (p) => setCustPage(p) }} />
          </TabPane>
          <TabPane tab={`Invoices (${invoices.length})`} key="invoices">
            <div style={{ marginBottom: 16 }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => history.push('/main/customers/invoices/new')}>Create Invoice</Button>
            </div>
            <Table columns={invoiceColumns} dataSource={invoices} rowKey="id" loading={loading} size="small"
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} invoices` }} />
          </TabPane>
          <TabPane tab={`Quotes (${quotes.length})`} key="quotes">
            <div style={{ marginBottom: 16 }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => history.push('/main/customers/quotes/new')}>Create Quote</Button>
            </div>
            <Table columns={quoteColumns} dataSource={quotes} rowKey="id" loading={loading} size="small"
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} quotes` }} />
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default CustomerCenter;