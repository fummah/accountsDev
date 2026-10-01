import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import {
  Card, Table, Button, Space, Drawer, Tag, Row, Col, Statistic, message, Input, Select,
  DatePicker, Empty, Alert, Dropdown, Menu, Modal, Skeleton, Typography,
} from 'antd';
import {
  EyeOutlined, ReloadOutlined, FileTextOutlined, UploadOutlined, LinkOutlined, MoreOutlined,
  CheckCircleOutlined, WarningOutlined, DeleteOutlined, BankOutlined, ReconciliationOutlined,
  BookOutlined, SyncOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';
import { getBankAccounts } from '../../../utils/accounts';

const { Text } = Typography;

const IMPORT_STATUS = {
  Uploaded: { color: 'default', label: 'Uploaded' },
  Parsing: { color: 'processing', label: 'Parsing' },
  Parsed: { color: 'blue', label: 'Parsed' },
  'Needs Review': { color: 'orange', label: 'Needs Review' },
  Failed: { color: 'red', label: 'Failed' },
};
const RECON_STATUS = {
  'Not Reconciled': { color: 'default', label: 'Not Reconciled' },
  'In Progress': { color: 'gold', label: 'In Progress' },
  Reconciled: { color: 'green', label: 'Reconciled' },
};

const Statements = () => {
  const { symbol: cSym } = useCurrency();
  const history = useHistory();
  const [statements, setStatements] = useState([]);
  const [summary, setSummary] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [allAccounts, setAllAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ search: '', bankId: 'all', status: 'all', recon: 'all', range: null });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [linkFor, setLinkFor] = useState(null);
  const [linkAccountId, setLinkAccountId] = useState(null);
  const [matchFor, setMatchFor] = useState(null);
  const [matchCandidates, setMatchCandidates] = useState([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const money = (v, cur) => `${cur || cSym} ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, sum, accs, all] = await Promise.all([
        window.electronAPI.listParsedStatements(),
        window.electronAPI.getBankStatementsSummary?.().catch(() => null),
        window.electronAPI.getChartOfAccounts?.({ type: 'Bank' }).catch(() => []),
        window.electronAPI.getChartOfAccounts?.().catch(() => []),
      ]);
      if (list && list.error) throw new Error(list.error);
      setStatements(Array.isArray(list) ? list : []);
      setSummary(sum && !sum.error ? sum : null);
      const arr = Array.isArray(accs) ? accs : (accs?.data || []);
      setBankAccounts(getBankAccounts(arr));
      setAllAccounts(Array.isArray(all) ? all : (all?.data || []));
    } catch (e) {
      console.error('[bank statements] load failed:', e);
      setError(e?.message || String(e));
      setStatements([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (st) => {
    setSelected(st);
    setDetails(null);
    setDetailLoading(true);
    setDrawerOpen(true);
    try {
      const d = await window.electronAPI.getParsedStatement(st.id);
      setDetails(d && !d.error ? d : null);
    } catch { setDetails(null); }
    finally { setDetailLoading(false); }
  };
  const reloadDetail = async (id) => {
    try {
      const d = await window.electronAPI.getParsedStatement(id);
      setDetails(d && !d.error ? d : null);
    } catch { /* ignore */ }
    load();
  };

  const bankName = (st) => st.bank_account_name || st.bankName || 'Not Linked';
  const isLinked = (st) => st.bank_account_id != null;

  const startReconciliation = (st) => {
    if (!isLinked(st)) { message.warning('Link a bank account before reconciling.'); return; }
    const params = new URLSearchParams();
    params.set('accountId', st.bank_account_id);
    params.set('statementId', st.id);
    if (st.closing_balance != null) params.set('closing', st.closing_balance);
    if (st.periodEnd) params.set('end', st.periodEnd);
    history.push(`/main/banking/reconcile?${params.toString()}`);
  };
  const viewLedger = (st) => {
    if (!isLinked(st)) { message.warning('Link a bank account first.'); return; }
    history.push(`/main/accountant/general-ledger?accountId=${st.bank_account_id}`);
  };
  const viewBankAccount = (st) => {
    if (!isLinked(st)) { message.warning('Link a bank account first.'); return; }
    history.push(`/main/banking/accounts?accountId=${st.bank_account_id}`);
  };

  const confirmDelete = async (st) => {
    const res = await window.electronAPI.deleteBankStatement?.(st.id);
    if (res?.success) { message.success('Statement removed'); load(); }
    else message.error(res?.error || 'Delete failed');
  };

  const saveLink = async () => {
    if (!linkFor || !linkAccountId) { message.warning('Select a bank account'); return; }
    setBusy(true);
    const res = await window.electronAPI.linkBankStatementAccount?.(linkFor.id, linkAccountId);
    setBusy(false);
    if (res?.success) { message.success('Bank account linked'); setLinkFor(null); setLinkAccountId(null); load(); if (details) reloadDetail(details.id); }
    else message.error(res?.error || 'Link failed');
  };

  const openMatch = async (line) => {
    setMatchFor(line);
    setMatchCandidates([]);
    setMatchLoading(true);
    try {
      const st = details;
      const res = await window.electronAPI.getUnreconciledTransactions?.({ accountId: st?.bank_account_id });
      const rows = Array.isArray(res) ? res : (res?.transactions || res?.data || []);
      // rank by amount closeness then date closeness
      const ranked = rows
        .map((t) => ({ ...t, _amt: Math.abs(Number(t.amount || 0) - Number(line.amount || 0)) }))
        .sort((a, b) => a._amt - b._amt)
        .slice(0, 25);
      setMatchCandidates(ranked);
    } catch { setMatchCandidates([]); }
    finally { setMatchLoading(false); }
  };
  const applyMatch = async (txn) => {
    if (!matchFor) return;
    setBusy(true);
    const res = await window.electronAPI.matchBankStatementLine?.(matchFor.id, { matchedType: 'transaction', matchedId: txn.id });
    setBusy(false);
    if (res?.success) { message.success('Matched'); setMatchFor(null); reloadDetail(details.id); }
    else message.error(res?.error || 'Match failed');
  };
  const unmatch = async (line) => {
    const res = await window.electronAPI.unmatchBankStatementLine?.(line.id);
    if (res?.success) { message.success('Unmatched'); reloadDetail(details.id); }
  };
  const categorize = async (line, accountId) => {
    const res = await window.electronAPI.categorizeBankStatementLine?.(line.id, accountId);
    if (res?.success) { reloadDetail(details.id); }
  };

  const filtered = useMemo(() => {
    let list = statements;
    const q = filters.search.toLowerCase().trim();
    if (q) list = list.filter((s) => `${bankName(s)} ${s.source_file || ''} BS-${String(s.id).padStart(5, '0')}`.toLowerCase().includes(q));
    if (filters.bankId !== 'all') list = list.filter((s) => Number(s.bank_account_id) === Number(filters.bankId));
    if (filters.status !== 'all') list = list.filter((s) => (s.status || 'Parsed') === filters.status);
    if (filters.recon !== 'all') list = list.filter((s) => (s.reconciliation_status || 'Not Reconciled') === filters.recon);
    if (filters.range && filters.range[0] && filters.range[1]) {
      const a = filters.range[0].format('YYYY-MM-DD'); const b = filters.range[1].format('YYYY-MM-DD');
      list = list.filter((s) => s.periodStart && s.periodEnd && s.periodStart <= b && s.periodEnd >= a);
    }
    return list;
  }, [statements, filters]);

  const attention = useMemo(() => statements.filter((s) =>
    (s.status === 'Failed') || !isLinked(s) || Number(s.unmatched) > 0 || s.reconciliation_status === 'In Progress'
  ).slice(0, 8), [statements]);

  const clearFilters = () => setFilters({ search: '', bankId: 'all', status: 'all', recon: 'all', range: null });

  const columns = [
    { title: 'Statement', key: 'statement', width: 150, render: (_, r) => (
      <a onClick={() => openDetail(r)} style={{ fontWeight: 600 }}>BS-{String(r.id).padStart(5, '0')}</a>
    ) },
    { title: 'Bank Account', key: 'bank', width: 190, render: (_, r) => (
      isLinked(r)
        ? <a onClick={() => viewBankAccount(r)}>{r.bank_account_name || `Account #${r.bank_account_id}`}</a>
        : <Tag icon={<LinkOutlined />} color="orange" style={{ cursor: 'pointer' }} onClick={() => { setLinkFor(r); setLinkAccountId(null); }}>Link Account</Tag>
    ) },
    { title: 'Period', key: 'period', width: 190, render: (_, r) => (
      r.periodStart && r.periodEnd ? `${moment(r.periodStart).format('DD MMM YYYY')} – ${moment(r.periodEnd).format('DD MMM YYYY')}` : <Text type="secondary">—</Text>
    ) },
    { title: 'Opening', key: 'open', width: 120, align: 'right', render: (_, r) => r.opening_balance == null ? <Text type="secondary">—</Text> : money(r.opening_balance, r.currency) },
    { title: 'Closing', key: 'close', width: 120, align: 'right', render: (_, r) => r.closing_balance == null ? <Text type="secondary">—</Text> : money(r.closing_balance, r.currency) },
    { title: 'Transactions', dataIndex: 'transactions', key: 'tx', width: 110, align: 'right', sorter: (a, b) => Number(a.transactions || 0) - Number(b.transactions || 0), render: (v) => Number(v || 0) },
    { title: 'Unmatched', dataIndex: 'unmatched', key: 'un', width: 110, align: 'right', sorter: (a, b) => Number(a.unmatched || 0) - Number(b.unmatched || 0),
      render: (v) => Number(v) > 0 ? <Text strong style={{ color: '#fa8c16' }}>{Number(v)}</Text> : <Text type="secondary">0</Text> },
    { title: 'Currency', dataIndex: 'currency', key: 'cur', width: 90, render: (v) => v ? <Tag>{v}</Tag> : <Text type="secondary">—</Text> },
    { title: 'Import', dataIndex: 'status', key: 'status', width: 130, render: (v) => { const m = IMPORT_STATUS[v] || IMPORT_STATUS.Parsed; return <Tag color={m.color}>{m.label}</Tag>; } },
    { title: 'Reconciliation', dataIndex: 'reconciliation_status', key: 'recon', width: 150, render: (v) => { const m = RECON_STATUS[v] || RECON_STATUS['Not Reconciled']; return <Tag color={m.color}>{m.label}</Tag>; } },
    { title: 'Imported', dataIndex: 'uploadedAt', key: 'imported', width: 120, render: (v) => v ? moment(v).format('DD MMM YYYY') : '—' },
    { title: 'Actions', key: 'actions', width: 90, align: 'center', fixed: 'right', render: (_, r) => (
      <Dropdown trigger={['click']} overlay={(
        <Menu>
          <Menu.Item key="view" icon={<EyeOutlined />} onClick={() => openDetail(r)}>View Statement</Menu.Item>
          <Menu.Item key="review" icon={<FileTextOutlined />} onClick={() => openDetail(r)}>Review Transactions</Menu.Item>
          <Menu.Item key="link" icon={<LinkOutlined />} onClick={() => { setLinkFor(r); setLinkAccountId(r.bank_account_id || null); }}>{isLinked(r) ? 'Change Bank Account' : 'Link Bank Account'}</Menu.Item>
          <Menu.Divider />
          <Menu.Item key="reconcile" icon={<ReconciliationOutlined />} disabled={!isLinked(r)} onClick={() => startReconciliation(r)}>Start Reconciliation</Menu.Item>
          <Menu.Item key="ledger" icon={<BookOutlined />} disabled={!isLinked(r)} onClick={() => viewLedger(r)}>View Ledger</Menu.Item>
          <Menu.Item key="bank" icon={<BankOutlined />} disabled={!isLinked(r)} onClick={() => viewBankAccount(r)}>View Bank Account</Menu.Item>
          <Menu.Divider />
          <Menu.Item key="reprocess" icon={<SyncOutlined />} onClick={() => history.push('/main/bank-statements/upload')}>Reprocess</Menu.Item>
          <Menu.Item key="delete" icon={<DeleteOutlined />} danger onClick={() => {
            Modal.confirm({
              title: `Remove statement BS-${String(r.id).padStart(5, '0')}?`,
              content: 'This removes the imported source data. Accounting transactions created/matched from it are NOT deleted.',
              okText: 'Remove', okButtonProps: { danger: true }, onOk: () => confirmDelete(r),
            });
          }}>Delete Import</Menu.Item>
        </Menu>
      )}>
        <Button size="small" icon={<MoreOutlined />} />
      </Dropdown>
    ) },
  ];

  const txColumns = [
    { title: 'Date', dataIndex: 'date', key: 'date', width: 110, render: (v) => v ? moment(v).format('DD MMM YYYY') : '—' },
    { title: 'Description', dataIndex: 'description', key: 'desc', ellipsis: true },
    { title: 'Reference', dataIndex: 'reference', key: 'ref', width: 130, render: (v) => v || <Text type="secondary">—</Text> },
    { title: 'Money In', key: 'in', width: 120, align: 'right', render: (_, r) => Number(r.amount) > 0 ? <Text style={{ color: '#3f8600' }}>{money(r.amount)}</Text> : <Text type="secondary">—</Text> },
    { title: 'Money Out', key: 'out', width: 120, align: 'right', render: (_, r) => Number(r.amount) < 0 ? <Text style={{ color: '#cf1322' }}>{money(Math.abs(r.amount))}</Text> : <Text type="secondary">—</Text> },
    { title: 'Balance', dataIndex: 'running_balance', key: 'bal', width: 120, align: 'right', render: (v) => v == null ? <Text type="secondary">—</Text> : money(v) },
    { title: 'Category / Account', key: 'cat', width: 210, render: (_, r) => (
      <Select size="small" placeholder="Categorize" style={{ width: 185 }} showSearch optionFilterProp="children"
        value={r.category_account_id || undefined} onChange={(val) => categorize(r, val)}>
        {allAccounts.filter((a) => (a.status || 'Active') !== 'Inactive').map((a) => (
          <Select.Option key={a.id} value={a.id}>{a.number ? `${a.number} ${a.name}` : a.name}</Select.Option>
        ))}
      </Select>
    ) },
    { title: 'Linked Transaction', key: 'linked', width: 150, render: (_, r) => r.matched ? <Tag color="green">{(r.matched_type || 'txn')} #{r.matched_id}</Tag> : <Text type="secondary">—</Text> },
    { title: 'Status', key: 'status', width: 110, render: (_, r) => (r.matched || r.category_account_id) ? <Tag color="green">Matched</Tag> : <Tag color="orange">Unmatched</Tag> },
    { title: 'Actions', key: 'actions', width: 170, render: (_, r) => (
      <Space size={4}>
        {!r.matched && <Button size="small" type="link" onClick={() => openMatch(r)}>Match</Button>}
        {r.matched && <Button size="small" type="link" onClick={() => unmatch(r)}>Unmatch</Button>}
      </Space>
    ) },
  ];

  const d = details || {};
  const cards = [
    { title: 'Total Statements', value: summary?.totalStatements, icon: <FileTextOutlined />, color: '#1890ff' },
    { title: 'Transactions', value: summary?.importedTransactions, icon: <FileTextOutlined />, color: '#13c2c2' },
    { title: 'Unmatched', value: summary?.unmatchedTransactions, icon: <WarningOutlined />, color: '#fa8c16' },
    { title: 'Reconciled', value: summary?.reconciledStatements, icon: <CheckCircleOutlined />, color: '#52c41a' },
  ];

  return (
    <div className="al-modern-page" style={{ padding: 24 }}>
      <div className="al-page-head" style={{ marginBottom: 16 }}>
        <div className="al-modern-head">
          <div className="al-modern-badge" style={{ background: 'linear-gradient(135deg,#1890ff,#69c0ff)' }}><BankOutlined /></div>
          <div>
            <h3 style={{ margin: 0 }}>Bank Statements</h3>
            <span style={{ color: '#667085' }}>Import, review, match and reconcile bank statement activity</span>
          </div>
        </div>
        <Space className="al-list-toolbar" align="center">
          <Button className="gx-btn-primary" icon={<UploadOutlined />} onClick={() => history.push('/main/bank-statements/upload')}>Upload Statement</Button>
          <Button className="gx-btn-info" icon={<ReloadOutlined />} loading={loading} onClick={load}>Refresh</Button>
        </Space>
      </div>

      {error && <Alert type="error" showIcon style={{ marginBottom: 16, borderRadius: 10 }} message="Unable to load bank statements." description={error} action={<Button size="small" onClick={load}>Retry</Button>} />}

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {cards.map((c) => (
          <Col xs={24} sm={12} lg={6} key={c.title}>
            <Card className="al-stat-card" loading={loading} style={{ borderTop: `3px solid ${c.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#fff', background: `linear-gradient(135deg, ${c.color}, ${c.color}cc)` }}>{c.icon}</div>
                <div>
                  <div style={{ color: '#667085', fontSize: 12, fontWeight: 500 }}>{c.title}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#1f2d3d' }}>{c.value == null ? '—' : Number(c.value).toLocaleString('en-US')}</div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card className="al-stat-card" bodyStyle={{ padding: 0 }}>
        <div className="al-list-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: 16, borderBottom: '1px solid #f0f0f0' }}>
          <Input placeholder="Search statement or bank..." allowClear style={{ width: 220 }} value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
          <Select style={{ width: 180 }} value={filters.bankId} onChange={(v) => setFilters((f) => ({ ...f, bankId: v }))}>
            <Select.Option value="all">All Bank Accounts</Select.Option>
            {bankAccounts.map((b) => <Select.Option key={b.id} value={b.id}>{b.name}</Select.Option>)}
          </Select>
          <Select style={{ width: 150 }} value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
            <Select.Option value="all">All Statuses</Select.Option>
            {Object.keys(IMPORT_STATUS).map((k) => <Select.Option key={k} value={k}>{k}</Select.Option>)}
          </Select>
          <Select style={{ width: 170 }} value={filters.recon} onChange={(v) => setFilters((f) => ({ ...f, recon: v }))}>
            <Select.Option value="all">All Reconciliation</Select.Option>
            {Object.keys(RECON_STATUS).map((k) => <Select.Option key={k} value={k}>{k}</Select.Option>)}
          </Select>
          <DatePicker.RangePicker value={filters.range} onChange={(r) => setFilters((f) => ({ ...f, range: r }))} />
          <Button onClick={clearFilters}>Clear Filters</Button>
        </div>

        {attention.length > 0 && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', background: '#fffbe6' }}>
            <Space size={8} wrap>
              <ExclamationCircleOutlined style={{ color: '#fa8c16' }} />
              <Text strong>Statements Requiring Attention:</Text>
              {attention.map((s) => (
                <Tag key={s.id} color={s.status === 'Failed' ? 'red' : !isLinked(s) ? 'orange' : 'gold'} style={{ cursor: 'pointer' }} onClick={() => openDetail(s)}>
                  BS-{String(s.id).padStart(5, '0')}{s.status === 'Failed' ? ' · Failed' : !isLinked(s) ? ' · Not Linked' : ` · ${s.unmatched} unmatched`}
                </Tag>
              ))}
            </Space>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 6 }} /></div>
        ) : !error && filtered.length === 0 ? (
          <div style={{ padding: 40 }}>
            <Empty description={(
              <>
                <div>No bank statements imported yet.</div>
                <Text type="secondary">Upload a statement to review transactions and begin reconciliation.</Text>
              </>
            )}>
              <Button type="primary" icon={<UploadOutlined />} onClick={() => history.push('/main/bank-statements/upload')}>Upload Statement</Button>
            </Empty>
          </div>
        ) : (
          <Table columns={columns} dataSource={filtered} loading={loading} rowKey="id" size="middle" scroll={{ x: 1500 }}
            pagination={{ defaultPageSize: 15, showSizeChanger: true, showTotal: (t) => `${t} statements`, style: { margin: 16 } }} />
        )}
      </Card>

      {/* ── Statement detail / review drawer ── */}
      <Drawer
        title={selected ? `Bank Statement BS-${String(selected.id).padStart(5, '0')} — ${bankName(selected)}` : 'Bank Statement'}
        width={Math.min(Math.max(1000, Math.round((typeof window !== 'undefined' ? window.innerWidth : 1400) * 0.85)), 1500)}
        visible={drawerOpen} onClose={() => setDrawerOpen(false)} destroyOnClose
      >
        {detailLoading ? <Skeleton active /> : !details ? <Empty description="Statement not found" /> : (
          <>
            <Space wrap style={{ marginBottom: 12 }}>
              <Tag color={(IMPORT_STATUS[d.status] || IMPORT_STATUS.Parsed).color}>{(IMPORT_STATUS[d.status] || IMPORT_STATUS.Parsed).label}</Tag>
              <Tag color={(RECON_STATUS[d.reconciliation_status] || RECON_STATUS['Not Reconciled']).color}>{(RECON_STATUS[d.reconciliation_status] || RECON_STATUS['Not Reconciled']).label}</Tag>
              {d.source_file && <Text type="secondary">File: {d.source_file}</Text>}
              <Text type="secondary">Imported {d.uploadedAt ? moment(d.uploadedAt).format('DD MMM YYYY HH:mm') : '—'}</Text>
            </Space>

            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
              <Col xs={12} md={4}><Card size="small"><Statistic title="Opening" value={d.opening_balance == null ? '—' : d.opening_balance} precision={d.opening_balance == null ? 0 : 2} prefix={d.opening_balance == null ? '' : cSym} /></Card></Col>
              <Col xs={12} md={4}><Card size="small"><Statistic title="Money In" value={d.moneyIn || 0} precision={2} prefix={cSym} valueStyle={{ color: '#3f8600' }} /></Card></Col>
              <Col xs={12} md={4}><Card size="small"><Statistic title="Money Out" value={d.moneyOut || 0} precision={2} prefix={cSym} valueStyle={{ color: '#cf1322' }} /></Card></Col>
              <Col xs={12} md={4}><Card size="small"><Statistic title="Closing" value={d.closing_balance == null ? '—' : d.closing_balance} precision={d.closing_balance == null ? 0 : 2} prefix={d.closing_balance == null ? '' : cSym} /></Card></Col>
              <Col xs={12} md={4}><Card size="small"><Statistic title="Transactions" value={d.transactionCount || 0} /></Card></Col>
              <Col xs={12} md={4}><Card size="small"><Statistic title="Unmatched" value={d.unmatched || 0} valueStyle={{ color: Number(d.unmatched) > 0 ? '#fa8c16' : '#3f8600' }} /></Card></Col>
            </Row>

            <Space style={{ marginBottom: 12 }} wrap>
              <Button icon={<ReconciliationOutlined />} disabled={!isLinked(d)} onClick={() => startReconciliation(d)}>Start Reconciliation</Button>
              <Button icon={<BookOutlined />} disabled={!isLinked(d)} onClick={() => viewLedger(d)}>View Ledger</Button>
              <Button icon={<BankOutlined />} disabled={!isLinked(d)} onClick={() => viewBankAccount(d)}>View Bank Account</Button>
              <Button icon={<LinkOutlined />} onClick={() => { setLinkFor(d); setLinkAccountId(d.bank_account_id || null); }}>{isLinked(d) ? 'Change Bank Account' : 'Link Bank Account'}</Button>
            </Space>

            <Table columns={txColumns} dataSource={d.transactions || []} rowKey="id" size="small"
              pagination={{ defaultPageSize: 25, showSizeChanger: true, showTotal: (t) => `${t} lines` }} scroll={{ x: 1100 }} />
          </>
        )}
      </Drawer>

      {/* Link account modal */}
      <Modal title="Link Bank Account" visible={!!linkFor} onCancel={() => setLinkFor(null)} onOk={saveLink} confirmLoading={busy} okText="Link">
        <Text type="secondary">Choose the AccuLedger bank account this statement belongs to.</Text>
        <Select style={{ width: '100%', marginTop: 12 }} showSearch optionFilterProp="children" placeholder="Select bank account"
          value={linkAccountId} onChange={setLinkAccountId}>
          {bankAccounts.map((b) => <Select.Option key={b.id} value={b.id}>{b.name}</Select.Option>)}
        </Select>
      </Modal>

      {/* Match modal */}
      <Modal title={`Match line: ${matchFor?.description || ''}`} visible={!!matchFor} onCancel={() => setMatchFor(null)} footer={null} width={720} destroyOnClose>
        <Text type="secondary">Link this statement line to an existing AccuLedger transaction. No new accounting entry is created.</Text>
        <Table style={{ marginTop: 12 }} size="small" loading={matchLoading} dataSource={matchCandidates} rowKey="id" pagination={{ pageSize: 8 }}
          locale={{ emptyText: <Empty description="No unreconciled transactions found for this account." /> }}
          columns={[
            { title: 'Date', dataIndex: 'date', key: 'date', width: 110, render: (v) => v ? moment(v).format('DD MMM YYYY') : '—' },
            { title: 'Description', dataIndex: 'description', key: 'd', ellipsis: true },
            { title: 'Amount', dataIndex: 'amount', key: 'a', width: 130, align: 'right', render: (v) => money(v) },
            { title: '', key: 'x', width: 90, render: (_, t) => <Button size="small" type="primary" onClick={() => applyMatch(t)}>Match</Button> },
          ]} />
      </Modal>
    </div>
  );
};

export default Statements;
