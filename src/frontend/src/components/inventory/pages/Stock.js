import React, { useEffect, useMemo, useState } from 'react';
import { Card, Row, Col, Select, Table, InputNumber, Button, Space, Form, message } from 'antd';

const Stock = () => {
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [stock, setStock] = useState([]);
  const [reorderEdits, setReorderEdits] = useState({});
  const [transfer, setTransfer] = useState({ fromWarehouseId: undefined, toWarehouseId: undefined, quantity: undefined });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadReferenceData = async () => {
    const [it, prods, whs] = await Promise.all([
      window.electronAPI.getItems(),
      window.electronAPI.getAllProducts(),
      window.electronAPI.getWarehouses(),
    ]);
    setItems(Array.isArray(it) ? it : []);
    setProducts(Array.isArray(prods) ? prods : []);
    setWarehouses(Array.isArray(whs) ? whs : []);
  };
  const loadStock = async (id) => {
    setError('');
    try {
      const s = await window.electronAPI.getItemStock(Number(id));
      setStock(Array.isArray(s) ? s : []);
    } catch (e) {
      setError(String(e?.message || e));
    }
  };
  useEffect(() => { loadReferenceData(); }, []);
  useEffect(() => { if (selectedItemId) { loadStock(selectedItemId); } }, [selectedItemId]);

  const ensureItemForProduct = async (product) => {
    if (!product) return null;
    // Try to match by SKU -> code, else by name
    const match = items.find(i => (i.code && product.sku && i.code === product.sku) || (i.name && product.name && i.name === product.name));
    if (match) return match;
    // Create new item mapped from product
    const createRes = await window.electronAPI.createItem({
      code: product.sku || String(product.id),
      name: product.name || `Product ${product.id}`,
      description: product.description || '',
      category: product.category || '',
      unitPrice: Number(product.price || 0),
      stock: 0
    });
    // Reload items and return the created row
    const it = await window.electronAPI.getItems();
    const refreshed = Array.isArray(it) ? it : [];
    setItems(refreshed);
    return refreshed.find(i => (i.code && product.sku && i.code === product.sku) || (i.name && product.name && i.name === product.name)) || null;
  };

  const applyReorder = async (row) => {
    const val = Number((reorderEdits[row.warehouseId] ?? row.reorderPoint) ?? 0);
    await window.electronAPI.setReorderPoint(Number(selectedItemId), row.warehouseId, val);
    message.success('Reorder point saved');
    await loadStock(selectedItemId);
  };

  const doTransfer = async () => {
    if (!selectedItemId) { setError('Select a product'); return; }
    const qty = Number(transfer.quantity || 0);
    const fromId = Number(transfer.fromWarehouseId || 0);
    const toId = Number(transfer.toWarehouseId || 0);
    if (!qty || !fromId || !toId) { setError('Fill transfer fields'); return; }
    await window.electronAPI.transferStock(Number(selectedItemId), fromId, toId, qty, 'MANUAL', null);
    message.success('Transfer completed');
    setTransfer({ fromWarehouseId: undefined, toWarehouseId: undefined, quantity: undefined });
    await loadStock(selectedItemId);
  };

  const onSelectProduct = async (value) => {
    setSelectedProductId(value);
    setLoading(true);
    try {
      const product = products.find(p => String(p.id) === String(value));
      const item = await ensureItemForProduct(product);
      if (item?.id) {
        setSelectedItemId(item.id);
      } else {
        message.error('Failed to resolve inventory item for product');
      }
    } finally {
      setLoading(false);
    }
  };

  const selectedProduct = useMemo(() => products.find(p => String(p.id) === String(selectedProductId)), [products, selectedProductId]);

  return (
    <Card title="Stock">
      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      <Row gutter={16} style={{ marginBottom: 12 }}>
        <Col span={12}>
          <Form layout="vertical">
            <Form.Item label="Product">
              <Select
                showSearch
                value={selectedProductId || undefined}
                onChange={onSelectProduct}
                placeholder="Select product"
                loading={loading}
                optionFilterProp="label"
                style={{ width: '100%' }}
                options={products.map(p => ({
                  value: p.id,
                  label: `${p.sku || p.id} - ${p.name}`,
                }))}
              />
            </Form.Item>
          </Form>
          {selectedProduct && (
            <div style={{ marginTop: -8, marginBottom: 12, color: '#888' }}>
              {selectedProduct.name} ({selectedProduct.sku || selectedProduct.id})
            </div>
          )}
        </Col>
      </Row>
      {selectedItemId && (
        <>
          <Table
            rowKey={r => r.id || `${r.itemId}-${r.warehouseId}`}
            dataSource={stock}
            pagination={false}
            columns={[
              { title: 'Warehouse', dataIndex: 'warehouseName', key: 'warehouseName', render: (_, r) => r.warehouseName || r.warehouseCode || r.warehouseId },
              { title: 'Quantity', dataIndex: 'quantity', key: 'quantity', render: v => Number(v || 0) },
              {
                title: 'Reorder Point',
                key: 'reorder',
                render: (_, r) => (
                  <Space>
                    <InputNumber
                      value={reorderEdits[r.warehouseId] ?? (r.reorderPoint || 0)}
                      onChange={v => setReorderEdits({ ...reorderEdits, [r.warehouseId]: v })}
                      min={0}
                    />
                    <Button onClick={() => applyReorder(r)} size="small">Save</Button>
                  </Space>
                )
              }
            ]}
            style={{ marginBottom: 16 }}
          />
          <Card size="small" title="Transfer Stock">
            <Row gutter={8} align="middle">
              <Col span={8}>
                <Select
                  placeholder="From Warehouse"
                  value={transfer.fromWarehouseId}
                  onChange={v => setTransfer({ ...transfer, fromWarehouseId: v })}
                  style={{ width: '100%' }}
                  options={warehouses.map(w => ({ value: w.id, label: `${w.code || w.id} - ${w.name}` }))}
                />
              </Col>
              <Col span={8}>
                <Select
                  placeholder="To Warehouse"
                  value={transfer.toWarehouseId}
                  onChange={v => setTransfer({ ...transfer, toWarehouseId: v })}
                  style={{ width: '100%' }}
                  options={warehouses.map(w => ({ value: w.id, label: `${w.code || w.id} - ${w.name}` }))}
                />
              </Col>
              <Col span={4}>
                <InputNumber
                  placeholder="Quantity"
                  value={transfer.quantity}
                  onChange={v => setTransfer({ ...transfer, quantity: v })}
                  min={0}
                  style={{ width: '100%' }}
                />
              </Col>
              <Col span={4}>
                <Button type="primary" onClick={doTransfer} block>Transfer</Button>
              </Col>
            </Row>
          </Card>
        </>
      )}
    </Card>
  );
};

export default Stock;


