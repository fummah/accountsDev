import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, DatePicker, Input, InputNumber, message } from 'antd';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const CreditCardCharges = () => {
  const { symbol: cSym } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form] = Form.useForm();

  const columns = [
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Card', dataIndex: 'card', key: 'card' },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: a => `${cSym} ${Number(a||0).toFixed(2)}` },
  ];

  const loadCharges = async () => {
    setLoading(true);
    try {
      const txs = await window.electronAPI.getTransactions();
      // filter transactions with type 'Credit Card' (case-insensitive)
      const charges = Array.isArray(txs) ? txs.filter(t => (t.type || '').toLowerCase().includes('credit')) : [];
      // map to table rows
      setData(charges.map(t => ({
        key: t.id,
        date: t.date,
        card: t.reference || '',
        description: t.description,
        amount: t.amount || t.credit || 0,
      })));
    } catch (err) {
      console.error('Failed to load credit charges', err);
      message.error('Failed to load credit charges');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCharges(); }, []);

  const handleAdd = () => setShowModal(true);

  const handleCreate = async (values) => {
    try {
      setLoading(true);
      const date = values.date ? values.date.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD');
      const description = values.description || '';
      const amount = Number(values.amount) || 0;
      // Use reference to store card masked number
      const tx = {
        date,
        type: 'Credit Card',
        amount,
        description,
        reference: values.card || '',
        entered_by: 'system',
      };

      const res = await window.electronAPI.insertTransaction(tx);
      // sqlite run returns an object with changes; accept truthy response
      if (res && (res.changes > 0 || res.success)) {
        message.success('Credit charge added');
        setShowModal(false);
        form.resetFields();
        await loadCharges();
      } else {
        // Some handlers return the raw result object
        message.error('Failed to add credit charge');
      }
    } catch (err) {
      console.error('Error adding credit charge', err);
      message.error('Error adding credit charge');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Credit Card Charges">
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={handleAdd}>Add Charge</Button>
      </div>
      <Table columns={columns} dataSource={data} loading={loading} pagination={{ pageSize: 20, showSizeChanger: true }} />

      <Modal
        title="Add Credit Card Charge"
        visible={showModal}
        onCancel={() => { setShowModal(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText="Add"
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="date" label="Date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="card" label="Card (masked)">
            <Input placeholder="**** 1234" />
          </Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Please enter amount' }]}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default CreditCardCharges;