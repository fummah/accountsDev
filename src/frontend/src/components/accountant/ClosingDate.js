import React, { useState } from 'react';
import { Card, DatePicker, Button, Alert, Form } from 'antd';
import moment from 'moment';

const ClosingDate = () => {
  const [form] = Form.useForm();
  const [saved, setSaved] = useState(false);

  const onFinish = (values) => {
    console.log('Selected Date:', values.closingDate.format('YYYY-MM-DD'));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <Card title="Set Closing Date">
      {saved && (
        <Alert
          message="Closing date saved successfully"
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      <Form form={form} onFinish={onFinish} layout="vertical">
        <Form.Item
          name="closingDate"
          label="Select Closing Date"
          rules={[{ required: true, message: 'Please select a closing date' }]}
        >
          <DatePicker 
            style={{ width: '100%' }}
            disabledDate={(current) => current && current > moment().endOf('day')}
          />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit">
            Save Closing Date
          </Button>
        </Form.Item>
      </Form>
      <div style={{ marginTop: 16 }}>
        <p><strong>Note:</strong></p>
        <ul>
          <li>Transactions dated before the closing date cannot be modified</li>
          <li>All accounts should be reconciled before setting a closing date</li>
          <li>Make sure all required reports have been generated</li>
        </ul>
      </div>
    </Card>
  );
};

export default ClosingDate;