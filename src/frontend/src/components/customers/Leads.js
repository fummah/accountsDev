import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, Select, message,
  Drawer, Tabs, Tag, Badge, Progress, Row, Col, Statistic, Popconfirm,
  Timeline, Divider, Empty, Alert, InputNumber, DatePicker, Tooltip,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, UserAddOutlined,
  PhoneOutlined, MailOutlined, GlobalOutlined, EnvironmentOutlined,
  ClockCircleOutlined, CheckCircleOutlined, WarningOutlined,
  CalendarOutlined, BarChartOutlined, FunnelPlotOutlined, TeamOutlined,
  TrophyOutlined, ReloadOutlined,
} from '@ant-design/icons';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer,
} from 'recharts';
import moment from 'moment';

const { Option } = Select;
const { TextArea } = Input;
const { TabPane } = Tabs;

const STAGES = [
  { key: 'new',         label: 'New Lead',      color: '#8c8c8c' },
  { key: 'contacted',   label: 'Contacted',     color: '#1890ff' },
  { key: 'qualified',   label: 'Qualified',     color: '#722ed1' },
  { key: 'proposal',    label: 'Proposal Sent', color: '#fa8c16' },
  { key: 'negotiation', label: 'Negotiation',   color: '#eb2f96' },
  { key: 'won',         label: 'Won',           color: '#52c41a' },
  { key: 'lost',        label: 'Lost',          color: '#f5222d' },
];
const SOURCES    = ['Website','Referral','Cold Call','Social Media','Email Campaign','Trade Show','Advertisement','Partner','Other'];
const PRIORITIES = [
  { key: 'high',   label: 'High',   color: '#f5222d' },
  { key: 'medium', label: 'Medium', color: '#fa8c16' },
  { key: 'low',    label: 'Low',    color: '#52c41a' },
];
const ACT_TYPES  = ['call','meeting','email','task','note'];
const ACT_ICONS  = { call: '📞', meeting: '🤝', email: '📧', task: '✅', note: '📝' };
const PIE_COLORS = ['#1890ff','#52c41a','#fa8c16','#f5222d','#722ed1','#eb2f96','#13c2c2','#faad14'];

