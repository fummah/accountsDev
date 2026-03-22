import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Row, Col, Progress, Statistic, message, Popconfirm, Space } from 'antd';
import { PlusOutlined, DeleteOutlined, BarChartOutlined, ReloadOutlined } from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const BudgetVsActual = () => {
  const [budgets, setBudgets] = useState([]);
  const [comparison, setComparison] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const b = await window.electronAPI.getBudgets?.();
      if (Array.isArray(b)) setBudgets(b);
      const p = await window.electronAPI.budgetPeriods?.();
      if (Array.isArray(p)) setPeriods(p);
    } catch {}
    setLoading(false);
  };

  const loadComparison = async (period) => {
    setLoading(true);
    try {
      const res = await window.electronAPI.budgetVsActual?.(period || undefined);
      if (Array.isArray(res)) setComparison(res);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { loadComparison(selectedPeriod); }, [selectedPeriod]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    const now = new Date();
    form.setFieldsValue({ period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` });
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({
      department: record.department,
      period: record.period,
      amount: record.amount,
      forecast: record.forecast,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await window.electronAPI.updateBudget?.(editing.id, values.department, values.period, values.amount, values.forecast);
        message.success('Budget updated');
      } else {
        await window.electronAPI.insertBudget?.(values.department, values.period, values.amount, values.forecast, null);
        message.success('Budget created');
      }
      setModalOpen(false);
      load();
      loadComparison(selectedPeriod);
    } catch {}
  };

  const handleDelete = async (id) => {
    await window.electronAPI.deleteBudget?.(id);
    message.success('Deleted');
    load();
    loadComparison(selectedPeriod);
  };

  const totalBudget = comparison.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const totalActual = comparison.reduce((s, c) => s + (Number(c.actual) || 0), 0);
  const totalVariance = totalBudget - totalActual;
  const utilizationPct = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;

  const chartData = comparison.map(c => ({
    name: c.department,
    Budget: Number(c.amount) || 0,
    Actual: Number(c.actual) || 0,
  }));

  const columns = [
    { title: 'Department / Category', dataIndex: 'department', key: 'department', sorter: (a, b) => a.department.localeCompare(b.department) },
    { title: 'Period', dataIndex: 'period', key: 'period', width: 100 },
    { title: 'Budget', dataIndex: 'amount', key: 'amount', width: 110, render: v => Number(v || 0).toFixed(2) },
    { title: 'Actual', dataIndex: 'actual', key: 'actual', width: 110, render: v => Number(v || 0).toFixed(2) },
    { title: 'Variance', dataIndex: 'variance', key: 'variance', width: 110, render: v => {
      const n = Number(v || 0);
      return <span style={{ color: n >= 0 ? '#52c41a' : '#f5222d', fontWeight: 600 }}>{n >= 0 ? '+' : ''}{n.toFixed(2)}</span>;
    }},
    { title: 'Var %', dataIndex: 'variancePct', key: 'variancePct', width: 80, render: v => {
      const n = Number(v || 0);
      return <Tag color={n >= 0 ? 'green' : 'red'}>{n.toFixed(1)}%</Tag>;
    }},
    { title: 'Used', key: 'used', width: 120, render: (_, r) => {
      const pct = r.amount > 0 ? Math.min(100, (r.actual / r.amount) * 100) : 0;
      return <Progress percent={Math.round(pct)} size="small" status={pct > 100 ? 'exception' : pct > 80 ? 'active' : 'normal'} />;
    }},
    { title: 'Status', dataIndex: 'status', key: 'status', width: 80, render: v => <Tag color={v === 'under' ? 'green' : 'red'}>{v === 'under' ? 'Under Budget' : 'Over Budget'}</Tag> },
    { title: '', key: 'actions', width: 100, render: (_, r) => (
      <Space size={4}>
        <Button size="small" onClick={() => openEdit(r)}>Edit</Button>
        <Popconfirm title="Delete?" onConfirm={() => handleDelete(r.id)}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    )},
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2><BarChartOutlined /> Budget vs Actual</h2>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small"><Statistic title="Total Budget" value={totalBudget.toFixed(2)} prefix="R" /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="Total Actual" value={totalActual.toFixed(2)} prefix="R" /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="Variance" value={totalVariance.toFixed(2)} prefix="R"
            valueStyle={{ color: totalVariance >= 0 ? '#52c41a' : '#f5222d' }} /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="Budget Utilization" value={utilizationPct.toFixed(1)} suffix="%"
            valueStyle={{ color: utilizationPct > 100 ? '#f5222d' : utilizationPct > 80 ? '#faad14' : '#52c41a' }} /></Card>
        </Col>
      </Row>

      {chartData.length > 0 && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="Budget" fill="#1890ff" />
              <Bar dataKey="Actual" fill="#f5222d" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card
        title="Budget Line Items"
        size="small"
        extra={
          <Space>
            <Select
              placeholder="Filter period"
              value={selectedPeriod || undefined}
              onChange={v => setSelectedPeriod(v || '')}
              allowClear
              style={{ width: 150 }}
            >
              {periods.map(p => <Select.Option key={p} value={p}>{p}</Select.Option>)}
            </Select>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => { load(); loadComparison(selectedPeriod); }}>Refresh</Button>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>Add Budget</Button>
          </Space>
        }
      >
        <Table
          dataSource={comparison}
          columns={columns}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        title={editing ? 'Edit Budget' : 'New Budget Line'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText={editing ? 'Update' : 'Create'}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="department" label="Department / Category" rules={[{ required: true }]}>
            <Input placeholder="e.g. Marketing, Office Supplies, Rent" />
          </Form.Item>
          <Form.Item name="period" label="Period (YYYY-MM)" rules={[{ required: true }]}>
            <Input placeholder="2025-01" />
          </Form.Item>
          <Form.Item name="amount" label="Budget Amount" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} step={100} prefix="R" />
          </Form.Item>
          <Form.Item name="forecast" label="Forecast Amount">
            <InputNumber style={{ width: '100%' }} min={0} step={100} prefix="R" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default BudgetVsActual;
