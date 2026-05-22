import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Select, Input, message, Tag, Space, Tabs } from 'antd';
import { BankOutlined, DownloadOutlined, FileTextOutlined } from '@ant-design/icons';

const { Option } = Select;
const { TabPane } = Tabs;

const DirectDeposit = () => {
  const [files, setFiles] = useState([]);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [genVisible, setGenVisible] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);
  const [selectedContent, setSelectedContent] = useState('');
  const [form] = Form.useForm();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [f, pr] = await Promise.all([
        window.electronAPI.directDepositList?.() || [],
        window.electronAPI.getPayrollRecords?.() || [],
      ]);
      setFiles(Array.isArray(f) ? f : []);
      setPayrollRuns(Array.isArray(pr) ? pr : []);
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  const handleGenerate = async () => {
    try {
      const vals = await form.validateFields();
      let result;
      const companyInfo = {};
      try { const comp = await window.electronAPI.getCompany?.(); if (comp) { companyInfo.name = comp.name; companyInfo.tax_id = comp.tax_id; } } catch {}
      switch (vals.format) {
        case 'ACH': result = await window.electronAPI.directDepositGenerateACH?.(vals.payroll_run_id, companyInfo); break;
        case 'BACS': result = await window.electronAPI.directDepositGenerateBACS?.(vals.payroll_run_id, companyInfo); break;
        case 'EFT': result = await window.electronAPI.directDepositGenerateEFT?.(vals.payroll_run_id, companyInfo); break;
        default: result = await window.electronAPI.directDepositGenerateACH?.(vals.payroll_run_id, companyInfo);
      }
      if (result?.error) { message.error(result.error); return; }
      message.success(`${vals.format} file generated — ${result.recordCount} records, Total: $${result.totalAmount?.toFixed(2)}`);
      setGenVisible(false);
      form.resetFields();
      loadData();
    } catch (err) { message.error(err.message || 'Failed to generate'); }
  };

  const downloadFile = async (id) => {
    const file = await window.electronAPI.directDepositGet?.(id);
    if (file?.file_content) {
      const blob = new Blob([file.file_content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `direct-deposit-${file.file_format}-${file.id}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const viewContent = async (id) => {
    const file = await window.electronAPI.directDepositGet?.(id);
    if (file) { setSelectedContent(file.file_content || ''); setContentVisible(true); }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Format', dataIndex: 'file_format', key: 'file_format', render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Payroll Run', dataIndex: 'payroll_run_id', key: 'payroll_run_id' },
    { title: 'Records', dataIndex: 'record_count', key: 'record_count' },
    { title: 'Total', dataIndex: 'total_amount', key: 'total_amount', render: v => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
    { title: 'Status', dataIndex: 'status', key: 'status', render: v => <Tag color={v === 'Submitted' ? 'green' : 'orange'}>{v}</Tag> },
    { title: 'Created', dataIndex: 'created_at', key: 'created_at', render: v => v ? new Date(v).toLocaleDateString() : '' },
    {
      title: 'Actions', key: 'actions', render: (_, r) => (
        <Space>
          <Button size="small" icon={<FileTextOutlined />} onClick={() => viewContent(r.id)}>View</Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadFile(r.id)}>Download</Button>
          {r.status !== 'Submitted' && (
            <Button size="small" type="primary" onClick={async () => { await window.electronAPI.directDepositSubmit?.(r.id); message.success('Marked as submitted'); loadData(); }}>
              Submit
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card title={<><BankOutlined /> Direct Deposit File Generation</>}
      extra={<Button type="primary" onClick={() => setGenVisible(true)}>Generate Bank File</Button>}>
      <Table columns={columns} dataSource={files} rowKey="id" loading={loading} size="small" />

      <Modal title="Generate Direct Deposit File" visible={genVisible} onOk={handleGenerate} onCancel={() => setGenVisible(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="payroll_run_id" label="Payroll Run" rules={[{ required: true }]}>
            <Select placeholder="Select payroll run" showSearch
              filterOption={(input, opt) => (opt?.children || '').toString().toLowerCase().includes(input.toLowerCase())}>
              {payrollRuns.map(pr => <Option key={pr.id} value={pr.id}>Run #{pr.id} — {pr.processed_date || pr.created_at}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="format" label="File Format" initialValue="ACH" rules={[{ required: true }]}>
            <Select>
              <Option value="ACH">ACH / NACHA (US)</Option>
              <Option value="BACS">BACS (UK)</Option>
              <Option value="EFT">EFT (South Africa / Canada)</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="File Content" visible={contentVisible} onCancel={() => setContentVisible(false)} footer={null} width={700}>
        <Input.TextArea value={selectedContent} rows={20} readOnly style={{ fontFamily: 'monospace', fontSize: 11 }} />
      </Modal>
    </Card>
  );
};

export default DirectDeposit;
