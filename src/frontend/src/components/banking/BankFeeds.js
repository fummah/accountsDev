import React, { useEffect, useState } from 'react';
import { Card, Select, Button, Space, Typography, DatePicker, Table, Tag, Divider, Form, Input, InputNumber, message } from 'antd';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const BankFeeds = () => {
  const [providers, setProviders] = useState([]);
  const [providerId, setProviderId] = useState();
  const [accounts, setAccounts] = useState([]);
  const [txs, setTxs] = useState([]);
  const [range, setRange] = useState([]);
  const [rules, setRules] = useState([]);
  const [form] = Form.useForm();
  const [connForm] = Form.useForm();

  const loadProviders = async () => {
    const list = await window.electronAPI.bankProviders();
    setProviders(list || []);
    const active = (list || []).find(p => p.active);
    if (active) {
      setProviderId(active.id);
      loadAccounts();
      loadRules();
    }
  };

  const loadAccounts = async () => {
    const res = await window.electronAPI.bankListAccounts();
    setAccounts(res || []);
  };

  const loadRules = async () => {
    const res = await window.electronAPI.bankRulesList();
    setRules(res || []);
  };

  useEffect(() => { loadProviders(); }, []);

  const connect = async () => {
    if (!providerId) return;
    let opts = {};
    try { opts = await connForm.validateFields(); } catch (e) { /* ignore */ }
    await window.electronAPI.bankConnect(providerId, opts || {});
    message.success('Connected');
    loadProviders();
  };
  const disconnect = async () => {
    await window.electronAPI.bankDisconnect();
    message.success('Disconnected');
    loadProviders();
    setAccounts([]);
    setTxs([]);
  };
  const fetchTxs = async () => {
    if (!providerId) {
      message.warning('Please select and connect a provider first.');
      return;
    }
    const [start, end] = range || [];
    const res = await window.electronAPI.bankFetchTransactions({
      startDate: start ? start.format('YYYY-MM-DD') : undefined,
      endDate: end ? end.format('YYYY-MM-DD') : undefined
    });
    if (res && res.error) {
      message.error(res.error);
      setTxs([]);
      return;
    }
    setTxs(res || []);
  };
  const saveRule = async () => {
    const values = await form.validateFields();
    await window.electronAPI.bankRulesSave(values);
    form.resetFields();
    loadRules();
    // re-apply to current transactions
    const applied = await window.electronAPI.bankRulesApply(txs);
    setTxs(applied || txs);
  };

  const txCols = [
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount' },
    { title: 'Type', dataIndex: 'type', key: 'type', render: v => <Tag color={v === 'credit' ? 'green' : 'red'}>{v}</Tag> },
    { title: 'Matched', key: 'matched', render: (_, r) => r.matchedCategory ? <Tag>{r.matchedCategory}</Tag> : <Text type="secondary">—</Text> }
  ];
  const ruleCols = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Contains', dataIndex: 'description_contains', key: 'description_contains' },
    { title: 'Type', dataIndex: 'type', key: 'type' },
    { title: 'Min', dataIndex: 'min_amount', key: 'min_amount' },
    { title: 'Max', dataIndex: 'max_amount', key: 'max_amount' },
    { title: 'Category', dataIndex: 'category', key: 'category' },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Card>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Title level={4}>Bank Feeds</Title>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space wrap>
              <Select
                placeholder="Select provider"
                style={{ width: 240 }}
                value={providerId}
                onChange={setProviderId}
                options={(providers||[]).map(p => ({ value: p.id, label: `${p.name}${p.active ? ' (active)' : ''}` }))}
              />
              <Button type="primary" onClick={connect} disabled={!providerId}>Connect</Button>
              <Button onClick={disconnect}>Disconnect</Button>
              <Button onClick={loadAccounts}>Refresh Accounts</Button>
            </Space>
            {providerId && providerId !== 'demo' && (
              <Form layout="inline" form={connForm}>
                <Form.Item name="env" label="Env" initialValue="sandbox">
                  <Select style={{ width: 140 }} options={[{value:'sandbox'},{value:'development'},{value:'production'}]} />
                </Form.Item>
                <Form.Item name="clientId" label="Client ID"><Input style={{ width: 220 }} /></Form.Item>
                <Form.Item name="secret" label="Secret"><Input.Password style={{ width: 220 }} /></Form.Item>
                <Form.Item name="accessToken" label="Access Token"><Input.Password style={{ width: 260 }} /></Form.Item>
                <Form.Item name="publicToken" label="Public Token"><Input style={{ width: 260 }} /></Form.Item>
              </Form>
            )}
            <Text type="secondary">Use Demo provider for offline feeds, or configure Plaid with Client ID/Secret and token (sandbox supported).</Text>
          </Space>
          <Divider />
          <Title level={5}>Accounts</Title>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {(accounts||[]).map(a => <li key={a.accountId}>{a.name} {a.balance != null ? `— ${a.balance} ${a.currency||''}` : ''}</li>)}
          </ul>
          <Space>
            <RangePicker value={range} onChange={setRange} />
            <Button type="primary" onClick={fetchTxs}>Fetch transactions</Button>
            <Button onClick={async ()=>{
              const suggestions = await window.electronAPI.bankReconcileSuggest?.({ txs, windowDays: 3, amountTolerance: 0.01 });
              if (Array.isArray(suggestions)) {
                const map = new Map();
                suggestions.forEach(s => {
                  map.set(`${s.feed.date}|${s.feed.description}|${s.feed.amount}`, s);
                });
                setTxs(prev => prev.map(t => {
                  const key = `${t.date}|${t.description}|${t.amount}`;
                  const s = map.get(key);
                  return s ? { ...t, suggest: { best: (s.matches && s.matches[0]) || null } } : t;
                }));
                message.success('Suggestions updated');
              } else {
                message.info('No suggestions available');
              }
            }}>Suggest matches</Button>
          </Space>
          <Table rowKey={(r, i) => `${r.date}-${i}`} columns={[
            ...txCols,
            { title: 'Match', key: 'match', render: (_, r) => r?.suggest?.best ? <Tag color="blue">Tx #{r.suggest.best.txId} • {Math.round(r.suggest.best.score*100)}%</Tag> : <Text type="secondary">—</Text> }
          ]} dataSource={txs} size="small" />
        </Space>
      </Card>

      <Card>
        <Title level={5}>Auto‑match rules</Title>
        <Table rowKey="id" columns={ruleCols} dataSource={rules} size="small" pagination={{ pageSize: 5 }} />
        <Divider />
        <Form layout="inline" form={form}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input placeholder="Rule name" /></Form.Item>
          <Form.Item name="description_contains" label="Contains"><Input placeholder="Description substring" /></Form.Item>
          <Form.Item name="type" label="Type"><Select style={{ width: 120 }} allowClear options={[{value:'debit',label:'debit'},{value:'credit',label:'credit'}]} /></Form.Item>
          <Form.Item name="min_amount" label="Min"><InputNumber style={{ width: 100 }} /></Form.Item>
          <Form.Item name="max_amount" label="Max"><InputNumber style={{ width: 100 }} /></Form.Item>
          <Form.Item name="category" label="Category"><Input placeholder="e.g. Utilities" /></Form.Item>
          <Form.Item><Button type="primary" onClick={saveRule}>Add Rule</Button></Form.Item>
        </Form>
      </Card>
    </Space>
  );
};

export default BankFeeds;


