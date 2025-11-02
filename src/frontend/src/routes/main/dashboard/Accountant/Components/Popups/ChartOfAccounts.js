import React, { useState, useEffect } from 'react';
import { message } from 'antd';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Typography,
  Divider,
  Tag
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';

const { Option } = Select;
const { Title } = Typography;



const ChartOfAccounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load accounts from backend
  const loadAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await window.electronAPI.getChartOfAccounts();
      if (Array.isArray(data)) {
        setAccounts(data.map((a, idx) => ({
          key: a.id || idx,
          name: a.name,
          type: a.type,
          number: a.number,
          balance: a.balance || 0,
          status: a.status || 'Active',
        })));
      } else {
        setAccounts([]);
      }
    } catch (e) {
      setError('Failed to load accounts');
      setAccounts([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const showModal = () => {
    setIsModalVisible(true);
  };

  const handleOk = () => {
    form
      .validateFields()
      .then(async (values) => {
        try {
          const res = await window.electronAPI.insertChartAccount(values.name, values.type, values.number, 'system');
          if (res && res.success) {
            message.success('Account added');
          } else {
            message.error('Failed to add account');
          }
          await loadAccounts();
        } catch (e) {
          setError('Failed to add account');
          message.error('Failed to add account');
        }
        form.resetFields();
        setIsModalVisible(false);
      });
  };

  const handleCancel = () => {
    form.resetFields();
    setIsModalVisible(false);
  };

  const columns = [
    {
      title: 'Account Number',
      dataIndex: 'number',
      key: 'number'
    },
    {
      title: 'Account Name',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: 'Account Type',
      dataIndex: 'type',
      key: 'type'
    },
    {
      title: 'Balance',
      dataIndex: 'balance',
      key: 'balance',
      render: (text) => `$ ${text.toFixed(2)}`
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (text) => (
        <Tag color={text === 'Active' ? 'green' : 'red'}>{text}</Tag>
      )
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>Chart of Accounts</Title>
      <Divider />
      <Button type="primary" icon={<PlusOutlined />} onClick={showModal}>
        Add New Account
      </Button>
      {error && <div style={{ color: 'red', margin: 8 }}>{error}</div>}
      <Table
        columns={columns}
        dataSource={accounts}
        style={{ marginTop: 24 }}
        pagination={{ pageSize: 6 }}
        loading={loading}
      />

      <Modal
        title="Add New Account"
        open={isModalVisible}
        onOk={handleOk}
        onCancel={handleCancel}
        okText="Save"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Account Name"
            rules={[{ required: true, message: 'Please enter the account name' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="type"
            label="Account Type"
            rules={[{ required: true, message: 'Please select the account type' }]}
          >
            <Select placeholder="Select account type">
              <Option value="Asset">Asset</Option>
              <Option value="Liability">Liability</Option>
              <Option value="Equity">Equity</Option>
              <Option value="Income">Income</Option>
              <Option value="Expense">Expense</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="number"
            label="Account Number"
            rules={[{ required: true, message: 'Please enter the account number' }]}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ChartOfAccounts;
