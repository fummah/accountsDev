import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Card, Row, Col, Statistic, Button, Modal, Form, Input,
  Select, DatePicker, Tag, Space, Popconfirm, message, Spin, Radio, Typography
} from 'antd';
import {
  DollarOutlined, PrinterOutlined, EditOutlined, DeleteOutlined,
  ReloadOutlined, SearchOutlined, WalletOutlined, FileTextOutlined,
  PlusOutlined, LinkOutlined
} from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';
import ReceivePaymentModal from './ReceivePaymentModal';
import PaymentDetailsModal from './PaymentDetailsModal';
import ApplyCreditModal from './ApplyCreditModal';

const { Option } = Select;
const { Text } = Typography;

const METHODS = ['Bank Transfer', 'Cash', 'Check', 'Credit Card', 'EFT/ACH', 'Online', 'Other'];

const fmt = (v, cSym = '$') => {
  const n = Number(v || 0);
  return (n < 0 ? '-' : '') + cSym + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const pmtNo = (id) => `PMT-${String(id).padStart(5, '0')}`;

const methodColor = {
  'Bank Transfer': 'blue', 'Cash': 'green', 'Check': 'purple',
  'Credit Card': 'volcano', 'EFT/ACH': 'cyan', 'Online': 'gold', 'Other': 'default',
};

/* ─── CustomerPaymentHistory ─────────────────────────────────────────────────
   The "Payments" tab for a customer: summary cards, "+ Add Payment", and the
   full payment history (applied + unapplied credits).
   Props:
     customerId  – when set, scoped to one customer
     invoiceId   – when set, scoped to one invoice
     mode        – 'customer' | 'invoice' | 'all'  (default 'all')
     embedded    – boolean, hides outer card chrome when true
*/
const CustomerPaymentHistory = ({ customerId, invoiceId, mode = 'all', embedded = false, onChange }) => {
  const { symbol: cSym } = useCurrency();
  const [payments, setPayments]     = useState([]);
  const [balance, setBalance]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const [search, setSearch]         = useState('');
  const [editModal, setEditModal]   = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [detailModal, setDetailModal] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [receiveModal, setReceiveModal] = useState(false);
  const [applyModal, setApplyModal] = useState(false);
  const [applyRecord, setApplyRecord] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [subTab, setSubTab] = useState('all');
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
        if (customerName === '') {
          const cust = await window.electronAPI?.getSingleCustomer?.(customerId);
          if (cust) {
            setCustomerName(cust.display_name || `${cust.first_name || ''} ${cust.last_name || ''}`.trim() || cust.company_name || '');
          }
        }
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
  }, [customerId, invoiceId, mode, customerName]);

  useEffect(() => { load(); }, [load]);

  // Reload this tab AND notify the parent page (customer details) so every
  // affected total/invoice refreshes instantly after a payment change.
  const refreshAll = useCallback(() => {
    load();
    onChange && onChange();
  }, [load, onChange]);

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
        refreshAll();
      } else {
        message.error(res?.error || 'Update failed');
      }
    } catch (e) { /* validation */ }
  };

  const handleDelete = async (id) => {
    const res = await window.electronAPI?.customerPaymentDelete?.(id);
    if (res?.success) { message.success('Payment deleted'); refreshAll(); }
    else message.error(res?.error || 'Delete failed');
  };

  const handlePrint = (record) => {
    const win = window.open('', '_blank', 'width=700,height=600');
    win.document.write(`
      <html><head><title>Payment Receipt</title>
      <style>body{font-family:Arial,sans-serif;padding:30px;} h2{color:#1890ff;} table{width:100%;border-collapse:collapse;margin-top:20px;} td,th{border:1px solid #ddd;padding:8px;} th{background:#f0f0f0;}</style>
      </head><body>
      <h2>Payment Receipt</h2>
      <p><strong>Receipt #:</strong> ${pmtNo(record.id)}</p>
      <p><strong>Date:</strong> ${record.date || record.createdAt || ''}</p>
      <p><strong>Customer:</strong> ${record.customerName || ''}</p>
      <table>
        <tr><th>Payment Method</th><th>Amount</th><th>Applied</th><th>Unapplied</th><th>Reference</th></tr>
        <tr>
          <td>${record.paymentMethod || ''}</td>
          <td>${fmt(record.amount)}</td>
          <td>${fmt(record.applied != null ? record.applied : record.amount)}</td>
          <td>${fmt(record.unapplied || 0)}</td>
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
      pmtNo(p.id).toLowerCase().includes(s) ||
      (p.invoiceNumber || '').toLowerCase().includes(s) ||
      (p.customerName  || '').toLowerCase().includes(s) ||
      (p.paymentMethod || '').toLowerCase().includes(s) ||
      (p.reference     || '').toLowerCase().includes(s) ||
      (p.memo          || '').toLowerCase().includes(s)
    );
  });

  const unappliedList = payments.filter(p => Number(p.unapplied || 0) > 0.005);

  const columns = [
    {
      title: 'Date', dataIndex: 'date', key: 'date', width: 100,
      render: (v) => v ? moment(v).format('MM/DD/YYYY') : <Text type="secondary">—</Text>,
      sorter: (a, b) => (a.date || '').localeCompare(b.date || ''),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Payment #', dataIndex: 'id', key: 'id', width: 110,
      render: (id) => <Text strong>{pmtNo(id)}</Text>,
    },
    {
      title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right',
      render: (v) => <Text strong style={{ color: '#52c41a' }}>{fmt(v, cSym)}</Text>,
      sorter: (a, b) => a.amount - b.amount,
    },
    {
      title: 'Applied', dataIndex: 'applied', key: 'applied', width: 120, align: 'right',
      render: (v) => fmt(v, cSym),
    },
    {
      title: 'Unapplied', dataIndex: 'unapplied', key: 'unapplied', width: 120, align: 'right',
      render: (v) => {
        const n = Number(v || 0);
        return n > 0.005
          ? <Text strong style={{ color: '#faad14' }}>{fmt(n, cSym)}</Text>
          : <Text type="secondary">{fmt(0, cSym)}</Text>;
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
      title: 'Actions', key: 'actions', width: 150, fixed: 'right',
      render: (_, record) => (
        <Space size={4} onClick={e => e.stopPropagation()}>
          <Button size="small" icon={<FileTextOutlined />} onClick={() => { setDetailRecord(record); setDetailModal(true); }} />
          {Number(record.unapplied || 0) > 0.005 && (
            <Button size="small" type="primary" title="Apply credit to an invoice" icon={<LinkOutlined />} onClick={() => { setApplyRecord(record); setApplyModal(true); }} />
          )}
          <Button size="small" icon={<PrinterOutlined />} onClick={() => handlePrint(record)} />
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title="Delete this payment?" onConfirm={() => handleDelete(record.id)} okText="Delete" okType="danger">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

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
                  precision={2} prefix={cSym}
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
            <Text type="secondary">{filtered.length} records · {fmt(totalPaid, cSym)} total</Text>
            <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
            {customerId && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setReceiveModal(true)}>Add Payment</Button>
            )}
          </Space>
        </Col>
      </Row>

      <Radio.Group
        value={subTab}
        onChange={e => setSubTab(e.target.value)}
        size="small"
        style={{ marginBottom: 12 }}
      >
        <Radio.Button value="all">All Payments ({filtered.length})</Radio.Button>
        <Radio.Button value="unapplied">Unapplied Credits ({unappliedList.length})</Radio.Button>
      </Radio.Group>

      {subTab === 'all' ? (
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey="id"
          size="small"
          scroll={{ x: 1000 }}
          pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} payments` }}
          onRow={(record) => ({
            onClick: () => { setDetailRecord(record); setDetailModal(true); },
            style: { cursor: 'pointer' },
          })}
        />
      ) : (
        <Table
          dataSource={unappliedList.filter(p => {
            if (!search) return true;
            const s = search.toLowerCase();
            return pmtNo(p.id).toLowerCase().includes(s)
              || (p.customerName || '').toLowerCase().includes(s)
              || (p.paymentMethod || '').toLowerCase().includes(s);
          })}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={{ defaultPageSize: 20 }}
          onRow={(record) => ({
            onClick: () => { setDetailRecord(record); setDetailModal(true); },
            style: { cursor: 'pointer' },
          })}
        />
      )}
    </Spin>
  );

  return (
    <>
      {embedded ? content : (
        <Card
          title={<span><DollarOutlined style={{ marginRight: 8, color: '#1890ff' }} />Payments</span>}
          extra={<Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>}
        >
          {content}
        </Card>
      )}

      {/* Receive Payment modal */}
      {customerId && (
        <ReceivePaymentModal
          customerId={customerId}
          customerName={customerName || payments[0]?.customerName}
          visible={receiveModal}
          onClose={() => setReceiveModal(false)}
          onSuccess={refreshAll}
        />
      )}

      {/* Apply credit modal */}
      <ApplyCreditModal
        payment={applyRecord}
        visible={applyModal}
        onClose={() => setApplyModal(false)}
        onSuccess={refreshAll}
      />

      {/* Detail modal */}
      <PaymentDetailsModal
        payment={detailRecord}
        visible={detailModal}
        onClose={() => setDetailModal(false)}
        onPrint={handlePrint}
      />

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
            <Input prefix={cSym} type="number" min={0} step="0.01" />
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
    </>
  );
};

export default CustomerPaymentHistory;