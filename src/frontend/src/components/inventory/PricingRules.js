import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Select, Input, InputNumber, message, Tag, Space, Row, Col, Tabs, DatePicker, Switch } from 'antd';
import { DollarOutlined, PlusOutlined, TagsOutlined } from '@ant-design/icons';

const { Option } = Select;
const { TabPane } = Tabs;

const PricingRulesPage = () => {
  const [rules, setRules] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [ruleVisible, setRuleVisible] = useState(false);
  const [tierVisible, setTierVisible] = useState(false);
  const [ruleForm] = Form.useForm();
  const [tierForm] = Form.useForm();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [r, t, p, c] = await Promise.all([
        window.electronAPI.pricingRulesList?.() || [],
        window.electronAPI.pricingTiersList?.() || [],
        window.electronAPI.getAllProducts?.() || [],
        window.electronAPI.getAllCustomers?.() || [],
      ]);
      setRules(Array.isArray(r) ? r : []);
      setTiers(Array.isArray(t) ? t : []);
      setProducts(Array.isArray(p) ? p : (p?.all || []));
      setCustomers(Array.isArray(c) ? c : (c?.all || []));
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  const handleSaveRule = async () => {
    try {
      const vals = await ruleForm.validateFields();
      if (vals.start_date) vals.start_date = vals.start_date.format('YYYY-MM-DD');
      if (vals.end_date) vals.end_date = vals.end_date.format('YYYY-MM-DD');
      const result = await window.electronAPI.pricingRuleSave?.(vals);
      if (result?.error) { message.error(result.error); return; }
      message.success('Pricing rule saved');
      setRuleVisible(false);
      ruleForm.resetFields();
      loadData();
    } catch {}
  };

  const handleSaveTier = async () => {
    try {
      const vals = await tierForm.validateFields();
      const result = await window.electronAPI.pricingTierSave?.(vals);
      if (result?.error) { message.error(result.error); return; }
      message.success('Price tier saved');
      setTierVisible(false);
      tierForm.resetFields();
      loadData();
    } catch {}
  };

  const ruleColumns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Type', dataIndex: 'rule_type', key: 'rule_type', render: v => <Tag color="blue">{v}</Tag> },
    { title: 'Discount %', dataIndex: 'discount_percent', key: 'discount_percent', render: v => v ? `${v}%` : '—' },
    { title: 'Fixed Price', dataIndex: 'fixed_price', key: 'fixed_price', render: v => v ? `$${v}` : '—' },
    { title: 'Min Qty', dataIndex: 'min_quantity', key: 'min_quantity', render: v => v || '—' },
    { title: 'Max Qty', dataIndex: 'max_quantity', key: 'max_quantity', render: v => v || '—' },
    { title: 'Priority', dataIndex: 'priority', key: 'priority' },
    { title: 'Active', dataIndex: 'active', key: 'active', render: v => v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag> },
    {
      title: 'Actions', key: 'actions', width: 150, render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => { ruleForm.setFieldsValue(r); setRuleVisible(true); }}>Edit</Button>
          <Button size="small" danger onClick={async () => { await window.electronAPI.pricingRuleDelete?.(r.id); loadData(); }}>Delete</Button>
        </Space>
      ),
    },
  ];

  const tierColumns = [
    { title: 'Tier Name', dataIndex: 'name', key: 'name' },
    { title: 'Discount %', dataIndex: 'discount_percent', key: 'discount_percent', render: v => `${v}%` },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    { title: 'Active', dataIndex: 'active', key: 'active', render: v => v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag> },
    {
      title: 'Actions', key: 'actions', width: 150, render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => { tierForm.setFieldsValue(r); setTierVisible(true); }}>Edit</Button>
          <Button size="small" danger onClick={async () => { await window.electronAPI.pricingTierDelete?.(r.id); loadData(); }}>Delete</Button>
        </Space>
      ),
    },
  ];

  return (
    <Card title={<><DollarOutlined /> Pricing Rules Engine</>}>
      <Tabs defaultActiveKey="1">
        <TabPane tab="Pricing Rules" key="1">
          <div style={{ marginBottom: 16 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { ruleForm.resetFields(); setRuleVisible(true); }}>Add Rule</Button>
          </div>
          <Table columns={ruleColumns} dataSource={rules} rowKey="id" loading={loading} size="small" />
        </TabPane>
        <TabPane tab="Customer Tiers" key="2">
          <div style={{ marginBottom: 16 }}>
            <Button type="primary" icon={<TagsOutlined />} onClick={() => { tierForm.resetFields(); setTierVisible(true); }}>Add Tier</Button>
          </div>
          <Table columns={tierColumns} dataSource={tiers} rowKey="id" size="small" />
        </TabPane>
      </Tabs>

      <Modal title="Pricing Rule" visible={ruleVisible} onOk={handleSaveRule} onCancel={() => setRuleVisible(false)} width={600}>
        <Form form={ruleForm} layout="vertical">
          <Form.Item name="id" hidden><Input /></Form.Item>
          <Form.Item name="name" label="Rule Name" rules={[{ required: true }]}><Input placeholder="e.g. Bulk Discount 10+" /></Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="rule_type" label="Rule Type" rules={[{ required: true }]}>
                <Select>
                  <Option value="discount">Percentage Discount</Option>
                  <Option value="fixed_price">Fixed Price</Option>
                  <Option value="cost_plus">Cost Plus %</Option>
                  <Option value="quantity_break">Quantity Break</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="priority" label="Priority (higher = first)" initialValue={0}><InputNumber min={0} max={100} style={{ width: '100%' }} /></Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="discount_percent" label="Discount %"><InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="fixed_price" label="Fixed Price"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="cost_plus_percent" label="Cost Plus %"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="min_quantity" label="Min Quantity"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="max_quantity" label="Max Quantity"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="item_id" label="Product (optional)"><Select allowClear showSearch placeholder="All products" filterOption={(i, o) => (o?.children || '').toString().toLowerCase().includes(i.toLowerCase())}>{products.map(p => <Option key={p.id} value={p.id}>{p.name}</Option>)}</Select></Form.Item></Col>
            <Col span={12}><Form.Item name="customer_id" label="Customer (optional)"><Select allowClear showSearch placeholder="All customers" filterOption={(i, o) => (o?.children || '').toString().toLowerCase().includes(i.toLowerCase())}>{customers.map(c => <Option key={c.id} value={c.id}>{c.display_name || c.name || `${c.first_name || ''} ${c.last_name || ''}`}</Option>)}</Select></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="start_date" label="Start Date"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="end_date" label="End Date"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>

      <Modal title="Customer Price Tier" visible={tierVisible} onOk={handleSaveTier} onCancel={() => setTierVisible(false)}>
        <Form form={tierForm} layout="vertical">
          <Form.Item name="id" hidden><Input /></Form.Item>
          <Form.Item name="name" label="Tier Name" rules={[{ required: true }]}><Input placeholder="e.g. Gold, Silver, Wholesale" /></Form.Item>
          <Form.Item name="discount_percent" label="Default Discount %" initialValue={0}><InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default PricingRulesPage;
