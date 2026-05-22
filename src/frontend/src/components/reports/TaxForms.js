import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Select, InputNumber, message, Tag, Space, Tabs, Descriptions } from 'antd';
import { FileTextOutlined, PrinterOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';

const { Option } = Select;
const { TabPane } = Tabs;

const FORM_TYPES = {
  'US-Federal': ['W-2', '1099-NEC', '941', '940'],
  'ZA-SARS': ['IRP5', 'EMP201'],
  'UK-HMRC': ['P60', 'P45'],
  'CA-CRA': ['T4'],
};

const TaxForms = () => {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [genVisible, setGenVisible] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [employees, setEmployees] = useState([]);
  const [form] = Form.useForm();
  const [jurisdiction, setJurisdiction] = useState('US-Federal');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [f, e] = await Promise.all([
        window.electronAPI.taxFormList?.() || [],
        window.electronAPI.getEmployees?.() || [],
      ]);
      setForms(Array.isArray(f) ? f : []);
      const empArr = Array.isArray(e) ? e : (e?.all || []);
      setEmployees(empArr);
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  const handleGenerate = async () => {
    try {
      const vals = await form.validateFields();
      const result = await window.electronAPI.taxFormGenerate?.(vals);
      if (result?.error) { message.error(result.error); return; }
      message.success(`Form ${vals.form_type} generated successfully`);
      setGenVisible(false);
      form.resetFields();
      loadData();
    } catch (err) { message.error(err.message || 'Validation failed'); }
  };

  const handlePreview = async (id) => {
    const html = await window.electronAPI.taxFormHtml?.(id);
    if (html) { setPreviewHtml(html); setPreviewVisible(true); }
  };

  const handleDelete = async (id) => {
    await window.electronAPI.taxFormDelete?.(id);
    message.success('Form deleted');
    loadData();
  };

  const columns = [
    { title: 'Form Type', dataIndex: 'form_type', key: 'form_type', render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Jurisdiction', dataIndex: 'jurisdiction', key: 'jurisdiction' },
    { title: 'Tax Year', dataIndex: 'tax_year', key: 'tax_year' },
    { title: 'Quarter', dataIndex: 'quarter', key: 'quarter', render: v => v || '—' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: v => <Tag color={v === 'Submitted' ? 'green' : v === 'Draft' ? 'orange' : 'default'}>{v}</Tag> },
    { title: 'Generated', dataIndex: 'generated_at', key: 'generated_at', render: v => v ? new Date(v).toLocaleDateString() : '' },
    {
      title: 'Actions', key: 'actions', render: (_, r) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handlePreview(r.id)}>View</Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)} />
        </Space>
      ),
    },
  ];

  return (
    <Card title={<><FileTextOutlined /> Statutory Tax Forms</>}
      extra={<Button type="primary" onClick={() => setGenVisible(true)}>Generate Form</Button>}>
      <Table columns={columns} dataSource={forms} rowKey="id" loading={loading} size="small" />

      <Modal title="Generate Tax Form" visible={genVisible} onOk={handleGenerate} onCancel={() => setGenVisible(false)} width={500}>
        <Form form={form} layout="vertical">
          <Form.Item name="jurisdiction" label="Jurisdiction" initialValue="US-Federal" rules={[{ required: true }]}>
            <Select onChange={v => { setJurisdiction(v); form.setFieldsValue({ form_type: undefined }); }}>
              {Object.keys(FORM_TYPES).map(j => <Option key={j} value={j}>{j}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="form_type" label="Form Type" rules={[{ required: true }]}>
            <Select placeholder="Select form type">
              {(FORM_TYPES[jurisdiction] || []).map(t => <Option key={t} value={t}>{t}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="tax_year" label="Tax Year" rules={[{ required: true }]} initialValue={new Date().getFullYear()}>
            <InputNumber min={2020} max={2030} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="quarter" label="Quarter (if applicable)">
            <Select allowClear placeholder="Select quarter">
              <Option value={1}>Q1</Option><Option value={2}>Q2</Option>
              <Option value={3}>Q3</Option><Option value={4}>Q4</Option>
            </Select>
          </Form.Item>
          <Form.Item name="employee_id" label="Employee (for individual forms)">
            <Select allowClear showSearch placeholder="Select employee"
              filterOption={(input, opt) => (opt?.children || '').toString().toLowerCase().includes(input.toLowerCase())}>
              {employees.map(e => <Option key={e.id} value={e.id}>{e.first_name} {e.last_name}</Option>)}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Tax Form Preview" visible={previewVisible} onCancel={() => setPreviewVisible(false)}
        footer={<Button icon={<PrinterOutlined />} onClick={() => { const w = window.open('', '_blank'); w.document.write(previewHtml); w.document.close(); w.print(); }}>Print</Button>}
        width={800}>
        <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
      </Modal>
    </Card>
  );
};

export default TaxForms;
