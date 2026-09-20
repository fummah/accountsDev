import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, Space, message, Tag, Row, Col, Tooltip, Popconfirm, Drawer, Divider, Avatar, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined, DownloadOutlined, PrinterOutlined, AppstoreOutlined, DollarOutlined, FileTextOutlined, BoxPlotOutlined, ShoppingOutlined } from '@ant-design/icons';
import { useCurrency } from '../../utils/currency';

const { Option } = Select;
const { TextArea } = Input;
const { Title, Text } = Typography;

const typeColors = {
  Product: '#1890ff',
  Service: '#722ed1',
  'Raw Material': '#fa8c16',
  Asset: '#13c2c2',
  Bundle: '#f5222d',
};

// The REAL on-hand quantity, sourced from the inventory engine's single source
// of truth (`item_stock`) and delivered by the backend as `inventory_stock`.
// `products.stock` is a legacy decorative column that inventory never updates,
// so it is only a fallback for rows the backend has not enriched. Reading this
// helper everywhere is what keeps this list agreeing with Inventory → Stock
// Levels instead of showing a stale number.
const stockOf = (r) => {
  if (!r) return 0;
  if (r.inventory_stock != null) return Number(r.inventory_stock) || 0;
  return Number(r.stock ?? r.quantity ?? 0) || 0;
};

