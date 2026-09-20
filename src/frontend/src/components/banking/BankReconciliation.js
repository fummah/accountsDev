import React, { useState, useEffect, useMemo } from 'react';
import { Table, Button, DatePicker, Select, Card, Checkbox, Input, message, Row, Col, Typography, Tag, Space, Alert, Tooltip, Divider, Modal, Spin, Empty } from 'antd';
import { SaveOutlined, ReloadOutlined, BankOutlined, CheckCircleOutlined, ExclamationCircleOutlined, DownloadOutlined, HistoryOutlined, SearchOutlined, EyeOutlined, WarningOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useHistory } from 'react-router-dom';
import { useCurrency } from '../../utils/currency';
import { dedupeAccounts, getBankAccounts } from '../../utils/accounts';
import AccountSelect from '../shared/AccountSelect';

const { Option } = Select;
const { Title, Text } = Typography;
const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TYPE_META = {
  'Check': { color: '#722ed1', bg: '#f9f0ff' },
  'Bill Payment': { color: '#d4380d', bg: '#fff2e8' },
  'Expense': { color: '#cf1322', bg: '#fff1f0' },
  'Deposit': { color: '#389e0d', bg: '#f6ffed' },
  'deposit': { color: '#389e0d', bg: '#f6ffed' },
  'Transfer': { color: '#13c2c2', bg: '#e6fffb' },
  'transfer_in': { color: '#13c2c2', bg: '#e6fffb' },
  'transfer_out': { color: '#13c2c2', bg: '#e6fffb' },
  'Credit Card': { color: '#d46b08', bg: '#fff7e6' },
  'Payment': { color: '#1890ff', bg: '#e6f7ff' },
  'Journal': { color: '#2f54eb', bg: '#f0f5ff' },
  'debit': { color: '#389e0d', bg: '#f6ffed' },
};
const defaultTypeMeta = { color: '#595959', bg: '#fafafa' };

const TypePill = ({ type }) => {
  const cfg = TYPE_META[type] || defaultTypeMeta;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6, background: cfg.bg, color: cfg.color, fontWeight: 600, fontSize: 12, lineHeight: 1.4, whiteSpace: 'nowrap' }}>
      {type}
    </span>
  );
};

// Map bank transaction type -> drill-down route
const SOURCE_ROUTES = {
  'Check': () => '/main/accountant/check-printing',
  'Bill Payment': () => '/main/vendors/bills/pay',
  'Expense': () => '/main/vendors/bills/tracker',
  'Deposit': () => '/main/banking/deposits',
  'deposit': () => '/main/banking/deposits',
  'Transfer': () => '/main/banking/transfers',
  'transfer_in': () => '/main/banking/transfers',
  'transfer_out': () => '/main/banking/transfers',
  'Credit Card': () => '/main/vendors/bills/tracker',
  'Payment': () => '/main/customers/payment-history',
  'Customer Payment': () => '/main/customers/payment-history',
  'Journal': () => '/main/accountant/journal-entries',
};

