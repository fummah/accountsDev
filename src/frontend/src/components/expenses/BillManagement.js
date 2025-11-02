import React from 'react';
import { Card, Table, Button, Space } from 'antd';

const BillManagement = () => {
  // Sample data - replace with actual data from your backend
  const columns = [
    {
      title: 'Bill Number',
      dataIndex: 'billNumber',
      key: 'billNumber',
    },
    {
      title: 'Vendor',
      dataIndex: 'vendor',
      key: 'vendor',
    },
    {
      title: 'Due Date',
      dataIndex: 'dueDate',
      key: 'dueDate',
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, record) => (
        <Space size="middle">
          <Button type="primary">View</Button>
          <Button>Edit</Button>
        </Space>
      ),
    },
  ];

  const data = [
    {
      key: '1',
      billNumber: 'BILL-001',
      vendor: 'Supplier A',
      dueDate: '2025-11-15',
      amount: '$1,200.00',
      status: 'Pending',
    },
    // Add more sample data as needed
  ];

  return (
    <Card title="Bill Management">
      <div style={{ marginBottom: 16 }}>
        <Button type="primary">Create New Bill</Button>
      </div>
      <Table columns={columns} dataSource={data} />
    </Card>
  );
};

export default BillManagement;