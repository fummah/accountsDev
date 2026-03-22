import React, { useEffect, useState } from 'react';
import { Card, Input, Button, Select, Switch, Table, Tag, InputNumber, message } from 'antd';

const { Option } = Select;

const BackupExport = () => {
  const [role, setRole] = useState('Staff');
  const [table, setTable] = useState('invoices');
  const [exporting, setExporting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [backups, setBackups] = useState([]);
  const [backupDir, setBackupDir] = useState('');
  const [settings, setSettings] = useState({ encrypt: true, maxBackups: 30, scheduledIntervalHours: 24, hasCustomKey: false });
  const [encKey, setEncKey] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const loadRole = async () => {
    const me = await window.electronAPI.getMe().catch(() => null);
    setRole(me?.user?.role || 'Staff');
  };

  const loadBackups = async () => {
    try {
      const res = await window.electronAPI.backupList?.();
      if (res?.success) { setBackups(res.backups || []); setBackupDir(res.directory || ''); }
    } catch {}
  };

  const loadSettings = async () => {
    try {
      const s = await window.electronAPI.backupSettingsGet?.();
      if (s) setSettings(s);
    } catch {}
  };

  useEffect(() => { loadRole(); loadBackups(); loadSettings(); }, []);

  const doBackup = async () => {
    setBackingUp(true);
    try {
      const res = await window.electronAPI.backupDb();
      if (res?.success) {
        message.success(`Backup created${res.encrypted ? ' (encrypted)' : ''}`);
        loadBackups();
      } else { message.error(res?.error || 'Backup failed'); }
    } finally { setBackingUp(false); }
  };

  const doRestore = async (name) => {
    const fullPath = backupDir + (backupDir.endsWith('/') || backupDir.endsWith('\\') ? '' : '/') + name;
    try {
      const res = await window.electronAPI.restoreDb(fullPath);
      if (res?.success) message.success('Restore completed. Restart app to apply.');
      else message.error(res?.error || 'Restore failed');
    } catch (e) { message.error(e?.message || 'Restore failed'); }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const cfg = { encrypt: settings.encrypt, maxBackups: settings.maxBackups, intervalHours: settings.scheduledIntervalHours };
      if (encKey) cfg.encryptionKey = encKey;
      const res = await window.electronAPI.backupSettingsSet?.(cfg);
      if (res?.success) { message.success('Settings saved'); setEncKey(''); loadSettings(); }
      else message.error(res?.error || 'Save failed');
    } finally { setSavingSettings(false); }
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const res = await window.electronAPI.exportTableCsv(table);
      if (res?.success) {
        const blob = new Blob([res.csv || ''], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${table}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        message.success('Export downloaded');
      } else { message.error(res?.error || 'Export failed'); }
    } finally { setExporting(false); }
  };

  const commonTables = [
    'invoices','invoice_lines','customers','suppliers',
    'expenses','expense_lines','transactions','journal_entries',
    'journal_lines','chart_of_accounts','payments','products'
  ];

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const backupColumns = [
    { title: 'Name', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: 'Size', dataIndex: 'size', key: 'size', width: 90, render: v => formatSize(v) },
    { title: 'Date', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: v => v?.replace('T',' ').slice(0,19) },
    { title: 'Encrypted', dataIndex: 'encrypted', key: 'encrypted', width: 90, render: v => v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag> },
    { title: 'Actions', key: 'actions', width: 100, render: (_, r) => (
      <Button size="small" onClick={() => doRestore(r.name)} disabled={role !== 'Admin'}>Restore</Button>
    )},
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2>Backup & Export</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card title="Encrypted Backup" size="small">
          <p>Creates an AES-256 encrypted backup of the database. Admin only.</p>
          <Button type="primary" onClick={doBackup} loading={backingUp} disabled={role !== 'Admin'}>Create Backup Now</Button>
          <div style={{ marginTop: 8, color: '#888', fontSize: 12 }}>
            Backups stored in: <code>{backupDir}</code>
          </div>
        </Card>
        <Card title="Backup Settings" size="small">
          <div style={{ marginBottom: 8 }}>
            <span>AES-256 Encryption: </span>
            <Switch checked={settings.encrypt} onChange={v => setSettings(s => ({...s, encrypt: v}))} />
            {settings.hasCustomKey && <Tag color="green" style={{ marginLeft: 8 }}>Custom key set</Tag>}
          </div>
          <div style={{ marginBottom: 8 }}>
            <span>Max backups to keep: </span>
            <InputNumber min={1} max={365} value={settings.maxBackups} onChange={v => setSettings(s => ({...s, maxBackups: v}))} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <span>Auto-backup interval (hours): </span>
            <InputNumber min={1} max={168} value={settings.scheduledIntervalHours} onChange={v => setSettings(s => ({...s, scheduledIntervalHours: v}))} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <Input.Password placeholder="Set encryption key (leave blank to keep current)" value={encKey} onChange={e => setEncKey(e.target.value)} />
          </div>
          <Button type="primary" loading={savingSettings} onClick={saveSettings} disabled={role !== 'Admin'}>Save Settings</Button>
        </Card>
      </div>

      <Card title="Available Backups (Point-in-Time Recovery)" size="small" style={{ marginBottom: 16 }}
        extra={<Button size="small" onClick={loadBackups}>Refresh</Button>}>
        <Table dataSource={backups} columns={backupColumns} rowKey="name" size="small" pagination={{ pageSize: 10 }} />
      </Card>

      <Card title="Export Table (CSV)" size="small">
        <p>Exports a single table as CSV for analysis or migration.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Select style={{ minWidth: 220 }} value={table} onChange={setTable} showSearch>
            {commonTables.map(t => <Option key={t} value={t}>{t}</Option>)}
          </Select>
          <Button onClick={doExport} type="primary" loading={exporting}>Export CSV</Button>
        </div>
      </Card>
    </div>
  );
};

export default BackupExport;


