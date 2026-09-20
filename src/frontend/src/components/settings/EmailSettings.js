import React, { useState, useEffect } from 'react';
import { Card, Form, Input, InputNumber, Switch, Button, Space, message, Typography, Divider, Alert, Select, Tag, Spin, Radio } from 'antd';
import { MailOutlined, SaveOutlined, ApiOutlined, ThunderboltOutlined, CloseCircleOutlined, CheckCircleOutlined, DesktopOutlined, CloudOutlined } from '@ant-design/icons';
import GoogleOutlined from '@ant-design/icons/lib/icons/GoogleOutlined';

const { Text, Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;

// Provider presets — populate host/port/security correctly so a Gmail user can
// never end up on "port 587 + SSL", which is a common cause of TLS failures.
const PROVIDER_PRESETS = {
  gmail: { label: 'Gmail', host: 'smtp.gmail.com', port: 465, secure: true, hint: 'Gmail requires a Google App Password (Google Account → Security → 2-Step Verification → App passwords). Your normal account password will be rejected.' },
  outlook: { label: 'Microsoft 365 / Outlook', host: 'smtp.office365.com', port: 587, secure: false, hint: 'Use an app password if the account has multi-factor authentication enabled.' },
  yahoo: { label: 'Yahoo', host: 'smtp.mail.yahoo.com', port: 465, secure: true, hint: 'Yahoo requires an app password generated in Account Security.' },
  custom: { label: 'Custom SMTP', host: '', port: 587, secure: false, hint: '' },
};

const providerForHost = (host) => {
  const h = String(host || '').toLowerCase();
  if (h.includes('gmail')) return 'gmail';
  if (h.includes('office365') || h.includes('outlook')) return 'outlook';
  if (h.includes('yahoo')) return 'yahoo';
  return 'custom';
};

const EmailSettings = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [oauthSigningIn, setOauthSigningIn] = useState(false);
  const [oauthStatus, setOauthStatus] = useState(null);
  const [emailLogs, setEmailLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [hasPass, setHasPass] = useState(false);
  const [passEncrypted, setPassEncrypted] = useState(false);
  const [providerKey, setProviderKey] = useState('custom');
  const [clientInfo, setClientInfo] = useState(null);

  useEffect(() => { loadSettings(); loadLogs(); loadClientInfo(); }, []);

  const loadClientInfo = async () => {
    try {
      const info = await window.electronAPI.emailMailClientInfo?.();
      setClientInfo(info || null);
    } catch { setClientInfo(null); }
  };

  const loadLogs = async () => {
    try { setLogsLoading(true); const logs = await window.electronAPI.emailLogList?.(); if (Array.isArray(logs)) setEmailLogs(logs); } catch {} finally { setLogsLoading(false); }
  };

  const loadSettings = async () => {
    try {
      const cfg = await window.electronAPI.emailSettingsGet?.();
      if (cfg && !cfg.error) {
        form.setFieldsValue(cfg);
        setHasPass(!!cfg.pass_set);
        setPassEncrypted(!!cfg.pass_encrypted);
        setProviderKey(providerForHost(cfg.host));
        if (cfg.oauth_connected) {
          const status = await window.electronAPI.emailOAuthStatus?.(cfg.oauth_provider);
          setOauthStatus(status);
        }
      }
    } catch {}
  };

  const applyProvider = (key) => {
    setProviderKey(key);
    const p = PROVIDER_PRESETS[key];
    if (!p) return;
    form.setFieldsValue({ host: p.host, port: p.port, secure: p.secure });
  };

  const payloadFromForm = (vals) => {
    const payload = { ...vals };
    // Never send an empty password: the backend treats that as "keep the saved
    // one". A new value is only sent when the user actually typed it.
    if (!payload.pass) delete payload.pass;
    return payload;
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const vals = await form.validateFields();
      const res = await window.electronAPI.emailSettingsSet(payloadFromForm(vals));
      if (res?.success) {
        message.success('Email settings saved');
        if (vals.pass) { setHasPass(true); form.setFieldsValue({ pass: '' }); }
      } else {
        message.error(res?.error || 'Failed to save settings');
      }
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
      await window.electronAPI.emailSettingsSet(payloadFromForm(vals));
      if (vals.pass) { setHasPass(true); form.setFieldsValue({ pass: '' }); }
      const res = await window.electronAPI.emailTestConnection();
      setTestResult(res);
      if (res?.success) message.success('SMTP connection successful.');
      else message.error(res?.error || 'Connection failed');
    } catch (e) {
      setTestResult({ success: false, error: e.message || 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleClearPass = async () => {
    try {
      await window.electronAPI.emailSettingsSet({ clear_pass: true });
      setHasPass(false);
      form.setFieldsValue({ pass: '' });
      message.success('Saved password removed');
    } catch { message.error('Could not remove the saved password'); }
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
      await window.electronAPI.emailSettingsSet(payloadFromForm(vals));
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

  const preset = PROVIDER_PRESETS[providerKey] || PROVIDER_PRESETS.custom;

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <Title level={3} style={{ marginBottom: 4 }}><MailOutlined style={{ marginRight: 8 }} />Email Settings</Title>
      <Text type="secondary">Choose how AccuLedger sends Quotes and Invoices, and configure the built-in SMTP account.</Text>

      <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
        {/* ── Email delivery method ─────────────────────────────────────── */}
        <Card title="Email Delivery" size="small" style={{ marginBottom: 16 }}>
          <Form.Item name="email_send_method" label="Default sending method">
            <Radio.Group>
              <Space direction="vertical">
                <Radio value="external"><DesktopOutlined /> Default Email Program</Radio>
                <Radio value="builtin"><CloudOutlined /> Built-in Email (SMTP)</Radio>
                <Radio value="prompt">Ask me each time</Radio>
              </Space>
            </Radio.Group>
          </Form.Item>
          <Text type="secondary" style={{ display: 'block' }}>
            <b>Default Email Program</b> opens a draft in your desktop mail client — you review and press Send there.
            <br />
            <b>Built-in Email (SMTP)</b> sends the message and the PDF directly from AccuLedger.
            <br />
            AccuLedger never switches between the two on its own; if a method cannot complete, you are told and asked what to do.
          </Text>

          <div style={{ marginTop: 12, padding: '8px 12px', background: '#fafafa', borderRadius: 6 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Detected default email program</Text>
            <div style={{ fontSize: 13 }}>
              {!clientInfo
                ? 'Checking…'
                : (clientInfo.adapter && clientInfo.adapter.kind === 'outlook') ? 'Microsoft Outlook'
                  : (clientInfo.adapter && clientInfo.adapter.kind === 'thunderbird') ? 'Mozilla Thunderbird'
                    : (clientInfo.defaultClientName || clientInfo.progId || 'Windows default mail application')}
              {clientInfo ? (
                <Tag style={{ marginLeft: 8 }} color={clientInfo.canAttach && clientInfo.clientReady ? 'green' : 'default'}>
                  {clientInfo.canAttach && clientInfo.clientReady ? 'attachments supported' : 'attachments not supported automatically'}
                </Tag>
              ) : null}
            </div>
          </div>
        </Card>

        {/* ── Built-in SMTP ─────────────────────────────────────────────── */}
        <Card title="Built-in SMTP Settings" size="small" style={{ marginBottom: 16 }}>
          <Form.Item label="Provider preset">
            <Select value={providerKey} onChange={applyProvider} style={{ maxWidth: 320 }}>
              <Option value="gmail">Gmail</Option>
              <Option value="outlook">Microsoft 365 / Outlook</Option>
              <Option value="yahoo">Yahoo</Option>
              <Option value="custom">Custom SMTP</Option>
            </Select>
          </Form.Item>
          {preset.hint ? <Alert type="info" showIcon style={{ marginBottom: 12 }} message={preset.hint} /> : null}

          <Form.Item name="host" label="SMTP Host" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="smtp.gmail.com" onChange={e => setProviderKey(providerForHost(e.target.value))} />
          </Form.Item>
          <Space size={16} style={{ width: '100%' }}>
            <Form.Item name="port" label="Port" style={{ width: 120 }}>
              <InputNumber min={1} max={65535} placeholder="587" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="secure" label="SSL/TLS" valuePropName="checked">
              <Switch checkedChildren="SSL (465)" unCheckedChildren="STARTTLS (587)" />
            </Form.Item>
          </Space>
          <Form.Item name="user" label="Username / Email" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="you@company.com" />
          </Form.Item>
          <Form.Item
            name="pass"
            label="Password / App Password"
            extra={hasPass
              ? `A password is saved${passEncrypted ? ' (encrypted with the OS keystore)' : ''}. Leave blank to keep it, or type a new one to replace it.`
              : 'Not set. For Gmail, use a Google App Password.'}
          >
            <Input.Password placeholder={hasPass ? '•••••••• (saved)' : 'App password or SMTP password'} autoComplete="new-password" />
          </Form.Item>
          {hasPass ? (
            <Button size="small" danger onClick={handleClearPass} style={{ marginTop: -8 }}>Remove saved password</Button>
          ) : null}
        </Card>

        {/* ── Sender details ────────────────────────────────────────────── */}
        <Card title="Sender Details" size="small" style={{ marginBottom: 16 }}>
          <Form.Item name="from_name" label="From Name">
            <Input placeholder="My Company" />
          </Form.Item>
          <Form.Item
            name="from_email"
            label="From Email"
            extra="For Gmail, this must be the authenticated address or an approved alias."
          >
            <Input placeholder="billing@company.com (defaults to username)" />
          </Form.Item>
        </Card>

        {/* ── OAuth ─────────────────────────────────────────────────────── */}
        <Card title="OAuth Authentication (optional — Gmail / Microsoft 365)" size="small" style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            OAuth2 is an alternative to an App Password. Configure app credentials below.
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

        {/* ── Templates ─────────────────────────────────────────────────── */}
        <Card title="Email Templates" size="small" style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            Placeholders: {'{company}'}, {'{customer}'}, {'{number}'}, {'{amount}'}, {'{balance}'}, {'{due_date}'}, {'{phone}'}, {'{email}'}.
            Leave a field blank to use the approved default wording.
          </Text>

          <Divider orientation="left" style={{ fontSize: 12, margin: '8px 0' }}>Quote</Divider>
          <Form.Item name="quote_subject" label="Quote Subject">
            <Input placeholder="Quote from {company}" />
          </Form.Item>
          <Form.Item name="quote_body" label="Quote Body">
            <TextArea rows={4} placeholder={'Dear {customer},\n\nThank you for the opportunity to provide you with a quote...'} />
          </Form.Item>

          <Divider orientation="left" style={{ fontSize: 12, margin: '8px 0' }}>Invoice — Fully Paid</Divider>
          <Form.Item name="invoice_paid_subject" label="Paid Invoice Subject">
            <Input placeholder="Paid Invoice #{number} – {company}" />
          </Form.Item>
          <Form.Item name="invoice_paid_body" label="Paid Invoice Body">
            <TextArea rows={4} placeholder={'Dear {customer},\n\nThank you for your payment. Please find your paid invoice attached for your records...'} />
          </Form.Item>

          <Divider orientation="left" style={{ fontSize: 12, margin: '8px 0' }}>Invoice — Outstanding / Partially Paid</Divider>
          <Form.Item name="invoice_outstanding_subject" label="Outstanding Invoice Subject">
            <Input placeholder="Invoice #{number} – {company}" />
          </Form.Item>
          <Form.Item name="invoice_outstanding_body" label="Outstanding Invoice Body">
            <TextArea rows={4} placeholder={'Dear {customer},\n\nThe current balance due is {balance}, with a due date of {due_date}...'} />
          </Form.Item>

          <Alert
            type="info"
            showIcon
            style={{ marginTop: 8 }}
            message="Invoice emails are chosen automatically: paid invoices use the Paid template, everything with an outstanding balance uses the Outstanding template. Quotes use the Quote template."
          />
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
            message={testResult.success ? 'SMTP connection successful.' : 'Connection failed'}
            description={testResult.success ? 'The mail server accepted the credentials.' : testResult.error}
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
                  <td style={{ padding: '4px 8px' }}>
                    {log.status === 'success' ? <Tag color="success">Sent</Tag>
                      : log.status === 'opened' ? <Tag color="blue" title={log.error_message || ''}>Draft opened</Tag>
                        : <Tag color="error" title={log.error_message}>Failed</Tag>}
                  </td>
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
            <p><strong>Gmail:</strong> smtp.gmail.com, Port 465 (SSL) — App Password required</p>
            <p><strong>Outlook/365:</strong> smtp.office365.com, Port 587 (STARTTLS)</p>
            <p><strong>Yahoo:</strong> smtp.mail.yahoo.com, Port 465 (SSL)</p>
            <p><strong>Custom:</strong> Check with your hosting provider</p>
          </div>
        }
      />
    </div>
  );
};

export default EmailSettings;
