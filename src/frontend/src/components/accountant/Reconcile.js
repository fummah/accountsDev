import React, { useState } from 'react';
import { Card, Form, Select, DatePicker, Button, Table, Row, Col, Alert } from 'antd';

const { Option } = Select;

const Reconcile = () => {
  const [form] = Form.useForm();
  const [reconcilingData, setReconcilingData] = useState(null);
  const [reconciled, setReconciled] = useState(false);

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
      title: 'Reference',
      dataIndex: 'reference',
      key: 'reference',
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (text, record) => (
        <Select 
          defaultValue={text} 
          style={{ width: 120 }}
          onChange={(value) => handleStatusChange(record.key, value)}
        >
          <Option value="unreconciled">Unreconciled</Option>
          <Option value="reconciled">Reconciled</Option>
          <Option value="pending">Pending</Option>
        </Select>
      ),
    },
  ];

  const data = [
    {
      key: '1',
      date: '2025-11-01',
      description: 'Customer Payment',
      reference: 'PAY-001',
      amount: '1,500.00',
      status: 'unreconciled',
    },
    {
      key: '2',
      date: '2025-11-01',
      description: 'Vendor Payment',
      reference: 'BIL-001',
      amount: '-500.00',
      status: 'unreconciled',
    },
  ];

  const onFinish = (values) => {
    console.log('Form values:', values);
    setReconcilingData(data);
  };

  const handleStatusChange = (key, value) => {
    console.log('Status changed for row:', key, 'New value:', value);
  };

  const handleReconcile = () => {
    setReconciled(true);
    setTimeout(() => {
      setReconciled(false);
      setReconcilingData(null);
      form.resetFields();
    }, 3000);
  };

  return (
    <Card title="Account Reconciliation">
      {reconciled && (
        <Alert
          message="Account reconciled successfully"
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
      >
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="account"
              label="Select Account"
              rules={[{ required: true, message: 'Please select an account' }]}
            >
              <Select>
                <Option value="bank">Bank Account</Option>
                <Option value="cash">Cash Account</Option>
                <Option value="creditCard">Credit Card</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="statementDate"
              label="Statement Date"
              rules={[{ required: true, message: 'Please select statement date' }]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="endingBalance"
              label="Statement Ending Balance"
              rules={[{ required: true, message: 'Please enter ending balance' }]}
            >
              <Select>
                <Option value="current">Current Balance ($5,000.00)</Option>
                <Option value="previous">Previous Balance ($4,500.00)</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Form.Item>
          <Button type="primary" htmlType="submit">
            Begin Reconciliation
          </Button>
        </Form.Item>
      </Form>

      {reconcilingData && (
        <>
          <Table
            columns={columns}
            dataSource={reconcilingData}
            pagination={false}
            style={{ marginBottom: 16 }}
          />
          <Row justify="space-between" style={{ marginTop: 16 }}>
            <Col>
              <Button onClick={() => setReconcilingData(null)}>Cancel</Button>
            </Col>
            <Col>
              <Button type="primary" onClick={handleReconcile}>
                Complete Reconciliation
              </Button>
            </Col>
          </Row>
        </>
      )}
    </Card>
  );
};

export default Reconcile;