import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Table, Tag, Statistic, Row, Col, message, Modal, Progress } from 'antd';
import { DownloadOutlined, UploadOutlined, DatabaseOutlined, LockOutlined, ShareAltOutlined } from '@ant-design/icons';

const DatabaseShare = () => {
  const [dbInfo, setDbInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [importPath, setImportPath] = useState('');
  const [importing, setImporting] = useState(false);

  const loadInfo = async () => {
    setLoading(true);
    try {
      const res = await window.electronAPI.dbInfo?.();
      if (res?.success) setDbInfo(res);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadInfo(); }, []);

  const downloadDb = async (encrypted) => {
    setDownloading(true);
    try {
      const res = await window.electronAPI.dbDownload?.({ encrypted });
      if (res?.success) {
        message.success(`Database ${encrypted ? 'encrypted ' : ''}copy saved to: ${res.path}`);
      } else {
        message.error(res?.error || 'Download failed');
      }
    } catch (e) {
      message.error(e?.message || 'Download failed');
    }
    setDownloading(false);
  };

  const downloadBase64 = async () => {
    setDownloading(true);
    try {
      const res = await window.electronAPI.dbGetFileBase64?.();
      if (res?.success && res.data) {
        const binary = atob(res.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.name || 'accounts.db';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        message.success('Database file downloaded via browser');
      } else {
        message.error(res?.error || 'Failed');
      }
    } catch (e) {
      message.error(e?.message || 'Download failed');
    }
    setDownloading(false);
  };

  const importDb = async () => {
    if (!importPath.trim()) { message.warning('Enter a file path to import'); return; }
    Modal.confirm({
      title: 'Import Database',
      content: 'This will REPLACE the current database with the imported file. A backup of the current database will be created automatically. Continue?',
      okText: 'Yes, Import',
      okType: 'danger',
      onOk: async () => {
        setImporting(true);
        try {
          const res = await window.electronAPI.dbImportFile?.(importPath.trim());
          if (res?.success) {
            message.success('Database imported. Restart the app to apply changes.');
            setImportPath('');
            loadInfo();
          } else {
            message.error(res?.error || 'Import failed');
          }
        } catch (e) {
          message.error(e?.message || 'Import failed');
        }
        setImporting(false);
      }
    });
  };

  const tableColumns = [
    { title: 'Table', dataIndex: 'table', key: 'table', sorter: (a, b) => a.table.localeCompare(b.table) },
    { title: 'Records', dataIndex: 'records', key: 'records', sorter: (a, b) => a.records - b.records, render: v => v.toLocaleString() },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2><DatabaseOutlined /> Database Share & Download</h2>
      <p style={{ color: '#666', marginBottom: 16 }}>
        Download, share, or import the full accounting database. Share with team members via USB, network drive, or VPN.
      </p>

      {dbInfo && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small"><Statistic title="Database Size" value={dbInfo.sizeMB} suffix="MB" /></Card>
          </Col>
          <Col span={6}>
            <Card size="small"><Statistic title="Total Tables" value={dbInfo.totalTables} /></Card>
          </Col>
          <Col span={6}>
            <Card size="small"><Statistic title="Total Records" value={dbInfo.tables?.reduce((s, t) => s + t.records, 0)?.toLocaleString()} /></Card>
          </Col>
          <Col span={6}>
            <Card size="small"><Statistic title="Location" value={dbInfo.path?.split(/[\\/]/).pop()} /></Card>
          </Col>
        </Row>
      )}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card title={<span><DownloadOutlined /> Download (Raw)</span>} size="small">
            <p>Download an unencrypted copy of the database to your home folder for sharing.</p>
            <Button type="primary" icon={<DownloadOutlined />} loading={downloading} onClick={() => downloadDb(false)}>
              Save to Home Folder
            </Button>
            <div style={{ marginTop: 8 }}>
              <Button icon={<DownloadOutlined />} loading={downloading} onClick={downloadBase64}>
                Download via Browser
              </Button>
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card title={<span><LockOutlined /> Download (Encrypted)</span>} size="small">
            <p>Download an AES-256 encrypted copy. Recipient needs the same encryption key to open it.</p>
            <Button type="primary" icon={<LockOutlined />} loading={downloading} onClick={() => downloadDb(true)} style={{ background: '#52c41a', borderColor: '#52c41a' }}>
              Save Encrypted Copy
            </Button>
            <div style={{ marginTop: 4, fontSize: 12, color: '#888' }}>Uses the encryption key from Backup Settings</div>
          </Card>
        </Col>
        <Col span={8}>
          <Card title={<span><UploadOutlined /> Import Database</span>} size="small">
            <p>Replace the current database with a shared .db or .enc file. Auto-backup is created first.</p>
            <Input placeholder="Path to .db or .enc file" value={importPath} onChange={e => setImportPath(e.target.value)} style={{ marginBottom: 8 }} />
            <Button type="primary" danger icon={<UploadOutlined />} loading={importing} onClick={importDb}>
              Import & Replace
            </Button>
          </Card>
        </Col>
      </Row>

      <Card title="Database Tables" size="small" extra={<Button size="small" onClick={loadInfo} loading={loading}>Refresh</Button>}>
        <Table
          dataSource={dbInfo?.tables || []}
          columns={tableColumns}
          rowKey="table"
          size="small"
          pagination={{ pageSize: 15 }}
          loading={loading}
        />
      </Card>
    </div>
  );
};

export default DatabaseShare;
