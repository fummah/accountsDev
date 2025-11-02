import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Table, Button, Space, Tabs, message } from 'antd';
import { UserOutlined, DollarOutlined, FileDoneOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import moment from 'moment';

const { TabPane } = Tabs;

const CustomerCenter = () => {
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalCustomers: 0,
    totalReceivables: 0,
    overdueAmount: 0,
    quotesOpen: 0
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [customersData, invoicesData, quotesData] = await Promise.all([
        window.electronAPI.getCustomers(),
        window.electronAPI.getInvoices(),
        window.electronAPI.getQuotes()
      ]);

      setCustomers(customersData);
      setInvoices(invoicesData);
      setQuotes(quotesData);

      // Calculate statistics
      const totalReceivables = invoicesData.reduce((sum, inv) => 
        sum + (inv.status === 'Unpaid' ? inv.amount : 0), 0);
      const overdueAmount = invoicesData.reduce((sum, inv) => 
        sum + (inv.status === 'Unpaid' && moment(inv.dueDate).isBefore(moment()) ? inv.amount : 0), 0);
      const openQuotes = quotesData.filter(q => q.status === 'Open').length;

      setStats({
        totalCustomers: customersData.length,
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

  const customerColumns = [
    {
      title: 'Name',
      dataIndex: 'display_name',
      key: 'name',
      render: (text, record) => (
        <Link to={`/main/customers/details/${record.id}`}>{text}</Link>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Phone',
      dataIndex: 'phone_number',
      key: 'phone',
    },
    {
      title: 'Balance',
      key: 'balance',
      render: (_, record) => `$${record.opening_balance || '0.00'}`,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button type="link" href={`/main/customers/invoices/new?customer=${record.id}`}>
            New Invoice
          </Button>
          <Button type="link" href={`/main/customers/quotes/new?customer=${record.id}`}>
            New Quote
          </Button>
        </Space>
      ),
    },
  ];

  const invoiceColumns = [
    {
      title: 'Invoice #',
      dataIndex: 'number',
      key: 'number',
      render: (text, record) => (
        <Link to={`/main/customers/invoices/edit/${record.id}`}>{text}</Link>
      ),
    },
    {
      title: 'Customer',
      dataIndex: 'customer_name',
      key: 'customer',
    },
    {
      title: 'Date',
      dataIndex: 'start_date',
      key: 'date',
      render: (date) => moment(date).format('MM/DD/YYYY'),
    },
    {
      title: 'Due Date',
      dataIndex: 'last_date',
      key: 'dueDate',
      render: (date) => moment(date).format('MM/DD/YYYY'),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount) => `$${amount.toFixed(2)}`,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
    },
  ];

  const quoteColumns = [
    {
      title: 'Quote #',
      dataIndex: 'number',
      key: 'number',
      render: (text, record) => (
        <Link to={`/main/customers/quotes/edit/${record.id}`}>{text}</Link>
      ),
    },
    {
      title: 'Customer',
      dataIndex: 'customer_name',
      key: 'customer',
    },
    {
      title: 'Date',
      dataIndex: 'start_date',
      key: 'date',
      render: (date) => moment(date).format('MM/DD/YYYY'),
    },
    {
      title: 'Expiry Date',
      dataIndex: 'last_date',
      key: 'expiryDate',
      render: (date) => moment(date).format('MM/DD/YYYY'),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount) => `$${amount.toFixed(2)}`,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <h2>Customer Center</h2>

      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Customers"
              value={stats.totalCustomers}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Receivables"
              value={stats.totalReceivables}
              precision={2}
              prefix={<DollarOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Overdue Amount"
              value={stats.overdueAmount}
              precision={2}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Open Quotes"
              value={stats.quotesOpen}
              prefix={<FileDoneOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Tabs defaultActiveKey="customers">
          <TabPane tab="Customers" key="customers">
            <div style={{ marginBottom: '16px' }}>
              <Button type="primary" href="/main/customers/new">
                Add Customer
              </Button>
            </div>
            <Table
              columns={customerColumns}
              dataSource={customers}
              rowKey="id"
              loading={loading}
            />
          </TabPane>

          <TabPane tab="Invoices" key="invoices">
            <div style={{ marginBottom: '16px' }}>
              <Button type="primary" href="/main/customers/invoices/new">
                Create Invoice
              </Button>
            </div>
            <Table
              columns={invoiceColumns}
              dataSource={invoices}
              rowKey="id"
              loading={loading}
            />
          </TabPane>

          <TabPane tab="Quotes" key="quotes">
            <div style={{ marginBottom: '16px' }}>
              <Button type="primary" href="/main/customers/quotes/new">
                Create Quote
              </Button>
            </div>
            <Table
              columns={quoteColumns}
              dataSource={quotes}
              rowKey="id"
              loading={loading}
            />
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default CustomerCenter;