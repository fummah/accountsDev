import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, DatePicker, Select, message } from 'antd';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { Option } = Select;

const BillManagement = () => {
  const { symbol: cSym } = useCurrency();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    loadBills();
  }, []);

  const loadBills = async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getAllExpenses();
      // support backend returning array or object
      if (Array.isArray(data)) setBills(data);
      else if (data && data.success && Array.isArray(data.data)) setBills(data.data);
      else setBills([]);
    } catch (err) {
      console.error('Failed to load bills', err);
      message.error('Failed to load bills');
      setBills([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => setShowModal(true);

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      const payee = values.vendor;
      const payment_account = values.payment_account || null;
      const payment_date = values.dueDate ? values.dueDate.format('YYYY-MM-DD') : null;
      const payment_method = values.payment_method || 'check';
      const ref_no = values.ref_no || '';
      const category = values.category || 'Bills';
      const entered_by = 'system';
      const approval_status = 'Pending';
      const expenseLines = [
        {
          category,
          description: values.description || '',
          amount: parseFloat(values.amount) || 0,
        },
      ];

      const res = await window.electronAPI.insertExpense(payee, payment_account, payment_date, payment_method, ref_no, category, entered_by, approval_status, expenseLines);
      if (res && res.success) {
        message.success('Bill created');
        setShowModal(false);
        form.resetFields();
        await loadBills();
      } else {
        message.error(res?.error || 'Failed to create bill');
      }
    } catch (err) {
      console.error('Create bill error', err);
      message.error('Failed to create bill');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { title: 'Bill Number', dataIndex: 'id', key: 'id' },
    { title: 'Vendor', key: 'payee', render: (_, r) => r.payee_name || r.payee },
    { title: 'Due Date', dataIndex: 'payment_date', key: 'payment_date', render: d => d ? moment(d).format('YYYY-MM-DD') : '' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: a => `${cSym} ${Number(a || 0).toFixed(2)}` },
    { title: 'Status', dataIndex: 'approval_status', key: 'approval_status' },
    { title: 'Action', key: 'action', render: (_, record) => (
      <Space>
        <Button type="link">View</Button>
        <Button type="link">Edit</Button>
      </Space>
    )},
  ];

  return (
    <Card title="Bill Management">
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={handleCreate}>Create New Bill</Button>
      </div>

      <Table columns={columns} dataSource={bills} loading={loading} rowKey={r => r.id || r.key} pagination={{ pageSize: 20, showSizeChanger: true }} />

      <Modal
        title="Create New Bill"
        visible={showModal}
        onCancel={() => { setShowModal(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText="Create"
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="vendor" label="Vendor" rules={[{ required: true, message: 'Please enter vendor' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="dueDate" label="Due Date" rules={[{ required: true, message: 'Please select due date' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Please enter amount' }]}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="payment_method" label="Payment Method">
            <Select>
              <Option value="check">Check</Option>
              <Option value="direct_deposit">Direct Deposit</Option>
            </Select>
          </Form.Item>
          <Form.Item name="ref_no" label="Reference Number">
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default BillManagement;