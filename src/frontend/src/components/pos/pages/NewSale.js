import React, { useEffect, useState } from 'react';
import { Card, Button, InputNumber, Select, Row, Col, Tag, Space, message, Alert, Divider, Empty } from 'antd';
import { PlusOutlined, DeleteOutlined, ShoppingCartOutlined, ArrowLeftOutlined, DollarOutlined, CreditCardOutlined, MobileOutlined } from '@ant-design/icons';
import { useHistory } from 'react-router-dom';

const { Option } = Select;

const NewSale = () => {
  const [session, setSession] = useState(null);
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState(null);
  const [paymentType, setPaymentType] = useState('cash');
  const [lines, setLines] = useState([{ itemId: null, quantity: 1, price: 0, name: '' }]);
  const [saving, setSaving] = useState(false);
  const history = useHistory();

  useEffect(() => {
    const load = async () => {
      try {
        const [s, it, cu] = await Promise.all([
          window.electronAPI.posGetOpenSession(),
          window.electronAPI.getItems?.(),
          window.electronAPI.getAllCustomers?.(),
        ]);
        setSession(s || null);
        setItems(Array.isArray(it) ? it : []);
        const custArr = Array.isArray(cu) ? cu : (cu?.all || []);
        setCustomers(custArr);
      } catch (e) { message.error(String(e?.message || e)); }
    };
    load();
  }, []);

  const setLine = (idx, field, value) => {
    const copy = [...lines];
    copy[idx] = { ...copy[idx], [field]: value };
    if (field === 'quantity' || field === 'price') {
      copy[idx].lineTotal = (Number(copy[idx].quantity) || 0) * (Number(copy[idx].price) || 0);
    }
    setLines(copy);
  };

  const selectItem = (idx, itemId) => {
    const item = items.find(i => i.id === itemId);
    const copy = [...lines];
    copy[idx] = {
      ...copy[idx],
      itemId,
      name: item?.name || '',
      price: Number(item?.unitPrice || item?.price || 0),
      lineTotal: (Number(copy[idx].quantity) || 1) * Number(item?.unitPrice || item?.price || 0),
    };
    setLines(copy);
  };

  const addLine = () => setLines([...lines, { itemId: null, quantity: 1, price: 0, name: '' }]);
  const removeLine = (idx) => setLines(lines.length > 1 ? lines.filter((_, i) => i !== idx) : lines);

  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.price) || 0), 0);
  const tax = 0;
  const total = subtotal + tax;

  const submit = async () => {
    if (!session?.id) { message.error('No open session — open a session first.'); return; }
    if (!lines.some(l => l.itemId)) { message.error('Please select at least one item'); return; }
    setSaving(true);
    try {
      const sale = { sessionId: session.id, customerId: customerId || null, subtotal, tax, total, paymentType };
      const cleanLines = lines.filter(l => l.itemId).map(l => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), price: Number(l.price) }));
      const res = await window.electronAPI.posCreateSale(sale, cleanLines);
      if (res?.success) {
        message.success(`Sale #${res.id} created successfully!`);
        setLines([{ itemId: null, quantity: 1, price: 0, name: '' }]);
        setCustomerId(null);
      } else {
        message.error(res?.error || 'Failed to create sale');
      }
    } catch (e) { message.error(String(e?.message || e)); }
    setSaving(false);
  };

  return (
    <div className="gx-p-4">
      <Card title={<span><ShoppingCartOutlined /> New Sale</span>}
        extra={<Button icon={<ArrowLeftOutlined />} onClick={() => history.push('/main/pos/session')}>Back to Session</Button>}>

        {!session ? (
          <Alert type="error" showIcon message="No active session" description="Please open a session before creating a sale." />
        ) : (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col xs={24} sm={12}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Customer (optional)</label>
                <Select allowClear showSearch optionFilterProp="children" value={customerId}
                  onChange={setCustomerId} style={{ width: '100%' }} placeholder="Walk-in Customer" size="large">
                  {customers.map(c => <Option key={c.id} value={c.id}>{c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email}</Option>)}
                </Select>
              </Col>
              <Col xs={24} sm={12}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Payment Method</label>
                <Select value={paymentType} onChange={setPaymentType} style={{ width: '100%' }} size="large">
                  <Option value="cash"><DollarOutlined /> Cash</Option>
                  <Option value="card"><CreditCardOutlined /> Card</Option>
                  <Option value="mobile"><MobileOutlined /> Mobile</Option>
                </Select>
              </Col>
            </Row>

            <Divider>Line Items</Divider>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th style={{ padding: '8px', textAlign: 'left', borderBottom: '2px solid #e8e8e8', minWidth: 200 }}>Product</th>
                    <th style={{ padding: '8px', textAlign: 'center', borderBottom: '2px solid #e8e8e8', width: 100 }}>Qty</th>
                    <th style={{ padding: '8px', textAlign: 'right', borderBottom: '2px solid #e8e8e8', width: 130 }}>Price (R)</th>
                    <th style={{ padding: '8px', textAlign: 'right', borderBottom: '2px solid #e8e8e8', width: 130 }}>Line Total</th>
                    <th style={{ padding: '8px', width: 50, borderBottom: '2px solid #e8e8e8' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '6px 8px' }}>
                        <Select showSearch optionFilterProp="children" value={l.itemId}
                          onChange={v => selectItem(idx, v)} style={{ width: '100%' }} placeholder="Select item">
                          {items.map(it => <Option key={it.id} value={it.id}>{it.name} {it.code ? `(${it.code})` : ''}</Option>)}
                        </Select>
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                        <InputNumber min={1} value={l.quantity} onChange={v => setLine(idx, 'quantity', v)} style={{ width: '100%' }} />
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                        <InputNumber min={0} value={l.price} onChange={v => setLine(idx, 'price', v)} style={{ width: '100%' }}
                          formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={v => v.replace(/,/g, '')} />
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: '#1890ff' }}>
                        R {((Number(l.quantity) || 0) * (Number(l.price) || 0)).toFixed(2)}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                        <Button size="small" type="link" danger icon={<DeleteOutlined />} onClick={() => removeLine(idx)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button type="dashed" icon={<PlusOutlined />} onClick={addLine} style={{ marginTop: 8, width: '100%' }}>Add Item</Button>

            <div style={{ marginTop: 16, padding: '16px 20px', background: '#fafafa', borderRadius: 8, textAlign: 'right' }}>
              <div style={{ fontSize: 14, marginBottom: 4 }}>Subtotal: <strong>R {subtotal.toFixed(2)}</strong></div>
              <div style={{ fontSize: 20, color: '#1890ff', fontWeight: 700 }}>Total: R {total.toFixed(2)}</div>
            </div>

            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Space>
                <Button size="large" onClick={() => { setLines([{ itemId: null, quantity: 1, price: 0, name: '' }]); setCustomerId(null); }}>
                  Clear
                </Button>
                <Button type="primary" size="large" icon={<ShoppingCartOutlined />}
                  onClick={submit} loading={saving} style={{ minWidth: 180 }}>
                  Complete Sale
                </Button>
              </Space>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default NewSale;


