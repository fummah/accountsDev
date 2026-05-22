import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Select, InputNumber, Input, message, Tag, Space, Tabs } from 'antd';
import { CloudUploadOutlined, DownloadOutlined, DeleteOutlined, CheckCircleOutlined } from '@ant-design/icons';

const { Option } = Select;
const { TabPane } = Tabs;
const { TextArea } = Input;

const TaxFilingCenter = () => {
  const [filings, setFilings] = useState([]);
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [genVisible, setGenVisible] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);
  const [selectedContent, setSelectedContent] = useState('');
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [confirmNum, setConfirmNum] = useState('');
  const [form] = Form.useForm();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [f, tf] = await Promise.all([
        window.electronAPI.taxFilingList?.() || [],
        window.electronAPI.taxFormList?.() || [],
      ]);
      setFilings(Array.isArray(f) ? f : []);
      setForms(Array.isArray(tf) ? tf : []);
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  const handleGenerate = async () => {
    try {
      const vals = await form.validateFields();
      const result = await window.electronAPI.taxFilingGenerate?.(vals);
      if (result?.error) { message.error(result.error); return; }
      message.success('Filing file generated');
      setGenVisible(false);
      form.resetFields();
      loadData();
    } catch (err) { message.error(err.message); }
  };

  const viewContent = async (id) => {
    const filing = await window.electronAPI.taxFilingGet?.(id);
    if (filing) { setSelectedContent(filing.file_content || ''); setContentVisible(true); }
  };

  const downloadFile = async (id) => {
    const filing = await window.electronAPI.taxFilingGet?.(id);
    if (filing?.file_content) {
      const ext = (filing.file_format || 'xml').toLowerCase();
      const blob = new Blob([filing.file_content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tax-filing-${filing.filing_type}-${filing.tax_year}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleSubmit = async () => {
    await window.electronAPI.taxFilingSubmit?.(selectedId, confirmNum);
    message.success('Filing marked as submitted');
    setConfirmVisible(false);
    setConfirmNum('');
    loadData();
  };

  const columns = [
    { title: 'Type', dataIndex: 'filing_type', key: 'filing_type', render: v => <Tag color="purple">{v}</Tag> },
    { title: 'Jurisdiction', dataIndex: 'jurisdiction', key: 'jurisdiction' },
    { title: 'Tax Year', dataIndex: 'tax_year', key: 'tax_year' },
    { title: 'Format', dataIndex: 'file_format', key: 'file_format' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: v => <Tag color={v === 'Submitted' ? 'green' : 'orange'}>{v}</Tag> },
    { title: 'Confirmation #', dataIndex: 'confirmation_number', key: 'confirmation_number', render: v => v || '—' },
    { title: 'Created', dataIndex: 'created_at', key: 'created_at', render: v => v ? new Date(v).toLocaleDateString() : '' },
    {
      title: 'Actions', key: 'actions', render: (_, r) => (
        <Space>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadFile(r.id)}>Download</Button>
          {r.status !== 'Submitted' && (
            <Button size="small" icon={<CheckCircleOutlined />} onClick={() => { setSelectedId(r.id); setConfirmVisible(true); }}>Mark Submitted</Button>
          )}
          <Button size="small" danger icon={<DeleteOutlined />} onClick={async () => { await window.electronAPI.taxFilingDelete?.(r.id); loadData(); }} />
        </Space>
      ),
    },
  ];

  return (
    <Card title={<><CloudUploadOutlined /> Electronic Tax Filing Center</>}
      extra={<Button type="primary" onClick={() => setGenVisible(true)}>Generate Filing File</Button>}>
      <Table columns={columns} dataSource={filings} rowKey="id" loading={loading} size="small" />

      <Modal title="Generate Filing File" visible={genVisible} onOk={handleGenerate} onCancel={() => setGenVisible(false)} width={500}>
        <Form form={form} layout="vertical">
          <Form.Item name="form_id" label="Source Tax Form">
            <Select allowClear placeholder="Select a generated tax form" showSearch
              filterOption={(input, opt) => (opt?.children || '').toString().toLowerCase().includes(input.toLowerCase())}>
              {forms.map(f => <Option key={f.id} value={f.id}>{f.form_type} — {f.tax_year} {f.quarter ? `Q${f.quarter}` : ''}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="filing_type" label="Filing Type" initialValue="Generic">
            <Select>
              <Option value="Generic">Generic</Option>
              <Option value="EFILE">IRS E-File</Option>
              <Option value="EMP501">SARS EMP501</Option>
              <Option value="MTD">UK MTD for VAT</Option>
            </Select>
          </Form.Item>
          <Form.Item name="file_format" label="File Format" initialValue="XML">
            <Select>
              <Option value="XML">XML</Option>
              <Option value="CSV">CSV</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="File Content" visible={contentVisible} onCancel={() => setContentVisible(false)} footer={null} width={700}>
        <TextArea value={selectedContent} rows={20} readOnly style={{ fontFamily: 'monospace', fontSize: 12 }} />
      </Modal>

      <Modal title="Mark as Submitted" visible={confirmVisible} onOk={handleSubmit} onCancel={() => setConfirmVisible(false)}>
        <Form layout="vertical">
          <Form.Item label="Confirmation Number (from tax authority)">
            <Input value={confirmNum} onChange={e => setConfirmNum(e.target.value)} placeholder="Enter confirmation number" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default TaxFilingCenter;
