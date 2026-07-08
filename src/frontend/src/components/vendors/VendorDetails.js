import React, { useEffect, useState } from 'react';
import { Card, Descriptions, message, Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useParams, useHistory } from 'react-router-dom';
import { formatPhone } from '../../utils/phone';

const VendorDetails = ({ match }) => {
  const params = useParams();
  const history = useHistory();
  const [vendor, setVendor] = useState(null);

  useEffect(() => {
    const id = params?.id || match?.params?.id;
    if (id) loadVendor(id);
  }, [params?.id, match?.params?.id]);

  const loadVendor = async (id) => {
    try {
      const res = await window.electronAPI.getSingleSupplier(id);
      setVendor(res || null);
    } catch (err) {
      console.error('Failed to load vendor', err);
      message.error('Failed to load vendor');
    }
  };

  if (!vendor) return <Card title="Vendor Details" extra={<Button icon={<ArrowLeftOutlined />} onClick={() => history.goBack()}>Back</Button>}>Loading...</Card>;

  const fullAddr = [vendor.address1, vendor.address2, vendor.city, vendor.state, vendor.postal_code, vendor.country].filter(Boolean).join(', ');

  return (
    <Card title={`Vendor: ${vendor.display_name || vendor.first_name}`} extra={<Button icon={<ArrowLeftOutlined />} onClick={() => history.goBack()}>Back</Button>}>
      <Descriptions column={2} bordered size="small">
        <Descriptions.Item label="Name" span={2}>{vendor.display_name || `${vendor.first_name} ${vendor.last_name}`}</Descriptions.Item>
        <Descriptions.Item label="Company">{vendor.company_name || '-'}</Descriptions.Item>
        <Descriptions.Item label="Email">{vendor.email || '-'}</Descriptions.Item>
        <Descriptions.Item label="Phone">{formatPhone(vendor.phone_number) || '-'}</Descriptions.Item>
        <Descriptions.Item label="Mobile">{formatPhone(vendor.mobile_number) || '-'}</Descriptions.Item>
        <Descriptions.Item label="Fax">{vendor.fax || '-'}</Descriptions.Item>
        <Descriptions.Item label="Address" span={2}>{fullAddr || '-'}</Descriptions.Item>
        <Descriptions.Item label="Opening Balance">{Number(vendor.opening_balance || 0).toFixed(2)}</Descriptions.Item>
        <Descriptions.Item label="Due Amount">{vendor.due_amount ? Number(vendor.due_amount.due_amount).toFixed(2) : '0.00'}</Descriptions.Item>
        <Descriptions.Item label="Notes" span={2}>{vendor.notes || '-'}</Descriptions.Item>
      </Descriptions>
    </Card>
  );
};

export default VendorDetails;
