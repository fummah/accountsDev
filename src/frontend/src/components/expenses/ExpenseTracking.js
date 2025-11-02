import React from 'react';
import { Card, Table, Button } from 'antd';

const ExpenseTracking = () => {
  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
    },
  ];

  const data = [
    {
      key: '1',
      date: '2025-11-01',
      description: 'Office Supplies',
      category: 'Supplies',
      amount: '$150.00',
    },
  ];

  return (
    <Card title="Expense Tracking">
      <div style={{ marginBottom: 16 }}>
        <Button type="primary">Add Expense</Button>
      </div>
      <Table columns={columns} dataSource={data} />
    </Card>
  );
};

export default ExpenseTracking;