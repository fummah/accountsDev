import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Form, DatePicker, Input, InputNumber, Select, Button, message, Row, Col, Typography, Divider, Table, Tag, Alert, Spin } from 'antd';
import { DollarOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';
import AccountSelect from '../../shared/AccountSelect';
import FormSection, { FORM_ITEM_STYLE } from '../../shared/FormSection';

const { Text } = Typography;
const { Option } = Select;

const METHODS = ['Bank Transfer', 'Cash', 'Check', 'Credit Card', 'EFT/ACH', 'Online', 'Original Method', 'Other'];
const REASONS = ['Returned Goods', 'Service Cancellation', 'Price Adjustment', 'Duplicate Charge', 'Goodwill', 'Overpayment', 'Other'];

/**
 * RefundPaymentModal — refund money the customer actually paid. The ORIGINAL
 * payment is never changed; a NEW refund transaction is created and linked.
 */
const RefundPaymentModal = ({ payment, customerId, customerName, visible, onClose, onSuccess }) => {
  const { symbol: cSym } = useCurrency();
  const [form] = Form.useForm();
  const [info, setInfo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState([]);

  const money = (v) => `${cSym} ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const amount = Form.useWatch('amount', form);

  const loadInfo = useCallback(async () => {
    if (!payment) return;
    setLoading(true);
    try {
      const i = await window.electronAPI.customerRefundable?.(payment.id);
      setInfo(i && !i.error ? i : null);
    } catch { setInfo(null); }
    finally { setLoading(false); }
  }, [payment]);

  useEffect(() => {
    (async () => {
      try {
        const accs = await window.electronAPI.getChartOfAccounts?.();
        setAccounts(Array.isArray(accs) ? accs : (accs?.data || []));
      } catch { setAccounts([]); }
    })();
  }, []);

  useEffect(() => {
    if (visible && payment) {
      loadInfo();
      form.resetFields();
      form.setFieldsValue({ date: moment(), amount: undefined, method: payment.paymentMethod || 'Original Method', reason: undefined });
      setPreview(null);
    }
  }, [visible, payment, form, loadInfo]);

  // Live allocation preview.
  useEffect(() => {
    let alive = true;
    (async () => {
      const amt = Number(amount) || 0;
      if (!payment || amt <= 0) { setPreview(null); return; }
      try {
        const p = await window.electronAPI.customerRefundPreview?.(payment.id, amt);
        if (alive) setPreview(p && !p.error ? p : null);
      } catch { if (alive) setPreview(null); }
    })();
    return () => { alive = false; };
  }, [amount, payment]);

  const handleOk = async () => {
    try {
      const vals = await form.validateFields();
      const amt = Number(vals.amount) || 0;
      if (info && amt > Number(info.refundable) + 0.005) { message.error(`Maximum refundable is ${money(info.refundable)}`); return; }
      setSaving(true);
      const res = await window.electronAPI.customerRefundCreate?.({
        paymentId: payment.id,
        customerId: customerId || payment.customerId,
        amount: amt,
        date: vals.date ? vals.date.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD'),
        method: vals.method || null,
        bankAccountId: vals.bankAccountId,
        reference: vals.reference || null,
        reason: vals.reason || null,
        memo: vals.memo || null,
      });
      if (!res || res.success === false || res.error) { message.error(res?.error || 'Refund failed'); return; }
      message.success(`Refund ${res.refund_number || ''} processed`);
      onSuccess && onSuccess();
      onClose && onClose();
    } catch (e) { if (!e?.errorFields) message.error(e?.message || 'Refund failed'); }
    finally { setSaving(false); }
  };

  const thisRefund = Number(amount) || 0;
  const previouslyRefunded = Number(info?.refunded) || 0;
  const original = Number(info?.paymentAmount) || Number(payment?.amount) || 0;
  const remaining = Math.max(0, original - previouslyRefunded - thisRefund);

  const allocRows = (preview?.invoices || []).map(i => ({ key: `inv-${i.invoiceId}`, target: i.invoiceNumber, amount: i.refundAmount }));
  if (preview && preview.fromUnapplied > 0.005) allocRows.unshift({ key: 'unapplied', target: 'Unapplied credit', amount: preview.fromUnapplied });

  return (
    <Modal
      title={<span><DollarOutlined style={{ marginRight: 8 }} />Refund Payment {payment ? `PMT-${String(payment.id).padStart(5, '0')}` : ''}</span>}
      visible={visible}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={saving}
      okText="Process Refund"
      width={720}
      destroyOnClose
    >
      <Spin spinning={loading}>
        <Form form={form} layout="vertical" preserve={false}>
          <FormSection title="Refund Details" icon={<DollarOutlined />}>
            <Row gutter={16}>
              <Col span={12}><Form.Item label="Customer" style={FORM_ITEM_STYLE}><Text strong>{customerName || payment?.customerName || '-'}</Text></Form.Item></Col>
              <Col span={12}><Form.Item label="Original Payment" style={FORM_ITEM_STYLE}><Text strong>{payment ? `PMT-${String(payment.id).padStart(5, '0')}` : '-'} · {payment?.date ? moment(payment.date).format('MM/DD/YYYY') : '-'} · {money(original)}</Text></Form.Item></Col>
            </Row>
            <Row gutter={16}>
              <Col span={8}><Form.Item label="Already Refunded" style={FORM_ITEM_STYLE}><Text>{money(previouslyRefunded)}</Text></Form.Item></Col>
              <Col span={8}><Form.Item label="Available to Refund" style={FORM_ITEM_STYLE}><Text strong style={{ color: '#52c41a' }}>{money(info?.refundable || 0)}</Text></Form.Item></Col>
              <Col span={8}>
                <Form.Item name="date" label="Refund Date" style={FORM_ITEM_STYLE} rules={[{ required: true }]}>
                  <DatePicker style={{ width: '100%' }} format="MM/DD/YYYY" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="amount" label="Refund Amount" style={FORM_ITEM_STYLE} rules={[{ required: true, message: 'Enter refund amount' }]}>
                  <InputNumber style={{ width: '100%' }} min={0} max={info?.refundable || undefined} precision={2} prefix={cSym} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="method" label="Refund Method" style={FORM_ITEM_STYLE}>
                  <Select allowClear placeholder="Select method">{METHODS.map(m => <Option key={m} value={m}>{m}</Option>)}</Select>
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="bankAccountId" label="Bank / Cash Account" style={FORM_ITEM_STYLE} rules={[{ required: true, message: 'Select the refund source account' }]}>
                  <AccountSelect accounts={accounts} allowedTypes={['Bank', 'Cash']} placeholder="Select bank / cash account" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="reason" label="Reason" style={FORM_ITEM_STYLE}>
                  <Select allowClear placeholder="Select reason">{REASONS.map(r => <Option key={r} value={r}>{r}</Option>)}</Select>
                </Form.Item>
              </Col>
              <Col span={8}><Form.Item name="reference" label="Reference" style={FORM_ITEM_STYLE}><Input placeholder="Refund / bank reference" /></Form.Item></Col>
              <Col span={8}><Form.Item name="memo" label="Memo" style={FORM_ITEM_STYLE}><Input placeholder="Optional note" /></Form.Item></Col>
            </Row>
          </FormSection>

          <FormSection title="Allocation Impact" icon={<DollarOutlined />}>
            {preview && allocRows.length > 0 ? (
              <Table size="small" rowKey="key" pagination={false} dataSource={allocRows}
                columns={[
                  { title: 'Unwinds', dataIndex: 'target', key: 'target' },
                  { title: 'Refund Amount', dataIndex: 'amount', key: 'amount', align: 'right', render: v => money(v) },
                ]} />
            ) : (
              <Text type="secondary">Enter a refund amount to preview what settlement will be unwound.</Text>
            )}
          </FormSection>

          <Divider style={{ margin: '8px 0' }} />
          <Row gutter={12}>
            <Col span={6}><Text type="secondary">Original Payment</Text><div><Text strong>{money(original)}</Text></div></Col>
            <Col span={6}><Text type="secondary">Previously Refunded</Text><div><Text strong>-{money(previouslyRefunded)}</Text></div></Col>
            <Col span={6}><Text type="secondary">This Refund</Text><div><Text strong style={{ color: '#cf1322' }}>-{money(thisRefund)}</Text></div></Col>
            <Col span={6}><Text type="secondary">Remaining Refundable</Text><div><Text strong>{money(remaining)}</Text></div></Col>
          </Row>

          <Alert
            type="info" showIcon style={{ marginTop: 12, borderRadius: 8 }}
            message="Accounting: Dr Accounts Receivable / Cr Bank (money out). The original payment is preserved; a new refund transaction is created and linked to it."
          />
        </Form>
      </Spin>
    </Modal>
  );
};

export default RefundPaymentModal;
