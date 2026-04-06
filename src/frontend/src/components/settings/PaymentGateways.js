import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Select, Button, Space, Typography, message, Divider, Alert, Tabs, Row, Col, Tag, Statistic } from 'antd';
import { SaveOutlined, ApiOutlined, CheckCircleOutlined, CloseCircleOutlined, CreditCardOutlined, ReloadOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { TabPane } = Tabs;
const { Option } = Select;

const PaymentGateways = () => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activeProvider, setActiveProvider] = useState('demo');
  const [testStatus, setTestStatus] = useState(null);
  const [activeTab, setActiveTab] = useState('authorizeNet');

  const load = async () => {
    try {
      const cfg = await window.electronAPI.payConfigGet();
      const provider = cfg.provider || 'demo';
      setActiveProvider(provider);
      form.setFieldsValue({
        provider,
        stripeKey: cfg.stripeKey,
        paypalClientId: cfg.paypalClientId,
        flutterwaveKey: cfg.flutterwaveKey,
        authorizeNet_apiLoginId: cfg.authorizeNet?.apiLoginId,
        authorizeNet_transactionKey: cfg.authorizeNet?.transactionKey,
        authorizeNet_environment: cfg.authorizeNet?.environment || 'sandbox',
        tesla_apiLoginId: cfg.tesla?.apiLoginId,
        tesla_transactionKey: cfg.tesla?.transactionKey,
        tesla_environment: cfg.tesla?.environment || 'sandbox',
      });
    } catch (_) {}
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      setSaving(true);
      const v = await form.validateFields();
      const payload = { provider: v.provider };
      if (v.authorizeNet_apiLoginId || v.authorizeNet_transactionKey) {
        payload.authorizeNet = { apiLoginId: v.authorizeNet_apiLoginId || '', transactionKey: v.authorizeNet_transactionKey || '', environment: v.authorizeNet_environment || 'sandbox' };
      }
      if (v.tesla_apiLoginId || v.tesla_transactionKey) {
        payload.tesla = { apiLoginId: v.tesla_apiLoginId || '', transactionKey: v.tesla_transactionKey || '', environment: v.tesla_environment || 'sandbox' };
      }
      if (v.stripeKey) payload.stripeKey = v.stripeKey;
      if (v.paypalClientId) payload.paypalClientId = v.paypalClientId;
      if (v.flutterwaveKey) payload.flutterwaveKey = v.flutterwaveKey;
      await window.electronAPI.payConfigSet(payload);
      setActiveProvider(v.provider);
      message.success('Gateway settings saved');
    } catch (e) {
      if (!e?.errorFields) message.error('Save failed');
    } finally { setSaving(false); }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestStatus(null);
    try {
      const v = form.getFieldsValue();
      if (v.provider === 'demo') {
        setTestStatus({ success: true, msg: 'Demo provider is always available' });
        message.success('Demo provider connection OK');
      } else {
        const res = await window.electronAPI.payTestConnection?.();
        if (res?.success) {
          setTestStatus({ success: true, msg: res.message || 'Connection successful' });
          message.success('Gateway connection test passed');
        } else {
          setTestStatus({ success: false, msg: res?.error || 'Connection failed' });
          message.error(res?.error || 'Gateway connection test failed');
        }
      }
    } catch (e) {
      setTestStatus({ success: false, msg: e?.message || 'Connection failed' });
      message.error('Connection test error');
    } finally { setTesting(false); }
  };

  const providerLabel = { demo: 'Demo', authorizeNet: 'Authorize.Net', tesla: 'Tesla Payments' };

  return (
    <div style={{ padding: 24 }}>
      <Card title={<span style={{ fontSize: 18, fontWeight: 600 }}><CreditCardOutlined style={{ marginRight: 8 }} />Payment Gateways</span>}
        extra={<Space><Button icon={<ReloadOutlined />} onClick={load}>Reload</Button><Button type="primary" icon={<SaveOutlined />} onClick={save} loading={saving}>Save Settings</Button></Space>}>

        <Row gutter={16} style={{ marginBottom: 20, flexDirection: 'row', flexWrap: 'wrap' }}>
          <Col span={8}>
            <Card size="small" style={{ textAlign: 'center' }}>
              <Statistic title="Active Provider" value={providerLabel[activeProvider] || activeProvider} prefix={<ApiOutlined />} />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: 4, color: '#888', fontSize: 12 }}>Connection Status</div>
              {testStatus === null ? <Tag>Not tested</Tag>
                : testStatus.success ? <Tag icon={<CheckCircleOutlined />} color="success">Connected</Tag>
                : <Tag icon={<CloseCircleOutlined />} color="error">Failed</Tag>}
              {testStatus?.msg && <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{testStatus.msg}</div>}
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" style={{ textAlign: 'center' }}>
              <Button type="primary" icon={<ApiOutlined />} loading={testing} onClick={testConnection} style={{ marginTop: 8 }}>
                Test Connection
              </Button>
            </Card>
          </Col>
        </Row>

        <Form form={form} layout="vertical" style={{ maxWidth: 800 }}>
          <Form.Item name="provider" label="Active Payment Provider" rules={[{ required: true }]}>
            <Select size="large" onChange={v => setActiveProvider(v)}>
              <Option value="demo">Demo (no external processing)</Option>
              <Option value="authorizeNet">Authorize.Net</Option>
              <Option value="tesla">Tesla Payments (Authorize.Net compatible)</Option>
            </Select>
          </Form.Item>
        </Form>

        <Tabs activeKey={activeTab} onChange={k => setActiveTab(k)} animated={false} style={{ maxWidth: 800 }}>
          <TabPane tab="Authorize.Net" key="authorizeNet">
            <Alert type="info" showIcon message="Use sandbox for testing. Production requires live credentials from your Authorize.Net merchant account." style={{ marginBottom: 16 }} />
            <Form form={form} layout="vertical">
              <Row gutter={16} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <Col span={12}><Form.Item name="authorizeNet_apiLoginId" label="API Login ID"><Input placeholder="Authorize.Net API Login ID" /></Form.Item></Col>
                <Col span={12}><Form.Item name="authorizeNet_transactionKey" label="Transaction Key"><Input.Password placeholder="Authorize.Net Transaction Key" /></Form.Item></Col>
              </Row>
              <Form.Item name="authorizeNet_environment" label="Environment" initialValue="sandbox">
                <Select><Option value="sandbox">Sandbox (Testing)</Option><Option value="production">Production (Live)</Option></Select>
              </Form.Item>
            </Form>
          </TabPane>

          <TabPane tab="Tesla Payments" key="tesla">
            <Alert type="info" showIcon message="Tesla Payments uses Authorize.Net-compatible API v2 for hosted checkout." style={{ marginBottom: 16 }} />
            <Form form={form} layout="vertical">
              <Row gutter={16} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <Col span={12}><Form.Item name="tesla_apiLoginId" label="API Login ID"><Input placeholder="Tesla API Login ID" /></Form.Item></Col>
                <Col span={12}><Form.Item name="tesla_transactionKey" label="Transaction Key"><Input.Password placeholder="Tesla Transaction Key" /></Form.Item></Col>
              </Row>
              <Form.Item name="tesla_environment" label="Environment" initialValue="sandbox">
                <Select><Option value="sandbox">Sandbox (Testing)</Option><Option value="production">Production (Live)</Option></Select>
              </Form.Item>
            </Form>
          </TabPane>

          <TabPane tab="Legacy Providers" key="legacy">
            <Alert type="warning" showIcon message="Legacy provider keys are stored for backward compatibility. Use Authorize.Net or Tesla for new integrations." style={{ marginBottom: 16 }} />
            <Form form={form} layout="vertical">
              <Form.Item name="stripeKey" label="Stripe Secret Key"><Input.Password placeholder="sk_live_..." /></Form.Item>
              <Form.Item name="paypalClientId" label="PayPal Client ID"><Input placeholder="PayPal Client ID" /></Form.Item>
              <Form.Item name="flutterwaveKey" label="Flutterwave Secret Key"><Input.Password placeholder="FLWSECK-..." /></Form.Item>
            </Form>
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default PaymentGateways;


