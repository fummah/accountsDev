import React, { useState, useEffect } from 'react';
import { Form, Select, Input, InputNumber, DatePicker, Button, Card, Table, message, Space } from 'antd';
import { PlusOutlined, SaveOutlined, DeleteOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Option } = Select;

const Deposits = () => {
  const [form] = Form.useForm();
  const [accounts, setAccounts] = useState([]);
  const [items, setItems] = useState([]);
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

  const handleSubmit = async (values) => {
    if (items.length === 0) {
      message.error('Please add at least one item to deposit');
      return;
    }

    try {
      setLoading(true);
      const depositData = {
        ...values,
        date: values.date.format('YYYY-MM-DD'),
        items,
        total: items.reduce((sum, item) => sum + (item.amount || 0), 0),
        createdAt: moment().format('YYYY-MM-DD HH:mm:ss'),
      };

      await window.electronAPI.createDeposit(depositData);
      message.success('Deposit recorded successfully');
      form.resetFields();
      setItems([]);
    } catch (error) {
      message.error('Failed to record deposit');
    } finally {
      setLoading(false);
    }
  };

  const addItem = () => {
    const newItem = {
      id: Date.now(),
      type: '',
      reference: '',
      description: '',
      amount: 0,
    };
    setItems([...items, newItem]);
  };

  const updateItem = (id, field, value) => {
    setItems(prev => 
      prev.map(item => 
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const removeItem = (id) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const columns = [
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (_, record) => (
        <Select
          style={{ width: '100%' }}
          value={record.type}
          onChange={(value) => updateItem(record.id, 'type', value)}
        >
          <Option value="check">Check</Option>
          <Option value="cash">Cash</Option>
          <Option value="card">Card Payment</Option>
          <Option value="wire">Wire Transfer</Option>
        </Select>
      ),
    },
    {
      title: 'Reference',
      dataIndex: 'reference',
      key: 'reference',
      render: (_, record) => (
        <Input
          value={record.reference}
          onChange={(e) => updateItem(record.id, 'reference', e.target.value)}
          placeholder="Check/Reference #"
        />
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (_, record) => (
        <Input
          value={record.description}
          onChange={(e) => updateItem(record.id, 'description', e.target.value)}
          placeholder="Enter description"
        />
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (_, record) => (
        <InputNumber
          style={{ width: '100%' }}
          value={record.amount}
          onChange={(value) => updateItem(record.id, 'amount', value)}
          formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          parser={value => value.replace(/\$\s?|(,*)/g, '')}
          precision={2}
        />
      ),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeItem(record.id)}
        />
      ),
    },
  ];

  const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);

  return (
    <div style={{ padding: '24px' }}>
      <h2>Make Deposits</h2>

      <Card style={{ marginBottom: '24px' }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            date: moment(),
          }}
        >
          <div style={{ display: 'flex', gap: '16px' }}>
            <Form.Item
              name="accountId"
              label="Deposit To"
              rules={[{ required: true, message: 'Please select account' }]}
              style={{ flex: 1 }}
            >
              <Select placeholder="Select account">
                {accounts.map(account => (
                  <Option key={account.id} value={account.id}>
                    {account.accountName}
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="date"
              label="Date"
              rules={[{ required: true, message: 'Please select date' }]}
            >
              <DatePicker />
            </Form.Item>
          </div>

          <Button
            type="dashed"
            onClick={addItem}
            style={{ width: '100%', marginBottom: '16px' }}
            icon={<PlusOutlined />}
          >
            Add Item
          </Button>

          <Table
            columns={columns}
            dataSource={items}
            rowKey="id"
            pagination={false}
            summary={() => (
              <Table.Summary>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={3}>Total</Table.Summary.Cell>
                  <Table.Summary.Cell index={3}>
                    <strong>${total.toFixed(2)}</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} />
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />

          <div style={{ marginTop: '24px', textAlign: 'right' }}>
            <Space>
              <Button onClick={() => form.resetFields()}>
                Reset
              </Button>
              <Button 
                type="primary"
                icon={<SaveOutlined />}
                htmlType="submit"
                loading={loading}
                disabled={items.length === 0}
              >
                Save Deposit
              </Button>
            </Space>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default Deposits;