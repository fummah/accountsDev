import React from 'react';
import { Card, Table, Button } from 'antd';

const CreditCardCharges = () => {
  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
    },
    {
      title: 'Card',
      dataIndex: 'card',
      key: 'card',
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
  ];

  const data = [
    {
      key: '1',
      date: '2025-11-01',
      card: '**** 1234',
      description: 'Travel Expenses',
      amount: '$350.00',
    },
  ];

  return (
    <Card title="Credit Card Charges">
      <div style={{ marginBottom: 16 }}>
        <Button type="primary">Add Charge</Button>
      </div>
      <Table columns={columns} dataSource={data} />
    </Card>
  );
};

export default CreditCardCharges;