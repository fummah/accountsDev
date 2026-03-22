import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Select, InputNumber, Input, Button, message } from 'antd';

const Adjustments = () => {
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [productId, setProductId] = useState('');
  const [itemId, setItemId] = useState('');
  const [warehouseId, setWarehouseId] = useState(undefined);
  const [quantity, setQuantity] = useState(undefined);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const load = async () => {
      const [it, prods, whs] = await Promise.all([
        window.electronAPI.getItems(),
        window.electronAPI.getAllProducts(),
        window.electronAPI.getWarehouses(),
      ]);
      setItems(Array.isArray(it) ? it : []);
      setProducts(Array.isArray(prods) ? prods : []);
      setWarehouses(Array.isArray(whs) ? whs : []);
    };
    load();
  }, []);

  const ensureItemForProduct = async (product) => {
    const match = items.find(i => (i.code && product.sku && i.code === product.sku) || (i.name && product.name && i.name === product.name));
    if (match) return match;
    await window.electronAPI.createItem({
      code: product.sku || String(product.id),
      name: product.name || `Product ${product.id}`,
      description: product.description || '',
      category: product.category || '',
      unitPrice: Number(product.price || 0),
      stock: 0
    });
    const it = await window.electronAPI.getItems();
    const refreshed = Array.isArray(it) ? it : [];
    setItems(refreshed);
    return refreshed.find(i => (i.code && product.sku && i.code === product.sku) || (i.name && product.name && i.name === product.name)) || null;
  };

  const onSelectProduct = async (value) => {
    setProductId(value);
    const p = products.find(pp => String(pp.id) === String(value));
    const item = await ensureItemForProduct(p || {});
    if (item?.id) setItemId(item.id);
  };

  const adjust = async () => {
    setMsg('');
    if (!itemId || !warehouseId || !quantity) { setMsg('Fill all fields'); return; }
    const res = await window.electronAPI.adjustInventory(Number(itemId), Number(warehouseId), Number(quantity), reason || null);
    if (res?.success === false) {
      setMsg(res.error || 'Adjustment failed');
    } else {
      message.success('Adjustment saved');
      setMsg('Adjustment saved');
      setQuantity(undefined); setReason('');
    }
  };

  return (
    <Card title="Inventory Adjustments">
      {msg && <div style={{ marginBottom: 8 }}>{msg}</div>}
      <Row gutter={8} align="middle">
        <Col span={8}>
          <Select
            showSearch
            placeholder="Select product"
            value={productId || undefined}
            onChange={onSelectProduct}
            optionFilterProp="label"
            style={{ width: '100%' }}
            options={products.map(p => ({ value: p.id, label: `${p.sku || p.id} - ${p.name}` }))}
          />
        </Col>
        <Col span={6}>
          <Select
            placeholder="Warehouse"
            value={warehouseId}
            onChange={v => setWarehouseId(v)}
            style={{ width: '100%' }}
            options={warehouses.map(w => ({ value: w.id, label: `${w.code || w.id} - ${w.name}` }))}
          />
        </Col>
        <Col span={4}>
          <InputNumber
            placeholder="Quantity (+/-)"
            value={quantity}
            onChange={v => setQuantity(v)}
            style={{ width: '100%' }}
          />
        </Col>
        <Col span={4}>
          <Input placeholder="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)} />
        </Col>
        <Col span={2}>
          <Button type="primary" onClick={adjust} block>Adjust</Button>
        </Col>
      </Row>
    </Card>
  );
};

export default Adjustments;


