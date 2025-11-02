import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, DatePicker, Select, message } from 'antd';

const { Option } = Select;

const ExpenseTracking = () => {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();

  const columns = [
    { title: 'Date', dataIndex: 'payment_date', key: 'payment_date', render: (d) => d || '-' },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    { title: 'Category', dataIndex: 'category', key: 'category' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (v) => `$${Number(v || 0).toFixed(2)}` },
  ];

  const loadExpenses = async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getAllExpenses();
      // backend returns array of expenses
      setExpenses(Array.isArray(data) ? data : (data.all || []));
    } catch (err) {
      console.error('Failed to load expenses', err);
      message.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, []);

  const showModal = () => setIsModalVisible(true);
  const hideModal = () => {
    setIsModalVisible(false);
    form.resetFields();
  };

  const handleAddExpense = async (values) => {
    try {
      // Build a minimal expense payload compatible with backend insertExpense
      const payee = values.payee || 'Unknown';
      const payment_account = values.payment_account || 'Cash';
      const payment_date = values.payment_date ? values.payment_date.format('YYYY-MM-DD') : null;
      const payment_method = values.payment_method || 'cash';
      const ref_no = values.ref_no || '';
      const category = values.category || 'Other';
      const entered_by = 'system';
      const approval_status = 'Pending';
      const amount = Number(values.amount) || 0;

      const expenseLines = [{ category, description: values.description || '', amount }];

      const res = await window.electronAPI.insertExpense(payee, payment_account, payment_date, payment_method, ref_no, category, entered_by, approval_status, expenseLines);
      if (res && res.success) {
        message.success('Expense added');
        hideModal();
        loadExpenses();
      } else {
        message.error('Failed to add expense');
      }
    } catch (err) {
      console.error(err);
      message.error('Failed to add expense');
    }
  };

  return (
    <Card title="Expense Tracking">
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={showModal}>Add Expense</Button>
      </div>
      <Table columns={columns} dataSource={expenses} loading={loading} rowKey={(r) => r.id || r.key} />

      <Modal title="Add Expense" visible={isModalVisible} onCancel={hideModal} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={handleAddExpense}>
          <Form.Item name="payee" label="Payee"><Input/></Form.Item>
          <Form.Item name="payment_date" label="Date"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="category" label="Category"><Input/></Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Please enter amount' }]}><Input/></Form.Item>
          <Form.Item name="payment_method" label="Payment Method"><Select><Option value="cash">Cash</Option><Option value="check">Check</Option><Option value="card">Card</Option></Select></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default ExpenseTracking;