const UnifiedItemList = () => {
  const { symbol: cSym } = useCurrency();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 25, total: 0 });
  const [incomeAccounts, setIncomeAccounts] = useState([]);
  const [form] = Form.useForm();

  const loadCategories = useCallback(async () => {
    try {
      const c = await window.electronAPI.getProductCategories?.();
      setCategories(Array.isArray(c) ? c : []);
    } catch {}
  }, []);

  const loadTypes = useCallback(async () => {
    try {
      const t = await window.electronAPI.getProductTypes?.();
      setCustomTypes(Array.isArray(t) ? t.map(x => x.name) : []);
    } catch {}
  }, []);

  const fetchItems = useCallback(async (page = pagination.current, size = pagination.pageSize, term = search, type = typeFilter, cat = categoryFilter) => {
    setLoading(true);
    try {
      let data = await window.electronAPI.getProductsPaginated?.(page, size, term || '', type === 'all' ? '' : type, cat === 'all' ? '' : cat);
      if (data && Array.isArray(data.data)) {
        setItems(data.data);
        setPagination(p => ({ ...p, current: page, total: data.total || data.data.length }));
      } else {
        let all = await window.electronAPI.getAllProducts?.();
        if (!all) all = await window.electronAPI.getItems?.();
        const list = Array.isArray(all) ? all : (all?.all || all?.data || []);
        let filteredList = list;
        if (type !== 'all') filteredList = filteredList.filter(i => i.type === type);
        if (cat !== 'all') filteredList = filteredList.filter(i => i.category === cat);
        const q = (term || '').toLowerCase().trim();
        if (q) filteredList = filteredList.filter(i =>
          (i.name || '').toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q) || (i.code || '').toLowerCase().includes(q));
        setItems(filteredList);
        setPagination(p => ({ ...p, current: page, total: filteredList.length }));
      }
    } catch (error) {
      message.error('Failed to load items');
      setItems([]);
    }
    setLoading(false);
  }, [pagination.current, pagination.pageSize, search, typeFilter, categoryFilter]);

  const fetchIncomeAccounts = useCallback(async () => {
    try {
      const accs = await window.electronAPI.getChartOfAccounts?.();
      const list = Array.isArray(accs) ? accs : (accs?.data || []);
      const incomeOnly = list.filter(a => {
        const t = (a.accountType || a.type || '').toLowerCase();
        return t.includes('income') || t.includes('revenue');
      });
      setIncomeAccounts(incomeOnly);
    } catch (e) {
      console.error('Failed to load income accounts:', e);
    }
  }, []);

  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountForm] = Form.useForm();
  const [categories, setCategories] = useState([]);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catForm] = Form.useForm();
  const [customTypes, setCustomTypes] = useState([]);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [typeForm] = Form.useForm();

  const allTypes = useMemo(() => {
    const defaults = ['Product', 'Service', 'Raw Material', 'Asset', 'Bundle'];
    const merged = [...defaults];
    customTypes.forEach(t => { if (!merged.includes(t)) merged.push(t); });
    return merged;
  }, [customTypes]);

  const handleAddCategory = async () => {
    try {
      const vals = await catForm.validateFields();
      const res = await window.electronAPI.insertProductCategory?.(vals.cat_name);
      if (res?.error) { message.error(res.error); return; }
      setCatModalOpen(false);
      catForm.resetFields();
      loadCategories();
    } catch (e) { if (!e?.errorFields) message.error('Failed to add category'); }
  };

  const handleAddType = async () => {
    try {
      const vals = await typeForm.validateFields();
      const name = vals.type_name?.trim();
      if (!name) return;
      const res = await window.electronAPI.insertProductType?.(name);
      if (res?.error) { message.error(res.error); return; }
      setTypeModalOpen(false);
      typeForm.resetFields();
      loadTypes();
      message.success('Type added');
    } catch (e) { if (!e?.errorFields) message.error('Failed to add type'); }
  };

  const handleAddAccount = async () => {
    try {
      const vals = await accountForm.validateFields();
      const payload = {
        name: vals.name,
        type: 'Income',
        number: vals.code || '',
        description: vals.description || '',
        status: 'Active',
        entered_by: 'system',
      };
      const res = await window.electronAPI.insertChartAccount(payload);
      if (res?.success) {
        message.success('Income account created');
        setAccountModalOpen(false);
        accountForm.resetFields();
        fetchIncomeAccounts();
      } else {
        message.error(res?.error || 'Failed to create account');
      }
    } catch (e) { if (!e?.errorFields) message.error('Failed to create account'); }
  };

  useEffect(() => { fetchItems(); fetchIncomeAccounts(); loadCategories(); loadTypes(); }, [fetchItems, fetchIncomeAccounts]);

  const uniqueCategories = useMemo(() => {
    const cats = new Set();
    items.forEach(i => { if (i.category) cats.add(i.category); });
    return Array.from(cats).sort();
  }, [items]);

  const types = useMemo(() => {
    const ts = new Set();
    items.forEach(i => { if (i.type) ts.add(i.type); });
    return Array.from(ts).sort();
  }, [items]);

  const openAdd = () => { setEditingItem(null); form.resetFields(); setDrawerOpen(true); };
  const openEdit = (record) => {
    setEditingItem(record);
    form.setFieldsValue({
      ...record,
      selling_price: record.selling_price || record.price || record.unitPrice || 0,
      stock: stockOf(record),
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
            '', '', '', 'system', Number(vals.stock) || 0
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

  const handleTableChange = (pag) => { setPagination(p => ({ ...p, current: pag.current, pageSize: pag.pageSize })); fetchItems(pag.current, pag.pageSize, search, typeFilter, categoryFilter); };
  const handleSearch = () => fetchItems(1, pagination.pageSize, search, typeFilter, categoryFilter);
  const handleTypeChange = (v) => { setTypeFilter(v || 'all'); fetchItems(1, pagination.pageSize, search, v || 'all', categoryFilter); };
  const handleCategoryChange = (v) => { setCategoryFilter(v || 'all'); fetchItems(1, pagination.pageSize, search, typeFilter, v || 'all'); };
  const handleRefresh = () => fetchItems(pagination.current, pagination.pageSize, search, typeFilter, categoryFilter);

  const exportCSV = () => {
    try {
      const headers = ['id', 'name', 'sku', 'category', 'type', 'selling_price'];
      const rows = items.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `items_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (_) { message.error('Export failed'); }
  };

  const handlePrint = () => {
    if (!items.length) { message.warning('No data to print'); return; }
    const rowsHtml = items.map(r => `<tr>
      <td>${r.sku || r.code || '-'}</td>
      <td>${(r.name || '-').replace(/</g, '&lt;')}</td>
      <td>${(r.category || '-').replace(/</g, '&lt;')}</td>
      <td>${r.type || '-'}</td>
      <td style="text-align:right">${cSym} ${Number(r.selling_price || r.price || 0).toFixed(2)}</td>
    </tr>`).join('');
    const html = `<!doctype html><html><head><title>Items / Products & Services</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;padding:24px}
      h2{color:#333;margin-bottom:4px}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{border:1px solid #ddd;padding:8px;text-align:left}
      th{background:#f5f5f5}
    </style></head><body>
      <h2>Items / Products & Services</h2>
      <p>Printed: ${new Date().toLocaleDateString()} · ${items.length} item${items.length === 1 ? '' : 's'}</p>
      <table><thead><tr><th>SKU / Code</th><th>Name</th><th>Category</th><th>Type</th><th>Price</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
      <script>window.print();window.close();</script>
    </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  };

  const totalValue = items.reduce((s, r) => s + (Number(r.selling_price || r.price || 0) * stockOf(r)), 0);
  const productCount = items.filter(i => !i.type || i.type === 'Product').length;
  const serviceCount = items.filter(i => i.type === 'Service').length;
  const lowStockCount = items.filter(i => stockOf(i) < 10).length;

  const columns = [
    {
      title: 'SKU / Code', key: 'sku', width: 120,
      sorter: (a, b) => (a.sku || a.code || '').localeCompare(b.sku || b.code || ''),
      render: (_, r) => r.sku || r.code ? <Text code style={{ fontSize: 11 }}>{r.sku || r.code}</Text> : '-',
    },
    {
      title: 'Name', dataIndex: 'name', key: 'name',
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      render: (v) => (
        <Space size={8}>
          <Avatar size={26} style={{ background: '#e6f7ff', color: '#1890ff', fontWeight: 600, fontSize: 12, flexShrink: 0 }}>
            {(v || '?').charAt(0).toUpperCase()}
          </Avatar>
          <span style={{ fontWeight: 500 }}>{v || '-'}</span>
        </Space>
      ),
    },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true, render: v => v || <Text type="secondary">-</Text> },
    { title: 'Category', dataIndex: 'category', key: 'category', render: v => v ? <Tag color="#f0f0f0" style={{ color: '#595959', borderRadius: 4 }}>{v}</Tag> : '-' },
    {
      title: 'Type', dataIndex: 'type', key: 'type',
      render: v => v ? <Tag color={typeColors[v] || 'blue'} style={{ borderRadius: 20, padding: '2px 10px' }}>{v}</Tag> : <Tag color="blue" style={{ borderRadius: 20, padding: '2px 10px' }}>Product</Tag>,
    },
    {
      title: 'Price', key: 'price', width: 120, align: 'right',
      sorter: (a, b) => Number(a.selling_price || a.price || 0) - Number(b.selling_price || b.price || 0),
      render: (_, r) => <span style={{ fontWeight: 600 }}>{cSym} {Number(r.selling_price || r.price || r.unitPrice || 0).toFixed(2)}</span>,
    },
    {
      title: 'Stock', key: 'stock', width: 90, align: 'right',
      render: (_, r) => {
        const s = stockOf(r);
        return <span style={{ fontWeight: 600, color: s <= 0 ? '#cf1322' : s < 10 ? '#fa8c16' : '#3f8600' }}>{s}</span>;
      },
    },
    {
      title: 'Actions', key: 'actions', width: 100, align: 'center',
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} style={{ color: '#595959' }} onClick={() => openEdit(r)} /></Tooltip>
          <Popconfirm title="Delete item?" onConfirm={() => handleDelete(r.id)} okText="Yes" cancelText="No">
            <Tooltip title="Delete"><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const statStyle = { borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', border: '1px solid #f0f0f0' };

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Items / Products & Services</Title>
          <Text type="secondary">Manage products, services and inventory</Text>
        </div>
        <Button type="primary" size="large" icon={<PlusOutlined />} style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(24,144,255,0.35)' }} onClick={openAdd}>
          Add Item
        </Button>
      </div>

      {/* Stat cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={statStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#1890ff,#69c0ff)', color: '#fff', fontSize: 20, flexShrink: 0 }}>
                <AppstoreOutlined />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Total Items</Text>
                <Text strong style={{ fontSize: 18 }}>{pagination.total}</Text>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={statStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#722ed1,#b37feb)', color: '#fff', fontSize: 20, flexShrink: 0 }}>
                <FileTextOutlined />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Products</Text>
                <Text strong style={{ fontSize: 18 }}>{productCount}</Text>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={statStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#52c41a,#95de64)', color: '#fff', fontSize: 20, flexShrink: 0 }}>
                <ShoppingOutlined />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Services</Text>
                <Text strong style={{ fontSize: 18, color: '#52c41a' }}>{serviceCount}</Text>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={statStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#fa8c16,#ffc53d)', color: '#fff', fontSize: 20, flexShrink: 0 }}>
                <BoxPlotOutlined />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Low Stock (&lt;10)</Text>
                <Text strong style={{ fontSize: 18, color: lowStockCount > 0 ? '#fa8c16' : '#52c41a' }}>{lowStockCount}</Text>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Table card */}
      <Card
        bodyStyle={{ padding: 0 }}
        style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}
      >
        {/* Toolbar - search, type, category, refresh, export, print on the left */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: 16, borderBottom: '1px solid #f0f0f0' }}>
          <Input
            placeholder="Search name, SKU, description..."
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            allowClear
            style={{ width: 220, borderRadius: 8 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onPressEnter={handleSearch}
            onClear={() => { setSearch(''); fetchItems(1, pagination.pageSize, '', typeFilter, categoryFilter); }}
          />
          <Select value={typeFilter} onChange={handleTypeChange} style={{ width: 140, borderRadius: 8 }} placeholder="Type">
            <Option value="all">All Types</Option>
            {allTypes.map(t => <Option key={t} value={t}>{t}</Option>)}
          </Select>
          <Select value={categoryFilter} onChange={handleCategoryChange} style={{ width: 150, borderRadius: 8 }} placeholder="Category">
            <Option value="all">All Categories</Option>
            {uniqueCategories.map(c => <Option key={c} value={c}>{c}</Option>)}
          </Select>
          <Tooltip title="Refresh">
            <Button icon={<ReloadOutlined />} style={{ borderRadius: 8 }} onClick={handleRefresh} />
          </Tooltip>
          <Tooltip title="Print">
            <Button icon={<PrinterOutlined />} style={{ borderRadius: 8 }} onClick={handlePrint} />
          </Tooltip>
          <Tooltip title="Download CSV">
            <Button icon={<DownloadOutlined />} style={{ borderRadius: 8 }} onClick={exportCSV} />
          </Tooltip>
          <span style={{ marginLeft: 'auto', color: '#8c8c8c', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <DollarOutlined /> {cSym} {Number(totalValue || 0).toFixed(2)} in stock
          </span>
        </div>
        <Table columns={columns} dataSource={items} loading={loading} rowKey={r => r.id || r.sku || r.name || String(Math.random())}
          onChange={handleTableChange}
          pagination={{ ...pagination, showSizeChanger: true, pageSizeOptions: ['25', '50', '100'], showTotal: t => `${t} items`, style: { margin: 16 } }}
          size="middle" rowClassName={() => 'item-row'} />
      </Card>
      <style>{`
        .item-row:hover > td { background: #f0f7ff !important; }
        .ant-table-tbody > tr > td { border-color: #f5f5f5 !important; }
      `}</style>

      <Drawer title={editingItem ? 'Edit Item' : 'New Item'} width={520} visible={drawerOpen} onClose={() => { setDrawerOpen(false); setEditingItem(null); form.resetFields(); }} destroyOnClose
        footer={<div style={{ textAlign: 'right' }}><Button onClick={() => { setDrawerOpen(false); setEditingItem(null); form.resetFields(); }} style={{ marginRight: 8 }}>Cancel</Button><Button type="primary" onClick={handleSave}>Save</Button></div>}>
        <Form form={form} layout="vertical">
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}><Form.Item name="type" label="Type" initialValue="Product"><Select dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setTypeModalOpen(true)} style={{ width: '100%', textAlign: 'left' }}>Add New Type</Button></>)}>{allTypes.map(t => <Option key={t} value={t}>{t}</Option>)}</Select></Form.Item></Col>
            <Col span={12}><Form.Item name="sku" label="SKU / Code"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}><Input /></Form.Item>
          <Form.Item name="description" label="Description"><TextArea rows={3} /></Form.Item>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}>
              <Form.Item name="category" label="Category">
                <Select allowClear placeholder="Select category"
                  dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setCatModalOpen(true)} style={{ width: '100%', textAlign: 'left' }}>Add New Category</Button></>)}>
                  {categories.map(c => <Option key={c.id} value={c.name}>{c.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}><Form.Item name="selling_price" label="Selling Price" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
          </Row>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}>
              <Form.Item
                name="stock"
                label="Stock / Quantity"
                tooltip="On-hand quantity, read from the inventory engine. It is managed through Inventory → Stock Levels, Adjustments and documents, so it cannot be typed here."
                extra={<Text type="secondary" style={{ fontSize: 11 }}>From Inventory → Stock Levels</Text>}
              >
                <InputNumber style={{ width: '100%' }} disabled />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="income_account" label="Income Account" rules={[{ required: true, message: 'Select Income Account' }]}>
                <Select placeholder="Select Income account" showSearch optionFilterProp="children" allowClear
                  dropdownRender={(menu) => (<>{menu}<div style={{ padding: '4px 8px', borderTop: '1px solid #e8e8e8' }}><Button type="link" icon={<PlusOutlined />} onClick={() => setAccountModalOpen(true)} style={{ width: '100%', textAlign: 'left' }}>Add New Income Account</Button></div></>)}>
                  {incomeAccounts.map(acc => (
                    <Option key={acc.id} value={acc.accountName || acc.name}>
                      {acc.accountName || acc.name}{acc.accountNumber ? ` (${acc.accountNumber})` : ''}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Drawer>

      {/* Add Income Account Modal */}
      <Modal title="New Income Account" visible={accountModalOpen} onOk={handleAddAccount} onCancel={() => setAccountModalOpen(false)} okText="Create" destroyOnClose>
        <Form form={accountForm} layout="vertical" preserve={false}>
          <Form.Item name="name" label="Account Name" rules={[{ required: true, message: 'Enter account name' }]}>
            <Input placeholder="e.g. Service Revenue" />
          </Form.Item>
          <Form.Item name="code" label="Account Code">
            <Input placeholder="e.g. 4000" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional description" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add New Category Modal */}
      <Modal title="Add New Category" visible={catModalOpen} onOk={handleAddCategory} onCancel={() => setCatModalOpen(false)} okText="Add" destroyOnClose>
        <Form form={catForm} layout="vertical" preserve={false}>
          <Form.Item name="cat_name" label="Category Name" rules={[{ required: true, message: 'Enter category name' }]}>
            <Input placeholder="e.g. Electronics" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add New Type Modal */}
      <Modal title="Add New Type" visible={typeModalOpen} onOk={handleAddType} onCancel={() => setTypeModalOpen(false)} okText="Add" destroyOnClose>
        <Form form={typeForm} layout="vertical" preserve={false}>
          <Form.Item name="type_name" label="Type Name" rules={[{ required: true, message: 'Enter type name' }]}>
            <Input placeholder="e.g. Digital Service" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UnifiedItemList;
