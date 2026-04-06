import React, { useState, useEffect } from 'react';
import { Table, Button, Form, Input, DatePicker, Select, Modal, message, Card, Statistic, Tag } from 'antd';
import { PlusOutlined, FileTextOutlined, DollarOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useHistory } from 'react-router-dom';
import { useCurrency } from '../../utils/currency';

const { Option } = Select;

const BillTracker = () => {
  const { symbol: cSym } = useCurrency();
  const [bills, setBills] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const history = useHistory();

  useEffect(() => {
    loadBills();
    loadVendors();
  }, []);

  const loadBills = async () => {
    try {
      const data = await window.electronAPI.getAllExpenses();
      const list = Array.isArray(data) ? data : (data && data.data) ? data.data : [];
      // map to tracker shape
      const mapped = list.map(b => ({
        id: b.id,
        billDate: b.payment_date,
        dueDate: b.payment_date,
        vendorName: b.payee_name || b.payee,
        billNumber: b.ref_no || b.id,
        amount: b.amount || 0,
        status: b.approval_status || 'Pending',
        ref_no: b.ref_no
      }));
      setBills(mapped);
    } catch (error) {
      console.error('Failed to load bills', error);
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
      const payee = values.vendorId;
      const payment_account = 'Accounts Payable';
      const payment_date = values.billDate ? values.billDate.format('YYYY-MM-DD') : null;
      const payment_method = 'check';
      const ref_no = values.billNumber || '';
      const category = 'supplier';
      const entered_by = 'system';
      const approval_status = 'Pending';
      const expenseLines = [{ category: 'Bills', description: values.description || '', amount: Number(values.amount) || 0 }];

      const res = await window.electronAPI.insertExpense(payee, payment_account, payment_date, payment_method, ref_no, category, entered_by, approval_status, expenseLines);
      if (res && res.success) {
        message.success('Bill created successfully');
        setIsModalVisible(false);
        form.resetFields();
        await loadBills();
      } else {
        message.error('Failed to create bill');
      }
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
      render: (amount) => `${cSym} ${amount.toFixed(2)}`,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const s = (status || '').toLowerCase();
        const colors = { paid: 'green', pending: 'orange', overdue: 'red' };
        return <Tag color={colors[s] || 'default'}>{(status || '').toUpperCase()}</Tag>;
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
            disabled={(record.status || '').toLowerCase() === 'paid'}
          >
            Pay
          </Button>
        </Button.Group>
      ),
    },
  ];

  const handleViewBill = (record) => {
    try {
      if (record && record.id) {
        history.push(`/main/vendors/bills/edit/${record.id}`);
      } else {
        message.warning('Unable to open bill: missing id');
      }
    } catch (e) {
      message.error('Failed to open bill');
    }
  };

  const handlePayBill = async (record) => {
    try {
      setLoading(true);
      const tx = {
        date: record.billDate || record.payment_date || new Date().toISOString().slice(0,10),
        type: 'Bill Payment',
        amount: Number(record.amount || 0),
        description: `Payment for bill ${record.billNumber || record.ref_no || record.id}`,
        entered_by: 'system'
      };
      await window.electronAPI.insertTransaction(tx);
      const res = await window.electronAPI.markExpensePaid(record.id);
      if (res && res.success) {
        message.success('Payment recorded and bill marked as paid');
        await loadBills();
      } else {
        message.error('Payment recorded but failed to mark bill paid');
      }
    } catch (err) {
      console.error('Failed to pay bill', err);
      message.error('Failed to pay bill');
    } finally {
      setLoading(false);
    }
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
            prefix={cSym}
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
            <Input prefix={cSym} type="number" />
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