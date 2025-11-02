import React, { useState, useEffect } from 'react';
import { Table, Button, Form, Input, DatePicker, Select, Modal, message, Card } from 'antd';
import { PlusOutlined, FileTextOutlined, DollarOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Option } = Select;

const BillTracker = () => {
  const [bills, setBills] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    loadBills();
    loadVendors();
  }, []);

  const loadBills = async () => {
    try {
      // Assuming there's a bills endpoint
      const data = await window.electronAPI.getAllBills();
      setBills(data);
    } catch (error) {
      message.error('Failed to load bills');
    }
  };

  const loadVendors = async () => {
    try {
      const data = await window.electronAPI.getAllSuppliers();
      setVendors(data);
    } catch (error) {
      message.error('Failed to load vendors');
    }
  };

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      const billData = {
        ...values,
        dueDate: values.dueDate.format('YYYY-MM-DD'),
        billDate: values.billDate.format('YYYY-MM-DD'),
        status: 'pending'
      };

      // TODO: Implement createBill in the backend
      await window.electronAPI.createBill(billData);
      message.success('Bill created successfully');
      setIsModalVisible(false);
      form.resetFields();
      loadBills();
    } catch (error) {
      message.error('Failed to create bill');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'Bill Date',
      dataIndex: 'billDate',
      key: 'billDate',
      render: (date) => moment(date).format('MM/DD/YYYY'),
    },
    {
      title: 'Due Date',
      dataIndex: 'dueDate',
      key: 'dueDate',
      render: (date) => moment(date).format('MM/DD/YYYY'),
    },
    {
      title: 'Vendor',
      dataIndex: 'vendorName',
      key: 'vendorName',
    },
    {
      title: 'Bill Number',
      dataIndex: 'billNumber',
      key: 'billNumber',
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
      render: (status) => {
        const colors = {
          paid: 'green',
          pending: 'orange',
          overdue: 'red'
        };
        return <Tag color={colors[status]}>{status.toUpperCase()}</Tag>;
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Button.Group>
          <Button 
            icon={<FileTextOutlined />}
            onClick={() => handleViewBill(record)}
          >
            View
          </Button>
          <Button 
            icon={<DollarOutlined />}
            onClick={() => handlePayBill(record)}
            disabled={record.status === 'paid'}
          >
            Pay
          </Button>
        </Button.Group>
      ),
    },
  ];

  const handleViewBill = (record) => {
    // Implement view bill functionality
  };

  const handlePayBill = (record) => {
    // Implement pay bill functionality
  };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
        <h2>Bill Tracker</h2>
        <Button 
          type="primary" 
          icon={<PlusOutlined />}
          onClick={() => setIsModalVisible(true)}
        >
          Add Bill
        </Button>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <Card style={{ flex: 1 }}>
          <Statistic
            title="Total Unpaid Bills"
            value={bills.filter(b => b.status !== 'paid').reduce((acc, curr) => acc + curr.amount, 0)}
            precision={2}
            prefix="$"
          />
        </Card>
        <Card style={{ flex: 1 }}>
          <Statistic
            title="Overdue Bills"
            value={bills.filter(b => b.status === 'overdue').length}
            suffix="bills"
          />
        </Card>
        <Card style={{ flex: 1 }}>
          <Statistic
            title="Bills Due This Week"
            value={bills.filter(b => 
              moment(b.dueDate).isBetween(moment(), moment().add(7, 'days'))
            ).length}
            suffix="bills"
          />
        </Card>
      </div>

      <Table 
        columns={columns} 
        dataSource={bills}
        rowKey="id"
      />

      <Modal
        title="Add New Bill"
        open={isModalVisible}
        onOk={() => form.submit()}
        onCancel={() => {
          setIsModalVisible(false);
          form.resetFields();
        }}
        width={800}
        confirmLoading={loading}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="vendorId"
            label="Vendor"
            rules={[{ required: true }]}
          >
            <Select>
              {vendors.map(vendor => (
                <Option key={vendor.id} value={vendor.id}>
                  {vendor.company_name || `${vendor.first_name} ${vendor.last_name}`}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="billNumber"
            label="Bill Number"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="billDate"
            label="Bill Date"
            rules={[{ required: true }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="dueDate"
            label="Due Date"
            rules={[{ required: true }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="amount"
            label="Amount"
            rules={[{ required: true }]}
          >
            <Input prefix="$" type="number" />
          </Form.Item>

          <Form.Item
            name="description"
            label="Description"
          >
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default BillTracker;