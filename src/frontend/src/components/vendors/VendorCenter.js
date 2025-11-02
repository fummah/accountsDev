import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Table, Button, Space, Tabs, message } from 'antd';
import { ShopOutlined, DollarOutlined, FileTextOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import moment from 'moment';

const { TabPane } = Tabs;

const VendorCenter = () => {
  const [vendors, setVendors] = useState([]);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalVendors: 0,
    totalPayables: 0,
    overdueAmount: 0,
    unpaidBills: 0
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [vendorsData, billsData] = await Promise.all([
        window.electronAPI.getSuppliers(),
        window.electronAPI.getExpenses()
      ]);

      setVendors(vendorsData);
      setBills(billsData);

      // Calculate statistics
      const totalPayables = billsData.reduce((sum, bill) => 
        sum + (bill.status === 'Unpaid' ? bill.amount : 0), 0);
      const overdueAmount = billsData.reduce((sum, bill) => 
        sum + (bill.status === 'Unpaid' && moment(bill.dueDate).isBefore(moment()) ? bill.amount : 0), 0);
      const unpaidBills = billsData.filter(bill => bill.status === 'Unpaid').length;

      setStats({
        totalVendors: vendorsData.length,
        totalPayables,
        overdueAmount,
        unpaidBills
      });
    } catch (error) {
      message.error('Failed to load vendor data');
    } finally {
      setLoading(false);
    }
  };

  const vendorColumns = [
    {
      title: 'Name',
      dataIndex: 'display_name',
      key: 'name',
      render: (text, record) => (
        <Link to={`/main/vendors/details/${record.id}`}>{text}</Link>
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
          <Button type="link" href={`/main/vendors/bills/new?vendor=${record.id}`}>
            Enter Bill
          </Button>
          <Button type="link" href={`/main/vendors/details/${record.id}`}>
            View Details
          </Button>
        </Space>
      ),
    },
  ];

  const billColumns = [
    {
      title: 'Bill #',
      dataIndex: 'ref_no',
      key: 'billNumber',
      render: (text, record) => (
        <Link to={`/main/vendors/bills/edit/${record.id}`}>{text}</Link>
      ),
    },
    {
      title: 'Vendor',
      dataIndex: 'payee',
      key: 'vendor',
    },
    {
      title: 'Date',
      dataIndex: 'payment_date',
      key: 'date',
      render: (date) => moment(date).format('MM/DD/YYYY'),
    },
    {
      title: 'Due Date',
      dataIndex: 'due_date',
      key: 'dueDate',
      render: (date) => moment(date).format('MM/DD/YYYY'),
    },
    {
      title: 'Amount',
      key: 'amount',
      render: (_, record) => {
        const total = record.expenseLines.reduce((sum, line) => sum + line.amount, 0);
        return `$${total.toFixed(2)}`;
      },
    },
    {
      title: 'Status',
      dataIndex: 'approval_status',
      key: 'status',
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <h2>Vendor Center</h2>

      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Vendors"
              value={stats.totalVendors}
              prefix={<ShopOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Payables"
              value={stats.totalPayables}
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
              title="Unpaid Bills"
              value={stats.unpaidBills}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Tabs defaultActiveKey="vendors">
          <TabPane tab="Vendors" key="vendors">
            <div style={{ marginBottom: '16px' }}>
              <Button type="primary" href="/main/vendors/new">
                Add Vendor
              </Button>
            </div>
            <Table
              columns={vendorColumns}
              dataSource={vendors}
              rowKey="id"
              loading={loading}
            />
          </TabPane>

          <TabPane tab="Bills" key="bills">
            <div style={{ marginBottom: '16px' }}>
              <Button type="primary" href="/main/vendors/bills/new">
                Enter Bill
              </Button>
            </div>
            <Table
              columns={billColumns}
              dataSource={bills}
              rowKey="id"
              loading={loading}
            />
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default VendorCenter;