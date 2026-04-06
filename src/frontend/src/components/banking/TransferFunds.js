import React, { useEffect, useMemo, useState } from 'react';
import { Form, Input, InputNumber, Select, DatePicker, Button, Table, message, Card, Row, Col, Statistic, Typography, Tag, Space, Alert } from 'antd';
import { SwapOutlined, BankOutlined, DownloadOutlined, HistoryOutlined, SearchOutlined, ArrowRightOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { Option } = Select;
const { Title, Text } = Typography;
const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TransferFunds = () => {
  const { symbol: cSym } = useCurrency();
  const [form] = Form.useForm();
  const [accounts, setAccounts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [transferHistory, setTransferHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [fromBalance, setFromBalance] = useState(0);
  const [toBalance, setToBalance] = useState(0);
  const [fromAccountId, setFromAccountId] = useState(null);
  const [toAccountId, setToAccountId] = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [accRes, txnRes] = await Promise.all([
        window.electronAPI.getChartOfAccounts().catch(() => []),
        window.electronAPI.getTransactions().catch(() => []),
      ]);
      const accs = Array.isArray(accRes) ? accRes : [];
      setAccounts(accs);
      const banks = accs.filter(a => {
        const t = (a.accountType || a.type || '').toLowerCase();
        const n = (a.accountName || a.name || '').toLowerCase();
        return t.includes('bank') || t.includes('cash') || n.includes('bank') || n.includes('checking') || n.includes('savings');
      });
      setBankAccounts(banks.length > 0 ? banks : accs);

      const txns = Array.isArray(txnRes) ? txnRes : [];
      // Pair transfer_out and transfer_in rows by reference to build unified transfer records
      const outRows = txns.filter(t => (t.type || '').toLowerCase() === 'transfer_out');
      const inRows = txns.filter(t => (t.type || '').toLowerCase() === 'transfer_in');
      const paired = [];
      const usedInIds = new Set();
      outRows.forEach(out => {
        const match = inRows.find(inn => inn.reference === out.reference && !usedInIds.has(inn.id));
        if (match) usedInIds.add(match.id);
        paired.push({
          id: out.id,
          date: out.date,
          fromAccountId: out.accountId,
          toAccountId: match ? match.accountId : null,
          amount: Number(out.credit || out.debit || out.amount || 0),
          reference: out.reference,
          description: (out.description || '').replace(/^Transfer Out:\s*/i, ''),
          status: out.status,
        });
      });
      // Include any unmatched transfer_in rows
      inRows.filter(inn => !usedInIds.has(inn.id)).forEach(inn => {
        paired.push({
          id: inn.id,
          date: inn.date,
          fromAccountId: null,
          toAccountId: inn.accountId,
          amount: Number(inn.debit || inn.credit || inn.amount || 0),
          reference: inn.reference,
          description: (inn.description || '').replace(/^Transfer In:\s*/i, ''),
          status: inn.status,
        });
      });
      paired.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setTransferHistory(paired);
    } catch { setAccounts([]); setTransferHistory([]); }
  };

  const refreshBalance = async (accountId, setter) => {
    try {
      if (!accountId) { setter(0); return; }
      const trial = await window.electronAPI.getTrialBalance();
      const row = Array.isArray(trial) ? trial.find(r => Number(r.accountId) === Number(accountId)) : null;
      const bal = row ? Number(row.balance || 0) : 0;
      setter(bal);
    } catch (e) {
      setter(0);
    }
  };

  const onFinish = async (values) => {
    if (values.fromAccount === values.toAccount) {
      message.error('Source and destination accounts must be different');
      return;
    }
    try {
      setLoading(true);
      const payload = {
        fromAccount: Number(values.fromAccount),
        toAccount: Number(values.toAccount),
        date: values.date.format('YYYY-MM-DD'),
        amount: Number(values.amount),
        reference: values.reference || '',
        description: values.description || '',
      };
      const res = await window.electronAPI.createBankTransfer(payload);
      if (res && res.success) {
        message.success(`Transfer of ${cSym} ${fmt(values.amount)} completed successfully`);
        form.resetFields();
        form.setFieldsValue({ date: moment() });
        loadData();
        setFromBalance(0); setToBalance(0);
      } else {
        throw new Error(res?.error || 'Failed to complete transfer');
      }
    } catch (e) {
      message.error(e.message || 'Failed to complete transfer');
    } finally {
      setLoading(false);
    }
  };

  const getAccName = (id) => {
    if (!id) return '-';
    const acc = accounts.find(a => String(a.id) === String(id));
    return acc?.accountName || acc?.name || `#${id}`;
  };

  const exportCSV = () => {
    try {
      const headers = ['Date', 'From Account', 'To Account', 'Amount', 'Reference', 'Description'];
      const rows = transferHistory.map(d => [
        d.date || '', getAccName(d.fromAccountId), getAccName(d.toAccountId),
        Number(d.amount || 0).toFixed(2), d.reference || '',
        (d.description || '').replace(/"/g, '""')
      ].map(v => `"${v}"`).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `transfers_${moment().format('YYYY-MM-DD')}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      message.success('Exported CSV');
    } catch { message.error('Export failed'); }
  };

  const filteredHistory = useMemo(() => {
    if (!historySearch) return transferHistory;
    const s = historySearch.toLowerCase();
    return transferHistory.filter(d =>
      (d.reference || '').toLowerCase().includes(s) ||
      (d.description || '').toLowerCase().includes(s) ||
      (d.date || '').includes(s) ||
      getAccName(d.fromAccountId).toLowerCase().includes(s) ||
      getAccName(d.toAccountId).toLowerCase().includes(s)
    );
  }, [transferHistory, historySearch, accounts]);

  const totalTransfers = transferHistory.length;
  const totalAmount = transferHistory.reduce((s, d) => s + Number(d.amount || 0), 0);
  const thisMonthTransfers = transferHistory.filter(d => d.date && moment(d.date).isSame(moment(), 'month'));
  const thisMonthTotal = thisMonthTransfers.reduce((s, d) => s + Number(d.amount || 0), 0);

  const fromAccount = useMemo(() => {
    return accounts.find(a => String(a.id) === String(fromAccountId));
  }, [accounts, fromAccountId]);

  const toAccount = useMemo(() => {
    return accounts.find(a => String(a.id) === String(toAccountId));
  }, [accounts, toAccountId]);

  const historyColumns = [
    { title: 'Date', dataIndex: 'date', key: 'date', width: 100, render: v => v ? moment(v).format('DD MMM YY') : '-', sorter: (a, b) => new Date(a.date || 0) - new Date(b.date || 0) },
    { title: 'From Account', dataIndex: 'fromAccountId', key: 'fromAccountId', width: 140, render: v => getAccName(v) },
    { title: 'To Account', dataIndex: 'toAccountId', key: 'toAccountId', width: 140, render: v => getAccName(v) },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right', render: v => <Text strong style={{ color: '#1890ff' }}>{cSym} {fmt(v)}</Text> },
    { title: 'Reference', dataIndex: 'reference', key: 'reference', width: 100, ellipsis: true },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Status', key: 'status', width: 80, render: (_, r) => {
      const s = (r.status || 'active').toLowerCase();
      return s === 'voided' ? <Tag color="red">Void</Tag> : <Tag color="green">Active</Tag>;
    }},
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}><BankOutlined style={{ marginRight: 8 }} />Transfer Funds</Title>
          <Text type="secondary">Move funds between bank accounts &middot; {totalTransfers} transfers on file</Text>
        </div>
      </div>

      {/* Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #1890ff' }}>
            <Statistic title="Total Transfers" value={totalTransfers} valueStyle={{ fontSize: 18, color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #52c41a' }}>
            <Statistic title="Total Transferred" value={totalAmount} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #722ed1' }}>
            <Statistic title="This Month" value={thisMonthTransfers.length} valueStyle={{ fontSize: 18, color: '#722ed1' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #fa8c16' }}>
            <Statistic title="Month Total" value={thisMonthTotal} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: '#fa8c16' }} />
          </Card>
        </Col>
      </Row>

      {/* Transfer Form */}
      <Card title={<><SwapOutlined style={{ marginRight: 4 }} /> New Transfer</>} size="small" style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ date: moment() }}>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="fromAccount" label="From Account" rules={[{ required: true, message: 'Select source account' }]}>
                <Select showSearch optionFilterProp="children" placeholder="Select source account" onChange={(val) => { setFromAccountId(val); refreshBalance(val, setFromBalance); }}>
                  {bankAccounts.map(a => (
                    <Option key={a.id} value={a.id}>{a.accountName || a.name}{a.accountNumber ? ` (${a.accountNumber})` : ''}</Option>
                  ))}
                </Select>
              </Form.Item>
              {fromAccount && (
                <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f6ffed', borderRadius: 4 }}>
                  <Text type="secondary">Available Balance</Text><br />
                  <Text strong style={{ fontSize: 16, color: '#52c41a' }}>{cSym} {fmt(fromBalance)}</Text>
                </div>
              )}
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="toAccount" label="To Account" rules={[{ required: true, message: 'Select destination account' }]}>
                <Select showSearch optionFilterProp="children" placeholder="Select destination account" onChange={(val) => { setToAccountId(val); refreshBalance(val, setToBalance); }}>
                  {bankAccounts.map(a => (
                    <Option key={a.id} value={a.id}>{a.accountName || a.name}{a.accountNumber ? ` (${a.accountNumber})` : ''}</Option>
                  ))}
                </Select>
              </Form.Item>
              {toAccount && (
                <div style={{ marginBottom: 16, padding: '8px 12px', background: '#e6f7ff', borderRadius: 4 }}>
                  <Text type="secondary">Current Balance</Text><br />
                  <Text strong style={{ fontSize: 16, color: '#1890ff' }}>{cSym} {fmt(toBalance)}</Text>
                </div>
              )}
            </Col>
          </Row>

          <div style={{ textAlign: 'center', margin: '16px 0' }}>
            <ArrowRightOutlined style={{ fontSize: 24, color: '#1890ff' }} />
          </div>

          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item name="amount" label="Transfer Amount" rules={[{ required: true, message: 'Enter amount' }, { type: 'number', min: 0.01, message: 'Amount must be greater than 0' }]}>
                <InputNumber style={{ width: '100%' }} min={0} step={0.01} placeholder="0.00" formatter={v => `$ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={v => v.replace(/\$\s?|(,*)/g, '')} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="date" label="Transfer Date" rules={[{ required: true, message: 'Select date' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="reference" label="Reference">
                <Input placeholder="Optional reference" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="Description" rules={[{ required: true, message: 'Enter description' }]}>
            <Input.TextArea rows={2} placeholder="Transfer description" />
          </Form.Item>

          <Space>
            <Button onClick={() => { form.resetFields(); form.setFieldsValue({ date: moment() }); setFromBalance(0); setToBalance(0); }}>Reset</Button>
            <Button type="primary" htmlType="submit" icon={<SwapOutlined />} loading={loading} disabled={!fromAccountId || !toAccountId || fromAccountId === toAccountId}>Complete Transfer</Button>
          </Space>
        </Form>
      </Card>

      {/* Transfer History */}
      <Card title={<><HistoryOutlined style={{ marginRight: 4 }} /> Transfer History</>} size="small"
        extra={<Space>
          <Input placeholder="Search..." prefix={<SearchOutlined />} value={historySearch} onChange={e => setHistorySearch(e.target.value)} allowClear style={{ width: 180 }} />
          <Button icon={<DownloadOutlined />} onClick={exportCSV} size="small">CSV</Button>
        </Space>}
      >
        <Table
          columns={historyColumns}
          dataSource={filteredHistory}
          rowKey={(r, i) => r.id || i}
          size="small"
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: t => `${t} transfers` }}
          scroll={{ x: 700 }}
          locale={{ emptyText: 'No transfers recorded yet' }}
          summary={() => filteredHistory.length > 0 ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={3}><Text strong>Total</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right"><Text strong style={{ color: '#1890ff' }}>{cSym} {fmt(filteredHistory.reduce((s, d) => s + Number(d.amount || 0), 0))}</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={4} colSpan={3} />
            </Table.Summary.Row>
          ) : null}
        />
      </Card>
    </div>
  );
};

export default TransferFunds;