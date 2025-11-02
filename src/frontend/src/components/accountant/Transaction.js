import React, { useState, useEffect } from 'react';
import { Form, Input, Select, DatePicker, Button, Table, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Option } = Select;

const Transaction = () => {
  const [form] = Form.useForm();
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAccounts();
    loadTransactions();
  }, []);

  const loadAccounts = async () => {
    try {
      const accountsList = await window.electronAPI.getChartOfAccounts();
      setAccounts(accountsList);
    } catch (error) {
      message.error('Failed to load accounts');
    }
  };

  const loadTransactions = async () => {
    try {
      const transactionsList = await window.electronAPI.getTransactions();
      setTransactions(transactionsList);
    } catch (error) {
      message.error('Failed to load transactions');
    }
  };

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      const formattedValues = {
        ...values,
        date: values.date.format('YYYY-MM-DD'),
      };

      await window.electronAPI.createTransaction(formattedValues);
      message.success('Transaction saved successfully');
      form.resetFields();
      loadTransactions();
    } catch (error) {
      message.error('Failed to save transaction');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (date) => moment(date).format('DD/MM/YYYY'),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Account',
      dataIndex: 'accountName',
      key: 'accountName',
    },
    {
      title: 'Debit',
      dataIndex: 'debit',
      key: 'debit',
      render: (amount) => amount ? `$${amount.toFixed(2)}` : '',
    },
    {
      title: 'Credit',
      dataIndex: 'credit',
      key: 'credit',
      render: (amount) => amount ? `$${amount.toFixed(2)}` : '',
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <h2>Enter Transaction</h2>
      
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        style={{ maxWidth: '800px', marginBottom: '24px' }}
      >
        <Form.Item
          name="date"
          label="Transaction Date"
          rules={[{ required: true, message: 'Please select date!' }]}
        >
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          name="description"
          label="Description"
          rules={[{ required: true, message: 'Please enter description!' }]}
        >
          <Input />
        </Form.Item>

        <Form.Item
          name="accountId"
          label="Account"
          rules={[{ required: true, message: 'Please select account!' }]}
        >
          <Select>
            {accounts.map(account => (
              <Option key={account.id} value={account.id}>
                {account.accountName}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="amount"
          label="Amount"
          rules={[{ required: true, message: 'Please enter amount!' }]}
        >
          <Input type="number" prefix="$" />
        </Form.Item>

        <Form.Item
          name="type"
          label="Type"
          rules={[{ required: true, message: 'Please select type!' }]}
        >
          <Select>
            <Option value="debit">Debit</Option>
            <Option value="credit">Credit</Option>
          </Select>
        </Form.Item>

        <Form.Item>
          <Button 
            type="primary" 
            htmlType="submit" 
            icon={<SaveOutlined />}
            loading={loading}
          >
            Save Transaction
          </Button>
        </Form.Item>
      </Form>

      <h3>Recent Transactions</h3>
      <Table 
        columns={columns} 
        dataSource={transactions}
        rowKey="id"
      />
    </div>
  );
};

export default Transaction;