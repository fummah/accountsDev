import React, { useEffect, useState } from 'react';
import { Card, Table, Switch, InputNumber, Button, Space, Typography, message } from 'antd';

const { Title, Text } = Typography;

const Scheduler = () => {
  const [registered, setRegistered] = useState([]);
  const [configured, setConfigured] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [reg, cfg] = await Promise.all([
        window.electronAPI.schedulerListRegistered(),
        window.electronAPI.schedulerList()
      ]);
      setRegistered(reg || []);
      // Merge registry and configured for a friendly view
      const cfgMap = new Map((cfg || []).map(t => [t.id, t]));
      const rows = (reg || []).map(r => ({
        key: r.id,
        id: r.id,
        name: r.name,
        defaultIntervalSec: r.intervalSec,
        enabled: cfgMap.get(r.id)?.enabled ?? false,
        intervalSec: cfgMap.get(r.id)?.intervalSec ?? r.intervalSec,
        lastRunAt: cfgMap.get(r.id)?.lastRunAt ?? null
      }));
      setConfigured(rows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateRow = (id, patch) => {
    setConfigured(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  };

  const save = async () => {
    try {
      setLoading(true);
      const payload = configured.map(r => ({
        id: r.id,
        enabled: !!r.enabled,
        intervalSec: Number(r.intervalSec) || r.defaultIntervalSec,
        lastRunAt: r.lastRunAt || null
      }));
      await window.electronAPI.schedulerSet(payload);
      await window.electronAPI.schedulerReload();
      message.success('Scheduler updated');
      load();
    } catch (e) {
      message.error('Failed to update scheduler');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { title: 'Task', dataIndex: 'name', key: 'name' },
    {
      title: 'Enabled',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (v, row) => <Switch checked={!!v} onChange={(checked) => updateRow(row.id, { enabled: checked })} />
    },
    {
      title: 'Interval (sec)',
      dataIndex: 'intervalSec',
      key: 'intervalSec',
      render: (v, row) => (
        <InputNumber
          min={60}
          step={60}
          value={v}
          onChange={(val) => updateRow(row.id, { intervalSec: val })}
        />
      )
    },
    { title: 'Last Run', dataIndex: 'lastRunAt', key: 'lastRunAt', render: (v) => v ? <Text>{new Date(v).toLocaleString()}</Text> : <Text type="secondary">—</Text> }
  ];

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Title level={4}>Background Scheduler</Title>
        <Text type="secondary">Configure automated tasks like backups, KPI recalculation, and recurring reminders.</Text>
        <Table
          columns={columns}
          dataSource={configured}
          loading={loading}
          pagination={false}
          size="small"
        />
        <Space>
          <Button type="primary" onClick={save} loading={loading}>Save & Reload</Button>
          <Button onClick={load} disabled={loading}>Refresh</Button>
        </Space>
      </Space>
    </Card>
  );
};

export default Scheduler;


