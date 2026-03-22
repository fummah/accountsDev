import React, { useState, useEffect } from 'react';
import { Table, Button, Form, Input, Modal, message, Select, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';

const { Option } = Select;

const ChartOfAccounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const response = await window.electronAPI.getChartOfAccounts();
      if (!response || response.error) {
        message.error(response?.error || 'Failed to load chart of accounts');
        return;
      }
      const formattedAccounts = Array.isArray(response) ? response.map(account => ({
        ...account,
        accountCode: account.accountCode || account.accountNumber || account.number
      })) : [];
      setAccounts(formattedAccounts);
    } catch (error) {
      console.error('Load accounts error:', error);
      message.error('Failed to load chart of accounts');
    }
  };

  const handleAddEdit = async (values) => {
    try {
      let response;
      if (editingId) {
        response = await window.electronAPI.updateChartAccount({ 
          id: editingId,
          accountName: values.accountName,
          accountType: values.accountType,
          accountNumber: values.accountCode
        });
      } else {
        response = await window.electronAPI.insertChartAccount(
          values.accountName,
          values.accountType, 
          values.accountCode,
          'system'
        );
      }
      
      if (!response.success) {
        message.error(response.message || 'Operation failed');
        return;
      }

      message.success(response.message || (editingId ? 'Account updated successfully' : 'Account created successfully'));
      setIsModalVisible(false);
      form.resetFields();
      loadAccounts();
    } catch (error) {
      message.error('Operation failed: ' + (error.message || 'Unknown error'));
    }
  };

  const columns = [
    {
      title: 'Account Number',
      dataIndex: 'accountCode',
      key: 'accountNumber',
      render: (text, record) => record.accountNumber || record.accountCode || record.number || '-'
    },
    {
      title: 'Account Name',
      dataIndex: 'accountName',
      key: 'accountName',
      render: (text) => text || '-'
    },
    {
      title: 'Type',
      dataIndex: 'accountType',
      key: 'accountType',
      render: (text) => text || '-'
    },
    {
      title: 'Balance',
      dataIndex: 'balance',
      key: 'balance',
      render: (balance) => typeof balance === 'number' ? `$${balance.toFixed(2)}` : '$0.00',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button 
            icon={<EditOutlined />} 
            onClick={() => {
              setEditingId(record.id);
              form.setFieldsValue(record);
              setIsModalVisible(true);
            }}
          />
          <Button 
            icon={<DeleteOutlined />} 
            danger 
            onClick={() => handleDelete(record.id)}
          />
        </Space>
      ),
    },
  ];

  const handleDelete = async (id) => {
    try {
      Modal.confirm({
        title: 'Delete Account',
        content: 'Are you sure you want to delete this account? This action cannot be undone.',
        okText: 'Yes',
        okType: 'danger',
        cancelText: 'No',
        onOk: async () => {
          try {
            const response = await window.electronAPI.deleteChartAccount(id);
            if (!response.success) {
              message.error(response.message || 'Failed to delete account');
              return;
            }
            message.success(response.message || 'Account deleted successfully');
            loadAccounts();
          } catch (error) {
            message.error(error.message || 'Failed to delete account');
          }
        }
      });
    } catch (error) {
      message.error('Failed to delete account');
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
        <h2>Chart of Accounts</h2>
        <Button 
          type="primary" 
          icon={<PlusOutlined />}
          onClick={() => {
            setEditingId(null);
            form.resetFields();
            setIsModalVisible(true);
          }}
        >
          Add Account
        </Button>
      </div>

      <Table 
        columns={columns} 
        dataSource={accounts}
        rowKey="id"
      />

      <Modal
        title={editingId ? 'Edit Account' : 'Add Account'}
        open={isModalVisible}
        onOk={() => form.submit()}
        onCancel={() => {
          setIsModalVisible(false);
          form.resetFields();
        }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleAddEdit}
        >
          <Form.Item
            name="accountCode"
            label="Account Number"
          >
            <Input placeholder="Optional" />
          </Form.Item>
          <Form.Item
            name="accountName"
            label="Account Name"
            rules={[{ required: true, message: 'Please input account name!' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="accountType"
            label="Account Type"
            rules={[{ required: true, message: 'Please select account type!' }]}
          >
            <Select placeholder="Select account type">
              <Option value="Asset">Asset</Option>
              <Option value="Liability">Liability</Option>
              <Option value="Equity">Equity</Option>
              <Option value="Income">Income</Option>
              <Option value="Expense">Expense</Option>
              <Option value="Bank">Bank</Option>
              <Option value="Cash">Cash</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ChartOfAccounts;