import React, { useEffect, useState, useMemo } from 'react';
import { Card, Select, Button, Space, Typography, DatePicker, Table, Tag, Divider, Form, Input, InputNumber, message, Row, Col, Statistic, Tabs, Alert } from 'antd';
import { BankOutlined, SyncOutlined, LinkOutlined, DisconnectOutlined, ReloadOutlined, SearchOutlined, PlusOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useCurrency } from '../../utils/currency';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { TabPane } = Tabs;
const { Option } = Select;

const BankFeeds = () => {
  const { symbol: cSym } = useCurrency();
  const fmtR = v => `${cSym} ${Number(v || 0).toFixed(2)}`;
  const [providers, setProviders] = useState([]);
  const [providerId, setProviderId] = useState();
  const [accounts, setAccounts] = useState([]);
  const [txs, setTxs] = useState([]);
  const [range, setRange] = useState([]);
  const [rules, setRules] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [activeTab, setActiveTab] = useState('1');
  const [form] = Form.useForm();
  const [connForm] = Form.useForm();

  const loadProviders = async () => {
    try {
      const list = await window.electronAPI.bankProviders();
      setProviders(list || []);
      const active = (list || []).find(p => p.active);
      if (active) {
        setProviderId(active.id);
        loadAccounts();
        loadRules();
      }
    } catch (_) {}
  };

  const loadAccounts = async () => {
    try { const res = await window.electronAPI.bankListAccounts(); setAccounts(res || []); } catch (_) { setAccounts([]); }
  };

  const loadRules = async () => {
    try { const res = await window.electronAPI.bankRulesList(); setRules(res || []); } catch (_) { setRules([]); }
  };

  useEffect(() => { loadProviders(); }, []);

  const connect = async () => {
    if (!providerId) return;
    let opts = {};
    try { opts = await connForm.validateFields(); } catch (_) {}
    await window.electronAPI.bankConnect(providerId, opts || {});
    message.success('Connected');
    loadProviders();
    loadAccounts();
  };

  const disconnect = async () => {
    await window.electronAPI.bankDisconnect();
    message.success('Disconnected');
    loadProviders();
    setAccounts([]);
    setTxs([]);
  };

  const fetchTxs = async () => {
    if (!providerId) { message.warning('Please select and connect a provider first.'); return; }
    setFetching(true);
    try {
      const [start, end] = range || [];
      const res = await window.electronAPI.bankFetchTransactions({
        startDate: start ? start.format('YYYY-MM-DD') : undefined,
        endDate: end ? end.format('YYYY-MM-DD') : undefined,
      });
      if (res && res.error) { message.error(res.error); setTxs([]); return; }
      setTxs(res || []);
      if ((res || []).length > 0) message.success(`Fetched ${res.length} transactions`);
    } catch (_) { message.error('Failed to fetch transactions'); }
    finally { setFetching(false); }
  };

  const suggestMatches = async () => {
    try {
      const suggestions = await window.electronAPI.bankReconcileSuggest?.({ txs, windowDays: 3, amountTolerance: 0.01 });
      if (Array.isArray(suggestions)) {
        const map = new Map();
        suggestions.forEach(s => { map.set(`${s.feed.date}|${s.feed.description}|${s.feed.amount}`, s); });
        setTxs(prev => prev.map(t => {
          const key = `${t.date}|${t.description}|${t.amount}`;
          const s = map.get(key);
          return s ? { ...t, suggest: { best: (s.matches && s.matches[0]) || null } } : t;
        }));
        message.success('Suggestions updated');
      } else { message.info('No suggestions available'); }
    } catch (_) { message.info('Reconciliation not available'); }
  };

  const saveRule = async () => {
    try {
      const values = await form.validateFields();
      await window.electronAPI.bankRulesSave(values);
      form.resetFields();
      loadRules();
      const applied = await window.electronAPI.bankRulesApply(txs);
      setTxs(applied || txs);
      message.success('Rule added');
    } catch (_) {}
  };

  const txStats = useMemo(() => {
    let credits = 0, debits = 0, matched = 0;
    txs.forEach(t => {
      const amt = Number(t.amount || 0);
      if (t.type === 'credit') credits += amt; else debits += Math.abs(amt);
      if (t.matchedCategory || t.suggest?.best) matched++;
    });
    return { credits, debits, total: txs.length, matched };
  }, [txs]);

  const totalBalance = useMemo(() => (accounts || []).reduce((s, a) => s + Number(a.balance || 0), 0), [accounts]);

  const txCols = [
    { title: 'Date', dataIndex: 'date', key: 'date', sorter: (a, b) => (a.date || '').localeCompare(b.date || ''), width: 110 },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right', width: 120,
      sorter: (a, b) => Number(a.amount || 0) - Number(b.amount || 0),
      render: (v, r) => <span style={{ color: r.type === 'credit' ? '#3f8600' : '#cf1322', fontWeight: 600 }}>{fmtR(v)}</span> },
    { title: 'Type', dataIndex: 'type', key: 'type', width: 80, render: v => <Tag color={v === 'credit' ? 'green' : 'red'}>{v}</Tag> },
    { title: 'Category', key: 'matched', width: 120, render: (_, r) => r.matchedCategory ? <Tag color="blue">{r.matchedCategory}</Tag> : <Text type="secondary">-</Text> },
    { title: 'Match', key: 'match', width: 150, render: (_, r) => r?.suggest?.best ? <Tag icon={<CheckCircleOutlined />} color="geekblue">Tx #{r.suggest.best.txId} ({Math.round(r.suggest.best.score * 100)}%)</Tag> : <Text type="secondary">-</Text> },
  ];

  const ruleCols = [
    { title: 'Name', dataIndex: 'name', key: 'name', render: v => <strong>{v}</strong> },
    { title: 'Contains', dataIndex: 'description_contains', key: 'dc' },
    { title: 'Type', dataIndex: 'type', key: 'type', width: 80, render: v => v ? <Tag>{v}</Tag> : '-' },
    { title: 'Min', dataIndex: 'min_amount', key: 'min', width: 80, render: v => v != null ? fmtR(v) : '-' },
    { title: 'Max', dataIndex: 'max_amount', key: 'max', width: 80, render: v => v != null ? fmtR(v) : '-' },
    { title: 'Category', dataIndex: 'category', key: 'cat', render: v => v ? <Tag color="blue">{v}</Tag> : '-' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card title={<span style={{ fontSize: 18, fontWeight: 600 }}><BankOutlined style={{ marginRight: 8 }} />Bank Feeds</span>}
        extra={<Space><Button icon={<ReloadOutlined />} onClick={() => { loadProviders(); loadAccounts(); }}>Refresh</Button></Space>}>

        <Row gutter={16} style={{ marginBottom: 20, flexDirection: 'row', flexWrap: 'wrap' }}>
          <Col span={6}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Accounts" value={accounts.length} prefix={<BankOutlined />} /></Card></Col>
          <Col span={6}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Total Balance" value={totalBalance} prefix={cSym} precision={2} valueStyle={{ color: totalBalance >= 0 ? '#3f8600' : '#cf1322' }} /></Card></Col>
          <Col span={6}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Transactions" value={txStats.total} /></Card></Col>
          <Col span={6}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Auto-Match Rules" value={rules.length} /></Card></Col>
        </Row>

        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane tab="Connection" key="1">
            <Row gutter={16} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Col span={16}>
                <Card size="small" title="Provider">
                  <Space wrap style={{ marginBottom: 12 }}>
                    <Select placeholder="Select provider" style={{ width: 260 }} value={providerId} onChange={setProviderId}>
                      {(providers || []).map(p => <Option key={p.id} value={p.id}>{p.name}{p.active ? ' (active)' : ''}</Option>)}
                    </Select>
                    <Button type="primary" icon={<LinkOutlined />} onClick={connect} disabled={!providerId}>Connect</Button>
                    <Button icon={<DisconnectOutlined />} onClick={disconnect} danger>Disconnect</Button>
                  </Space>
                  {providerId && providerId !== 'demo' && (
                    <Form layout="vertical" form={connForm} style={{ maxWidth: 600 }}>
                      <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                        <Col span={8}><Form.Item name="env" label="Environment" initialValue="sandbox"><Select><Option value="sandbox">Sandbox</Option><Option value="development">Development</Option><Option value="production">Production</Option></Select></Form.Item></Col>
                        <Col span={8}><Form.Item name="clientId" label="Client ID"><Input /></Form.Item></Col>
                        <Col span={8}><Form.Item name="secret" label="Secret"><Input.Password /></Form.Item></Col>
                        <Col span={12}><Form.Item name="accessToken" label="Access Token"><Input.Password /></Form.Item></Col>
                        <Col span={12}><Form.Item name="publicToken" label="Public Token"><Input /></Form.Item></Col>
                      </Row>
                    </Form>
                  )}
                  <Alert message="Use Demo provider for offline feeds, or configure Plaid credentials for live banking data." type="info" showIcon />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" title="Linked Accounts">
                  {(accounts || []).length === 0 ? <Text type="secondary">No accounts linked. Connect a provider first.</Text> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {accounts.map(a => (
                        <Card size="small" key={a.accountId} style={{ background: '#fafafa' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div><strong>{a.name}</strong><br /><Text type="secondary" style={{ fontSize: 11 }}>{a.accountId}</Text></div>
                            <div style={{ textAlign: 'right' }}>
                              {a.balance != null && <div style={{ fontSize: 16, fontWeight: 700, color: Number(a.balance) >= 0 ? '#3f8600' : '#cf1322' }}>{cSym} {Number(a.balance).toFixed(2)}</div>}
                              {a.currency && <Text type="secondary" style={{ fontSize: 11 }}>{a.currency}</Text>}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </Card>
              </Col>
            </Row>
          </TabPane>

          <TabPane tab="Transactions" key="2">
            <Space style={{ marginBottom: 12 }} wrap>
              <RangePicker value={range} onChange={setRange} format="DD/MM/YYYY" />
              <Button type="primary" icon={<SyncOutlined />} onClick={fetchTxs} loading={fetching}>Fetch Transactions</Button>
              <Button icon={<SearchOutlined />} onClick={suggestMatches} disabled={txs.length === 0}>Suggest Matches</Button>
            </Space>

            {txs.length > 0 && (
              <Row gutter={12} style={{ marginBottom: 12, flexDirection: 'row', flexWrap: 'wrap' }}>
                <Col span={6}><Statistic title="Credits" value={txStats.credits} prefix={cSym} precision={2} valueStyle={{ color: '#3f8600', fontSize: 16 }} /></Col>
                <Col span={6}><Statistic title="Debits" value={txStats.debits} prefix={cSym} precision={2} valueStyle={{ color: '#cf1322', fontSize: 16 }} /></Col>
                <Col span={6}><Statistic title="Net" value={txStats.credits - txStats.debits} prefix={cSym} precision={2} valueStyle={{ fontSize: 16 }} /></Col>
                <Col span={6}><Statistic title="Matched" value={txStats.matched} suffix={`/ ${txStats.total}`} valueStyle={{ fontSize: 16 }} /></Col>
              </Row>
            )}

            <Table rowKey={(r, i) => `${r.date}-${i}`} columns={txCols} dataSource={txs} size="small"
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} transactions` }} />
          </TabPane>

          <TabPane tab="Rules" key="3">
            <Table rowKey="id" columns={ruleCols} dataSource={rules} size="small" pagination={{ pageSize: 10 }} style={{ marginBottom: 16 }} />
            <Card size="small" title="Add Auto-Match Rule">
              <Form form={form} layout="vertical">
                <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  <Col span={6}><Form.Item name="name" label="Rule Name" rules={[{ required: true }]}><Input placeholder="Rule name" /></Form.Item></Col>
                  <Col span={6}><Form.Item name="description_contains" label="Description Contains"><Input placeholder="Substring" /></Form.Item></Col>
                  <Col span={4}><Form.Item name="type" label="Type"><Select allowClear placeholder="Any"><Option value="debit">Debit</Option><Option value="credit">Credit</Option></Select></Form.Item></Col>
                  <Col span={3}><Form.Item name="min_amount" label="Min Amount"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
                  <Col span={3}><Form.Item name="max_amount" label="Max Amount"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
                  <Col span={4}><Form.Item name="category" label="Category"><Input placeholder="e.g. Utilities" /></Form.Item></Col>
                </Row>
                <Button type="primary" icon={<PlusOutlined />} onClick={saveRule}>Add Rule</Button>
              </Form>
            </Card>
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default BankFeeds;


