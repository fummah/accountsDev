import React, { useState, useEffect } from 'react';
import { Form, Input, Select, Button, Card, DatePicker, message } from 'antd';
import { useHistory } from 'react-router-dom';

const { Option } = Select;

const CreateStatement = () => {
  const [customers, setCustomers] = useState({ all: [], report: {} });
  const [loading, setLoading] = useState(false);
  const history = useHistory();

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const customersData = await window.electronAPI.getAllCustomers();
      if (customersData && Array.isArray(customersData.all)) {
        setCustomers(customersData);
      } else if (Array.isArray(customersData)) {
        setCustomers({ all: customersData, report: {} });
      } else {
        setCustomers({ all: [], report: {} });
      }
    } catch (error) {
      message.error('Failed to load customers');
      console.error('Error fetching customers:', error);
    }
  };

  const onFinish = async (values) => {
    setLoading(true);
    try {
      await window.electronAPI.createStatement({
        customerId: values.customerId,
        startDate: values.dateRange[0].format('YYYY-MM-DD'),
        endDate: values.dateRange[1].format('YYYY-MM-DD'),
        notes: values.notes
      });
      message.success('Statement created successfully');
      history.push('/inner/sales?tab=1');
    } catch (error) {
      message.error('Failed to create statement');
      console.error('Error creating statement:', error);
    }
    setLoading(false);
  };

  return (
    <Card title="Create Statement">
      <Form
        layout="vertical"
        onFinish={onFinish}
      >
        <Form.Item
          name="customerId"
          label="Customer"
          rules={[{ required: true, message: 'Please select a customer' }]}
        >
          <Select
            placeholder="Select a customer"
            loading={loading}
          >
            {Array.isArray(customers.all) && customers.all.map(customer => (
              <Option key={customer.id} value={customer.id}>
                {customer.display_name || customer.company_name || customer.first_name + ' ' + customer.last_name}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="dateRange"
          label="Statement Period"
          rules={[{ required: true, message: 'Please select a date range' }]}
        >
          <DatePicker.RangePicker style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          name="notes"
          label="Notes"
        >
          <Input.TextArea rows={4} />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            Generate Statement
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default CreateStatement;
