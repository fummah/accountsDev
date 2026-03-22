import React, { useEffect, useState } from 'react';
import { Card, Button, message, Table, Input, Space } from 'antd';
import { DownloadOutlined, CloudUploadOutlined } from '@ant-design/icons';

const { TextArea } = Input;

const COAImportExport = () => {
  const [csv, setCsv] = useState('');
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeKey, setActiveKey] = useState('export');

  const loadVersions = async () => {
    try {
      const list = await window.electronAPI.coaVersionsList();
      setVersions(Array.isArray(list) ? list : []);
    } catch {
      setVersions([]);
    }
  };

  useEffect(() => { loadVersions(); }, []);

  const exportTemplate = async () => {
    const res = await window.electronAPI.coaExportTemplate();
    if (res?.csv) {
      await navigator.clipboard.writeText(res.csv);
      message.success('Template copied to clipboard');
      setCsv(res.csv);
    } else message.error(res?.error || 'Failed to export template');
  };

  const exportCurrent = async () => {
    const res = await window.electronAPI.coaExportCurrent();
    if (res?.csv) {
      await navigator.clipboard.writeText(res.csv);
      message.success('Current COA copied to clipboard');
      setCsv(res.csv);
    } else message.error(res?.error || 'Failed to export COA');
  };

  const importCsv = async () => {
    try {
      setLoading(true);
      const res = await window.electronAPI.coaImport(csv, 'COA import');
      if (res?.success) {
        message.success(`Imported ${res.inserted} rows`);
        await loadVersions();
      } else message.error(res?.error || 'Import failed');
    } catch (e) {
      message.error('Import failed');
    } finally {
      setLoading(false);
    }
  };

  const createSnapshot = async () => {
    const res = await window.electronAPI.coaVersionCreate('Manual snapshot');
    if (res?.success) {
      message.success('Snapshot created');
      await loadVersions();
    } else message.error(res?.error || 'Failed to snapshot');
  };

  const restore = async (id) => {
    const res = await window.electronAPI.coaVersionRestore(id);
    if (res?.success) {
      message.success('COA restored from version');
    } else message.error(res?.error || 'Restore failed');
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    { title: 'Created', dataIndex: 'created_at', key: 'created_at' },
    { title: 'Note', dataIndex: 'note', key: 'note' },
    { title: 'Size (bytes)', dataIndex: 'bytes', key: 'bytes' },
    {
      title: 'Action',
      key: 'action',
      render: (_, row) => <Button onClick={() => restore(row.id)}>Restore</Button>
    }
  ];

  return (
    <Card title="COA Import / Export & Versions" style={{ margin: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Button type={activeKey === 'export' ? 'primary' : 'default'} style={{ marginRight: 8 }} onClick={() => setActiveKey('export')}>
          Export
        </Button>
        <Button type={activeKey === 'import' ? 'primary' : 'default'} style={{ marginRight: 8 }} onClick={() => setActiveKey('import')}>
          Import
        </Button>
        <Button type={activeKey === 'versions' ? 'primary' : 'default'} onClick={() => setActiveKey('versions')}>
          Versions
        </Button>
      </div>

      {activeKey === 'export' && (
        <div>
          <Space>
            <Button icon={<DownloadOutlined />} onClick={exportTemplate}>Export Template</Button>
            <Button icon={<DownloadOutlined />} onClick={exportCurrent}>Export Current</Button>
            <Button onClick={createSnapshot}>Create Snapshot</Button>
          </Space>
          <div style={{ marginTop: 16 }}>
            <TextArea rows={10} value={csv} onChange={e => setCsv(e.target.value)} />
          </div>
        </div>
      )}

      {activeKey === 'import' && (
        <div>
          <p>Paste CSV (columns: number,name,type,status) then click Import.</p>
          <TextArea rows={12} value={csv} onChange={e => setCsv(e.target.value)} />
          <div style={{ marginTop: 12 }}>
            <Button type="primary" icon={<CloudUploadOutlined />} loading={loading} onClick={importCsv}>Import</Button>
          </div>
        </div>
      )}

      {activeKey === 'versions' && (
        <Table columns={columns} dataSource={versions.map(v => ({ ...v, key: v.id }))} />
      )}
    </Card>
  );
};

export default COAImportExport;


