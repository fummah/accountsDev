import React, { useState, useEffect, useMemo } from 'react';
import { Table, Select, DatePicker, Space, Card, Statistic, Button, Row, Col, Input, Tag, Typography, Tooltip, Divider, message, Modal, Alert, Spin } from 'antd';
import { PrinterOutlined, DownloadOutlined, SyncOutlined, SearchOutlined, CalendarOutlined, BookOutlined, FileTextOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';
import { useHistory, useLocation } from 'react-router-dom';
import { dedupeAccounts } from '../../utils/accounts';
import { SOURCE_LABELS, SOURCE_COLORS, getSourceTransactionRoute } from '../../utils/sourceRoutes';
import AccountSelect from '../shared/AccountSelect';
import JournalEntryDetailModal from './JournalEntryDetailModal';

const { Option } = Select;
const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Guards the ledger against render-time crashes so the user sees an error
// (and a way to recover) instead of a blank page.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error('General Ledger render error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <Alert
            type="error"
            showIcon
            message="General Ledger could not be displayed"
            description="An unexpected error occurred while rendering this page."
            action={<Button type="primary" style={{ borderRadius: 6 }} onClick={() => this.setState({ hasError: false })}>Retry</Button>}
          />
        </div>
      );
    }
    return this.props.children;
  }
}

