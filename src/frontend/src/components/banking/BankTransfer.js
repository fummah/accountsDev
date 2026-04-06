import React, { useState, useEffect, useMemo } from 'react';
import { Form, Select, Input, InputNumber, DatePicker, Button, Card, Table, Tabs, message, Statistic, Space, Tag, Typography } from 'antd';
import { SwapOutlined, HistoryOutlined, SearchOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { Option } = Select;
const { TabPane } = Tabs;
const { Text } = Typography;
const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BankTransfer = () => {
  const { symbol: cSym } = useCurrency();
  const [form] = Form.useForm();
  const [accounts, setAccounts] = useState([]);
  const [allAccounts, setAllAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fromBalance, setFromBalance] = useState(0);
  const [toBalance, setToBalance] = useState(0);
  const [transferHistory, setTransferHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [activeTab, setActiveTab] = useState('1');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([loadAccounts(), loadHistory()]);
  };

  const loadAccounts = async () => {
    try {
      const data = await window.electronAPI.getChartOfAccounts();
      const list = Array.isArray(data) ? data : [];
      setAllAccounts(list);
      const bankAccounts = list.filter(account => {
        const t = (account.accountType || account.type || '').toLowerCase();
        const n = (account.accountName || account.name || '').toLowerCase();
        return t.includes('bank') || t.includes('cash') || n.includes('bank') || n.includes('checking') || n.includes('savings');
      });
      setAccounts(bankAccounts.length > 0 ? bankAccounts : list);
    } catch (error) {
      message.error('Failed to load bank accounts');
    }
  };

  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      let transfers = [];
      if (window.electronAPI.getTransfers) {
        const res = await window.electronAPI.getTransfers();
        if (res && res.error) {
          console.error('getTransfers error:', res.error);
        } else {
          transfers = Array.isArray(res) ? res : [];
        }
      }
      if (transfers.length === 0 && window.electronAPI.getTransactions) {
        const txns = await window.electronAPI.getTransactions();
        const list = Array.isArray(txns) ? txns : [];
        transfers = list.filter(t => ['transfer_in', 'transfer_out'].includes((t.type || '').toLowerCase()));
      }
      transfers.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setTransferHistory(transfers);
    } catch (e) {
      console.error('Failed to load transfer history', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const getAccountName = (id) => {
    if (!id) return '-';
    const acc = allAccounts.find(a => String(a.id) === String(id));
    return acc?.accountName || acc?.name || `#${id}`;
  };

  const refreshBalance = async (accountId, setter) => {
    try {
      if (!accountId) { setter(0); return; }
      const trial = await window.electronAPI.getTrialBalance();
      const row = Array.isArray(trial) ? trial.find(r => Number(r.accountId) === Number(accountId)) : null;
      setter(row ? Number(row.balance || 0) : 0);
    } catch (e) {
      setter(0);
    }
  };

  const exportTransfersCSV = () => {
    try {
      const headers = ['Date', 'Account', 'Type', 'Reference', 'Description', 'Debit', 'Credit'];
      const rows = transferHistory.map(d => [
        d.date || '', getAccountName(d.accountId), d.type || '',
        d.reference || '', (d.description || '').replace(/"/g, '""'),
        Number(d.debit || 0).toFixed(2), Number(d.credit || 0).toFixed(2)
      ].map(v => `"${v}"`).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transfers_${moment().format('YYYY-MM-DD')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.success('Exported CSV');
    } catch (e) {
      message.error('Failed to export CSV');
    }
  };

  const handleTransfer = async (values) => {
    try {
      setLoading(true);
      const transferData = {
        fromAccount: values.fromAccount,
        toAccount: values.toAccount,
        amount: values.amount,
        date: values.date.format('YYYY-MM-DD'),
        reference: values.reference,
        description: values.description || '',
      };

      const res = await window.electronAPI.createBankTransfer(transferData);
      if (res && res.error) {
        throw new Error(res.error);
      }
      message.success('Transfer completed successfully');
      form.resetFields();
      form.setFieldsValue({ date: moment() });
      setFromBalance(0);
      setToBalance(0);
      await loadHistory();
      setActiveTab('2');
    } catch (error) {
      message.error(error?.message || 'Failed to process transfer');
    } finally {
      setLoading(false);
    }
  };

  const filteredHistory = useMemo(() => {
    if (!historySearch) return transferHistory;
    const s = historySearch.toLowerCase();
    return transferHistory.filter(d =>
      (d.reference || '').toLowerCase().includes(s) ||
      (d.description || '').toLowerCase().includes(s) ||
      (d.date || '').includes(s) ||
      getAccountName(d.accountId).toLowerCase().includes(s)
    );
  }, [transferHistory, historySearch, allAccounts]);

  const historyColumns = [
    { title: 'Date', dataIndex: 'date', key: 'date', width: 110, sorter: (a, b) => (a.date || '').localeCompare(b.date || ''), render: v => v ? moment(v).format('DD MMM YYYY') : '-' },
    { title: 'Account', dataIndex: 'accountId', key: 'accountId', width: 160, render: v => getAccountName(v) },
    { title: 'Type', dataIndex: 'type', key: 'type', width: 100, render: v => (v || '').toLowerCase() === 'transfer_out' ? <Tag color="red">Out</Tag> : <Tag color="green">In</Tag> },
    { title: 'Reference', dataIndex: 'reference', key: 'reference', width: 140, ellipsis: true },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Amount', key: 'amount', width: 120, align: 'right', sorter: (a, b) => Number(a.debit || a.credit || 0) - Number(b.debit || b.credit || 0),
      render: (_, r) => { const amt = Number(r.debit || r.credit || 0); const isOut = (r.type || '').toLowerCase() === 'transfer_out'; return <Text strong style={{ color: isOut ? '#ff4d4f' : '#52c41a' }}>{cSym} {fmt(amt)}</Text>; } },
    { title: 'Status', key: 'status', width: 80, render: (_, r) => (r.status || '').toLowerCase() === 'voided' ? <Tag color="red">Void</Tag> : <Tag color="green">Active</Tag> },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <h2>Bank Transfer</h2>

      <Card>
        <Tabs activeKey={activeTab} onTabClick={(key) => setActiveTab(key)}>
          <TabPane tab="New Transfer" key="1">
            <Form form={form} layout="vertical" onFinish={handleTransfer} initialValues={{ date: moment() }}
              style={{ maxWidth: 600, margin: '0 auto' }}>
              <Form.Item name="fromAccount" label="From Account" rules={[{ required: true, message: 'Please select source account' }]}>
                <Select placeholder="Select source account" showSearch optionFilterProp="children" onChange={(val) => refreshBalance(val, setFromBalance)}>
                  {accounts.map(account => (
                    <Option key={account.id} value={account.id}>{account.accountName || account.name}</Option>
                  ))}
                </Select>
              </Form.Item>

              <div style={{ marginBottom: 16 }}>
                <Statistic title="From Account Balance" prefix={cSym} value={Number(fromBalance).toFixed(2)} />
              </div>

              <div style={{ textAlign: 'center', margin: '16px 0' }}>
                <SwapOutlined style={{ fontSize: '24px' }} />
              </div>

              <Form.Item name="toAccount" label="To Account" rules={[
                { required: true, message: 'Please select destination account' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('fromAccount') !== value) return Promise.resolve();
                    return Promise.reject(new Error('Source and destination accounts must be different'));
                  },
                }),
              ]}>
                <Select placeholder="Select destination account" showSearch optionFilterProp="children" onChange={(val) => refreshBalance(val, setToBalance)}>
                  {accounts.map(account => (
                    <Option key={account.id} value={account.id}>{account.accountName || account.name}</Option>
                  ))}
                </Select>
              </Form.Item>

              <div style={{ marginBottom: 16 }}>
                <Statistic title="To Account Balance" prefix={cSym} value={Number(toBalance).toFixed(2)} />
              </div>

              <Form.Item name="amount" label="Amount" rules={[
                { required: true, message: 'Please enter transfer amount' },
                { type: 'number', min: 0.01, message: 'Amount must be greater than 0' },
              ]}>
                <InputNumber style={{ width: '100%' }}
                  formatter={value => value ? `${cSym} ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                  parser={value => value.replace(/[^\d.]/g, '')} precision={2} placeholder="Enter amount" />
              </Form.Item>

              <Form.Item name="date" label="Transfer Date" rules={[{ required: true, message: 'Please select transfer date' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item name="reference" label="Reference">
                <Input placeholder="Enter reference number" />
              </Form.Item>

              <Form.Item name="description" label="Description">
                <Input placeholder="Enter description (optional)" />
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} block>Complete Transfer</Button>
              </Form.Item>
            </Form>
          </TabPane>

          <TabPane tab={<span><HistoryOutlined /> Transfer History {transferHistory.length > 0 ? `(${transferHistory.length})` : ''}</span>} key="2">
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Input placeholder="Search transfers..." prefix={<SearchOutlined />} value={historySearch}
                onChange={e => setHistorySearch(e.target.value)} allowClear style={{ width: 250 }} />
              <Space>
                {transferHistory.length > 0 && (
                  <Button icon={<DownloadOutlined />} onClick={exportTransfersCSV} size="small">CSV</Button>
                )}
                <Button icon={<ReloadOutlined />} onClick={loadHistory} loading={historyLoading}>Refresh</Button>
              </Space>
            </div>
            <Table columns={historyColumns} dataSource={filteredHistory} rowKey={(r, i) => r.id || i} size="small"
              loading={historyLoading} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: t => `${t} transfers` }}
              locale={{ emptyText: 'No transfers recorded yet' }} />
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default BankTransfer;