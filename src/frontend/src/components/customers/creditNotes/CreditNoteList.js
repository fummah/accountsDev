import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Tag, Modal, Form, Input, InputNumber, Select, DatePicker, message, Popconfirm, Space } from 'antd';
import { PlusOutlined, DeleteOutlined, CheckCircleOutlined, EditOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';

const CreditNoteList = () => {
  const { symbol: cSym } = useCurrency();
  const [creditNotes, setCreditNotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
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

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    setLines([{ description: '', quantity: 1, unit_price: 0, amount: 0, tax_rate: 0 }]);
    setModalVisible(true);
  };

  const openEdit = async (record) => {
    try {
      setLoading(true);
      const cn = await window.electronAPI.creditNoteGet?.(record.id);
      if (!cn || cn.error) { message.error('Failed to load credit note'); return; }
      setEditingId(cn.id);
      form.setFieldsValue({
        customer_id: cn.customer_id,
        date: cn.date ? moment(cn.date) : moment(),
        reason: cn.reason || '',
        notes: cn.notes || '',
      });
      if (cn.lines && cn.lines.length > 0) {
        setLines(cn.lines.map(l => ({
          id: l.id || Date.now(),
          description: l.description || '',
          quantity: Number(l.quantity || 1),
          unit_price: Number(l.unit_price || 0),
          amount: Number(l.amount || 0),
          tax_rate: Number(l.tax_rate || 0),
        })));
      } else {
        setLines([{ description: '', quantity: 1, unit_price: 0, amount: 0, tax_rate: 0 }]);
      }
      setModalVisible(true);
    } catch { message.error('Failed to load credit note'); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const data = {
        customer_id: values.customer_id,
        customer_name: customers.find(c => c.id === values.customer_id)?.display_name || customers.find(c => c.id === values.customer_id)?.customer_name || '',
        date: values.date ? values.date.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD'),
        reason: values.reason,
        notes: values.notes,
      };
      let result;
      if (editingId) {
        result = await window.electronAPI.creditNoteUpdate?.(editingId, data, lines);
      } else {
        result = await window.electronAPI.creditNoteCreate?.(data, lines);
      }
      if (result?.success) {
        message.success(editingId ? 'Credit Note updated' : `Credit Note ${result.credit_note_number} created`);
        setModalVisible(false);
        setEditingId(null);
        form.resetFields();
        setLines([{ description: '', quantity: 1, unit_price: 0, amount: 0, tax_rate: 0 }]);
        load();
      } else {
        message.error(result?.error || 'Failed to save');
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
    { title: 'Actions', key: 'actions', width: 220, render: (_, r) => (
      <Space>
        {(r.status === 'Draft' || r.status === 'Issued') && (
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button>
        )}
        {r.status === 'Draft' && (
          <Button size="small" icon={<CheckCircleOutlined />} onClick={() => { setApplyModal({ visible: true, cnId: r.id, invoiceId: null }); loadInvoices(); }}>Apply</Button>
        )}
        {(r.status === 'Draft' || r.status === 'Issued') && (
          <Popconfirm title="Delete this credit note?" onConfirm={() => handleDelete(r.id)} okText="Yes">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        )}
      </Space>
    )},
  ];

  return (
    <div className="gx-p-4">
      <Card title="Credit Notes / Refunds" extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New Credit Note</Button>}>
        <Table dataSource={creditNotes} columns={columns} rowKey="id" loading={loading} size="small"
          pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} records` }} />
      </Card>

      <Modal title={editingId ? 'Edit Credit Note' : 'Create Credit Note'} open={modalVisible} onOk={handleSave} onCancel={() => { setModalVisible(false); setEditingId(null); }} width={700} okText={editingId ? 'Update' : 'Create'}>
        <Form form={form} layout="vertical">
          <Form.Item name="customer_id" label="Customer" rules={[{ required: true }]}>
            <Select showSearch placeholder="Select customer" optionFilterProp="children">
              {customers.map(c => <Select.Option key={c.id} value={c.id}>{c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="date" label="Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reason" label="Reason">
            <Input placeholder="Reason for credit" />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>

        <div style={{ fontWeight: 600, marginBottom: 8 }}>Line Items</div>
        {lines.map((line, idx) => (
          <div key={line.id || idx} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
            <Input placeholder="Description" value={line.description} onChange={e => { const u = [...lines]; u[idx].description = e.target.value; setLines(u); }} style={{ flex: 2 }} />
            <InputNumber placeholder="Qty" value={line.quantity} min={0} onChange={v => { const u = [...lines]; u[idx].quantity = v || 0; updateLineAmount(idx); }} style={{ width: 70 }} />
            <InputNumber placeholder="Price" value={line.unit_price} min={0} step={0.01} onChange={v => { const u = [...lines]; u[idx].unit_price = v || 0; updateLineAmount(idx); }} style={{ width: 100 }} prefix={cSym} />
            <InputNumber placeholder="Amount" value={line.amount} readOnly style={{ width: 100 }} prefix={cSym} />
            <InputNumber placeholder="Tax %" value={line.tax_rate} min={0} max={100} onChange={v => { const u = [...lines]; u[idx].tax_rate = v || 0; setLines(u); }} style={{ width: 80 }} suffix="%" />
            {lines.length > 1 && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeLine(idx)} />}
          </div>
        ))}
        <Button type="dashed" block onClick={addLine} icon={<PlusOutlined />}>Add Line</Button>
      </Modal>

      <Modal title="Apply Credit Note" open={applyModal.visible} onOk={handleApply} onCancel={() => setApplyModal({ visible: false, cnId: null, invoiceId: null })} okText="Apply">
        <Select placeholder="Select invoice" showSearch optionFilterProp="children" value={applyModal.invoiceId} onChange={v => setApplyModal(p => ({ ...p, invoiceId: v }))} style={{ width: '100%' }}>
          {invoices.map(inv => <Select.Option key={inv.id} value={inv.id}>#{inv.invoice_number} - {inv.customer_name || ''} - ${(Number(inv.total) || 0).toFixed(2)}</Select.Option>)}
        </Select>
      </Modal>
    </div>
  );
};

export default CreditNoteList;
