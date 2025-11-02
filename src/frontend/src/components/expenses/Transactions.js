import React from 'react';
import { Card, Table, Button } from 'antd';

const Transactions = () => {
  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
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
  ];

  const data = [
    {
      key: '1',
      date: '2025-11-01',
      type: 'Expense',
      description: 'Monthly Utilities',
      amount: '$450.00',
      status: 'Complete',
    },
  ];

  return (
    <Card title="Expense Transactions">
      <div style={{ marginBottom: 16 }}>
        <Button type="primary">New Transaction</Button>
      </div>
      <Table columns={columns} dataSource={data} />
    </Card>
  );
};

export default Transactions;