import React, { useState } from 'react';
import { Card, Button, Upload, message } from 'antd';

const CloudSync = () => {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const exportJson = async () => {
    setExporting(true);
    try {
      const res = await window.electronAPI.exportDataJson();
      if (res?.success && res?.data) {
        const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `accounting-export-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        message.error(res?.error || 'Export failed');
      }
    } catch (e) {
      message.error(String(e?.message || e));
    } finally {
      setExporting(false);
    }
  };

  const beforeUpload = async (file) => {
    setImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await window.electronAPI.importDataJson(json);
      if (res?.success) {
        message.success('Import completed');
      } else {
        message.error(res?.error || 'Import failed');
      }
    } catch (e) {
      message.error('Invalid file');
    } finally {
      setImporting(false);
    }
    return false;
  };

  return (
    <Card title="Cloud / Data Sync">
      <p>Export all data to a JSON file or import from a JSON export. You can sync this file with cloud storage if desired.</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <Button type="primary" loading={exporting} onClick={exportJson}>Export all data (JSON)</Button>
        <Upload beforeUpload={beforeUpload} showUploadList={false} accept=".json,application/json">
          <Button loading={importing}>Import from JSON</Button>
        </Upload>
      </div>
    </Card>
  );
};

export default CloudSync;


