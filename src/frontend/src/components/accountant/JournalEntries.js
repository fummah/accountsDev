import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Button, Form, Input, DatePicker, Select, Modal, message, Card, Row, Col,
  Tag, Space, Typography, Tooltip, Statistic, Badge, Alert, Divider, InputNumber,
  Popconfirm, Spin
} from 'antd';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined, FileTextOutlined, CheckCircleOutlined,
  WarningOutlined, DeleteOutlined, CopyOutlined, FilterOutlined, DownloadOutlined,
  SwapOutlined, CalendarOutlined, AuditOutlined, SafetyCertificateOutlined,
  ExclamationCircleOutlined, MinusCircleOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';
import { useHistory, useLocation } from 'react-router-dom';
import { dedupeAccounts } from '../../utils/accounts';
import { SOURCE_LABELS, SOURCE_COLORS, getSourceTransactionRoute } from '../../utils/sourceRoutes';
import AccountSelect from '../shared/AccountSelect';
import JournalEntryDetailModal from './JournalEntryDetailModal';

const { Option } = Select;
const { Title, Text } = Typography;

const JournalEntries = () => {
  const history = useHistory();
  const location = useLocation();
  const { symbol: cSym } = useCurrency();
  const fmtC = (v) => `${cSym} ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [classes, setClasses] = useState([]);
  const [locations, setLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [dateFilter, setDateFilter] = useState([moment().startOf('month'), moment().endOf('month')]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceTypeFilter, setSourceTypeFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState(null);
  const [partyFilter, setPartyFilter] = useState('');
  const [enteredByFilter, setEnteredByFilter] = useState('');
  const [referenceFilter, setReferenceFilter] = useState('');
  const [form] = Form.useForm();

  // Source transaction drill-down modal
  const [sourceRecord, setSourceRecord] = useState(null);
  const [sourceDetail, setSourceDetail] = useState(null);
  const [sourceLoading, setSourceLoading] = useState(false);

  // Journal entry detail modal (shared)
  const [journalDetailId, setJournalDetailId] = useState(null);

  const openJournal = (journalId) => {
    if (!journalId) return;
    setJournalDetailId(journalId);
  };

  // Deep-link support: ?journal=<id> opens that specific journal entry's
  // detail modal instead of dumping the user on the full list.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const journalId = params.get('journal');
    if (journalId) openJournal(journalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Account activity drill-down modal (click an account name → register)
  const [activity, setActivity] = useState(null);

  const openAccountActivity = async (accountId, accountName) => {
    if (!accountId) return;
    setActivity({ accountId, accountName, txns: [], loading: true });
    try {
      const txns = await window.electronAPI.getAccountActivity?.(accountId) || [];
      setActivity(a => ({ ...a, txns: Array.isArray(txns) ? txns : [], loading: false }));
    } catch {
      setActivity(a => ({ ...a, txns: [], loading: false }));
    }
  };

  // Live balance tracking for the form
  const [formLines, setFormLines] = useState([]);

  // Add-new dimension modals
  const [newLocModal, setNewLocModal] = useState(false);
  const [newLocName, setNewLocName] = useState('');
  const [newDeptModal, setNewDeptModal] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newClassModal, setNewClassModal] = useState(false);
  const [newClassName, setNewClassName] = useState('');

  const addNewLocation = async () => {
    if (!newLocName.trim()) return message.warning('Name required');
    try {
      await window.electronAPI.createLocation({ name: newLocName.trim() });
      const locs = await window.electronAPI.listLocations?.() || [];
      setLocations(Array.isArray(locs) ? locs : []);
      setNewLocName(''); setNewLocModal(false);
      message.success('Location added');
    } catch { message.error('Failed to add location'); }
  };
  const addNewDepartment = async () => {
    if (!newDeptName.trim()) return message.warning('Name required');
    try {
      await window.electronAPI.createDepartment({ name: newDeptName.trim() });
      const deps = await window.electronAPI.listDepartments?.() || [];
      setDepartments(Array.isArray(deps) ? deps : []);
      setNewDeptName(''); setNewDeptModal(false);
      message.success('Department added');
    } catch { message.error('Failed to add department'); }
  };
  const addNewClass = async () => {
    if (!newClassName.trim()) return message.warning('Name required');
    try {
      await window.electronAPI.createClass({ name: newClassName.trim() });
      const cls = await window.electronAPI.listClasses?.() || [];
      setClasses(Array.isArray(cls) ? cls : []);
      setNewClassName(''); setNewClassModal(false);
      message.success('Class added');
    } catch { message.error('Failed to add class'); }
  };

  useEffect(() => { loadData(); }, [dateFilter]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const safe = (fn) => fn?.()?.catch?.(() => null) || Promise.resolve(null);
      const filters = {};
      if (dateFilter && dateFilter[0] && dateFilter[1]) {
        filters.from = dateFilter[0].format('YYYY-MM-DD');
        filters.to = dateFilter[1].format('YYYY-MM-DD');
      }
      const [journalData, accountsData, entitiesData, cls, locs, deps] = await Promise.all([
        safe(() => window.electronAPI.journalList(filters)),
        safe(() => window.electronAPI.getChartOfAccounts()),
        safe(() => window.electronAPI.listEntities?.()),
        safe(() => window.electronAPI.listClasses?.()),
        safe(() => window.electronAPI.listLocations?.()),
        safe(() => window.electronAPI.listDepartments?.()),
      ]);
      const rows = Array.isArray(journalData) ? journalData.map(e => {
        const lines = Array.isArray(e.lines) ? e.lines : [];
        const debitTotal = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
        const creditTotal = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
        const balanced = Math.abs(debitTotal - creditTotal) < 0.01;
        return { ...e, debitTotal, creditTotal, balanced, lineCount: lines.length };
      }) : [];
      setEntries(rows);
      setAccounts(Array.isArray(accountsData) ? dedupeAccounts(accountsData) : []);
      setEntities(Array.isArray(entitiesData) ? entitiesData : []);
      setClasses(Array.isArray(cls) ? cls : []);
      setLocations(Array.isArray(locs) ? locs : []);
      setDepartments(Array.isArray(deps) ? deps : []);
    } catch (error) {
      message.error('Failed to load data');
    }
    setLoading(false);
  }, []);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    let result = [...entries];
    if (searchText) {
      const lower = searchText.toLowerCase();
      result = result.filter(e =>
        (e.description || '').toLowerCase().includes(lower) ||
        (e.reference || '').toLowerCase().includes(lower) ||
        (e.entered_by || '').toLowerCase().includes(lower)
      );
    }
    if (referenceFilter) {
      const lower = referenceFilter.toLowerCase();
      result = result.filter(e => (e.reference || '').toLowerCase().includes(lower));
    }
    if (partyFilter) {
      const lower = partyFilter.toLowerCase();
      result = result.filter(e => (e.source?.party || '').toLowerCase().includes(lower));
    }
    if (enteredByFilter) {
      result = result.filter(e => (e.entered_by || '') === enteredByFilter);
    }
    if (sourceTypeFilter !== 'all') {
      result = result.filter(e => (e.source_type || 'manual') === sourceTypeFilter);
    }
    if (accountFilter) {
      const target = Number(accountFilter);
      result = result.filter(e => (Array.isArray(e.lines) ? e.lines : []).some(l => Number(l.account_id) === target));
    }
    if (dateFilter && dateFilter[0] && dateFilter[1]) {
      const start = dateFilter[0].startOf('day');
      const end = dateFilter[1].endOf('day');
      result = result.filter(e => {
        const d = moment(e.date);
        return d.isSameOrAfter(start) && d.isSameOrBefore(end);
      });
    }
    if (statusFilter === 'balanced') result = result.filter(e => e.balanced);
    if (statusFilter === 'unbalanced') result = result.filter(e => !e.balanced);
    return result;
  }, [entries, searchText, dateFilter, statusFilter, sourceTypeFilter, accountFilter, partyFilter, enteredByFilter, referenceFilter]);

  // Summary stats
  const totalDebits = useMemo(() => filteredEntries.reduce((s, e) => s + e.debitTotal, 0), [filteredEntries]);
  const totalCredits = useMemo(() => filteredEntries.reduce((s, e) => s + e.creditTotal, 0), [filteredEntries]);
  const unbalancedCount = useMemo(() => entries.filter(e => !e.balanced).length, [entries]);

  // Filter options derived from loaded data
  const enteredByOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const e of entries) {
      const v = e.entered_by;
      if (v && !seen.has(v)) { seen.add(v); out.push(v); }
    }
    return out.sort();
  }, [entries]);

  const hasActiveFilters = !!(searchText || referenceFilter || partyFilter || enteredByFilter ||
    (dateFilter && dateFilter[0] && dateFilter[1]) || statusFilter !== 'all' ||
    sourceTypeFilter !== 'all' || accountFilter);

  const clearFilters = () => {
    setSearchText(''); setReferenceFilter(''); setPartyFilter(''); setEnteredByFilter('');
    setDateFilter(null); setStatusFilter('all'); setSourceTypeFilter('all'); setAccountFilter(null);
  };

  // Form balance computation
  const formDebitTotal = formLines.reduce((s, l) => s + (l.type === 'debit' ? (Number(l.amount) || 0) : 0), 0);
  const formCreditTotal = formLines.reduce((s, l) => s + (l.type === 'credit' ? (Number(l.amount) || 0) : 0), 0);
  const formBalanced = Math.abs(formDebitTotal - formCreditTotal) < 0.01;
  const formDifference = formDebitTotal - formCreditTotal;

  const updateFormLines = () => {
    const vals = form.getFieldValue('entries') || [];
    setFormLines(vals.map(v => ({
      type: v?.type || '',
      amount: Number(v?.amount) || 0,
    })));
  };

  const openNewEntry = () => {
    setEditingEntry(null);
    form.resetFields();
    form.setFieldsValue({ date: moment(), entries: [{ type: 'debit' }, { type: 'credit' }] });
    setFormLines([{ type: 'debit', amount: 0 }, { type: 'credit', amount: 0 }]);
    setIsModalVisible(true);
  };

  const duplicateEntry = (record) => {
    setEditingEntry(null);
    const lines = Array.isArray(record.lines) ? record.lines : [];
    form.resetFields();
    form.setFieldsValue({
      date: moment(),
      reference: `${record.reference || ''}-COPY`,
      description: record.description,
      entity_id: record.entity_id,
      class: record.class,
      location: record.location,
      department: record.department,
      entries: lines.map(l => ({
        accountId: l.account_id || undefined,
        type: Number(l.debit) > 0 ? 'debit' : 'credit',
        amount: Number(l.debit) > 0 ? Number(l.debit) : Number(l.credit),
      })),
    });
    setFormLines(lines.map(l => ({
      type: Number(l.debit) > 0 ? 'debit' : 'credit',
      amount: Number(l.debit) > 0 ? Number(l.debit) : Number(l.credit),
    })));
    setIsModalVisible(true);
  };

  const handleSubmit = async (values) => {
    try {
      const lines = (values.entries || []).map(entry => {
        const accountObj = Array.isArray(accounts) ? accounts.find(a => a.id === entry.accountId) : null;
        const accountLabel = accountObj
          ? (accountObj.accountName || accountObj.name || accountObj.account_number || accountObj.number || String(accountObj.id))
          : String(entry.accountId);
        const amount = Number(entry.amount) || 0;
        return {
          account: accountLabel,
          account_id: entry.accountId,
          debit: entry.type === 'debit' ? amount : 0,
          credit: entry.type === 'credit' ? amount : 0,
        };
      });

      // Validate balance
      const dTotal = lines.reduce((s, l) => s + l.debit, 0);
      const cTotal = lines.reduce((s, l) => s + l.credit, 0);
      if (Math.abs(dTotal - cTotal) >= 0.01) {
        message.warning(`Entry is unbalanced by ${fmtC(Math.abs(dTotal - cTotal))}. Debits must equal credits.`);
        return;
      }

      if (lines.length < 2) {
        message.warning('At least 2 lines required for a journal entry.');
        return;
      }

      const payload = {
        date: values.date.format('YYYY-MM-DD'),
        reference: values.reference || '',
        description: values.description,
        entered_by: 'ui',
        lines,
        entity_id: values.entity_id || null,
        class: values.class || null,
        location: values.location || null,
        department: values.department || null,
      };

      const res = await window.electronAPI.insertJournal(payload);
      if (res && res.error) throw new Error(res.error);
      message.success('Journal entry created successfully');
      setIsModalVisible(false);
      form.resetFields();
      setFormLines([]);
      loadData();
    } catch (error) {
      message.error(error?.message || 'Failed to create journal entry');
    }
  };

  const deleteEntry = async (id) => {
    try {
      const res = await window.electronAPI.deleteRecord?.(id, 'journal');
      if (res?.error) throw new Error(res.error);
      message.success('Journal entry deleted');
      loadData();
    } catch (e) {
      message.error(e?.message || 'Failed to delete entry');
    }
  };

  const openSource = async (record) => {
    if (!record || !record.source_type) return;
    setSourceRecord(record);
    setSourceDetail(null);
    setSourceLoading(true);
    try {
      const detail = await window.electronAPI.journalSourceDetail?.(record.source_type, record.source_id);
      setSourceDetail(detail && !detail.error ? detail : null);
    } catch {
      setSourceDetail(null);
    }
    setSourceLoading(false);
  };

  // Expandable row renderer showing line items
  const expandedRowRender = (record) => {
    const lines = Array.isArray(record.lines) ? record.lines : [];
    if (!lines.length) return <Text type="secondary">No line items</Text>;
    const lineColumns = [
      { title: '#', key: 'idx', width: 44, align: 'center', render: (_, __, i) => <Text type="secondary">{i + 1}</Text> },
      { title: 'Account', key: 'account', width: 280,
        render: (_, l) => (
          <div>
            {l.account_id
              ? <a onClick={(e) => { e.stopPropagation(); openAccountActivity(l.account_id, l.accountName || l.account); }}
                  style={{ cursor: 'pointer' }} title="View account activity">
                  <Text strong style={{ color: '#1890ff' }}>{l.accountName || l.account || '-'}</Text>
                </a>
              : <Text strong>{l.accountName || l.account || '-'}</Text>}
            {l.accountNumber ? <div><Text type="secondary" style={{ fontSize: 11 }}># {l.accountNumber}</Text></div> : null}
          </div>
        ) },
      { title: 'Description / Memo', dataIndex: 'description', key: 'description',
        render: v => v ? <Text>{v}</Text> : <Text type="secondary">-</Text> },
      { title: 'Debit', dataIndex: 'debit', key: 'debit', width: 130, align: 'right',
        render: v => Number(v) > 0 ? <Text style={{ color: '#3f8600', fontWeight: 500 }}>{fmtC(v)}</Text> : <Text type="secondary">-</Text> },
      { title: 'Credit', dataIndex: 'credit', key: 'credit', width: 130, align: 'right',
        render: v => Number(v) > 0 ? <Text style={{ color: '#cf1322', fontWeight: 500 }}>{fmtC(v)}</Text> : <Text type="secondary">-</Text> },
    ];
    return (
      <div style={{ padding: '4px 0' }}>
        <Table columns={lineColumns} dataSource={lines.map((l, i) => ({ ...l, key: i }))}
          size="small" pagination={false} bordered
          summary={() => (
            <Table.Summary.Row style={{ background: '#fafafa' }}>
              <Table.Summary.Cell colSpan={3}><Text strong>Totals ({lines.length} lines)</Text></Table.Summary.Cell>
              <Table.Summary.Cell align="right"><Text strong style={{ color: '#3f8600' }}>{fmtC(record.debitTotal)}</Text></Table.Summary.Cell>
              <Table.Summary.Cell align="right"><Text strong style={{ color: '#cf1322' }}>{fmtC(record.creditTotal)}</Text></Table.Summary.Cell>
            </Table.Summary.Row>
          )} />
        {record.source_type && (() => {
          const st = record.source_type;
          const label = SOURCE_LABELS[st] || String(st).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          const src = record.source || {};
          const srcInfo = [label, src.number || record.reference || '', src.party || '', src.date ? moment(src.date).format('MM/DD/YYYY') : ''].filter(Boolean).join(' · ');
          return (
            <div style={{ marginTop: 8 }}>
              <Button size="small" type="primary" icon={<FileTextOutlined />}
                style={{ borderRadius: 6, color: '#fff' }}
                onClick={(e) => { e.stopPropagation(); openSource(record); }}
                title="View source transaction">View Source Transaction</Button>
              <Tag style={{ marginTop: 4, marginLeft: 8 }} color={SOURCE_COLORS[st] || 'default'}>Source: {srcInfo}</Tag>
            </div>
          );
        })()}
        {record.entered_by && <Tag style={{ marginTop: 6 }}>Entered By: {record.entered_by}</Tag>}
        {record.entity_id && <Tag style={{ marginTop: 6 }}>Entity: {record.entity_id}</Tag>}
        {record.class && <Tag style={{ marginTop: 6 }}>Class: {record.class}</Tag>}
        {record.location && <Tag style={{ marginTop: 6 }}>Location: {record.location}</Tag>}
        {record.department && <Tag style={{ marginTop: 6 }}>Department: {record.department}</Tag>}
      </div>
    );
  };

  const columns = [
    { title: 'Journal', dataIndex: 'id', key: 'journal', width: 80, align: 'center',
      render: v => v
        ? <a onClick={(e) => { e.stopPropagation(); openJournal(v); }} style={{ cursor: 'pointer' }} title="Open journal entry"><Text code style={{ cursor: 'pointer' }}>#{v}</Text></a>
        : '-' },
    { title: 'Date', dataIndex: 'date', key: 'date', width: 110, sorter: (a, b) => new Date(a.date) - new Date(b.date),
      defaultSortOrder: 'descend', render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
    { title: 'Reference', dataIndex: 'reference', key: 'reference', width: 120, ellipsis: true,
      render: (v, r) => r.source_type
        ? <a onClick={(e) => { e.stopPropagation(); openSource(r); }} style={{ cursor: 'pointer' }} title="View source transaction">
            <Tag color={SOURCE_COLORS[r.source_type] || 'default'} style={{ fontSize: 11, borderRadius: 4 }}>{v || '-'}</Tag>
          </a>
        : (v ? <Tag style={{ fontSize: 11, borderRadius: 4 }}>{v}</Tag> : <Text type="secondary">-</Text>) },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Source', key: 'source', width: 210, render: (_, r) => {
      const st = r.source_type || 'manual';
      const label = SOURCE_LABELS[st] || st.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const src = r.source || {};
      const num = src.number || r.reference || '';
      const party = src.party || '';
      const sdate = src.date || r.date || '';
      const info = (
        <div>
          <Tag color={SOURCE_COLORS[st] || 'default'} style={{ borderRadius: 4, marginBottom: 2 }}>{label}</Tag>
          {num ? <div style={{ fontSize: 12, fontWeight: 600 }}>{num}</div> : null}
          {party ? <div style={{ fontSize: 11, color: '#666', lineHeight: 1.4 }}>{party}</div> : null}
          {sdate ? <div style={{ fontSize: 10, color: '#999' }}>{moment(sdate).format('MM/DD/YYYY')}</div> : null}
        </div>
      );
      if (r.source_type) {
        return (
          <a onClick={(e) => { e.stopPropagation(); openSource(r); }}
            style={{ cursor: 'pointer', display: 'block' }}
            title="View source transaction">
            {info}
          </a>
        );
      }
      return info;
    }},
    { title: 'Lines', dataIndex: 'lineCount', key: 'lineCount', width: 65, align: 'center',
      render: v => <Badge count={v || 0} style={{ backgroundColor: '#1890ff' }} overflowCount={99} /> },
    { title: 'Debit', dataIndex: 'debitTotal', key: 'debitTotal', width: 130, align: 'right',
      render: v => <Text style={{ color: '#3f8600', fontWeight: 500 }}>{fmtC(v)}</Text> },
    { title: 'Credit', dataIndex: 'creditTotal', key: 'creditTotal', width: 130, align: 'right',
      render: v => <Text style={{ color: '#cf1322', fontWeight: 500 }}>{fmtC(v)}</Text> },
    { title: 'Status', key: 'status', width: 90, align: 'center',
      render: (_, r) => r.balanced
        ? <Tag icon={<CheckCircleOutlined />} color="success" style={{ borderRadius: 4 }}>Balanced</Tag>
        : <Tag icon={<WarningOutlined />} color="error" style={{ borderRadius: 4 }}>Unbalanced</Tag> },
    { title: 'Entered By', dataIndex: 'entered_by', key: 'entered_by', width: 90, ellipsis: true,
      render: v => <Text type="secondary" style={{ fontSize: 11 }}>{v || '-'}</Text> },
    { title: '', key: 'actions', width: 110, render: (_, r) => (
      <Space size={4}>
        <Tooltip title="Duplicate"><Button size="small" icon={<CopyOutlined />} onClick={() => duplicateEntry(r)} /></Tooltip>
        <Tooltip title="Anchor to blockchain">
          <Button size="small" icon={<SafetyCertificateOutlined />} onClick={async () => {
            try {
              const res = await window.electronAPI.journalAnchor?.(r.id);
              if (res?.success) message.success('Anchor queued'); else message.error(res?.error || 'Failed');
            } catch (e) { message.error(e?.message || 'Error'); }
          }} />
        </Tooltip>
        <Popconfirm title="Delete this journal entry?" onConfirm={() => deleteEntry(r.id)} okText="Delete" okButtonProps={{ danger: true }}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    )},
  ];

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1440, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #52c41a, #1890ff)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileTextOutlined style={{ fontSize: 20, color: '#fff' }} />
          </div>
          <div>
            <Title level={3} style={{ margin: 0, lineHeight: 1.2 }}>Journal Entries</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>{filteredEntries.length} entries {hasActiveFilters ? '(filtered)' : ''}</Text>
          </div>
        </div>
        <Space wrap size={6}>
          <Button icon={<ReloadOutlined spin={loading} />} onClick={loadData} style={{ borderRadius: 6 }}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openNewEntry} style={{ borderRadius: 6 }}>New Journal Entry</Button>
        </Space>
      </div>

      {/* Alerts */}
      {unbalancedCount > 0 && (
        <Alert message={`${unbalancedCount} unbalanced journal entr${unbalancedCount > 1 ? 'ies' : 'y'} detected`}
          description="Debits and credits do not match on some entries. Review and correct immediately."
          type="error" showIcon icon={<WarningOutlined />}
          action={<Button size="small" danger onClick={() => setStatusFilter('unbalanced')}>Show Unbalanced</Button>}
          style={{ marginBottom: 12, borderRadius: 8 }} closable />
      )}

      {/* Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #1890ff' }}>
            <Statistic title="Total Entries" value={filteredEntries.length} prefix={<FileTextOutlined />}
              valueStyle={{ fontSize: 22, fontWeight: 700, color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #3f8600' }}>
            <Statistic title="Total Debits" value={totalDebits} precision={2} prefix={cSym}
              valueStyle={{ fontSize: 22, fontWeight: 700, color: '#3f8600' }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #cf1322' }}>
            <Statistic title="Total Credits" value={totalCredits} precision={2} prefix={cSym}
              valueStyle={{ fontSize: 22, fontWeight: 700, color: '#cf1322' }} />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card size="small" style={{ borderRadius: 10, marginBottom: 16 }} bodyStyle={{ padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input placeholder="Search description, reference..." prefix={<SearchOutlined />}
            value={searchText} onChange={e => setSearchText(e.target.value)}
            style={{ width: 250, borderRadius: 6 }} allowClear />
          <Input placeholder="Reference number" value={referenceFilter}
            onChange={e => setReferenceFilter(e.target.value)}
            style={{ width: 170, borderRadius: 6 }} allowClear />
          <Input placeholder="Vendor / Customer" value={partyFilter}
            onChange={e => setPartyFilter(e.target.value)}
            style={{ width: 170, borderRadius: 6 }} allowClear />
          <DatePicker.RangePicker size="middle" value={dateFilter} onChange={setDateFilter}
            format="MM/DD/YYYY" allowClear style={{ borderRadius: 6 }} placeholder={['From date', 'To date']} />
          <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 140, borderRadius: 6 }}>
            <Option value="all">All Status</Option>
            <Option value="balanced">Balanced Only</Option>
            <Option value="unbalanced">Unbalanced Only</Option>
          </Select>
          <Select value={sourceTypeFilter} onChange={setSourceTypeFilter} style={{ width: 150, borderRadius: 6 }} allowClear={false}>
            <Option value="all">All Sources</Option>
            {Object.entries(SOURCE_LABELS).map(([val, lab]) => <Option key={val} value={val}>{lab}</Option>)}
            <Option value="manual">Manual</Option>
          </Select>
          <AccountSelect value={accountFilter} onChange={setAccountFilter} style={{ width: 230, borderRadius: 6 }}
            accounts={accounts} placeholder="Filter by account" allowClear />
          <Select value={enteredByFilter || undefined} onChange={v => setEnteredByFilter(v || '')}
            style={{ width: 150, borderRadius: 6 }} placeholder="Entered by" allowClear showSearch optionFilterProp="children">
            {enteredByOptions.map(u => <Option key={u} value={u}>{u}</Option>)}
          </Select>
          {hasActiveFilters && (
            <Button size="small" onClick={clearFilters} style={{ borderRadius: 6 }}>Clear Filters</Button>
          )}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: '#999' }}>
          Tip: double-click a row, or click a Reference / Source to view the original transaction. Click an Account to see its register.
        </div>
      </Card>

      {/* Table */}
      <Card size="small" style={{ borderRadius: 10 }} bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={filteredEntries}
          rowKey="id"
          size="small"
          loading={loading}
          onRow={(record) => ({ onDoubleClick: () => { if (record.source_type) openSource(record); } })}
          expandable={{ expandedRowRender, expandRowByClick: true }}
          pagination={{ defaultPageSize: 20, showTotal: t => `${t} entries`, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'] }}
          scroll={{ x: 900 }}
          summary={() => filteredEntries.length > 0 ? (
            <Table.Summary fixed>
              <Table.Summary.Row style={{ background: '#fafafa' }}>
                <Table.Summary.Cell index={0} colSpan={6}><Text strong>Page Totals</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="right"><Text strong style={{ color: '#3f8600' }}>{fmtC(totalDebits)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="right"><Text strong style={{ color: '#cf1322' }}>{fmtC(totalCredits)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={8} colSpan={3}>
                  {Math.abs(totalDebits - totalCredits) < 0.01
                    ? <Tag icon={<CheckCircleOutlined />} color="success">Balanced</Tag>
                    : <Tag icon={<WarningOutlined />} color="error">Diff: {fmtC(Math.abs(totalDebits - totalCredits))}</Tag>}
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          ) : null}
        />
      </Card>

      {/* ═══ NEW JOURNAL ENTRY MODAL ═════════════════════════════════════ */}
      <Modal
        title={<span><FileTextOutlined style={{ marginRight: 8 }} />{editingEntry ? 'Edit Journal Entry' : 'New Journal Entry'}</span>}
        visible={isModalVisible}
        onOk={() => form.submit()}
        okText="Save Entry"
        okButtonProps={{ disabled: !formBalanced || formLines.length < 2 }}
        onCancel={() => { setIsModalVisible(false); form.resetFields(); setFormLines([]); }}
        width={900}
        bodyStyle={{ maxHeight: '70vh', overflowY: 'auto' }}
      >
        {/* Live Balance Indicator */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', marginBottom: 16,
          borderRadius: 8, background: formBalanced ? '#f6ffed' : '#fff2f0', border: `1px solid ${formBalanced ? '#b7eb8f' : '#ffccc7'}` }}>
          <Space size={16}>
            <div><Text type="secondary" style={{ fontSize: 11 }}>Debits</Text><div style={{ fontWeight: 700, color: '#3f8600' }}>{fmtC(formDebitTotal)}</div></div>
            <div><Text type="secondary" style={{ fontSize: 11 }}>Credits</Text><div style={{ fontWeight: 700, color: '#cf1322' }}>{fmtC(formCreditTotal)}</div></div>
          </Space>
          <div style={{ textAlign: 'right' }}>
            {formBalanced ? (
              <Tag icon={<CheckCircleOutlined />} color="success" style={{ fontSize: 13 }}>Balanced</Tag>
            ) : (
              <div>
                <Tag icon={<ExclamationCircleOutlined />} color="error" style={{ fontSize: 13 }}>
                  Difference: {fmtC(Math.abs(formDifference))}
                </Tag>
                <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                  {formDifference > 0 ? 'Credits needed' : 'Debits needed'}
                </div>
              </div>
            )}
          </div>
        </div>

        <Form form={form} layout="vertical" onFinish={handleSubmit}
          onValuesChange={() => setTimeout(updateFormLines, 0)}>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Date required' }]}>
                <DatePicker style={{ width: '100%' }} format="MM/DD/YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="reference" label="Reference">
                <Input placeholder="e.g. JE-001, ADJ-2024" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="entity_id" label="Entity">
                <Select allowClear placeholder="Select entity" showSearch optionFilterProp="children">
                  {entities.map(e => <Option key={e.id} value={e.id}>{e.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="Description" rules={[{ required: true, message: 'Description required' }]}>
            <Input.TextArea rows={2} placeholder="Purpose of this journal entry..." />
          </Form.Item>

          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="class" label="Class">
                <Select allowClear placeholder="Select class" showSearch optionFilterProp="children"
                  dropdownRender={menu => (<>{menu}<Divider style={{margin:'4px 0'}}/><div style={{padding:'4px 8px'}}><Button type="link" size="small" icon={<PlusOutlined/>} onClick={()=>setNewClassModal(true)}>Add New</Button></div></>)}>
                  {classes.map(c => <Option key={c.id} value={c.name}>{c.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="location" label="Location">
                <Select allowClear placeholder="Select location" showSearch optionFilterProp="children"
                  dropdownRender={menu => (<>{menu}<Divider style={{margin:'4px 0'}}/><div style={{padding:'4px 8px'}}><Button type="link" size="small" icon={<PlusOutlined/>} onClick={()=>setNewLocModal(true)}>Add New</Button></div></>)}>
                  {locations.map(l => <Option key={l.id} value={l.name}>{l.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="department" label="Department">
                <Select allowClear placeholder="Select department" showSearch optionFilterProp="children"
                  dropdownRender={menu => (<>{menu}<Divider style={{margin:'4px 0'}}/><div style={{padding:'4px 8px'}}><Button type="link" size="small" icon={<PlusOutlined/>} onClick={()=>setNewDeptModal(true)}>Add New</Button></div></>)}>
                  {departments.map(d => <Option key={d.id} value={d.name}>{d.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" style={{ margin: '8px 0 16px', fontSize: 13 }}>
            <SwapOutlined style={{ marginRight: 6 }} />Line Items
          </Divider>

          {/* Column headers */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 6, padding: '0 4px' }}>
            <Text strong style={{ flex: 3, fontSize: 11 }}>Account</Text>
            <Text strong style={{ flex: 1, fontSize: 11 }}>Type</Text>
            <Text strong style={{ flex: 1, fontSize: 11 }}>Amount ({cSym})</Text>
            <div style={{ width: 32 }} />
          </div>

          <Form.List name="entries">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <div key={key} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
                    <Form.Item {...restField} name={[name, 'accountId']} rules={[{ required: true, message: 'Required' }]}
                      style={{ flex: 3, marginBottom: 0 }}>
                      <AccountSelect accounts={accounts} placeholder="Select account" size="middle" />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'type']} rules={[{ required: true, message: 'Required' }]}
                      style={{ flex: 1, marginBottom: 0 }}>
                      <Select placeholder="Type">
                        <Option value="debit"><span style={{ color: '#3f8600' }}>Debit</span></Option>
                        <Option value="credit"><span style={{ color: '#cf1322' }}>Credit</span></Option>
                      </Select>
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'amount']} rules={[{ required: true, message: 'Required' }]}
                      style={{ flex: 1, marginBottom: 0 }}>
                      <InputNumber min={0} step={0.01} placeholder="0.00" style={{ width: '100%' }}
                        formatter={v => v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                        parser={v => v.replace(/,/g, '')} />
                    </Form.Item>
                    <Tooltip title="Remove line">
                      <Button size="small" danger icon={<MinusCircleOutlined />} onClick={() => { remove(name); setTimeout(updateFormLines, 0); }}
                        style={{ marginTop: 4 }} />
                    </Tooltip>
                  </div>
                ))}
                <Button type="dashed" onClick={() => { add({ type: 'debit' }); setTimeout(updateFormLines, 0); }}
                  block icon={<PlusOutlined />} style={{ borderRadius: 6, marginTop: 4 }}>
                  Add Line Item
                </Button>
              </>
            )}
          </Form.List>

          {formLines.length > 0 && !formBalanced && (
            <Alert message={<span>Entry is <strong>unbalanced</strong> by {fmtC(Math.abs(formDifference))}. Add a {formDifference > 0 ? 'credit' : 'debit'} line to balance.</span>}
              type="warning" showIcon style={{ marginTop: 12, borderRadius: 8 }} />
          )}
        </Form>
      </Modal>

      {/* Add New Location Modal */}
      <Modal title="Add New Location" visible={newLocModal} onOk={addNewLocation}
        onCancel={() => { setNewLocModal(false); setNewLocName(''); }} okText="Add" destroyOnClose>
        <Input placeholder="Location name" value={newLocName} onChange={e => setNewLocName(e.target.value)} onPressEnter={addNewLocation} />
      </Modal>

      {/* Add New Department Modal */}
      <Modal title="Add New Department" visible={newDeptModal} onOk={addNewDepartment}
        onCancel={() => { setNewDeptModal(false); setNewDeptName(''); }} okText="Add" destroyOnClose>
        <Input placeholder="Department name" value={newDeptName} onChange={e => setNewDeptName(e.target.value)} onPressEnter={addNewDepartment} />
      </Modal>

      {/* Add New Class Modal */}
      <Modal title="Add New Class" visible={newClassModal} onOk={addNewClass}
        onCancel={() => { setNewClassModal(false); setNewClassName(''); }} okText="Add" destroyOnClose>
        <Input placeholder="Class name" value={newClassName} onChange={e => setNewClassName(e.target.value)} onPressEnter={addNewClass} />
      </Modal>

      {/* ═══ SOURCE TRANSACTION DETAIL MODAL ══════════════════════════════ */}
      <Modal
        title={
          sourceRecord ? (
            <span>
              <Tag color={SOURCE_COLORS[sourceRecord.source_type] || 'default'} style={{ borderRadius: 4 }}>{sourceDetail?.label || SOURCE_LABELS[sourceRecord.source_type] || sourceRecord.source_type}</Tag>
              <span style={{ fontWeight: 600 }}>{sourceDetail?.number ? `${sourceDetail.number} ` : ''}</span>
              <Text type="secondary" style={{ fontSize: 13 }}>from journal entry #{sourceRecord.id}</Text>
            </span>
          ) : 'Source Transaction'
        }
        visible={!!sourceRecord}
        onCancel={() => setSourceRecord(null)}
        footer={[
          <Button key="close" onClick={() => setSourceRecord(null)} style={{ borderRadius: 6 }}>Close</Button>,
          sourceRecord && getSourceTransactionRoute(sourceRecord.source_type, sourceRecord.source_id, sourceRecord.source || {}, sourceRecord.id)
            ? <Button key="open" type="primary" icon={<FileTextOutlined />} style={{ borderRadius: 6 }}
                onClick={() => { const src = sourceRecord.source || {}; history.push(getSourceTransactionRoute(sourceRecord.source_type, sourceRecord.source_id, src, sourceRecord.id)); }}>
                Open Original
              </Button>
            : null,
        ]}
        width={820}
        bodyStyle={{ maxHeight: '70vh', overflowY: 'auto' }}
        destroyOnClose
      >
        {sourceLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin tip="Loading source transaction..." />
          </div>
        ) : sourceDetail ? (
          <div>
            <Row gutter={[16, 8]} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Text type="secondary" style={{ fontSize: 11 }}>{sourceDetail.partyLabel || 'Party'}</Text>
                {sourceDetail.partyType && sourceDetail.partyId ? (
                  <div style={{ fontWeight: 600 }}>
                    <a style={{ cursor: 'pointer', color: '#1890ff' }}
                      onClick={() => history.push(sourceDetail.partyType === 'customer'
                        ? `/main/customers/details/${sourceDetail.partyId}`
                        : `/main/vendors/details/${sourceDetail.partyId}`)}
                      title={`Open ${sourceDetail.partyLabel || 'party'} profile`}>
                      {sourceDetail.party || '—'}
                    </a>
                  </div>
                ) : <div style={{ fontWeight: 600 }}>{sourceDetail.party || '—'}</div>}
              </Col>
              <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Date</Text><div style={{ fontWeight: 600 }}>{sourceDetail.date ? moment(sourceDetail.date).format('MM/DD/YYYY') : '—'}</div></Col>
              <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Status</Text><div><Tag color={String(sourceDetail.status || '').toLowerCase().includes('paid') || String(sourceDetail.status || '').toLowerCase().includes('deposit') ? 'success' : 'default'} style={{ borderRadius: 4 }}>{sourceDetail.status || '—'}</Tag></div></Col>
              <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Total</Text><div style={{ fontWeight: 700, color: '#cf1322' }}>{fmtC(sourceDetail.total)}</div></Col>
            </Row>
            {sourceDetail.memo ? (
              <Alert type="info" showIcon style={{ marginBottom: 12, borderRadius: 8 }}
                message={<span><Text strong>Memo / Notes: </Text>{sourceDetail.memo}</span>} />
            ) : null}
            <Table
              columns={[
                { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
                { title: 'Account', dataIndex: 'account', key: 'account', width: 180, ellipsis: true,
                  render: v => v ? <Text>{v}</Text> : <Text type="secondary">-</Text> },
                { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 60, align: 'right',
                  render: v => (v != null && v !== '' && Number(v) !== 1) ? Number(v) : <Text type="secondary">1</Text> },
                { title: 'Rate', dataIndex: 'rate', key: 'rate', width: 110, align: 'right',
                  render: v => fmtC(v) },
                { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right',
                  render: v => <Text strong>{fmtC(v)}</Text> },
              ]}
              dataSource={(sourceDetail.lines || []).map((l, i) => ({ ...l, key: i }))}
              size="small" pagination={false} bordered
              summary={() => (
                <Table.Summary.Row style={{ background: '#fafafa' }}>
                  <Table.Summary.Cell colSpan={4}><Text strong>Total</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong style={{ color: '#cf1322' }}>{fmtC(sourceDetail.total)}</Text></Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </div>
        ) : (
          <Alert type="warning" showIcon message="Could not load the source transaction details." />
        )}
      </Modal>

      {/* ═══ ACCOUNT ACTIVITY MODAL (account register drill-down) ═══════ */}
      <Modal
        title={activity ? (
          <span>
            <AuditOutlined style={{ marginRight: 8 }} />
            <span style={{ fontWeight: 600 }}>Account Activity — {activity.accountName || `Account #${activity.accountId}`}</span>
          </span>
        ) : 'Account Activity'}
        visible={!!activity}
        onCancel={() => setActivity(null)}
        footer={[
          <Button key="coa" onClick={() => history.push('/main/accountant/chart-of-accounts')} style={{ borderRadius: 6 }}>
            Open Chart of Accounts
          </Button>,
          <Button key="close" type="primary" onClick={() => setActivity(null)} style={{ borderRadius: 6 }}>Close</Button>,
        ]}
        width={860}
        bodyStyle={{ maxHeight: '70vh', overflowY: 'auto' }}
        destroyOnClose
      >
        {activity && activity.loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin tip="Loading account activity..." /></div>
        ) : activity && activity.txns.length ? (
          <Table
            columns={[
              { title: 'Date', dataIndex: 'date', key: 'date', width: 100,
                render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
              { title: 'Journal #', dataIndex: 'journalId', key: 'journalId', width: 90,
                render: v => <Text code>{v}</Text> },
              { title: 'Reference', dataIndex: 'reference', key: 'reference', width: 120, ellipsis: true,
                render: v => v || <Text type="secondary">-</Text> },
              { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true,
                render: (v, r) => <span>{r.lineDesc || v || '-'}</span> },
              { title: 'Debit', dataIndex: 'debit', key: 'debit', width: 120, align: 'right',
                render: v => Number(v) > 0 ? <Text style={{ color: '#3f8600', fontWeight: 500 }}>{fmtC(v)}</Text> : <Text type="secondary">-</Text> },
              { title: 'Credit', dataIndex: 'credit', key: 'credit', width: 120, align: 'right',
                render: v => Number(v) > 0 ? <Text style={{ color: '#cf1322', fontWeight: 500 }}>{fmtC(v)}</Text> : <Text type="secondary">-</Text> },
            ]}
            dataSource={activity.txns.map((t, i) => ({ ...t, key: i }))}
            size="small" pagination={{ defaultPageSize: 15, showTotal: t => `${t} transactions` }}
            onRow={(t) => ({ onDoubleClick: () => {
              const rec = entries.find(e => e.id === t.journalId);
              if (rec && rec.source_type) openSource(rec);
            } })}
          />
        ) : (
          <Alert type="info" showIcon message="No journal activity found for this account." />
        )}
      </Modal>

      {/* ═══ JOURNAL ENTRY DETAIL MODAL (shared) ═════════════════════════ */}
      <JournalEntryDetailModal
        journalEntryId={journalDetailId}
        visible={!!journalDetailId}
        onClose={() => setJournalDetailId(null)}
      />
    </div>
  );
};

export default JournalEntries;