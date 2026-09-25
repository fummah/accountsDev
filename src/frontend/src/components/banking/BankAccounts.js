import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, Table, Row, Col, Statistic, Button, Space, Tag, message, Tooltip, Input } from 'antd';
import { BankOutlined, ReloadOutlined, SwapOutlined, DollarOutlined, CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useHistory } from 'react-router-dom';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';
import { getBankAccounts } from '../../utils/accounts';

const BankAccounts = () => {
  const { symbol: cSym } = useCurrency();
  const history = useHistory();
  const [loading, setLoading] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [searchText, setSearchText] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [accs, txns] = await Promise.all([
        // Server-side filter: only Type = Bank rows come back from the DB.
        window.electronAPI.getChartOfAccounts?.({ type: 'Bank' }).catch(() => []),
        window.electronAPI.getTransactions?.().catch(() => []),
      ]);

      const allAccs = Array.isArray(accs) ? accs : (accs?.data || []);
      const allTxns = Array.isArray(txns) ? txns : [];

      // ONLY real Chart of Accounts Type = Bank accounts. The account's
      // classification is the authority — NEVER its name. "Bank Fees" is an
      // Expense, "US Bank" is a Credit Card and "Transfer From Savings" is
      // Other Income/Asset, so none of them belong on this screen.
      const banks = getBankAccounts(allAccs);

      // Compute balances per account — use COA balance (computed from journal_lines) as primary
      const enriched = banks.map(acc => {
        const accName = acc.accountName || acc.name || '';
        const accId = acc.id;

        // Authoritative balance: the Chart-of-Accounts computed balance
        // (journal_lines double-entry) — the SAME source the General Ledger,
        // Trial Balance and Chart of Accounts use.
        const currentBalance = Number(acc.balance != null ? acc.balance : (acc.openingBalance || 0));

        // Transactions belong to this account by ID only — never by name
        // (duplicate account names would cross-count another account's activity).
        const accTxns = allTxns.filter(t => String(t.accountId) === String(accId));

        // Cleared = only reconciled/cleared transactions
        const clearedTxns = accTxns.filter(t => (t.status || '').toLowerCase() === 'cleared' || (t.isReconciled || false));
        const clearedDebits = clearedTxns.reduce((s, t) => s + (Number(t.debit || 0)), 0);
        const clearedCredits = clearedTxns.reduce((s, t) => s + (Number(t.credit || 0)), 0);
        const clearedBalance = currentBalance - (clearedDebits - clearedCredits);

        // Uncleared = current - cleared
        const unclearedBalance = currentBalance - clearedBalance;

        // Recent activity
        const lastActivity = accTxns.length > 0 ? accTxns.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))[0]?.date : null;
        const txnCount = accTxns.length;

        return {
          ...acc,
          key: accId,
          accountName: accName,
          accountType: acc.accountType || acc.type || 'Bank',
          accountNumber: acc.accountNumber || acc.number || '',
          currentBalance,
          clearedBalance,
          unclearedBalance,
          lastActivity,
          txnCount,
        };
      });

      setBankAccounts(enriched);
      setTransactions(allTxns);
    } catch (e) {
      console.error('Failed to load bank accounts:', e);
      message.error('Failed to load bank account data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Summary totals
  const totalCurrentBalance = bankAccounts.reduce((s, a) => s + a.currentBalance, 0);
  const totalClearedBalance = bankAccounts.reduce((s, a) => s + a.clearedBalance, 0);
  const totalUnclearedBalance = bankAccounts.reduce((s, a) => s + a.unclearedBalance, 0);
  const totalAccounts = bankAccounts.length;

  // Search filter — matches the account name, account number or classification.
  const filteredAccounts = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return bankAccounts;
    return bankAccounts.filter(a =>
      (a.accountName || '').toLowerCase().includes(q) ||
      String(a.accountNumber || '').toLowerCase().includes(q) ||
      (a.accountType || '').toLowerCase().includes(q)
    );
  }, [bankAccounts, searchText]);

  // Open the current General Ledger deep-linked to this exact account. The
  // unique account ID is passed — never the account name (duplicate names
  // would be ambiguous).
  const openLedger = (accountId) => {
    history.push(`/main/accountant/general-ledger?accountId=${accountId}`);
  };

  const columns = [
    {
      title: 'Account',
      key: 'account',
      render: (_, r) => (
        <div>
          <Button
            type="link"
            style={{ padding: 0, height: 'auto', fontWeight: 600, fontSize: 14 }}
            onClick={() => openLedger(r.id)}
          >
            {r.accountName}
          </Button>
          <div style={{ fontSize: 12, color: '#888' }}>
            {r.accountNumber ? `#${r.accountNumber} · ` : ''}{r.accountType}
          </div>
        </div>
      ),
    },
    {
      title: 'Current Balance',
      key: 'currentBalance',
      width: 160,
      align: 'right',
      sorter: (a, b) => a.currentBalance - b.currentBalance,
      render: (_, r) => (
        <span style={{ fontWeight: 700, fontSize: 15, color: r.currentBalance >= 0 ? '#3f8600' : '#cf1322' }}>
          {cSym} {Number(r.currentBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      title: 'Cleared Balance',
      key: 'clearedBalance',
      width: 150,
      align: 'right',
      render: (_, r) => (
        <span style={{ color: '#1890ff' }}>
          {cSym} {Number(r.clearedBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      title: 'Uncleared',
      key: 'unclearedBalance',
      width: 140,
      align: 'right',
      render: (_, r) => (
        <span style={{ color: r.unclearedBalance !== 0 ? '#fa8c16' : '#888' }}>
          {cSym} {Number(r.unclearedBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      title: 'Transactions',
      key: 'txnCount',
      width: 110,
      align: 'center',
      render: (_, r) => <Tag>{r.txnCount}</Tag>,
    },
    {
      title: 'Last Activity',
      key: 'lastActivity',
      width: 120,
      render: (_, r) => r.lastActivity ? moment(r.lastActivity).format('MM/DD/YYYY') : <span style={{ color: '#ccc' }}>—</span>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      render: (_, r) => (
        <Space size="small">
          <Tooltip title="Reconcile"><Button size="small" onClick={() => history.push(`/main/banking/reconcile?accountId=${r.id}`)}>Reconcile</Button></Tooltip>
          <Tooltip title="Transfer"><Button size="small" icon={<SwapOutlined />} onClick={() => history.push('/main/banking/transfers')} /></Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div className="al-modern-page" style={{ padding: 24 }}>
      {/* Header */}
      <div className="al-page-head" style={{ marginBottom: 20 }}>
        <div className="al-modern-head">
          <div className="al-modern-badge" style={{ background: 'linear-gradient(135deg, #1890ff, #69c0ff)' }}>
            <BankOutlined />
          </div>
          <div>
            <h3 style={{ margin: 0 }}>Bank Accounts</h3>
            <span style={{ color: '#667085' }}>Account balances &amp; summary</span>
          </div>
        </div>
        <Space className="al-list-toolbar" align="center">
          <Input.Search
            allowClear
            placeholder="Search bank accounts by name, number or type..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 320 }}
          />
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>Refresh</Button>
        </Space>
      </div>

      {/* Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small" className="al-stat-card" style={{ borderTop: '3px solid #1890ff' }}>
            <Statistic title={<><BankOutlined style={{ marginRight: 4 }} />Accounts</>} value={totalAccounts} valueStyle={{ fontSize: 22, color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" className="al-stat-card" style={{ borderTop: '3px solid #52c41a' }}>
            <Statistic title={<><DollarOutlined style={{ marginRight: 4 }} />Total Balance</>} value={totalCurrentBalance} precision={2} prefix={cSym} valueStyle={{ fontSize: 22, color: totalCurrentBalance >= 0 ? '#52c41a' : '#cf1322' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" className="al-stat-card" style={{ borderTop: '3px solid #722ed1' }}>
            <Statistic title={<><CheckCircleOutlined style={{ marginRight: 4 }} />Cleared</>} value={totalClearedBalance} precision={2} prefix={cSym} valueStyle={{ fontSize: 22, color: '#722ed1' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" className="al-stat-card" style={{ borderTop: '3px solid #fa8c16' }}>
            <Statistic title={<><ClockCircleOutlined style={{ marginRight: 4 }} />Uncleared</>} value={totalUnclearedBalance} precision={2} prefix={cSym} valueStyle={{ fontSize: 22, color: '#fa8c16' }} />
          </Card>
        </Col>
      </Row>

      {/* Account Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={filteredAccounts}
          loading={loading}
          pagination={false}
          size="middle"
          locale={{ emptyText: searchText ? 'No bank accounts match your search.' : 'No bank accounts found. Add bank accounts in Chart of Accounts.' }}
        />
      </Card>

      {/* Account Details Expansion */}
      {filteredAccounts.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <h3 style={{ margin: 0 }}>Account Summary</h3>
            <span style={{ color: '#98a2b3', fontSize: 13 }}>
              {filteredAccounts.length} account{filteredAccounts.length === 1 ? '' : 's'}
            </span>
          </div>
          <Row gutter={[16, 16]}>
            {filteredAccounts.map(acc => (
              <Col xs={24} sm={12} lg={8} key={acc.key}>
                <Card size="small" className="al-stat-card" title={acc.accountName} extra={<Tag color={acc.currentBalance >= 0 ? 'green' : 'red'}>{acc.accountType}</Tag>}>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#667085' }}>Current Balance:</span>
                      <span style={{ fontWeight: 700, color: acc.currentBalance >= 0 ? '#3f8600' : '#cf1322' }}>
                        {cSym} {Number(acc.currentBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#667085' }}>Cleared:</span>
                      <span>{cSym} {Number(acc.clearedBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#667085' }}>Uncleared:</span>
                      <span style={{ color: '#fa8c16' }}>{cSym} {Number(acc.unclearedBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                  {acc.txnCount > 0 && (
                    <div style={{ fontSize: 12, color: '#98a2b3', borderTop: '1px solid #eef1f5', paddingTop: 8, marginTop: 4 }}>
                      {acc.txnCount} transactions · Last: {acc.lastActivity ? moment(acc.lastActivity).format('MMM DD') : '—'}
                    </div>
                  )}
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      )}
    </div>
  );
};

export default BankAccounts;
