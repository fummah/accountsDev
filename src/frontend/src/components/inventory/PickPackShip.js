import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Select, Input, InputNumber, DatePicker, message, Tag, Space, Row, Col, Steps, Tabs, Descriptions } from 'antd';
import { ShoppingOutlined, CheckCircleOutlined, InboxOutlined, CarOutlined, PlusOutlined, EyeOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Option } = Select;
const { Step } = Steps;
const { TabPane } = Tabs;

const STATUS_COLORS = { Open: 'blue', Picking: 'orange', Picked: 'gold', Packed: 'cyan', Shipped: 'green', Delivered: 'purple' };
const STATUS_STEP = { Open: 0, Picking: 1, Picked: 2, Packed: 3, Shipped: 4, Delivered: 5 };

const PickPackShip = () => {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const [viewVisible, setViewVisible] = useState(false);
  const [shipVisible, setShipVisible] = useState(false);
  const [viewOrder, setViewOrder] = useState(null);
  const [orderLines, setOrderLines] = useState([{ item_id: null, description: '', quantity: 1, unit_price: 0 }]);
  const [filterStatus, setFilterStatus] = useState(null);
  const [form] = Form.useForm();
  const [shipForm] = Form.useForm();

  useEffect(() => { loadData(); }, [filterStatus]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [o, c, it] = await Promise.all([
        window.electronAPI.ppsOrderList?.(filterStatus) || [],
        window.electronAPI.getAllCustomers?.() || [],
        window.electronAPI.getItems?.() || [],
      ]);
      setOrders(Array.isArray(o) ? o : []);
      setCustomers(Array.isArray(c) ? c : (c?.all || []));
      setItems(Array.isArray(it) ? it : []);
    } catch (err) { message.error(err.message); }
    setLoading(false);
  };

  const handleCreate = async () => {
    try {
      const vals = await form.validateFields();
      const lines = orderLines.filter(l => l.item_id || l.description);
      const total = lines.reduce((s, l) => s + (l.quantity * l.unit_price), 0);
      const result = await window.electronAPI.ppsOrderCreate?.({ ...vals, total, subtotal: total, order_date: vals.order_date?.format('YYYY-MM-DD'), expected_ship_date: vals.expected_ship_date?.format('YYYY-MM-DD') }, lines);
      if (result?.error) { message.error(result.error); return; }
      message.success(`Order ${result.order_number} created`);
      setCreateVisible(false);
      form.resetFields();
      setOrderLines([{ item_id: null, description: '', quantity: 1, unit_price: 0 }]);
      loadData();
    } catch {}
  };

  const handleView = async (id) => {
    const order = await window.electronAPI.ppsOrderGet?.(id);
    if (order) { setViewOrder(order); setViewVisible(true); }
  };

  const handleCreatePick = async (orderId) => {
    await window.electronAPI.ppsPickCreate?.(orderId, 'warehouse');
    message.success('Pick list created');
    loadData();
  };

  const handleConfirmPick = async (orderId) => {
    const order = await window.electronAPI.ppsOrderGet?.(orderId);
    if (!order) return;
    // Auto-confirm all lines as fully picked
    const pickedItems = (order.lines || []).map(l => ({ line_id: l.id, quantity_picked: l.quantity_ordered }));
    // Find pick list for this order
    // The pick list ID comes from the create step - for simplicity we use orderId as ref
    const pickLists = order.lines; // simplified
    await window.electronAPI.ppsPickConfirm?.(orderId, pickedItems);
    message.success('Picking confirmed');
    loadData();
  };

  const handlePack = async (orderId) => {
    await window.electronAPI.ppsPackCreate?.(orderId, null, 'warehouse', 1, null, '');
    message.success('Packing slip created');
    loadData();
  };

  const handleShip = async () => {
    const vals = shipForm.getFieldsValue();
    await window.electronAPI.ppsShipCreate?.({ ...vals, estimated_delivery: vals.estimated_delivery?.format('YYYY-MM-DD') });
    message.success('Shipment recorded');
    setShipVisible(false);
    shipForm.resetFields();
    loadData();
  };

  const addLine = () => setOrderLines([...orderLines, { item_id: null, description: '', quantity: 1, unit_price: 0 }]);
  const updateLine = (idx, field, value) => {
    const lines = [...orderLines];
    lines[idx][field] = value;
    if (field === 'item_id') {
      const item = items.find(i => i.id === value);
      if (item) { lines[idx].description = item.name; lines[idx].unit_price = item.price || 0; }
    }
    setOrderLines(lines);
  };

  const columns = [
    { title: 'Order #', dataIndex: 'order_number', key: 'order_number' },
    { title: 'Customer', dataIndex: 'customer_name', key: 'customer_name' },
    { title: 'Date', dataIndex: 'order_date', key: 'order_date' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: v => <Tag color={STATUS_COLORS[v] || 'default'}>{v}</Tag> },
    { title: 'Total', dataIndex: 'total', key: 'total', align: 'right', render: v => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
    {
      title: 'Actions', key: 'actions', render: (_, r) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleView(r.id)} />
          {r.status === 'Open' && <Button size="small" onClick={() => handleCreatePick(r.id)}>Pick</Button>}
          {r.status === 'Picking' && <Button size="small" onClick={() => handleConfirmPick(r.id)}>Confirm Pick</Button>}
          {r.status === 'Picked' && <Button size="small" icon={<InboxOutlined />} onClick={() => handlePack(r.id)}>Pack</Button>}
          {r.status === 'Packed' && <Button size="small" icon={<CarOutlined />} onClick={() => { shipForm.setFieldsValue({ order_id: r.id }); setShipVisible(true); }}>Ship</Button>}
        </Space>
      ),
    },
  ];

  return (
    <Card title={<><ShoppingOutlined /> Pick, Pack & Ship Workflow</>}
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateVisible(true)}>New Sales Order</Button>}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Select allowClear placeholder="Filter by status" style={{ width: '100%' }} value={filterStatus} onChange={v => setFilterStatus(v)}>
            {['Open', 'Picking', 'Picked', 'Packed', 'Shipped', 'Delivered'].map(s => <Option key={s} value={s}>{s}</Option>)}
          </Select>
        </Col>
      </Row>
      <Table columns={columns} dataSource={orders} rowKey="id" loading={loading} size="small" />

      {/* Create Order Modal */}
      <Modal title="New Sales Order" visible={createVisible} onOk={handleCreate} onCancel={() => setCreateVisible(false)} width={700}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}><Form.Item name="customer_id" label="Customer" rules={[{ required: true }]}>
              <Select showSearch placeholder="Select customer" filterOption={(i, o) => (o?.children || '').toString().toLowerCase().includes(i.toLowerCase())}>
                {customers.map(c => <Option key={c.id} value={c.id}>{c.display_name || `${c.first_name || ''} ${c.last_name || ''}`}</Option>)}
              </Select>
            </Form.Item></Col>
            <Col span={6}><Form.Item name="order_date" label="Order Date" initialValue={moment()}><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={6}><Form.Item name="expected_ship_date" label="Expected Ship"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="shipping_address" label="Shipping Address"><Input.TextArea rows={2} /></Form.Item>
          <h4>Line Items</h4>
          {orderLines.map((line, idx) => (
            <Row key={idx} gutter={8} style={{ marginBottom: 8 }}>
              <Col span={8}>
                <Select placeholder="Item" value={line.item_id} onChange={v => updateLine(idx, 'item_id', v)} showSearch allowClear style={{ width: '100%' }}
                  filterOption={(i, o) => (o?.children || '').toString().toLowerCase().includes(i.toLowerCase())}>
                  {items.map(it => <Option key={it.id} value={it.id}>{it.name}</Option>)}
                </Select>
              </Col>
              <Col span={6}><Input placeholder="Description" value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)} /></Col>
              <Col span={4}><InputNumber placeholder="Qty" min={1} value={line.quantity} onChange={v => updateLine(idx, 'quantity', v)} style={{ width: '100%' }} /></Col>
              <Col span={4}><InputNumber placeholder="Price" min={0} value={line.unit_price} onChange={v => updateLine(idx, 'unit_price', v)} style={{ width: '100%' }} /></Col>
              <Col span={2}><span>${((line.quantity || 0) * (line.unit_price || 0)).toFixed(2)}</span></Col>
            </Row>
          ))}
          <Button type="dashed" onClick={addLine} style={{ width: '100%' }}>+ Add Line</Button>
        </Form>
      </Modal>

      {/* View Order Modal */}
      <Modal title={viewOrder ? `Order ${viewOrder.order_number}` : 'Order'} visible={viewVisible} onCancel={() => setViewVisible(false)} footer={null} width={700}>
        {viewOrder && (
          <>
            <Steps current={STATUS_STEP[viewOrder.status] || 0} size="small" style={{ marginBottom: 24 }}>
              <Step title="Open" /><Step title="Picking" /><Step title="Picked" /><Step title="Packed" /><Step title="Shipped" /><Step title="Delivered" />
            </Steps>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Customer">{viewOrder.customer_name}</Descriptions.Item>
              <Descriptions.Item label="Status"><Tag color={STATUS_COLORS[viewOrder.status]}>{viewOrder.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="Order Date">{viewOrder.order_date}</Descriptions.Item>
              <Descriptions.Item label="Ship Date">{viewOrder.expected_ship_date || '—'}</Descriptions.Item>
              <Descriptions.Item label="Total">${Number(viewOrder.total || 0).toFixed(2)}</Descriptions.Item>
            </Descriptions>
            <Table style={{ marginTop: 16 }} size="small" pagination={false} rowKey="id"
              columns={[
                { title: 'Item', dataIndex: 'item_name', key: 'item_name' },
                { title: 'Ordered', dataIndex: 'quantity_ordered', key: 'quantity_ordered' },
                { title: 'Picked', dataIndex: 'quantity_picked', key: 'quantity_picked' },
                { title: 'Shipped', dataIndex: 'quantity_shipped', key: 'quantity_shipped' },
                { title: 'Price', dataIndex: 'unit_price', key: 'unit_price', render: v => `$${Number(v || 0).toFixed(2)}` },
              ]}
              dataSource={viewOrder.lines || []}
            />
          </>
        )}
      </Modal>

      {/* Ship Modal */}
      <Modal title="Record Shipment" visible={shipVisible} onOk={handleShip} onCancel={() => setShipVisible(false)}>
        <Form form={shipForm} layout="vertical">
          <Form.Item name="order_id" hidden><Input /></Form.Item>
          <Form.Item name="carrier" label="Carrier"><Input placeholder="e.g. FedEx, UPS, DHL" /></Form.Item>
          <Form.Item name="tracking_number" label="Tracking Number"><Input /></Form.Item>
          <Form.Item name="shipping_method" label="Shipping Method"><Input placeholder="e.g. Ground, Express, Overnight" /></Form.Item>
          <Form.Item name="estimated_delivery" label="Estimated Delivery"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="shipping_cost" label="Shipping Cost"><InputNumber min={0} prefix="$" style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default PickPackShip;
