import React, { useState } from 'react';
import { Card, Form, Input, Button, Alert, Table } from 'antd';

const VoidTransaction = () => {
  const [form] = Form.useForm();
  const [searchResult, setSearchResult] = useState(null);
  const [voided, setVoided] = useState(false);

  const onSearch = (values) => {
    // Simulate searching for a transaction
    setSearchResult({
      transactionId: values.transactionId,
      date: '2025-11-01',
      amount: '1,000.00',
      type: 'Invoice',
      description: 'Sales Invoice #INV-001',
    });
  };

  const handleVoid = () => {
    setVoided(true);
    setTimeout(() => {
      setVoided(false);
      setSearchResult(null);
      form.resetFields();
    }, 3000);
  };

  const columns = [
    {
      title: 'Transaction ID',
      dataIndex: 'transactionId',
      key: 'transactionId',
    },
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
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
  ];

  return (
    <Card title="Void Transaction">
      {voided && (
        <Alert
          message="Transaction voided successfully"
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      
      <Form
        form={form}
        layout="vertical"
        onFinish={onSearch}
        style={{ marginBottom: 24 }}
      >
        <Form.Item
          name="transactionId"
          label="Transaction ID"
          rules={[{ required: true, message: 'Please enter transaction ID' }]}
        >
          <Input placeholder="Enter transaction ID" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit">
            Search Transaction
          </Button>
        </Form.Item>
      </Form>

      {searchResult && (
        <>
          <Table
            columns={columns}
            dataSource={[searchResult]}
            pagination={false}
            style={{ marginBottom: 16 }}
          />
          <Button type="primary" danger onClick={handleVoid}>
            Void Transaction
          </Button>
        </>
      )}
    </Card>
  );
};

export default VoidTransaction;