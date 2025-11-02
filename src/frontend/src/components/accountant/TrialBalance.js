import React, { useState } from 'react';
import { Card, Table, DatePicker, Select, Button, Alert, Form, Row, Col } from 'antd';

const { RangePicker } = DatePicker;
const { Option } = Select;

const TrialBalance = () => {
  const [loading, setLoading] = useState(false);

  const columns = [
    {
      title: 'Account Code',
      dataIndex: 'accountCode',
      key: 'accountCode',
    },
    {
      title: 'Account Name',
      dataIndex: 'accountName',
      key: 'accountName',
    },
    {
      title: 'Debit',
      dataIndex: 'debit',
      key: 'debit',
      align: 'right',
    },
    {
      title: 'Credit',
      dataIndex: 'credit',
      key: 'credit',
      align: 'right',
    },
  ];

  const data = [
    {
      key: '1',
      accountCode: '1000',
      accountName: 'Cash',
      debit: '10,000.00',
      credit: '0.00',
    },
    {
      key: '2',
      accountCode: '2000',
      accountName: 'Accounts Payable',
      debit: '0.00',
      credit: '5,000.00',
    },
    {
      key: '3',
      accountCode: '4000',
      accountName: 'Sales Revenue',
      debit: '0.00',
      credit: '15,000.00',
    },
  ];

  const onFinish = (values) => {
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
    }, 1000);
  };

  return (
    <Card title="Working Trial Balance">
      <Form onFinish={onFinish} layout="vertical">
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="dateRange"
              label="Date Range"
              rules={[{ required: true, message: 'Please select date range' }]}
            >
              <RangePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="balanceType"
              label="Balance Type"
              rules={[{ required: true, message: 'Please select balance type' }]}
            >
              <Select>
                <Option value="unadjusted">Unadjusted</Option>
                <Option value="adjusted">Adjusted</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label=" " colon={false}>
              <Button type="primary" htmlType="submit" loading={loading}>
                Generate Trial Balance
              </Button>
            </Form.Item>
          </Col>
        </Row>
      </Form>

      <Table
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={false}
        summary={pageData => {
          let totalDebit = 0;
          let totalCredit = 0;

          pageData.forEach(({ debit, credit }) => {
            totalDebit += parseFloat(debit.replace(',', ''));
            totalCredit += parseFloat(credit.replace(',', ''));
          });

          return (
            <>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2}>Total</Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  {totalDebit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  {totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Table.Summary.Cell>
              </Table.Summary.Row>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2}>Difference</Table.Summary.Cell>
                <Table.Summary.Cell index={2} colSpan={2} align="right">
                  {Math.abs(totalDebit - totalCredit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </>
          );
        }}
      />

      <div style={{ marginTop: 16 }}>
        <Button type="primary" style={{ marginRight: 8 }}>Export to Excel</Button>
        <Button>Print</Button>
      </div>
    </Card>
  );
};

export default TrialBalance;