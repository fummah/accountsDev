import React, { useEffect, useState } from 'react';
import { Card, Input, Button, Switch, Select, Table, Tag, message, Divider, Badge } from 'antd';

const SyncVPN = () => {
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState({ url: '', token: '', enabled: false });
  const [conflicts, setConflicts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [strategy, setStrategy] = useState('auto-merge');

  const loadStatus = async () => {
    try {
      const s = await window.electronAPI.syncStatus?.();
      setStatus(s);
      if (s?.conflictStrategy) setStrategy(s.conflictStrategy);
    } catch {}
  };

  const loadConfig = async () => {
    try {
      const cfg = await window.electronAPI.settingsGet?.('sync');
      if (cfg) setConfig({ url: cfg.url || '', token: cfg.token || '', enabled: !!cfg.enabled });
    } catch {}
  };

  const loadConflicts = async () => {
    try {
      const c = await window.electronAPI.syncConflictsList?.('pending');
      if (Array.isArray(c)) setConflicts(c);
    } catch {}
  };

  useEffect(() => { loadStatus(); loadConfig(); loadConflicts(); }, []);

  const saveConfig = async () => {
    setSaving(true);
    try {
      await window.electronAPI.syncSetConfig?.(config);
      message.success('Sync configuration saved');
    } catch (e) {
      message.error(e?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const result = await window.electronAPI.syncRun?.();
      if (result?.ok) {
        message.success(`Sync complete. Push: ${result.results?.push?.pushed ?? 0}, Pull: ${result.results?.pull?.pulled ?? 0}`);
      } else {
        message.warning(result?.results?.push?.error || result?.results?.pull?.error || 'Sync completed with warnings');
      }
      await loadStatus();
      await loadConflicts();
    } catch (e) {
      message.error(e?.message || 'Sync failed');
    } finally { setSyncing(false); }
  };

  const changeStrategy = async (val) => {
    setStrategy(val);
    try {
      await window.electronAPI.syncSetConflictStrategy?.(val);
      message.success(`Conflict strategy set to: ${val}`);
      await loadStatus();
    } catch {}
  };

  const resolveConflict = async (id, resolution) => {
    try {
      await window.electronAPI.syncConflictResolve?.(id, resolution, 'admin');
      message.success('Conflict resolved');
      await loadConflicts();
      await loadStatus();
    } catch (e) {
      message.error(e?.message || 'Failed to resolve');
    }
  };

  const conflictColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Table', dataIndex: 'tableName', key: 'tableName', width: 120 },
    { title: 'Record', dataIndex: 'recordId', key: 'recordId', width: 80 },
    { title: 'Fields', key: 'fields', render: (_, r) => (r.conflictingFields || []).map(f => (
      <Tag key={f.field} color="orange">{f.field}</Tag>
    ))},
    { title: 'Device', dataIndex: 'deviceId', key: 'deviceId', width: 140, ellipsis: true },
    { title: 'Created', dataIndex: 'createdAt', key: 'createdAt', width: 160 },
    { title: 'Actions', key: 'actions', width: 200, render: (_, r) => (
      <div style={{ display: 'flex', gap: 4 }}>
        <Button size="small" type="primary" onClick={() => resolveConflict(r.id, 'accept-local')}>Keep Local</Button>
        <Button size="small" onClick={() => resolveConflict(r.id, 'accept-remote')}>Accept Remote</Button>
      </div>
    )},
  ];

  return (
    <div className="gx-p-4">
      <h2>Sync / VPN Settings</h2>

      <Card size="small" title="Sync Engine Status" style={{ marginBottom: 16 }}>
        {status ? (
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div><strong>Device ID:</strong> <code style={{ fontSize: 11 }}>{status.deviceId}</code></div>
            <div><strong>Active Locks:</strong> <Badge count={status.locks} showZero style={{ backgroundColor: status.locks > 0 ? '#fa541c' : '#52c41a' }} /></div>
            <div><strong>Pending Changes:</strong> <Badge count={status.pendingChanges} showZero style={{ backgroundColor: status.pendingChanges > 0 ? '#1890ff' : '#52c41a' }} /></div>
            <div><strong>Pending Conflicts:</strong> <Badge count={status.pendingConflicts} showZero style={{ backgroundColor: status.pendingConflicts > 0 ? '#fa541c' : '#52c41a' }} /></div>
          </div>
        ) : 'Loading...'}
        <div style={{ marginTop: 12 }}>
          <Button type="primary" loading={syncing} onClick={runSync}>Run Sync Now</Button>
          <Button style={{ marginLeft: 8 }} onClick={() => { loadStatus(); loadConflicts(); }}>Refresh</Button>
        </div>
      </Card>

      <Card size="small" title="VPN / Remote Sync Configuration" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span>Sync Enabled:</span>
          <Switch checked={config.enabled} onChange={v => setConfig(prev => ({ ...prev, enabled: v }))} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Remote Endpoint URL:</label>
          <Input placeholder="http://192.168.1.100:4578" value={config.url}
            onChange={e => setConfig(prev => ({ ...prev, url: e.target.value }))} />
          <small style={{ color: '#888' }}>Enter the API server URL of the remote peer (e.g., another machine on the VPN). The API Server must be running on the remote.</small>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>API Token (optional):</label>
          <Input.Password placeholder="Bearer token or API key" value={config.token}
            onChange={e => setConfig(prev => ({ ...prev, token: e.target.value }))} />
        </div>
        <Button type="primary" loading={saving} onClick={saveConfig}>Save Configuration</Button>
      </Card>

      <Card size="small" title="Conflict Resolution" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <span>Strategy: </span>
          <Select value={strategy} onChange={changeStrategy} style={{ width: 200 }}>
            <Select.Option value="auto-merge">Auto-Merge (recommended)</Select.Option>
            <Select.Option value="last-writer-wins">Last Writer Wins</Select.Option>
            <Select.Option value="manual">Manual Review</Select.Option>
          </Select>
          <div style={{ marginTop: 4, color: '#888', fontSize: 12 }}>
            {strategy === 'auto-merge' && 'Non-conflicting fields merge automatically. True conflicts are logged but remote values are applied.'}
            {strategy === 'last-writer-wins' && 'Remote changes always overwrite local changes when fields differ.'}
            {strategy === 'manual' && 'All field-level conflicts are queued for manual review. Changes are NOT applied until resolved.'}
          </div>
        </div>

        <Divider orientation="left">Pending Conflicts ({conflicts.length})</Divider>
        {conflicts.length > 0 ? (
          <Table dataSource={conflicts} columns={conflictColumns} rowKey="id" size="small" pagination={{ pageSize: 10 }} scroll={{ x: 800 }} />
        ) : (
          <p style={{ color: '#52c41a' }}>No pending conflicts.</p>
        )}
      </Card>
    </div>
  );
};

export default SyncVPN;
