import React, { useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Space } from 'antd';

const { Option } = Select;

const ManageAssets = () => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();

  const columns = [
    {
      title: 'Asset ID',
      dataIndex: 'assetId',
      key: 'assetId',
      sorter: (a, b) => a.assetId.localeCompare(b.assetId),
    },
    {
      title: 'Asset Name',
      dataIndex: 'assetName',
      key: 'assetName',
      sorter: (a, b) => a.assetName.localeCompare(b.assetName),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      filters: [
        { text: 'Equipment', value: 'Equipment' },
        { text: 'Furniture', value: 'Furniture' },
        { text: 'Vehicles', value: 'Vehicles' },
        { text: 'Buildings', value: 'Buildings' },
      ],
      onFilter: (value, record) => record.category === value,
    },
    {
      title: 'Purchase Date',
      dataIndex: 'purchaseDate',
      key: 'purchaseDate',
      sorter: (a, b) => new Date(a.purchaseDate) - new Date(b.purchaseDate),
    },
    {
      title: 'Initial Value',
      dataIndex: 'initialValue',
      key: 'initialValue',
      align: 'right',
      sorter: (a, b) => a.initialValue - b.initialValue,
    },
    {
      title: 'Current Value',
      dataIndex: 'currentValue',
      key: 'currentValue',
      align: 'right',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      filters: [
        { text: 'Active', value: 'Active' },
        { text: 'Disposed', value: 'Disposed' },
        { text: 'Under Maintenance', value: 'Under Maintenance' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, record) => (
        <Space size="middle">
          <Button size="small">Edit</Button>
          <Button size="small">Details</Button>
          <Button size="small" type="link">Depreciation</Button>
        </Space>
      ),
    },
  ];

  const data = [
    {
      key: '1',
      assetId: 'FA-001',
      assetName: 'Office Computer',
      category: 'Equipment',
      purchaseDate: '2025-01-15',
      initialValue: '2,000.00',
      currentValue: '1,600.00',
      status: 'Active',
    },
    {
      key: '2',
      assetId: 'FA-002',
      assetName: 'Company Vehicle',
      category: 'Vehicles',
      purchaseDate: '2024-11-01',
      initialValue: '35,000.00',
      currentValue: '31,500.00',
      status: 'Active',
    },
  ];

  const handleAddAsset = () => {
    setIsModalVisible(true);
  };

  const handleModalOk = () => {
    form.validateFields().then(values => {
      console.log('New Asset:', values);
      setIsModalVisible(false);
      form.resetFields();
    });
  };

  return (
    <Card title="Manage Fixed Assets">
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button type="primary" onClick={handleAddAsset}>
            Add New Asset
          </Button>
          <Button>Import Assets</Button>
          <Button>Export List</Button>
        </Space>
      </div>

      <Table 
        columns={columns} 
        dataSource={data}
        pagination={{
          total: data.length,
          pageSize: 10,
          showSizeChanger: true,
          showTotal: total => `Total ${total} items`
        }}
      />

      <Modal
        title="Add New Asset"
        visible={isModalVisible}
        onOk={handleModalOk}
        onCancel={() => setIsModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="assetName"
            label="Asset Name"
            rules={[{ required: true, message: 'Please input asset name' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="category"
            label="Category"
            rules={[{ required: true, message: 'Please select category' }]}
          >
            <Select>
              <Option value="Equipment">Equipment</Option>
              <Option value="Furniture">Furniture</Option>
              <Option value="Vehicles">Vehicles</Option>
              <Option value="Buildings">Buildings</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="purchaseDate"
            label="Purchase Date"
            rules={[{ required: true, message: 'Please select purchase date' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="initialValue"
            label="Initial Value"
            rules={[{ required: true, message: 'Please input initial value' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={value => value.replace(/\$\s?|(,*)/g, '')}
            />
          </Form.Item>

          <Form.Item
            name="depreciationMethod"
            label="Depreciation Method"
            rules={[{ required: true, message: 'Please select depreciation method' }]}
          >
            <Select>
              <Option value="straightLine">Straight Line</Option>
              <Option value="reducingBalance">Reducing Balance</Option>
              <Option value="sumOfYears">Sum of Years</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="usefulLife"
            label="Useful Life (Years)"
            rules={[{ required: true, message: 'Please input useful life' }]}
          >
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>

          <Form.Item
            name="notes"
            label="Notes"
          >
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default ManageAssets;