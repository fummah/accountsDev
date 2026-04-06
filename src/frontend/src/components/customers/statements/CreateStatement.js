import React, { useState, useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { Form, Input, Select, Button, Card, DatePicker, message, Row, Col, Statistic, Alert, Space, Result } from 'antd';
import { FileTextOutlined, ReloadOutlined } from '@ant-design/icons';

const { Option } = Select;

const CreateStatement = () => {
  const history = useHistory();
  const [customers, setCustomers] = useState({ all: [], report: {} });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [form] = Form.useForm();

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
    }
  };

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const res = await window.electronAPI.createStatement({
        customerId: values.customerId,
        startDate: values.dateRange[0].format('YYYY-MM-DD'),
        endDate: values.dateRange[1].format('YYYY-MM-DD'),
        notes: values.notes
      });
      const customerName = (customers.all || []).find(c => c.id === values.customerId);
      const displayName = customerName ? (customerName.display_name || customerName.company_name || `${customerName.first_name || ''} ${customerName.last_name || ''}`.trim()) : '';
      setResult({
        success: true,
        statementId: res?.statementId || res?.id || 'N/A',
        customer: displayName,
        period: `${values.dateRange[0].format('DD/MM/YYYY')} – ${values.dateRange[1].format('DD/MM/YYYY')}`,
      });
      message.success('Statement generated successfully');
    } catch (error) {
      message.error('Failed to create statement');
    }
    setLoading(false);
  };

  const resetForm = () => {
    setResult(null);
    form.resetFields();
  };

  return (
    <div style={{ padding: 24 }}>
      <Card title={<span style={{ fontSize: 18, fontWeight: 600 }}><FileTextOutlined style={{ marginRight: 8 }} />Generate Customer Statement</span>}>
        <Row gutter={16} style={{ marginBottom: 16, flexDirection: 'row', flexWrap: 'wrap' }}>
          <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Total Customers" value={(customers.all || []).length} /></Card></Col>
        </Row>

        {result ? (
          <Result
            status="success"
            title="Statement Generated Successfully!"
            subTitle={`Statement #${result.statementId} for ${result.customer} (${result.period})`}
            extra={[
              <Button type="primary" key="new" icon={<ReloadOutlined />} onClick={resetForm}>Generate Another Statement</Button>,
              <Button key="list" onClick={() => { history.push('/main/bank-statements/list'); }}>View All Statements</Button>,
              <Button key="sales" onClick={() => { history.push('/inner/sales'); }}>Back to Sales</Button>,
            ]}
          >
            <Alert type="info" showIcon message="Your statement has been saved. You can view and download it from the Statements list page under Banking → Bank Statements → Statements List." style={{ maxWidth: 500, margin: '0 auto' }} />
          </Result>
        ) : (
          <Form form={form} layout="vertical" onFinish={onFinish} style={{ maxWidth: 600 }}>
            <Form.Item name="customerId" label="Customer" rules={[{ required: true, message: 'Please select a customer' }]}>
              <Select showSearch optionFilterProp="children" placeholder="Select a customer" loading={loading}>
                {Array.isArray(customers.all) && customers.all.map(customer => (
                  <Option key={customer.id} value={customer.id}>
                    {customer.display_name || customer.company_name || customer.first_name + ' ' + customer.last_name}
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item name="dateRange" label="Statement Period" rules={[{ required: true, message: 'Please select a date range' }]}>
              <DatePicker.RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>

            <Form.Item name="notes" label="Notes">
              <Input.TextArea rows={3} placeholder="Optional notes for the statement..." />
            </Form.Item>

            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={loading} icon={<FileTextOutlined />}>Generate Statement</Button>
                <Button onClick={() => { history.push('/main/bank-statements/list'); }}>View Existing Statements</Button>
              </Space>
            </Form.Item>
          </Form>
        )}
      </Card>
    </div>
  );
};

export default CreateStatement;
