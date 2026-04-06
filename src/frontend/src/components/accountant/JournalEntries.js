import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Button, Form, Input, DatePicker, Select, Modal, message, Card, Row, Col,
  Tag, Space, Typography, Tooltip, Statistic, Badge, Alert, Divider, InputNumber,
  Popconfirm
} from 'antd';
import {
  PlusOutlined, SearchOutlined, ReloadOutlined, FileTextOutlined, CheckCircleOutlined,
  WarningOutlined, DeleteOutlined, CopyOutlined, FilterOutlined, DownloadOutlined,
  SwapOutlined, CalendarOutlined, AuditOutlined, SafetyCertificateOutlined,
  ExclamationCircleOutlined, MinusCircleOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { Option } = Select;
const { Title, Text } = Typography;

const JournalEntries = () => {
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
  const [dateFilter, setDateFilter] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [form] = Form.useForm();

  // Live balance tracking for the form
  const [formLines, setFormLines] = useState([]);

  useEffect(() => { loadData(); }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const safe = (fn) => fn?.()?.catch?.(() => null) || Promise.resolve(null);
      const [journalData, accountsData, entitiesData, cls, locs, deps] = await Promise.all([
        safe(() => window.electronAPI.getJournal()),
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
      setAccounts(Array.isArray(accountsData) ? accountsData : []);
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
  }, [entries, searchText, dateFilter, statusFilter]);

  // Summary stats
  const totalDebits = useMemo(() => filteredEntries.reduce((s, e) => s + e.debitTotal, 0), [filteredEntries]);
  const totalCredits = useMemo(() => filteredEntries.reduce((s, e) => s + e.creditTotal, 0), [filteredEntries]);
  const unbalancedCount = useMemo(() => entries.filter(e => !e.balanced).length, [entries]);

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

  // Expandable row renderer showing line items
  const expandedRowRender = (record) => {
    const lines = Array.isArray(record.lines) ? record.lines : [];
    if (!lines.length) return <Text type="secondary">No line items</Text>;
    const lineColumns = [
      { title: 'Account', dataIndex: 'account', key: 'account', render: v => <Text strong>{v || '-'}</Text> },
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
              <Table.Summary.Cell><Text strong>Totals</Text></Table.Summary.Cell>
              <Table.Summary.Cell align="right"><Text strong style={{ color: '#3f8600' }}>{fmtC(record.debitTotal)}</Text></Table.Summary.Cell>
              <Table.Summary.Cell align="right"><Text strong style={{ color: '#cf1322' }}>{fmtC(record.creditTotal)}</Text></Table.Summary.Cell>
            </Table.Summary.Row>
          )} />
        {record.entity_id && <Tag style={{ marginTop: 6 }}>Entity: {record.entity_id}</Tag>}
        {record.class && <Tag style={{ marginTop: 6 }}>Class: {record.class}</Tag>}
        {record.location && <Tag style={{ marginTop: 6 }}>Location: {record.location}</Tag>}
        {record.department && <Tag style={{ marginTop: 6 }}>Department: {record.department}</Tag>}
      </div>
    );
  };

  const columns = [
    { title: 'Date', dataIndex: 'date', key: 'date', width: 110, sorter: (a, b) => new Date(a.date) - new Date(b.date),
      defaultSortOrder: 'descend', render: v => v ? moment(v).format('DD MMM YYYY') : '-' },
    { title: 'Reference', dataIndex: 'reference', key: 'reference', width: 120, ellipsis: true,
      render: v => v ? <Tag style={{ fontSize: 11, borderRadius: 4 }}>{v}</Tag> : <Text type="secondary">-</Text> },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
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
            <Text type="secondary" style={{ fontSize: 12 }}>{filteredEntries.length} entries {searchText || dateFilter ? '(filtered)' : ''}</Text>
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
            style={{ width: 260, borderRadius: 6 }} allowClear />
          <DatePicker.RangePicker size="middle" value={dateFilter} onChange={setDateFilter}
            format="DD/MM/YYYY" allowClear style={{ borderRadius: 6 }} placeholder={['From date', 'To date']} />
          <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 140, borderRadius: 6 }}>
            <Option value="all">All Status</Option>
            <Option value="balanced">Balanced Only</Option>
            <Option value="unbalanced">Unbalanced Only</Option>
          </Select>
          {(searchText || dateFilter || statusFilter !== 'all') && (
            <Button size="small" onClick={() => { setSearchText(''); setDateFilter(null); setStatusFilter('all'); }}
              style={{ borderRadius: 6 }}>Clear Filters</Button>
          )}
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
          expandable={{ expandedRowRender, expandRowByClick: true }}
          pagination={{ pageSize: 20, showTotal: t => `${t} entries`, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'] }}
          scroll={{ x: 900 }}
          summary={() => filteredEntries.length > 0 ? (
            <Table.Summary fixed>
              <Table.Summary.Row style={{ background: '#fafafa' }}>
                <Table.Summary.Cell index={0} colSpan={4}><Text strong>Page Totals</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right"><Text strong style={{ color: '#3f8600' }}>{fmtC(totalDebits)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right"><Text strong style={{ color: '#cf1322' }}>{fmtC(totalCredits)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={6} colSpan={3}>
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
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
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
                <Select allowClear placeholder="Select class" showSearch optionFilterProp="children">
                  {classes.map(c => <Option key={c.id} value={c.name}>{c.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="location" label="Location">
                <Select allowClear placeholder="Select location" showSearch optionFilterProp="children">
                  {locations.map(l => <Option key={l.id} value={l.name}>{l.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="department" label="Department">
                <Select allowClear placeholder="Select department" showSearch optionFilterProp="children">
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
                      <Select placeholder="Select account" showSearch optionFilterProp="children" size="middle">
                        {accounts.map(account => (
                          <Option key={account.id} value={account.id}>
                            {account.account_number ? `${account.account_number} - ` : ''}{account.accountName || account.name}
                          </Option>
                        ))}
                      </Select>
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
    </div>
  );
};

export default JournalEntries;