import React, { useEffect, useState } from 'react';
import { Card, Descriptions, message, Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';

const VendorDetails = ({ match }) => {
  const [vendor, setVendor] = useState(null);

  useEffect(() => {
    const id = match?.params?.id;
    if (id) loadVendor(id);
  }, [match]);

  const loadVendor = async (id) => {
    try {
      const res = await window.electronAPI.getSingleSupplier(id);
      setVendor(res || null);
    } catch (err) {
      console.error('Failed to load vendor', err);
      message.error('Failed to load vendor');
    }
  };

  if (!vendor) return <Card title="Vendor Details" extra={<Button icon={<ArrowLeftOutlined />} onClick={() => window.history.back()}>Back</Button>}>Loading...</Card>;

  return (
    <Card title={`Vendor: ${vendor.display_name || vendor.first_name}`} extra={<Button icon={<ArrowLeftOutlined />} onClick={() => window.history.back()}>Back</Button>}>
      <Descriptions column={1} bordered>
        <Descriptions.Item label="Name">{vendor.display_name || `${vendor.first_name} ${vendor.last_name}`}</Descriptions.Item>
        <Descriptions.Item label="Email">{vendor.email}</Descriptions.Item>
        <Descriptions.Item label="Phone">{vendor.phone_number}</Descriptions.Item>
        <Descriptions.Item label="Opening Balance">{vendor.opening_balance}</Descriptions.Item>
        <Descriptions.Item label="Due Amount">{vendor.due_amount ? vendor.due_amount.due_amount : '0.00'}</Descriptions.Item>
      </Descriptions>
    </Card>
  );
};

export default VendorDetails;
