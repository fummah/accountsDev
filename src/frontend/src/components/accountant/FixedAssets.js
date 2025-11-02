import React, { useState, useEffect } from 'react';
import { Table, Button, Form, Input, Modal, message, DatePicker } from 'antd';
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
      const assets = await window.electronAPI.getFixedAssets();
      setAssets(assets);
    } catch (error) {
      message.error('Failed to load fixed assets');
    }
  };

  const handleAddEdit = async (values) => {
    try {
      const formattedValues = {
        ...values,
        purchaseDate: values.purchaseDate.format('YYYY-MM-DD'),
      };

      if (editingId) {
        await window.electronAPI.updateFixedAsset({ ...formattedValues, id: editingId });
        message.success('Asset updated successfully');
      } else {
        await window.electronAPI.createFixedAsset(formattedValues);
        message.success('Asset created successfully');
      }
      setIsModalVisible(false);
      form.resetFields();
      loadAssets();
    } catch (error) {
      message.error('Operation failed');
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
      render: (cost) => `$${cost.toFixed(2)}`,
    },
    {
      title: 'Depreciation Method',
      dataIndex: 'depreciationMethod',
      key: 'depreciationMethod',
    },
    {
      title: 'Current Value',
      dataIndex: 'currentValue',
      key: 'currentValue',
      render: (value) => `$${value.toFixed(2)}`,
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
            rules={[{ required: true, message: 'Please input depreciation method!' }]}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default FixedAssets;