import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Card, Row, Col, Statistic, Button, Modal, Form, Input,
  Select, DatePicker, Tag, Space, Popconfirm, message, Spin, Tabs, Typography
} from 'antd';
import {
  DollarOutlined, PrinterOutlined, EditOutlined, DeleteOutlined,
  ReloadOutlined, SearchOutlined, WalletOutlined, FileTextOutlined
} from '@ant-design/icons';
import moment from 'moment';

const { TabPane } = Tabs;
const { Option } = Select;
const { Text } = Typography;

const METHODS = ['Bank Transfer', 'Cash', 'Check', 'Credit Card', 'EFT/ACH', 'Online', 'Other'];

const fmt = (v) => {
  const n = Number(v || 0);
  return (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const methodColor = {
  'Bank Transfer': 'blue', 'Cash': 'green', 'Check': 'purple',
  'Credit Card': 'volcano', 'EFT/ACH': 'cyan', 'Online': 'gold', 'Other': 'default',
};

/* ─── CustomerPaymentHistory ─────────────────────────────────────────────────
   Props:
     customerId  – when set, scoped to one customer
     invoiceId   – when set, scoped to one invoice
     mode        – 'customer' | 'invoice' | 'all'  (default 'all')
     embedded    – boolean, hides outer card chrome when true
*/
const CustomerPaymentHistory = ({ customerId, invoiceId, mode = 'all', embedded = false }) => {
  const [payments, setPayments]     = useState([]);
  const [balance, setBalance]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const [search, setSearch]         = useState('');
  const [editModal, setEditModal]   = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [detailModal, setDetailModal] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let data = [];
      if (mode === 'invoice' && invoiceId) {
        data = await window.electronAPI?.invoicePaymentsList?.(invoiceId) || [];
      } else if (mode === 'customer' && customerId) {
        data = await window.electronAPI?.customerPaymentsList?.(customerId) || [];
        const bal = await window.electronAPI?.customerPaymentsBalance?.(customerId);
        setBalance(bal);
      } else {
        const filters = {};
        if (customerId) filters.customerId = customerId;
        data = await window.electronAPI?.customerPaymentsAll?.(filters) || [];
      }
      setPayments(Array.isArray(data) ? data : []);
    } catch (e) {
      message.error('Failed to load payment history');
    }
    setLoading(false);
  }, [customerId, invoiceId, mode]);

  useEffect(() => { load(); }, [load]);

  const handleEdit = (record) => {
    setEditRecord(record);
    form.setFieldsValue({
      amount: record.amount,
      paymentMethod: record.paymentMethod,
      date: record.date ? moment(record.date) : null,
      memo: record.memo,
      reference: record.reference,
    });
    setEditModal(true);
  };

  const handleSave = async () => {
    try {
      const vals = await form.validateFields();
      const data = {
        amount: Number(vals.amount),
        paymentMethod: vals.paymentMethod,
        date: vals.date ? vals.date.format('YYYY-MM-DD') : null,
        memo: vals.memo || null,
        reference: vals.reference || null,
      };
      const res = await window.electronAPI?.customerPaymentUpdate?.(editRecord.id, data);
      if (res?.success) {
        message.success('Payment updated');
        setEditModal(false);
        load();
      } else {
        message.error(res?.error || 'Update failed');
      }
    } catch (e) { /* validation */ }
  };

  const handleDelete = async (id) => {
    const res = await window.electronAPI?.customerPaymentDelete?.(id);
    if (res?.success) { message.success('Payment deleted'); load(); }
    else message.error(res?.error || 'Delete failed');
  };

  const handlePrint = (record) => {
    const win = window.open('', '_blank', 'width=700,height=600');
    win.document.write(`
      <html><head><title>Payment Receipt</title>
      <style>body{font-family:Arial,sans-serif;padding:30px;} h2{color:#1890ff;} table{width:100%;border-collapse:collapse;margin-top:20px;} td,th{border:1px solid #ddd;padding:8px;} th{background:#f0f0f0;}</style>
      </head><body>
      <h2>Payment Receipt</h2>
      <p><strong>Receipt #:</strong> PMT-${String(record.id).padStart(5,'0')}</p>
      <p><strong>Date:</strong> ${record.date || record.createdAt || ''}</p>
      <p><strong>Customer:</strong> ${record.customerName || ''}</p>
      <table>
        <tr><th>Invoice #</th><th>Payment Method</th><th>Amount</th><th>Reference</th></tr>
        <tr>
          <td>${record.invoiceNumber || 'Unapplied'}</td>
          <td>${record.paymentMethod || ''}</td>
          <td>${fmt(record.amount)}</td>
          <td>${record.reference || '-'}</td>
        </tr>
      </table>
      ${record.memo ? `<p style="margin-top:16px"><strong>Memo:</strong> ${record.memo}</p>` : ''}
      <p style="margin-top:30px;color:#888;font-size:12px">Generated ${new Date().toLocaleString()}</p>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  const filtered = payments.filter(p => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (p.invoiceNumber || '').toLowerCase().includes(s) ||
      (p.customerName  || '').toLowerCase().includes(s) ||
      (p.paymentMethod || '').toLowerCase().includes(s) ||
      (p.reference     || '').toLowerCase().includes(s) ||
      (p.memo          || '').toLowerCase().includes(s)
    );
  });

  const columns = [
    {
      title: 'Date', dataIndex: 'date', key: 'date', width: 110,
      render: (v) => v ? moment(v).format('DD MMM YYYY') : <Text type="secondary">—</Text>,
      sorter: (a, b) => (a.date || '').localeCompare(b.date || ''),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Customer', dataIndex: 'customerName', key: 'customerName',
      render: (v) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Invoice #', dataIndex: 'invoiceNumber', key: 'invoiceNumber', width: 110,
      render: (v) => v || <Tag color="orange">Unapplied</Tag>,
    },
    {
      title: 'Invoice Total', dataIndex: 'invoiceTotal', key: 'invoiceTotal', width: 120, align: 'right',
      render: (v) => v != null ? fmt(v) : <Text type="secondary">—</Text>,
    },
    {
      title: 'Amount Paid', dataIndex: 'amount', key: 'amount', width: 120, align: 'right',
      render: (v) => <Text strong style={{ color: '#52c41a' }}>{fmt(v)}</Text>,
      sorter: (a, b) => a.amount - b.amount,
    },
    {
      title: 'Remaining', key: 'remaining', width: 120, align: 'right',
      render: (_, r) => {
        if (r.invoiceTotal == null) return <Tag color="orange">Unapplied</Tag>;
        const rem = Number(r.invoiceTotal || 0) - Number(r.amount || 0);
        return <Text style={{ color: rem > 0 ? '#fa541c' : '#52c41a' }}>{fmt(rem)}</Text>;
      },
    },
    {
      title: 'Method', dataIndex: 'paymentMethod', key: 'paymentMethod', width: 130,
      render: (v) => v ? <Tag color={methodColor[v] || 'default'}>{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Reference', dataIndex: 'reference', key: 'reference',
      render: (v) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Actions', key: 'actions', width: 130, fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Button size="small" icon={<FileTextOutlined />} onClick={() => { setDetailRecord(record); setDetailModal(true); }} />
          <Button size="small" icon={<PrinterOutlined />}  onClick={() => handlePrint(record)} />
          <Button size="small" icon={<EditOutlined />}     onClick={() => handleEdit(record)} />
          <Popconfirm title="Delete this payment?" onConfirm={() => handleDelete(record.id)} okText="Delete" okType="danger">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const unapplied = payments.filter(p => !p.invoiceId || p.invoiceId === 0);
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

  const content = (
    <Spin spinning={loading}>
      {/* Balance Summary – only when scoped to a customer */}
      {(mode === 'customer' || customerId) && balance && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          {[
            { title: 'Total Invoiced',    value: balance.invoicedTotal,    icon: <FileTextOutlined />, color: '#1890ff' },
            { title: 'Total Paid',        value: balance.paidTotal,        icon: <DollarOutlined />,  color: '#52c41a' },
            { title: 'Remaining Balance', value: balance.remainingBalance, icon: <WalletOutlined />,  color: balance.remainingBalance > 0 ? '#fa541c' : '#52c41a' },
            { title: 'Unapplied Credits', value: balance.unappliedCredits, icon: <DollarOutlined />,  color: '#faad14' },
          ].map((s, i) => (
            <Col xl={6} lg={12} md={12} sm={12} xs={24} key={i}>
              <Card size="small" bodyStyle={{ padding: '12px 16px' }} style={{ borderTop: `3px solid ${s.color}` }}>
                <Statistic
                  title={s.title} prefix={s.icon}
                  value={Math.abs(s.value)}
                  precision={2} prefix="$"
                  valueStyle={{ color: s.color, fontSize: 16 }}
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* Toolbar */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Col>
          <Input
            placeholder="Search payments…"
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            style={{ width: 240 }}
          />
        </Col>
        <Col>
          <Space>
            <Text type="secondary">{filtered.length} records · {fmt(totalPaid)} total</Text>
            <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
          </Space>
        </Col>
      </Row>

      <Tabs defaultActiveKey="all" size="small">
        <TabPane tab={`All Payments (${filtered.length})`} key="all">
          <Table
            dataSource={filtered}
            columns={columns}
            rowKey="id"
            size="small"
            scroll={{ x: 900 }}
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} payments` }}
          />
        </TabPane>
        <TabPane tab={`Unapplied Credits (${unapplied.length})`} key="unapplied">
          <Table
            dataSource={unapplied.filter(p => {
              if (!search) return true;
              const s = search.toLowerCase();
              return (p.customerName || '').toLowerCase().includes(s) || (p.paymentMethod || '').toLowerCase().includes(s);
            })}
            columns={columns.filter(c => c.key !== 'invoiceNumber' && c.key !== 'invoiceTotal' && c.key !== 'remaining')}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 20 }}
          />
        </TabPane>
      </Tabs>
    </Spin>
  );

  return (
    <>
      {embedded ? content : (
        <Card
          title={<span><DollarOutlined style={{ marginRight: 8, color: '#1890ff' }} />Payment History</span>}
          extra={<Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>}
        >
          {content}
        </Card>
      )}

      {/* Edit Modal */}
      <Modal
        title="Edit Payment"
        visible={editModal}
        onOk={handleSave}
        onCancel={() => setEditModal(false)}
        okText="Save"
        width={460}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
            <Input prefix="$" type="number" min={0} step="0.01" />
          </Form.Item>
          <Form.Item name="paymentMethod" label="Payment Method">
            <Select allowClear placeholder="Select method">
              {METHODS.map(m => <Option key={m} value={m}>{m}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="date" label="Payment Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reference" label="Reference #">
            <Input placeholder="Cheque #, transaction ref, etc." />
          </Form.Item>
          <Form.Item name="memo" label="Memo">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Detail Modal */}
      <Modal
        title={<span><FileTextOutlined style={{ marginRight: 8 }} />Payment Details</span>}
        visible={detailModal}
        onCancel={() => setDetailModal(false)}
        footer={[
          <Button key="print" icon={<PrinterOutlined />} onClick={() => handlePrint(detailRecord)}>Print Receipt</Button>,
          <Button key="close" onClick={() => setDetailModal(false)}>Close</Button>,
        ]}
        width={480}
      >
        {detailRecord && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            {[
              ['Receipt #', `PMT-${String(detailRecord.id).padStart(5,'0')}`],
              ['Customer', detailRecord.customerName || '—'],
              ['Invoice #', detailRecord.invoiceNumber || 'Unapplied'],
              ['Invoice Total', fmt(detailRecord.invoiceTotal)],
              ['Amount Paid', fmt(detailRecord.amount)],
              ['Remaining Balance', detailRecord.invoiceTotal != null ? fmt(Number(detailRecord.invoiceTotal) - Number(detailRecord.amount)) : 'N/A'],
              ['Payment Method', detailRecord.paymentMethod || '—'],
              ['Payment Date', detailRecord.date ? moment(detailRecord.date).format('DD MMM YYYY') : '—'],
              ['Reference', detailRecord.reference || '—'],
              ['Memo', detailRecord.memo || '—'],
              ['Recorded On', detailRecord.createdAt ? moment(detailRecord.createdAt).format('DD MMM YYYY HH:mm') : '—'],
            ].map(([label, value]) => (
              <tr key={label} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '8px 12px', fontWeight: 600, color: '#666', width: '40%' }}>{label}</td>
                <td style={{ padding: '8px 12px' }}>{value}</td>
              </tr>
            ))}
          </table>
        )}
      </Modal>
    </>
  );
};

export default CustomerPaymentHistory;
