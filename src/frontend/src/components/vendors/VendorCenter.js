import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Table, Button, Space, Tabs, message, Modal, Form, Input } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
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

  const [activeKey, setActiveKey] = useState('vendors');

  const [showAddVendor, setShowAddVendor] = React.useState(false);
  const [vendorForm] = Form.useForm();

  const onCreateVendor = async (values) => {
    try {
      const title = '';
      const first_name = values.first_name || '';
      const middle_name = '';
      const last_name = '';
      const suffix = '';
      const email = values.email || '';
      const display_name = values.display_name || values.first_name || '';
      const company_name = '';
      const phone_number = '';
      const mobile_number = values.mobile_number || '';
      const fax = '';
      const other = '';
      const website = '';
      const address1 = '';
      const address2 = '';
      const city = '';
      const state = '';
      const postal_code = '';
      const country = '';
      const supplier_terms = '';
      const business_number = '';
      const account_number = '';
      const expense_category = '';
      const opening_balance = values.opening_balance || 0;
      const as_of = null;
      const entered_by = 'system';
      const notes = '';

      const res = await window.electronAPI.insertSupplier(title, first_name, middle_name, last_name, suffix, email, display_name, company_name, phone_number, mobile_number, fax, other, website, address1, address2, city, state, postal_code, country, supplier_terms, business_number, account_number, expense_category, opening_balance, as_of, entered_by, notes);
      if (res && res.success) {
        message.success('Vendor added');
        setShowAddVendor(false);
        vendorForm.resetFields();
        await loadData();
      } else {
        message.error('Failed to add vendor');
      }
    } catch (err) {
      console.error('Error adding vendor', err);
      message.error('Error adding vendor');
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [vendorsData, billsData] = await Promise.all([
        window.electronAPI.getAllSuppliers(),
        window.electronAPI.getAllExpenses()
      ]);

  // normalize backend response shapes
  const vendorsList = Array.isArray(vendorsData) ? vendorsData : (vendorsData && vendorsData.all) ? vendorsData.all : (vendorsData && vendorsData.data) ? vendorsData.data : [];
  const billsList = Array.isArray(billsData) ? billsData : (billsData && billsData.all) ? billsData.all : (billsData && billsData.data) ? billsData.data : [];

  setVendors(vendorsList);
  setBills(billsList);

      // Calculate statistics
      const isUnpaid = (b) => ((b.approval_status || '').toLowerCase() !== 'paid');
      const totalPayables = billsList.reduce((sum, bill) => sum + (isUnpaid(bill) ? Number(bill.amount || 0) : 0), 0);
      const overdueAmount = billsList.reduce((sum, bill) => {
        const date = bill.payment_date || bill.dueDate;
        const isOverdue = isUnpaid(bill) && date && moment(date).isBefore(moment(), 'day');
        return sum + (isOverdue ? Number(bill.amount || 0) : 0);
      }, 0);
      const unpaidBills = billsList.filter(isUnpaid).length;

      setStats({
        totalVendors: vendorsList.length,
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
      dataIndex: 'payee_name',
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
      dataIndex: 'payment_date',
      key: 'dueDate',
      render: (date) => moment(date).format('MM/DD/YYYY'),
    },
    {
      title: 'Amount',
      key: 'amount',
      render: (_, record) => {
        const total = record.amount || 0;
        return `$${Number(total).toFixed(2)}`;
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
        <Tabs activeKey={activeKey} onChange={setActiveKey} destroyInactiveTabPane>
          <TabPane tab="Vendors" key="vendors">
            <div style={{ marginBottom: '16px' }}>
              <Button type="primary" onClick={() => setShowAddVendor(true)}>
                Add Vendor
              </Button>
            </div>
            <Table
              columns={vendorColumns}
              dataSource={vendors}
              rowKey="id"
              loading={loading}
            />
            <div style={{ marginTop: 16 }}>
              <Button icon={<ArrowLeftOutlined />} onClick={() => window.history.back()}>Back</Button>
            </div>
              <Modal
                title="Add Vendor"
                open={showAddVendor}
                onCancel={() => { setShowAddVendor(false); vendorForm.resetFields(); }}
                onOk={() => vendorForm.submit()}
                okText="Create"
              >
                <Form form={vendorForm} layout="vertical" onFinish={onCreateVendor}>
                  <Form.Item name="first_name" label="Name" rules={[{ required: true, message: 'Please enter vendor name' }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="display_name" label="Display Name">
                    <Input />
                  </Form.Item>
                  <Form.Item name="email" label="Email">
                    <Input />
                  </Form.Item>
                  <Form.Item name="mobile_number" label="Mobile Number">
                    <Input />
                  </Form.Item>
                  <Form.Item name="opening_balance" label="Opening Balance">
                    <Input />
                  </Form.Item>
                </Form>
              </Modal>
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
            <div style={{ marginTop: 16 }}>
              <Button icon={<ArrowLeftOutlined />} onClick={() => window.history.back()}>Back</Button>
            </div>
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default VendorCenter;