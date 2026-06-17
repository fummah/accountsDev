import React, { useEffect, useState, useMemo } from 'react';
import { Card, Table, Button, Modal, Form, DatePicker, Input, InputNumber, Select, Row, Col, Divider, Space, message, Tag, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined, CreditCardOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';
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
  const [addCardModal, setAddCardModal] = useState(false);
  const [newCardName, setNewCardName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [viewItem, setViewItem] = useState(null);
  const [viewModal, setViewModal] = useState(false);

  const splitTotal = useMemo(() => splitLines.reduce((s, l) => s + (Number(l.amount) || 0), 0), [splitLines]);

  const addSplitLine = () => setSplitLines(prev => [...prev, { key: Date.now(), category: '', description: '', amount: 0 }]);
  const removeSplitLine = (key) => setSplitLines(prev => prev.length > 1 ? prev.filter(l => l.key !== key) : prev);
  const updateSplitLine = (key, field, value) => setSplitLines(prev => prev.map(l => l.key === key ? { ...l, [field]: value } : l));

  const handleAddCardAccount = async () => {
    if (!newCardName.trim()) return message.warning('Account name required');
    try {
      await window.electronAPI.insertChartAccount({ name: newCardName.trim(), type: 'Credit Card', status: 'Active', normalBalance: 'Credit', openingBalance: 0 });
      setNewCardName(''); setAddCardModal(false);
      message.success('Credit card account added');
      await loadData();
    } catch { message.error('Failed to add account'); }
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: 'Delete this charge?',
      content: `Are you sure you want to delete the ${cSym}${Number(record.amount||0).toFixed(2)} charge on ${record.card}?`,
      okText: 'Delete', okType: 'danger', cancelText: 'Cancel',
      onOk: async () => {
        try {
          const res = await window.electronAPI.deleteTransaction(record.key);
          if (res?.success || res?.changes > 0) {
            message.success('Charge deleted');
            loadData();
          } else { message.error(res?.error || 'Failed to delete'); }
        } catch (e) { message.error('Failed to delete charge'); }
      },
    });
  };

  const openEdit = async (record) => {
    try {
      const full = await window.electronAPI.getTransaction(record.key);
      if (full) {
        setEditingId(record.key);
        form.setFieldsValue({
          date: full.date ? moment(full.date) : moment(),
          creditCardAccount: full.reference || record.card,
          description: full.description || '',
          amount: Number(full.amount || record.amount || 0),
        });
        if (full.splitLines && full.splitLines.length > 0) {
          setSplitLines(full.splitLines.map((l, i) => ({ key: i, category: l.account || l.category || '', description: l.description || '', amount: Number(l.amount) || 0 })));
        } else {
          setSplitLines([{ key: 1, category: record.categories || '', description: full.description || record.description || '', amount: Number(full.amount || record.amount || 0) }]);
        }
        setShowModal(true);
      }
    } catch { message.error('Failed to load charge details'); }
  };

  const openView = (record) => {
    setViewItem(record);
    setViewModal(true);
  };

  const columns = [
    { title: 'Date', dataIndex: 'date', key: 'date', width: 110, render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
    { title: 'Card Account', dataIndex: 'card', key: 'card' },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Categories', dataIndex: 'categories', key: 'categories', render: v => v ? v.split(',').map((c, i) => <Tag key={i}>{c.trim()}</Tag>) : '-' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right', render: a => `${cSym} ${Number(a||0).toFixed(2)}` },
    { title: 'Actions', key: 'actions', width: 160,
      render: (_, r) => (
        <Space size="small">
          <Button size="small" icon={<EyeOutlined />} onClick={() => openView(r)} />
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r)} />
        </Space>
      ),
    },
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
    setEditingId(null);
    form.resetFields();
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

      let res;
      if (editingId) {
        res = await window.electronAPI.updateTransaction(editingId, tx);
        if (res?.success || res?.changes > 0) { message.success('Charge updated'); }
        else { throw new Error(res?.error || 'Failed to update'); }
      } else {
        res = await window.electronAPI.insertTransaction(tx);
        if (!res || (!res.changes && !res.success && !res.id)) { throw new Error('Failed to add charge'); }
        message.success('Credit card charge added');
      }
      setShowModal(false);
      setEditingId(null);
      form.resetFields();
      setSplitLines([{ key: 1, category: '', description: '', amount: 0 }]);
      await loadData();
    } catch (err) {
      message.error(err.message || 'Error saving credit charge');
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
        title={editingId ? 'Edit Credit Card Charge' : 'Add Credit Card Charge'}
        visible={showModal}
        onCancel={() => { setShowModal(false); setEditingId(null); form.resetFields(); setSplitLines([{ key: 1, category: '', description: '', amount: 0 }]); }}
        onOk={() => form.submit()}
        okText={editingId ? 'Update Charge' : 'Add Charge'}
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
                <Select placeholder="Select credit card account" showSearch optionFilterProp="children"
                  dropdownRender={menu => (<>{menu}<Divider style={{margin:'4px 0'}}/><div style={{padding:'4px 8px'}}><Button type="link" size="small" icon={<PlusOutlined/>} onClick={()=>setAddCardModal(true)}>Add New</Button></div></>)}>
                  {creditCardAccounts.map(a => (
                    <Option key={a.id} value={a.accountName || a.name}>{a.accountName || a.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" style={{ fontSize: 13, margin: '8px 0 12px' }}>Expense Categories (Split)</Divider>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6, padding: '0 4px' }}>
              <span style={{ flex: 2, fontSize: 11, fontWeight: 600 }}>Category</span>
              <span style={{ flex: 2, fontSize: 11, fontWeight: 600 }}>Description</span>
              <span style={{ flex: 1, fontSize: 11, fontWeight: 600 }}>Amount ({cSym})</span>
              <div style={{ width: 32 }} />
            </div>
            {splitLines.map((line) => (
              <div key={line.key} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                <Select size="small" placeholder="Category/Account" value={line.category || undefined} onChange={v => updateSplitLine(line.key, 'category', v)} style={{ flex: 2 }} showSearch optionFilterProp="children" allowClear>
                  {accounts.map(a => <Option key={a.id} value={a.accountName || a.name}>{a.accountName || a.name}</Option>)}
                </Select>
                <Input size="small" placeholder="Description" value={line.description} onChange={e => updateSplitLine(line.key, 'description', e.target.value)} style={{ flex: 2 }} />
                <InputNumber size="small" min={0} step={0.01} placeholder="Amount" value={line.amount} onChange={v => updateSplitLine(line.key, 'amount', v || 0)} style={{ flex: 1 }} />
                {splitLines.length > 1 && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeSplitLine(line.key)} />}
              </div>
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

      {/* Add New Credit Card Account Modal */}
      <Modal title="Add Credit Card Account" visible={addCardModal} onOk={handleAddCardAccount}
        onCancel={() => { setAddCardModal(false); setNewCardName(''); }} okText="Add" destroyOnClose>
        <Input placeholder="Credit card account name (e.g. Chase Visa)" value={newCardName} onChange={e => setNewCardName(e.target.value)} onPressEnter={handleAddCardAccount} />
      </Modal>

      {/* View Charge Modal */}
      <Modal title="Credit Card Charge Details" visible={viewModal} onCancel={() => setViewModal(false)} footer={<Button onClick={() => setViewModal(false)}>Close</Button>} width={500} destroyOnClose>
        {viewItem && (
          <Row gutter={[12, 12]}>
            <Col span={12}><strong>Date:</strong><br />{viewItem.date ? moment(viewItem.date).format('MM/DD/YYYY') : '-'}</Col>
            <Col span={12}><strong>Card Account:</strong><br />{viewItem.card || '-'}</Col>
            <Col span={24}><strong>Description:</strong><br />{viewItem.description || '-'}</Col>
            <Col span={12}><strong>Categories:</strong><br />{viewItem.categories ? viewItem.categories.split(',').map((c, i) => <Tag key={i}>{c.trim()}</Tag>) : '-'}</Col>
            <Col span={12}><strong>Amount:</strong><br /><span style={{ fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{cSym} {Number(viewItem.amount || 0).toFixed(2)}</span></Col>
          </Row>
        )}
      </Modal>
    </div>
  );
};

export default CreditCardCharges;