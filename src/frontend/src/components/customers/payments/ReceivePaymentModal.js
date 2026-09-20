import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Form, Select, DatePicker, Input, InputNumber, Table, Checkbox, Button, Space, Row, Col, Tag, Divider, message, Typography, Spin } from 'antd';
import { CheckCircleOutlined, WalletOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';
import { dedupeAccounts } from '../../../utils/accounts';
import AccountSelect from '../../shared/AccountSelect';

const { Option } = Select;
const { Text } = Typography;

const METHODS = ['Bank Transfer', 'Cash', 'Check', 'Credit Card', 'EFT/ACH', 'Online', 'Other'];

const fmt = (v, cSym = '$') => {
  const n = Number(v || 0);
  return cSym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/* ─── ReceivePaymentModal ────────────────────────────────────────────────────
   Customer-aware "Receive Payment" modal. Lets the user enter a payment and
   apply it to any number of the customer's outstanding invoices. Any amount
   not applied becomes an unapplied credit. */
const ReceivePaymentModal = ({ customerId, customerName, visible, onClose, onSuccess }) => {
  const { symbol: cSym } = useCurrency();
  const [form] = Form.useForm();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [alloc, setAlloc] = useState({});
  const [amount, setAmount] = useState(0);
  const [userTouched, setUserTouched] = useState(false);

  const loadOutstanding = async () => {
    setLoading(true);
    try {
      const res = await window.electronAPI?.getUnpaidInvoices?.(Number(customerId)) || [];
      const rows = (Array.isArray(res) ? res : []).map(inv => ({
        id: inv.id,
        number: inv.number || `#${inv.id}`,
        date: inv.start_date || inv.last_date || inv.date || null,
        total: Number(inv.total || inv.amount || 0),
        balance: Number(inv.balance || inv.total || 0),
      }));
      setInvoices(rows);
    } catch (e) {
      message.error('Failed to load outstanding invoices');
    }
    setLoading(false);
  };

  const loadAccounts = async () => {
    try {
      const res = await window.electronAPI?.getChartOfAccounts?.() || [];
      const arr = Array.isArray(res) ? res : (res?.accounts || res?.all || []);
      let list = dedupeAccounts(arr.filter(a => a.type === 'Asset' || String(a.type || '').toLowerCase().includes('bank')));
      if (!list.some(a => (a.name || a.accountName) === 'Undeposited Funds')) {
        list = [{ id: 0, name: 'Undeposited Funds' }, ...list];
      }
      setAccounts(list);
    } catch (e) { /* ignore account list errors */ }
  };

  useEffect(() => {
    if (!visible) return;
    form.setFieldsValue({
      date: moment(),
      paymentMethod: 'Bank Transfer',
      depositTo: 0,
      reference: '',
      memo: '',
    });
    setAlloc({});
    setAmount(0);
    setUserTouched(false);
    loadOutstanding();
    loadAccounts();
  }, [visible]);

  const totalApplied = useMemo(() =>
    Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0), [alloc]);

  const unapplied = Math.max(0, (Number(amount) || 0) - totalApplied);
  const insufficient = (Number(amount) || 0) < totalApplied - 0.005;

  const handleCheck = (invoice, checked) => {
    const next = { ...alloc };
    if (checked) next[invoice.id] = invoice.balance;
    else delete next[invoice.id];
    setAlloc(next);
    const sum = Object.values(next).reduce((s, v) => s + (Number(v) || 0), 0);
    if (!userTouched) setAmount(Number(sum.toFixed(2)));
  };

  const handleApplyChange = (invoiceId, val) => {
    const next = { ...alloc };
    if (val > 0) next[invoiceId] = Number(val);
    else delete next[invoiceId];
    setAlloc(next);
    const sum = Object.values(next).reduce((s, v) => s + (Number(v) || 0), 0);
    if (!userTouched) setAmount(Number(sum.toFixed(2)));
  };

  const handleAmountChange = (v) => {
    setUserTouched(true);
    setAmount(v || 0);
  };

  const handleSubmit = async () => {
    try {
      const vals = await form.validateFields();
      const allocations = Object.entries(alloc)
        .filter(([, v]) => Number(v) > 0)
        .map(([id, v]) => ({ invoiceId: Number(id), amount: Number(v) }));
      if (insufficient) {
        message.error('Payment amount cannot be less than the amount applied to invoices');
        return;
      }
      if ((Number(amount) || 0) <= 0) {
        message.error('Enter a payment amount greater than zero');
        return;
      }
      setSaving(true);
      const res = await window.electronAPI?.customerPaymentCreate?.({
        customerId: Number(customerId),
        amount: Number(amount) || 0,
        paymentMethod: vals.paymentMethod,
        date: vals.date ? vals.date.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD'),
        reference: vals.reference || null,
        depositTo: vals.depositTo || null,
        memo: vals.memo || null,
        allocations,
      });
      if (res?.success) {
        message.success('Payment recorded');
        onClose();
        onSuccess && onSuccess();
      } else {
        message.error(res?.error || 'Failed to record payment');
      }
    } catch (e) { /* validation */ }
    setSaving(false);
  };

  const invoiceColumns = [
    {
      title: '', key: 'check', width: 40,
      render: (_, r) => (
        <Checkbox
          checked={!!alloc[r.id]}
          onChange={e => handleCheck(r, e.target.checked)}
        />
      ),
    },
    {
      title: 'Invoice', dataIndex: 'number', key: 'number', width: 120,
      render: v => <Text strong>{v}</Text>,
    },
    {
      title: 'Date', dataIndex: 'date', key: 'date', width: 100,
      render: v => v ? moment(v).format('MM/DD/YYYY') : <Text type="secondary">—</Text>,
    },
    {
      title: 'Invoice Total', dataIndex: 'total', key: 'total', align: 'right', width: 120,
      render: v => fmt(v, cSym),
    },
    {
      title: 'Remaining', dataIndex: 'balance', key: 'balance', align: 'right', width: 120,
      render: v => <Text style={{ color: v > 0 ? '#fa541c' : '#52c41a' }}>{fmt(v, cSym)}</Text>,
    },
    {
      title: 'Apply', key: 'apply', align: 'right', width: 120,
      render: (_, r) => (
        <InputNumber
          min={0}
          max={r.balance}
          precision={2}
          disabled={!alloc[r.id]}
          value={alloc[r.id] || 0}
          onChange={v => handleApplyChange(r.id, v)}
          style={{ width: '100%' }}
        />
      ),
    },
  ];

  return (
    <Modal
      title={<span><WalletOutlined style={{ marginRight: 8, color: '#1890ff' }} />Receive Payment</span>}
      visible={visible}
      onOk={handleSubmit}
      onCancel={() => onClose()}
      okText="Record Payment"
      confirmLoading={saving}
      width={760}
      okButtonProps={{ disabled: insufficient }}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', columnGap: 16 }}>
          <Form.Item label="Customer">
            <Input value={customerName || `Customer #${customerId}`} readOnly />
          </Form.Item>
          <Form.Item name="date" label="Payment Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Payment Amount" required>
            <InputNumber
              prefix={cSym}
              min={0.01}
              precision={2}
              value={amount}
              onChange={handleAmountChange}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="paymentMethod" label="Payment Method" rules={[{ required: true }]}>
            <Select>
              {METHODS.map(m => <Option key={m} value={m}>{m}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="reference" label="Reference / Check #">
            <Input placeholder="Check #, reference, transaction ID" />
          </Form.Item>
          <Form.Item name="depositTo" label="Deposit To">
            <AccountSelect
              accounts={accounts}
              placeholder="Select bank account"
            />
          </Form.Item>
        </div>
        <Form.Item name="memo" label="Memo">
          <Input placeholder="Optional note" />
        </Form.Item>
      </Form>

      <Divider style={{ margin: '8px 0 12px' }}>Outstanding Invoices</Divider>

      <Spin spinning={loading}>
        {invoices.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '12px 0' }}>
            No outstanding invoices for this customer.
          </div>
        ) : (
          <Table
            columns={invoiceColumns}
            dataSource={invoices}
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ x: 600 }}
          />
        )}
      </Spin>

      <Row justify="space-between" align="middle" style={{ marginTop: 16 }}>
        <Col>
          <Space size={24}>
            <Text type="secondary">Total Applied: <Text strong>{fmt(totalApplied, cSym)}</Text></Text>
            <Text type="secondary">Payment: <Text strong>{fmt(amount, cSym)}</Text></Text>
            <Text type="secondary">
              Unapplied:{' '}
              {insufficient
                ? <Text type="danger" strong>{fmt(-(Number(amount) - totalApplied), cSym)}</Text>
                : <Text strong style={{ color: unapplied > 0 ? '#faad14' : '#52c41a' }}>
                    {fmt(unapplied, cSym)}
                  </Text>}
            </Text>
          </Space>
        </Col>
        {unapplied > 0 && (
          <Col>
            <Tag icon={<CheckCircleOutlined />} color="gold">Unapplied amount becomes a credit</Tag>
          </Col>
        )}
      </Row>
    </Modal>
  );
};

export default ReceivePaymentModal;
