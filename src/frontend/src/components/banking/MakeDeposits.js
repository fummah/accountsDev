import React, { useState, useEffect } from 'react';
import { Form, Input, Select, DatePicker, Button, Table, message, Card, Modal, Space } from 'antd';
import { SaveOutlined, PlusOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Option } = Select;

const MakeDeposits = () => {
  const [form] = Form.useForm();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deposits, setDeposits] = useState([]);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [accountForm] = Form.useForm();

  useEffect(() => {
    loadAccounts();
    loadDeposits();
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

  const loadDeposits = async () => {
    try {
      const transactions = await window.electronAPI.getTransactions();
      setDeposits(transactions.filter(tx => 
        tx.type === 'deposit' && !tx.voided
      ));
    } catch (error) {
      message.error('Failed to load deposits');
    }
  };

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      
      const depositData = {
        ...values,
        date: values.date.format('YYYY-MM-DD'),
        type: 'deposit',
        amount: parseFloat(values.amount)
      };

      await window.electronAPI.insertTransaction(depositData);
      message.success('Deposit recorded successfully');
      form.resetFields();
      loadDeposits();
    } catch (error) {
      message.error('Failed to record deposit');
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
      title: 'Account',
      dataIndex: 'accountName',
      key: 'accountName',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
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
    }
  ];

  return (
    <div style={{ padding: '24px' }}>
      <h2>Make Deposits</h2>

      <div style={{ display: 'flex', gap: '24px' }}>
        <Card style={{ flex: 1 }}>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
          >
            <Form.Item
              name="accountId"
              label="Deposit To"
              rules={[{ required: true, message: 'Please select account!' }]}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                <Select style={{ flex: 1 }} placeholder={accounts.length ? 'Select account' : 'No bank accounts'}>
                  {accounts.map(account => (
                    <Option key={account.id} value={account.id}>
                      {account.accountName}{account.accountNumber ? ` (${account.accountNumber})` : ''}
                    </Option>
                  ))}
                </Select>
                <Button icon={<PlusOutlined />} onClick={() => setShowAddAccount(true)}>Add Account</Button>
              </div>
            </Form.Item>

            <Form.Item
              name="date"
              label="Date"
              rules={[{ required: true, message: 'Please select date!' }]}
            >
              <DatePicker style={{ width: '100%' }} />
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
                icon={<SaveOutlined />}
                loading={loading}
                htmlType="submit"
              >
                Record Deposit
              </Button>
            </Form.Item>
          </Form>
        </Card>

        {/* Add Account Modal */}
        <Modal
          title="Add Bank Account"
          open={showAddAccount}
          onCancel={() => { setShowAddAccount(false); accountForm.resetFields(); }}
          onOk={() => accountForm.submit()}
          okText="Create"
        >
          <Form form={accountForm} layout="vertical" onFinish={async (values) => {
            try {
              const res = await window.electronAPI.insertChartAccount(values.name, values.type, values.number, 'current_user');
              if (res && res.success) {
                message.success('Account created');
                setShowAddAccount(false);
                accountForm.resetFields();
                // reload accounts and set newly created as selected
                await loadAccounts();
                // set the newly created account as selected in deposit form if possible
                if (res.id) {
                  form.setFieldsValue({ accountId: res.id });
                }
              } else {
                message.error(res?.error || 'Failed to create account');
              }
            } catch (err) {
              console.error('Add account error', err);
              message.error('Failed to create account');
            }
          }}>
            <Form.Item name="name" label="Account Name" rules={[{ required: true }]}> <Input/> </Form.Item>
            <Form.Item name="type" label="Account Type" rules={[{ required: true }]}>
              <Select>
                <Option value="Bank">Bank</Option>
                <Option value="Cash">Cash</Option>
                <Option value="Other">Other</Option>
              </Select>
            </Form.Item>
            <Form.Item name="number" label="Account Number"> <Input/> </Form.Item>
          </Form>
        </Modal>

        <Card style={{ flex: 2 }}>
          <h3>Recent Deposits</h3>
          <Table 
            columns={columns} 
            dataSource={deposits}
            rowKey="id"
          />
        </Card>
      </div>
    </div>
  );
};

export default MakeDeposits;