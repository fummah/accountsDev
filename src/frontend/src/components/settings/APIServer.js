import React, { useEffect, useState } from 'react';
import { Card, Form, Switch, Input, InputNumber, Button, Space, Typography, message } from 'antd';

const { Title, Text } = Typography;

const APIServer = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ enabled: false, running: false, port: null, runningPort: null });

  const load = async () => {
    const cfg = await window.electronAPI.settingsGet('api.server');
    form.setFieldsValue({
      enabled: !!(cfg?.enabled),
      port: cfg?.port || 4578,
      apiKey: cfg?.apiKey || '',
    });
    try {
      const st = await window.electronAPI.apiServerStatus?.();
      if (st) setStatus(st);
    } catch {}
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      setLoading(true);
      const v = await form.validateFields();
      await window.electronAPI.settingsSet('api.server', { enabled: !!v.enabled, port: Number(v.port) || 4578, apiKey: v.apiKey || '' });
      message.success('API server settings saved');
      await load();
    } finally {
      setLoading(false);
    }
  };

  const genKey = () => {
    const rnd = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    form.setFieldsValue({ apiKey: rnd });
  };

  const startNow = async () => {
    try {
      setLoading(true);
      const res = await window.electronAPI.apiServerStart?.();
      if (res?.started) { message.success(`Server started on :${res.port}`); }
      else { message.info(res?.reason ? `Not started: ${res.reason}` : 'Unable to start'); }
      await load();
    } finally {
      setLoading(false);
    }
  };
  const stopNow = async () => {
    try {
      setLoading(true);
      const res = await window.electronAPI.apiServerStop?.();
      if (res?.stopped) message.success('Server stopped'); else message.info('Server not running');
      await load();
    } finally {
      setLoading(false);
    }
  };
  const health = async () => {
    try {
      setLoading(true);
      const res = await window.electronAPI.apiServerHealth?.();
      if (res?.ok) message.success(`Health OK (HTTP ${res.status})`);
      else message.error(`Health failed: ${res?.error || res?.status || 'unknown'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Title level={4}>API Server</Title>
        <Form form={form} layout="vertical" style={{ maxWidth: 600 }}>
          <Form.Item name="enabled" label="Enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="port" label="Port" rules={[{ required: true, message: 'Port is required' }]}>
            <InputNumber style={{ width: 200 }} min={1} max={65535} />
          </Form.Item>
          <Form.Item name="apiKey" label="API Key (x-api-key / Bearer)">
            <Space>
              <Input.Password style={{ width: 360 }} placeholder="Leave blank to allow unauthenticated access (not recommended)" />
              <Button onClick={genKey}>Generate</Button>
            </Space>
          </Form.Item>
          <Space>
            <Button type="primary" onClick={save} loading={loading}>Save</Button>
            <Button onClick={startNow} disabled={status.running} loading={loading}>Start Now</Button>
            <Button onClick={stopNow} disabled={!status.running} loading={loading}>Stop</Button>
            <Button onClick={health} loading={loading}>Check Health</Button>
          </Space>
          <div style={{ marginTop: 12, color: '#666' }}>
            <div>Status: {status.running ? `Running on :${status.runningPort}` : 'Stopped'}</div>
            <div>Enabled: {status.enabled ? 'Yes' : 'No'}</div>
            <div>Configured port: {status.port || 4578}</div>
          </div>
        </Form>
        <Card size="small" title="Available Endpoints">
          <ul>
            <li>GET /health</li>
            <li>GET /api/invoices</li>
            <li>GET /api/expenses</li>
            <li>GET /api/transactions</li>
            <li>GET /api/projects</li>
            <li>GET /api/projects/:id/timesheets</li>
            <li>POST /api/report/run</li>
          </ul>
          <Text type="secondary">Plugins: place JS files in <code>src/backend/plugins/</code> that export <code>register(app)</code>.</Text>
        </Card>
      </Space>
    </Card>
  );
};

export default APIServer;


