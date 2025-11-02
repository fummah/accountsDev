import React, { useState, useEffect } from 'react';
import { Form, Select, Input, InputNumber, DatePicker, Button, Card, message } from 'antd';
import { SwapOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Option } = Select;

const BankTransfer = () => {
  const [form] = Form.useForm();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const data = await window.electronAPI.getChartOfAccounts();
      // Filter only bank accounts
      const bankAccounts = data.filter(account => 
        account.accountType.toLowerCase().includes('bank')
      );
      setAccounts(bankAccounts);
    } catch (error) {
      message.error('Failed to load bank accounts');
    }
  };

  const handleTransfer = async (values) => {
    try {
      setLoading(true);
      const transferData = {
        ...values,
        date: values.date.format('YYYY-MM-DD'),
        createdAt: moment().format('YYYY-MM-DD HH:mm:ss'),
      };

      await window.electronAPI.createBankTransfer(transferData);
      message.success('Transfer completed successfully');
      form.resetFields();
    } catch (error) {
      message.error('Failed to process transfer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      <h2>Bank Transfer</h2>

      <Card style={{ maxWidth: 600, margin: '0 auto' }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleTransfer}
          initialValues={{
            date: moment(),
          }}
        >
          <Form.Item
            name="fromAccount"
            label="From Account"
            rules={[{ required: true, message: 'Please select source account' }]}
          >
            <Select placeholder="Select source account">
              {accounts.map(account => (
                <Option key={account.id} value={account.id}>
                  {account.accountName}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <div style={{ textAlign: 'center', margin: '16px 0' }}>
            <SwapOutlined style={{ fontSize: '24px' }} />
          </div>

          <Form.Item
            name="toAccount"
            label="To Account"
            rules={[
              { required: true, message: 'Please select destination account' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('fromAccount') !== value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Source and destination accounts must be different'));
                },
              }),
            ]}
          >
            <Select placeholder="Select destination account">
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
            rules={[
              { required: true, message: 'Please enter transfer amount' },
              { type: 'number', min: 0.01, message: 'Amount must be greater than 0' },
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={value => value.replace(/\$\s?|(,*)/g, '')}
              precision={2}
              placeholder="Enter amount"
            />
          </Form.Item>

          <Form.Item
            name="date"
            label="Transfer Date"
            rules={[{ required: true, message: 'Please select transfer date' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="reference"
            label="Reference"
            rules={[{ required: true, message: 'Please enter reference' }]}
          >
            <Input placeholder="Enter reference number or description" />
          </Form.Item>

          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={loading}
              block
            >
              Complete Transfer
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default BankTransfer;