import React, { useState, useEffect } from 'react';
import { Table, Button, Form, Input, Modal, message, DatePicker, Select } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import moment from 'moment';

const FixedAssets = () => {
  const [assets, setAssets] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    loadAssets();
  }, []);

  const loadAssets = async () => {
    try {
      const response = await window.electronAPI.getFixedAssets();
      if (response && response.success && Array.isArray(response.data)) {
        setAssets(response.data);
      } else {
        message.error(response && response.error ? response.error : 'Failed to load fixed assets');
        setAssets([]);
      }
    } catch (error) {
      console.error('Failed to load fixed assets:', error);
      message.error('Failed to load fixed assets');
      setAssets([]);
    }
  };

  const handleAddEdit = async (values) => {
    try {
      const asset = {
        assetName: values.assetName,
        purchaseDate: values.purchaseDate.format('YYYY-MM-DD'),
        purchaseCost: Number(values.purchaseCost) || 0,
        currentValue: Number(values.purchaseCost) || 0,
        depreciationMethod: values.depreciationMethod,
        status: 'Active',
        entered_by: 'system',
        date_entered: new Date().toISOString()
      };
      let result;
      if (editingId) {
        result = await window.electronAPI.updateFixedAsset({ ...asset, id: editingId });
      } else {
        result = await window.electronAPI.insertFixedAsset(asset);
      }
      if (result && result.success) {
        message.success(editingId ? 'Asset updated successfully' : 'Asset created successfully');
        setIsModalVisible(false);
        form.resetFields();
        loadAssets();
      } else {
        message.error(result && result.error ? result.error : 'Operation failed');
      }
    } catch (error) {
      console.error('Operation failed:', error);
      message.error(error.message || 'Operation failed');
    }
  };

  const columns = [
    {
      title: 'Asset Name',
      dataIndex: 'assetName',
      key: 'assetName',
    },
    {
      title: 'Purchase Date',
      dataIndex: 'purchaseDate',
      key: 'purchaseDate',
      render: (date) => moment(date).format('DD/MM/YYYY'),
    },
    {
      title: 'Purchase Cost',
      dataIndex: 'purchaseCost',
      key: 'purchaseCost',
      render: (cost) => `$${(Number(cost) || 0).toFixed(2)}`,
    },
    {
      title: 'Depreciation Method',
      dataIndex: 'depreciationMethod',
      key: 'depreciationMethod',
      render: (method) => {
        const methods = {
          'straight-line': 'Straight Line',
          'reducing-balance': 'Reducing Balance',
          'sum-of-years': 'Sum of Years Digits',
          'units-of-production': 'Units of Production',
          'double-declining': 'Double Declining Balance'
        };
        return methods[method] || method;
      }
    },
    {
      title: 'Current Value',
      dataIndex: 'currentValue',
      key: 'currentValue',
      render: (value) => `$${(Number(value) || 0).toFixed(2)}`,
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
              form.setFieldsValue({
                ...record,
                purchaseDate: moment(record.purchaseDate),
              });
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
      await window.electronAPI.deleteFixedAsset(id);
      message.success('Asset deleted successfully');
      loadAssets();
    } catch (error) {
      message.error('Failed to delete asset');
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
        <h2>Fixed Assets</h2>
        <Button 
          type="primary" 
          icon={<PlusOutlined />}
          onClick={() => {
            setEditingId(null);
            form.resetFields();
            setIsModalVisible(true);
          }}
        >
          Add Asset
        </Button>
      </div>

      <Table 
        columns={columns} 
        dataSource={assets}
        rowKey="id"
      />

      <Modal
        title={editingId ? 'Edit Asset' : 'Add Asset'}
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
            name="assetName"
            label="Asset Name"
            rules={[{ required: true, message: 'Please input asset name!' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="purchaseDate"
            label="Purchase Date"
            rules={[{ required: true, message: 'Please select purchase date!' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="purchaseCost"
            label="Purchase Cost"
            rules={[{ required: true, message: 'Please input purchase cost!' }]}
          >
            <Input type="number" prefix="$" />
          </Form.Item>
          <Form.Item
            name="depreciationMethod"
            label="Depreciation Method"
            rules={[{ required: true, message: 'Please select depreciation method!' }]}
          >
            <Select>
              <Select.Option value="straight-line">Straight Line</Select.Option>
              <Select.Option value="reducing-balance">Reducing Balance</Select.Option>
              <Select.Option value="sum-of-years">Sum of Years Digits</Select.Option>
              <Select.Option value="units-of-production">Units of Production</Select.Option>
              <Select.Option value="double-declining">Double Declining Balance</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default FixedAssets;