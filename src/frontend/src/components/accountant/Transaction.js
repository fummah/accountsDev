import React, { useState, useEffect } from 'react';
import { Form, Input, Select, DatePicker, Button, Table, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Option } = Select;

const Transaction = () => {
  const [form] = Form.useForm();
  const [accounts, setAccounts] = useState([]);
  const [entities, setEntities] = useState([]);
  const [classes, setClasses] = useState([]);
  const [locations, setLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAccounts();
    loadTransactions();
    loadEntities();
    loadDimensions();
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

  const loadEntities = async () => {
    try {
      const list = await (window.electronAPI.listEntities ? window.electronAPI.listEntities() : []);
      setEntities(Array.isArray(list) ? list : []);
    } catch (error) {
      // silent
    }
  };

  const loadDimensions = async () => {
    try {
      const [cls, locs, deps] = await Promise.all([
        window.electronAPI.listClasses ? window.electronAPI.listClasses() : [],
        window.electronAPI.listLocations ? window.electronAPI.listLocations() : [],
        window.electronAPI.listDepartments ? window.electronAPI.listDepartments() : []
      ]);
      setClasses(Array.isArray(cls) ? cls : []);
      setLocations(Array.isArray(locs) ? locs : []);
      setDepartments(Array.isArray(deps) ? deps : []);
    } catch {}
  };

  const handleSubmit = async (values) => {
    try {
      console.log('Submitting transaction:', values);
      setLoading(true);
      const formattedValues = {
        ...values,
        date: values.date.format('YYYY-MM-DD'),
        entity_id: values.entity_id || null,
        class: values.class || null,
        location: values.location || null,
        department: values.department || null
      };

      await window.electronAPI.insertTransaction(formattedValues);
      message.success('Transaction saved successfully');
      form.resetFields();
      loadTransactions();
    } catch (error) {
      console.error('Failed to save transaction', error);
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
          name="entity_id"
          label="Entity"
        >
          <Select placeholder="Select entity (optional)">
            {entities.map(e => (
              <Option key={e.id} value={e.id}>{e.name}</Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item name="class" label="Class">
          <Select allowClear placeholder="Select class">
            {classes.map(c => (
              <Option key={c.id} value={c.name}>{c.name}</Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item name="location" label="Location">
          <Select allowClear placeholder="Select location">
            {locations.map(l => (
              <Option key={l.id} value={l.name}>{l.name}</Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item name="department" label="Department">
          <Select allowClear placeholder="Select department">
            {departments.map(d => (
              <Option key={d.id} value={d.name}>{d.name}</Option>
            ))}
          </Select>
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