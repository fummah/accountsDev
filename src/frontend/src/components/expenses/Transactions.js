import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, DatePicker, Select, InputNumber, Input, message } from 'antd';

const { Option } = Select;

const Transactions = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form] = Form.useForm();

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getTransactions();
      setTransactions(Array.isArray(data) ? data.map(t => ({ ...t, key: t.id })) : []);
    } catch (err) {
      console.error('Failed to load transactions', err);
      message.error('Failed to load transactions');
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTransactions(); }, []);

  const handleNew = () => setShowModal(true);
  const hideModal = () => { setShowModal(false); form.resetFields(); };

  const handleCreate = async (values) => {
    try {
      setLoading(true);
      const tx = {
        date: values.date ? values.date.format('YYYY-MM-DD') : null,
        type: values.type,
        amount: Number(values.amount) || 0,
        description: values.description || '',
        entered_by: 'system'
      };
      const res = await window.electronAPI.insertTransaction(tx);
      // better-sqlite3 run() returns object with changes and lastInsertRowid
      if (res && (res.changes > 0 || res.success)) {
        message.success('Transaction added');
        hideModal();
        await loadTransactions();
      } else {
        message.error('Failed to add transaction');
      }
    } catch (err) {
      console.error('Error adding transaction', err);
      message.error('Error adding transaction');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Type', dataIndex: 'type', key: 'type' },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: a => `$${Number(a||0).toFixed(2)}` },
    { title: 'Status', dataIndex: 'status', key: 'status' },
  ];

  return (
    <Card title="Expense Transactions">
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={handleNew}>New Transaction</Button>
      </div>
      <Table columns={columns} dataSource={transactions} loading={loading} rowKey={r => r.id || r.key} pagination={{ pageSize: 20, showSizeChanger: true }} />

      <Modal title="New Transaction" open={showModal} onCancel={hideModal} onOk={() => form.submit()} okText="Save">
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="date" label="Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Select>
              <Option value="Expense">Expense</Option>
              <Option value="Income">Income</Option>
              <Option value="Transfer">Transfer</Option>
            </Select>
          </Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Please enter amount' }]}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default Transactions;