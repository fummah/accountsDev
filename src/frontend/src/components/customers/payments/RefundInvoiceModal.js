import React, { useState, useEffect } from 'react';
import { Modal, Form, DatePicker, Input, InputNumber, Select, message, Row, Col, Typography, Divider, Alert, Checkbox, Spin } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';
import AccountSelect from '../../shared/AccountSelect';
import FormSection, { FORM_ITEM_STYLE } from '../../shared/FormSection';

const { Text } = Typography;
const { Option } = Select;

const REASONS = ['Returned Goods', 'Service Cancellation', 'Price Adjustment', 'Duplicate Charge', 'Goodwill', 'Other'];
const METHODS = ['Bank Transfer', 'Cash', 'Check', 'Credit Card', 'EFT/ACH', 'Online', 'Other'];

/**
 * RefundInvoiceModal — reduce an invoice via a Customer Credit (Credit Memo),
 * optionally returning cash immediately (which creates a linked CustomerRefund).
 * The original invoice is preserved; the credit and refund are new documents.
 */
const RefundInvoiceModal = ({ customerId, customerName, initialInvoiceId, visible, onClose, onSuccess }) => {
  const { symbol: cSym } = useCurrency();
  const [form] = Form.useForm();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const refundCash = Form.useWatch('refundCash', form);
  const invoiceId = Form.useWatch('invoiceId', form);

  const money = (v) => `${cSym} ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  useEffect(() => {
    (async () => {
      try {
        const accs = await window.electronAPI.getChartOfAccounts?.();
        setAccounts(Array.isArray(accs) ? accs : (accs?.data || []));
      } catch { setAccounts([]); }
    })();
  }, []);

  useEffect(() => {
    if (!visible || !customerId) return;
    setLoading(true);
    (async () => {
      try {
        const res = await window.electronAPI.getInvoicesPaginated?.(1, 200, '', '', null, null, null, null, customerId, false);
        const rows = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
        setInvoices(rows);
      } catch { setInvoices([]); }
      finally { setLoading(false); }
    })();
    form.resetFields();
    form.setFieldsValue({ date: moment(), refundCash: false, reason: 'Returned Goods', invoiceId: initialInvoiceId || undefined });
  }, [visible, customerId, form, initialInvoiceId]);

  const selectedInvoice = invoices.find(i => Number(i.id) === Number(invoiceId));
  const invoiceTotal = Number(selectedInvoice?.amount || selectedInvoice?.total || 0);

  const handleOk = async () => {
    try {
      const vals = await form.validateFields();
      const amt = Number(vals.amount) || 0;
      if (amt <= 0) { message.error('Enter a credit amount'); return; }
      if (invoiceTotal > 0 && amt > invoiceTotal + 0.005) { message.error(`Credit cannot exceed the invoice total (${money(invoiceTotal)})`); return; }
      setSaving(true);
      const res = await window.electronAPI.invoiceRefundCreate?.({
        invoiceId: vals.invoiceId,
        customerId,
        customerName,
        amount: amt,
        date: vals.date ? vals.date.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD'),
        reason: vals.reason || null,
        description: vals.description || null,
        memo: vals.memo || null,
        refundCash: !!vals.refundCash,
        bankAccountId: vals.refundCash ? vals.bankAccountId : undefined,
        method: vals.refundCash ? vals.method : undefined,
        reference: vals.refundCash ? vals.reference : undefined,
      });
      if (!res || res.success === false || res.error) { message.error(res?.error || 'Invoice refund failed'); return; }
      message.success(vals.refundCash ? 'Credit issued and cash refunded' : 'Customer credit issued');
      onSuccess && onSuccess();
      onClose && onClose();
    } catch (e) { if (!e?.errorFields) message.error(e?.message || 'Invoice refund failed'); }
    finally { setSaving(false); }
  };

  return (
    <Modal
      title={<span><FileTextOutlined style={{ marginRight: 8 }} />Refund / Credit an Invoice</span>}
      visible={visible}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={saving}
      okText={refundCash ? 'Issue Credit & Refund' : 'Issue Customer Credit'}
      width={720}
      destroyOnClose
    >
      <Spin spinning={loading}>
        <Form form={form} layout="vertical" preserve={false}>
          <FormSection title="Credit Details" icon={<FileTextOutlined />}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="invoiceId" label="Invoice" style={FORM_ITEM_STYLE} rules={[{ required: true, message: 'Select an invoice' }]}>
                  <Select showSearch optionFilterProp="children" placeholder="Select invoice">
                    {invoices.map(inv => (
                      <Option key={inv.id} value={inv.id}>{`${inv.number || `INV-${inv.id}`} · ${inv.status || ''} · ${money(inv.amount)}`}</Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}><Form.Item label="Customer" style={FORM_ITEM_STYLE}><Text strong>{customerName || '-'}</Text></Form.Item></Col>
            </Row>
            <Row gutter={16}>
              <Col span={8}><Form.Item label="Invoice Total" style={FORM_ITEM_STYLE}><Text strong>{money(invoiceTotal)}</Text></Form.Item></Col>
              <Col span={8}>
                <Form.Item name="amount" label="Credit Amount" style={FORM_ITEM_STYLE} rules={[{ required: true, message: 'Enter credit amount' }]}>
                  <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix={cSym} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="date" label="Date" style={FORM_ITEM_STYLE} rules={[{ required: true }]}>
                  <DatePicker style={{ width: '100%' }} format="MM/DD/YYYY" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="reason" label="Reason" style={FORM_ITEM_STYLE}>
                  <Select allowClear placeholder="Select reason">{REASONS.map(r => <Option key={r} value={r}>{r}</Option>)}</Select>
                </Form.Item>
              </Col>
              <Col span={16}><Form.Item name="description" label="Description" style={FORM_ITEM_STYLE}><Input placeholder="What is being credited" /></Form.Item></Col>
            </Row>
            <Form.Item name="memo" label="Memo" style={FORM_ITEM_STYLE}><Input placeholder="Optional note" /></Form.Item>
          </FormSection>

          <FormSection title="Return Money to Customer?" icon={<FileTextOutlined />}>
            <Form.Item name="refundCash" valuePropName="checked" style={FORM_ITEM_STYLE}>
              <Checkbox>Refund the credit in cash now (creates a linked Customer Refund)</Checkbox>
            </Form.Item>
            {refundCash && (
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="bankAccountId" label="Bank / Cash Account" style={FORM_ITEM_STYLE} rules={[{ required: true, message: 'Select the refund source account' }]}>
                    <AccountSelect accounts={accounts} allowedTypes={['Bank', 'Cash']} placeholder="Select bank / cash account" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="method" label="Refund Method" style={FORM_ITEM_STYLE}>
                    <Select allowClear placeholder="Select method">{METHODS.map(m => <Option key={m} value={m}>{m}</Option>)}</Select>
                  </Form.Item>
                </Col>
                <Col span={8}><Form.Item name="reference" label="Reference" style={FORM_ITEM_STYLE}><Input placeholder="Refund reference" /></Form.Item></Col>
              </Row>
            )}
          </FormSection>

          <Alert
            type="info" showIcon style={{ borderRadius: 8 }}
            message={refundCash
              ? 'Accounting: the credit memo posts Dr Income / Cr AR; the cash refund posts Dr AR / Cr Bank. Invoice, Credit and Refund stay traceable.'
              : 'Accounting: the credit memo posts Dr Income / Cr AR and leaves the amount as an available customer credit (no bank movement).'}
          />
          <Divider style={{ margin: '8px 0' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Inventory returns: use Inventory → Adjustments / Stock Levels to restock returned goods; this credit records the financial and tax reversal using the invoice's original amounts.
          </Text>
        </Form>
      </Spin>
    </Modal>
  );
};

export default RefundInvoiceModal;
