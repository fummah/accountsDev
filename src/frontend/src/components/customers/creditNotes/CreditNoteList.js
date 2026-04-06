import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Tag, Modal, Form, Input, InputNumber, Select, DatePicker, message, Popconfirm, Space } from 'antd';
import { PlusOutlined, DeleteOutlined, CheckCircleOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';

const CreditNoteList = () => {
  const { symbol: cSym } = useCurrency();
  const [creditNotes, setCreditNotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [applyModal, setApplyModal] = useState({ visible: false, cnId: null });
  const [form] = Form.useForm();
  const [lines, setLines] = useState([{ description: '', quantity: 1, unit_price: 0, amount: 0, tax_rate: 0 }]);

  const load = async () => {
    setLoading(true);
    try {
      const [cns, custsRaw] = await Promise.all([
        window.electronAPI.creditNotesList?.() || [],
        window.electronAPI.getAllCustomers?.() || []
      ]);
      setCreditNotes(Array.isArray(cns) ? cns : []);
      const custsArr = Array.isArray(custsRaw) ? custsRaw : (custsRaw?.all || []);
      setCustomers(custsArr);
    } catch (e) {
      message.error(e?.message || 'Failed to load');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const loadInvoices = async () => {
    try {
      const inv = await window.electronAPI.getInvoicesPaginated?.(1, 500) || {};
      setInvoices(Array.isArray(inv.data) ? inv.data : []);
    } catch {}
  };

  const updateLineAmount = (idx) => {
    setLines(prev => {
      const updated = [...prev];
      updated[idx].amount = (Number(updated[idx].quantity) || 0) * (Number(updated[idx].unit_price) || 0);
      return updated;
    });
  };

  const addLine = () => setLines(prev => [...prev, { description: '', quantity: 1, unit_price: 0, amount: 0, tax_rate: 0 }]);
  const removeLine = (idx) => setLines(prev => prev.filter((_, i) => i !== idx));

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const data = {
        customer_id: values.customer_id,
        customer_name: customers.find(c => c.id === values.customer_id)?.display_name || customers.find(c => c.id === values.customer_id)?.customer_name || '',
        date: values.date ? values.date.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD'),
        reason: values.reason,
        notes: values.notes,
        status: 'Draft'
      };
      const result = await window.electronAPI.creditNoteCreate?.(data, lines);
      if (result?.success) {
        message.success(`Credit Note ${result.credit_note_number} created`);
        setModalVisible(false);
        form.resetFields();
        setLines([{ description: '', quantity: 1, unit_price: 0, amount: 0, tax_rate: 0 }]);
        load();
      } else {
        message.error(result?.error || 'Failed to create');
      }
    } catch (e) {
      if (e?.errorFields) return;
      message.error(e?.message || 'Error');
    }
  };

  const handleDelete = async (id) => {
    try {
      const result = await window.electronAPI.creditNoteDelete?.(id);
      if (result?.success) { message.success('Deleted'); load(); }
      else message.error(result?.error || 'Failed');
    } catch (e) { message.error(e?.message || 'Error'); }
  };

  const handleApply = async () => {
    if (!applyModal.cnId || !applyModal.invoiceId) return;
    try {
      const result = await window.electronAPI.creditNoteApply?.(applyModal.cnId, applyModal.invoiceId);
      if (result?.success) {
        message.success('Credit note applied to invoice');
        setApplyModal({ visible: false, cnId: null, invoiceId: null });
        load();
      } else {
        message.error(result?.error || 'Failed');
      }
    } catch (e) { message.error(e?.message || 'Error'); }
  };

  const statusColor = { Draft: 'default', Issued: 'blue', Applied: 'green', Void: 'red' };

  const columns = [
    { title: '#', dataIndex: 'credit_note_number', key: 'num', width: 100 },
    { title: 'Customer', dataIndex: 'customer_name', key: 'cust' },
    { title: 'Date', dataIndex: 'date', key: 'date', width: 110 },
    { title: 'Reason', dataIndex: 'reason', key: 'reason', ellipsis: true },
    { title: 'Total', dataIndex: 'total', key: 'total', width: 100, render: v => `${cSym} ${(Number(v) || 0).toFixed(2)}` },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 90, render: s => <Tag color={statusColor[s] || 'default'}>{s}</Tag> },
    { title: 'Actions', key: 'actions', width: 180, render: (_, r) => (
      <Space>
        {r.status === 'Draft' && (
          <Button size="small" icon={<CheckCircleOutlined />} onClick={() => { setApplyModal({ visible: true, cnId: r.id, invoiceId: null }); loadInvoices(); }}>Apply</Button>
        )}
        <Popconfirm title="Delete this credit note?" onConfirm={() => handleDelete(r.id)} okText="Yes">
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    )},
  ];

  return (
    <div className="gx-p-4">
      <Card title="Credit Notes / Refunds" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>New Credit Note</Button>}>
        <Table dataSource={creditNotes} columns={columns} rowKey="id" loading={loading} size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} records` }} />
      </Card>

      <Modal title="Create Credit Note" open={modalVisible} onOk={handleCreate} onCancel={() => setModalVisible(false)} width={700} okText="Create">
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="customer_id" label="Customer" rules={[{ required: true, message: 'Select customer' }]}>
            <Select showSearch optionFilterProp="children" placeholder="Select customer">
              {customers.map(c => <Select.Option key={c.id} value={c.id}>{c.display_name || c.customer_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="date" label="Date" initialValue={moment()}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reason" label="Reason">
            <Select placeholder="Select reason">
              <Select.Option value="Return">Product Return</Select.Option>
              <Select.Option value="Overcharge">Overcharge Correction</Select.Option>
              <Select.Option value="Discount">Post-Sale Discount</Select.Option>
              <Select.Option value="Defective">Defective Goods</Select.Option>
              <Select.Option value="Other">Other</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>

        <div style={{ marginTop: 8 }}>
          <strong>Line Items</strong>
          {lines.map((line, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
              <Input placeholder="Description" value={line.description} onChange={e => { const v = e.target.value; setLines(p => { const u = [...p]; u[idx].description = v; return u; }); }} style={{ flex: 2 }} />
              <InputNumber min={0} value={line.quantity} onChange={v => { setLines(p => { const u = [...p]; u[idx].quantity = v; return u; }); updateLineAmount(idx); }} style={{ width: 70 }} placeholder="Qty" />
              <InputNumber min={0} value={line.unit_price} onChange={v => { setLines(p => { const u = [...p]; u[idx].unit_price = v; return u; }); updateLineAmount(idx); }} style={{ width: 100 }} placeholder="Price" />
              <span style={{ width: 80, textAlign: 'right' }}>${(line.amount || 0).toFixed(2)}</span>
              {lines.length > 1 && <Button size="small" danger onClick={() => removeLine(idx)}>X</Button>}
            </div>
          ))}
          <Button type="dashed" size="small" onClick={addLine} style={{ marginTop: 8 }}>+ Add Line</Button>
          <div style={{ marginTop: 8, textAlign: 'right', fontWeight: 'bold' }}>
            Total: ${lines.reduce((s, l) => s + (Number(l.amount) || 0), 0).toFixed(2)}
          </div>
        </div>
      </Modal>

      <Modal title="Apply Credit Note to Invoice" open={applyModal.visible} onOk={handleApply} onCancel={() => setApplyModal({ visible: false, cnId: null, invoiceId: null })} okText="Apply">
        <Select placeholder="Select invoice to apply credit" style={{ width: '100%' }}
          value={applyModal.invoiceId} onChange={v => setApplyModal(p => ({ ...p, invoiceId: v }))}>
          {invoices.map(inv => (
            <Select.Option key={inv.id} value={inv.id}>INV-{inv.number || inv.id} — {inv.customer} — ${Number(inv.total || 0).toFixed(2)}</Select.Option>
          ))}
        </Select>
      </Modal>
    </div>
  );
};

export default CreditNoteList;
