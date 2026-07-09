import React, { useState, useEffect } from 'react';
import { Card, Form, Input, InputNumber, Switch, Button, Space, message, Typography, Divider, Alert, Select, Tag, Spin } from 'antd';
import { MailOutlined, SaveOutlined, ApiOutlined, ThunderboltOutlined, CloseCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import GoogleOutlined from '@ant-design/icons/lib/icons/GoogleOutlined';

const { Text, Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const EmailSettings = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [oauthSigningIn, setOauthSigningIn] = useState(false);
  const [oauthStatus, setOauthStatus] = useState(null);
  const [emailLogs, setEmailLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => { loadSettings(); loadLogs(); }, []);

  const loadLogs = async () => {
    try { setLogsLoading(true); const logs = await window.electronAPI.emailLogList?.(); if (Array.isArray(logs)) setEmailLogs(logs); } catch {} finally { setLogsLoading(false); }
  };

  const loadSettings = async () => {
    try {
      const cfg = await window.electronAPI.emailSettingsGet?.();
      if (cfg && !cfg.error) {
        form.setFieldsValue(cfg);
        if (cfg.oauth_connected) {
          const status = await window.electronAPI.emailOAuthStatus?.(cfg.oauth_provider);
          setOauthStatus(status);
        }
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

  const handleOAuthSignIn = async () => {
    try {
      setOauthSigningIn(true);
      const vals = form.getFieldsValue();
      const provider = vals.oauth_provider;
      if (!provider) { message.warning('Select an OAuth provider first'); setOauthSigningIn(false); return; }
      const clientId = vals.oauth_client_id;
      const clientSecret = vals.oauth_client_secret;
      if (!clientId || !clientSecret) { message.warning('Enter Client ID and Client Secret'); setOauthSigningIn(false); return; }
      await window.electronAPI.emailSettingsSet(vals);
      const res = await window.electronAPI.emailOAuthStart({ provider, clientId, clientSecret, tenantId: vals.oauth_tenant_id });
      if (res?.success) {
        message.success(`Connected to ${provider}!`);
        const status = await window.electronAPI.emailOAuthStatus?.(provider);
        setOauthStatus(status);
      } else {
        message.error(res?.error || 'OAuth sign-in failed');
      }
    } catch (e) {
      message.error('OAuth sign-in failed');
    } finally {
      setOauthSigningIn(false);
    }
  };

  const handleOAuthRevoke = async () => {
    try {
      const provider = form.getFieldValue('oauth_provider');
      await window.electronAPI.emailOAuthRevoke(provider);
      setOauthStatus(null);
      message.success('OAuth connection revoked');
    } catch (e) {
      message.error('Failed to revoke');
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <Title level={3} style={{ marginBottom: 4 }}><MailOutlined style={{ marginRight: 8 }} />Email Settings</Title>
      <Text type="secondary">Configure SMTP or OAuth to send invoices and quotes directly from the application.</Text>

      <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
        <Card title="OAuth Authentication (Gmail / Microsoft 365)" size="small" style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            For providers that require OAuth (Gmail, Microsoft 365), set up your app credentials below.
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>Google Cloud Console</a>
            <span style={{ margin: '0 4px' }}>|</span>
            <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps" target="_blank" rel="noreferrer">Azure Portal</a>
          </Text>
          <Space size={16} style={{ width: '100%' }} align="start">
            <Form.Item name="oauth_provider" label="Provider" style={{ width: 200 }}>
              <Select placeholder="None (use SMTP)" allowClear>
                <Option value=""><em>None (use SMTP)</em></Option>
                <Option value="google"><GoogleOutlined /> Google</Option>
                <Option value="microsoft">Microsoft 365</Option>
              </Select>
            </Form.Item>
            {oauthStatus?.connected && (
              <Tag color="success" icon={<CheckCircleOutlined />} style={{ marginTop: 4 }}>
                Connected{oauthStatus.email ? ` as ${oauthStatus.email}` : ''}{oauthStatus.expired ? ' (token expired)' : ''}
              </Tag>
            )}
          </Space>
          <Form.Item name="oauth_client_id" label="Client ID">
            <Input placeholder="OAuth client ID from provider console" />
          </Form.Item>
          <Form.Item name="oauth_client_secret" label="Client Secret">
            <Input.Password placeholder="OAuth client secret" />
          </Form.Item>
          <Form.Item name="oauth_tenant_id" label="Tenant ID (Microsoft only)">
            <Input placeholder="common or your tenant ID" />
          </Form.Item>
          {!oauthStatus?.connected ? (
            <Button type="primary" icon={<GoogleOutlined />} onClick={handleOAuthSignIn} loading={oauthSigningIn}
              disabled={!form.getFieldValue('oauth_provider')}>
              Sign in with {form.getFieldValue('oauth_provider') === 'google' ? 'Google' : form.getFieldValue('oauth_provider') === 'microsoft' ? 'Microsoft' : 'Provider'}
            </Button>
          ) : (
            <Button icon={<CloseCircleOutlined />} onClick={handleOAuthRevoke} danger>
              Revoke OAuth Connection
            </Button>
          )}
        </Card>

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
          <Form.Item name="pass" label="Password / App Password">
            <Input.Password placeholder="App password or SMTP password (not needed if using OAuth above)" />
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

        <Card title="Send Method" size="small" style={{ marginBottom: 16 }}>
          <Form.Item name="email_send_method" label="Default send method">
            <Select>
              <Option value="prompt">Ask me each time</Option>
              <Option value="builtin">Built-in email (SMTP / OAuth)</Option>
              <Option value="external">Default email program (Outlook / Thunderbird)</Option>
            </Select>
          </Form.Item>
          <Text type="secondary" style={{ display: 'block' }}>When using your default email program, the PDF is generated and your email client opens with the message pre-filled. No SMTP configuration required.</Text>
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
            Test SMTP Connection
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

      <Card title="Email Send Log" size="small" style={{ marginTop: 16 }}>
        {logsLoading ? <Spin /> : emailLogs.length === 0 ? <Text type="secondary">No emails sent yet.</Text> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ borderBottom: '1px solid #eee' }}>
              <th style={{ padding: '4px 8px', textAlign: 'left' }}>Date</th>
              <th style={{ padding: '4px 8px', textAlign: 'left' }}>Recipient</th>
              <th style={{ padding: '4px 8px', textAlign: 'left' }}>Subject</th>
              <th style={{ padding: '4px 8px', textAlign: 'left' }}>Status</th>
            </tr></thead>
            <tbody>
              {emailLogs.slice(0, 20).map((log, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '4px 8px' }}>{log.date || log.created_at}</td>
                  <td style={{ padding: '4px 8px' }}>{log.recipient}</td>
                  <td style={{ padding: '4px 8px' }}>{log.subject || '-'}</td>
                  <td style={{ padding: '4px 8px' }}>{log.status === 'success' ? <Tag color="success">Sent</Tag> : <Tag color="error" title={log.error_message}>Failed</Tag>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Divider />
      <Alert
        type="info"
        showIcon
        icon={<ApiOutlined />}
        message="Common SMTP Providers"
        description={
          <div style={{ fontSize: 12 }}>
            <p><strong>Gmail:</strong> smtp.gmail.com, Port 587, App Password or OAuth</p>
            <p><strong>Outlook/365:</strong> smtp.office365.com, Port 587, App Password or OAuth</p>
            <p><strong>Yahoo:</strong> smtp.mail.yahoo.com, Port 465 (SSL)</p>
            <p><strong>Custom:</strong> Check with your hosting provider</p>
          </div>
        }
      />
    </div>
  );
};

export default EmailSettings;
