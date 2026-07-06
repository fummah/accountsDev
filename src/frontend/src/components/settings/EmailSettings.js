import React, { useState, useEffect } from 'react';
import { Card, Form, Input, InputNumber, Switch, Button, Space, message, Typography, Divider, Alert } from 'antd';
import { MailOutlined, SaveOutlined, ApiOutlined, ThunderboltOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;
const { TextArea } = Input;

const EmailSettings = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      const cfg = await window.electronAPI.emailSettingsGet?.();
      if (cfg && !cfg.error) {
        form.setFieldsValue(cfg);
      }
    } catch {}
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const vals = await form.validateFields();
      const res = await window.electronAPI.emailSettingsSet(vals);
      if (res?.success) message.success('Email settings saved');
      else message.error(res?.error || 'Failed to save settings');
    } catch (e) {
      message.error('Please fill in all required fields');
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      // Save first
      const vals = await form.validateFields();
      await window.electronAPI.emailSettingsSet(vals);
      const res = await window.electronAPI.emailTestConnection();
      setTestResult(res);
      if (res?.success) message.success('SMTP connection successful!');
      else message.error(res?.error || 'Connection failed');
    } catch (e) {
      setTestResult({ success: false, error: e.message || 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <Title level={3} style={{ marginBottom: 4 }}><MailOutlined style={{ marginRight: 8 }} />Email Settings</Title>
      <Text type="secondary">Configure SMTP to send invoices and quotes directly from the application.</Text>

      <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
        <Card title="SMTP Server Configuration" size="small" style={{ marginBottom: 16 }}>
          <Form.Item name="host" label="SMTP Host" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="smtp.gmail.com" />
          </Form.Item>
          <Space size={16} style={{ width: '100%' }}>
            <Form.Item name="port" label="Port" style={{ width: 120 }}>
              <InputNumber min={1} max={65535} placeholder="587" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="secure" label="SSL/TLS" valuePropName="checked">
              <Switch checkedChildren="SSL" unCheckedChildren="STARTTLS" />
            </Form.Item>
          </Space>
          <Form.Item name="user" label="Username / Email" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="you@company.com" />
          </Form.Item>
          <Form.Item name="pass" label="Password / App Password" rules={[{ required: true, message: 'Required' }]}>
            <Input.Password placeholder="App password or SMTP password" />
          </Form.Item>
        </Card>

        <Card title="Sender Details" size="small" style={{ marginBottom: 16 }}>
          <Form.Item name="from_name" label="From Name">
            <Input placeholder="My Company" />
          </Form.Item>
          <Form.Item name="from_email" label="From Email">
            <Input placeholder="billing@company.com (defaults to username)" />
          </Form.Item>
        </Card>

        <Card title="Default Email Template" size="small" style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            Use placeholders: {'{company}'}, {'{number}'}, {'{amount}'}, {'{customer}'}, {'{due_date}'}
          </Text>
          <Form.Item name="default_subject" label="Default Subject">
            <Input placeholder="Invoice from {company}" />
          </Form.Item>
          <Form.Item name="default_body" label="Default Body">
            <TextArea rows={5} placeholder="Please find attached invoice #{number} for {amount}." />
          </Form.Item>
        </Card>

        <Space>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={loading}>
            Save Settings
          </Button>
          <Button icon={<ThunderboltOutlined />} onClick={handleTest} loading={testing}>
            Test Connection
          </Button>
        </Space>

        {testResult && (
          <Alert
            style={{ marginTop: 16 }}
            type={testResult.success ? 'success' : 'error'}
            message={testResult.success ? 'Connection Successful' : 'Connection Failed'}
            description={testResult.success ? 'SMTP server responded correctly.' : testResult.error}
            showIcon
          />
        )}
      </Form>

      <Divider />
      <Alert
        type="info"
        showIcon
        icon={<ApiOutlined />}
        message="Common SMTP Providers"
        description={
          <div style={{ fontSize: 12 }}>
            <p><strong>Gmail:</strong> smtp.gmail.com, Port 587, Use App Password</p>
            <p><strong>Outlook/365:</strong> smtp.office365.com, Port 587</p>
            <p><strong>Yahoo:</strong> smtp.mail.yahoo.com, Port 465 (SSL)</p>
            <p><strong>Custom:</strong> Check with your hosting provider</p>
          </div>
        }
      />
    </div>
  );
};

export default EmailSettings;
