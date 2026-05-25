import React, { useEffect, useState, useMemo } from 'react';
import { Card, Table, Button, Modal, Form, DatePicker, Input, InputNumber, Select, Row, Col, Divider, Space, message, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined, CreditCardOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { Option } = Select;

const CreditCardCharges = () => {
  const { symbol: cSym } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form] = Form.useForm();
  const [accounts, setAccounts] = useState([]);
  const [creditCardAccounts, setCreditCardAccounts] = useState([]);
  const [splitLines, setSplitLines] = useState([{ key: 1, category: '', description: '', amount: 0 }]);

  const splitTotal = useMemo(() => splitLines.reduce((s, l) => s + (Number(l.amount) || 0), 0), [splitLines]);

  const addSplitLine = () => setSplitLines(prev => [...prev, { key: Date.now(), category: '', description: '', amount: 0 }]);
  const removeSplitLine = (key) => setSplitLines(prev => prev.length > 1 ? prev.filter(l => l.key !== key) : prev);
  const updateSplitLine = (key, field, value) => setSplitLines(prev => prev.map(l => l.key === key ? { ...l, [field]: value } : l));

  const columns = [
    { title: 'Date', dataIndex: 'date', key: 'date', width: 110, render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
    { title: 'Card Account', dataIndex: 'card', key: 'card' },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Categories', dataIndex: 'categories', key: 'categories', render: v => v ? v.split(',').map((c, i) => <Tag key={i}>{c.trim()}</Tag>) : '-' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right', render: a => `${cSym} ${Number(a||0).toFixed(2)}` },
  ];

  const loadData = async () => {
    setLoading(true);
    try {
      const [txs, accs] = await Promise.all([
        window.electronAPI.getTransactions(),
        window.electronAPI.getChartOfAccounts?.().catch(() => []),
      ]);
      const allAccs = Array.isArray(accs) ? accs : (accs?.data || []);
      setAccounts(allAccs);

      const ccAccounts = allAccs.filter(a => {
        const t = (a.accountType || a.type || '').toLowerCase();
        const n = (a.accountName || a.name || '').toLowerCase();
        return t.includes('credit card') || n.includes('credit card');
      });
      setCreditCardAccounts(ccAccounts.length > 0 ? ccAccounts : allAccs);

      const charges = Array.isArray(txs) ? txs.filter(t => (t.type || '').toLowerCase().includes('credit')) : [];
      setData(charges.map(t => ({
        key: t.id,
        date: t.date,
        card: t.reference || '',
        description: t.description,
        amount: t.amount || t.credit || 0,
        categories: t.categories || '',
      })));
    } catch (err) {
      console.error('Failed to load credit charges', err);
      message.error('Failed to load credit charges');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleAdd = () => {
    setSplitLines([{ key: 1, category: '', description: '', amount: 0 }]);
    setShowModal(true);
  };

  const handleCreate = async (values) => {
    try {
      setLoading(true);
      const date = values.date ? values.date.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD');
      const totalAmount = splitLines.length > 1 ? splitTotal : Number(values.amount) || 0;
      const categories = splitLines.filter(l => l.category).map(l => l.category).join(', ');
      const descriptions = splitLines.filter(l => l.description).map(l => l.description).join('; ');

      const tx = {
        date,
        type: 'Credit Card',
        amount: totalAmount,
        description: descriptions || values.description || '',
        reference: values.creditCardAccount || values.card || '',
        entered_by: 'system',
        categories,
        splitLines: splitLines.filter(l => Number(l.amount) > 0).map(l => ({ account: l.category, description: l.description, amount: Number(l.amount) })),
      };

      const res = await window.electronAPI.insertTransaction(tx);
      if (res && (res.changes > 0 || res.success || res.id)) {
        message.success('Credit card charge added');
        setShowModal(false);
        form.resetFields();
        setSplitLines([{ key: 1, category: '', description: '', amount: 0 }]);
        await loadData();
      } else {
        message.error('Failed to add credit charge');
      }
    } catch (err) {
      console.error('Error adding credit charge', err);
      message.error('Error adding credit charge');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Card title={<span style={{ fontSize: 18, fontWeight: 600 }}><CreditCardOutlined style={{ marginRight: 8 }} />Credit Card Charges</span>}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Add Charge</Button>}>
        <Table columns={columns} dataSource={data} loading={loading} rowKey="key"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} charges` }} size="middle" />
      </Card>

      <Modal
        title="Add Credit Card Charge"
        visible={showModal}
        onCancel={() => { setShowModal(false); form.resetFields(); setSplitLines([{ key: 1, category: '', description: '', amount: 0 }]); }}
        onOk={() => form.submit()}
        okText="Add Charge"
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} preserve={false}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="date" label="Date" initialValue={moment()}>
                <DatePicker style={{ width: '100%' }} format="MM/DD/YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="creditCardAccount" label="Credit Card Account" rules={[{ required: true, message: 'Select card account' }]}>
                <Select placeholder="Select credit card account" showSearch optionFilterProp="children">
                  {creditCardAccounts.map(a => (
                    <Option key={a.id} value={a.accountName || a.name}>{a.accountName || a.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" style={{ fontSize: 13, margin: '8px 0 12px' }}>Expense Categories (Split)</Divider>
          <div style={{ marginBottom: 12 }}>
            {splitLines.map((line) => (
              <Row gutter={8} key={line.key} style={{ marginBottom: 6 }}>
                <Col span={8}>
                  <Select size="small" placeholder="Category/Account" value={line.category || undefined} onChange={v => updateSplitLine(line.key, 'category', v)} style={{ width: '100%' }} showSearch optionFilterProp="children" allowClear>
                    {accounts.map(a => <Option key={a.id} value={a.accountName || a.name}>{a.accountName || a.name}</Option>)}
                  </Select>
                </Col>
                <Col span={9}>
                  <Input size="small" placeholder="Description" value={line.description} onChange={e => updateSplitLine(line.key, 'description', e.target.value)} />
                </Col>
                <Col span={5}>
                  <InputNumber size="small" min={0} step={0.01} placeholder="Amount" value={line.amount} onChange={v => updateSplitLine(line.key, 'amount', v || 0)} style={{ width: '100%' }} />
                </Col>
                <Col span={2}>
                  {splitLines.length > 1 && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeSplitLine(line.key)} />}
                </Col>
              </Row>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <Button size="small" type="dashed" onClick={addSplitLine} icon={<PlusOutlined />}>Add Line</Button>
              <span style={{ fontSize: 12, color: '#666' }}>Total: {cSym} {splitTotal.toFixed(2)}</span>
            </div>
          </div>

          {splitLines.length <= 1 && (
            <Form.Item name="amount" label="Amount" rules={[{ required: splitLines.length <= 1, message: 'Enter amount' }]}>
              <InputNumber style={{ width: '100%' }} min={0} step={0.01} prefix={cSym} />
            </Form.Item>
          )}

          <Form.Item name="description" label="Memo / Description">
            <Input placeholder="Optional overall memo" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CreditCardCharges;