const BankReconciliation = () => {
  const { symbol: cSym } = useCurrency();
  const history = useHistory();
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [reconciliationHistory, setReconciliationHistory] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [statementDate, setStatementDate] = useState(moment());
  const [statementBalance, setStatementBalance] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [reconciling, setReconciling] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Starting (book) balance, resolved by the backend through the SAME
  // opening-balance rule the General Ledger uses. null until loaded.
  const [startState, setStartState] = useState(null);

  // "Reconcile Anyway" dialog state.
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjAccounts, setAdjAccounts] = useState([]);
  const [adjAccountId, setAdjAccountId] = useState(null);
  const [adjMemo, setAdjMemo] = useState('');
  const [adjLoading, setAdjLoading] = useState(false);

  // Quick-view modal state (drill-down)
  const [sourceRecord, setSourceRecord] = useState(null);
  const [sourceDetail, setSourceDetail] = useState(null);
  const [sourceLoading, setSourceLoading] = useState(false);

  // History detail drawer/modal
  const [histDetail, setHistDetail] = useState(null);
  const [histLoading, setHistLoading] = useState(false);

  useEffect(() => { loadAccounts(); }, []);

  useEffect(() => {
    if (selectedAccount) {
      loadTransactions();
      loadReconciliationHistory();
      loadStartingBalance();
    } else {
      setStartState(null);
    }
  }, [selectedAccount, statementDate]);

  // The starting balance comes from the backend so the reconciliation and the
  // General Ledger share one opening-balance rule (services/openingBalance.js)
  // instead of each computing it their own way.
  const loadStartingBalance = async () => {
    try {
      const res = await window.electronAPI.getReconciliationStartingBalance?.({ accountId: selectedAccount });
      setStartState(res && res.success ? res : null);
    } catch {
      setStartState(null);
    }
  };

  const loadAccounts = async () => {
    try {
      const accRes = await window.electronAPI.getChartOfAccounts({ type: 'Bank' }).catch(() => []);
      const accs = Array.isArray(accRes) ? accRes : [];
      // Filter by the real Chart of Accounts type classification (BANK) only —
      // never by account name/description text.
      setAccounts(dedupeAccounts(getBankAccounts(accs)));
    } catch (error) {
      message.error('Failed to load bank accounts');
    }
  };

  const loadTransactions = async () => {
    try {
      setLoading(true);
      setSelectedIds(new Set());
      let data = [];
      if (window.electronAPI.getUnreconciledTransactions) {
        const res = await window.electronAPI.getUnreconciledTransactions({
          accountId: selectedAccount,
          statementDate: statementDate.format('YYYY-MM-DD'),
        });
        data = Array.isArray(res) ? res : (res && !res.error ? [] : []);
      }
      if (data.length === 0 && window.electronAPI.getTransactions) {
        const raw = await window.electronAPI.getTransactions().catch(() => []);
        const all = Array.isArray(raw) ? raw : [];
        data = all.filter(tx =>
          String(tx.accountId) === String(selectedAccount) &&
          !tx.isReconciled &&
          moment(tx.date).isSameOrBefore(statementDate, 'day') &&
          String(tx.status || 'Active').toLowerCase() !== 'voided'
        );
      }
      setTransactions(data.map(tx => ({
        ...tx,
        isReconciled: false,
        amount: Number(tx.amount != null ? tx.amount : (Number(tx.debit || 0) - Number(tx.credit || 0))),
      })));
    } catch (error) {
      message.error('Failed to load transactions');
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const loadReconciliationHistory = async () => {
    try {
      if (window.electronAPI.getReconciliationHistory) {
        const res = await window.electronAPI.getReconciliationHistory(selectedAccount);
        setReconciliationHistory(Array.isArray(res) ? res : []);
      } else {
        setReconciliationHistory([]);
      }
    } catch { setReconciliationHistory([]); }
  };

  const performReconcile = async (createAdjustment, adjOpts = null) => {
    try {
      setReconciling(true);
      const accountInfo = accounts.find(a => String(a.id) === String(selectedAccount));
      const result = await window.electronAPI.reconcileTransactions({
        accountId: selectedAccount,
        accountName: accountInfo?.accountName || accountInfo?.name || null,
        statementDate: statementDate.format('YYYY-MM-DD'),
        statementBalance: parseFloat(statementBalance),
        transactions: Array.from(selectedIds),
        createAdjustment: !!createAdjustment,
        // The account that absorbs the difference is chosen explicitly in the
        // dialog — never hard-coded, and never the bank account itself.
        adjustmentAccountId: createAdjustment && adjOpts ? adjOpts.accountId : null,
        adjustmentDescription: createAdjustment && adjOpts && adjOpts.memo
          ? adjOpts.memo
          : (createAdjustment ? `Bank reconciliation adjustment for ${statementDate.format('MM/DD/YYYY')}` : null),
      });
      if (result && result.success) {
        if (createAdjustment && result.adjustmentJournalId) {
          message.success(`Account reconciled with adjustment (Journal #${result.adjustmentJournalId})`);
        } else {
          message.success(`Account reconciled successfully (${selectedIds.size} transactions cleared)`);
        }
        setSelectedIds(new Set());
        await Promise.all([loadTransactions(), loadReconciliationHistory(), loadStartingBalance()]);
        return true;
      }
      throw new Error(result?.error || 'Reconciliation failed');
    } catch (error) {
      message.error(error.message || 'Failed to reconcile account');
      return false;
    } finally {
      setReconciling(false);
    }
  };

  // Open the "Reconcile Anyway" dialog: the user picks the adjustment account
  // and may edit the memo before anything is posted.
  const openAdjustmentDialog = async () => {
    setAdjOpen(true);
    setAdjLoading(true);
    setAdjMemo(`Bank reconciliation adjustment for ${statementDate.format('MM/DD/YYYY')}`);
    try {
      const res = await window.electronAPI.getReconciliationAdjustmentAccounts?.({ accountId: selectedAccount });
      const list = res && res.success && Array.isArray(res.accounts) ? res.accounts : [];
      setAdjAccounts(list);
      setAdjAccountId(res && res.defaultAccountId ? res.defaultAccountId : (list.length ? list[0].id : null));
    } catch {
      setAdjAccounts([]);
      setAdjAccountId(null);
    } finally {
      setAdjLoading(false);
    }
  };

  const handleReconcile = () => {
    if (!selectedAccount) {
      message.warning('Please select a bank account');
      return;
    }
    if (statementBalance === '' || statementBalance === null) {
      message.warning('Please enter the statement ending balance');
      return;
    }
    if (selectedIds.size === 0) {
      message.warning('Please check off the transactions that appear on your statement');
      return;
    }

    // A balanced reconciliation needs no adjustment and no second confirmation.
    if (isBalanced) {
      performReconcile(false);
      return;
    }

    // Out of balance: never silently zero it. Open the explicit adjustment
    // dialog, which posts a real journal entry the user can review.
    openAdjustmentDialog();
  };

  const handleTransactionCheck = (txId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(txId)) next.delete(txId);
      else next.add(txId);
      return next;
    });
  };

  const handleSelectAll = (checked) => {
    setSelectedIds(checked
      ? new Set(filteredTransactions.map(tx => tx.id))
      : new Set());
  };

  // Drill-down: open the quick-view modal for a transaction
  const openSource = async (tx) => {
    if (!tx) return;
    setSourceRecord(tx);
    setSourceDetail(null);
    setSourceLoading(true);
    try {
      const detail = await window.electronAPI.journalSourceDetail?.('transaction', tx.id);
      setSourceDetail(detail && !detail.error ? detail : null);
    } catch {
      setSourceDetail(null);
    }
    setSourceLoading(false);
  };

  const openOriginal = (tx) => {
    setSourceRecord(null);
    setSourceDetail(null);
    const routeFn = SOURCE_ROUTES[tx.type];
    if (routeFn) history.push(routeFn());
    else history.push('/main/accountant/general-ledger');
  };

  const openHistoryDetail = async (recId) => {
    try {
      setHistLoading(true);
      setHistDetail(null);
      const res = await window.electronAPI.getReconciliationDetail(recId);
      setHistDetail(res && !res.error ? res : null);
    } catch {
      setHistDetail(null);
    } finally {
      setHistLoading(false);
    }
  };

  const exportCSV = () => {
    try {
      const headers = ['Date', 'Type', 'Reference', 'Description', 'Debit', 'Credit', 'Reconciled'];
      const rows = filteredTransactions.map(d => [
        d.date || '', d.type || '', d.reference || '', (d.description || '').replace(/"/g, '""'),
        Number(d.debit || 0).toFixed(2), Number(d.credit || 0).toFixed(2), selectedIds.has(d.id) ? 'Yes' : 'No'
      ].map(v => `"${v}"`).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `reconciliation_${moment().format('YYYY-MM-DD')}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      message.success('Exported CSV');
    } catch { message.error('Export failed'); }
  };

  const filteredTransactions = useMemo(() => {
    if (!searchText) return transactions;
    const s = searchText.toLowerCase();
    return transactions.filter(tx =>
      (tx.description || '').toLowerCase().includes(s) ||
      (tx.reference || '').toLowerCase().includes(s) ||
      (tx.type || '').toLowerCase().includes(s) ||
      (tx.date || '').includes(s)
    );
  }, [transactions, searchText]);

  const selectedAccountInfo = accounts.find(a => String(a.id) === String(selectedAccount));

  // Live reconciliation math.
  //
  // The starting balance is the backend's answer, not a local re-derivation:
  //   - later reconciliations carry forward the previous statement's ending
  //     balance (which already contains the opening balance);
  //   - the first reconciliation starts from the account's opening balance.
  // Both come from services/openingBalance.js — the same rule the General
  // Ledger renders — so the two screens cannot drift apart. The local fallback
  // exists only for the instant before the backend answers.
  const startingBalance = startState
    ? Number(startState.startingBalance) || 0
    : (reconciliationHistory.length > 0
        ? (Number(reconciliationHistory[0].statementBalance) || 0)
        : (Number(selectedAccountInfo?.openingBalance) || 0));
  const clearedMovement = filteredTransactions.reduce((sum, tx) => sum + (selectedIds.has(tx.id) ? Number(tx.amount || 0) : 0), 0);
  const clearedBalance = startingBalance + clearedMovement;
  const stmtBal = parseFloat(statementBalance || 0);
  const difference = stmtBal - clearedBalance;
  const isBalanced = Math.abs(difference) < 0.005;
  const selectedCount = filteredTransactions.filter(tx => selectedIds.has(tx.id)).length;

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      width: 100,
      render: (date) => date ? moment(date).format('MM/DD/YYYY') : '-',
      sorter: (a, b) => new Date(a.date || 0) - new Date(b.date || 0),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 130,
      render: (v) => <TypePill type={v} />,
    },
    {
      title: 'Reference',
      dataIndex: 'reference',
      key: 'reference',
      width: 120,
      ellipsis: true,
      render: (v, r) => (
        <a
          style={{ color: '#1890ff', fontWeight: 500 }}
          onClick={(e) => { e.stopPropagation(); openSource(r); }}
        >
          {v || `TX-${r.id}`}
        </a>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      align: 'right',
      sorter: (a, b) => Number(a.amount || 0) - Number(b.amount || 0),
      render: (v) => {
        const amt = Number(v || 0);
        const positive = amt >= 0;
        return <Text strong style={{ color: positive ? '#52c41a' : '#f5222d' }}>{positive ? '' : '-'}{cSym} {fmt(Math.abs(amt))}</Text>;
      },
    },
    {
      title: <Checkbox
        checked={selectedCount === filteredTransactions.length && filteredTransactions.length > 0}
        indeterminate={selectedCount > 0 && selectedCount < filteredTransactions.length}
        onChange={(e) => handleSelectAll(e.target.checked)}
      />,
      key: 'selected',
      width: 70,
      align: 'center',
      render: (_, record) => (
        <Checkbox
          checked={selectedIds.has(record.id)}
          onChange={() => handleTransactionCheck(record.id)}
        />
      ),
    },
  ];

  const statTileStyle = (color) => ({ borderTop: `3px solid ${color}`, borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' });

  return (
    <div style={{ padding: 24 }}>
      <style>{`
        .rec-row-selected { background-color: #e6f7ff; }
        .rec-row-selected:hover td { background-color: #bae7ff !important; }
        .rec-row-clickable { cursor: pointer; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}><BankOutlined style={{ marginRight: 8 }} />Bank Reconciliation</Title>
          <Text type="secondary">Match bank statements with ledger transactions · only unreconciled items are shown</Text>
        </div>
      </div>

      {/* Controls */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 10 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={8}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Bank Account</div>
            <AccountSelect
              style={{ width: '100%' }}
              accounts={accounts}
              placeholder="Select Bank Account"
              value={selectedAccount}
              onChange={setSelectedAccount}
            />
          </Col>
          <Col xs={24} sm={5}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Statement Ending Date</div>
            <DatePicker
              style={{ width: '100%' }}
              value={statementDate}
              onChange={setStatementDate}
              placeholder="Statement Date"
            />
          </Col>
          <Col xs={24} sm={5}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Statement Ending Balance</div>
            <Input
              style={{ width: '100%' }}
              prefix={cSym}
              placeholder="Ending Balance"
              value={statementBalance}
              onChange={e => setStatementBalance(e.target.value)}
              type="number"
            />
          </Col>
          <Col xs={24} sm={6}>
            <Space>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleReconcile}
                disabled={!selectedAccount || statementBalance === '' || selectedCount === 0}
                loading={reconciling}
                style={{ borderRadius: 8 }}
              >
                Reconcile
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => { loadTransactions(); loadReconciliationHistory(); }}
                loading={loading}
                style={{ borderRadius: 8 }}
              >
                Refresh
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {selectedAccountInfo && (
        <Alert
          message={`Reconciling: ${selectedAccountInfo.accountName || selectedAccountInfo.name}`}
          description={`Statement as of ${statementDate.format('MM/DD/YYYY')} · Starting balance ${cSym} ${fmt(startingBalance)} · ${selectedCount} item${selectedCount === 1 ? '' : 's'} checked off of ${filteredTransactions.length} unreconciled`}
          type="info"
          showIcon
          style={{ marginBottom: 16, borderRadius: 8 }}
        />
      )}

      {/* Live summary tiles */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={statTileStyle('#1890ff')}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Statement Ending Balance</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#1890ff' }}>{cSym} {fmt(stmtBal)}</div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={statTileStyle('#52c41a')}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Cleared Balance</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#52c41a' }}>{cSym} {fmt(clearedBalance)}</div>
            <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>{cSym} {fmt(startingBalance)} + {cSym} {fmt(clearedMovement)} · {selectedCount} checked</div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={statTileStyle(isBalanced ? '#52c41a' : '#f5222d')}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
              Difference
              {isBalanced
                ? <CheckCircleOutlined style={{ color: '#52c41a', marginLeft: 6 }} />
                : <ExclamationCircleOutlined style={{ color: '#f5222d', marginLeft: 6 }} />}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: isBalanced ? '#52c41a' : '#f5222d' }}>
              {Math.abs(difference) < 0.005 ? cSym : (difference < 0 ? `-${cSym}` : cSym)} {fmt(Math.abs(difference))}
            </div>
            <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
              {isBalanced ? 'In balance' : (difference > 0 ? 'Still to clear' : 'Over-cleared')}
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={statTileStyle('#722ed1')}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Outstanding</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#722ed1' }}>{filteredTransactions.length - selectedCount}</div>
            <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>of {filteredTransactions.length} unreconciled</div>
          </Card>
        </Col>
      </Row>

      {/* Balance validation warning */}
      {!isBalanced && selectedCount > 0 && (
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined />}
          message="Account out of balance"
          description={`The statement ending balance does not match the cleared balance (including the opening balance). Remaining Difference: ${cSym} ${fmt(difference)}. You can keep reviewing, or create an adjustment journal entry to capture the difference.`}
          style={{ marginBottom: 16, borderRadius: 8 }}
        />
      )}
      {isBalanced && selectedCount > 0 && (
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
          message="In balance — ready to reconcile"
          description={`Statement balance matches cleared balance. ${selectedCount} transaction${selectedCount === 1 ? '' : 's'} will be marked as reconciled.`}
          style={{ marginBottom: 16, borderRadius: 8 }}
        />
      )}

      {/* Transactions table */}
      <Card
        title={
          <Space>
            <span>Transactions to Reconcile</span>
            <Tag color="blue">{filteredTransactions.length} unreconciled</Tag>
            <Tag color="green">{selectedCount} selected</Tag>
          </Space>
        }
        size="small"
        style={{ borderRadius: 10 }}
        extra={
          <Space>
            <Input placeholder="Search..." prefix={<SearchOutlined />} value={searchText} onChange={e => setSearchText(e.target.value)} allowClear style={{ width: 200 }} />
            <Tooltip title="Export current view to CSV">
              <Button icon={<DownloadOutlined />} onClick={exportCSV} size="small" style={{ borderRadius: 6 }}>CSV</Button>
            </Tooltip>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={filteredTransactions}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ defaultPageSize: 15, showSizeChanger: true, showTotal: t => `${t} transactions` }}
          scroll={{ x: 800 }}
          rowClassName={(record) => selectedIds.has(record.id) ? 'rec-row-selected' : ''}
          onRow={(record) => ({
            onClick: () => openSource(record),
          })}
          locale={{ emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No unreconciled transactions found. All transactions for this statement have been reconciled."
            />
          ) }}
          summary={() => filteredTransactions.length > 0 ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={4}><Text strong>Cleared subtotal</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">
                <Text strong style={{ color: clearedBalance >= 0 ? '#52c41a' : '#f5222d' }}>
                  {clearedBalance < 0 ? '-' : ''}{cSym} {fmt(Math.abs(clearedBalance))}
                </Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={5}>
                <Text type="secondary" style={{ fontSize: 11 }}>click any row to open the source</Text>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          ) : null}
        />
      </Card>

      {/* Reconciliation History (audit trail) */}
      <Card
        title={<><HistoryOutlined style={{ marginRight: 4 }} /> Reconciliation History</>}
        size="small"
        style={{ marginTop: 16, borderRadius: 10 }}
      >
        {reconciliationHistory.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No reconciliations recorded yet for this account" />
        ) : (
          <Table
            dataSource={reconciliationHistory}
            rowKey="id"
            size="small"
            pagination={false}
            expandable={{
              expandedRowRender: (record) => (
                <div style={{ padding: '8px 0' }}>
                  <Space style={{ marginBottom: 8 }} wrap>
                    <Tag color="purple">Reconciliation #{record.id}</Tag>
                    <Tag>{record.transactionCount} transactions</Tag>
                    <Tag color="green">{cSym} {fmt(record.totalCleared)} cleared</Tag>
                    {record.reconciledBy && <Tag color="blue">by {record.reconciledBy}</Tag>}
                  </Space>
                  <div style={{ marginBottom: 8 }}>
                    <Space wrap>
                      <Tag>Starting balance {cSym} {fmt(record.startingBalance)}</Tag>
                      <Tag color={Math.abs(Number(record.difference || 0)) < 0.005 ? 'green' : 'orange'}>
                        Difference {cSym} {fmt(record.difference)}
                      </Tag>
                      {record.adjustmentJournalId ? (
                        <Tag color="red">Adjustment {cSym} {fmt(record.adjustmentAmount)} (Journal #{record.adjustmentJournalId})</Tag>
                      ) : null}
                    </Space>
                    {record.adjustmentDescription ? (
                      <div style={{ marginTop: 6, fontSize: 12, color: '#8c8c8c' }}>{record.adjustmentDescription}</div>
                    ) : null}
                  </div>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => openHistoryDetail(record.id)}
                    style={{ borderRadius: 6 }}
                  >
                    View Transactions
                  </Button>
                </div>
              ),
            }}
            columns={[
              { title: 'Reconciliation #', dataIndex: 'id', width: 130, render: v => `#${v}` },
              { title: 'Statement Date', dataIndex: 'statementDate', render: v => v ? moment(v).format('MM/DD/YYYY') : '-', width: 130 },
              { title: 'Statement Balance', dataIndex: 'statementBalance', render: v => `${cSym} ${fmt(v)}`, align: 'right', width: 140 },
              { title: 'Cleared Balance', dataIndex: 'reconciledBalance', render: v => `${cSym} ${fmt(v)}`, align: 'right', width: 140 },
              { title: 'Transactions', dataIndex: 'transactionCount', align: 'center', width: 110 },
              { title: 'Reconciled By', dataIndex: 'reconciledBy', render: v => v || <Text type="secondary">—</Text> },
              { title: 'Recorded', dataIndex: 'created_at', render: v => v ? moment(v).format('MM/DD/YYYY hh:mm A') : '-', width: 170 },
            ]}
          />
        )}
      </Card>

      {/* Quick-view source modal (drill-down) */}
      <Modal
        title={
          <Space>
            {sourceRecord && <TypePill type={sourceRecord.type} />}
            <span>{(sourceDetail && sourceDetail.number) || (sourceRecord && (sourceRecord.reference || `TX-${sourceRecord.id}`))}</span>
            {sourceDetail && sourceDetail.status && (
              <Tag color={String(sourceDetail.status).toLowerCase() === 'active' ? 'green' : String(sourceDetail.status).toLowerCase() === 'voided' ? 'red' : 'blue'}>
                {sourceDetail.status}
              </Tag>
            )}
          </Space>
        }
        visible={!!sourceRecord}
        onCancel={() => { setSourceRecord(null); setSourceDetail(null); }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => { setSourceRecord(null); setSourceDetail(null); }} style={{ borderRadius: 6 }}>Close</Button>
            <Button type="primary" icon={<EyeOutlined />} onClick={() => openOriginal(sourceRecord)} style={{ borderRadius: 6 }}>
              Open Original
            </Button>
          </Space>
        }
        width={620}
      >
        <Spin spinning={sourceLoading}>
          {sourceRecord && (
            <div>
              <Row gutter={[16, 12]}>
                <Col span={12}>
                  <div style={{ fontSize: 12, color: '#666' }}>Date</div>
                  <Text strong>{(sourceDetail && sourceDetail.date) || (sourceRecord.date ? moment(sourceRecord.date).format('MM/DD/YYYY') : '-')}</Text>
                </Col>
                <Col span={12}>
                  <div style={{ fontSize: 12, color: '#666' }}>Type</div>
                  <Text strong>{sourceDetail ? sourceDetail.label : sourceRecord.type}</Text>
                </Col>
                <Col span={12}>
                  <div style={{ fontSize: 12, color: '#666' }}>{sourceDetail ? (sourceDetail.partyLabel || 'Party') : 'Payee'}</div>
                  <Text strong>{sourceDetail && sourceDetail.party ? sourceDetail.party : (sourceRecord.payee_name || sourceRecord.description || '-')}</Text>
                </Col>
                <Col span={12}>
                  <div style={{ fontSize: 12, color: '#666' }}>Amount</div>
                  <Text strong style={{ color: Number(sourceRecord.amount || 0) >= 0 ? '#52c41a' : '#f5222d', fontSize: 18 }}>
                    {Number(sourceRecord.amount || 0) < 0 ? '-' : ''}{cSym} {fmt(Math.abs(Number((sourceDetail && sourceDetail.total) || sourceRecord.amount || 0)))}
                  </Text>
                </Col>
              </Row>

              {sourceRecord.description && (
                <div style={{ marginTop: 12, padding: '10px 12px', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8 }}>
                  <Text strong style={{ color: '#d48806' }}>{sourceRecord.description}</Text>
                </div>
              )}

              {sourceDetail && sourceDetail.lines && sourceDetail.lines.length > 0 && (
                <>
                  <Divider style={{ margin: '16px 0 8px' }} />
                  <Table
                    size="small"
                    pagination={false}
                    rowKey={(_, i) => i}
                    dataSource={sourceDetail.lines}
                    columns={[
                      { title: 'Description', dataIndex: 'description', ellipsis: true },
                      { title: 'Qty', dataIndex: 'quantity', width: 60, align: 'right', render: v => Number(v || 1) },
                      { title: 'Rate', dataIndex: 'rate', width: 110, align: 'right', render: v => `${cSym} ${fmt(v)}` },
                      { title: 'Amount', dataIndex: 'amount', width: 120, align: 'right', render: v => <Text strong>{cSym} {fmt(v)}</Text> },
                    ]}
                    summary={() => (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={3}><Text strong>Total</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="right">
                          <Text strong>{cSym} {fmt((sourceDetail && sourceDetail.total) || sourceDetail.lines.reduce((s, l) => s + Number(l.amount || 0), 0))}</Text>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    )}
                  />
                </>
              )}
            </div>
          )}
        </Spin>
      </Modal>

      {/* Reconciliation history detail modal */}
      <Modal
        title={histDetail ? `Reconciliation #${histDetail.id} · Transactions` : 'Reconciliation Detail'}
        visible={!!histDetail}
        onCancel={() => setHistDetail(null)}
        footer={<Button onClick={() => setHistDetail(null)} style={{ borderRadius: 6 }}>Close</Button>}
        width={720}
      >
        <Spin spinning={histLoading}>
          {histDetail && (
            <>
              <Row gutter={[16, 12]} style={{ marginBottom: 12 }}>
                <Col span={8}>
                  <div style={{ fontSize: 12, color: '#666' }}>Statement Date</div>
                  <Text strong>{histDetail.statementDate ? moment(histDetail.statementDate).format('MM/DD/YYYY') : '-'}</Text>
                </Col>
                <Col span={8}>
                  <div style={{ fontSize: 12, color: '#666' }}>Statement Balance</div>
                  <Text strong>{cSym} {fmt(histDetail.statementBalance)}</Text>
                </Col>
                <Col span={8}>
                  <div style={{ fontSize: 12, color: '#666' }}>Reconciled By</div>
                  <Text strong>{histDetail.reconciledBy || '—'}</Text>
                </Col>
              </Row>
              <Table
                size="small"
                rowKey="transactionId"
                dataSource={histDetail.transactions || []}
                pagination={false}
                columns={[
                  { title: 'Date', dataIndex: 'date', width: 110, render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
                  { title: 'Type', dataIndex: 'type', width: 120, render: v => <TypePill type={v} /> },
                  { title: 'Reference', dataIndex: 'reference', width: 130, ellipsis: true },
                  { title: 'Description', dataIndex: 'description', ellipsis: true },
                  { title: 'Amount', dataIndex: 'amount', width: 120, align: 'right', render: v => <Text strong>{cSym} {fmt(v)}</Text> },
                ]}
                locale={{ emptyText: 'No transactions recorded for this reconciliation' }}
              />
            </>
          )}
        </Spin>
      </Modal>

      {/* ═══ RECONCILE ANYWAY — explicit adjustment ═══════════════════════ */}
      <Modal
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: '#f5222d' }} />
            <span>Reconciliation Difference</span>
          </Space>
        }
        visible={adjOpen}
        onCancel={() => setAdjOpen(false)}
        width={560}
        destroyOnClose
        footer={[
          <Button key="cancel" onClick={() => {
            setAdjOpen(false);
            message.info('Reconciliation not saved. Keep reviewing the transactions.');
          }}>
            Cancel
          </Button>,
          <Button
            key="ok"
            danger
            type="primary"
            loading={reconciling}
            disabled={adjLoading || !adjAccountId}
            onClick={async () => {
              const ok = await performReconcile(true, { accountId: adjAccountId, memo: adjMemo });
              if (ok) setAdjOpen(false);
            }}
          >
            Create Adjustment &amp; Reconcile
          </Button>,
        ]}
      >
        <p style={{ marginTop: 4 }}>
          The reconciliation has a difference of{' '}
          <Text strong style={{ color: '#f5222d' }}>
            {difference < 0 ? '-' : ''}{cSym} {fmt(Math.abs(difference))}
          </Text>.
        </p>
        <p>
          To complete reconciliation, AccuLedger can create an adjusting journal entry for this amount.
          The entry is posted to the general ledger and journal entries — it is never silently hidden.
        </p>

        <div style={{ marginTop: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 4 }}>Adjustment Account</Text>
          <Select
            style={{ width: '100%' }}
            placeholder={adjLoading ? 'Loading accounts…' : 'Select an account'}
            loading={adjLoading}
            value={adjAccountId}
            onChange={setAdjAccountId}
            showSearch
            optionFilterProp="children"
            notFoundContent={adjLoading ? <Spin size="small" /> : 'No eligible accounts found'}
          >
            {adjAccounts.map(a => (
              <Option key={a.id} value={a.id}>
                {a.number ? `${a.number} · ` : ''}{a.name}{a.type ? ` (${a.type})` : ''}
              </Option>
            ))}
          </Select>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {startState && startState.priorReconciliationId
              ? 'This difference is captured against the account you choose below.'
              : 'Defaults to your Reconciliation Discrepancies account when the file has one.'}
          </Text>
        </div>

        <div style={{ marginTop: 12 }}>
          <Text strong style={{ display: 'block', marginBottom: 4 }}>Adjustment Date</Text>
          <Input value={statementDate.format('MM/DD/YYYY')} disabled />
          <Text type="secondary" style={{ fontSize: 12 }}>The statement ending date.</Text>
        </div>

        <div style={{ marginTop: 12 }}>
          <Text strong style={{ display: 'block', marginBottom: 4 }}>Memo</Text>
          <Input
            value={adjMemo}
            onChange={e => setAdjMemo(e.target.value)}
            placeholder="Bank reconciliation adjustment"
            maxLength={200}
          />
        </div>

        <Alert
          style={{ marginTop: 16, borderRadius: 8 }}
          type="warning"
          showIcon
          message="This posts a real, balanced journal entry"
          description={
            <span>
              Bank account {difference > 0 ? 'is debited' : 'is credited'} and the adjustment account{' '}
              {difference > 0 ? 'is credited' : 'is debited'} for {cSym} {fmt(Math.abs(difference))}, dated{' '}
              {statementDate.format('MM/DD/YYYY')}.
            </span>
          }
        />
      </Modal>
    </div>
  );
};

export default BankReconciliation;
