import React, { useEffect, useMemo, useState } from 'react';
import { Card, DatePicker, Form, Input, InputNumber, Select, Button, Table, Space, message, Modal, Row, Col, Statistic, Typography, Tag, Tooltip, Alert, Tabs, Checkbox, Divider } from 'antd';
import { PlusOutlined, SaveOutlined, BankOutlined, DeleteOutlined, DownloadOutlined, HistoryOutlined, DollarOutlined, SearchOutlined, SwapOutlined, MoneyCollectOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { Option } = Select;
const { Title, Text } = Typography;
const { TabPane } = Tabs;
const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MakeDeposits = () => {
  const { symbol: cSym } = useCurrency();
  const [form] = Form.useForm();
  const [accounts, setAccounts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [depositHistory, setDepositHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [total, setTotal] = useState(0);
  const [formItems, setFormItems] = useState([]);
  const [activeTab, setActiveTab] = useState('manual');
  const [pendingPayments, setPendingPayments] = useState([]);
  const [selectedPayments, setSelectedPayments] = useState([]);
  const [allAccounts, setAllAccounts] = useState([]);
  const [payors, setPayors] = useState([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [accRes, txnRes, pmts, custRes, vendRes] = await Promise.all([
        window.electronAPI.getChartOfAccounts().catch(() => []),
        window.electronAPI.getTransactions().catch(() => []),
        window.electronAPI.getPayments?.().catch(() => []),
        window.electronAPI.getAllCustomers().catch(() => ({ all: [] })),
        window.electronAPI.getAllSuppliers().catch(() => []),
      ]);
      const accs = Array.isArray(accRes) ? accRes : [];
      setAccounts(accs);
      setAllAccounts(accs);
      const banks = accs.filter(a => {
        const t = (a.accountType || a.type || '').toLowerCase();
        const n = (a.accountName || a.name || '').toLowerCase();
        return t.includes('bank') || t.includes('cash') || n.includes('bank') || n.includes('checking') || n.includes('savings');
      });
      setBankAccounts(banks.length > 0 ? banks : accs);

      const txns = Array.isArray(txnRes) ? txnRes : [];
      const deps = txns.filter(t => (t.type || '').toLowerCase() === 'deposit')
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setDepositHistory(deps);

      // Load pending payments (Undeposited Funds)
      const pmtArr = Array.isArray(pmts) ? pmts : (pmts?.all || pmts?.data || []);
      setPendingPayments(pmtArr.filter(p => (p.status || '').toLowerCase() !== 'deposited'));

      // Load payors (customers + vendors) for Received From dropdown
      const customers = Array.isArray(custRes?.all) ? custRes.all : (Array.isArray(custRes) ? custRes : []);
      const vendors = Array.isArray(vendRes) ? vendRes : (vendRes?.data || vendRes?.all || []);
      const merged = [
        ...customers.map(c => ({ id: `c-${c.id}`, name: c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim(), type: 'Customer' })),
        ...vendors.map(v => ({ id: `v-${v.id}`, name: v.display_name || `${v.first_name || ''} ${v.last_name || ''}`.trim(), type: 'Vendor' })),
      ].filter(p => p.name);
      setPayors(merged);
    } catch { setAccounts([]); setDepositHistory([]); }
  };

  const onFormValuesChange = (_, allValues) => {
    const itms = allValues.items || [];
    setFormItems(itms);
    setTotal(itms.reduce((s, it) => s + (Number(it?.amount) || 0), 0));
  };

  const onFinish = async (values) => {
    try {
      setLoading(true);
      if (activeTab === 'pending' && selectedPayments.length === 0) {
        message.warning('Select at least one payment to deposit');
        setLoading(false);
        return;
      }
      if (activeTab === 'manual' && (!values.items || values.items.length === 0)) {
        message.warning('Add at least one deposit item');
        setLoading(false);
        return;
      }

      if (activeTab === 'pending') {
        // Deposit existing payments from Undeposited Funds
        const totalAmt = selectedPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
        const allocations = selectedPayments.map(p => ({
          accountId: Number(values.depositToAccountId) || Number(values.accountId),
          amount: Number(p.amount || 0),
          description: p.description || `Payment from ${p.customerName || ''}`,
        }));
        const res = await window.electronAPI.createDeposit({
          bankAccountId: Number(values.accountId),
          date: values.date.format('YYYY-MM-DD'),
          reference: values.reference || '',
          memo: values.memo || 'Deposit — existing payments',
          paymentIds: selectedPayments.map(p => p.id),
          allocations,
        });
        if (res?.success) {
          message.success(`Deposited ${cSym} ${fmt(totalAmt)} (${selectedPayments.length} payment(s))`);
        } else {
          throw new Error(res?.error || 'Deposit failed');
        }
      } else {
        // Manual deposit — each line credits its chosen income/asset/equity account
        const allocations = (values.items || []).map(it => ({
          accountId: it.account || null,
          amount: Number(it.amount) || 0,
          description: [it.receivedFrom, it.description].filter(Boolean).join(' — ') || it.description || 'Manual deposit',
        })).filter(a => a.amount > 0);

        if (!allocations.length) {
          message.warning('Add at least one deposit item with an amount');
          setLoading(false);
          return;
        }
        if (allocations.some(a => !a.account && !a.accountId)) {
          // account is required for manual deposits
        }
        const res = await window.electronAPI.createDeposit({
          bankAccountId: Number(values.accountId),
          date: values.date.format('YYYY-MM-DD'),
          reference: values.reference || '',
          memo: values.memo || 'Manual deposit',
          paymentIds: [],
          allocations,
        });
        if (res?.success) {
          message.success(`Deposit recorded — ${cSym} ${fmt(total)}`);
        } else {
          throw new Error(res?.error || 'Deposit failed');
        }
      }
      form.resetFields();
      form.setFieldsValue({ date: moment(), items: [{ type: 'Cash' }] });
      setSelectedPayments([]);
      loadData();
    } catch (e) {
      message.error(e.message || 'Failed to record deposit');
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    try {
      const headers = ['Date', 'Reference', 'Description', 'Amount'];
      const rows = depositHistory.map(d => [
        d.date || '', d.reference || '', (d.description || '').replace(/"/g, '""'), Number(d.debit || d.amount || 0).toFixed(2)
      ].map(v => `"${v}"`).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `deposits_${moment().format('YYYY-MM-DD')}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      message.success('Exported CSV');
    } catch { message.error('Export failed'); }
  };

  const filteredHistory = useMemo(() => {
    if (!historySearch) return depositHistory;
    const s = historySearch.toLowerCase();
    return depositHistory.filter(d =>
      (d.reference || '').toLowerCase().includes(s) ||
      (d.description || '').toLowerCase().includes(s) ||
      (d.date || '').includes(s)
    );
  }, [depositHistory, historySearch]);

  const totalDeposits = depositHistory.reduce((s, d) => s + Number(d.debit || d.amount || 0), 0);
  const thisMonthDeps = depositHistory.filter(d => d.date && moment(d.date).isSame(moment(), 'month'));
  const thisMonthTotal = thisMonthDeps.reduce((s, d) => s + Number(d.debit || d.amount || 0), 0);

  const selectedAccount = useMemo(() => {
    return accounts.find(a => String(a.id) === String(selectedAccountId));
  }, [accounts, selectedAccountId]);

  // Accounts available as deposit "Category" — Income, Asset, Equity, Other Income
  const categoryAccounts = useMemo(() => {
    return accounts.filter(a => {
      const t = (a.accountType || a.type || '').toLowerCase();
      return t.includes('income') || t.includes('revenue') || t.includes('asset') ||
        t.includes('equity') || t.includes('liabilit');
    });
  }, [accounts]);

  const getAccName = (id) => {
    if (!id) return '-';
    const acc = accounts.find(a => String(a.id) === String(id));
    return acc?.accountName || acc?.name || `#${id}`;
  };

  const historyColumns = [
    { title: 'Date', dataIndex: 'date', key: 'date', width: 100, render: v => v ? moment(v).format('MM/DD/YYYY') : '-', sorter: (a, b) => new Date(a.date || 0) - new Date(b.date || 0) },
    { title: 'Bank Account', dataIndex: 'accountId', key: 'accountId', width: 150, render: v => getAccName(v) },
    { title: 'Reference', dataIndex: 'reference', key: 'reference', width: 120, ellipsis: true },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Amount', dataIndex: 'debit', key: 'debit', width: 120, align: 'right', render: (v, r) => <Text strong style={{ color: '#52c41a' }}>{cSym} {fmt(v || r.amount || 0)}</Text> },
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
          <Title level={3} style={{ margin: 0 }}><BankOutlined style={{ marginRight: 8 }} />Make Deposits</Title>
          <Text type="secondary">Record bank deposits &middot; {depositHistory.length} deposits on file</Text>
        </div>
      </div>

      {/* Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #52c41a' }}>
            <Statistic title="Total Deposits" value={depositHistory.length} valueStyle={{ fontSize: 18, color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #1890ff' }}>
            <Statistic title="Total Deposited" value={totalDeposits} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #722ed1' }}>
            <Statistic title="This Month" value={thisMonthDeps.length} valueStyle={{ fontSize: 18, color: '#722ed1' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #fa8c16' }}>
            <Statistic title="Month Total" value={thisMonthTotal} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: '#fa8c16' }} />
          </Card>
        </Col>
      </Row>

      {/* Deposit Form with Tabs */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane tab={<span><MoneyCollectOutlined /> Manual Deposit</span>} key="manual">
            <Form form={form} layout="vertical" onFinish={onFinish} onValuesChange={onFormValuesChange} initialValues={{ date: moment(), items: [{ type: 'Cash' }] }}>
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item name="accountId" label="Deposit To (Bank Account)" rules={[{ required: true, message: 'Select bank account' }]}>
                    <Select showSearch optionFilterProp="children" placeholder="Select bank account"
                      onChange={(val) => setSelectedAccountId(val)}>
                      {bankAccounts.map(a => (
                        <Option key={String(a.id)} value={String(a.id)}>{a.accountName || a.name}{a.accountNumber ? ` (${a.accountNumber})` : ''}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={6}>
                  <Form.Item name="date" label="Date" rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={6}>
                  <Form.Item name="reference" label="Reference">
                    <Input placeholder="DEP-001" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item name="memo" label="Memo / Description">
                    <Input placeholder="Optional memo" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={6}>
                  <Form.Item label="Deposit Total">
                    <InputNumber value={total} readOnly style={{ width: '100%', fontWeight: 700, background: '#f6ffed' }} formatter={v => `${cSym} ${fmt(v)}`} />
                  </Form.Item>
                </Col>
              </Row>

              <Form.List name="items">
                {(fields, { add, remove }) => (
                  <Card size="small" title="Deposit Items" style={{ marginBottom: 16 }}
                    extra={<Button type="dashed" onClick={() => add({ type: 'Cash' })} icon={<PlusOutlined />} size="small">Add Item</Button>}
                  >
                    {fields.length === 0 && <Alert message="Add at least one deposit item" type="info" showIcon style={{ marginBottom: 8 }} />}
                    {/* Column headers */}
                    {fields.length > 0 && (
                      <Row gutter={8} style={{ marginBottom: 4 }}>
                        <Col sm={4}><Text type="secondary" style={{ fontSize: 11 }}>Received From</Text></Col>
                        <Col sm={6}><Text type="secondary" style={{ fontSize: 11 }}>Account / Category *</Text></Col>
                        <Col sm={3}><Text type="secondary" style={{ fontSize: 11 }}>Type</Text></Col>
                        <Col sm={6}><Text type="secondary" style={{ fontSize: 11 }}>Description / Memo</Text></Col>
                        <Col sm={3}><Text type="secondary" style={{ fontSize: 11 }}>Amount</Text></Col>
                        <Col sm={2}></Col>
                      </Row>
                    )}
                    {fields.map((field) => (
                      <Row key={field.key} gutter={8} style={{ marginBottom: 8 }} align="middle">
                        <Col xs={24} sm={4}>
                          <Form.Item {...field} name={[field.name, 'receivedFrom']} noStyle>
                            <Select showSearch optionFilterProp="children" placeholder="Customer/Vendor" allowClear style={{ width: '100%' }}>
                              {payors.map(p => <Option key={p.id} value={p.name}>{p.name} ({p.type})</Option>)}
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={6}>
                          <Form.Item {...field} name={[field.name, 'account']} noStyle rules={[{ required: true, message: 'Account required' }]}>
                            <Select style={{ width: '100%' }} placeholder="Account / Category" showSearch optionFilterProp="children">
                              {categoryAccounts.map(a => (
                                <Option key={a.id} value={a.accountName || a.name}>
                                  {(a.accountName || a.name)}{a.accountType ? ` (${a.accountType})` : ''}
                                </Option>
                              ))}
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={3}>
                          <Form.Item {...field} name={[field.name, 'type']} noStyle rules={[{ required: true }]}>
                            <Select style={{ width: '100%' }} placeholder="Type">
                              <Option value="Cash">Cash</Option>
                              <Option value="Check">Check</Option>
                              <Option value="Card">Card</Option>
                              <Option value="Wire">Wire</Option>
                              <Option value="EFT">EFT</Option>
                              <Option value="Other">Other</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={6}>
                          <Form.Item {...field} name={[field.name, 'description']} noStyle>
                            <Input placeholder="Description" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={3}>
                          <Form.Item {...field} name={[field.name, 'amount']} noStyle rules={[{ required: true, message: 'Required' }]}>
                            <InputNumber style={{ width: '100%' }} min={0} step={0.01} placeholder="Amount" formatter={v => v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''} parser={v => v.replace(/\$\s?|(,*)/g, '')} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={2} style={{ textAlign: 'center' }}>
                          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                        </Col>
                      </Row>
                    ))}
                    {fields.length > 0 && (
                      <div style={{ textAlign: 'right', paddingTop: 8, borderTop: '1px solid #f0f0f0', fontWeight: 700, fontSize: 16 }}>
                        Total: <span style={{ color: '#52c41a' }}>${fmt(total)}</span>
                      </div>
                    )}
                  </Card>
                )}
              </Form.List>

              <Space>
                <Button onClick={() => { form.resetFields(); form.setFieldsValue({ date: moment(), items: [{ type: 'Cash' }] }); }}>Reset</Button>
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading} disabled={formItems.length === 0}>Record Deposit</Button>
              </Space>
            </Form>
          </TabPane>

          <TabPane tab={<span><SwapOutlined /> Deposit Existing Payments (Undeposited Funds)</span>} key="pending">
            <Form form={form} layout="vertical" onFinish={onFinish}>
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item name="accountId" label="Deposit To (Bank Account)" rules={[{ required: true, message: 'Select bank account' }]}>
                    <Select showSearch optionFilterProp="children" placeholder="Select bank account">
                      {bankAccounts.map(a => (
                        <Option key={String(a.id)} value={String(a.id)}>{a.accountName || a.name}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={6}>
                  <Form.Item name="date" label="Date" rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={6}>
                  <Form.Item name="reference" label="Reference">
                    <Input placeholder="DEP-001" />
                  </Form.Item>
                </Col>
              </Row>

              <div style={{ marginTop: 8, marginBottom: 16 }}>
                <Text strong>Select Payments to Deposit</Text>
                {pendingPayments.length === 0 ? (
                  <Alert message="No pending payments in Undeposited Funds" type="info" showIcon style={{ marginTop: 8 }} />
                ) : (
                  <div style={{ marginTop: 8, maxHeight: 300, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6 }}>
                    <table style={{ width: '100%', fontSize: 13 }}>
                      <thead><tr style={{ background: '#fafafa' }}>
                        <th style={{ padding: 8, textAlign: 'left', width: 40 }}></th>
                        <th style={{ padding: 8, textAlign: 'left' }}>Customer</th>
                        <th style={{ padding: 8, textAlign: 'left' }}>Description</th>
                        <th style={{ padding: 8, textAlign: 'right' }}>Amount</th>
                      </tr></thead>
                      <tbody>
                        {pendingPayments.map(p => (
                          <tr key={p.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                            <td style={{ padding: 6, textAlign: 'center' }}>
                              <input type="checkbox" checked={selectedPayments.some(sp => sp.id === p.id)}
                                onChange={() => setSelectedPayments(prev =>
                                  prev.some(sp => sp.id === p.id) ? prev.filter(sp => sp.id !== p.id) : [...prev, p]
                                )} />
                            </td>
                            <td style={{ padding: 6 }}>{p.customerName || p.customer_name || '—'}</td>
                            <td style={{ padding: 6 }}>{p.description || p.reference || ''}</td>
                            <td style={{ padding: 6, textAlign: 'right' }}><Text strong>{cSym} {fmt(p.amount || 0)}</Text></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: '2px solid #d9d9d9' }}>
                          <td colSpan={3} style={{ padding: 8, textAlign: 'right' }}><Text strong>Total:</Text></td>
                          <td style={{ padding: 8, textAlign: 'right' }}><Text strong style={{ color: '#52c41a' }}>{cSym} {fmt(selectedPayments.reduce((s, p) => s + Number(p.amount || 0), 0))}</Text></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              <Form.Item name="memo" label="Memo / Description">
                <Input placeholder="Optional memo" />
              </Form.Item>

              <Space>
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading} disabled={selectedPayments.length === 0}>
                  Deposit Selected ({selectedPayments.length})
                </Button>
              </Space>
            </Form>
          </TabPane>
        </Tabs>
      </Card>

      {/* Deposit History */}
      <Card title={<><HistoryOutlined style={{ marginRight: 4 }} /> Deposit History</>} size="small"
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
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: t => `${t} deposits` }}
          scroll={{ x: 600 }}
          locale={{ emptyText: 'No deposits recorded yet' }}
          summary={() => filteredHistory.length > 0 ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={4}><Text strong>Total</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right"><Text strong style={{ color: '#52c41a' }}>${fmt(filteredHistory.reduce((s, d) => s + Number(d.debit || d.amount || 0), 0))}</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={5} />
            </Table.Summary.Row>
          ) : null}
        />
      </Card>
    </div>
  );
};

export default MakeDeposits;