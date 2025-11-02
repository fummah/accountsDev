import React, { useState, useEffect } from 'react';
import { Table, Select, DatePicker, Space, Card, Statistic } from 'antd';
import moment from 'moment';

const { Option } = Select;
const { RangePicker } = DatePicker;

const GeneralLedger = () => {
  const [accounts, setAccounts] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [dateRange, setDateRange] = useState([
    moment().startOf('month'),
    moment().endOf('month')
  ]);

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccount && dateRange) {
      loadLedger();
    }
  }, [selectedAccount, dateRange]);

  const loadAccounts = async () => {
    try {
      const accountsData = await window.electronAPI.getChartOfAccounts();
      setAccounts(accountsData);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  const loadLedger = async () => {
    try {
      const ledgerData = await window.electronAPI.getLedger();
      // Filter ledger data based on selected account and date range
      const filteredData = ledgerData.filter(entry => 
        entry.accountId === selectedAccount &&
        moment(entry.date).isBetween(dateRange[0], dateRange[1], 'day', '[]')
      );
      setLedger(filteredData);
    } catch (error) {
      console.error('Failed to load ledger:', error);
    }
  };

  // Calculate running balance
  const calculateRunningBalance = (entries) => {
    let balance = 0;
    return entries.map(entry => {
      balance += (entry.debit || 0) - (entry.credit || 0);
      return { ...entry, balance };
    });
  };

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (date) => moment(date).format('DD/MM/YYYY'),
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
      title: 'Balance',
      dataIndex: 'balance',
      key: 'balance',
      render: (amount) => `$${amount.toFixed(2)}`,
    },
  ];

  const selectedAccountData = accounts.find(a => a.id === selectedAccount);

  return (
    <div style={{ padding: '24px' }}>
      <h2>General Ledger</h2>
      
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space size="large">
          <Select
            style={{ width: 300 }}
            placeholder="Select Account"
            value={selectedAccount}
            onChange={setSelectedAccount}
          >
            {accounts.map(account => (
              <Option key={account.id} value={account.id}>
                {account.accountCode} - {account.accountName}
              </Option>
            ))}
          </Select>

          <RangePicker
            value={dateRange}
            onChange={setDateRange}
          />
        </Space>

        {selectedAccountData && (
          <div style={{ display: 'flex', gap: '16px' }}>
            <Card>
              <Statistic
                title="Account Code"
                value={selectedAccountData.accountCode}
              />
            </Card>
            <Card>
              <Statistic
                title="Account Type"
                value={selectedAccountData.accountType}
              />
            </Card>
            <Card>
              <Statistic
                title="Current Balance"
                value={selectedAccountData.balance}
                prefix="$"
                precision={2}
              />
            </Card>
          </div>
        )}

        <Table 
          columns={columns} 
          dataSource={calculateRunningBalance(ledger)}
          rowKey="id"
          pagination={false}
          summary={pageData => {
            let totalDebit = 0;
            let totalCredit = 0;

            pageData.forEach(({ debit, credit }) => {
              totalDebit += debit || 0;
              totalCredit += credit || 0;
            });

            return (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3}>Total</Table.Summary.Cell>
                <Table.Summary.Cell index={3}>
                  ${totalDebit.toFixed(2)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4}>
                  ${totalCredit.toFixed(2)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5}>
                  ${(totalDebit - totalCredit).toFixed(2)}
                </Table.Summary.Cell>
              </Table.Summary.Row>
            );
          }}
        />
      </Space>
    </div>
  );
};

export default GeneralLedger;