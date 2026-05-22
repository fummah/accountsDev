import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Select, Input, InputNumber, message, Tag, Space, Row, Col, Tabs, Statistic, Switch } from 'antd';
import { ThunderboltOutlined, PlusOutlined, SyncOutlined, DeleteOutlined } from '@ant-design/icons';

const { Option } = Select;
const { TabPane } = Tabs;

const BankRules = () => {
  const [rules, setRules] = useState([]);
  const [matchResults, setMatchResults] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [ruleVisible, setRuleVisible] = useState(false);
  const [matchLoading, setMatchLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [r, a] = await Promise.all([
        window.electronAPI.bankRulesList?.() || [],
        window.electronAPI.getChartOfAccounts?.() || [],
      ]);
      setRules(Array.isArray(r) ? r : []);
      setAccounts(Array.isArray(a) ? a : []);
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  const handleSave = async () => {
    try {
      const vals = await form.validateFields();
      const result = await window.electronAPI.bankRulesSave?.(vals);
      if (result?.error) { message.error(result.error); return; }
      message.success('Bank rule saved');
      setRuleVisible(false);
      form.resetFields();
      loadData();
    } catch {}
  };

  const handleDelete = async (id) => {
    await window.electronAPI.bankRulesDelete?.(id);
    message.success('Rule deleted');
    loadData();
  };

  const handleRunMatching = async () => {
    setMatchLoading(true);
    try {
      const result = await window.electronAPI.bankRulesApply?.() || {};
      if (result?.error) { message.error(result.error); }
      else {
        const matched = result?.matched || [];
        setMatchResults(matched);
        message.success(`Auto-matching complete. ${matched.length} transactions matched.`);
      }
    } catch (err) { message.error(err.message); }
    setMatchLoading(false);
  };

  const ruleColumns = [
    { title: 'Rule Name', dataIndex: 'name', key: 'name' },
    { title: 'Description Contains', dataIndex: 'description_contains', key: 'description_contains', render: v => v ? <Tag>{v}</Tag> : '—' },
    { title: 'Min Amount', dataIndex: 'min_amount', key: 'min_amount', render: v => v ? `$${v}` : '—' },
    { title: 'Max Amount', dataIndex: 'max_amount', key: 'max_amount', render: v => v ? `$${v}` : '—' },
    { title: 'Tx Type', dataIndex: 'transaction_type', key: 'transaction_type', render: v => v ? <Tag color="blue">{v}</Tag> : 'Any' },
    { title: 'Account', dataIndex: 'account_id', key: 'account_id', render: v => {
      const acct = accounts.find(a => a.id === v);
      return acct ? acct.name : v || '—';
    }},
    { title: 'Category', dataIndex: 'category', key: 'category' },
    {
      title: 'Actions', key: 'actions', width: 150, render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => { form.setFieldsValue(r); setRuleVisible(true); }}>Edit</Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)} />
        </Space>
      ),
    },
  ];

  const matchColumns = [
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: v => `$${Number(v || 0).toFixed(2)}` },
    { title: 'Matched Rule', dataIndex: 'ruleName', key: 'ruleName', render: v => <Tag color="green">{v}</Tag> },
    { title: 'Category', dataIndex: 'category', key: 'category' },
    { title: 'Account', dataIndex: 'accountName', key: 'accountName' },
  ];

  return (
    <Card title={<><ThunderboltOutlined /> Auto Bank Transaction Matching</>}
      extra={
        <Space>
          <Button type="primary" icon={<SyncOutlined />} loading={matchLoading} onClick={handleRunMatching}>Run Auto-Match</Button>
          <Button icon={<PlusOutlined />} onClick={() => { form.resetFields(); setRuleVisible(true); }}>Add Rule</Button>
        </Space>
      }>
      <Tabs defaultActiveKey="1">
        <TabPane tab={`Matching Rules (${rules.length})`} key="1">
          <Table columns={ruleColumns} dataSource={rules} rowKey="id" loading={loading} size="small" />
        </TabPane>
        <TabPane tab={`Match Results (${matchResults.length})`} key="2">
          {matchResults.length > 0 ? (
            <>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={8}><Statistic title="Matched" value={matchResults.length} valueStyle={{ color: '#3f8600' }} /></Col>
              </Row>
              <Table columns={matchColumns} dataSource={matchResults} rowKey={(r, i) => i} size="small" />
            </>
          ) : (
            <p style={{ color: '#999', textAlign: 'center', padding: 40 }}>Click "Run Auto-Match" to match bank transactions against your rules.</p>
          )}
        </TabPane>
      </Tabs>

      <Modal title="Bank Matching Rule" visible={ruleVisible} onOk={handleSave} onCancel={() => { setRuleVisible(false); form.resetFields(); }} width={600}>
        <Form form={form} layout="vertical">
          <Form.Item name="id" hidden><Input /></Form.Item>
          <Form.Item name="name" label="Rule Name" rules={[{ required: true }]}><Input placeholder="e.g. Netflix Subscription" /></Form.Item>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="description_contains" label="Description Contains"><Input placeholder="Text to match in transaction description" /></Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="min_amount" label="Min Amount"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="max_amount" label="Max Amount"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="transaction_type" label="Transaction Type">
              <Select allowClear placeholder="Any">
                <Option value="debit">Debit</Option>
                <Option value="credit">Credit</Option>
                <Option value="transfer">Transfer</Option>
              </Select>
            </Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="account_id" label="Map to Account">
                <Select allowClear showSearch placeholder="Select account"
                  filterOption={(input, opt) => (opt?.children || '').toString().toLowerCase().includes(input.toLowerCase())}>
                  {accounts.map(a => <Option key={a.id} value={a.id}>{a.name} ({a.type})</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="category" label="Category"><Input placeholder="e.g. Entertainment, Utilities" /></Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  );
};

export default BankRules;
