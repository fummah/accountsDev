import React, { useState } from 'react';
import { Modal, Button, Input, Space, message } from 'antd';
import { FileAddOutlined, CloudUploadOutlined, DownloadOutlined } from '@ant-design/icons';

const { TextArea } = Input;

const CsvImportModal = ({ visible, onClose, title, importFn, onImported, description }) => {
  const [csv, setCsv] = useState('');
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileRef = React.useRef(null);

  const reset = () => {
    setCsv('');
    setFileName('');
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(String(reader.result || ''));
      setFileName(file.name);
    };
    reader.onerror = () => message.error('Failed to read file');
    reader.readAsText(file);
    e.target.value = '';
  };

  const doImport = async () => {
    if (!csv.trim()) {
      message.warning('Paste CSV content or select a file first.');
      return;
    }
    setLoading(true);
    try {
      const res = await importFn(csv, {});
      if (res?.success) {
        message.success(`Imported ${res.inserted || 0} row(s)`);
        reset();
        onClose();
        if (onImported) onImported();
      } else {
        message.error(res?.error || 'Import failed');
      }
    } catch (e) {
      message.error('Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={<><DownloadOutlined style={{ marginRight: 8 }} />{title}</>}
      visible={visible}
      onCancel={() => { reset(); onClose(); }}
      width={680}
      footer={[
        <Button key="cancel" onClick={() => { reset(); onClose(); }}>Cancel</Button>,
        <Button key="import" type="primary" icon={<CloudUploadOutlined />} loading={loading} onClick={doImport}>Import</Button>,
      ]}
      destroyOnClose
    >
      <p style={{ marginTop: 0, lineHeight: 1.6 }}>{description || 'Paste the CSV export or select a file, then click Import.'}</p>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<FileAddOutlined />} onClick={() => fileRef.current?.click()}>
          {fileName || 'Browse CSV File'}
        </Button>
        {fileName && <span style={{ color: '#888' }}>{fileName}</span>}
      </Space>
      <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleFile} />
      <TextArea
        rows={12}
        value={csv}
        onChange={e => setCsv(e.target.value)}
        placeholder="Or paste CSV content here..."
        style={{ fontFamily: 'monospace', fontSize: 12 }}
      />
    </Modal>
  );
};

export default CsvImportModal;