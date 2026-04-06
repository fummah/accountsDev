import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Space, message, Tag, Tooltip, Row, Col, Drawer, Tabs, Statistic, Popconfirm, Badge } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, EyeOutlined, StopOutlined, CheckCircleOutlined, DeleteOutlined, ReloadOutlined, DownloadOutlined } from '@ant-design/icons';
import { useCurrency } from '../../utils/currency';

const { Option } = Select;
const { TabPane } = Tabs;
const { TextArea } = Input;

const SupplierVendorList = () => {
  const { symbol: cSym } = useCurrency();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [viewingSupplier, setViewingSupplier] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [form] = Form.useForm();

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getAllSuppliers();
      const list = Array.isArray(data) ? data : (data?.data || data?.all || []);
      setSuppliers(list);
    } catch (err) {
      message.error('Failed to load suppliers/vendors');
      setSuppliers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);

  const filtered = useMemo(() => {
    let list = suppliers;
    if (statusFilter !== 'all') {
      list = list.filter(s => (s.status || 'Active') === statusFilter);
    }
    const q = search.toLowerCase().trim();
    if (q) {
      list = list.filter(s =>
        (s.display_name || '').toLowerCase().includes(q) ||
        (s.first_name || '').toLowerCase().includes(q) ||
        (s.last_name || '').toLowerCase().includes(q) ||
        (s.company_name || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.phone_number || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [suppliers, search, statusFilter]);

  const openAdd = () => {
    setEditingSupplier(null);
    form.resetFields();
    setDrawerOpen(true);
  };

  const openEdit = (record) => {
    setEditingSupplier(record);
    form.setFieldsValue({
      ...record,
      display_name: record.display_name || `${record.first_name || ''} ${record.last_name || ''}`.trim(),
    });
    setDrawerOpen(true);
  };

  const openDetail = async (record) => {
    try {
      const detail = await window.electronAPI.getSingleSupplier(record.id);
      setViewingSupplier(detail || record);
    } catch (_) {
      setViewingSupplier(record);
    }
    setDetailDrawerOpen(true);
  };

  const handleSave = async () => {
    try {
      const vals = await form.validateFields();
      const display = vals.display_name || `${vals.first_name || ''} ${vals.last_name || ''}`.trim() || vals.company_name || 'Unnamed';

      if (editingSupplier) {
        await window.electronAPI.updateSupplier({
          id: editingSupplier.id,
          title: vals.title || '',
          first_name: vals.first_name || '',
          middle_name: vals.middle_name || '',
          last_name: vals.last_name || '',
          suffix: '',
          email: vals.email || '',
          display_name: display,
          company_name: vals.company_name || '',
          phone_number: vals.phone_number || '',
          mobile_number: vals.mobile_number || '',
          fax: '',
          other: '',
          website: vals.website || '',
          address1: vals.address1 || '',
          address2: vals.address2 || '',
          city: vals.city || '',
          state: vals.state || '',
          postal_code: vals.postal_code || '',
          country: vals.country || '',
          supplier_terms: vals.supplier_terms || '',
          business_number: vals.business_number || '',
          account_number: vals.account_number || '',
          expense_category: vals.expense_category || '',
          opening_balance: Number(vals.opening_balance) || 0,
          as_of: vals.as_of || null,
          notes: vals.notes || '',
        });
        message.success('Supplier/Vendor updated');
      } else {
        await window.electronAPI.insertSupplier(
          vals.title || '', vals.first_name || '', vals.middle_name || '', vals.last_name || '', '',
          vals.email || '', display, vals.company_name || '', vals.phone_number || '', vals.mobile_number || '',
          '', '', vals.website || '', vals.address1 || '', vals.address2 || '', vals.city || '', vals.state || '',
          vals.postal_code || '', vals.country || '', vals.supplier_terms || '', vals.business_number || '',
          vals.account_number || '', vals.expense_category || '', Number(vals.opening_balance) || 0,
          vals.as_of || null, 'system', vals.notes || ''
        );
        message.success('Supplier/Vendor added');
      }
      setDrawerOpen(false);
      form.resetFields();
      loadSuppliers();
    } catch (e) {
      if (!e?.errorFields) message.error(e?.message || 'Save failed');
    }
  };

  const toggleStatus = async (record) => {
    const newStatus = (record.status || 'Active') === 'Active' ? 'Inactive' : 'Active';
    const res = await window.electronAPI.supplierToggleStatus(record.id, newStatus);
    if (res?.success) {
      message.success(`Supplier ${newStatus === 'Active' ? 'activated' : 'deactivated'}`);
      loadSuppliers();
    } else {
      message.error(res?.error || 'Failed to update status');
    }
  };

  const handleDelete = async (id) => {
    const res = await window.electronAPI.deleteSupplier(id);
    if (res?.success) {
      message.success('Supplier deleted');
      loadSuppliers();
    } else {
      message.error(res?.error || 'Delete failed');
    }
  };

  const exportCSV = () => {
    try {
      const headers = ['id', 'display_name', 'company_name', 'email', 'phone_number', 'city', 'status'];
      const rows = filtered.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `suppliers_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (_) { message.error('Export failed'); }
  };

  const activeCount = suppliers.filter(s => (s.status || 'Active') === 'Active').length;
  const inactiveCount = suppliers.filter(s => s.status === 'Inactive').length;

  const columns = [
    {
      title: 'Name', dataIndex: 'display_name', key: 'display_name', sorter: (a, b) => (a.display_name || '').localeCompare(b.display_name || ''),
      render: (v, r) => <Button type="link" style={{ padding: 0 }} onClick={() => openDetail(r)}>{v || `${r.first_name || ''} ${r.last_name || ''}`.trim() || '-'}</Button>
    },
    { title: 'Company', dataIndex: 'company_name', key: 'company_name', sorter: (a, b) => (a.company_name || '').localeCompare(b.company_name || '') },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Phone', dataIndex: 'phone_number', key: 'phone_number' },
    { title: 'City', dataIndex: 'city', key: 'city' },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: (v) => <Tag color={(v || 'Active') === 'Active' ? 'green' : 'red'}>{v || 'Active'}</Tag>
    },
    {
      title: 'Actions', key: 'actions', width: 180,
      render: (_, r) => (
        <Space size="small">
          <Tooltip title="View"><Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)} /></Tooltip>
          <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          <Tooltip title={(r.status || 'Active') === 'Active' ? 'Deactivate' : 'Activate'}>
            <Button size="small" icon={(r.status || 'Active') === 'Active' ? <StopOutlined /> : <CheckCircleOutlined />} onClick={() => toggleStatus(r)} />
          </Tooltip>
          <Popconfirm title="Delete this supplier?" onConfirm={() => handleDelete(r.id)} okText="Yes" cancelText="No">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={<span style={{ fontSize: 18, fontWeight: 600 }}>Suppliers / Vendors</span>}
        extra={
          <Space>
            <Button icon={<DownloadOutlined />} onClick={exportCSV}>Export CSV</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Supplier / Vendor</Button>
          </Space>
        }
      >
        <Row gutter={16} style={{ marginBottom: 16, flexDirection: 'row', flexWrap: 'wrap' }}>
          <Col span={6}>
            <Card size="small" style={{ textAlign: 'center' }}>
              <Statistic title="Total" value={suppliers.length} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" style={{ textAlign: 'center' }}>
              <Statistic title="Active" value={activeCount} valueStyle={{ color: '#3f8600' }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" style={{ textAlign: 'center' }}>
              <Statistic title="Inactive" value={inactiveCount} valueStyle={{ color: '#cf1322' }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" style={{ textAlign: 'center' }}>
              <Statistic title="Filtered" value={filtered.length} />
            </Card>
          </Col>
        </Row>

        <Space style={{ marginBottom: 16 }} wrap>
          <Input.Search allowClear placeholder="Search by name, company, email, phone..." prefix={<SearchOutlined />}
            onSearch={v => setSearch(v)} onChange={e => { if (!e.target.value) setSearch(''); }} style={{ width: 320 }} />
          <Select value={statusFilter} onChange={v => setStatusFilter(v)} style={{ width: 150 }}>
            <Option value="all">All Statuses</Option>
            <Option value="Active">Active</Option>
            <Option value="Inactive">Inactive</Option>
          </Select>
          <Button icon={<ReloadOutlined />} onClick={loadSuppliers}>Refresh</Button>
        </Space>

        <Table columns={columns} dataSource={filtered} loading={loading} rowKey={r => r.id}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} suppliers/vendors` }}
          size="middle" />
      </Card>

      {/* Add/Edit Drawer */}
      <Drawer title={editingSupplier ? 'Edit Supplier / Vendor' : 'Add Supplier / Vendor'} width={640}
        visible={drawerOpen} onClose={() => setDrawerOpen(false)}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Button onClick={() => setDrawerOpen(false)} style={{ marginRight: 8 }}>Cancel</Button>
            <Button type="primary" onClick={handleSave}>Save</Button>
          </div>
        }>
        <Form form={form} layout="vertical">
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={8}><Form.Item name="title" label="Title"><Select allowClear placeholder="Title"><Option value="Mr">Mr</Option><Option value="Mrs">Mrs</Option><Option value="Ms">Ms</Option><Option value="Dr">Dr</Option></Select></Form.Item></Col>
            <Col span={8}><Form.Item name="first_name" label="First Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="last_name" label="Last Name"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}><Form.Item name="display_name" label="Display Name"><Input placeholder="Auto-generated if blank" /></Form.Item></Col>
            <Col span={12}><Form.Item name="company_name" label="Company"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}><Form.Item name="email" label="Email"><Input type="email" /></Form.Item></Col>
            <Col span={12}><Form.Item name="phone_number" label="Phone"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}><Form.Item name="mobile_number" label="Mobile"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="website" label="Website"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}><Form.Item name="address1" label="Address Line 1"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="address2" label="Address Line 2"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={8}><Form.Item name="city" label="City"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="state" label="State/Province"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="postal_code" label="Postal Code"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}><Form.Item name="country" label="Country"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="supplier_terms" label="Payment Terms"><Select allowClear><Option value="Net 15">Net 15</Option><Option value="Net 30">Net 30</Option><Option value="Net 60">Net 60</Option><Option value="Due on receipt">Due on receipt</Option></Select></Form.Item></Col>
          </Row>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}><Form.Item name="business_number" label="Business/Tax Number"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="account_number" label="Account Number"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}><Form.Item name="opening_balance" label="Opening Balance"><Input type="number" /></Form.Item></Col>
            <Col span={12}><Form.Item name="expense_category" label="Default Expense Category"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="notes" label="Notes"><TextArea rows={3} /></Form.Item>
        </Form>
      </Drawer>

      {/* Detail Drawer */}
      <Drawer title="Supplier / Vendor Details" width={560} visible={detailDrawerOpen} onClose={() => setDetailDrawerOpen(false)}>
        {viewingSupplier && (
          <div>
            <Row gutter={16} style={{ marginBottom: 16, flexDirection: 'row', flexWrap: 'wrap' }}>
              <Col span={12}>
                <Statistic title="Outstanding" value={viewingSupplier?.due_amount?.due_amount || 0} prefix={cSym} precision={2} valueStyle={{ color: '#cf1322' }} />
              </Col>
              <Col span={12}>
                <Statistic title="Status" value={viewingSupplier?.status || 'Active'} valueStyle={{ color: (viewingSupplier?.status || 'Active') === 'Active' ? '#3f8600' : '#cf1322' }} />
              </Col>
            </Row>
            <Tabs defaultActiveKey="1">
              <TabPane tab="Info" key="1">
                <p><strong>Name:</strong> {viewingSupplier.display_name || `${viewingSupplier.first_name || ''} ${viewingSupplier.last_name || ''}`.trim()}</p>
                <p><strong>Company:</strong> {viewingSupplier.company_name || '-'}</p>
                <p><strong>Email:</strong> {viewingSupplier.email || '-'}</p>
                <p><strong>Phone:</strong> {viewingSupplier.phone_number || '-'}</p>
                <p><strong>Address:</strong> {[viewingSupplier.address1, viewingSupplier.city, viewingSupplier.state, viewingSupplier.postal_code, viewingSupplier.country].filter(Boolean).join(', ') || '-'}</p>
                <p><strong>Payment Terms:</strong> {viewingSupplier.supplier_terms || '-'}</p>
                <p><strong>Business #:</strong> {viewingSupplier.business_number || '-'}</p>
                <p><strong>Notes:</strong> {viewingSupplier.notes || '-'}</p>
              </TabPane>
              <TabPane tab="Expenses" key="2">
                {viewingSupplier.expenses && viewingSupplier.expenses.length > 0 ? (
                  <Table size="small" dataSource={viewingSupplier.expenses} rowKey="id" pagination={false}
                    columns={[
                      { title: 'ID', dataIndex: 'id' },
                      { title: 'Amount', dataIndex: 'amount', render: v => `${cSym} ${Number(v || 0).toFixed(2)}` },
                      { title: 'Status', dataIndex: 'approval_status', render: v => <Tag color={v === 'Paid' ? 'green' : 'orange'}>{v}</Tag> },
                      { title: 'Account', dataIndex: 'payment_account' },
                    ]} />
                ) : <p style={{ color: '#999' }}>No expenses recorded</p>}
              </TabPane>
            </Tabs>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default SupplierVendorList;
