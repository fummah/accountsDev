import React, { useState, useEffect, useMemo } from 'react';
import { Table, Button, DatePicker, Select, Card, Checkbox, Input, message, Statistic, Row, Col, Typography, Tag, Space, Progress, Alert, Tooltip, Divider } from 'antd';
import { SaveOutlined, ReloadOutlined, BankOutlined, CheckCircleOutlined, ExclamationCircleOutlined, DownloadOutlined, HistoryOutlined, SyncOutlined, SearchOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { Option } = Select;
const { Title, Text } = Typography;
const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BankReconciliation = () => {
  const { symbol: cSym } = useCurrency();
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [reconciliationHistory, setReconciliationHistory] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [statementDate, setStatementDate] = useState(moment());
  const [statementBalance, setStatementBalance] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [reconciling, setReconciling] = useState(false);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (selectedAccount) {
      loadTransactions();
      loadReconciliationHistory();
    }
  }, [selectedAccount, statementDate]);

  const loadData = async () => {
    try {
      const accRes = await window.electronAPI.getChartOfAccounts().catch(() => []);
      const accs = Array.isArray(accRes) ? accRes : [];
      const banks = accs.filter(a => {
        const t = (a.accountType || a.type || '').toLowerCase();
        const n = (a.accountName || a.name || '').toLowerCase();
        return t.includes('bank') || t.includes('cash') || n.includes('bank') || n.includes('checking') || n.includes('savings');
      });
      setAccounts(banks.length > 0 ? banks : accs);
    } catch (error) {
      message.error('Failed to load bank accounts');
    }
  };

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const raw = await window.electronAPI.getTransactions().catch(() => []);
      const data = Array.isArray(raw) ? raw : [];
      // Filter transactions for selected account and up to statement date
      const filtered = data.filter(tx => 
        String(tx.accountId) === String(selectedAccount) &&
        moment(tx.date).isSameOrBefore(statementDate, 'day')
      );
      setTransactions(filtered.map(tx => ({
        ...tx,
        isReconciled: Boolean(tx.isReconciled),
        amount: Number(tx.debit || 0) - Number(tx.credit || 0)
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
      // This would ideally come from a reconciliations table
      const raw = await window.electronAPI.getTransactions().catch(() => []);
      const data = Array.isArray(raw) ? raw : [];
      const reconciled = data.filter(tx => tx.type === 'reconciliation' && String(tx.accountId) === String(selectedAccount));
      setReconciliationHistory(reconciled.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)));
    } catch { setReconciliationHistory([]); }
  };

  const handleReconcile = async () => {
    if (!selectedAccount || !statementBalance) {
      message.warning('Please select account and enter statement balance');
      return;
    }
    try {
      setReconciling(true);
      const reconciledTransactions = transactions
        .filter(tx => tx.isReconciled)
        .map(tx => tx.id);

      const result = await window.electronAPI.reconcileTransactions({
        accountId: selectedAccount,
        statementDate: statementDate.format('YYYY-MM-DD'),
        statementBalance: parseFloat(statementBalance),
        transactions: reconciledTransactions
      });

      if (result && result.success) {
        message.success('Account reconciled successfully');
        loadTransactions();
        loadReconciliationHistory();
      } else {
        throw new Error(result?.error || 'Reconciliation failed');
      }
    } catch (error) {
      message.error(error.message || 'Failed to reconcile account');
    } finally {
      setReconciling(false);
    }
  };

  const handleTransactionCheck = (txId) => {
    setTransactions(prev => 
      prev.map(tx => 
        tx.id === txId ? { ...tx, isReconciled: !tx.isReconciled } : tx
      )
    );
  };

  const handleSelectAll = (checked) => {
    setTransactions(prev => 
      prev.map(tx => ({ ...tx, isReconciled: checked }))
    );
  };

  const exportCSV = () => {
    try {
      const headers = ['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Reconciled'];
      const rows = transactions.map(d => [
        d.date || '', d.reference || '', (d.description || '').replace(/"/g, '""'), 
        Number(d.debit || 0).toFixed(2), Number(d.credit || 0).toFixed(2), d.isReconciled ? 'Yes' : 'No'
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
      (tx.date || '').includes(s)
    );
  }, [transactions, searchText]);

  const reconciledTransactions = filteredTransactions.filter(tx => tx.isReconciled);
  const clearedBalance = reconciledTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  const difference = parseFloat(statementBalance || 0) - clearedBalance;
  const progress = transactions.length > 0 ? (reconciledTransactions.length / transactions.length) * 100 : 0;

  const selectedAccountInfo = accounts.find(a => String(a.id) === String(selectedAccount));

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      width: 100,
      render: (date) => date ? moment(date).format('DD MMM YY') : '-',
      sorter: (a, b) => new Date(a.date || 0) - new Date(b.date || 0),
    },
    {
      title: 'Reference',
      dataIndex: 'reference',
      key: 'reference',
      width: 120,
      ellipsis: true,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Debit',
      dataIndex: 'debit',
      key: 'debit',
      width: 100,
      align: 'right',
      render: (v) => v ? <Text style={{ color: '#f5222d' }}>{cSym} {fmt(v)}</Text> : '-',
    },
    {
      title: 'Credit',
      dataIndex: 'credit',
      key: 'credit',
      width: 100,
      align: 'right',
      render: (v) => v ? <Text style={{ color: '#52c41a' }}>{cSym} {fmt(v)}</Text> : '-',
    },
    {
      title: 'Amount',
      key: 'amount',
      width: 100,
      align: 'right',
      render: (_, record) => {
        const amt = record.amount;
        return <Text strong style={{ color: amt >= 0 ? '#f5222d' : '#52c41a' }}>{cSym} {fmt(Math.abs(amt))}</Text>;
      },
    },
    {
      title: <Checkbox checked={reconciledTransactions.length === filteredTransactions.length && filteredTransactions.length > 0} indeterminate={reconciledTransactions.length > 0 && reconciledTransactions.length < filteredTransactions.length} onChange={(e) => handleSelectAll(e.target.checked)} />,
      key: 'reconciled',
      width: 80,
      render: (_, record) => (
        <Checkbox
          checked={record.isReconciled}
          onChange={() => handleTransactionCheck(record.id)}
        />
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}><BankOutlined style={{ marginRight: 8 }} />Bank Reconciliation</Title>
          <Text type="secondary">Match bank statements with ledger transactions</Text>
        </div>
      </div>

      {/* Account Selection */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={8}>
            <Select
              style={{ width: '100%' }}
              placeholder="Select Bank Account"
              value={selectedAccount}
              onChange={setSelectedAccount}
              showSearch
              optionFilterProp="children"
            >
              {accounts.map(account => (
                <Option key={account.id} value={account.id}>
                  {account.accountName || account.name}{account.accountNumber ? ` (${account.accountNumber})` : ''}
                </Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={6}>
            <DatePicker
              style={{ width: '100%' }}
              value={statementDate}
              onChange={setStatementDate}
              placeholder="Statement Date"
            />
          </Col>
          <Col xs={24} sm={6}>
            <Input
              style={{ width: '100%' }}
              prefix={cSym}
              placeholder="Statement Balance"
              value={statementBalance}
              onChange={e => setStatementBalance(e.target.value)}
              type="number"
            />
          </Col>
          <Col xs={24} sm={4}>
            <Space>
              <Button 
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleReconcile}
                disabled={!selectedAccount || !statementBalance}
                loading={reconciling}
              >
                Reconcile
              </Button>
              <Button 
                icon={<ReloadOutlined />}
                onClick={loadTransactions}
                loading={loading}
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
          description={`Statement as of ${statementDate.format('DD MMM YYYY')} with balance $${fmt(statementBalance)}`}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Reconciliation Summary */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #1890ff' }}>
            <Statistic title="Statement Balance" value={parseFloat(statementBalance || 0)} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #52c41a' }}>
            <Statistic title="Cleared Balance" value={clearedBalance} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: difference === 0 ? '3px solid #52c41a' : '3px solid #f5222d' }}>
            <Statistic 
              title="Difference" 
              value={difference} 
              precision={2} 
              prefix={cSym} 
              valueStyle={{ fontSize: 18, color: difference === 0 ? '#52c41a' : '#f5222d' }}
              suffix={difference === 0 ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #722ed1' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Progress</div>
              <Progress percent={Math.round(progress)} size={40} />
              <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>{reconciledTransactions.length}/{filteredTransactions.length}</div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Transactions Table */}
      <Card 
        title={
          <Space>
            <span>Transactions</span>
            <Tag color="blue">{filteredTransactions.length} items</Tag>
            <Tag color="green">{reconciledTransactions.length} reconciled</Tag>
          </Space>
        }
        size="small"
        extra={
          <Space>
            <Input placeholder="Search transactions..." prefix={<SearchOutlined />} value={searchText} onChange={e => setSearchText(e.target.value)} allowClear style={{ width: 200 }} />
            <Button icon={<DownloadOutlined />} onClick={exportCSV} size="small">CSV</Button>
          </Space>
        }
      >
        <Table 
          columns={columns} 
          dataSource={filteredTransactions}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ pageSize: 15, showSizeChanger: true, showTotal: t => `${t} transactions` }}
          scroll={{ x: 700 }}
          rowClassName={(record) => record.isReconciled ? 'reconciled-row' : ''}
          summary={() => filteredTransactions.length > 0 ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={3}><Text strong>Total</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right"><Text strong style={{ color: '#f5222d' }}>${fmt(filteredTransactions.reduce((s, tx) => s + Number(tx.debit || 0), 0))}</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right"><Text strong style={{ color: '#52c41a' }}>${fmt(filteredTransactions.reduce((s, tx) => s + Number(tx.credit || 0), 0))}</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right"><Text strong>${fmt(clearedBalance)}</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={6} />
            </Table.Summary.Row>
          ) : null}
        />
      </Card>

      {/* Reconciliation History */}
      {reconciliationHistory.length > 0 && (
        <Card 
          title={<><HistoryOutlined style={{ marginRight: 4 }} /> Reconciliation History</>} 
          size="small" 
          style={{ marginTop: 16 }}
        >
          <Table
            dataSource={reconciliationHistory}
            rowKey="id"
            size="small"
            pagination={false}
            columns={[
              { title: 'Date', dataIndex: 'date', render: v => moment(v).format('DD MMM YY'), width: 100 },
              { title: 'Statement Balance', dataIndex: 'statementBalance', render: v => `${cSym} ${fmt(v)}`, align: 'right', width: 120 },
              { title: 'Notes', dataIndex: 'description', ellipsis: true },
            ]}
          />
        </Card>
      )}

      <style jsx>{`
        .reconciled-row {
          background-color: #f6ffed;
        }
        .reconciled-row:hover {
          background-color: #d9f7be !important;
        }
      `}</style>
    </div>
  );
};

export default BankReconciliation;