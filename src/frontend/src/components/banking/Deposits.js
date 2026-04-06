import React, { useState, useEffect, useMemo } from 'react';
import { Form, Select, Input, InputNumber, DatePicker, Button, Card, Table, Tabs, message, Space, Modal, Tag, Typography } from 'antd';
import { PlusOutlined, SaveOutlined, DeleteOutlined, HistoryOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Option } = Select;
const { TabPane } = Tabs;
const { Text } = Typography;
const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const Deposits = () => {
  const [form] = Form.useForm();
  const [accounts, setAccounts] = useState([]);
  const [allAccounts, setAllAccounts] = useState([]);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [accountForm] = Form.useForm();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [depositHistory, setDepositHistory] = useState([]);
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
      let deps = [];
      // Try dedicated endpoint first, fall back to generic getTransactions
      if (window.electronAPI.getDeposits) {
        const res = await window.electronAPI.getDeposits();
        if (res && res.error) {
          console.error('getDeposits error:', res.error);
        } else {
          deps = Array.isArray(res) ? res : [];
        }
      }
      if (deps.length === 0 && window.electronAPI.getTransactions) {
        const txns = await window.electronAPI.getTransactions();
        const list = Array.isArray(txns) ? txns : [];
        deps = list.filter(t => (t.type || '').toLowerCase() === 'deposit');
      }
      deps.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setDepositHistory(deps);
    } catch (e) {
      console.error('Failed to load deposit history', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const getAccountName = (id) => {
    if (!id) return '-';
    const acc = allAccounts.find(a => String(a.id) === String(id));
    return acc?.accountName || acc?.name || `#${id}`;
  };

  const handleSubmit = async (values) => {
    if (items.length === 0) {
      message.error('Please add at least one item to deposit');
      return;
    }

    try {
      setLoading(true);
      const depositData = {
        accountId: values.accountId,
        date: values.date.format('YYYY-MM-DD'),
        items,
        total: items.reduce((sum, item) => sum + (item.amount || 0), 0),
      };

      const res = await window.electronAPI.createDeposit(depositData);
      if (res && res.error) {
        throw new Error(res.error);
      }
      message.success('Deposit recorded successfully');
      form.resetFields();
      form.setFieldsValue({ date: moment() });
      setItems([]);
      await loadHistory();
      setActiveTab('2');
    } catch (error) {
      message.error(error?.message || 'Failed to record deposit');
    } finally {
      setLoading(false);
    }
  };

  const addItem = () => {
    setItems([...items, { id: Date.now(), type: '', reference: '', description: '', amount: 0 }]);
  };

  const updateItem = (id, field, value) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const removeItem = (id) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const columns = [
    {
      title: 'Type', dataIndex: 'type', key: 'type',
      render: (_, record) => (
        <Select style={{ width: '100%' }} value={record.type} onChange={(v) => updateItem(record.id, 'type', v)} placeholder="Select type">
          <Option value="check">Check</Option>
          <Option value="cash">Cash</Option>
          <Option value="card">Card Payment</Option>
          <Option value="wire">Wire Transfer</Option>
          <Option value="eft">EFT</Option>
        </Select>
      ),
    },
    {
      title: 'Reference', dataIndex: 'reference', key: 'reference',
      render: (_, record) => (
        <Input value={record.reference} onChange={(e) => updateItem(record.id, 'reference', e.target.value)} placeholder="Check/Reference #" />
      ),
    },
    {
      title: 'Description', dataIndex: 'description', key: 'description',
      render: (_, record) => (
        <Input value={record.description} onChange={(e) => updateItem(record.id, 'description', e.target.value)} placeholder="Enter description" />
      ),
    },
    {
      title: 'Amount', dataIndex: 'amount', key: 'amount',
      render: (_, record) => (
        <InputNumber style={{ width: '100%' }} value={record.amount} onChange={(v) => updateItem(record.id, 'amount', v)}
          formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          parser={value => value.replace(/\$\s?|(,*)/g, '')} precision={2} />
      ),
    },
    {
      title: 'Action', key: 'action',
      render: (_, record) => <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeItem(record.id)} />,
    },
  ];

  const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);

  const filteredHistory = useMemo(() => {
    if (!historySearch) return depositHistory;
    const s = historySearch.toLowerCase();
    return depositHistory.filter(d =>
      (d.reference || '').toLowerCase().includes(s) ||
      (d.description || '').toLowerCase().includes(s) ||
      (d.date || '').includes(s) ||
      getAccountName(d.accountId).toLowerCase().includes(s)
    );
  }, [depositHistory, historySearch, allAccounts]);

  const historyColumns = [
    { title: 'Date', dataIndex: 'date', key: 'date', width: 120, sorter: (a, b) => (a.date || '').localeCompare(b.date || ''), render: v => v ? moment(v).format('DD MMM YYYY') : '-' },
    { title: 'Bank Account', dataIndex: 'accountId', key: 'accountId', width: 180, render: v => getAccountName(v) },
    { title: 'Reference', dataIndex: 'reference', key: 'reference', width: 140, ellipsis: true },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Amount', dataIndex: 'debit', key: 'debit', width: 130, align: 'right', sorter: (a, b) => Number(a.debit || 0) - Number(b.debit || 0), render: (v, r) => <Text strong style={{ color: '#52c41a' }}>$ {fmt(v || r.amount || 0)}</Text> },
    { title: 'Status', key: 'status', width: 80, render: (_, r) => (r.status || '').toLowerCase() === 'voided' ? <Tag color="red">Void</Tag> : <Tag color="green">Active</Tag> },
  ];

  const historyTotal = filteredHistory.reduce((s, d) => s + Number(d.debit || d.amount || 0), 0);

  return (
    <div style={{ padding: '24px' }}>
      <h2>Make Deposits</h2>

      <Card>
        <Tabs activeKey={activeTab} onTabClick={(key) => setActiveTab(key)}>
          <TabPane tab="New Deposit" key="1">
            <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ date: moment() }}>
              <div style={{ display: 'flex', gap: '16px' }}>
                <Form.Item name="accountId" label="Deposit To" rules={[{ required: true, message: 'Please select account' }]} style={{ flex: 1 }}>
                  <Select placeholder={accounts.length ? 'Select account' : 'No bank accounts'} showSearch optionFilterProp="children">
                    {accounts.map(account => (
                      <Option key={account.id} value={account.id}>{account.accountName || account.name}</Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item label=" " colon={false}>
                  <Button icon={<PlusOutlined />} onClick={() => setShowAddAccount(true)} />
                </Form.Item>
                <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Please select date' }]}>
                  <DatePicker />
                </Form.Item>
              </div>

              <Button type="dashed" onClick={addItem} style={{ width: '100%', marginBottom: '16px' }} icon={<PlusOutlined />}>
                Add Item
              </Button>

              <Table columns={columns} dataSource={items} rowKey="id" pagination={false}
                summary={() => (
                  <Table.Summary>
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={3}><strong>Total</strong></Table.Summary.Cell>
                      <Table.Summary.Cell index={3}><strong style={{ color: '#52c41a' }}>$ {fmt(total)}</strong></Table.Summary.Cell>
                      <Table.Summary.Cell index={4} />
                    </Table.Summary.Row>
                  </Table.Summary>
                )}
              />

              <div style={{ marginTop: '24px', textAlign: 'right' }}>
                <Space>
                  <Button onClick={() => { form.resetFields(); form.setFieldsValue({ date: moment() }); setItems([]); }}>Reset</Button>
                  <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={loading} disabled={items.length === 0}>
                    Save Deposit
                  </Button>
                </Space>
              </div>
            </Form>
          </TabPane>

          <TabPane tab={<span><HistoryOutlined /> Deposit History {depositHistory.length > 0 ? `(${depositHistory.length})` : ''}</span>} key="2">
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Input placeholder="Search deposits..." prefix={<SearchOutlined />} value={historySearch}
                onChange={e => setHistorySearch(e.target.value)} allowClear style={{ width: 250 }} />
              <Button icon={<ReloadOutlined />} onClick={loadHistory} loading={historyLoading}>Refresh</Button>
            </div>
            <Table columns={historyColumns} dataSource={filteredHistory} rowKey={(r, i) => r.id || i} size="small"
              loading={historyLoading} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: t => `${t} deposits` }}
              locale={{ emptyText: 'No deposits recorded yet' }}
              summary={() => filteredHistory.length > 0 ? (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4}><Text strong>Total</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right"><Text strong style={{ color: '#52c41a' }}>$ {fmt(historyTotal)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={5} />
                </Table.Summary.Row>
              ) : null}
            />
          </TabPane>
        </Tabs>
      </Card>

      {/* Add Account Modal */}
      <Modal title="Add Bank Account" visible={showAddAccount}
        onCancel={() => { setShowAddAccount(false); accountForm.resetFields(); }} okText="Create"
        onOk={async () => {
          try {
            const values = await accountForm.validateFields();
            const res = await window.electronAPI.insertChartAccount(values.name, values.type, values.number, 'current_user');
            if (res && res.success) {
              message.success('Account created');
              setShowAddAccount(false);
              accountForm.resetFields();
              await loadAccounts();
              if (res.id) form.setFieldsValue({ accountId: res.id });
            } else {
              message.error(res?.error || 'Failed to create account');
            }
          } catch (err) {
            if (err.errorFields) return;
            console.error('Add account error', err);
            message.error('Failed to create account');
          }
        }}
      >
        <Form form={accountForm} layout="vertical" initialValues={{ type: 'Bank' }}>
          <Form.Item name="name" label="Account Name" rules={[{ required: true }]}><Input autoFocus /></Form.Item>
          <Form.Item name="type" label="Account Type" rules={[{ required: true }]}>
            <Select>
              <Option value="Bank">Bank</Option>
              <Option value="Cash">Cash</Option>
              <Option value="Other">Other</Option>
            </Select>
          </Form.Item>
          <Form.Item name="number" label="Account Number"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Deposits;