import React, { useEffect, useMemo, useState } from 'react';
import { Card, Space, Typography, Input, Button, Upload, Table, message, Select, Form } from 'antd';

const { Title, Text } = Typography;

const PayrollSettings = () => {
  const [formula, setFormula] = useState('');
  const [country, setCountry] = useState('DEFAULT');
  const [taxRows, setTaxRows] = useState([]);
  const [deductions, setDeductions] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadAll = async () => {
    try {
      const f = await window.electronAPI.payrollFormulaGet();
      if (f && f.formula) setFormula(f.formula);
      const t = await window.electronAPI.payrollTaxList({ country });
      if (Array.isArray(t)) setTaxRows(t);
      const d = await window.electronAPI.payrollDeductionsGet();
      if (Array.isArray(d)) setDeductions(d);
    } catch (e) {
      message.error('Failed to load payroll settings');
    }
  };

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { (async () => { try { const t = await window.electronAPI.payrollTaxList({ country }); setTaxRows(Array.isArray(t)?t:[]);} catch{} })(); }, [country]);

  const saveFormula = async () => {
    try {
      setLoading(true);
      const res = await window.electronAPI.payrollFormulaSave({ name: 'Custom', formula_js: formula, active: true });
      if (res && res.error) throw new Error(res.error);
      message.success('Formula saved');
    } catch (e) {
      message.error(e?.message || 'Failed to save formula');
    } finally {
      setLoading(false);
    }
  };

  const beforeUploadCsv = async (file) => {
    try {
      const text = await file.text();
      const res = await window.electronAPI.payrollTaxImport({ csvText: text, country });
      if (res && res.error) throw new Error(res.error);
      message.success('Tax tables imported');
      const t = await window.electronAPI.payrollTaxList({ country });
      setTaxRows(Array.isArray(t) ? t : []);
    } catch (e) {
      message.error(e?.message || 'Failed to import tax CSV');
    }
    return false; // prevent upload
  };

  const saveDeductions = async () => {
    try {
      setLoading(true);
      const items = deductions.map(d => ({ name: d.name, type: d.type, rate: Number(d.rate)||0, active: d.active ? true : false }));
      const res = await window.electronAPI.payrollDeductionsSave(items);
      if (res && res.error) throw new Error(res.error);
      message.success('Deductions saved');
    } catch (e) {
      message.error(e?.message || 'Failed to save deductions');
    } finally {
      setLoading(false);
    }
  };

  const columnsTax = [
    { title: 'Effective', dataIndex: 'effective_date', key: 'effective_date' },
    { title: 'Min', dataIndex: 'min_amount', key: 'min_amount' },
    { title: 'Max', dataIndex: 'max_amount', key: 'max_amount', render: v => (v==null||v===''?'∞':v) },
    { title: 'Rate %', dataIndex: 'rate', key: 'rate' },
    { title: 'Fixed', dataIndex: 'fixed_amount', key: 'fixed_amount' },
  ];

  const columnsDed = [
    { title: 'Name', dataIndex: 'name', key: 'name', render: (v, r, i) => <Input value={v} onChange={e => setDeductions(prev => prev.map((x, idx) => idx===i ? { ...x, name: e.target.value } : x))} /> },
    { title: 'Type', dataIndex: 'type', key: 'type', render: (v, r, i) => <Select value={v} onChange={val => setDeductions(prev => prev.map((x, idx) => idx===i ? { ...x, type: val } : x))} style={{ width: 120 }} options={[{value:'percent',label:'Percent'},{value:'fixed',label:'Fixed'}]} /> },
    { title: 'Rate', dataIndex: 'rate', key: 'rate', render: (v, r, i) => <Input type="number" step="0.01" value={v} onChange={e => setDeductions(prev => prev.map((x, idx) => idx===i ? { ...x, rate: e.target.value } : x))} style={{ width: 120 }} /> },
    { title: 'Active', dataIndex: 'active', key: 'active', render: (v, r, i) => <Select value={v?1:0} onChange={val => setDeductions(prev => prev.map((x, idx) => idx===i ? { ...x, active: !!val } : x))} style={{ width: 100 }} options={[{value:1,label:'Yes'},{value:0,label:'No'}]} /> },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Title level={4}>Payroll Settings</Title>

        <Card title="Custom Formula">
          <Text type="secondary">JavaScript function body (arrow fn). Receives regularHours, overtimeHours, rate, grossBase, employeeId, date, country, helpers.</Text>
          <Input.TextArea rows={10} value={formula} onChange={e => setFormula(e.target.value)} style={{ marginTop: 8 }} />
          <div style={{ marginTop: 8 }}>
            <Button type="primary" onClick={saveFormula} loading={loading}>Save Formula</Button>
          </div>
        </Card>

        <Card title="Tax Tables">
          <Space style={{ marginBottom: 8 }}>
            <Text>Country:</Text>
            <Select value={country} onChange={setCountry} style={{ width: 160 }} options={[{value:'DEFAULT',label:'DEFAULT'}]} />
            <Upload beforeUpload={beforeUploadCsv} showUploadList={false} accept=".csv">
              <Button>Import CSV</Button>
            </Upload>
          </Space>
          <Table rowKey={(r,i)=>i} columns={columnsTax} dataSource={taxRows} size="small" />
        </Card>

        <Card title="Deductions (Pension/Insurance)">
          <div style={{ marginBottom: 8 }}>
            <Button onClick={() => setDeductions(prev => [...prev, { name: '', type: 'percent', rate: 0, active: true }])}>Add</Button>
            <Button style={{ marginLeft: 8 }} type="primary" onClick={saveDeductions} loading={loading}>Save</Button>
          </div>
          <Table rowKey={(r,i)=>i} columns={columnsDed} dataSource={deductions} pagination={false} size="small" />
        </Card>
      </Space>
    </div>
  );
};

export default PayrollSettings;
