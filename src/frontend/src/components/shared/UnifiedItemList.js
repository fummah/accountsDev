import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, Space, message, Tag, Row, Col, Tooltip, Popconfirm, Drawer } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined, DownloadOutlined, FilterOutlined } from '@ant-design/icons';
import { useCurrency } from '../../utils/currency';

const { Option } = Select;
const { TextArea } = Input;

const UnifiedItemList = () => {
  const { symbol: cSym } = useCurrency();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [form] = Form.useForm();

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      let data = await window.electronAPI.getAllProducts?.();
      if (!data) data = await window.electronAPI.getItems?.();
      const list = Array.isArray(data) ? data : (data?.all || data?.data || []);
      setItems(list);
    } catch (error) {
      message.error('Failed to load items');
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const categories = useMemo(() => {
    const cats = new Set();
    items.forEach(i => { if (i.category) cats.add(i.category); });
    return Array.from(cats).sort();
  }, [items]);

  const types = useMemo(() => {
    const ts = new Set();
    items.forEach(i => { if (i.type) ts.add(i.type); });
    return Array.from(ts).sort();
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (categoryFilter !== 'all') list = list.filter(i => i.category === categoryFilter);
    if (typeFilter !== 'all') list = list.filter(i => i.type === typeFilter);
    const q = search.toLowerCase().trim();
    if (q) {
      list = list.filter(i =>
        (i.name || '').toLowerCase().includes(q) ||
        (i.sku || '').toLowerCase().includes(q) ||
        (i.code || '').toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, search, categoryFilter, typeFilter]);

  const openAdd = () => { setEditingItem(null); form.resetFields(); setDrawerOpen(true); };
  const openEdit = (record) => {
    setEditingItem(record);
    form.setFieldsValue({
      ...record,
      selling_price: record.selling_price || record.price || record.unitPrice || 0,
      stock: record.stock || record.quantity || 0,
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    try {
      const vals = await form.validateFields();
      if (editingItem) {
        const updateFn = window.electronAPI.updateProduct || window.electronAPI.updateItem;
        if (updateFn) {
          await updateFn({ id: editingItem.id, ...vals });
          message.success('Item updated');
        }
      } else {
        const insertFn = window.electronAPI.insertProduct || window.electronAPI.createItem;
        if (insertFn === window.electronAPI.insertProduct) {
          await insertFn(
            vals.type || 'Product', vals.name || '', vals.sku || '', vals.category || '',
            vals.description || '', Number(vals.selling_price) || 0, vals.income_account || '',
            0, 0, 0, null
          );
        } else if (insertFn) {
          await insertFn(vals);
        }
        message.success('Item created');
      }
      setDrawerOpen(false);
      form.resetFields();
      fetchItems();
    } catch (e) {
      if (!e?.errorFields) message.error(e?.message || 'Save failed');
    }
  };

  const handleDelete = async (id) => {
    try {
      const delFn = window.electronAPI.deleteProduct || window.electronAPI.deleteItem;
      if (delFn) await delFn(id);
      message.success('Item deleted');
      fetchItems();
    } catch (_) { message.error('Delete failed'); }
  };

  const exportCSV = () => {
    try {
      const headers = ['id', 'name', 'sku', 'category', 'type', 'selling_price', 'stock'];
      const rows = filtered.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `items_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (_) { message.error('Export failed'); }
  };

  const columns = [
    { title: 'SKU / Code', key: 'sku', width: 110, sorter: (a, b) => (a.sku || a.code || '').localeCompare(b.sku || b.code || ''),
      render: (_, r) => r.sku || r.code || '-' },
    { title: 'Name', dataIndex: 'name', key: 'name', sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      render: (v) => <strong>{v || '-'}</strong> },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Category', dataIndex: 'category', key: 'category', render: v => v ? <Tag>{v}</Tag> : '-' },
    { title: 'Type', dataIndex: 'type', key: 'type', render: v => v ? <Tag color="blue">{v}</Tag> : '-' },
    { title: 'Price', key: 'price', width: 120, sorter: (a, b) => Number(a.selling_price || a.price || 0) - Number(b.selling_price || b.price || 0),
      render: (_, r) => `${cSym} ${Number(r.selling_price || r.price || r.unitPrice || 0).toFixed(2)}` },
    { title: 'Stock', key: 'stock', width: 80, render: (_, r) => {
      const s = Number(r.stock || r.quantity || 0);
      return <span style={{ color: s <= 0 ? '#cf1322' : s < 10 ? '#fa8c16' : '#3f8600' }}>{s}</span>;
    }},
    {
      title: 'Actions', key: 'actions', width: 120,
      render: (_, r) => (
        <Space size="small">
          <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          <Popconfirm title="Delete item?" onConfirm={() => handleDelete(r.id)} okText="Yes" cancelText="No">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={<span style={{ fontSize: 18, fontWeight: 600 }}>Items / Products & Services</span>}
        extra={
          <Space>
            <Button icon={<DownloadOutlined />} onClick={exportCSV}>Export</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Item</Button>
          </Space>
        }
      >
        <Space style={{ marginBottom: 16 }} wrap>
          <Input.Search allowClear placeholder="Search name, SKU, description..." prefix={<SearchOutlined />}
            onSearch={v => setSearch(v)} onChange={e => { if (!e.target.value) setSearch(''); }} style={{ width: 280 }} />
          <Select value={categoryFilter} onChange={v => setCategoryFilter(v)} style={{ width: 160 }} placeholder="Category">
            <Option value="all">All Categories</Option>
            {categories.map(c => <Option key={c} value={c}>{c}</Option>)}
          </Select>
          <Select value={typeFilter} onChange={v => setTypeFilter(v)} style={{ width: 140 }} placeholder="Type">
            <Option value="all">All Types</Option>
            {types.map(t => <Option key={t} value={t}>{t}</Option>)}
          </Select>
          <Button icon={<ReloadOutlined />} onClick={fetchItems}>Refresh</Button>
        </Space>

        <Table columns={columns} dataSource={filtered} loading={loading} rowKey={r => r.id || r.sku || r.name || String(Math.random())}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} items` }}
          size="middle" />
      </Card>

      <Drawer title={editingItem ? 'Edit Item' : 'New Item'} width={520} visible={drawerOpen} onClose={() => { setDrawerOpen(false); setEditingItem(null); form.resetFields(); }} destroyOnClose
        footer={<div style={{ textAlign: 'right' }}><Button onClick={() => { setDrawerOpen(false); setEditingItem(null); form.resetFields(); }} style={{ marginRight: 8 }}>Cancel</Button><Button type="primary" onClick={handleSave}>Save</Button></div>}>
        <Form form={form} layout="vertical">
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}><Form.Item name="type" label="Type" initialValue="Product"><Select><Option value="Product">Product</Option><Option value="Service">Service</Option><Option value="Material">Material</Option></Select></Form.Item></Col>
            <Col span={12}><Form.Item name="sku" label="SKU / Code"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}><Input /></Form.Item>
          <Form.Item name="description" label="Description"><TextArea rows={3} /></Form.Item>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}>
              <Form.Item name="category" label="Category">
                <Select allowClear placeholder="Select category">
                  <Option value="goods">Goods</Option>
                  <Option value="services">Services</Option>
                  <Option value="materials">Materials</Option>
                  <Option value="consumables">Consumables</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}><Form.Item name="selling_price" label="Selling Price" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
          </Row>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}><Form.Item name="stock" label="Stock / Quantity"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
            <Col span={12}><Form.Item name="income_account" label="Income Account"><Input placeholder="Optional" /></Form.Item></Col>
          </Row>
        </Form>
      </Drawer>
    </div>
  );
};

export default UnifiedItemList;
