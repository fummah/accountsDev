import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Table, Button, Space, Tabs, message, Tag, Input, Modal, Form, Select } from 'antd';
import { UserOutlined, DollarOutlined, FileDoneOutlined, ClockCircleOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Link, useHistory } from 'react-router-dom';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';
import COUNTRIES from '../../utils/countries';
import { formatPhone, phoneInputHandler } from '../../utils/phone';

const { TabPane } = Tabs;
const statusColors = { Draft: 'default', Sent: 'processing', Pending: 'warning', Unpaid: 'warning', Paid: 'success', 'Partially Paid': 'orange', Overdue: 'error', Cancelled: 'default', Open: 'blue', Accepted: 'success', Declined: 'error', Expired: 'default', Invoiced: 'purple' };

const CustomerCenter = () => {
  const { symbol: cSym } = useCurrency();
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
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [custForm] = Form.useForm();
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

  const onCreateCustomer = async (values) => {
    try {
      const display = values.display_name || `${values.first_name || ''} ${values.last_name || ''}`.trim();
      const res = await window.electronAPI.insertCustomer(
        '', values.first_name || '', '', values.last_name || '', '', values.email || '',
        display, values.company_name || '', values.phone_number || '', values.mobile_number || '',
        '', '', '', values.address1 || '', values.address2 || '', values.city || '', values.state || '',
        values.postal_code || '', values.country || '', '', '', '', 'system', 0, null, 'Email', 'en', ''
      );
      if (res && res.success) {
        message.success('Customer added');
        setShowAddCustomer(false);
        custForm.resetFields();
        await loadData();
        await loadCustomersPage();
      } else {
        message.error(res?.error || 'Failed to add customer');
      }
    } catch (err) {
      message.error('Error adding customer');
    }
  };

  const custName = (record) => record.display_name || record.name || `${record.first_name || ''} ${record.last_name || ''}`.trim() || '—';

  const customerColumns = [
    { title: 'Name', key: 'name', sorter: (a, b) => custName(a).localeCompare(custName(b)),
      render: (_, record) => <Link to={`/main/customers/details/${record.id}`}>{custName(record)}</Link> },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Phone', dataIndex: 'phone_number', key: 'phone', render: v => formatPhone(v) || '-' },
    { title: 'Balance', key: 'balance',
      render: (_, record) => `${cSym} ${Number(record.opening_balance || 0).toFixed(2)}` },
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
      render: (d) => d ? moment(d).format('MM/DD/YYYY') : '-' },
    { title: 'Due Date', dataIndex: 'last_date', key: 'dueDate',
      render: (d) => d ? moment(d).format('MM/DD/YYYY') : '-' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount',
      render: (v) => <span style={{ fontWeight: 500 }}>{cSym} {Number(v || 0).toFixed(2)}</span> },
    { title: 'Status', dataIndex: 'status', key: 'status',
      render: (s) => <Tag color={statusColors[s] || 'default'}>{s}</Tag> },
  ];

  const quoteColumns = [
    { title: 'Quote #', dataIndex: 'number', key: 'number',
      render: (text, record) => <Link to={`/main/customers/quotes/edit/${record.id}`}>{text || `#${record.id}`}</Link> },
    { title: 'Customer', dataIndex: 'customer_name', key: 'customer' },
    { title: 'Date', dataIndex: 'start_date', key: 'date',
      render: (d) => d ? moment(d).format('MM/DD/YYYY') : '-' },
    { title: 'Expiry', dataIndex: 'last_date', key: 'expiry',
      render: (d) => d ? moment(d).format('MM/DD/YYYY') : '-' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount',
      render: (v) => <span style={{ fontWeight: 500 }}>{cSym} {Number(v || 0).toFixed(2)}</span> },
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
          <Card size="small"><Statistic title="Total Receivables" value={stats.totalReceivables.toFixed(2)} prefix={cSym} /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="Overdue Amount" value={stats.overdueAmount.toFixed(2)} prefix={cSym}
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
              <Space>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowAddCustomer(true)}>Add Customer</Button>
                <Button onClick={() => history.push('/main/customers/list')}>Manage Customers</Button>
              </Space>
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

      <Modal title="Add Customer" visible={showAddCustomer} width={750}
        onCancel={() => { setShowAddCustomer(false); custForm.resetFields(); }}
        onOk={() => custForm.submit()} okText="Create" destroyOnClose>
        <Form form={custForm} layout="vertical" onFinish={onCreateCustomer} preserve={false}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'nowrap' }}>
            <Form.Item name="first_name" label="First Name" rules={[{ required: true, message: 'Enter first name' }]} style={{ flex: 1 }}><Input /></Form.Item>
            <Form.Item name="last_name" label="Last Name" style={{ flex: 1 }}><Input /></Form.Item>
            <Form.Item name="display_name" label="Display Name" style={{ flex: 1 }}><Input placeholder="Auto-generated if blank" /></Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'nowrap' }}>
            <Form.Item name="email" label="Email" style={{ flex: 1 }}><Input type="email" placeholder="email@example.com" /></Form.Item>
            <Form.Item name="phone_number" label="Phone" style={{ flex: 1 }}><Input placeholder="(XXX) XXX-XXXX" onChange={e => custForm.setFieldsValue({ phone_number: phoneInputHandler(e.target.value) })} /></Form.Item>
            <Form.Item name="mobile_number" label="Mobile" style={{ flex: 1 }}><Input placeholder="(XXX) XXX-XXXX" onChange={e => custForm.setFieldsValue({ mobile_number: phoneInputHandler(e.target.value) })} /></Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'nowrap' }}>
            <Form.Item name="company_name" label="Company" style={{ flex: 1 }}><Input /></Form.Item>
            <Form.Item name="address1" label="Address" style={{ flex: 1 }}><Input placeholder="123 Main St" /></Form.Item>
            <Form.Item name="address2" label="Address Line 2" style={{ flex: 1 }}><Input placeholder="Suite 100" /></Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'nowrap' }}>
            <Form.Item name="city" label="City" style={{ flex: 1 }}><Input /></Form.Item>
            <Form.Item name="state" label="State" style={{ flex: 1 }}><Input /></Form.Item>
            <Form.Item name="postal_code" label="ZIP" style={{ flex: 1 }}><Input /></Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'nowrap' }}>
            <Form.Item name="country" label="Country" style={{ flex: 1 }}>
              <Select showSearch placeholder="Select country" allowClear optionFilterProp="children">
                {COUNTRIES.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
              </Select>
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default CustomerCenter;