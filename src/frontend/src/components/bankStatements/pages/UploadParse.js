import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Card, Form, Input, Button, Upload, Space, Typography, message, Divider } from 'antd';
import { UploadOutlined } from '@ant-design/icons';

const UploadParse = () => {
  const [form] = Form.useForm();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resultMsg, setResultMsg] = useState('');

  const onFile = (e) => {
    setFile(e.target.files?.[0] || null);
  };

  const beforeUpload = (f) => {
    setFile(f || null);
    message.success(`${f?.name || 'File'} selected`);
    return false; // prevent auto upload
  };

  async function readAsText(f) {
    return await f.text();
  }

  async function readExcelAsCsv(f) {
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const first = wb.SheetNames[0];
    const ws = wb.Sheets[first];
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: ',', blankrows: false });
    return csv;
  }

  const buildMeta = () => ({
    bankName: form.getFieldValue('bankName') || '',
    currency: form.getFieldValue('currency') || '',
    map: {
      date: form.getFieldValue('mapDate') || undefined,
      description: form.getFieldValue('mapDesc') || undefined,
      amount: form.getFieldValue('mapAmount') || undefined,
      debit: form.getFieldValue('mapDebit') || undefined,
      credit: form.getFieldValue('mapCredit') || undefined,
    }
  });

  const parse = async () => {
    setResultMsg('');
    if (!file) { message.warning('Choose a CSV/XLSX/PDF/TXT file'); return; }
    const meta = buildMeta();

    const name = (file.name || '').toLowerCase();
    try {
      setBusy(true);
      if (name.endsWith('.csv')) {
        const text = await readAsText(file);
        const res = await window.electronAPI.parseBankStatement(text, meta);
        setResultMsg(res?.success ? `Parsed and saved statement #${res.statementId}` : (res?.error || 'Failed to parse CSV'));
        return;
      }
      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const csv = await readExcelAsCsv(file);
        const res = await window.electronAPI.parseBankStatement(csv, meta);
        setResultMsg(res?.success ? `Parsed XLS/XLSX → CSV, saved #${res.statementId}` : (res?.error || 'Failed to parse Excel'));
        return;
      }
      if (name.endsWith('.txt') || name.endsWith('.pdf')) {
        const text = await readAsText(file);
        const res = await window.electronAPI.parsePlaintextStatement(text, meta);
        setResultMsg(res?.success ? `Parsed text/PDF (heuristic), saved #${res.statementId} (${res?.detected || 0} rows)` : (res?.error || 'Failed to parse text/PDF'));
        return;
      }
      setResultMsg('Unsupported file type. Please upload CSV, XLS/XLSX, TXT, or PDF.');
    } catch (e) {
      setResultMsg(e?.message || 'Parsing error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Bank Statement Upload" style={{ margin: 24 }}>
      <Form layout="vertical" form={form}>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Form.Item label="Statement File (CSV/XLS/XLSX/TXT/PDF)" required>
            <Upload beforeUpload={beforeUpload} showUploadList={!!file} maxCount={1} accept=".csv,.xls,.xlsx,.txt,.pdf">
              <Button icon={<UploadOutlined />}>Select File</Button>
            </Upload>
            {file && <div style={{ marginTop: 8, color: '#888' }}>{file.name}</div>}
          </Form.Item>

          <Form.Item name="bankName" label="Bank name">
            <Input placeholder="e.g. Inbox, Barclays, First National" />
          </Form.Item>

          <Form.Item name="currency" label="Currency">
            <Input placeholder="e.g. USD" />
          </Form.Item>

          <Divider />
          <Typography.Text strong>Optional: Column header mapping (for CSV/Excel)</Typography.Text>
          <Space style={{ width: '100%' }} wrap>
            <Form.Item name="mapDate" label="Date header">
              <Input placeholder="e.g. Posting Date" />
            </Form.Item>
            <Form.Item name="mapDesc" label="Description header">
              <Input placeholder="e.g. Details" />
            </Form.Item>
            <Form.Item name="mapAmount" label="Amount header">
              <Input placeholder="If a single Amount column exists" />
            </Form.Item>
            <Form.Item name="mapDebit" label="Debit header">
              <Input placeholder="Optional" />
            </Form.Item>
            <Form.Item name="mapCredit" label="Credit header">
              <Input placeholder="Optional" />
            </Form.Item>
          </Space>

          <Button type="primary" onClick={parse} loading={busy}>Upload & Parse</Button>

          {resultMsg && <div style={{ marginTop: 8 }}>{resultMsg}</div>}
          <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
            Tip: For PDFs, this uses a heuristic text extraction. For best accuracy, upload CSV or Excel exports from your bank, or configure a live feed under Banking → Bank Feeds.
          </Typography.Paragraph>
        </Space>
      </Form>
    </Card>
  );
};

export default UploadParse;


