import React, { useState, useEffect } from 'react';
import { Table, Button, DatePicker, Select, Card, Checkbox, Input, message, Statistic } from 'antd';
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Option } = Select;

const BankReconciliation = () => {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [statementDate, setStatementDate] = useState(moment());
  const [statementBalance, setStatementBalance] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccount) {
      loadTransactions();
    }
  }, [selectedAccount, statementDate]);

  const loadAccounts = async () => {
    try {
      const data = await window.electronAPI.getChartOfAccounts();
      // Filter only bank accounts
      const bankAccounts = data.filter(account => 
        account.accountType.toLowerCase().includes('bank')
      );
      setAccounts(bankAccounts);
    } catch (error) {
      message.error('Failed to load bank accounts');
    }
  };

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const data = await window.electronAPI.getTransactions();
      // Filter transactions for selected account and up to statement date
      const filtered = data.filter(tx => 
        tx.accountId === selectedAccount &&
        moment(tx.date).isSameOrBefore(statementDate)
      );
      setTransactions(filtered);
    } catch (error) {
      message.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  const handleReconcile = async () => {
    try {
      setLoading(true);
      const reconciledTransactions = transactions
        .filter(tx => tx.isReconciled)
        .map(tx => tx.id);

      await window.electronAPI.reconcileTransactions({
        accountId: selectedAccount,
        statementDate: statementDate.format('YYYY-MM-DD'),
        statementBalance: parseFloat(statementBalance),
        transactions: reconciledTransactions
      });

      message.success('Account reconciled successfully');
      loadTransactions();
    } catch (error) {
      message.error('Failed to reconcile account');
    } finally {
      setLoading(false);
    }
  };

  const handleTransactionCheck = (txId) => {
    setTransactions(prev => 
      prev.map(tx => 
        tx.id === txId ? { ...tx, isReconciled: !tx.isReconciled } : tx
      )
    );
  };

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (date) => moment(date).format('MM/DD/YYYY'),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Reference',
      dataIndex: 'reference',
      key: 'reference',
    },
    {
      title: 'Debit',
      dataIndex: 'debit',
      key: 'debit',
      render: (amount) => amount ? `$${amount.toFixed(2)}` : '',
    },
    {
      title: 'Credit',
      dataIndex: 'credit',
      key: 'credit',
      render: (amount) => amount ? `$${amount.toFixed(2)}` : '',
    },
    {
      title: 'Reconciled',
      key: 'reconciled',
      render: (_, record) => (
        <Checkbox
          checked={record.isReconciled}
          onChange={() => handleTransactionCheck(record.id)}
        />
      ),
    },
  ];

  // Calculate totals
  const calculateTotals = () => {
    const reconciled = transactions.filter(tx => tx.isReconciled);
    return {
      debit: reconciled.reduce((sum, tx) => sum + (tx.debit || 0), 0),
      credit: reconciled.reduce((sum, tx) => sum + (tx.credit || 0), 0),
    };
  };

  const totals = calculateTotals();
  const difference = parseFloat(statementBalance || 0) - (totals.debit - totals.credit);

  return (
    <div style={{ padding: '24px' }}>
      <h2>Bank Reconciliation</h2>

      <Card style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <Select
            style={{ width: 300 }}
            placeholder="Select Bank Account"
            value={selectedAccount}
            onChange={setSelectedAccount}
          >
            {accounts.map(account => (
              <Option key={account.id} value={account.id}>
                {account.accountName}
              </Option>
            ))}
          </Select>

          <DatePicker
            value={statementDate}
            onChange={setStatementDate}
            placeholder="Statement Date"
          />

          <Input
            style={{ width: 200 }}
            prefix="$"
            placeholder="Statement Balance"
            value={statementBalance}
            onChange={e => setStatementBalance(e.target.value)}
          />

          <Button 
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleReconcile}
            disabled={!selectedAccount || !statementBalance}
          >
            Complete Reconciliation
          </Button>

          <Button 
            icon={<ReloadOutlined />}
            onClick={loadTransactions}
          >
            Refresh
          </Button>
        </div>
      </Card>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <Card>
          <Statistic
            title="Statement Balance"
            value={parseFloat(statementBalance || 0)}
            precision={2}
            prefix="$"
          />
        </Card>
        <Card>
          <Statistic
            title="Cleared Balance"
            value={totals.debit - totals.credit}
            precision={2}
            prefix="$"
          />
        </Card>
        <Card>
          <Statistic
            title="Difference"
            value={difference}
            precision={2}
            prefix="$"
            valueStyle={{ color: difference === 0 ? '#3f8600' : '#cf1322' }}
          />
        </Card>
      </div>

      <Table 
        columns={columns} 
        dataSource={transactions}
        rowKey="id"
        loading={loading}
        pagination={false}
        summary={() => (
          <Table.Summary>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={3}>Total Reconciled</Table.Summary.Cell>
              <Table.Summary.Cell index={3}>${totals.debit.toFixed(2)}</Table.Summary.Cell>
              <Table.Summary.Cell index={4}>${totals.credit.toFixed(2)}</Table.Summary.Cell>
              <Table.Summary.Cell index={5} />
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </div>
  );
};

export default BankReconciliation;