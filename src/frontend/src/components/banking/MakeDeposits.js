import React, { useEffect, useMemo, useState } from 'react';
import { Card, DatePicker, Form, Input, InputNumber, Select, Button, Table, Space, message, Modal, Row, Col, Statistic, Typography, Tag, Tooltip, Alert } from 'antd';
import { PlusOutlined, SaveOutlined, BankOutlined, DeleteOutlined, DownloadOutlined, HistoryOutlined, DollarOutlined, SearchOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { Option } = Select;
const { Title, Text } = Typography;
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
      const deps = txns.filter(t => (t.type || '').toLowerCase() === 'deposit')
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setDepositHistory(deps);
    } catch { setAccounts([]); setDepositHistory([]); }
  };

  const onFormValuesChange = (_, allValues) => {
    const itms = allValues.items || [];
    setFormItems(itms);
    setTotal(itms.reduce((s, it) => s + (Number(it?.amount) || 0), 0));
  };

  const onFinish = async (values) => {
    if (!values.items || values.items.length === 0) {
      message.warning('Add at least one deposit item');
      return;
    }
    try {
      setLoading(true);
      const payload = {
        accountId: Number(values.accountId),
        date: values.date.format('YYYY-MM-DD'),
        items: values.items.map(it => ({
          type: it.type || 'Cash',
          reference: it.reference || '',
          description: it.description || '',
          amount: Number(it.amount) || 0,
        })),
        total,
      };
      const res = await window.electronAPI.createDeposit(payload);
      if (res && res.success) {
        message.success(`Deposit of ${cSym} ${fmt(total)} recorded successfully`);
        form.resetFields();
        form.setFieldsValue({ date: moment(), items: [{ type: 'Cash' }] });
        loadData();
      } else {
        throw new Error(res?.error || 'Failed to record deposit');
      }
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

  const getAccName = (id) => {
    if (!id) return '-';
    const acc = accounts.find(a => String(a.id) === String(id));
    return acc?.accountName || acc?.name || `#${id}`;
  };

  const historyColumns = [
    { title: 'Date', dataIndex: 'date', key: 'date', width: 100, render: v => v ? moment(v).format('DD MMM YY') : '-', sorter: (a, b) => new Date(a.date || 0) - new Date(b.date || 0) },
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

      {/* Deposit Form */}
      <Card title={<><DollarOutlined style={{ marginRight: 4 }} /> New Deposit</>} size="small" style={{ marginBottom: 16 }}>
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
                {fields.map((field) => (
                  <Row key={field.key} gutter={8} style={{ marginBottom: 8 }} align="middle">
                    <Col xs={24} sm={4}>
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
                    <Col xs={24} sm={4}>
                      <Form.Item {...field} name={[field.name, 'reference']} noStyle>
                        <Input placeholder="Reference #" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={10}>
                      <Form.Item {...field} name={[field.name, 'description']} noStyle>
                        <Input placeholder="Description" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={4}>
                      <Form.Item {...field} name={[field.name, 'amount']} noStyle rules={[{ required: true, message: 'Required' }]}>
                        <InputNumber style={{ width: '100%' }} min={0} step={0.01} placeholder="Amount" formatter={v => v ? `$ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''} parser={v => v.replace(/\$\s?|(,*)/g, '')} />
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