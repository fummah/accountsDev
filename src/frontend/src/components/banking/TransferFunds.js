import React, { useState, useEffect } from 'react';
import { Form, Input, Select, DatePicker, Button, Table, message, Card } from 'antd';
import { SwapOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Option } = Select;

const TransferFunds = () => {
  const [form] = Form.useForm();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [transfers, setTransfers] = useState([]);

  useEffect(() => {
    loadAccounts();
    loadTransfers();
  }, []);

  const loadAccounts = async () => {
    try {
      const accountsData = await window.electronAPI.getChartOfAccounts();
      setAccounts(accountsData.filter(account => 
        account.accountType.toLowerCase().includes('bank') ||
        account.accountType.toLowerCase().includes('cash')
      ));
    } catch (error) {
      message.error('Failed to load accounts');
    }
  };

  const loadTransfers = async () => {
    try {
      const transactions = await window.electronAPI.getTransactions();
      setTransfers(transactions.filter(tx => 
        tx.type === 'transfer' && !tx.voided
      ));
    } catch (error) {
      message.error('Failed to load transfers');
    }
  };

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      
      if (values.fromAccount === values.toAccount) {
        message.error('From and To accounts must be different');
        return;
      }

      const transferData = {
        date: values.date.format('YYYY-MM-DD'),
        amount: parseFloat(values.amount),
        description: values.description,
        reference: values.reference,
        type: 'transfer',
        fromAccount: values.fromAccount,
        toAccount: values.toAccount
      };

      await window.electronAPI.insertTransaction(transferData);
      message.success('Transfer recorded successfully');
      form.resetFields();
      loadTransfers();
    } catch (error) {
      message.error('Failed to record transfer');
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
      title: 'From Account',
      dataIndex: 'fromAccountName',
      key: 'fromAccountName',
    },
    {
      title: 'To Account',
      dataIndex: 'toAccountName',
      key: 'toAccountName',
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount) => `$${amount.toFixed(2)}`,
    },
    {
      title: 'Reference',
      dataIndex: 'reference',
      key: 'reference',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    }
  ];

  return (
    <div style={{ padding: '24px' }}>
      <h2>Transfer Funds</h2>

      <div style={{ display: 'flex', gap: '24px' }}>
        <Card style={{ flex: 1 }}>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
          >
            <Form.Item
              name="date"
              label="Date"
              rules={[{ required: true, message: 'Please select date!' }]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              name="fromAccount"
              label="From Account"
              rules={[{ required: true, message: 'Please select source account!' }]}
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
              name="toAccount"
              label="To Account"
              rules={[{ required: true, message: 'Please select destination account!' }]}
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
              <Input prefix="$" type="number" />
            </Form.Item>

            <Form.Item
              name="description"
              label="Description"
              rules={[{ required: true, message: 'Please enter description!' }]}
            >
              <Input.TextArea rows={3} />
            </Form.Item>

            <Form.Item
              name="reference"
              label="Reference Number"
            >
              <Input />
            </Form.Item>

            <Form.Item>
              <Button 
                type="primary"
                icon={<SwapOutlined />}
                loading={loading}
                htmlType="submit"
              >
                Make Transfer
              </Button>
            </Form.Item>
          </Form>
        </Card>

        <Card style={{ flex: 2 }}>
          <h3>Recent Transfers</h3>
          <Table 
            columns={columns} 
            dataSource={transfers}
            rowKey="id"
          />
        </Card>
      </div>
    </div>
  );
};

export default TransferFunds;