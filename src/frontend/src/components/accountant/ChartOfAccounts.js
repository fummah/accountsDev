import React, { useState, useEffect } from 'react';
import { Table, Button, Form, Input, Modal, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';

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
      const accounts = await window.electronAPI.getChartOfAccounts();
      setAccounts(accounts);
    } catch (error) {
      message.error('Failed to load chart of accounts');
    }
  };

  const handleAddEdit = async (values) => {
    try {
      if (editingId) {
        await window.electronAPI.updateAccount({ ...values, id: editingId });
        message.success('Account updated successfully');
      } else {
        await window.electronAPI.createAccount(values);
        message.success('Account created successfully');
      }
      setIsModalVisible(false);
      form.resetFields();
      loadAccounts();
    } catch (error) {
      message.error('Operation failed');
    }
  };

  const columns = [
    {
      title: 'Account Code',
      dataIndex: 'accountCode',
      key: 'accountCode',
    },
    {
      title: 'Account Name',
      dataIndex: 'accountName',
      key: 'accountName',
    },
    {
      title: 'Type',
      dataIndex: 'accountType',
      key: 'accountType',
    },
    {
      title: 'Balance',
      dataIndex: 'balance',
      key: 'balance',
      render: (balance) => `$${balance.toFixed(2)}`,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <>
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
        </>
      ),
    },
  ];

  const handleDelete = async (id) => {
    try {
      await window.electronAPI.deleteAccount(id);
      message.success('Account deleted successfully');
      loadAccounts();
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
            label="Account Code"
            rules={[{ required: true, message: 'Please input account code!' }]}
          >
            <Input />
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
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ChartOfAccounts;