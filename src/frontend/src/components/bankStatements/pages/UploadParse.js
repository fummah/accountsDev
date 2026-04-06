import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Card, Form, Input, Button, Upload, Space, Typography, message, Divider, Row, Col, Alert, Tag } from 'antd';
import { UploadOutlined, FileTextOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';

const UploadParse = () => {
  const history = useHistory();
  const [form] = Form.useForm();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resultMsg, setResultMsg] = useState('');
  const [resultSuccess, setResultSuccess] = useState(null);

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
      let res;
      if (name.endsWith('.csv')) {
        const text = await readAsText(file);
        res = await window.electronAPI.parseBankStatement(text, meta);
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const csv = await readExcelAsCsv(file);
        res = await window.electronAPI.parseBankStatement(csv, meta);
      } else if (name.endsWith('.txt') || name.endsWith('.pdf')) {
        const text = await readAsText(file);
        res = await window.electronAPI.parsePlaintextStatement(text, meta);
      } else {
        setResultMsg('Unsupported file type. Please upload CSV, XLS/XLSX, TXT, or PDF.');
        setResultSuccess(false);
        return;
      }
      if (res?.success) {
        setResultMsg(`Statement #${res.statementId} parsed successfully${res.detected ? ` (${res.detected} rows)` : ''}`);
        setResultSuccess(true);
        message.success('Statement uploaded and parsed');
      } else {
        setResultMsg(res?.error || 'Failed to parse statement');
        setResultSuccess(false);
      }
    } catch (e) {
      setResultMsg(e?.message || 'Parsing error');
      setResultSuccess(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Card title={<span style={{ fontSize: 18, fontWeight: 600 }}><FileTextOutlined style={{ marginRight: 8 }} />Bank Statement Upload</span>}
        extra={<Button onClick={() => { history.push('/main/bank-statements/list'); }}>View Parsed Statements</Button>}>

        {resultSuccess === true && (
          <Alert type="success" showIcon icon={<CheckCircleOutlined />} message={resultMsg}
            description={<Space style={{ marginTop: 8 }}><Button type="primary" size="small" onClick={() => { history.push('/main/bank-statements/list'); }}>View Statements</Button><Button size="small" onClick={() => { setResultSuccess(null); setResultMsg(''); setFile(null); }}>Upload Another</Button></Space>}
            style={{ marginBottom: 16 }} closable />
        )}
        {resultSuccess === false && (
          <Alert type="error" showIcon icon={<CloseCircleOutlined />} message={resultMsg} style={{ marginBottom: 16 }} closable />
        )}

        <Form layout="vertical" form={form} style={{ maxWidth: 700 }}>
          <Form.Item label="Statement File (CSV / XLS / XLSX / TXT / PDF)" required>
            <Upload beforeUpload={beforeUpload} showUploadList={!!file} maxCount={1} accept=".csv,.xls,.xlsx,.txt,.pdf">
              <Button icon={<UploadOutlined />}>Select File</Button>
            </Upload>
            {file && <Tag color="blue" style={{ marginTop: 8 }}>{file.name} ({(file.size / 1024).toFixed(1)} KB)</Tag>}
          </Form.Item>

          <Row gutter={16} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}>
              <Form.Item name="bankName" label="Bank Name">
                <Input placeholder="e.g. FNB, Nedbank, Standard Bank" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="currency" label="Currency">
                <Input placeholder="e.g. ZAR, USD" />
              </Form.Item>
            </Col>
          </Row>

          <Divider />
          <Typography.Text strong>Optional: Column Header Mapping (for CSV/Excel)</Typography.Text>
          <div style={{ marginTop: 12 }}>
            <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Col span={8}><Form.Item name="mapDate" label="Date Header"><Input placeholder="e.g. Posting Date" /></Form.Item></Col>
              <Col span={8}><Form.Item name="mapDesc" label="Description Header"><Input placeholder="e.g. Details" /></Form.Item></Col>
              <Col span={8}><Form.Item name="mapAmount" label="Amount Header"><Input placeholder="e.g. Amount" /></Form.Item></Col>
            </Row>
            <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Col span={8}><Form.Item name="mapDebit" label="Debit Header"><Input placeholder="Optional" /></Form.Item></Col>
              <Col span={8}><Form.Item name="mapCredit" label="Credit Header"><Input placeholder="Optional" /></Form.Item></Col>
            </Row>
          </div>

          <Space>
            <Button type="primary" icon={<UploadOutlined />} onClick={parse} loading={busy} size="large">Upload & Parse</Button>
          </Space>

          <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
            Tip: For best accuracy, upload CSV or Excel exports from your bank. PDF parsing uses heuristic text extraction. You can also configure live feeds under Banking → Bank Feeds.
          </Typography.Paragraph>
        </Form>
      </Card>
    </div>
  );
};

export default UploadParse;


