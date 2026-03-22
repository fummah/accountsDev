import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Select, Input, InputNumber, Button, Table, Space, message } from 'antd';

const BOM = () => {
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [parentProductId, setParentProductId] = useState('');
  const [bomId, setBomId] = useState(null);
  const [bomName, setBomName] = useState('');
  const [components, setComponents] = useState([]);
  const [newComp, setNewComp] = useState({ componentProductId: '', quantity: '' });
  const [assemblies, setAssemblies] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const loadItems = async () => {
    const list = await window.electronAPI.getItems();
    setItems(Array.isArray(list) ? list : []);
  };
  const loadProducts = async () => {
    const list = await window.electronAPI.getAllProducts();
    setProducts(Array.isArray(list) ? list : []);
  };
  const loadAssemblies = async () => {
    const list = await window.electronAPI.listAssemblies(search || undefined);
    setAssemblies(Array.isArray(list) ? list : []);
  };
  useEffect(() => { loadItems(); loadProducts(); loadAssemblies(); }, []);

  const ensureItemForProduct = async (product) => {
    const match = items.find(i => (i.code && product.sku && i.code === product.sku) || (i.name && product.name && i.name === product.name));
    if (match) return match;
    const res = await window.electronAPI.createItem({
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

  const createBom = async () => {
    setError('');
    if (!parentProductId) { setError('Select parent product'); return; }
    const product = products.find(p => String(p.id) === String(parentProductId));
    const item = await ensureItemForProduct(product);
    if (!item?.id) { message.error('Failed to resolve item for product'); return; }
    await window.electronAPI.createBOM(Number(item.id), bomName || null);
    // res has run().lastInsertRowid? Our backend returns run result; not id; we'll refresh assemblies and pick latest.
    await loadAssemblies();
    message.success('BOM created');
  };

  const openBom = async (id) => {
    setBomId(id);
    const b = await window.electronAPI.getBOM(id);
    setComponents(Array.isArray(b?.components) ? b.components : []);
  };

  const addComponent = async () => {
    if (!bomId) { setError('Open a BOM first'); return; }
    const compProduct = products.find(p => String(p.id) === String(newComp.componentProductId));
    const compItem = await ensureItemForProduct(compProduct || {});
    const cid = Number(compItem?.id);
    const qty = Number(newComp.quantity);
    if (!cid || !qty) { setError('Select component and quantity'); return; }
    await window.electronAPI.addBOMComponent(bomId, cid, qty);
    setNewComp({ componentProductId: '', quantity: '' });
    await openBom(bomId);
    message.success('Component added');
  };

  const removeComponent = async (componentId) => {
    await window.electronAPI.removeBOMComponent(componentId);
    await openBom(bomId);
    message.success('Component removed');
  };

  return (
    <Card title="Bill of Materials">
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={8}>
          <Select
            showSearch
            placeholder="Parent product"
            value={parentProductId || undefined}
            onChange={v => setParentProductId(v)}
            optionFilterProp="label"
            style={{ width: '100%' }}
            options={products.map(p => ({ value: p.id, label: `${p.sku || p.id} - ${p.name}` }))}
          />
        </Col>
        <Col span={8}>
          <Input placeholder="BOM name (optional)" value={bomName} onChange={e => setBomName(e.target.value)} />
        </Col>
        <Col span={8}>
          <Button type="primary" onClick={createBom}>Create BOM</Button>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card size="small" title="Assemblies" extra={
            <Space>
              <Input placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} />
              <Button onClick={loadAssemblies}>Search</Button>
            </Space>
          }>
            <Table
              rowKey="id"
              dataSource={assemblies}
              pagination={false}
              columns={[
                { title: '#', dataIndex: 'id', key: 'id', width: 80 },
                { title: 'Parent', key: 'parent', render: (_, a) => a.parentCode || a.parentName || a.parentItemId },
                { title: '', key: 'action', width: 100, render: (_, a) => <Button size="small" onClick={() => openBom(a.id)}>Open</Button> }
              ]}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title={`Components ${bomId ? `(BOM #${bomId})` : ''}`}>
            <Space style={{ marginBottom: 8 }}>
              <Select
                showSearch
                placeholder="Component product"
                value={newComp.componentProductId || undefined}
                onChange={v => setNewComp({ ...newComp, componentProductId: v })}
                optionFilterProp="label"
                style={{ width: 280 }}
                options={products.map(p => ({ value: p.id, label: `${p.sku || p.id} - ${p.name}` }))}
              />
              <InputNumber placeholder="Qty" value={newComp.quantity} onChange={v => setNewComp({ ...newComp, quantity: v })} min={0} />
              <Button onClick={addComponent}>Add</Button>
            </Space>
            <Table
              rowKey="id"
              dataSource={components}
              pagination={false}
              columns={[
                { title: 'Component', key: 'comp', render: (_, c) => c.componentCode || c.componentName || c.componentItemId },
                { title: 'Qty', dataIndex: 'quantity', key: 'qty', width: 120 },
                { title: '', key: 'action', width: 100, render: (_, c) => <Button danger size="small" onClick={() => removeComponent(c.id)}>Remove</Button> }
              ]}
            />
          </Card>
        </Col>
      </Row>
    </Card>
  );
};

export default BOM;