const stageMap = Object.fromEntries(STAGES.map(s => [s.key, s]));
const prioMap  = Object.fromEntries(PRIORITIES.map(p => [p.key, p]));
const fmtMoney = v => `R ${Number(v || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Leads = () => {
  const [activeTab, setActiveTab]             = useState('pipeline');
  const [leads, setLeads]                     = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [filters, setFilters]                 = useState({});
  const [pipelineStats, setPipelineStats]     = useState(null);
  const [reports, setReports]                 = useState(null);
  const [overdueActs, setOverdueActs]         = useState([]);
  const [upcomingActs, setUpcomingActs]       = useState([]);

  const [drawerLead, setDrawerLead]           = useState(null);
  const [drawerTab, setDrawerTab]             = useState('info');
  const [drawerActs, setDrawerActs]           = useState([]);
  const [drawerLoading, setDrawerLoading]     = useState(false);

  const [leadModalOpen, setLeadModalOpen]     = useState(false);
  const [editingLead, setEditingLead]         = useState(null);
  const [actModalOpen, setActModalOpen]       = useState(false);
  const [editingAct, setEditingAct]           = useState(null);
  const [convertTarget, setConvertTarget]     = useState(null);
  const [quoteModalOpen, setQuoteModalOpen]   = useState(false);
  const [quoteLeadId, setQuoteLeadId]         = useState(null);
  const [leadQuotes, setLeadQuotes]           = useState([]);
  const [quoteLines, setQuoteLines]           = useState([{ description:'', quantity:1, rate:0, amount:0 }]);
  const [convertThenQuote, setConvertThenQuote] = useState(false);

  const [draggedLead, setDraggedLead]         = useState(null);
  const [dragOverStage, setDragOverStage]     = useState(null);
  const [selectedKeys, setSelectedKeys]       = useState([]);
  const [employees, setEmployees]             = useState([]);
  const [empModalOpen, setEmpModalOpen]       = useState(false);
  const [products, setProducts]               = useState([]);

  const [leadForm]  = Form.useForm();
  const [actForm]   = Form.useForm();
  const [quoteForm] = Form.useForm();
  const [empForm]   = Form.useForm();

  // ── Data ─────────────────────────────────────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.crmListLeads(filters);
      setLeads(Array.isArray(data) ? data : []);
    } catch (_) { message.error('Failed to load leads'); }
    finally { setLoading(false); }
  }, [filters]);

  const fetchMeta = useCallback(async () => {
    try {
      const [stats, rpts, over, up] = await Promise.all([
        window.electronAPI.crmPipelineStats(),
        window.electronAPI.crmReports(),
        window.electronAPI.crmOverdueActivities(),
        window.electronAPI.crmUpcomingActivities(7),
      ]);
      if (stats && !stats.error) setPipelineStats(stats);
      if (rpts  && !rpts.error)  setReports(rpts);
      if (Array.isArray(over)) setOverdueActs(over);
      if (Array.isArray(up))   setUpcomingActs(up);
    } catch (_) {}
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await window.electronAPI.getEmployees?.();
      // Backend returns { success, data: [...] } not a plain array
      if (res?.data && Array.isArray(res.data)) setEmployees(res.data);
      else if (Array.isArray(res)) setEmployees(res);
      else setEmployees([]);
    } catch {}
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      const p = await window.electronAPI.getAllProducts?.();
      setProducts(Array.isArray(p) ? p : (p?.all || []));
    } catch {}
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);
  useEffect(() => { fetchMeta(); },  [fetchMeta]);
  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);
  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const fetchDrawerActs = async (leadId) => {
    setDrawerLoading(true);
    try {
      const data = await window.electronAPI.crmListActivities({ leadId });
      setDrawerActs(Array.isArray(data) ? data : []);
    } finally { setDrawerLoading(false); }
  };

  const openDrawer = async (lead) => {
    setDrawerLead(lead); setDrawerTab('info');
    await Promise.all([fetchDrawerActs(lead.id), fetchLeadQuotes(lead.id)]);
  };

  const refresh = () => { fetchLeads(); fetchMeta(); };

  // ── Lead CRUD ────────────────────────────────────────────────────────────────
  const openNewLead = () => {
    setEditingLead(null); leadForm.resetFields(); setLeadModalOpen(true);
  };
  const openEditLead = (lead) => {
    setEditingLead(lead);
    leadForm.setFieldsValue({
      ...lead,
      tags: lead.tags ? (typeof lead.tags === 'string' ? JSON.parse(lead.tags) : lead.tags) : [],
      expected_close_date: lead.expected_close_date ? moment(lead.expected_close_date) : null,
    });
    setLeadModalOpen(true);
  };
  const handleSaveLead = async () => {
    try {
      const v = await leadForm.validateFields();
      const payload = { ...v, tags: v.tags || [], expected_close_date: v.expected_close_date ? v.expected_close_date.format('YYYY-MM-DD') : null };
      if (editingLead) { await window.electronAPI.crmUpdateLead({ ...editingLead, ...payload }); message.success('Lead updated'); }
      else             { await window.electronAPI.crmCreateLead(payload); message.success('Lead created'); }
      setLeadModalOpen(false); refresh();
    } catch (e) { if (!e?.errorFields) message.error(e?.message || 'Save failed'); }
  };
  const handleDeleteLead = async (id) => {
    const res = await window.electronAPI.crmDeleteLead(id);
    if (res?.success) { message.success('Lead deleted'); refresh(); }
    else message.error(res?.error || 'Delete failed');
  };

  const handleAddEmployee = async () => {
    try {
      const vals = await empForm.validateFields();
      await window.electronAPI.insertEmployee?.({
        first_name: vals.first_name || '',
        last_name: vals.last_name || '',
        email: vals.email || '',
        phone: vals.phone || '',
        department: vals.department || '',
        position: vals.position || '',
      });
      message.success('Employee added');
      setEmpModalOpen(false);
      empForm.resetFields();
      await fetchEmployees();
    } catch (e) { if (!e?.errorFields) message.error('Failed to add employee'); }
  };

  // ── Kanban drag-drop ─────────────────────────────────────────────────────────
  const handleDrop = async (stage) => {
    if (!draggedLead || draggedLead.pipeline_stage === stage) { setDraggedLead(null); setDragOverStage(null); return; }
    await window.electronAPI.crmUpdateLeadStage(draggedLead.id, stage);
    setDraggedLead(null); setDragOverStage(null); refresh();
  };

  // ── Activity CRUD ────────────────────────────────────────────────────────────
  const openNewActivity = (leadId) => {
    setEditingAct({ leadId }); actForm.resetFields();
    actForm.setFieldsValue({ type: 'call', status: 'open' }); setActModalOpen(true);
  };
  const handleSaveActivity = async () => {
    try {
      const v = await actForm.validateFields();
      const payload = { ...editingAct, ...v, dueDate: v.dueDate ? v.dueDate.toISOString() : null };
      if (payload.id) await window.electronAPI.crmUpdateActivity(payload);
      else            await window.electronAPI.crmCreateActivity(payload);
      message.success('Activity saved'); setActModalOpen(false);
      if (drawerLead) fetchDrawerActs(drawerLead.id);
      fetchMeta();
    } catch (e) { if (!e?.errorFields) message.error('Save failed'); }
  };
  const completeActivity = async (act) => {
    await window.electronAPI.crmUpdateActivity({ ...act, status: 'done' });
    if (drawerLead) fetchDrawerActs(drawerLead.id); fetchMeta();
  };

  // ── Quote flow ─────────────────────────────────────────────────────────────
  const openQuoteModal = async (lead) => {
    setQuoteLeadId(lead.id);
    setQuoteLines([{ description:'', quantity:1, rate:0, amount:0 }]);
    quoteForm.resetFields();
    quoteForm.setFieldsValue({
      q_status: 'Draft',
      q_email: lead.email || '',
      q_billing: lead.address || '',
      q_start: moment(),
      q_end: moment().add(30,'days'),
      q_vat: 0,
      q_message: '',
    });
    setQuoteModalOpen(true);
  };

  const fetchLeadQuotes = async (leadId) => {
    try {
      const data = await window.electronAPI.crmGetLeadQuotes(leadId);
      setLeadQuotes(Array.isArray(data) ? data : []);
    } catch (_) { setLeadQuotes([]); }
  };

  const updateLine = (idx, field, val) => {
    setQuoteLines(prev => {
      const next = prev.map((l, i) => {
        if (i !== idx) return l;
        const updated = { ...l, [field]: val };
        if (field === 'quantity' || field === 'rate') {
          updated.amount = Number(updated.quantity || 1) * Number(updated.rate || 0);
        }
        return updated;
      });
      return next;
    });
  };

  const selectProduct = (idx, productId) => {
    const prod = products.find(p => p.id === productId);
    if (prod) {
      setQuoteLines(prev => prev.map((l, i) => {
        if (i !== idx) return l;
        const rate = Number(prod.selling_price || prod.price || 0);
        return { ...l, description: prod.name || prod.description, rate, amount: (l.quantity || 1) * rate, product_id: productId };
      }));
    }
  };

  const handleCreateQuote = async () => {
    try {
      const v = await quoteForm.validateFields(['q_status','q_email','q_start']);
      const filledLines = quoteLines.filter(l => l.description.trim());
      if (!filledLines.length) { message.warning('Add at least one line item'); return; }
      const allVals = quoteForm.getFieldsValue();
      const quoteData = {
        status: allVals.q_status || 'Draft',
        customer_email: allVals.q_email || '',
        billing_address: allVals.q_billing || '',
        start_date: allVals.q_start ? allVals.q_start.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD'),
        last_date: allVals.q_end   ? allVals.q_end.format('YYYY-MM-DD')   : '',
        vat: Number(allVals.q_vat || 0),
        message: allVals.q_message || '',
      };
      const res = await window.electronAPI.crmCreateQuoteForLead(quoteLeadId, quoteData, filledLines);
      if (res?.success) {
        message.success(`Quote ${res.quoteNumber} created successfully!`);
        setQuoteModalOpen(false);
        if (res.customerId && drawerLead?.id === quoteLeadId) {
          const updated = await window.electronAPI.crmGetLead(quoteLeadId);
          if (updated && !updated.error) setDrawerLead(updated);
        }
        fetchLeadQuotes(quoteLeadId);
        refresh();
      } else { message.error(res?.error || 'Quote creation failed'); }
    } catch (e) { if (!e?.errorFields) message.error('Failed to create quote'); }
  };

  // ── Conversion ───────────────────────────────────────────────────────────────
  const handleConvert = async () => {
    const res = await window.electronAPI.crmConvertLead(convertTarget.id, {});
    if (res?.success) {
      message.success('Converted to customer!');
      const target = convertTarget;
      const doQuote = convertThenQuote;
      setConvertTarget(null); setConvertThenQuote(false); refresh();
      if (drawerLead?.id === target.id) {
        const updated = await window.electronAPI.crmGetLead(target.id);
        if (updated && !updated.error) setDrawerLead(updated);
      }
      if (doQuote) { setTimeout(() => openQuoteModal({ ...target, id: target.id }), 400); }
    } else { message.error(res?.error || 'Conversion failed'); }
  };

  // ── Bulk ─────────────────────────────────────────────────────────────────────
  const handleBulkStage = async (stage) => {
    if (!selectedKeys.length) return;
    await window.electronAPI.crmBulkUpdateStage(selectedKeys, stage);
    message.success(`${selectedKeys.length} leads moved to ${stageMap[stage]?.label || stage}`);
    setSelectedKeys([]); refresh();
  };

  // ── Kanban grouping ──────────────────────────────────────────────────────────
  const byStage = useMemo(() => {
    const m = {}; STAGES.forEach(s => { m[s.key] = []; });
    leads.forEach(l => { const k = l.pipeline_stage; if (m[k]) m[k].push(l); else m['new'].push(l); });
    return m;
  }, [leads]);

  // ── Table columns ────────────────────────────────────────────────────────────
  const tableColumns = [
    { title: 'Name',    dataIndex: 'name',    key: 'name',
      render: (v, r) => <a style={{ fontWeight: 600 }} onClick={() => openDrawer(r)}>{v}</a> },
    { title: 'Company', dataIndex: 'company', key: 'company', render: v => v || '—' },
    { title: 'Value',   dataIndex: 'value',   key: 'value',   sorter: (a,b) => a.value - b.value,
      render: v => <span style={{ color:'#1890ff', fontWeight:500 }}>{fmtMoney(v)}</span> },
    { title: 'Stage',    dataIndex: 'pipeline_stage', key: 'stage',
      render: s => { const st = stageMap[s]; return <Tag color={st?.color}>{st?.label || s}</Tag>; } },
    { title: 'Priority', dataIndex: 'priority', key: 'priority',
      render: p => { const pr = prioMap[p]; return <Tag color={pr?.color}>{pr?.label || p}</Tag>; } },
    { title: 'Score', dataIndex: 'score', key: 'score', sorter: (a,b) => a.score - b.score,
      render: s => <Progress percent={s} size="small" style={{ width:80, margin:0 }} showInfo={false}
        strokeColor={s >= 70 ? '#52c41a' : s >= 40 ? '#fa8c16' : '#f5222d'} /> },
    { title: 'Source',    dataIndex: 'source',              key: 'source',    render: v => v || '—' },
    { title: 'Close Date',dataIndex: 'expected_close_date', key: 'close',
      render: d => d ? moment(d).format('DD/MM/YYYY') : '—' },
    { title: '', key: 'actions', width: 160, render: (_, r) => (
      <Space size={2}>
        <Button size="small" type="link" icon={<EditOutlined />}    onClick={() => openEditLead(r)} />
        <Button size="small" type="link"                            onClick={() => openDrawer(r)}>View</Button>
        {!r.converted_customer_id && (
          <Button size="small" type="link" icon={<UserAddOutlined />}
            onClick={() => setConvertTarget(r)}>Convert</Button>
        )}
        <Popconfirm title="Delete this lead?" onConfirm={() => handleDeleteLead(r.id)}>
          <Button size="small" type="link" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    )},
  ];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '0 4px' }}>
      {/* Stats Row */}
      {pipelineStats && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          {[
            { title: 'Total Leads',      value: pipelineStats.total,           prefix: <TeamOutlined />,   color: undefined },
            { title: 'Pipeline Value',   value: fmtMoney(pipelineStats.totalValue), color: '#1890ff' },
            { title: 'Won Revenue',      value: fmtMoney(pipelineStats.wonValue),   color: '#52c41a' },
            { title: 'Conversion Rate',  value: `${pipelineStats.conversionRate}%`, prefix: <TrophyOutlined />, color: pipelineStats.conversionRate >= 30 ? '#52c41a' : '#fa8c16' },
          ].map((s, i) => (
            <Col key={i} xs={12} sm={6} style={{ marginBottom: 8 }}>
              <Card size="small" bodyStyle={{ padding: '12px 16px' }}>
                <Statistic title={s.title} value={s.value} prefix={s.prefix} valueStyle={{ fontSize: 16, color: s.color }} />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {overdueActs.length > 0 && (
        <Alert type="warning" showIcon icon={<WarningOutlined />} style={{ marginBottom: 12 }}
          message={`${overdueActs.length} overdue activit${overdueActs.length > 1 ? 'ies' : 'y'} — click the Activities tab to view`} />
      )}

      <Tabs
        className="gx-tabs-left"
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key)}
        destroyInactiveTabPane
        animated={false}
        tabBarStyle={{ overflowX: 'auto', flexWrap: 'nowrap' }}
        tabBarExtraContent={
          <Space>
            <Button icon={<ReloadOutlined />} size="small" onClick={refresh} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openNewLead}>New Lead</Button>
          </Space>
        }>

        {/* ── Pipeline Kanban ─────────────────────────────────────────────── */}
        <TabPane tab={<span><FunnelPlotOutlined /> Pipeline</span>} key="pipeline">
          <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:8, minHeight:400 }}>
            {STAGES.map(stage => (
              <div key={stage.key}
                style={{ minWidth:210, flex:'0 0 210px', background: dragOverStage === stage.key ? '#e6f7ff' : '#f5f5f5',
                  borderRadius:8, padding:8, border:`2px dashed ${dragOverStage === stage.key ? stage.color : 'transparent'}`, transition:'all .2s' }}
                onDragOver={e => { e.preventDefault(); setDragOverStage(stage.key); }}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={() => handleDrop(stage.key)}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <Tag color={stage.color} style={{ margin:0, fontWeight:600 }}>{stage.label}</Tag>
                  <span style={{ fontSize:11, color:'#8c8c8c' }}>
                    {byStage[stage.key]?.length || 0} · {fmtMoney(byStage[stage.key]?.reduce((s,l) => s+(l.value||0),0))}
                  </span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {(byStage[stage.key] || []).map(lead => (
                    <div key={lead.id} draggable
                      onDragStart={() => setDraggedLead(lead)}
                      onDragEnd={() => { setDraggedLead(null); setDragOverStage(null); }}
                      onClick={() => openDrawer(lead)}
                      style={{ background:'#fff', borderRadius:6, padding:'8px 10px', cursor:'grab',
                        boxShadow:'0 1px 3px rgba(0,0,0,.1)', borderLeft:`3px solid ${prioMap[lead.priority]?.color || '#d9d9d9'}`,
                        userSelect:'none', opacity: draggedLead?.id === lead.id ? 0.5 : 1 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                        <div style={{ fontWeight:600, fontSize:13, marginBottom:2 }}>{lead.name}</div>
                        <Space size={2}>
                          {lead.converted_customer_id && <Tooltip title="Customer"><Tag color="green" style={{ fontSize:10, padding:'0 4px', margin:0 }}>✓</Tag></Tooltip>}
                          {lead.quote_ids && (() => { try { const q = JSON.parse(lead.quote_ids); return q.length > 0 ? <Tooltip title={`${q.length} quote${q.length>1?'s':''}`}><Badge count={q.length} size="small" style={{ backgroundColor:'#1890ff' }} /></Tooltip> : null; } catch { return null; } })()}
                        </Space>
                      </div>
                      {lead.company && <div style={{ fontSize:11, color:'#8c8c8c' }}>{lead.company}</div>}
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:6 }}>
                        <span style={{ fontSize:12, color:'#1890ff', fontWeight:500 }}>{fmtMoney(lead.value)}</span>
                        <Tooltip title={`Lead score: ${lead.score || 0}/100`}>
                          <Progress percent={lead.score || 0} size="small" style={{ width:48, margin:0 }} showInfo={false}
                            strokeColor={lead.score >= 70 ? '#52c41a' : lead.score >= 40 ? '#fa8c16' : '#f5222d'} />
                        </Tooltip>
                      </div>
                      {lead.expected_close_date && (
                        <div style={{ fontSize:10, color: moment(lead.expected_close_date) < moment() ? '#f5222d' : '#8c8c8c', marginTop:4 }}>
                          <CalendarOutlined /> {moment(lead.expected_close_date).format('DD/MM/YY')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabPane>

        {/* ── All Leads Table ─────────────────────────────────────────────── */}
        <TabPane tab={`All Leads (${leads.length})`} key="list">
          <div style={{ marginBottom:12, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <Input.Search placeholder="Name, company, email…" allowClear style={{ width:220 }}
              onSearch={v => setFilters(f => ({ ...f, search: v || undefined }))} />
            <Select placeholder="Stage" allowClear style={{ width:140 }} value={filters.stage}
              onChange={v => setFilters(f => ({ ...f, stage: v }))}>
              {STAGES.map(s => <Option key={s.key} value={s.key}>{s.label}</Option>)}
            </Select>
            <Select placeholder="Priority" allowClear style={{ width:110 }} value={filters.priority}
              onChange={v => setFilters(f => ({ ...f, priority: v }))}>
              {PRIORITIES.map(p => <Option key={p.key} value={p.key}>{p.label}</Option>)}
            </Select>
            <Select placeholder="Source" allowClear style={{ width:140 }} value={filters.source}
              onChange={v => setFilters(f => ({ ...f, source: v }))}>
              {SOURCES.map(s => <Option key={s} value={s}>{s}</Option>)}
            </Select>
            {selectedKeys.length > 0 && (
              <>
                <Divider type="vertical" />
                <span style={{ color:'#666' }}>{selectedKeys.length} selected — Move to:</span>
                <Select placeholder="Stage…" style={{ width:150 }} onChange={handleBulkStage}>
                  {STAGES.map(s => <Option key={s.key} value={s.key}>{s.label}</Option>)}
                </Select>
              </>
            )}
          </div>
          <Table rowKey="id" dataSource={leads} columns={tableColumns} loading={loading} size="small"
            rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
            pagination={{ pageSize:25, showSizeChanger:true, showTotal: t => `${t} leads` }} />
        </TabPane>

        {/* ── Activities ─────────────────────────────────────────────────── */}
        <TabPane
          tab={<span><CalendarOutlined /> Activities {overdueActs.length > 0 && <Badge count={overdueActs.length} size="small" style={{ marginLeft:4 }} />}</span>}
          key="activities">
          <Row gutter={16}>
            <Col xs={24} lg={12}>
              <Card size="small" title={<span style={{ color:'#f5222d' }}><WarningOutlined /> Overdue ({overdueActs.length})</span>} style={{ marginBottom:16 }}>
                {overdueActs.length === 0
                  ? <Empty description="No overdue activities" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  : <Timeline>{overdueActs.map(a => (
                      <Timeline.Item key={a.id} color="red" dot={<span>{ACT_ICONS[a.type]}</span>}>
                        <div style={{ fontWeight:600 }}>{a.subject}</div>
                        <div style={{ fontSize:12, color:'#595959' }}>{a.lead_name}{a.lead_company ? ` · ${a.lead_company}` : ''}</div>
                        <div style={{ fontSize:11, color:'#f5222d' }}>Due: {moment(a.dueDate).format('DD/MM/YYYY HH:mm')}</div>
                      </Timeline.Item>
                    ))}</Timeline>}
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card size="small" title={<span style={{ color:'#1890ff' }}><ClockCircleOutlined /> Next 7 Days ({upcomingActs.length})</span>} style={{ marginBottom:16 }}>
                {upcomingActs.length === 0
                  ? <Empty description="Nothing due soon" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  : <Timeline>{upcomingActs.map(a => (
                      <Timeline.Item key={a.id} color="blue" dot={<span>{ACT_ICONS[a.type]}</span>}>
                        <div style={{ fontWeight:600 }}>{a.subject}</div>
                        <div style={{ fontSize:12, color:'#595959' }}>{a.lead_name}{a.lead_company ? ` · ${a.lead_company}` : ''}</div>
                        <div style={{ fontSize:11, color:'#1890ff' }}>Due: {moment(a.dueDate).format('DD/MM/YYYY HH:mm')}</div>
                      </Timeline.Item>
                    ))}</Timeline>}
              </Card>
            </Col>
          </Row>
        </TabPane>

        {/* ── Reports ────────────────────────────────────────────────────── */}
        <TabPane tab={<span><BarChartOutlined /> Reports</span>} key="reports">
          {!reports ? <Card><Empty description="No data yet" /></Card> : (
            <Row gutter={16}>
              <Col xs={24} lg={12} style={{ marginBottom:16 }}>
                <Card title="Pipeline by Stage" size="small">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={reports.byStage.map(s => ({ ...s, label: stageMap[s.stage]?.label || s.stage }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize:11 }} />
                      <YAxis />
                      <RTooltip />
                      <Bar dataKey="count" name="Leads" fill="#1890ff">
                        {reports.byStage.map((s, i) => <Cell key={i} fill={stageMap[s.stage]?.color || '#1890ff'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col xs={24} lg={12} style={{ marginBottom:16 }}>
                <Card title="Leads by Source" size="small">
                  {reports.bySource.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={reports.bySource} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={80}
                          label={({ source, percent }) => `${source} ${(percent * 100).toFixed(0)}%`}>
                          {reports.bySource.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <RTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </Card>
              </Col>
              <Col xs={24} lg={12} style={{ marginBottom:16 }}>
                <Card title="Monthly: Created vs Won" size="small">
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={[...reports.monthly].reverse()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize:11 }} />
                      <YAxis />
                      <RTooltip />
                      <Legend />
                      <Line type="monotone" dataKey="created" stroke="#1890ff" name="Created" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="won"     stroke="#52c41a" name="Won"     strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col xs={24} lg={12} style={{ marginBottom:16 }}>
                <Card title="Activity Breakdown" size="small">
                  {reports.actTypes.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={reports.actTypes} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="type" type="category" tick={{ fontSize:12 }} width={70} />
                        <RTooltip />
                        <Bar dataKey="count" fill="#722ed1" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </Card>
              </Col>
              <Col xs={24} style={{ marginBottom:16 }}>
                <Card title="Top Performers" size="small"
                  extra={<span style={{ fontSize:12, color:'#8c8c8c' }}>Avg days to close: <strong>{reports.avgDaysToClose}</strong></span>}>
                  <Table size="small" pagination={false} rowKey="owner" dataSource={reports.topOwners}
                    columns={[
                      { title:'Owner',       dataIndex:'owner', key:'owner' },
                      { title:'Total Leads', dataIndex:'leads', key:'leads' },
                      { title:'Won',         dataIndex:'won',   key:'won' },
                      { title:'Win Rate', key:'rate',
                        render: r => <span style={{ color:'#52c41a', fontWeight:600 }}>
                          {r.leads > 0 ? Math.round((r.won / r.leads) * 100) : 0}%</span> },
                    ]} />
                </Card>
              </Col>
            </Row>
          )}
        </TabPane>
      </Tabs>

      {/* ── Lead Drawer ──────────────────────────────────────────────────────── */}
      <Drawer
        title={drawerLead ? (
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span>{drawerLead.name}</span>
            <Space>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditLead(drawerLead)}>Edit</Button>
              {!drawerLead.converted_customer_id
                ? <Button size="small" type="primary" icon={<UserAddOutlined />} onClick={() => setConvertTarget(drawerLead)}>Convert</Button>
                : <Tag color="green"><CheckCircleOutlined /> Customer #{drawerLead.converted_customer_id}</Tag>}
            </Space>
          </div>
        ) : ''}
        width={520} visible={!!drawerLead} onClose={() => setDrawerLead(null)} destroyOnClose>
        {drawerLead && (
          <Tabs
            key={drawerLead.id}
            activeKey={drawerTab}
            onChange={(key) => setDrawerTab(key)}
            destroyInactiveTabPane
            animated={false}>
            <TabPane tab="Details" key="info">
              <Row gutter={[8, 10]}>
                <Col span={12}>
                  <div style={{ fontSize:11, color:'#8c8c8c' }}>Stage</div>
                  <Tag color={stageMap[drawerLead.pipeline_stage]?.color}>{stageMap[drawerLead.pipeline_stage]?.label}</Tag>
                </Col>
                <Col span={12}>
                  <div style={{ fontSize:11, color:'#8c8c8c' }}>Priority</div>
                  <Tag color={prioMap[drawerLead.priority]?.color}>{prioMap[drawerLead.priority]?.label}</Tag>
                </Col>
                <Col span={12}>
                  <div style={{ fontSize:11, color:'#8c8c8c' }}>Lead Score</div>
                  <Progress percent={drawerLead.score || 0} size="small"
                    strokeColor={drawerLead.score >= 70 ? '#52c41a' : '#fa8c16'} />
                </Col>
                <Col span={12}>
                  <div style={{ fontSize:11, color:'#8c8c8c' }}>Deal Value</div>
                  <div style={{ color:'#1890ff', fontWeight:600 }}>{fmtMoney(drawerLead.value)}</div>
                </Col>
                <Col span={12}><div style={{ fontSize:11, color:'#8c8c8c' }}>Source</div><div>{drawerLead.source || '—'}</div></Col>
                <Col span={12}><div style={{ fontSize:11, color:'#8c8c8c' }}>Expected Close</div>
                  <div>{drawerLead.expected_close_date ? moment(drawerLead.expected_close_date).format('DD/MM/YYYY') : '—'}</div></Col>
                <Col span={12}><div style={{ fontSize:11, color:'#8c8c8c' }}><MailOutlined /> Email</div><div>{drawerLead.email || '—'}</div></Col>
                <Col span={12}><div style={{ fontSize:11, color:'#8c8c8c' }}><PhoneOutlined /> Phone</div><div>{drawerLead.phone || '—'}</div></Col>
                <Col span={12}><div style={{ fontSize:11, color:'#8c8c8c' }}>Company</div><div>{drawerLead.company || '—'}</div></Col>
                <Col span={12}><div style={{ fontSize:11, color:'#8c8c8c' }}><GlobalOutlined /> Website</div><div>{drawerLead.website || '—'}</div></Col>
                <Col span={24}><div style={{ fontSize:11, color:'#8c8c8c' }}><EnvironmentOutlined /> Address</div><div>{drawerLead.address || '—'}</div></Col>
                <Col span={24}><div style={{ fontSize:11, color:'#8c8c8c' }}>Assigned To</div><div>{drawerLead.assigned_to || '—'}</div></Col>
                {drawerLead.tags && (() => { try { const t = JSON.parse(drawerLead.tags); return t.length > 0 ? (
                  <Col span={24}><div style={{ fontSize:11, color:'#8c8c8c' }}>Tags</div>{t.map(tag => <Tag key={tag}>{tag}</Tag>)}</Col>
                ) : null; } catch { return null; } })()}
                {drawerLead.converted_customer_id && (
                  <Col span={24}>
                    <div style={{ fontSize:11, color:'#8c8c8c' }}>Linked Customer</div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <Tag color="green"><CheckCircleOutlined /> {drawerLead.customer_name || `Customer #${drawerLead.converted_customer_id}`}</Tag>
                      <span style={{ fontSize:11, color:'#8c8c8c' }}>Converted {drawerLead.converted_at ? moment(drawerLead.converted_at).format('DD/MM/YYYY') : ''}</span>
                    </div>
                  </Col>
                )}
                {drawerLead.lost_reason && <Col span={24}><div style={{ fontSize:11, color:'#8c8c8c' }}>Lost Reason</div><div style={{ color:'#f5222d' }}>{drawerLead.lost_reason}</div></Col>}
                {drawerLead.notes && (
                  <Col span={24}>
                    <Divider style={{ margin:'8px 0' }} />
                    <div style={{ fontSize:11, color:'#8c8c8c' }}>Notes</div>
                    <div style={{ whiteSpace:'pre-line', background:'#fffbe6', padding:8, borderRadius:4 }}>{drawerLead.notes}</div>
                  </Col>
                )}
                <Col span={24}><div style={{ fontSize:11, color:'#8c8c8c', marginTop:4 }}>Created {moment(drawerLead.createdAt).format('DD/MM/YYYY HH:mm')}</div></Col>
              </Row>
              <Divider />
              <Space direction="vertical" style={{ width:'100%' }}>
                <Button block type="primary" icon={<PlusOutlined />} onClick={() => openQuoteModal(drawerLead)}>Create / Send Quotation</Button>
                <Button block type="dashed" icon={<PlusOutlined />} onClick={() => openNewActivity(drawerLead.id)}>Log Activity</Button>
              </Space>
            </TabPane>

            <TabPane tab={`Quotes (${leadQuotes.length})`} key="quotes">
              <div style={{ marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:13, color:'#8c8c8c' }}>Quotes linked to this lead</span>
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openQuoteModal(drawerLead)}>Create Quote</Button>
              </div>
              {leadQuotes.length === 0
                ? <Empty description="No quotes yet — click 'Create Quote' to send a quotation" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                : <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {leadQuotes.map(q => {
                      const statusColors = { Draft:'#8c8c8c', Open:'#1890ff', Sent:'#722ed1', Accepted:'#52c41a', Rejected:'#f5222d', Expired:'#fa8c16' };
                      const subtotal = Number(q.amount || 0);
                      const vatAmt   = subtotal * (Number(q.vat || 0) / 100);
                      const total    = subtotal + vatAmt;
                      return (
                        <Card key={q.id} size="small" style={{ borderLeft:`3px solid ${statusColors[q.status] || '#d9d9d9'}` }}
                          extra={<Tag color={statusColors[q.status] || 'default'}>{q.status}</Tag>}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                            <div>
                              <div style={{ fontWeight:600 }}>{q.number}</div>
                              <div style={{ fontSize:11, color:'#8c8c8c' }}>{q.start_date && moment(q.start_date).format('DD/MM/YYYY')}{q.last_date ? ` → ${moment(q.last_date).format('DD/MM/YYYY')}` : ''}</div>
                            </div>
                            <div style={{ textAlign:'right' }}>
                              <div style={{ color:'#1890ff', fontWeight:600 }}>{fmtMoney(total)}</div>
                              {q.vat > 0 && <div style={{ fontSize:11, color:'#8c8c8c' }}>incl. {q.vat}% VAT</div>}
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>}
            </TabPane>

            <TabPane tab={`Activities (${drawerActs.length})`} key="activities">
              <Button type="primary" size="small" icon={<PlusOutlined />} style={{ marginBottom:12 }}
                onClick={() => openNewActivity(drawerLead.id)}>Log Activity</Button>
              {drawerActs.length === 0
                ? <Empty description="No activities yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                : <Timeline loading={drawerLoading}>
                    {drawerActs.map(a => (
                      <Timeline.Item key={a.id}
                        color={a.status === 'done' ? 'green' : a.dueDate && moment(a.dueDate) < moment() ? 'red' : 'blue'}
                        dot={<span style={{ fontSize:15 }}>{ACT_ICONS[a.type] || '📌'}</span>}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                          <div>
                            <div style={{ fontWeight:600, textDecoration: a.status === 'done' ? 'line-through' : 'none' }}>{a.subject}</div>
                            {a.details  && <div style={{ fontSize:12, color:'#595959', marginTop:2 }}>{a.details}</div>}
                            {a.outcome  && <div style={{ fontSize:12, color:'#52c41a', marginTop:2 }}>Outcome: {a.outcome}</div>}
                            <div style={{ fontSize:11, color:'#8c8c8c', marginTop:2 }}>
                              {a.dueDate && <>{moment(a.dueDate).format('DD/MM/YYYY HH:mm')} · </>}
                              {a.status === 'done'
                                ? <span style={{ color:'#52c41a' }}>✓ Done</span>
                                : <span style={{ color:'#fa8c16' }}>Open</span>}
                            </div>
                          </div>
                          <Space size={2}>
                            {a.status !== 'done' && <Button size="small" type="link" icon={<CheckCircleOutlined />} onClick={() => completeActivity(a)} />}
                            <Button size="small" type="link" icon={<EditOutlined />}
                              onClick={() => { setEditingAct(a); actForm.setFieldsValue({ ...a, dueDate: a.dueDate ? moment(a.dueDate) : null }); setActModalOpen(true); }} />
                            <Popconfirm title="Delete?" onConfirm={async () => { await window.electronAPI.crmDeleteActivity(a.id); fetchDrawerActs(drawerLead.id); }}>
                              <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </Space>
                        </div>
                      </Timeline.Item>
                    ))}
                  </Timeline>}
            </TabPane>
          </Tabs>
        )}
      </Drawer>

      {/* ── Lead Form Modal ─────────────────────────────────────────────────── */}
      <Modal title={editingLead ? 'Edit Lead' : 'New Lead'} visible={leadModalOpen} zIndex={1050}
        onCancel={() => setLeadModalOpen(false)} onOk={handleSaveLead} width={680} okText="Save">
        <Form form={leadForm} layout="vertical">
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}><Form.Item name="name" label="Full Name" rules={[{ required:true, message:'Name required' }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="company" label="Company"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="email" label="Email"><Input type="email" /></Form.Item></Col>
            <Col span={12}><Form.Item name="phone" label="Phone"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="website" label="Website"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="address" label="Address"><Input /></Form.Item></Col>
            <Col span={12}>
              <Form.Item name="pipeline_stage" label="Pipeline Stage" initialValue="new">
                <Select>{STAGES.map(s => <Option key={s.key} value={s.key}><Tag color={s.color} style={{ marginRight:4 }}>{s.label}</Tag></Option>)}</Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="priority" label="Priority" initialValue="medium">
                <Select>{PRIORITIES.map(p => <Option key={p.key} value={p.key}><Tag color={p.color}>{p.label}</Tag></Option>)}</Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="value" label="Deal Value (R)" initialValue={0}>
                <InputNumber min={0} style={{ width:'100%' }}
                  formatter={v => `R ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={v => v.replace(/R\s?|(,*)/g, '')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="source" label="Lead Source">
                <Select allowClear>{SOURCES.map(s => <Option key={s} value={s}>{s}</Option>)}</Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="assigned_to" label="Assigned To">
                <Select allowClear showSearch optionFilterProp="children" placeholder="Select employee"
                  dropdownRender={menu => (
                    <>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setEmpModalOpen(true)} block>Add New Employee</Button></>
                  )}>
                  {employees.map(e => <Option key={e.id} value={`${e.first_name || ''} ${e.last_name || ''}`.trim() || e.email || `Employee #${e.id}`}>{`${e.first_name || ''} ${e.last_name || ''}`.trim() || e.email || `Employee #${e.id}`}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="expected_close_date" label="Expected Close Date">
                <DatePicker style={{ width:'100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="tags" label="Tags">
                <Select mode="tags" placeholder="Type and press Enter to add tags…" style={{ width:'100%' }} />
              </Form.Item>
            </Col>
            <Col span={24}><Form.Item name="notes" label="Notes"><TextArea rows={3} /></Form.Item></Col>
            {(editingLead?.pipeline_stage === 'lost') && (
              <Col span={24}><Form.Item name="lost_reason" label="Lost Reason"><Input /></Form.Item></Col>
            )}
          </Row>
        </Form>
      </Modal>

      {/* ── Activity Modal ─────────────────────────────────────────────────── */}
      <Modal title={editingAct ? 'Edit Activity' : 'Log Activity'} visible={actModalOpen} zIndex={1050}
        onCancel={() => setActModalOpen(false)} onOk={handleSaveActivity} okText="Save">
        <Form form={actForm} layout="vertical">
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}>
              <Form.Item name="type" label="Type" initialValue="call" rules={[{ required:true }]}>
                <Select>
                  {ACT_TYPES.map(t => <Option key={t} value={t}>{ACT_ICONS[t] || ''} {t.charAt(0).toUpperCase() + t.slice(1)}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="Status" initialValue="open">
                <Select>
                  <Option value="open">Open</Option>
                  <Option value="done">Done</Option>
                  <Option value="canceled">Canceled</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}><Form.Item name="subject" label="Subject" rules={[{ required:true }]}><Input /></Form.Item></Col>
            <Col span={12}>
              <Form.Item name="dueDate" label="Due Date / Time">
                <DatePicker showTime style={{ width:'100%' }} format="DD/MM/YYYY HH:mm" />
              </Form.Item>
            </Col>
            <Col span={12}><Form.Item name="details" label="Notes / Details"><TextArea rows={3} /></Form.Item></Col>
            <Col span={12}><Form.Item name="outcome" label="Outcome"><Input placeholder="Result of this activity…" /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>

      {/* ── Convert Confirmation ────────────────────────────────────────────── */}
      <Modal title="Convert Lead to Customer" visible={!!convertTarget} zIndex={1050}
        onCancel={() => { setConvertTarget(null); setConvertThenQuote(false); }}
        onOk={handleConvert} okText="Convert" okType="primary">
        {convertTarget && (
          <div>
            <p>Create a <strong>Customer</strong> record from:</p>
            <p style={{ fontSize:15 }}><strong>{convertTarget.name}</strong>{convertTarget.company ? ` — ${convertTarget.company}` : ''}</p>
            <p style={{ color:'#8c8c8c', fontSize:12 }}>The lead will be marked as <Tag color="green">Won</Tag> and linked to the new customer profile.</p>
            <Divider style={{ margin:'12px 0' }} />
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
              <input type="checkbox" checked={convertThenQuote} onChange={e => setConvertThenQuote(e.target.checked)} />
              <span>Create a quotation immediately after conversion</span>
            </label>
          </div>
        )}
      </Modal>

      {/* ── Lead Quote Creation Modal ─────────────────────────────────────────── */}
      <Modal title="Create Quotation for Lead" visible={quoteModalOpen} zIndex={1050}
        onCancel={() => setQuoteModalOpen(false)} onOk={handleCreateQuote}
        okText="Create Quote" width={780} style={{ top:20 }}>
        <Form form={quoteForm} layout="vertical">
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={8}>
              <Form.Item name="q_status" label="Status" initialValue="Draft">
                <Select>
                  {['Draft','Open','Sent','Accepted','Rejected','Expired'].map(s =>
                    <Option key={s} value={s}>{s}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="q_start" label="Quote Date" rules={[{ required:true }]}>
                <DatePicker style={{ width:'100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="q_end" label="Expiry Date">
                <DatePicker style={{ width:'100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="q_email" label="Customer Email">
                <Input type="email" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="q_vat" label="VAT %" initialValue={0}>
                <InputNumber min={0} max={100} style={{ width:'100%' }} addonAfter="%" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="q_billing" label="Billing Address">
                <Input />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="q_message" label="Message / Notes">
                <TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>

          {/* Line items */}
          <Divider style={{ margin:'8px 0' }}>Line Items</Divider>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#fafafa' }}>
                  <th style={{ padding:'6px 8px', textAlign:'left', borderBottom:'1px solid #f0f0f0', width:180 }}>Product</th>
                  <th style={{ padding:'6px 8px', textAlign:'left', borderBottom:'1px solid #f0f0f0' }}>Description</th>
                  <th style={{ padding:'6px 8px', width:70, borderBottom:'1px solid #f0f0f0' }}>Qty</th>
                  <th style={{ padding:'6px 8px', width:100, borderBottom:'1px solid #f0f0f0' }}>Rate (R)</th>
                  <th style={{ padding:'6px 8px', width:110, borderBottom:'1px solid #f0f0f0' }}>Amount (R)</th>
                  <th style={{ padding:'6px 4px', width:36, borderBottom:'1px solid #f0f0f0' }}></th>
                </tr>
              </thead>
              <tbody>
                {quoteLines.map((line, idx) => (
                  <tr key={idx}>
                    <td style={{ padding:'4px 4px' }}>
                      <Select size="small" placeholder="Select product" allowClear style={{ width:'100%' }}
                        value={line.product_id != null ? Number(line.product_id) : undefined}
                        onChange={v => selectProduct(idx, v)}
                        showSearch optionFilterProp="children">
                        {products.map(p => <Option key={p.id} value={Number(p.id)}>{p.name || p.description}</Option>)}
                      </Select>
                    </td>
                    <td style={{ padding:'4px 4px' }}>
                      <Input size="small" value={line.description} placeholder="Description"
                        onChange={e => updateLine(idx,'description',e.target.value)} />
                    </td>
                    <td style={{ padding:'4px 4px' }}>
                      <InputNumber size="small" min={0} style={{ width:'100%' }} value={line.quantity}
                        onChange={v => updateLine(idx,'quantity',v)} />
                    </td>
                    <td style={{ padding:'4px 4px' }}>
                      <InputNumber size="small" min={0} style={{ width:'100%' }} value={line.rate}
                        onChange={v => updateLine(idx,'rate',v)} />
                    </td>
                    <td style={{ padding:'4px 8px', fontWeight:500, color:'#1890ff' }}>
                      {fmtMoney(line.amount)}
                    </td>
                    <td style={{ padding:'4px 4px', textAlign:'center' }}>
                      <Button size="small" type="link" danger icon={<DeleteOutlined />}
                        onClick={() => setQuoteLines(prev => prev.filter((_,i) => i !== idx))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button type="dashed" size="small" icon={<PlusOutlined />} style={{ marginTop:8, width:'100%' }}
            onClick={() => setQuoteLines(prev => [...prev, { description:'', quantity:1, rate:0, amount:0, product_id: null }])}>
            Add Line
          </Button>

          {/* Totals */}
          {(() => {
            const vatRate  = Number(quoteForm.getFieldValue('q_vat') || 0);
            const subtotal = quoteLines.reduce((s,l) => s + Number(l.amount||0), 0);
            const vatAmt   = subtotal * (vatRate / 100);
            const total    = subtotal + vatAmt;
            return (
              <div style={{ marginTop:12, padding:'10px 16px', background:'#fafafa', borderRadius:6, textAlign:'right' }}>
                <div style={{ marginBottom:4 }}>Subtotal: <strong>{fmtMoney(subtotal)}</strong></div>
                {vatRate > 0 && <div style={{ marginBottom:4, color:'#8c8c8c' }}>VAT ({vatRate}%): <strong>{fmtMoney(vatAmt)}</strong></div>}
                <div style={{ fontSize:16, color:'#1890ff' }}>Total: <strong>{fmtMoney(total)}</strong></div>
              </div>
            );
          })()}
        </Form>
      </Modal>

      {/* ── Add Employee Modal ──────────────────────────────────────────────── */}
      <Modal title="Add New Employee" visible={empModalOpen} zIndex={1100}
        onCancel={() => setEmpModalOpen(false)} onOk={handleAddEmployee} okText="Add Employee">
        <Form form={empForm} layout="vertical">
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}><Form.Item name="first_name" label="First Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="last_name" label="Last Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="email" label="Email"><Input type="email" /></Form.Item></Col>
            <Col span={12}><Form.Item name="phone" label="Phone"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="department" label="Department"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="position" label="Position"><Input /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default Leads;


