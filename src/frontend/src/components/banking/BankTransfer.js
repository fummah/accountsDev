import React, { useState, useEffect } from 'react';
import { Form, Select, Input, InputNumber, DatePicker, Button, Card, message, Statistic, Space } from 'antd';
import { SwapOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Option } = Select;

const BankTransfer = () => {
  const [form] = Form.useForm();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fromBalance, setFromBalance] = useState(0);
  const [toBalance, setToBalance] = useState(0);

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

  const refreshBalance = async (accountId, setter) => {
    try {
      if (!accountId) { setter(0); return; }
      const trial = await window.electronAPI.getTrialBalance();
      const row = Array.isArray(trial) ? trial.find(r => Number(r.accountId) === Number(accountId)) : null;
      const bal = row ? Number(row.balance || 0) : 0;
      setter(bal);
    } catch (e) {
      setter(0);
    }
  };

  const exportTransfersCSV = async () => {
    try {
      const txs = await window.electronAPI.getTransactions();
      const transfers = (txs || []).filter(t => ['transfer_in','transfer_out'].includes((t.type || '').toLowerCase()));
      const headers = ['id','date','accountId','type','reference','description','debit','credit'];
      const rows = transfers.map(d => headers.map(h => `"${(d[h] ?? '').toString().replace(/"/g,'""')}"`).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transfers_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      message.error('Failed to export CSV');
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

      <Card style={{ maxWidth: 700, margin: '0 auto' }} title="Bank Transfer" extra={<Button onClick={exportTransfersCSV}>Export CSV</Button>}>
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
            <Select placeholder="Select source account" onChange={(val)=> refreshBalance(val, setFromBalance)}>
              {accounts.map(account => (
                <Option key={account.id} value={account.id}>
                  {account.accountName}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <div style={{ marginBottom: 16 }}>
            <Statistic title="From Account Balance" prefix="$" value={Number(fromBalance).toFixed(2)} />
          </div>

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
            <Select placeholder="Select destination account" onChange={(val)=> refreshBalance(val, setToBalance)}>
              {accounts.map(account => (
                <Option key={account.id} value={account.id}>
                  {account.accountName}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <div style={{ marginBottom: 16 }}>
            <Statistic title="To Account Balance" prefix="$" value={Number(toBalance).toFixed(2)} />
          </div>

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