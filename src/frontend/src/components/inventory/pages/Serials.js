import React, { useEffect, useState } from 'react';
import { Card, Select, Input, Button, Table, Space, message } from 'antd';

const Serials = () => {
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('');
  const [itemId, setItemId] = useState('');
  const [serials, setSerials] = useState([]);
  const [serial, setSerial] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [error, setError] = useState('');

  const loadItems = async () => {
    const list = await window.electronAPI.getItems();
    setItems(Array.isArray(list) ? list : []);
  };
  const loadProducts = async () => {
    const list = await window.electronAPI.getAllProducts();
    setProducts(Array.isArray(list) ? list : []);
  };
  const loadSerials = async (id) => {
    setError('');
    try {
      const list = await window.electronAPI.listSerialsByItem(Number(id));
      setSerials(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(String(e?.message || e));
    }
  };
  useEffect(() => { loadItems(); loadProducts(); }, []);
  useEffect(() => { if (itemId) loadSerials(itemId); }, [itemId]);

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

  const add = async () => {
    if (!itemId || !serial) { setError('Select item and enter serial'); return; }
    await window.electronAPI.addSerial(Number(itemId), serial, warehouseId ? Number(warehouseId) : null);
    setSerial(''); setWarehouseId('');
    await loadSerials(itemId);
    message.success('Serial added');
  };
  const assignWh = async (s, wid) => {
    await window.electronAPI.assignSerialWarehouse(s, wid ? Number(wid) : null);
    await loadSerials(itemId);
    message.success('Assigned warehouse');
  };
  const setStatus = async (s, status) => {
    await window.electronAPI.updateSerialStatus(s, status);
    await loadSerials(itemId);
    message.success('Status updated');
  };

  return (
    <Card title="Serial Numbers">
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <div style={{ marginBottom: 10 }}>
        <Select
          showSearch
          placeholder="Select product"
          value={productId || undefined}
          onChange={onSelectProduct}
          optionFilterProp="label"
          style={{ width: 360 }}
          options={products.map(p => ({ value: p.id, label: `${p.sku || p.id} - ${p.name}` }))}
        />
      </div>
      {itemId && (
        <>
          <Space style={{ marginBottom: 8 }}>
            <Input placeholder="Serial" value={serial} onChange={e => setSerial(e.target.value)} />
            <Input placeholder="Warehouse Id (optional)" value={warehouseId} onChange={e => setWarehouseId(e.target.value)} />
            <Button onClick={add}>Add</Button>
          </Space>
          <Table
            rowKey="id"
            dataSource={serials}
            pagination={false}
            columns={[
              { title: 'Serial', dataIndex: 'serial', key: 'serial' },
              {
                title: 'Warehouse Id',
                key: 'warehouseId',
                render: (_, s) => <Input style={{ width: 140 }} defaultValue={s.warehouseId || ''} onBlur={e => assignWh(s.serial, e.target.value)} />
              },
              {
                title: 'Status',
                dataIndex: 'status',
                key: 'status',
                render: (v, s) => (
                  <Select defaultValue={v} onChange={e => setStatus(s.serial, e)} style={{ width: 140 }}>
                    <Select.Option value="in_stock">In Stock</Select.Option>
                    <Select.Option value="allocated">Allocated</Select.Option>
                    <Select.Option value="sold">Sold</Select.Option>
                    <Select.Option value="returned">Returned</Select.Option>
                  </Select>
                )
              }
            ]}
          />
        </>
      )}
    </Card>
  );
};

export default Serials;