const GeneralLedger = () => {
  const history = useHistory();
  const location = useLocation();
  const { symbol: cSym } = useCurrency();
  const fmtC = (v) => `${cSym} ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const [accounts, setAccounts] = useState([]);
  const [allLedger, setAllLedger] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  // The first ledger row (Opening Balance / Balance Brought Forward), computed
  // by the backend from chart_of_accounts.openingBalance + posted lines dated
  // before the period. null = not loaded yet.
  const [openingState, setOpeningState] = useState(null);
  const [dateRange, setDateRange] = useState([moment().startOf('year'), moment().endOf('year')]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [loadError, setLoadError] = useState(null);

  // Drill-down state
  const [journalDetail, setJournalDetail] = useState(null);
  const [sourceRecord, setSourceRecord] = useState(null);
  const [sourceDetail, setSourceDetail] = useState(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceDeposit, setSourceDeposit] = useState(null);

  useEffect(() => { loadAccounts(); }, []);

  // Deep-link support: ?account=<id>
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const acct = params.get('account');
    if (acct) setSelectedAccount(Number(acct));
  }, [location.search]);

  // Deep-link support: ?journal=<id> opens that journal entry's detail modal
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const jid = params.get('journal');
    if (jid) openJournal(Number(jid));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    if (selectedAccount) loadLedger();
    else { setAllLedger([]); setOpeningState(null); }
  }, [selectedAccount, dateRange]);

  const loadAccounts = async () => {
    try {
      const accountsData = await window.electronAPI.getChartOfAccounts();
      setAccounts(Array.isArray(accountsData) ? dedupeAccounts(accountsData) : []);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  // Server-side per-account load (single ledger interface).
  // Two calls, both read-only:
  //   1. the account's posted lines inside the period (the ledger body);
  //   2. the opening / brought-forward state — the account's opening balance
  //      plus everything posted BEFORE the period start.
  // The opening figure is NEVER written to the ledger: it already lives on the
  // account and is already inside the computed balance, so the row only makes
  // the arithmetic visible. `debit`/`credit` on that row stay 0.
  const loadLedger = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      if (!selectedAccount || !dateRange || !dateRange[0] || !dateRange[1]) {
        setAllLedger([]); setOpeningState(null); return;
      }
      const from = dateRange[0].format('YYYY-MM-DD');
      const to = dateRange[1].format('YYYY-MM-DD');
      const [raw, opening] = await Promise.all([
        window.electronAPI.journalByAccount(selectedAccount, { from, to, limit: 2000 }),
        window.electronAPI.ledgerOpeningRow({ accountId: selectedAccount, before: from }),
      ]);
      setAllLedger(Array.isArray(raw) ? raw : []);
      setOpeningState(opening && opening.success ? opening : null);
    } catch (error) {
      console.error('Failed to load ledger:', error);
      setAllLedger([]);
      setOpeningState(null);
      setLoadError(error && error.message ? error.message : String(error || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const selectedAccountData = accounts.find(a => a.id === selectedAccount);


  const filteredLedger = useMemo(() => {
    if (!searchText) return allLedger;
    const q = searchText.toLowerCase();
    return allLedger.filter(e =>
      (e.description || '').toLowerCase().includes(q) ||
      (e.lineDesc || '').toLowerCase().includes(q) ||
      (e.reference || '').toLowerCase().includes(q)
    );
  }, [allLedger, searchText]);

  const sortedLedger = useMemo(() =>
    [...filteredLedger].sort((a, b) => new Date(a.date) - new Date(b.date) || Number(a.id) - Number(b.id)),
    [filteredLedger]);

  const totalDebit = sortedLedger.reduce((s, e) => s + (Number(e.debit) || 0), 0);
  const totalCredit = sortedLedger.reduce((s, e) => s + (Number(e.credit) || 0), 0);
  const netMovement = totalDebit - totalCredit;

  // The account's normal balance controls the running-balance sign: Debit-normal
  // accounts (Asset/Bank/Expense) grow by (debit - credit); Credit-normal accounts
  // (Liability/Equity/Income) grow by (credit - debit). The backend resolves this
  // from the account's TYPE (services/normalBalance.js), preferring the
  // classification over the stored side, and sends it back on openingState. The
  // local fallback mirrors that rule for the instant before the state loads.
  const normalBalance = openingState?.normalBalance
    || (String(selectedAccountData?.normalBalance || '').trim().toLowerCase() === 'credit' ? 'Credit'
      : String(selectedAccountData?.accountType || selectedAccountData?.type || '').trim().toLowerCase() === 'credit' ? 'Credit'
      : 'Debit');
  const balanceDelta = (e) => (normalBalance === 'Credit'
    ? (Number(e.credit) || 0) - (Number(e.debit) || 0)
    : (Number(e.debit) || 0) - (Number(e.credit) || 0));

  // Starting point of the period, computed by the backend:
  //   opening balance (from chart_of_accounts.openingBalance, on the account's
  //   own normal side) + net effect of every posted line dated BEFORE the period
  //   start.
  // This is the Balance Brought Forward when earlier activity exists, and the
  // account's Opening Balance when the period starts at (or before) inception.
  // It is the SAME figure already inside the account's computed balance — shown
  // as a row, never added twice.
  const startingBalance = Number(openingState?.balance || 0);
  const isOpeningRow = !!openingState?.isOpening;

  // Period-scoped closing balance: brought-forward balance plus this period's net
  // movement. The chart-of-accounts "balance" is the current total and would leak
  // activity from outside the selected date range into the report.
  const closingBalance = startingBalance + sortedLedger.reduce((s, e) => s + balanceDelta(e), 0);

  // Opening Balance / Balance Brought Forward as the first ledger row.
  // `date` is the period start (the moment the brought-forward figure is true
  // as of); with no period it is the account's own openingBalanceDate, and null
  // when that is unset — today's date is never invented.
  const openingRow = useMemo(() => {
    if (!selectedAccountData || !openingState) return [];
    const date = openingState.beforeDate
      || (dateRange && dateRange[0] ? dateRange[0].format('YYYY-MM-DD') : null)
      || openingState.openingBalanceDate
      || null;
    return [{
      id: 'opening',
      journalId: null,
      date,
      reference: '',
      lineDesc: openingState.label || 'Opening Balance',
      // Not a posting: zero on both sides, so it can never enter a column total.
      debit: 0,
      credit: 0,
      balance: startingBalance,
      isOpening: true,
      _idx: -1,
    }];
  }, [selectedAccountData, openingState, dateRange, startingBalance]);

  // Running balance starts from the opening / brought-forward balance
  const withRunningBalance = useMemo(() => {
    let balance = startingBalance;
    return openingRow.concat(sortedLedger.map((entry, idx) => {
      balance += balanceDelta(entry);
      return { ...entry, _idx: idx, balance };
    }));
  }, [openingRow, sortedLedger, startingBalance]);

  // ── Drill-down: open a journal entry by id ──────────────────────────────
  const openJournal = (journalId) => {
    if (!journalId) return;
    setJournalDetail(journalId);
  };

  // ── Drill-down: open the source transaction behind a journal entry ──────
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

  // ── Drill-down: unified source handler (deposit modal / source modal / route) ──
  const navigateToSource = async (r) => {
    if (!r || !r.source_type) return;
    if (r.source_type === 'deposit' && r.source_id != null) {
      try {
        const dep = await window.electronAPI.getDeposit?.(r.source_id);
        if (dep && !dep.error) setSourceDeposit(dep);
      } catch { message.error('Failed to load deposit details'); }
      return;
    }
    if ((r.source_type === 'transaction' || r.source_type === 'expense' || r.source_type === 'bill_payment') && r.source_id != null) {
      openSource(r);
      return;
    }
    const route = getSourceTransactionRoute(r.source_type, r.source_id, r.source || {}, r.journalId);
    if (route) history.push(route);
  };

  const columns = [
    { title: 'Date', dataIndex: 'date', key: 'date', width: 110, sorter: (a, b) => new Date(a.date) - new Date(b.date), render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
    {
      title: 'Journal', dataIndex: 'journalId', key: 'journalId', width: 80,
      render: v => v
        ? <a onClick={(e) => { e.stopPropagation(); openJournal(v); }} style={{ cursor: 'pointer' }} title="Open journal entry"><Text code style={{ cursor: 'pointer' }}>#{v}</Text></a>
        : '-',
    },
    { title: 'Description', dataIndex: 'lineDesc', key: 'lineDesc', ellipsis: true, render: (v, r) => (
      r.source_type
        ? <a onClick={(e) => { e.stopPropagation(); navigateToSource(r); }} style={{ cursor: 'pointer' }} title="View source transaction">{v || r.description || '-'}</a>
        : <span>{v || r.description || '-'}</span>
    ) },
    { title: 'Reference', dataIndex: 'reference', key: 'reference', width: 120, ellipsis: true, render: v => v || <Text type="secondary">-</Text> },
    {
      title: 'Type', key: 'type', width: 110,
      render: (_, r) => {
        if (r.isOpening) {
          return <Tag color="purple" style={{ borderRadius: 4, fontSize: 11 }}>{r.lineDesc === 'Balance Brought Forward' ? 'BBF' : 'Opening'}</Tag>;
        }
        const st = r.source_type || 'manual';
        const label = SOURCE_LABELS[st] || String(st).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        if (r.source_type) {
          return (
            <a onClick={(e) => { e.stopPropagation(); navigateToSource(r); }} style={{ cursor: 'pointer' }} title="View source transaction">
              <Tag color={SOURCE_COLORS[st] || 'default'} style={{ borderRadius: 4, fontSize: 11 }}>{label}</Tag>
            </a>
          );
        }
        return <Tag color="default" style={{ borderRadius: 4, fontSize: 11 }}>Journal</Tag>;
      },
    },
    { title: 'Debit', dataIndex: 'debit', key: 'debit', width: 130, align: 'right', render: v => Number(v) ? <Text style={{ color: '#3f8600' }}>{fmt(v)}</Text> : '' },
    { title: 'Credit', dataIndex: 'credit', key: 'credit', width: 130, align: 'right', render: v => Number(v) ? <Text style={{ color: '#cf1322' }}>{fmt(v)}</Text> : '' },
    { title: 'Balance', dataIndex: 'balance', key: 'balance', width: 140, align: 'right', render: v => <Text strong style={{ color: v >= 0 ? '#1890ff' : '#ff4d4f' }}>{fmt(v)}</Text> },
  ];

  // The opening row can legitimately have NO date (no period selected and no
  // stored openingBalanceDate), and moment(undefined) would print a literal
  // "Invalid date" — fall back to a blank cell instead of inventing one.
  const fmtDate = (d, f) => (d ? moment(d).format(f) : '');

  const handlePrint = () => {
    if (!withRunningBalance.length) { message.warning('No data to print'); return; }
    const acct = selectedAccountData;
    const rowsHtml = withRunningBalance.map(r => `<tr><td>${fmtDate(r.date, 'MM/DD/YYYY')}</td><td>${(r.lineDesc || r.description || '').replace(/</g, '&lt;')}</td><td>${(r.reference || '').replace(/</g, '&lt;')}</td><td style="text-align:right">${Number(r.debit) ? fmt(r.debit) : ''}</td><td style="text-align:right">${Number(r.credit) ? fmt(r.credit) : ''}</td><td style="text-align:right">${fmt(r.balance)}</td></tr>`).join('');
    const html = `<!doctype html><html><head><title>General Ledger</title><style>body{font-family:Arial,sans-serif;font-size:12px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px}th{background:#f5f5f5;text-align:left}tfoot td{font-weight:bold;border-top:2px solid #333}</style></head><body><h2>General Ledger</h2><p><strong>${acct ? (acct.accountNumber || acct.accountCode || '') + ' - ' + (acct.accountName || acct.name || '') : ''}</strong></p><p>${dateRange[0].format('MM/DD/YYYY')} to ${dateRange[1].format('MM/DD/YYYY')}</p><table><thead><tr><th>Date</th><th>Description</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>${rowsHtml}</tbody><tfoot><tr><td colspan="3">Totals</td><td style="text-align:right">${fmt(totalDebit)}</td><td style="text-align:right">${fmt(totalCredit)}</td><td style="text-align:right">${fmt(netMovement)}</td></tr></tfoot></table></body></html>`;
    const w = window.open('', '_blank'); w.document.open(); w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300);
  };

  const handleExport = () => {
    if (!withRunningBalance.length) { message.warning('No data to export'); return; }
    const lines = [['Date', 'Description', 'Reference', 'Debit', 'Credit', 'Balance'].join(',')];
    withRunningBalance.forEach(r => {
      lines.push([fmtDate(r.date, 'YYYY-MM-DD'), `"${(r.lineDesc || r.description || '').replace(/"/g, '""')}"`, `"${(r.reference || '').replace(/"/g, '""')}"`, Number(r.debit) || 0, Number(r.credit) || 0, r.balance.toFixed(2)].join(','));
    });
    lines.push(['Totals', '', '', totalDebit.toFixed(2), totalCredit.toFixed(2), netMovement.toFixed(2)].join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `general-ledger-${selectedAccountData?.accountCode || 'all'}-${dateRange[0].format('YYYYMMDD')}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const setPreset = (key) => {
    const now = moment();
    switch (key) {
      case 'thisMonth': setDateRange([now.clone().startOf('month'), now.clone().endOf('month')]); break;
      case 'lastMonth': setDateRange([now.clone().subtract(1, 'month').startOf('month'), now.clone().subtract(1, 'month').endOf('month')]); break;
      case 'thisQuarter': setDateRange([now.clone().startOf('quarter'), now.clone().endOf('quarter')]); break;
      case 'thisYear': setDateRange([now.clone().startOf('year'), now.clone().endOf('year')]); break;
      default: break;
    }
  };

  return (
    <ErrorBoundary>
      <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>General Ledger</Title>
          <Text type="secondary">
            {selectedAccountData ? `${selectedAccountData.accountNumber || selectedAccountData.accountCode || ''} — ${selectedAccountData.accountName || selectedAccountData.name || ''}` : 'Select an account to view ledger entries'}
          </Text>
        </div>
        <Space wrap>
          <Tooltip title="Double-click a row to open its journal entry">
            <Button icon={<BookOutlined />} onClick={() => history.push('/main/accountant/journal-entries')}>Journal Entries</Button>
          </Tooltip>
          <Button icon={<PrinterOutlined />} onClick={handlePrint} disabled={!withRunningBalance.length}>Print</Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport} disabled={!withRunningBalance.length}>Export</Button>
          <Button icon={<SyncOutlined spin={loading} />} onClick={loadLedger} disabled={!selectedAccount} />
        </Space>
      </div>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={8}>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Account</Text>
            <AccountSelect
              style={{ width: '100%' }}
              accounts={accounts}
              placeholder="Search & select account..."
              value={selectedAccount}
              onChange={setSelectedAccount}
            />
          </Col>
          <Col xs={24} sm={6}>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Period</Text>
            <Select style={{ width: '100%' }} defaultValue="thisYear" onChange={setPreset} suffixIcon={<CalendarOutlined />}>
              <Option value="thisMonth">This Month</Option>
              <Option value="lastMonth">Last Month</Option>
              <Option value="thisQuarter">This Quarter</Option>
              <Option value="thisYear">This Year</Option>
            </Select>
          </Col>
          <Col xs={24} sm={6}>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Custom Dates</Text>
            <RangePicker value={dateRange} onChange={setDateRange} style={{ width: '100%' }} />
          </Col>
          <Col xs={24} sm={4}>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Search</Text>
            <Input placeholder="Filter..." prefix={<SearchOutlined />} value={searchText} onChange={e => setSearchText(e.target.value)} allowClear />
          </Col>
        </Row>
      </Card>

      {/* Account Summary Cards */}
      {selectedAccountData && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card size="small" style={{ borderTop: '3px solid #1890ff' }}>
              <Statistic title="Account" value={selectedAccountData.accountNumber || selectedAccountData.accountCode || '-'} valueStyle={{ fontSize: 18 }} />
              <Text type="secondary">{selectedAccountData.accountType || selectedAccountData.type || ''}</Text>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" style={{ borderTop: '3px solid #722ed1' }}>
              <Statistic title={isOpeningRow ? 'Opening Balance' : 'Balance Brought Forward'} value={startingBalance} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: startingBalance >= 0 ? '#1890ff' : '#ff4d4f' }} />
              <Text type="secondary">as of {dateRange[0].format('MM/DD/YYYY')}</Text>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" style={{ borderTop: '3px solid #52c41a' }}>
              <Statistic title="Net Movement" value={netMovement} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: netMovement >= 0 ? '#3f8600' : '#cf1322' }} />
              <Text type="secondary">{sortedLedger.length} transactions</Text>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" style={{ borderTop: '3px solid #ff4d4f' }}>
              <Statistic title="Closing Balance (Period)" value={closingBalance} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: closingBalance >= 0 ? '#1890ff' : '#ff4d4f' }} />
              <Text type="secondary">as of {dateRange[1].format('MM/DD/YYYY')}</Text>
            </Card>
          </Col>
        </Row>
      )}

      {/* Ledger Table */}
      <Card size="small" bodyStyle={{ padding: 0 }}>
        {loadError && (
          <Alert
            type="error"
            showIcon
            style={{ margin: 12, borderRadius: 8 }}
            message="Could not load the ledger for this account"
            description={loadError}
            action={
              <Button size="small" onClick={loadLedger} style={{ borderRadius: 6 }}>Retry</Button>
            }
          />
        )}
        <Table
          columns={columns}
          dataSource={withRunningBalance}
          rowKey={(r, i) => r.id || r._idx || i}
          loading={loading}
          size="small"
          onRow={(r) => ({ onDoubleClick: () => openJournal(r.journalId), style: { cursor: 'pointer' } })}
          pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: ['25', '50', '100', '200'], showTotal: (total) => `${total} entries` }}
          scroll={{ x: 1000 }}
          summary={pageData => {
            if (!pageData.length) return null;
            let pgDebit = 0, pgCredit = 0;
            pageData.forEach(r => { pgDebit += Number(r.debit) || 0; pgCredit += Number(r.credit) || 0; });
            return (
              <>
                <Table.Summary.Row style={{ background: '#fafafa' }}>
                  <Table.Summary.Cell colSpan={5}><Text strong>Page Totals</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong style={{ color: '#3f8600' }}>{fmt(pgDebit)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong style={{ color: '#cf1322' }}>{fmt(pgCredit)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong>{fmt(pgDebit - pgCredit)}</Text></Table.Summary.Cell>
                </Table.Summary.Row>
                <Table.Summary.Row style={{ background: '#e6f7ff' }}>
                  <Table.Summary.Cell colSpan={5}><Text strong>Grand Totals ({sortedLedger.length} entries)</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong style={{ color: '#3f8600' }}>{fmt(totalDebit)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong style={{ color: '#cf1322' }}>{fmt(totalCredit)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong style={{ color: '#1890ff' }}>{fmt(netMovement)}</Text></Table.Summary.Cell>
                </Table.Summary.Row>
              </>
            );
          }}
          locale={{ emptyText: selectedAccount ? 'No entries found for this period' : 'Select an account to view ledger entries' }}
        />
      </Card>

      {/* ═══ JOURNAL ENTRY DETAIL MODAL (shared) ═════════════════════════ */}
      <JournalEntryDetailModal
        journalEntryId={journalDetail}
        visible={!!journalDetail}
        onClose={() => setJournalDetail(null)}
      />

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
          sourceRecord && getSourceTransactionRoute(sourceRecord.source_type, sourceRecord.source_id, sourceRecord.source || {}, sourceRecord.journalId)
            ? <Button key="open" type="primary" icon={<FileTextOutlined />} style={{ borderRadius: 6 }}
                onClick={() => { const src = sourceRecord.source || {}; history.push(getSourceTransactionRoute(sourceRecord.source_type, sourceRecord.source_id, src, sourceRecord.journalId)); }}>
                Open Original
              </Button>
            : null,
        ]}
        width={820}
        bodyStyle={{ maxHeight: '70vh', overflowY: 'auto' }}
        destroyOnClose
      >
        {sourceLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin tip="Loading source transaction..." /></div>
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
                { title: 'Account', dataIndex: 'account', key: 'account', width: 180, ellipsis: true, render: v => v ? <Text>{v}</Text> : <Text type="secondary">-</Text> },
                { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 60, align: 'right', render: v => (v != null && v !== '' && Number(v) !== 1) ? Number(v) : <Text type="secondary">1</Text> },
                { title: 'Rate', dataIndex: 'rate', key: 'rate', width: 110, align: 'right', render: v => fmtC(v) },
                { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right', render: v => <Text strong>{fmtC(v)}</Text> },
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

      {/* ═══ DEPOSIT DETAILS MODAL ════════════════════════════════════════ */}
      <Modal
        title="Deposit Details"
        visible={!!sourceDeposit}
        onCancel={() => setSourceDeposit(null)}
        footer={[
          <Button key="close" onClick={() => setSourceDeposit(null)} style={{ borderRadius: 6 }}>Close</Button>,
          <Button key="open" type="primary" icon={<FileTextOutlined />} style={{ borderRadius: 6 }}
            onClick={() => { setSourceDeposit(null); history.push(`/main/banking/deposits?deposit=${sourceDeposit.id}`); }}>
            Open in Deposits
          </Button>
        ]}
        width={700}
        bodyStyle={{ maxHeight: '70vh', overflowY: 'auto' }}
        destroyOnClose
      >
        {sourceDeposit && (
          <div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>Date</Text>
                <div style={{ fontWeight: 600 }}>{sourceDeposit.date ? moment(sourceDeposit.date).format('MM/DD/YYYY') : '—'}</div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>Bank Account</Text>
                <div style={{ fontWeight: 600 }}>{sourceDeposit.bank_account_name || '—'}</div>
              </div>
              {sourceDeposit.reference ? (
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>Reference</Text>
                  <div style={{ fontWeight: 600 }}>{sourceDeposit.reference}</div>
                </div>
              ) : null}
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>Total</Text>
                <div style={{ fontWeight: 700, color: '#3f8600', fontSize: 16 }}>{fmtC(sourceDeposit.total_amount || 0)}</div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>Status</Text>
                <div>
                  {(sourceDeposit.status || '').toLowerCase() === 'void' ? <Tag color="red">Void</Tag> :
                   (sourceDeposit.status || '').toLowerCase() === 'reconciled' ? <Tag color="blue">Reconciled</Tag> :
                   <Tag color="green">Active</Tag>}
                </div>
              </div>
            </div>
            {sourceDeposit.memo ? (
              <Alert type="info" showIcon style={{ marginBottom: 12, borderRadius: 8 }}
                message={<span><Text strong>Memo / Notes: </Text>{sourceDeposit.memo}</span>} />
            ) : null}
            {sourceDeposit.allocations && sourceDeposit.allocations.length > 0 && (
              <>
                <Divider orientation="left">Allocations</Divider>
                <Table
                  dataSource={sourceDeposit.allocations.map((a, i) => ({ ...a, key: i }))}
                  rowKey="key" size="small" pagination={false} bordered
                  columns={[
                    { title: 'Account', dataIndex: 'account_name', key: 'account_name', render: v => v || '-' },
                    { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right', render: v => fmtC(v) },
                    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
                  ]}
                />
              </>
            )}
            {sourceDeposit.payments && sourceDeposit.payments.length > 0 && (
              <>
                <Divider orientation="left">Linked Payments</Divider>
                <Table
                  dataSource={sourceDeposit.payments.map((p, i) => ({ ...p, key: i }))}
                  rowKey="key" size="small" pagination={false} bordered
                  columns={[
                    { title: 'Customer', dataIndex: 'customer_name', key: 'customer_name' },
                    { title: 'Invoice', dataIndex: 'invoice_number', key: 'invoice_number' },
                    { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right', render: v => fmtC(v) },
                    { title: 'Date', dataIndex: 'date', key: 'date', render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
                  ]}
                />
              </>
            )}
          </div>
        )}
      </Modal>
      </div>
    </ErrorBoundary>
  );
};

export default GeneralLedger;
