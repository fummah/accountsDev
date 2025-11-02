import React, { useState } from 'react';
import { Card, Form, Switch, Select, InputNumber, Button, Row, Col, message } from 'antd';

const { Option } = Select;

const Preferences = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      // TODO: Implement save preferences to backend
      console.log('Preferences:', values);
      message.success('Preferences saved successfully');
    } catch (error) {
      message.error('Failed to save preferences');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="System Preferences">
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          dateFormat: 'MM/DD/YYYY',
          currency: 'USD',
          decimalPlaces: 2,
          autoSave: true,
          defaultView: 'list',
          itemsPerPage: 25,
          enableNotifications: true,
          backupFrequency: 'daily'
        }}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="dateFormat"
              label="Date Format"
              rules={[{ required: true, message: 'Please select date format' }]}
            >
              <Select>
                <Option value="MM/DD/YYYY">MM/DD/YYYY</Option>
                <Option value="DD/MM/YYYY">DD/MM/YYYY</Option>
                <Option value="YYYY-MM-DD">YYYY-MM-DD</Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="currency"
              label="Default Currency"
              rules={[{ required: true, message: 'Please select currency' }]}
            >
              <Select>
                <Option value="USD">USD ($)</Option>
                <Option value="EUR">EUR (€)</Option>
                <Option value="GBP">GBP (£)</Option>
                <Option value="JPY">JPY (¥)</Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="decimalPlaces"
              label="Decimal Places"
              rules={[{ required: true, message: 'Please input decimal places' }]}
            >
              <InputNumber min={0} max={4} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              name="itemsPerPage"
              label="Items per Page"
              rules={[{ required: true, message: 'Please input items per page' }]}
            >
              <Select>
                <Option value={10}>10</Option>
                <Option value={25}>25</Option>
                <Option value={50}>50</Option>
                <Option value={100}>100</Option>
              </Select>
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              name="defaultView"
              label="Default View"
              rules={[{ required: true, message: 'Please select default view' }]}
            >
              <Select>
                <Option value="list">List</Option>
                <Option value="grid">Grid</Option>
                <Option value="table">Table</Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="backupFrequency"
              label="Backup Frequency"
              rules={[{ required: true, message: 'Please select backup frequency' }]}
            >
              <Select>
                <Option value="hourly">Hourly</Option>
                <Option value="daily">Daily</Option>
                <Option value="weekly">Weekly</Option>
                <Option value="monthly">Monthly</Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="autoSave"
              label="Auto Save"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              name="enableNotifications"
              label="Enable Notifications"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            Save Preferences
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default Preferences;