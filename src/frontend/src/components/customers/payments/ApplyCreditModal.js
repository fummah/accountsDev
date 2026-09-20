import React, { useState, useEffect } from 'react';
import { Modal, Form, Select, InputNumber, Table, Radio, Button, Tag, message, Typography, Spin } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';

const { Text } = Typography;
const { Option } = Select;

const fmt = (v, cSym = '$') => {
  const n = Number(v || 0);
  return cSym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/* ─── ApplyCreditModal ───────────────────────────────────────────────────────
   Apply an unapplied payment (credit) to one of the customer's outstanding
   invoices. The payment record and its GL entry are untouched; only the
   allocation + invoice balance/status change. */
const ApplyCreditModal = ({ payment, visible, onClose, onSuccess }) => {
  const { symbol: cSym } = useCurrency();
  const [form] = Form.useForm();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const available = Math.max(0, Number(payment?.unapplied || 0));
  const selected = invoices.find(i => i.id === selectedId);
  const maxApply = Math.min(available, Number(selected?.balance || 0));

  useEffect(() => {
    if (!visible || !payment) return;
    form.setFieldsValue({ invoiceId: undefined, amount: undefined });
    setSelectedId(null);
    (async () => {
      setLoading(true);
      try {
        const res = await window.electronAPI?.getUnpaidInvoices?.(Number(payment.customerId)) || [];
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
    })();
  }, [visible, payment]);

  const handleSubmit = async () => {
    try {
      const vals = await form.validateFields();
      const amt = Number(vals.amount) || 0;
      if (amt <= 0) { message.error('Enter an amount to apply'); return; }
      setSaving(true);
      const res = await window.electronAPI?.customerPaymentApply?.(payment.id, vals.invoiceId, amt);
      if (res?.success) {
        message.success('Credit applied to invoice');
        onClose();
        onSuccess && onSuccess();
      } else {
        message.error(res?.error || 'Failed to apply credit');
      }
    } catch (e) { /* validation */ }
    setSaving(false);
  };

  const columns = [
    {
      title: '', key: 'sel', width: 44,
      render: (_, r) => <Radio checked={selectedId === r.id} onChange={() => setSelectedId(r.id)} />,
    },
    {
      title: 'Invoice', dataIndex: 'number', key: 'number', width: 130,
      render: v => <Text strong>{v}</Text>,
    },
    {
      title: 'Date', dataIndex: 'date', key: 'date', width: 110,
      render: v => v ? moment(v).format('MM/DD/YYYY') : <Text type="secondary">—</Text>,
    },
    {
      title: 'Total', dataIndex: 'total', key: 'total', align: 'right', width: 120,
      render: v => fmt(v, cSym),
    },
    {
      title: 'Remaining', dataIndex: 'balance', key: 'balance', align: 'right', width: 120,
      render: v => <Text style={{ color: v > 0 ? '#fa541c' : '#52c41a' }}>{fmt(v, cSym)}</Text>,
    },
  ];

  return (
    <Modal
      title={<span><LinkOutlined style={{ marginRight: 8, color: '#1890ff' }} />Apply Credit {payment ? `PMT-${String(payment.id).padStart(5, '0')}` : ''}</span>}
      visible={visible}
      onOk={handleSubmit}
      onCancel={() => onClose()}
      okText="Apply Credit"
      confirmLoading={saving}
      width={680}
    >
      {payment && (
        <>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary">
              Available unapplied credit:{' '}
              <Text strong style={{ color: '#faad14', fontSize: 16 }}>{fmt(available, cSym)}</Text>
            </Text>
          </div>

          <Spin spinning={loading}>
            {invoices.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#999', padding: '16px 0' }}>
                No outstanding invoices to apply this credit to.
              </div>
            ) : (
              <Table
                columns={columns}
                dataSource={invoices}
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ x: 500 }}
                onRow={r => ({ style: { cursor: 'pointer' }, onClick: () => setSelectedId(r.id) })}
              />
            )}
          </Spin>

          <Form form={form} layout="inline" style={{ marginTop: 16 }}>
            <Form.Item name="invoiceId" label="Apply to" rules={[{ required: true, message: 'Select an invoice' }]}>
              <Select
                style={{ minWidth: 240 }}
                placeholder="Select invoice"
                value={selectedId}
                onChange={setSelectedId}
              >
                {invoices.map(i => <Option key={i.id} value={i.id}>{i.number}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item
              name="amount"
              label="Amount"
              rules={[{ required: true, message: 'Enter amount' }]}
              extra={selected ? `Max: ${fmt(maxApply, cSym)}` : null}
            >
              <InputNumber
                prefix={cSym}
                min={0.01}
                max={Math.max(0.01, maxApply)}
                precision={2}
                style={{ width: 160 }}
              />
            </Form.Item>
            {available > 0 && (
              <Form.Item>
                <Button onClick={() => form.setFieldsValue({ amount: maxApply })} size="small">Max</Button>
              </Form.Item>
            )}
          </Form>
        </>
      )}
    </Modal>
  );
};

export default ApplyCreditModal;