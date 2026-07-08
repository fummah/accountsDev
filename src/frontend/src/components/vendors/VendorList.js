import React, { useEffect, useState } from 'react';
import { Card, Table, message } from 'antd';
import { formatPhone } from '../../utils/phone';

const VendorList = () => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadVendors(); }, []);

  const loadVendors = async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getAllSuppliers();
      const list = Array.isArray(data) ? data : (data && data.data) ? data.data : [];
      setVendors(list);
    } catch (err) {
      console.error('Failed to load vendors', err);
      message.error('Failed to load vendors');
      setVendors([]);
    } finally { setLoading(false); }
  };

  const columns = [
    { title: 'Name', dataIndex: 'display_name', key: 'display_name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Phone', dataIndex: 'phone_number', key: 'phone_number', render: v => formatPhone(v) || '-' },
  ];

  return (
    <Card title="Vendors">
      <Table dataSource={vendors} columns={columns} rowKey={r => r.id} loading={loading} />
    </Card>
  );
};

export default VendorList;
