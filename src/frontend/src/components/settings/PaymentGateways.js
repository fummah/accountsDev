import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Select, Button, Space, Typography, message, Divider, Alert } from 'antd';

const { Title, Text } = Typography;

const PaymentGateways = () => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const cfg = await window.electronAPI.payConfigGet();
    form.setFieldsValue({
      provider: cfg.provider || 'demo',
      // legacy fields (kept for compatibility)
      stripeKey: cfg.stripeKey,
      paypalClientId: cfg.paypalClientId,
      flutterwaveKey: cfg.flutterwaveKey,
      // new providers
      authorizeNet_apiLoginId: cfg.authorizeNet?.apiLoginId,
      authorizeNet_transactionKey: cfg.authorizeNet?.transactionKey,
      authorizeNet_environment: cfg.authorizeNet?.environment || 'sandbox',
      tesla_apiLoginId: cfg.tesla?.apiLoginId,
      tesla_transactionKey: cfg.tesla?.transactionKey,
      tesla_environment: cfg.tesla?.environment || 'sandbox',
    });
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      setSaving(true);
      const v = await form.validateFields();
      const payload = {
        provider: v.provider,
      };
      // Map new providers
      if (v.authorizeNet_apiLoginId || v.authorizeNet_transactionKey) {
        payload.authorizeNet = {
          apiLoginId: v.authorizeNet_apiLoginId || '',
          transactionKey: v.authorizeNet_transactionKey || '',
          environment: v.authorizeNet_environment || 'sandbox',
        };
      }
      if (v.tesla_apiLoginId || v.tesla_transactionKey) {
        payload.tesla = {
          apiLoginId: v.tesla_apiLoginId || '',
          transactionKey: v.tesla_transactionKey || '',
          environment: v.tesla_environment || 'sandbox',
        };
      }
      // Preserve legacy keys if present (no-op in current backend)
      if (v.stripeKey) payload.stripeKey = v.stripeKey;
      if (v.paypalClientId) payload.paypalClientId = v.paypalClientId;
      if (v.flutterwaveKey) payload.flutterwaveKey = v.flutterwaveKey;

      await window.electronAPI.payConfigSet(payload);
      message.success('Gateway settings saved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Title level={4}>Payment Gateways</Title>
        <Text type="secondary">Choose a provider. Tesla Payments uses an Authorize.Net-compatible hosted checkout.</Text>
        <Form form={form} layout="vertical" style={{ maxWidth: 720 }}>
          <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
            <Select options={[
              { value: 'demo', label: 'Demo (no external processing)' },
              { value: 'authorizeNet', label: 'Authorize.Net' },
              { value: 'tesla', label: 'Tesla Payments (Authorize.Net compatible)' },
            ]} />
          </Form.Item>

          <Divider>Authorize.Net</Divider>
          <Alert type="info" showIcon message="Use sandbox for testing. Production requires live credentials." style={{ marginBottom: 16 }} />
          <Form.Item name="authorizeNet_apiLoginId" label="API Login ID">
            <Input placeholder="Authorize.Net API Login ID" />
          </Form.Item>
          <Form.Item name="authorizeNet_transactionKey" label="Transaction Key">
            <Input.Password placeholder="Authorize.Net Transaction Key" />
          </Form.Item>
          <Form.Item name="authorizeNet_environment" label="Environment" initialValue="sandbox">
            <Select options={[
              { value: 'sandbox', label: 'Sandbox' },
              { value: 'production', label: 'Production' },
            ]} />
          </Form.Item>

          <Divider>Tesla Payments</Divider>
          <Alert type="info" showIcon message="Tesla Payments via Authorize.Net-compatible API v2." style={{ marginBottom: 16 }} />
          <Form.Item name="tesla_apiLoginId" label="API Login ID">
            <Input placeholder="Tesla (Authorize.Net) API Login ID" />
          </Form.Item>
          <Form.Item name="tesla_transactionKey" label="Transaction Key">
            <Input.Password placeholder="Tesla (Authorize.Net) Transaction Key" />
          </Form.Item>
          <Form.Item name="tesla_environment" label="Environment" initialValue="sandbox">
            <Select options={[
              { value: 'sandbox', label: 'Sandbox' },
              { value: 'production', label: 'Production' },
            ]} />
          </Form.Item>

          <Divider>Legacy (optional)</Divider>
          <Form.Item name="stripeKey" label="Stripe Secret Key">
            <Input.Password placeholder="sk_live_..." />
          </Form.Item>
          <Form.Item name="paypalClientId" label="PayPal Client ID">
            <Input placeholder="PayPal Client ID" />
          </Form.Item>
          <Form.Item name="flutterwaveKey" label="Flutterwave Secret Key">
            <Input.Password placeholder="FLWSECK-..." />
          </Form.Item>

          <Button type="primary" onClick={save} loading={saving}>Save</Button>
        </Form>
      </Space>
    </Card>
  );
};

export default PaymentGateways;


