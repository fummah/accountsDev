import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, Space, message, Tag, Row, Col, Statistic, Drawer, Popconfirm, Progress, Tooltip, DatePicker } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, SearchOutlined, ReloadOutlined, LinkOutlined, DollarOutlined, ClockCircleOutlined, BarChartOutlined, FileTextOutlined, FileDoneOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';

const { Option } = Select;

const STATUS_COLORS = { active: 'green', on_hold: 'orange', completed: 'blue', cancelled: 'red' };

const ProjectsCenter = () => {
  const { symbol: cSym } = useCurrency();
  const history = useHistory();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [links, setLinks] = useState([]);
  const [profit, setProfit] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [form] = Form.useForm();
  const [linkForm] = Form.useForm();
  const [timesheetForm] = Form.useForm();
  const [detailTab, setDetailTab] = useState('1');
  const [timesheets, setTimesheets] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [projectInvoices, setProjectInvoices] = useState([]);
  const [projectQuotes, setProjectQuotes] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [quotesLoading, setQuotesLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, custRes] = await Promise.all([
        window.electronAPI.getProjects(),
        window.electronAPI.getAllCustomers?.().catch(() => null),
      ]);
      setRows(Array.isArray(list) ? list : []);
      const custList = Array.isArray(custRes) ? custRes : (custRes?.all || custRes?.data || []);
      setCustomers(Array.isArray(custList) ? custList : []);
    } catch (e) {
      message.error('Failed to load projects');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== 'all') list = list.filter(r => r.status === statusFilter);
    const q = search.toLowerCase().trim();
    if (q) list = list.filter(r => (r.name || '').toLowerCase().includes(q) || (r.code || '').toLowerCase().includes(q));
    return list;
  }, [rows, search, statusFilter]);

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter(r => r.status === 'active').length;
    const budget = rows.reduce((s, r) => s + Number(r.budget || 0), 0);
    return { total, active, budget };
  }, [rows]);

  const openAdd = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ status: 'active' }); setModalOpen(true); };
  const openEdit = (record) => { setEditing(record); form.setFieldsValue(record); setModalOpen(true); };

  const loadProjectInvoices = async (customerId) => {
    if (!customerId) { setProjectInvoices([]); return; }
    setInvoicesLoading(true);
    try {
      let all = [];
      const res = await window.electronAPI.getInvoicesPaginated?.(1, 200, '', '');
      if (res && Array.isArray(res.data)) all = res.data;
      else if (Array.isArray(res)) all = res;
      else {
        const fallback = await window.electronAPI.getAllInvoices?.();
        all = Array.isArray(fallback) ? fallback : [];
      }
      const filtered = all.filter(inv => {
        const cid = inv.customer_id || inv.customer;
        return cid && Number(cid) === Number(customerId);
      });
      setProjectInvoices(filtered);
    } catch { setProjectInvoices([]); }
    setInvoicesLoading(false);
  };

  const loadProjectQuotes = async (customerId) => {
    if (!customerId) { setProjectQuotes([]); return; }
    setQuotesLoading(true);
    try {
      let all = [];
      const res = await window.electronAPI.getQuotesPaginated?.(1, 200, '', '');
      if (res && Array.isArray(res.data)) all = res.data;
      else if (Array.isArray(res)) all = res;
      else {
        const fallback = await window.electronAPI.getAllQuotes?.();
        all = Array.isArray(fallback) ? fallback : [];
      }
      const filtered = all.filter(q => {
        const cid = q.customer_id || q.customer;
        return cid && Number(cid) === Number(customerId);
      });
      setProjectQuotes(filtered);
    } catch { setProjectQuotes([]); }
    setQuotesLoading(false);
  };

  const openDetail = async (record) => {
    setSelectedProject(record);
    setDetailTab('1');
    setProjectInvoices([]);
    setProjectQuotes([]);
    try {
      const [l, prof, ts] = await Promise.all([
        window.electronAPI.listProjectLinks(record.id),
        window.electronAPI.getProjectProfitability(record.id),
        window.electronAPI.listTimesheetsByProject?.(record.id),
      ]);
      setLinks(Array.isArray(l) ? l : []);
      setProfit(prof || null);
      setTimesheets(Array.isArray(ts) ? ts : []);
    } catch (_) {
      setLinks([]);
      setProfit(null);
      setTimesheets([]);
    }
    if (record.customerId) {
      loadProjectInvoices(record.customerId);
      loadProjectQuotes(record.customerId);
    }
    linkForm.resetFields();
    linkForm.setFieldsValue({ direction: 'revenue', linkType: 'other' });
    timesheetForm.resetFields();
    setDetailOpen(true);
  };

  const handleSave = async () => {
    try {
      const vals = await form.validateFields();
      if (editing) {
        await window.electronAPI.updateProject({ id: editing.id, ...vals, description: vals.description || null, customerId: vals.customerId || null, budget: Number(vals.budget) || 0 });
        message.success('Project updated');
      } else {
        await window.electronAPI.createProject({ name: vals.name, code: vals.code || null, description: vals.description || null, customerId: vals.customerId || null, budget: Number(vals.budget) || 0, status: vals.status || 'active' });
        message.success('Project created');
      }
      setModalOpen(false);
      form.resetFields();
      load();
    } catch (e) { if (!e?.errorFields) message.error('Save failed'); }
  };

  const handleDelete = async (id) => {
    await window.electronAPI.deleteProject(id);
    message.success('Project deleted');
    load();
  };

  const addLink = async () => {
    try {
      const vals = await linkForm.validateFields();
      const res = await window.electronAPI.addProjectLink(selectedProject.id, vals.linkType, vals.linkedId ? Number(vals.linkedId) : 0, vals.direction, Number(vals.amount));
      if (res?.error) { message.error(res.error); return; }
      message.success('Link added');
      const [l, prof] = await Promise.all([
        window.electronAPI.listProjectLinks(selectedProject.id),
        window.electronAPI.getProjectProfitability(selectedProject.id),
      ]);
      setLinks(Array.isArray(l) ? l : []);
      setProfit(prof || null);
      linkForm.resetFields();
      linkForm.setFieldsValue({ direction: 'revenue', linkType: 'other' });
    } catch (e) { if (!e?.errorFields) message.error('Failed to add link'); }
  };

  const addTimesheet = async () => {
    try {
      const vals = await timesheetForm.validateFields();
      await window.electronAPI.logTime?.({
        projectId: selectedProject.id,
        description: vals.ts_description || '',
        hours: Number(vals.ts_hours) || 0,
        hourlyRate: Number(vals.ts_rate) || 0,
        workDate: vals.ts_date ? vals.ts_date.format('YYYY-MM-DD') : new Date().toISOString().slice(0, 10),
      });
      message.success('Timesheet entry added');
      const ts = await window.electronAPI.listTimesheetsByProject?.(selectedProject.id);
      setTimesheets(Array.isArray(ts) ? ts : []);
      timesheetForm.resetFields();
    } catch (e) { if (!e?.errorFields) message.error('Failed to add timesheet entry'); }
  };

  const tsColumns = [
    { title: 'Date', dataIndex: 'workDate', key: 'workDate', render: v => v ? new Date(v).toLocaleDateString() : '-' },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    { title: 'Hours', dataIndex: 'hours', key: 'hours', render: v => Number(v || 0).toFixed(1) },
    { title: 'Rate', dataIndex: 'hourlyRate', key: 'hourlyRate', render: v => `${cSym} ${Number(v || 0).toFixed(2)}` },
    { title: 'Total', key: 'total', render: (_, r) => `${cSym} ${(Number(r.hours || 0) * Number(r.hourlyRate || 0)).toFixed(2)}` },
  ];

  const profitVal = profit ? Number((profit.totalRevenue || 0) - (profit.totalExpense || 0)) : 0;
  const budgetUsed = selectedProject && profit ? (Number(profit.totalExpense || 0) / Math.max(Number(selectedProject.budget || 1), 1)) * 100 : 0;

  const invoiceColumns = [
    { title: '#', dataIndex: 'number', key: 'number', width: 100, render: (v, r) => <Button type="link" size="small" style={{ padding: 0 }} onClick={() => history.push(`/main/customers/invoices/edit/${r.id}`)}>{v || `INV-${r.id}`}</Button> },
    { title: 'Date', dataIndex: 'start_date', key: 'start_date', width: 100, render: v => v ? moment(v).format('DD MMM YYYY') : '-' },
    { title: 'Due', dataIndex: 'last_date', key: 'last_date', width: 100, render: v => v ? moment(v).format('DD MMM YYYY') : '-' },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100, render: v => {
      const colors = { Paid: 'green', Sent: 'blue', Draft: 'default', Overdue: 'red', Pending: 'orange', Cancelled: 'red', 'Partially Paid': 'orange', Unpaid: 'volcano' };
      return <Tag color={colors[v] || 'default'}>{v || 'Draft'}</Tag>;
    }},
    { title: 'Total', key: 'total', width: 100, align: 'right', render: (_, r) => {
      const sub = Number(r.subtotal || r.total || 0);
      return <strong>{cSym} {sub.toFixed(2)}</strong>;
    }},
    { title: '', key: 'action', width: 50, render: (_, r) => <Button size="small" icon={<EditOutlined />} onClick={() => history.push(`/main/customers/invoices/edit/${r.id}`)} /> },
  ];

  const quoteColumns = [
    { title: '#', dataIndex: 'number', key: 'number', width: 100, render: (v, r) => <Button type="link" size="small" style={{ padding: 0 }} onClick={() => history.push(`/main/customers/quotes/edit/${r.id}`)}>{v || `QT-${r.id}`}</Button> },
    { title: 'Date', dataIndex: 'start_date', key: 'start_date', width: 100, render: v => v ? moment(v).format('DD MMM YYYY') : '-' },
    { title: 'Expiry', dataIndex: 'last_date', key: 'last_date', width: 100, render: v => v ? moment(v).format('DD MMM YYYY') : '-' },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100, render: v => {
      const colors = { Open: 'blue', Sent: 'blue', Draft: 'default', Accepted: 'green', Declined: 'red', Expired: 'orange', Invoiced: 'cyan', Cancelled: 'red' };
      return <Tag color={colors[v] || 'default'}>{v || 'Open'}</Tag>;
    }},
    { title: 'Total', key: 'total', width: 100, align: 'right', render: (_, r) => {
      const sub = Number(r.subtotal || r.total || 0);
      return <strong>{cSym} {sub.toFixed(2)}</strong>;
    }},
    { title: '', key: 'action', width: 50, render: (_, r) => <Button size="small" icon={<EditOutlined />} onClick={() => history.push(`/main/customers/quotes/edit/${r.id}`)} /> },
  ];

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Name', dataIndex: 'name', key: 'name', sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      render: (v, r) => <Button type="link" style={{ padding: 0, fontWeight: 600 }} onClick={() => openDetail(r)}>{v}</Button> },
    { title: 'Code', dataIndex: 'code', key: 'code', render: v => v || '-' },
    { title: 'Customer', dataIndex: 'customerId', key: 'customerId', width: 150, render: v => {
      if (!v) return <Tag>No Customer</Tag>;
      const c = customers.find(cu => cu.id === v);
      return c ? (c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || `#${v}`) : `#${v}`;
    }},
    { title: 'Budget', dataIndex: 'budget', key: 'budget', sorter: (a, b) => Number(a.budget || 0) - Number(b.budget || 0),
      render: v => <strong>{cSym} {Number(v || 0).toFixed(2)}</strong> },
    { title: 'Status', dataIndex: 'status', key: 'status',
      render: v => <Tag color={STATUS_COLORS[v] || 'default'}>{(v || 'active').replace('_', ' ').toUpperCase()}</Tag> },
    { title: 'Created', dataIndex: 'createdAt', key: 'createdAt', render: v => v ? new Date(v).toLocaleDateString() : '-' },
    {
      title: 'Actions', key: 'actions', width: 160,
      render: (_, r) => (
        <Space size="small">
          <Tooltip title="View"><Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)} /></Tooltip>
          <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          <Popconfirm title="Delete project?" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    },
  ];

  const linkColumns = [
    { title: 'Type', dataIndex: 'linkType', key: 'linkType', render: v => <Tag>{v}</Tag> },
    { title: 'Direction', dataIndex: 'direction', key: 'direction',
      render: v => <Tag color={v === 'revenue' ? 'green' : 'red'}>{v}</Tag> },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: v => `${cSym} ${Number(v || 0).toFixed(2)}` },
    { title: 'Linked ID', dataIndex: 'linkedId', key: 'linkedId', render: v => v || '-' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card title={<span style={{ fontSize: 18, fontWeight: 600 }}>Project Center</span>}
        extra={<Space><Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button><Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>New Project</Button></Space>}>

        <Row gutter={16} style={{ marginBottom: 16, flexDirection: 'row', flexWrap: 'wrap' }}>
          <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Total Projects" value={stats.total} /></Card></Col>
          <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Active" value={stats.active} valueStyle={{ color: '#3f8600' }} /></Card></Col>
          <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Total Budget" value={stats.budget} prefix={cSym} precision={2} /></Card></Col>
        </Row>

        <Space style={{ marginBottom: 16 }} wrap>
          <Input.Search allowClear placeholder="Search projects..." prefix={<SearchOutlined />}
            onSearch={v => setSearch(v)} onChange={e => { if (!e.target.value) setSearch(''); }} style={{ width: 260 }} />
          <Select value={statusFilter} onChange={v => setStatusFilter(v)} style={{ width: 150 }}>
            <Option value="all">All Statuses</Option>
            <Option value="active">Active</Option>
            <Option value="on_hold">On Hold</Option>
            <Option value="completed">Completed</Option>
            <Option value="cancelled">Cancelled</Option>
          </Select>
        </Space>

        <Table columns={columns} dataSource={filtered} loading={loading} rowKey="id"
          pagination={{ pageSize: 15, showSizeChanger: true, showTotal: t => `${t} projects` }} size="middle" />
      </Card>

      {/* Create/Edit Modal */}
      <Modal title={editing ? 'Edit Project' : 'New Project'} visible={modalOpen}
        onCancel={() => setModalOpen(false)} onOk={handleSave} okText="Save" destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Project Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. Website Redesign" />
          </Form.Item>
          <Form.Item name="description" label="Project Description">
            <Input.TextArea rows={3} placeholder="Describe the project scope, objectives, deliverables..." />
          </Form.Item>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}>
              <Form.Item name="code" label="Project Code"><Input placeholder="e.g. PRJ-001" /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="budget" label="Budget (R)"><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item>
            </Col>
          </Row>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}>
              <Form.Item name="status" label="Status" initialValue="active">
                <Select>
                  <Option value="active">Active</Option>
                  <Option value="on_hold">On Hold</Option>
                  <Option value="completed">Completed</Option>
                  <Option value="cancelled">Cancelled</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="customerId" label="Customer (for invoicing)">
                <Select allowClear showSearch optionFilterProp="children" placeholder="Select customer">
                  {customers.map(c => <Option key={c.id} value={c.id}>{c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || `Customer #${c.id}`}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Project Detail Drawer */}
      <Drawer title={selectedProject ? `Project: ${selectedProject.name}` : 'Project Details'}
        width={640} visible={detailOpen} onClose={() => { setDetailOpen(false); setSelectedProject(null); }}
        closable={true} maskClosable={true} destroyOnClose={true}
        headerStyle={{ display: 'flex', alignItems: 'center' }}>
        {selectedProject && (
          <>
            <Row gutter={16} style={{ marginBottom: 16, flexDirection: 'row', flexWrap: 'wrap' }}>
              <Col span={8}><Statistic title="Revenue" value={Number(profit?.totalRevenue || 0)} prefix={cSym} precision={2} valueStyle={{ color: '#3f8600' }} /></Col>
              <Col span={8}><Statistic title="Expense" value={Number(profit?.totalExpense || 0)} prefix={cSym} precision={2} valueStyle={{ color: '#cf1322' }} /></Col>
              <Col span={8}><Statistic title="Profit" value={profitVal} prefix={cSym} precision={2} valueStyle={{ color: profitVal >= 0 ? '#3f8600' : '#cf1322' }} /></Col>
            </Row>
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 4 }}>Budget Utilisation</div>
              <Progress percent={Math.min(Math.round(budgetUsed), 100)} status={budgetUsed > 100 ? 'exception' : 'active'}
                format={p => `${p}% of ${cSym} ${Number(selectedProject.budget || 0).toFixed(0)}`} />
            </div>

            {/* Manual tab buttons - replaces antd Tabs for reliability */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '2px solid #f0f0f0', paddingBottom: 12, flexWrap: 'wrap' }}>
              {[
                { key: '1', label: 'Financial Links', icon: <LinkOutlined /> },
                { key: '2', label: 'Timesheets', icon: <ClockCircleOutlined /> },
                { key: '4', label: `Invoices (${projectInvoices.length})`, icon: <FileTextOutlined /> },
                { key: '5', label: `Quotes (${projectQuotes.length})`, icon: <FileDoneOutlined /> },
                { key: '3', label: 'Details', icon: <EyeOutlined /> },
              ].map(t => (
                <Button key={t.key} type={detailTab === t.key ? 'primary' : 'default'} size="small" icon={t.icon} onClick={() => setDetailTab(t.key)}>{t.label}</Button>
              ))}
            </div>

            {detailTab === '1' && (
              <div>
                <Table columns={linkColumns} dataSource={links} rowKey={(_, i) => i} size="small" pagination={false} style={{ marginBottom: 16 }} />
                <Card size="small" title="Add Financial Link">
                  <Form form={linkForm} layout="vertical">
                    <Row gutter={8} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                      <Col span={6}><Form.Item name="direction" label="Direction" initialValue="revenue"><Select><Option value="revenue">Revenue</Option><Option value="expense">Expense</Option></Select></Form.Item></Col>
                      <Col span={6}><Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Required' }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                      <Col span={6}><Form.Item name="linkType" label="Type" initialValue="other"><Select><Option value="transaction">Transaction</Option><Option value="invoice">Invoice</Option><Option value="expense">Expense</Option><Option value="other">Other</Option></Select></Form.Item></Col>
                      <Col span={4}><Form.Item name="linkedId" label="Linked ID"><Input /></Form.Item></Col>
                      <Col span={2} style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 24 }}><Button type="primary" icon={<LinkOutlined />} onClick={addLink}>Add</Button></Col>
                    </Row>
                  </Form>
                </Card>
              </div>
            )}

            {detailTab === '2' && (
              <div>
                <Table columns={tsColumns} dataSource={timesheets} rowKey={(r, i) => r.id || i} size="small" pagination={{ pageSize: 10 }} style={{ marginBottom: 16 }} />
                <Card size="small" title="Add Timesheet Entry">
                  <Form form={timesheetForm} layout="vertical">
                    <Row gutter={8} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                      <Col span={6}><Form.Item name="ts_date" label="Date"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
                      <Col span={8}><Form.Item name="ts_description" label="Description" rules={[{ required: true }]}><Input placeholder="Work description" /></Form.Item></Col>
                      <Col span={4}><Form.Item name="ts_hours" label="Hours" rules={[{ required: true }]}><InputNumber min={0} step={0.5} style={{ width: '100%' }} /></Form.Item></Col>
                      <Col span={4}><Form.Item name="ts_rate" label="Rate (R)" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                      <Col span={2} style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 24 }}><Button type="primary" icon={<ClockCircleOutlined />} onClick={addTimesheet}>Add</Button></Col>
                    </Row>
                  </Form>
                </Card>
              </div>
            )}

            {detailTab === '3' && (
              <div>
                <p><strong>Code:</strong> {selectedProject.code || '-'}</p>
                {selectedProject.description && <p><strong>Description:</strong> {selectedProject.description}</p>}
                <p><strong>Status:</strong> <Tag color={STATUS_COLORS[selectedProject.status]}>{(selectedProject.status || 'active').replace('_', ' ').toUpperCase()}</Tag></p>
                <p><strong>Customer:</strong> {selectedProject.customerId ? (() => { const c = customers.find(cu => cu.id === selectedProject.customerId); return c ? (c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || `#${selectedProject.customerId}`) : `#${selectedProject.customerId}`; })() : 'None'}</p>
                <p><strong>Budget:</strong> R {Number(selectedProject.budget || 0).toFixed(2)}</p>
                <p><strong>Created:</strong> {selectedProject.createdAt ? new Date(selectedProject.createdAt).toLocaleDateString() : '-'}</p>
                <Button type="link" icon={<BarChartOutlined />} onClick={() => { history.push('/main/projects/profitability'); }} style={{ padding: 0, marginTop: 8 }}>View Project Profitability Report</Button>
              </div>
            )}

            {detailTab === '4' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <strong>Invoices for this project's customer</strong>
                  <Button type="primary" size="small" icon={<PlusOutlined />}
                    disabled={!selectedProject.customerId}
                    onClick={() => history.push(`/main/customers/invoices/new?customer=${selectedProject.customerId}&project=${selectedProject.id}&projectName=${encodeURIComponent(selectedProject.name || '')}`)}
                  >New Invoice</Button>
                </div>
                {!selectedProject.customerId && (
                  <div style={{ padding: '16px 0', textAlign: 'center', color: '#999' }}>
                    <p>No customer assigned to this project.</p>
                    <p>Edit the project and assign a customer to create invoices.</p>
                    <Button size="small" icon={<EditOutlined />} onClick={() => { setDetailOpen(false); openEdit(selectedProject); }}>Edit Project</Button>
                  </div>
                )}
                {selectedProject.customerId && (
                  <Table columns={invoiceColumns} dataSource={projectInvoices} rowKey="id" size="small"
                    loading={invoicesLoading} pagination={{ pageSize: 5, showTotal: t => `${t} invoices` }}
                    locale={{ emptyText: 'No invoices yet for this customer' }}
                    summary={() => projectInvoices.length > 0 ? (
                      <Table.Summary.Row>
                        <Table.Summary.Cell colSpan={4}><strong>Total</strong></Table.Summary.Cell>
                        <Table.Summary.Cell align="right"><strong>{cSym} {projectInvoices.reduce((s, inv) => s + Number(inv.subtotal || inv.total || 0), 0).toFixed(2)}</strong></Table.Summary.Cell>
                        <Table.Summary.Cell />
                      </Table.Summary.Row>
                    ) : null}
                  />
                )}
              </div>
            )}

            {detailTab === '5' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <strong>Quotes for this project's customer</strong>
                  <Button type="primary" size="small" icon={<PlusOutlined />}
                    disabled={!selectedProject.customerId}
                    onClick={() => history.push(`/main/customers/quotes/new?customer=${selectedProject.customerId}&project=${selectedProject.id}&projectName=${encodeURIComponent(selectedProject.name || '')}`)}
                  >New Quote</Button>
                </div>
                {!selectedProject.customerId && (
                  <div style={{ padding: '16px 0', textAlign: 'center', color: '#999' }}>
                    <p>No customer assigned to this project.</p>
                    <p>Edit the project and assign a customer to create quotes.</p>
                    <Button size="small" icon={<EditOutlined />} onClick={() => { setDetailOpen(false); openEdit(selectedProject); }}>Edit Project</Button>
                  </div>
                )}
                {selectedProject.customerId && (
                  <Table columns={quoteColumns} dataSource={projectQuotes} rowKey="id" size="small"
                    loading={quotesLoading} pagination={{ pageSize: 5, showTotal: t => `${t} quotes` }}
                    locale={{ emptyText: 'No quotes yet for this customer' }}
                    summary={() => projectQuotes.length > 0 ? (
                      <Table.Summary.Row>
                        <Table.Summary.Cell colSpan={4}><strong>Total</strong></Table.Summary.Cell>
                        <Table.Summary.Cell align="right"><strong>{cSym} {projectQuotes.reduce((s, q) => s + Number(q.subtotal || q.total || 0), 0).toFixed(2)}</strong></Table.Summary.Cell>
                        <Table.Summary.Cell />
                      </Table.Summary.Row>
                    ) : null}
                  />
                )}
              </div>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
};

export default ProjectsCenter;


