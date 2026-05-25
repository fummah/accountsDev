import React, { useEffect, useState, useCallback } from 'react';
import { Card, Table, Row, Col, Statistic, Button, Space, Tag, message, Tooltip, Divider } from 'antd';
import { BankOutlined, ReloadOutlined, SwapOutlined, DollarOutlined, CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useHistory } from 'react-router-dom';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const BankAccounts = () => {
  const { symbol: cSym } = useCurrency();
  const history = useHistory();
  const [loading, setLoading] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [accs, txns] = await Promise.all([
        window.electronAPI.getChartOfAccounts?.().catch(() => []),
        window.electronAPI.getTransactions?.().catch(() => []),
      ]);

      const allAccs = Array.isArray(accs) ? accs : (accs?.data || []);
      const allTxns = Array.isArray(txns) ? txns : [];

      // Filter bank/cash type accounts
      const banks = allAccs.filter(a => {
        const t = (a.accountType || a.type || '').toLowerCase();
        const n = (a.accountName || a.name || '').toLowerCase();
        return t.includes('bank') || t.includes('cash') || t.includes('checking') || t.includes('savings') ||
          n.includes('bank') || n.includes('checking') || n.includes('savings');
      });

      // Compute balances per account
      const enriched = banks.map(acc => {
        const accName = acc.accountName || acc.name || '';
        const accId = acc.id;

        // Get transactions for this account
        const accTxns = allTxns.filter(t =>
          String(t.accountId) === String(accId) ||
          (t.account || '').toLowerCase() === accName.toLowerCase()
        );

        // Current balance = opening + all transactions
        const openingBalance = Number(acc.openingBalance || acc.balance || 0);
        const totalDebits = accTxns.reduce((s, t) => s + (Number(t.debit || t.amount || 0)), 0);
        const totalCredits = accTxns.reduce((s, t) => s + (Number(t.credit || 0)), 0);
        const currentBalance = openingBalance + totalDebits - totalCredits;

        // Cleared = only reconciled/cleared transactions
        const clearedTxns = accTxns.filter(t => (t.status || '').toLowerCase() === 'cleared' || (t.reconciled || false));
        const clearedDebits = clearedTxns.reduce((s, t) => s + (Number(t.debit || t.amount || 0)), 0);
        const clearedCredits = clearedTxns.reduce((s, t) => s + (Number(t.credit || 0)), 0);
        const clearedBalance = openingBalance + clearedDebits - clearedCredits;

        // Uncleared = current - cleared
        const unclearedBalance = currentBalance - clearedBalance;

        // Recent activity
        const recentTxns = accTxns.slice(0, 5);
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
          recentTxns,
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

  const columns = [
    {
      title: 'Account',
      key: 'account',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{r.accountName}</div>
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
          <Tooltip title="Reconcile"><Button size="small" onClick={() => history.push('/main/banking/reconcile')}>Reconcile</Button></Tooltip>
          <Tooltip title="Transfer"><Button size="small" icon={<SwapOutlined />} onClick={() => history.push('/main/banking/transfers')} /></Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}><BankOutlined style={{ marginRight: 8 }} />Bank Accounts</h2>
          <span style={{ color: '#888' }}>Account balances &amp; summary</span>
        </div>
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>Refresh</Button>
      </div>

      {/* Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #1890ff' }}>
            <Statistic title={<><BankOutlined style={{ marginRight: 4 }} />Accounts</>} value={totalAccounts} valueStyle={{ fontSize: 22, color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #52c41a' }}>
            <Statistic title={<><DollarOutlined style={{ marginRight: 4 }} />Total Balance</>} value={totalCurrentBalance} precision={2} prefix={cSym} valueStyle={{ fontSize: 22, color: totalCurrentBalance >= 0 ? '#52c41a' : '#cf1322' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #722ed1' }}>
            <Statistic title={<><CheckCircleOutlined style={{ marginRight: 4 }} />Cleared</>} value={totalClearedBalance} precision={2} prefix={cSym} valueStyle={{ fontSize: 22, color: '#722ed1' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #fa8c16' }}>
            <Statistic title={<><ClockCircleOutlined style={{ marginRight: 4 }} />Uncleared</>} value={totalUnclearedBalance} precision={2} prefix={cSym} valueStyle={{ fontSize: 22, color: '#fa8c16' }} />
          </Card>
        </Col>
      </Row>

      {/* Account Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={bankAccounts}
          loading={loading}
          pagination={false}
          size="middle"
          locale={{ emptyText: 'No bank or cash accounts found. Add bank accounts in Chart of Accounts.' }}
        />
      </Card>

      {/* Account Details Expansion */}
      {bankAccounts.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <Divider orientation="left">Account Summary</Divider>
          <Row gutter={[16, 16]}>
            {bankAccounts.map(acc => (
              <Col xs={24} sm={12} lg={8} key={acc.key}>
                <Card size="small" title={acc.accountName} extra={<Tag color={acc.currentBalance >= 0 ? 'green' : 'red'}>{acc.accountType}</Tag>}>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#888' }}>Current Balance:</span>
                      <span style={{ fontWeight: 700, color: acc.currentBalance >= 0 ? '#3f8600' : '#cf1322' }}>
                        {cSym} {Number(acc.currentBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#888' }}>Cleared:</span>
                      <span>{cSym} {Number(acc.clearedBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#888' }}>Uncleared:</span>
                      <span style={{ color: '#fa8c16' }}>{cSym} {Number(acc.unclearedBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                  {acc.txnCount > 0 && (
                    <div style={{ fontSize: 12, color: '#888', borderTop: '1px solid #f0f0f0', paddingTop: 8, marginTop: 4 }}>
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
