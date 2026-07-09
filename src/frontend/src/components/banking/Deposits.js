import React, { useState, useEffect, useMemo } from 'react';
import { Form, Select, Input, InputNumber, DatePicker, Button, Card, Table, message, Space, Modal, Tag, Typography, Divider, Checkbox, Tooltip } from 'antd';
import { PlusOutlined, SaveOutlined, DeleteOutlined, HistoryOutlined, SearchOutlined, ReloadOutlined, MinusCircleOutlined, EyeOutlined, StopOutlined, SwapOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Option } = Select;
const { Text, Title } = Typography;
const { TextArea } = Input;
const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const Deposits = () => {
  const [form] = Form.useForm();
  const [bankAccounts, setBankAccounts] = useState([]);
  const [incomeAccounts, setIncomeAccounts] = useState([]);
  const [allAccounts, setAllAccounts] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [depositHistory, setDepositHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [activeTab, setActiveTab] = useState('1');
  const [viewDeposit, setViewDeposit] = useState(null);
  const [payors, setPayors] = useState([]);
  const [depositMode, setDepositMode] = useState('payments');
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountForm] = Form.useForm();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    await Promise.all([loadAccounts(), loadHistory(), loadPendingPayments(), loadPayors()]);
  };

  const loadPayors = async () => {
    try {
      const [custRes, vendRes] = await Promise.all([
        window.electronAPI.getAllCustomers().catch(() => ({ all: [] })),
        window.electronAPI.getAllSuppliers().catch(() => []),
      ]);
      const customers = Array.isArray(custRes?.all) ? custRes.all : (Array.isArray(custRes) ? custRes : []);
      const vendors = Array.isArray(vendRes) ? vendRes : (vendRes?.data || vendRes?.all || []);
      setPayors([
        ...customers.map(c => ({ id: `c-${c.id}`, name: c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(), type: 'Customer' })),
        ...vendors.map(v => ({ id: `v-${v.id}`, name: v.display_name || `${v.first_name || ''} ${v.last_name || ''}`.trim(), type: 'Vendor' })),
      ].filter(p => p.name));
    } catch {}
  };

  const loadAccounts = async () => {
    try {
      const data = await window.electronAPI.getChartOfAccounts();
      const list = Array.isArray(data) ? data : [];
      setAllAccounts(list);
      const banks = list.filter(a => {
        const t = (a.accountType || a.type || '').toLowerCase();
        const n = (a.accountName || a.name || '').toLowerCase();
        return (t.includes('bank') || t.includes('cash') || n.includes('bank') || n.includes('checking') || n.includes('savings')) && a.status === 'Active';
      });
      setBankAccounts(banks);
      const income = list.filter(a => {
        const t = (a.accountType || a.type || '').toLowerCase();
        return (t === 'income' || t === 'other income' || t === 'cost of goods sold') && a.status === 'Active';
      });
      setIncomeAccounts(income);
    } catch { message.error('Failed to load accounts'); }
  };

  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      let deps = [];
      if (window.electronAPI.getDeposits) {
        const res = await window.electronAPI.getDeposits();
        deps = Array.isArray(res) ? res : (res && !res.error ? [] : []);
      }
      if (deps.length === 0 && window.electronAPI.getTransactions) {
        const txns = await window.electronAPI.getTransactions();
        deps = (Array.isArray(txns) ? txns : []).filter(t => (t.type || '').toLowerCase() === 'deposit');
      }
      deps.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setDepositHistory(deps);
    } catch (e) { console.error('Failed to load deposit history', e); } finally { setHistoryLoading(false); }
  };

  const loadPendingPayments = async () => {
    try {
      if (window.electronAPI.getPendingPayments) {
        const res = await window.electronAPI.getPendingPayments();
        setPendingPayments(Array.isArray(res) ? res : []);
      }
    } catch { }
  };

  const handleAddAccount = async () => {
    try {
      const vals = await accountForm.validateFields();
      const payload = {
        name: vals.name,
        type: vals.type || 'Bank',
        number: vals.code || '',
        description: vals.description || '',
        status: 'Active',
        entered_by: 'system',
      };
      const res = await window.electronAPI.insertChartAccount(payload);
      if (res?.success) {
        message.success('Account created');
        setAccountModalOpen(false);
        accountForm.resetFields();
        loadAccounts();
      } else {
        message.error(res?.error || 'Failed to create account');
      }
    } catch (e) { if (!e?.errorFields) message.error('Failed to create account'); }
  };

  const getAccountName = (id) => {
    if (!id) return '-';
    const a = allAccounts.find(x => String(x.id) === String(id));
    return a?.accountName || a?.name || `#${id}`;
  };

  const selectedTotal = pendingPayments
    .filter(p => selectedPaymentIds.includes(p.id))
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  const allocationsTotal = allocations.reduce((s, a) => s + Number(a.amount || 0), 0);

  const togglePayment = (id) => {
    setSelectedPaymentIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const addAllocation = () => {
    setAllocations([...allocations, { id: Date.now(), accountId: null, amount: 0, description: '', receivedFrom: '' }]);
  };

  const updateAllocation = (id, field, value) => {
    setAllocations(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  const removeAllocation = (id) => {
    setAllocations(prev => prev.filter(a => a.id !== id));
  };

  const manualTotal = allocations.reduce((s, a) => s + Number(a.amount || 0), 0);

  const handleSubmit = async (values) => {
    if (depositMode === 'payments') {
      if (selectedPaymentIds.length === 0) {
        message.error('Please select at least one payment to deposit');
        return;
      }
    } else {
      // Manual deposit mode
      if (allocations.length === 0 || manualTotal <= 0) {
        message.error('Please add at least one allocation line with an amount');
        return;
      }
    }

    try {
      setLoading(true);
      const res = await window.electronAPI.createDeposit({
        bankAccountId: values.bankAccountId,
        date: values.date ? values.date.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD'),
        reference: values.reference || null,
        memo: values.memo || null,
        paymentIds: depositMode === 'payments' ? selectedPaymentIds : [],
        allocations: depositMode === 'payments' ? [] : allocations.map(a => ({
          accountId: a.accountId || null,
          amount: Number(a.amount || 0),
          description: [a.receivedFrom, a.description].filter(Boolean).join(' — ') || 'Manual deposit',
        })),
      });
      if (res && res.error) throw new Error(res.error);
      message.success('Deposit recorded successfully');
      form.resetFields();
      form.setFieldsValue({ date: moment() });
      setSelectedPaymentIds([]);
      setAllocations([]);
      await Promise.all([loadHistory(), loadPendingPayments()]);
      setActiveTab('2');
    } catch (error) {
      message.error(error?.message || 'Failed to record deposit');
    } finally { setLoading(false); }
  };

  const handleView = async (id) => {
    try {
      let dep = null;
      if (window.electronAPI.getDeposit) {
        dep = await window.electronAPI.getDeposit(id);
      }
      if (!dep || dep.error) {
        dep = depositHistory.find(d => String(d.id) === String(id)) || null;
      }
      setViewDeposit(dep);
    } catch { message.error('Failed to load deposit details'); }
  };

  const handleVoid = async (id) => {
    Modal.confirm({
      title: 'Void Deposit',
      content: 'This will reverse the deposit journal entry and return payments to Pending Deposit. Continue?',
      onOk: async () => {
        try {
          const res = await window.electronAPI.voidDeposit(id);
          if (res && res.error) throw new Error(res.error);
          message.success('Deposit voided');
          await loadHistory();
        } catch (e) { message.error(e.message || 'Failed to void deposit'); }
      },
    });
  };

  const pendingColumns = [
    {
      title: <Checkbox checked={pendingPayments.length > 0 && selectedPaymentIds.length === pendingPayments.length}
        onChange={(e) => { if (e.target.checked) setSelectedPaymentIds(pendingPayments.map(p => p.id)); else setSelectedPaymentIds([]); }} />,
      dataIndex: 'id', key: 'select', width: 40,
      render: (id) => <Checkbox checked={selectedPaymentIds.includes(id)} onChange={() => togglePayment(id)} />,
    },
    { title: 'Customer', dataIndex: 'customer_name', key: 'customer_name', ellipsis: true },
    { title: 'Invoice', dataIndex: 'invoice_number', key: 'invoice_number', width: 120 },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 130, align: 'right',
      render: v => <Text strong>$ {fmt(v)}</Text> },
    { title: 'Date', dataIndex: 'date', key: 'date', width: 120,
      render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
    { title: 'Method', dataIndex: 'paymentMethod', key: 'paymentMethod', width: 100 },
  ];

  const historyColumns = [
    { title: 'Date', dataIndex: 'date', key: 'date', width: 120, sorter: (a, b) => (a.date || '').localeCompare(b.date || ''), render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
    { title: 'Bank Account', dataIndex: 'bank_account_name', key: 'bank_account_name', width: 180, ellipsis: true },
    { title: 'Reference', dataIndex: 'reference', key: 'reference', width: 140, ellipsis: true },
    { title: 'Memo', dataIndex: 'memo', key: 'memo', ellipsis: true },
    { title: 'Amount', dataIndex: 'total_amount', key: 'total_amount', width: 130, align: 'right',
      sorter: (a, b) => Number(a.total_amount || 0) - Number(b.total_amount || 0),
      render: v => <Text strong style={{ color: '#52c41a' }}>$ {fmt(v || 0)}</Text> },
    { title: 'Status', key: 'status', width: 100,
      render: (_, r) => {
        const s = (r.status || '').toLowerCase();
        if (s === 'void') return <Tag color="red">Void</Tag>;
        if (s === 'reconciled') return <Tag color="blue">Reconciled</Tag>;
        return <Tag color="green">Active</Tag>;
      }
    },
    {
      title: 'Action', key: 'action', width: 120,
      render: (_, r) => (
        <Space>
          <Tooltip title="View"><Button size="small" icon={<EyeOutlined />} onClick={() => handleView(r.id)} /></Tooltip>
          {(r.status || '').toLowerCase() !== 'void' && (r.status || '').toLowerCase() !== 'reconciled' && (
            <Tooltip title="Void"><Button size="small" danger icon={<StopOutlined />} onClick={() => handleVoid(r.id)} /></Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const filteredHistory = useMemo(() => {
    if (!historySearch) return depositHistory;
    const s = historySearch.toLowerCase();
    return depositHistory.filter(d =>
      (d.reference || '').toLowerCase().includes(s) ||
      (d.memo || d.description || '').toLowerCase().includes(s) ||
      (d.bank_account_name || getAccountName(d.bank_account_id || d.accountId) || '').toLowerCase().includes(s)
    );
  }, [depositHistory, historySearch, allAccounts]);

  const historyTotal = filteredHistory.reduce((s, d) => s + Number(d.total_amount || d.debit || d.amount || 0), 0);

  return (
    <div style={{ padding: '24px' }}>
      <Title level={3}>Make Deposits</Title>

      <Card bodyStyle={{ padding: 0 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', padding: '0 24px' }}>
          {[
            { key: '1', label: 'New Deposit' },
            { key: '2', label: <span><HistoryOutlined /> Deposit History{depositHistory.length > 0 ? ` (${depositHistory.length})` : ''}</span> },
          ].map(t => (
            <div key={t.key} onClick={() => setActiveTab(t.key)} style={{
              padding: '12px 16px', cursor: 'pointer',
              borderBottom: activeTab === t.key ? '2px solid #1890ff' : '2px solid transparent',
              color: activeTab === t.key ? '#1890ff' : 'rgba(0,0,0,0.65)',
              fontWeight: activeTab === t.key ? 500 : 400, marginBottom: -1, userSelect: 'none', transition: 'color 0.3s',
            }}>{t.label}</div>
          ))}
        </div>

        <div style={{ padding: 24 }}>
          {activeTab === '1' && (
            <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ date: moment() }}>
              <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
                <Button type={depositMode === 'payments' ? 'primary' : 'default'} onClick={() => setDepositMode('payments')}>Deposit Existing Payments</Button>
                <Button type={depositMode === 'manual' ? 'primary' : 'default'} icon={<SwapOutlined />} onClick={() => setDepositMode('manual')}>Manual Deposit</Button>
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <Form.Item name="bankAccountId" label="Deposit To" rules={[{ required: true, message: 'Select bank account' }]}
                  style={{ minWidth: 250, flex: 2 }}>
                  <Select placeholder="Select bank account" showSearch optionFilterProp="children"
                    dropdownRender={menu => (
                      <>
                        {menu}
                        <Divider style={{ margin: '4px 0' }} />
                        <Button type="link" size="small" icon={<PlusOutlined />}
                          onMouseDown={e => { e.preventDefault(); setAccountModalOpen(true); }}
                          style={{ width: '100%', textAlign: 'left' }}>
                          Add New Bank Account
                        </Button>
                      </>
                    )}>
                    {bankAccounts.map(a => (
                      <Option key={a.id} value={a.id}>{a.accountName || a.name}</Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item name="date" label="Date" rules={[{ required: true }]} style={{ minWidth: 160 }}>
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="reference" label="Reference #" style={{ minWidth: 160 }}>
                  <Input placeholder="Optional ref" />
                </Form.Item>
                <Form.Item name="memo" label="Memo" style={{ minWidth: 200, flex: 1 }}>
                  <Input placeholder="Optional memo" />
                </Form.Item>
              </div>

              {depositMode === 'payments' && (
                <>
                  <Divider orientation="left" style={{ fontSize: 13 }}>Payments Awaiting Deposit</Divider>

                  {pendingPayments.length === 0 ? (
                    <div style={{ padding: '24px 0', textAlign: 'center', color: '#999' }}>
                      No payments awaiting deposit. Payments are placed here after they are recorded against invoices.
                    </div>
                  ) : (
                    <>
                      <Table columns={pendingColumns} dataSource={pendingPayments} rowKey="id" size="small" pagination={false}
                        locale={{ emptyText: 'No pending payments' }}
                        summary={() => selectedPaymentIds.length > 0 ? (
                          <Table.Summary.Row>
                            <Table.Summary.Cell index={0} colSpan={3}><Text strong>Selected Total</Text></Table.Summary.Cell>
                            <Table.Summary.Cell index={3} align="right"><Text strong style={{ color: '#1890ff', fontSize: 15 }}>$ {fmt(selectedTotal)}</Text></Table.Summary.Cell>
                            <Table.Summary.Cell index={4} colSpan={2} />
                          </Table.Summary.Row>
                        ) : null}
                      />
                      <div style={{ marginTop: 8 }}>
                        <Text type="secondary">{selectedPaymentIds.length} of {pendingPayments.length} payments selected</Text>
                      </div>
                    </>
                  )}
                </>
              )}

              {depositMode === 'manual' && (
                <>
                  <Divider orientation="left" style={{ fontSize: 13 }}>Deposit Lines</Divider>

                  {allocations.map(a => (
                    <div key={a.id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                      <Select
                        style={{ flex: 1.5 }}
                        value={a.receivedFrom || undefined}
                        onChange={(v) => updateAllocation(a.id, 'receivedFrom', v)}
                        placeholder="Customer/Vendor *"
                        showSearch optionFilterProp="children"
                      >
                        {payors.filter(p => p.name).map(p => (
                          <Option key={p.id} value={p.name}>{p.name} ({p.type})</Option>
                        ))}
                      </Select>
                      <Select
                        style={{ flex: 1.5 }}
                        value={a.accountId || undefined}
                        onChange={(v) => updateAllocation(a.id, 'accountId', v)}
                        placeholder="Select category/account"
                        showSearch optionFilterProp="children" allowClear
                      >
                        {incomeAccounts.map(ac => (
                          <Option key={ac.id} value={ac.id}>{ac.accountName || ac.name}</Option>
                        ))}
                      </Select>
                      <InputNumber
                        style={{ flex: 1 }}
                        value={a.amount}
                        onChange={(v) => updateAllocation(a.id, 'amount', v || 0)}
                        min={0} step={0.01} precision={2}
                        formatter={v => `$ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        parser={v => v.replace(/\$\s?|(,*)/g, '')}
                      />
                      <Input
                        style={{ flex: 1.5 }}
                        value={a.description}
                        onChange={(e) => updateAllocation(a.id, 'description', e.target.value)}
                        placeholder="Description (optional)"
                      />
                      <Button size="small" danger icon={<MinusCircleOutlined />} onClick={() => removeAllocation(a.id)} />
                    </div>
                  ))}
                  <Button type="dashed" onClick={addAllocation} block icon={<PlusOutlined />} style={{ borderRadius: 6, marginBottom: 12 }}>
                    Add Allocation Line
                  </Button>

                  <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f6f8fa', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <Text style={{ fontSize: 13 }}>
                        <span style={{ fontWeight: 500 }}>Deposit Total:</span>{' '}
                        <span style={{ color: '#1890ff', fontWeight: 700 }}>$ {fmt(manualTotal)}</span>
                      </Text>
                    </div>
                  </div>
                </>
              )}

              <div style={{ marginTop: 24, textAlign: 'right' }}>
                <Space>
                  <Button onClick={() => { form.resetFields(); form.setFieldsValue({ date: moment() }); setSelectedPaymentIds([]); setAllocations([]); }}>
                    Reset
                  </Button>
                  <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={loading}
                    disabled={depositMode === 'payments' ? selectedPaymentIds.length === 0 : (allocations.length === 0 || manualTotal <= 0)}>
                    Save Deposit
                  </Button>
                </Space>
              </div>
            </Form>
          )}

          {activeTab === '2' && (
            <div>
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
                    <Table.Summary.Cell index={5} colSpan={2} />
                  </Table.Summary.Row>
                ) : null}
              />
            </div>
          )}
        </div>
      </Card>

      <Modal title="Deposit Details" visible={!!viewDeposit} onCancel={() => setViewDeposit(null)} width={700} footer={<Button onClick={() => setViewDeposit(null)}>Close</Button>}>
        {viewDeposit && (
          <div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
              <div><Text type="secondary">Date:</Text><br /><Text strong>{viewDeposit.date ? moment(viewDeposit.date).format('MM/DD/YYYY') : '-'}</Text></div>
              <div><Text type="secondary">Bank Account:</Text><br /><Text strong>{viewDeposit.bank_account_name || getAccountName(viewDeposit.bank_account_id || viewDeposit.accountId)}</Text></div>
              {viewDeposit.reference && <div><Text type="secondary">Reference:</Text><br /><Text strong>{viewDeposit.reference}</Text></div>}
              <div><Text type="secondary">Total:</Text><br /><Text strong style={{ color: '#52c41a', fontSize: 16 }}>$ {fmt(viewDeposit.total_amount || viewDeposit.debit || viewDeposit.amount || 0)}</Text></div>
              <div><Text type="secondary">Status:</Text><br />{
                (viewDeposit.status || '').toLowerCase() === 'void' ? <Tag color="red">Void</Tag> :
                (viewDeposit.status || '').toLowerCase() === 'reconciled' ? <Tag color="blue">Reconciled</Tag> :
                <Tag color="green">Active</Tag>
              }</div>
            </div>
            {viewDeposit.memo && <div style={{ marginBottom: 16 }}><Text type="secondary">Memo:</Text><br /><Text>{viewDeposit.memo}</Text></div>}
            {viewDeposit.allocations && viewDeposit.allocations.length > 0 && (
              <>
                <Divider orientation="left">Allocations</Divider>
                <Table dataSource={viewDeposit.allocations} rowKey="id" size="small" pagination={false}
                  columns={[
                    { title: 'Account', dataIndex: 'account_name', key: 'account_name', render: v => v || getAccountName(viewDeposit.allocations?.[0]?.account_id) || '-' },
                    { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right', render: v => `$ ${fmt(v)}` },
                    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
                  ]}
                />
              </>
            )}
            {viewDeposit.payments && viewDeposit.payments.length > 0 && (
              <>
                <Divider orientation="left">Linked Payments</Divider>
                <Table dataSource={viewDeposit.payments} rowKey="id" size="small" pagination={false}
                  columns={[
                    { title: 'Customer', dataIndex: 'customer_name', key: 'customer_name' },
                    { title: 'Invoice', dataIndex: 'invoice_number', key: 'invoice_number' },
                    { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right', render: v => `$ ${fmt(v)}` },
                    { title: 'Date', dataIndex: 'date', key: 'date', render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
                  ]}
                />
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal title="New Bank Account" visible={accountModalOpen} onOk={handleAddAccount} onCancel={() => setAccountModalOpen(false)} okText="Create" destroyOnClose>
        <Form form={accountForm} layout="vertical" preserve={false}>
          <Form.Item name="name" label="Account Name" rules={[{ required: true, message: 'Enter account name' }]}>
            <Input placeholder="e.g. Checking Account" />
          </Form.Item>
          <Form.Item name="type" label="Type" initialValue="Bank" rules={[{ required: true }]}>
            <Select>
              <Option value="Bank">Bank</Option>
              <Option value="Cash">Cash</Option>
              <Option value="Expense">Expense</Option>
              <Option value="Asset">Asset</Option>
              <Option value="Liability">Liability</Option>
              <Option value="Income">Income</Option>
              <Option value="Equity">Equity</Option>
            </Select>
          </Form.Item>
          <Form.Item name="code" label="Account Code">
            <Input placeholder="e.g. 1010" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional description" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Deposits;
