import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Select, Input, InputNumber, message, Tag, Space, Row, Col, Switch, Statistic, Divider } from 'antd';
import { GlobalOutlined, PlusOutlined, CalculatorOutlined } from '@ant-design/icons';

const { Option } = Select;

const JurisdictionTax = () => {
  const [rules, setRules] = useState([]);
  const [jurisdictions, setJurisdictions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [calcVisible, setCalcVisible] = useState(false);
  const [calcResult, setCalcResult] = useState(null);
  const [filterJurisdiction, setFilterJurisdiction] = useState(null);
  const [form] = Form.useForm();
  const [calcForm] = Form.useForm();

  useEffect(() => { loadData(); }, [filterJurisdiction]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [r, j] = await Promise.all([
        window.electronAPI.jurisdictionTaxList?.(filterJurisdiction) || [],
        window.electronAPI.jurisdictionTaxJurisdictions?.() || [],
      ]);
      setRules(Array.isArray(r) ? r : []);
      setJurisdictions(Array.isArray(j) ? j : []);
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  const handleSave = async () => {
    try {
      const vals = await form.validateFields();
      const result = await window.electronAPI.jurisdictionTaxSave?.(vals);
      if (result?.error) { message.error(result.error); return; }
      message.success('Tax rule saved');
      setEditVisible(false);
      form.resetFields();
      loadData();
    } catch {}
  };

  const handleDelete = async (id) => {
    await window.electronAPI.jurisdictionTaxDelete?.(id);
    message.success('Rule deleted');
    loadData();
  };

  const handleCalculate = async () => {
    const vals = calcForm.getFieldsValue();
    const result = await window.electronAPI.jurisdictionTaxCalculate?.(vals.jurisdiction, vals.tax_type, vals.amount, {});
    if (result?.error) { message.error(result.error); return; }
    setCalcResult(result);
  };

  const openEdit = (record) => {
    form.setFieldsValue(record || {});
    setEditVisible(true);
  };

  const columns = [
    { title: 'Jurisdiction', dataIndex: 'jurisdiction', key: 'jurisdiction', render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Tax Type', dataIndex: 'tax_type', key: 'tax_type', render: v => <Tag>{v}</Tag> },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Rate (%)', dataIndex: 'rate', key: 'rate', render: v => `${v}%` },
    { title: 'Threshold', dataIndex: 'threshold', key: 'threshold', render: v => v ? Number(v).toLocaleString() : '—' },
    { title: 'Applies To', dataIndex: 'applies_to', key: 'applies_to' },
    { title: 'Active', dataIndex: 'active', key: 'active', render: v => v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag> },
    {
      title: 'Actions', key: 'actions', width: 150, render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => openEdit(r)}>Edit</Button>
          <Button size="small" danger onClick={() => handleDelete(r.id)}>Delete</Button>
        </Space>
      ),
    },
  ];

  return (
    <Card title={<><GlobalOutlined /> Jurisdiction-Specific Tax Engine</>}
      extra={
        <Space>
          <Button icon={<CalculatorOutlined />} onClick={() => setCalcVisible(true)}>Tax Calculator</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit(null)}>Add Rule</Button>
        </Space>
      }>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Select allowClear placeholder="Filter by jurisdiction" style={{ width: '100%' }} value={filterJurisdiction} onChange={v => setFilterJurisdiction(v)}>
            {jurisdictions.map(j => <Option key={j} value={j}>{j}</Option>)}
          </Select>
        </Col>
        <Col span={16}><span style={{ color: '#888' }}>{rules.length} tax rules loaded</span></Col>
      </Row>

      <Table columns={columns} dataSource={rules} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 20 }} />

      <Modal title="Tax Rule" visible={editVisible} onOk={handleSave} onCancel={() => { setEditVisible(false); form.resetFields(); }} width={600}>
        <Form form={form} layout="vertical">
          <Form.Item name="id" hidden><Input /></Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="jurisdiction" label="Jurisdiction" rules={[{ required: true }]}>
                <Select showSearch placeholder="e.g. US, UK, ZA, NG">
                  <Option value="US">US</Option><Option value="UK">UK</Option><Option value="ZA">ZA</Option>
                  <Option value="NG">NG</Option><Option value="AE">AE</Option><Option value="CA">CA</Option>
                  <Option value="AU">AU</Option><Option value="CA-ON">CA-ON</Option><Option value="CA-BC">CA-BC</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tax_type" label="Tax Type" rules={[{ required: true }]}>
                <Select>
                  <Option value="VAT">VAT</Option><Option value="GST">GST</Option><Option value="HST">HST</Option>
                  <Option value="PST">PST</Option><Option value="PAYE">PAYE</Option><Option value="Income Tax">Income Tax</Option>
                  <Option value="FICA">FICA</Option><Option value="FUTA">FUTA</Option><Option value="NI">NI</Option>
                  <Option value="UIF">UIF</Option><Option value="SDL">SDL</Option><Option value="WHT">WHT</Option>
                  <Option value="CIT">CIT</Option><Option value="CPP">CPP</Option><Option value="EI">EI</Option>
                  <Option value="SUPER">Superannuation</Option><Option value="PAYG">PAYG</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="name" label="Rule Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="rate" label="Rate (%)" rules={[{ required: true }]}><InputNumber min={0} max={100} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="threshold" label="Threshold"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="applies_to" label="Applies To"><Select allowClear><Option value="payroll">Payroll</Option><Option value="sales">Sales</Option><Option value="payment">Payment</Option><Option value="employer">Employer</Option><Option value="corporate">Corporate</Option></Select></Form.Item></Col>
          </Row>
          <Form.Item name="exempt_categories" label="Exempt Categories (comma-separated)"><Input placeholder="e.g. food, books, exports" /></Form.Item>
          <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="Tax Calculator" visible={calcVisible} onCancel={() => { setCalcVisible(false); setCalcResult(null); }} footer={null} width={500}>
        <Form form={calcForm} layout="vertical">
          <Row gutter={16}>
            <Col span={8}><Form.Item name="jurisdiction" label="Jurisdiction"><Select>{jurisdictions.map(j => <Option key={j} value={j}>{j}</Option>)}</Select></Form.Item></Col>
            <Col span={8}><Form.Item name="tax_type" label="Tax Type"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="amount" label="Amount"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Button type="primary" onClick={handleCalculate}>Calculate</Button>
        </Form>
        {calcResult && (
          <div style={{ marginTop: 16 }}>
            <Divider />
            <Statistic title="Tax Amount" value={calcResult.tax} prefix="$" precision={2} />
            <p style={{ marginTop: 8, color: '#666' }}>{calcResult.details}</p>
          </div>
        )}
      </Modal>
    </Card>
  );
};

export default JurisdictionTax;
