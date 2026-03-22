import React, { useState, useEffect } from 'react';
import { Card, Form, Select, DatePicker, Button, Table, Row, Col, Alert, message, InputNumber } from 'antd';
import moment from 'moment';

const { Option } = Select;

const Reconcile = () => {
  const [form] = Form.useForm();
  const [reconcilingData, setReconcilingData] = useState(null);
  const [reconciled, setReconciled] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const data = await window.electronAPI.getChartOfAccounts();
      console.log('Loaded accounts:', data);
        if (Array.isArray(data)) {
          // Set all accounts without filtering
          setAccounts(data);
      } else {
        console.error('Invalid accounts data received:', data);
        message.error('Failed to load accounts: Invalid data format');
      }
    } catch (error) {
      console.error('Failed to load accounts:', error);
      message.error('Failed to load accounts');
    }
  };

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Reference',
      dataIndex: 'reference',
      key: 'reference',
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (text, record) => (
        <Select 
          defaultValue={text} 
          style={{ width: 120 }}
          onChange={(value) => handleStatusChange(record.key, value)}
        >
          <Option value="unreconciled">Unreconciled</Option>
          <Option value="reconciled">Reconciled</Option>
          <Option value="pending">Pending</Option>
        </Select>
      ),
    },
  ];

  const data = [
    {
      key: '1',
      date: '2025-11-01',
      description: 'Customer Payment',
      reference: 'PAY-001',
      amount: '1,500.00',
      status: 'unreconciled',
    },
    {
      key: '2',
      date: '2025-11-01',
      description: 'Vendor Payment',
      reference: 'BIL-001',
      amount: '-500.00',
      status: 'unreconciled',
    },
  ];

  const loadTransactions = async (accountId) => {
    try {
      setLoading(true);
      const data = await window.electronAPI.getTransactions();
      return data.filter(tx => tx.accountId === accountId);
    } catch (error) {
      message.error('Failed to load transactions');
      return [];
    } finally {
      setLoading(false);
    }
  };

  const onFinish = async (values) => {
    try {
      const txs = await loadTransactions(values.account);
      setTransactions(txs);
      setReconcilingData(txs.map(tx => ({
        key: tx.id,
        date: moment(tx.date).format('YYYY-MM-DD'),
        description: tx.description,
        reference: tx.reference,
        amount: tx.debit ? tx.debit : -tx.credit,
        status: tx.isReconciled ? 'reconciled' : 'unreconciled'
      })));
    } catch (error) {
      message.error('Failed to prepare reconciliation data');
    }
  };

  const handleStatusChange = async (key, value) => {
    try {
      const newData = reconcilingData.map(item => 
        item.key === key ? { ...item, status: value } : item
      );
      setReconcilingData(newData);
    } catch (error) {
      message.error('Failed to update transaction status');
    }
  };

  const handleReconcile = async () => {
    try {
      setLoading(true);
      const accountId = form.getFieldValue('account');
      const statementDate = form.getFieldValue('statementDate').format('YYYY-MM-DD');
      const endingBalance = form.getFieldValue('endingBalance');

      const reconcileResult = await window.electronAPI.reconcileTransactions({
        accountId,
        statementDate,
        statementBalance: endingBalance,
        transactions: reconcilingData
          .filter(tx => tx.status === 'reconciled')
          .map(tx => tx.key)
      });

      if (reconcileResult.success) {
        message.success('Account reconciled successfully');
        setReconciled(true);
        setReconcilingData(null);
        form.resetFields();
      } else {
        throw new Error(reconcileResult.error || 'Reconciliation failed');
      }
    } catch (error) {
      message.error(error.message || 'Failed to reconcile account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Account Reconciliation">
      {reconciled && (
        <Alert
          message="Account reconciled successfully"
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
      >
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="account"
              label="Select Account"
              rules={[{ required: true, message: 'Please select an account' }]}
            >
              <Select loading={loading}>
                {accounts.map(account => (
                    <Option key={account.id} value={account.id}>
                      {account.number} - {account.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="statementDate"
              label="Statement Date"
              rules={[{ required: true, message: 'Please select statement date' }]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="endingBalance"
              label="Statement Ending Balance"
              rules={[{ required: true, message: 'Please enter ending balance' }]}
            >
              <InputNumber 
                style={{ width: '100%' }}
                formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={value => value.replace(/\$\s?|(,*)/g, '')}
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item>
          <Button type="primary" htmlType="submit">
            Begin Reconciliation
          </Button>
        </Form.Item>
      </Form>

      {reconcilingData && (
        <>
          <Table
            columns={columns}
            dataSource={reconcilingData}
            pagination={false}
            style={{ marginBottom: 16 }}
          />
          <Row justify="space-between" style={{ marginTop: 16 }}>
            <Col>
              <Button onClick={() => setReconcilingData(null)} disabled={loading}>
            Cancel
          </Button>
            </Col>
            <Col>
              <Button type="primary" onClick={handleReconcile} loading={loading}>
                Complete Reconciliation
              </Button>
            </Col>
          </Row>
        </>
      )}
    </Card>
  );
};

export default Reconcile;