import React, { useState, useEffect } from "react";
import { message } from 'antd';
import {
  Table,
  Button,
  Input,
  Modal,
  Form,
  DatePicker,
  InputNumber,
  Space,
  Typography,
} from "antd";
import dayjs from "dayjs";

const { Title } = Typography;


const ManageFixedAssets = () => {
  const [assets, setAssets] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load assets from backend
  const loadAssets = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await window.electronAPI.getFixedAssets();
      if (Array.isArray(data)) {
        setAssets(data.map((a, idx) => ({
          key: a.id || idx,
          name: a.name,
          category: a.category,
          purchaseDate: a.purchase_date || '',
          purchasePrice: a.value || 0,
          // For demo, salvageValue/usefulLife/annualDepreciation are not in backend, so set to 0 or blank
          salvageValue: a.salvage_value || 0,
          usefulLife: a.useful_life || 0,
          annualDepreciation: a.annual_depreciation || '',
        })));
      } else {
        setAssets([]);
      }
    } catch (e) {
      setError('Failed to load assets');
      setAssets([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAssets();
  }, []);

  const showModal = () => setIsModalVisible(true);
  const handleCancel = () => setIsModalVisible(false);

  const handleAddAsset = async (values) => {
    // Calculate depreciation locally for display
    const depreciation = ((values.purchasePrice - (values.salvageValue || 0)) / (values.usefulLife || 1)).toFixed(2);
    try {
      const res = await window.electronAPI.insertFixedAsset(values.name, values.category, values.purchasePrice, 'system');
      if (res && res.success) {
        message.success('Asset added');
      } else {
        message.error('Failed to add asset');
      }
      await loadAssets();
    } catch (e) {
      setError('Failed to add asset');
      message.error('Failed to add asset');
    }
    form.resetFields();
    setIsModalVisible(false);
  };

  const columns = [
    { title: "Asset Name", dataIndex: "name" },
    { title: "Category", dataIndex: "category" },
    { title: "Purchase Date", dataIndex: "purchaseDate" },
    { title: "Purchase Price", dataIndex: "purchasePrice" },
    { title: "Salvage Value", dataIndex: "salvageValue" },
    { title: "Useful Life (years)", dataIndex: "usefulLife" },
    { title: "Annual Depreciation", dataIndex: "annualDepreciation" },
  ];

  return (
    <div style={{ padding: 20 }}>
      <Title level={3}>Manage Fixed Assets</Title>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={showModal}>
          Add Asset
        </Button>
      </Space>
      {error && <div style={{ color: 'red', margin: 8 }}>{error}</div>}
      <Table columns={columns} dataSource={assets} pagination={{ pageSize: 5 }} loading={loading} />
      <Modal
        title="Add New Asset"
        open={isModalVisible}
        onCancel={handleCancel}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleAddAsset}
          initialValues={{ purchaseDate: dayjs() }}
        >
          <Form.Item
            name="name"
            label="Asset Name"
            rules={[{ required: true, message: "Please enter asset name" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="category"
            label="Category"
            rules={[{ required: true, message: "Please enter category" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="purchaseDate"
            label="Purchase Date"
            rules={[{ required: false }]}
          >
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="purchasePrice"
            label="Purchase Price"
            rules={[{ required: true }]}
          >
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item>
          <Form.Item
            name="salvageValue"
            label="Salvage Value"
            rules={[{ required: false }]}
          >
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item>
          <Form.Item
            name="usefulLife"
            label="Useful Life (in years)"
            rules={[{ required: false }]}
          >
            <InputNumber style={{ width: "100%" }} min={1} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              Save Asset
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ManageFixedAssets;
