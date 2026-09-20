import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import { Card, Table, Button, Form, Input, Select, Space, message, Tag, Tooltip, Row, Col, Drawer, Tabs, Statistic, Popconfirm, Badge, Avatar, Typography, Descriptions, Empty, Divider } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, EyeOutlined, StopOutlined, CheckCircleOutlined, DeleteOutlined, ReloadOutlined, DownloadOutlined, DollarOutlined, ClockCircleOutlined, FileTextOutlined, FileAddOutlined, ShopOutlined, TeamOutlined, UsergroupAddOutlined, MailOutlined, PhoneOutlined, GlobalOutlined, EnvironmentOutlined, IdcardOutlined, BankOutlined, AccountBookOutlined, ProfileOutlined, TagsOutlined, ArrowUpOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';
import { formatPhone, phoneInputHandler } from '../../utils/phone';
import COUNTRIES from '../../utils/countries';
import FormSection, { FORM_ITEM_STYLE } from '../shared/FormSection';
import ContactIdentityNote from '../shared/ContactIdentityNote';
import TaxSettingsSection from '../shared/TaxSettingsSection';
import { deriveDisplayName, identityRule } from '../../utils/contactIdentity';
import { resolveTaxRateFields, taxRateFormValue, describeTaxRate } from '../../utils/taxRate';

const { Option } = Select;
const { TabPane } = Tabs;
const { TextArea } = Input;
const { Title, Text } = Typography;

// Modern stat "tile" card style used across the screen
const statStyle = { borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', border: '1px solid #f0f0f0' };
const iconTile = (bg) => ({
  width: 44, height: 44, borderRadius: 10,
  background: bg, color: '#fff', fontSize: 20, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
});

const SupplierVendorList = () => {
  const history = useHistory();
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
  const [billStats, setBillStats] = useState({ totalPayables: 0, overdueAmount: 0, unpaidBills: 0 });
  const [detailTab, setDetailTab] = useState('1');
  const [vatRates, setVatRates] = useState([]);

  const loadBillStats = useCallback(async () => {
    try {
      const data = await window.electronAPI.getAllExpenses();
      const all = Array.isArray(data) ? data : (data?.data || data?.all || []);
      // Filter to bill/supplier expenses only
      const bills = all.filter(e => (e.category || '').toLowerCase() === 'bill' || (e.category || '').toLowerCase() === 'supplier');
      const unpaid = bills.filter(b => (b.approval_status || '').toLowerCase() !== 'paid' && (b.approval_status || '').toLowerCase() !== 'draft');
      const totalPayables = unpaid.reduce((s, b) => s + (Number(b.amount) || 0), 0);
      const unpaidBills = unpaid.length;
      const overdueAmount = unpaid.reduce((s, b) => {
        const due = b.due_date || b.payment_date;
        return s + (due && moment(due).isBefore(moment(), 'day') ? (Number(b.amount) || 0) : 0);
      }, 0);
      setBillStats({ totalPayables, overdueAmount, unpaidBills });
    } catch (_) {
      setBillStats({ totalPayables: 0, overdueAmount: 0, unpaidBills: 0 });
    }
  }, []);

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

  useEffect(() => { loadSuppliers(); loadBillStats(); }, [loadSuppliers, loadBillStats]);

  useEffect(() => {
    window.electronAPI.getAllVat?.().then(v => setVatRates(Array.isArray(v) ? v : [])).catch(() => {});
  }, []);

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
      // taxable is stored as INTEGER (0/1); the Select expects a boolean
      taxable: record.taxable != null ? !!Number(record.taxable) : true,
      // Prefer the stored ID. If null, the legacy percentage is matched only
      // when it resolves to exactly one saved rate — never guessed between
      // candidates (see utils/taxRate.js).
      default_tax_rate_id: taxRateFormValue(record, vatRates),
    });
    setDrawerOpen(true);
  };

  const openDetail = async (record) => {
    let detail = null;
    try {
      detail = await window.electronAPI.getSingleSupplier(record.id);
      setViewingSupplier(detail || record);
    } catch (_) {
      setViewingSupplier(record);
    }
    const base = detail && !detail.error ? detail : record;
    try {
      const allExp = await window.electronAPI.getAllExpenses();
      const list = Array.isArray(allExp) ? allExp : (allExp?.data || allExp?.all || []);
      const mine = list.filter(e => Number(e.payee) === Number(record.id)
        && ['supplier', 'bill'].includes((e.category || '').toLowerCase()));
      const bills = (Array.isArray(mine) && mine.length) ? mine
        : (Array.isArray(base.expenses) && base.expenses.length ? base.expenses : []);
      setViewingSupplier(prev => {
        const b = prev || base;
        return { ...b, bills };
      });
    } catch (_) { /* keep whatever getSingleSupplier returned */ }
    try {
      const openBills = await window.electronAPI.getOpenBills(record.id);
      setViewingSupplier(prev => {
        const b = prev || base;
        return { ...b, openBills: Array.isArray(openBills) ? openBills : [] };
      });
    } catch (_) { /* keep whatever we have */ }
    setDetailDrawerOpen(true);
    setDetailTab('1');
  };

  const handleSave = async () => {
    try {
      const vals = await form.validateFields();
      // Shared rule: explicit -> personal name -> company. The `'Unnamed'`
      // fallback is gone — it fabricated a name for a record that the rule
      // above has already refused, so it could only ever mask a bug.
      const display = deriveDisplayName(vals);
      // The id is the relationship; the percentage is a denormalized snapshot.
      // One rule for both — see utils/taxRate.js.
      const tax = resolveTaxRateFields(vals, vatRates);

      if (editingSupplier) {
        // Preserve existing values for fields not in the edit form
        const existing = editingSupplier.raw ? editingSupplier.raw : editingSupplier;
        const res = await window.electronAPI.updateSupplier({
          id: editingSupplier.id,
          title: vals.title || existing.title || '',
          first_name: vals.first_name || existing.first_name || '',
          middle_name: vals.middle_name || existing.middle_name || '',
          last_name: vals.last_name || existing.last_name || '',
          suffix: existing.suffix || '',
          email: vals.email || existing.email || '',
          display_name: display,
          company_name: vals.company_name || existing.company_name || '',
          phone_number: vals.phone_number || existing.phone_number || '',
          mobile_number: vals.mobile_number || existing.mobile_number || '',
          fax: existing.fax || '',
          other: existing.other || '',
          website: vals.website || existing.website || '',
          address1: vals.address1 || existing.address1 || '',
          address2: vals.address2 || existing.address2 || '',
          city: vals.city || existing.city || '',
          state: vals.state || existing.state || '',
          postal_code: vals.postal_code || existing.postal_code || '',
          country: vals.country || existing.country || '',
          supplier_terms: vals.supplier_terms || existing.supplier_terms || '',
          business_number: vals.business_number || existing.business_number || '',
          account_number: vals.account_number || existing.account_number || '',
          expense_category: vals.expense_category || existing.expense_category || '',
          opening_balance: Number(vals.opening_balance) || Number(existing.opening_balance) || 0,
          as_of: vals.as_of || existing.as_of || null,
          notes: vals.notes || existing.notes || '',
          vendor_type: vals.vendor_type || existing.vendor_type || 'Regular',
          taxable: vals.taxable != null ? vals.taxable : true,
          default_tax_rate: tax.default_tax_rate,
          default_tax_rate_id: tax.default_tax_rate_id,
        });
        // The API returns `{ error }` rather than throwing; without this the
        // screen reported success for a write that was refused.
        if (res && res.error) { message.error(res.error); return; }
        message.success('Supplier/Vendor updated');
      } else {
        const res = await window.electronAPI.insertSupplier(
          vals.title || '', vals.first_name || '', vals.middle_name || '', vals.last_name || '', '',
          vals.email || '', display, vals.company_name || '', vals.phone_number || '', vals.mobile_number || '',
          '', '', vals.website || '', vals.address1 || '', vals.address2 || '', vals.city || '', vals.state || '',
          vals.postal_code || '', vals.country || '', vals.supplier_terms || '', vals.business_number || '',
          vals.account_number || '', vals.expense_category || '', Number(vals.opening_balance) || 0,
          vals.as_of || null, 'system', vals.notes || '', vals.vendor_type || 'Regular',
          vals.taxable != null ? vals.taxable : true,
          tax.default_tax_rate,
          tax.default_tax_rate_id
        );
        if (res && res.error) { message.error(res.error); return; }
        if (res && res.success === false) { message.error('Failed to add supplier/vendor'); return; }
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
      title: 'Name', dataIndex: 'display_name', key: 'display_name', width: 220, ellipsis: true,
      sorter: (a, b) => (a.display_name || '').localeCompare(b.display_name || ''),
      render: (v, r) => {
        const nm = v || `${r.first_name || ''} ${r.last_name || ''}`.trim() || '-';
        const initials = nm.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
        return (
          <Space size={10}>
            <Avatar size={34} style={{ background: 'linear-gradient(135deg,#722ed1,#b37feb)', fontSize: 14, fontWeight: 600, flexShrink: 0 }}>
              {initials || 'S'}
            </Avatar>
            <div>
              <Button type="link" style={{ padding: 0, fontWeight: 600, lineHeight: '20px' }} onClick={() => openDetail(r)}>{nm}</Button>
              {r.company_name && <div><Text type="secondary" style={{ fontSize: 12 }}>{r.company_name}</Text></div>}
            </div>
          </Space>
        );
      }
    },
    { title: 'Email', dataIndex: 'email', key: 'email', width: 160, ellipsis: true, render: v => v ? <a href={`mailto:${v}`}>{v}</a> : '-' },
    { title: 'Phone', dataIndex: 'phone_number', key: 'phone_number', width: 110, render: v => formatPhone(v) || '-' },
    { title: 'City', dataIndex: 'city', key: 'city', width: 100, ellipsis: true, render: v => v || '-' },
    {
      title: 'Type', dataIndex: 'vendor_type', key: 'vendor_type', width: 105,
      render: (v) => <Tag color={v === '1099' ? 'red' : v === 'Contractor' ? 'blue' : v === 'Credit Card' ? 'purple' : 'default'}>{v || 'Regular'}</Tag>
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: (v) => <Tag color={(v || 'Active') === 'Active' ? 'green' : 'red'} style={{ borderRadius: 20, paddingInline: 10 }}>{v || 'Active'}</Tag>
    },
    {
      title: 'Pending', key: 'due_amount', width: 105, align: 'right',
      sorter: (a, b) => (Number(a.due_amount) || 0) - (Number(b.due_amount) || 0),
      render: (_, r) => {
        const due = Number(r.due_amount) || 0;
        return due > 0
          ? <span style={{ color: '#fa541c', fontWeight: 500 }}>{cSym} {due.toFixed(2)}</span>
          : <span style={{ color: '#52c41a' }}>{cSym} 0.00</span>;
      }
    },
    {
      title: 'Actions', key: 'actions', width: 200,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="View"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)} /></Tooltip>
          <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          <Tooltip title={(r.status || 'Active') === 'Active' ? 'Deactivate' : 'Activate'}>
            <Button type="text" size="small" icon={(r.status || 'Active') === 'Active' ? <StopOutlined /> : <CheckCircleOutlined />} onClick={() => toggleStatus(r)} />
          </Tooltip>
          <Popconfirm title="Delete this supplier?" onConfirm={() => handleDelete(r.id)} okText="Yes" cancelText="No">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
          <Tooltip title="Enter Bill"><Button type="text" size="small" icon={<FileAddOutlined />} onClick={() => history.push(`/main/vendors/bills/new?vendor=${r.id}`)} /></Tooltip>
        </Space>
      )
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}><ShopOutlined style={{ marginRight: 8 }} />Suppliers / Vendors</Title>
          <Text type="secondary">Manage your suppliers, vendors, payables and terms</Text>
        </div>
        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={openAdd}
          style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(114,46,209,0.35)', fontWeight: 600 }}>Add Supplier / Vendor</Button>
      </div>

      {/* Stat tiles */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={statStyle}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={iconTile('linear-gradient(135deg,#722ed1,#b37feb)')}><TeamOutlined /></div>
            <div><Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Total Vendors</Text><Text strong style={{ fontSize: 18 }}>{suppliers.length}</Text></div>
          </div></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={statStyle}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={iconTile('linear-gradient(135deg,#52c41a,#95de64)')}><CheckCircleOutlined /></div>
            <div><Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Active</Text><Text strong style={{ fontSize: 18, color: '#3f8600' }}>{activeCount}</Text></div>
          </div></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={statStyle}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={iconTile('linear-gradient(135deg,#cf1322,#ff7875)')}><StopOutlined /></div>
            <div><Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Inactive</Text><Text strong style={{ fontSize: 18, color: '#cf1322' }}>{inactiveCount}</Text></div>
          </div></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={statStyle}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={iconTile('linear-gradient(135deg,#1890ff,#69c0ff)')}><UsergroupAddOutlined /></div>
            <div><Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Filtered</Text><Text strong style={{ fontSize: 18 }}>{filtered.length}</Text></div>
          </div></Card>
        </Col>
      </Row>

      {/* Payables tiles */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={8}>
          <Card size="small" style={statStyle}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={iconTile('linear-gradient(135deg,#722ed1,#b37feb)')}><DollarOutlined /></div>
            <div><Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Total Payables</Text><Text strong style={{ fontSize: 18, color: '#722ed1' }}>{cSym}{billStats.totalPayables.toFixed(2)}</Text></div>
          </div></Card>
        </Col>
        <Col xs={8}>
          <Card size="small" style={statStyle}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={iconTile('linear-gradient(135deg,#cf1322,#ff7875)')}><ClockCircleOutlined /></div>
            <div><Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Overdue Amount</Text><Text strong style={{ fontSize: 18, color: '#cf1322' }}>{cSym}{billStats.overdueAmount.toFixed(2)}</Text></div>
          </div></Card>
        </Col>
        <Col xs={8}>
          <Card size="small" style={statStyle}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={iconTile('linear-gradient(135deg,#fa8c16,#ffc53d)')}><FileTextOutlined /></div>
            <div><Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Unpaid Bills</Text><Text strong style={{ fontSize: 18, color: '#fa8c16' }}>{billStats.unpaidBills}</Text></div>
          </div></Card>
        </Col>
      </Row>

      {/* Table card */}
      <Card size="small" style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }} bodyStyle={{ padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderBottom: '1px solid #f0f0f0', flexWrap: 'wrap' }}>
          <Input.Search allowClear placeholder="Search by name, company, email, phone..." prefix={<SearchOutlined />}
            onChange={e => setSearch(e.target.value)} onSearch={v => setSearch(v)} style={{ width: 320, marginRight: 'auto' }} />
          <Select value={statusFilter} onChange={v => setStatusFilter(v)} style={{ width: 150 }}>
            <Option value="all">All Statuses</Option>
            <Option value="Active">Active</Option>
            <Option value="Inactive">Inactive</Option>
          </Select>
          <Button icon={<DownloadOutlined />} onClick={exportCSV}>Export</Button>
          <Button icon={<ReloadOutlined />} onClick={loadSuppliers}>Refresh</Button>
        </div>
        <Table columns={columns} dataSource={filtered} loading={loading} rowKey={r => r.id} scroll={{ x: 1000 }}
          pagination={{ defaultPageSize: 20, defaultCurrent: 1, showSizeChanger: true, showTotal: t => `${t} suppliers/vendors` }}
          size="middle" />
      </Card>

      {/* Add/Edit Drawer */}
      {drawerOpen && <Drawer title={editingSupplier ? 'Edit Supplier / Vendor' : 'Add Supplier / Vendor'} width={600}
        className="app-form-drawer"
        visible onClose={() => setDrawerOpen(false)}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Button onClick={() => setDrawerOpen(false)} style={{ marginRight: 8 }}>Cancel</Button>
            <Button type="primary" onClick={handleSave}>Save</Button>
          </div>
        }>
        <Form form={form} layout="vertical">
          <FormSection title="Vendor Information" icon={<ShopOutlined />}>
            <Row gutter={12}>
              <Col xs={24} md={12} lg={8}>
                <Form.Item name="title" label="Title" style={FORM_ITEM_STYLE}>
                  <Select allowClear placeholder="Title"><Option value="Mr">Mr</Option><Option value="Mrs">Mrs</Option><Option value="Ms">Ms</Option><Option value="Dr">Dr</Option></Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={12} lg={8}>
                {/* No `*`: neither field is required alone — the pair is. */}
                <Form.Item name="first_name" label="First Name" style={FORM_ITEM_STYLE} rules={identityRule(form)}>
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={12} lg={8}>
                <Form.Item name="last_name" label="Last Name" style={FORM_ITEM_STYLE}><Input /></Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="display_name" label="Display Name" style={FORM_ITEM_STYLE}><Input placeholder="Auto-generated if blank" /></Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="company_name" label="Company" style={FORM_ITEM_STYLE}><Input /></Form.Item>
              </Col>
            </Row>
            <ContactIdentityNote />
          </FormSection>

          <FormSection title="Contact Information" icon={<PhoneOutlined />}>
            <Row gutter={12}>
              <Col xs={24} sm={12}>
                <Form.Item name="email" label="Email" style={FORM_ITEM_STYLE}><Input type="email" /></Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="phone_number" label="Phone" style={FORM_ITEM_STYLE}>
                  <Input onChange={e => form.setFieldsValue({ phone_number: phoneInputHandler(e.target.value) })} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="mobile_number" label="Mobile" style={FORM_ITEM_STYLE}>
                  <Input onChange={e => form.setFieldsValue({ mobile_number: phoneInputHandler(e.target.value) })} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="website" label="Website" style={FORM_ITEM_STYLE}><Input /></Form.Item>
              </Col>
            </Row>
          </FormSection>

          <FormSection title="Address" icon={<EnvironmentOutlined />}>
            <Row gutter={12}>
              <Col xs={24} sm={12}>
                <Form.Item name="address1" label="Address Line 1" style={FORM_ITEM_STYLE}><Input /></Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="address2" label="Address Line 2" style={FORM_ITEM_STYLE}><Input /></Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item name="city" label="City" style={FORM_ITEM_STYLE}><Input /></Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item name="state" label="State/Province" style={FORM_ITEM_STYLE}><Input /></Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item name="postal_code" label="Postal Code" style={FORM_ITEM_STYLE}><Input /></Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item name="country" label="Country" style={FORM_ITEM_STYLE}>
                  <Select showSearch placeholder="Select country" allowClear optionFilterProp="children">{COUNTRIES.map(c => <Option key={c} value={c}>{c}</Option>)}</Select>
                </Form.Item>
              </Col>
            </Row>
          </FormSection>

          <FormSection title="Payment Settings" icon={<DollarOutlined />}>
            <Row gutter={12}>
              <Col xs={24} sm={12}>
                <Form.Item name="supplier_terms" label="Payment Terms" style={FORM_ITEM_STYLE}>
                  <Select allowClear><Option value="Net 15">Net 15</Option><Option value="Net 30">Net 30</Option><Option value="Net 60">Net 60</Option><Option value="Due on receipt">Due on receipt</Option></Select>
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="business_number" label="Business/Tax Number" style={FORM_ITEM_STYLE}><Input /></Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="account_number" label="Account Number" style={FORM_ITEM_STYLE}><Input /></Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="opening_balance" label="Opening Balance" style={FORM_ITEM_STYLE}><Input type="number" /></Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="expense_category" label="Default Expense Category" style={FORM_ITEM_STYLE}><Input /></Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="vendor_type" label="Vendor Type" initialValue="Regular" style={FORM_ITEM_STYLE}>
                  <Select>
                    <Option value="Regular">Regular</Option>
                    <Option value="1099">1099 Vendor</Option>
                    <Option value="Contractor">Contractor</Option>
                    <Option value="Government">Government</Option>
                    <Option value="Credit Card">Credit Card</Option>
                    <Option value="Loan Lender">Loan Lender</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
          </FormSection>

          <TaxSettingsSection vatRates={vatRates} form={form} />

          <FormSection title="Notes" icon={<FileTextOutlined />}>
            <Row gutter={12}>
              <Col span={24}>
                <Form.Item name="notes" label="Notes" style={FORM_ITEM_STYLE}><TextArea rows={3} /></Form.Item>
              </Col>
            </Row>
          </FormSection>
        </Form>
      </Drawer>}

      {/* Detail Drawer */}
      <Drawer title={null} closable width={520} visible={detailDrawerOpen} onClose={() => setDetailDrawerOpen(false)} className="gx-profile-drawer">
        {viewingSupplier && (
          <div>
            {(() => {
              const nm = viewingSupplier.display_name || `${viewingSupplier.first_name || ''} ${viewingSupplier.last_name || ''}`.trim() || 'Supplier';
              const initials = nm.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
              const active = (viewingSupplier.status || 'Active') === 'Active';
              const addr = [viewingSupplier.address1, viewingSupplier.address2, viewingSupplier.city, viewingSupplier.state, viewingSupplier.postal_code, viewingSupplier.country].filter(Boolean).join(', ') || '—';
              const pendingAmount = Number(viewingSupplier?.due_amount?.due_amount ?? viewingSupplier?.due_amount ?? 0) || 0;
              const allBills = Array.isArray(viewingSupplier.bills) ? viewingSupplier.bills : [];
              const openBills = Array.isArray(viewingSupplier.openBills) ? viewingSupplier.openBills : [];
              const fromAll = allBills.filter(b => {
                const st = (b.approval_status || '').toLowerCase();
                return st !== 'paid' && st !== 'cancelled' && st !== 'void' && st !== 'draft';
              });
              const pendingBills = openBills.length ? openBills : fromAll;
              const vendorColor = viewingSupplier.vendor_type === '1099' ? 'red' : viewingSupplier.vendor_type === 'Contractor' ? 'blue' : viewingSupplier.vendor_type === 'Credit Card' ? 'purple' : viewingSupplier.vendor_type === 'Loan Lender' ? 'volcano' : 'default';
              return (
                <div>
                  {/* Header */}
                  <div style={{ textAlign: 'center', padding: '24px 16px 20px' }}>
                    <Avatar size={72} style={{ background: 'linear-gradient(135deg,#722ed1,#b37feb)', fontSize: 26, fontWeight: 700, marginBottom: 12 }}>{initials || 'S'}</Avatar>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{nm}</div>
                    {viewingSupplier.company_name && <div style={{ color: 'rgba(0,0,0,0.45)', marginBottom: 8 }}>{viewingSupplier.company_name}</div>}
                    <div>
                      <Tag color={active ? 'green' : 'red'} style={{ borderRadius: 20, paddingInline: 12 }}>{viewingSupplier.status || 'Active'}</Tag>
                      <Tag color={vendorColor} style={{ borderRadius: 20, paddingInline: 12 }}>{viewingSupplier.vendor_type || 'Regular'}</Tag>
                    </div>
                  </div>

                  {/* Stat tiles */}
                  <Row gutter={12} style={{ marginBottom: 20 }}>
                    <Col span={8}>
                      <div style={{ backgroundColor: '#fff7e6', border: '1px solid #ffd591', borderRadius: 10, padding: '12px 8px', textAlign: 'center' }}>
                        <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Amount Pending</Text>
                        <Text strong style={{ fontSize: 16, color: '#d46b08' }}>{cSym}{pendingAmount.toFixed(2)}</Text>
                      </div>
                    </Col>
                    <Col span={8}>
                      <div style={{ borderRadius: 10, border: '1px solid #f0f0f0', padding: '12px 8px', textAlign: 'center' }}>
                        <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Open Bills</Text>
                        <Text strong style={{ fontSize: 16 }}>{pendingBills.length}</Text>
                      </div>
                    </Col>
                    <Col span={8}>
                      <div style={{ borderRadius: 10, border: '1px solid #f0f0f0', padding: '12px 8px', textAlign: 'center' }}>
                        <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Bills</Text>
                        <Text strong style={{ fontSize: 16 }}>{allBills.length}</Text>
                      </div>
                    </Col>
                  </Row>

                  <Tabs activeKey={detailTab} onChange={setDetailTab} type="card" tabBarStyle={{ marginBottom: 12 }}>
                    <TabPane tab={<span><TagsOutlined /> Info</span>} key="1">
                      <Descriptions column={1} size="small" labelStyle={{ width: 110, color: 'rgba(0,0,0,0.45)' }} contentStyle={{ paddingBottom: 8 }}>
                        <Descriptions.Item label="Display Name">{nm}</Descriptions.Item>
                        <Descriptions.Item label="Company">{viewingSupplier.company_name || '—'}</Descriptions.Item>
                        {viewingSupplier.first_name && <Descriptions.Item label="First Name">{viewingSupplier.first_name}</Descriptions.Item>}
                        {viewingSupplier.last_name && <Descriptions.Item label="Last Name">{viewingSupplier.last_name}</Descriptions.Item>}
                        <Descriptions.Item label="Date Entered">{viewingSupplier.date_entered ? moment(viewingSupplier.date_entered).format('MM/DD/YYYY') : '—'}</Descriptions.Item>
                        <Descriptions.Item label="Email">{viewingSupplier.email ? <a href={`mailto:${viewingSupplier.email}`}>{viewingSupplier.email}</a> : '—'}</Descriptions.Item>
                        <Descriptions.Item label="Phone">{formatPhone(viewingSupplier.phone_number) || '—'}</Descriptions.Item>
                        {viewingSupplier.mobile_number && <Descriptions.Item label="Mobile">{formatPhone(viewingSupplier.mobile_number)}</Descriptions.Item>}
                        {viewingSupplier.website && <Descriptions.Item label="Website">{viewingSupplier.website}</Descriptions.Item>}
                        <Descriptions.Item label="Address">{addr}</Descriptions.Item>
                        <Descriptions.Item label="Terms">{viewingSupplier.supplier_terms || '—'}</Descriptions.Item>
                        <Descriptions.Item label="Tax Status">{viewingSupplier.taxable != null ? (Number(viewingSupplier.taxable) ? 'Taxable' : 'Non-Taxable') : 'Taxable'}</Descriptions.Item>
                        <Descriptions.Item label="Default Tax Rate">{describeTaxRate(viewingSupplier, vatRates)}</Descriptions.Item>
                        {viewingSupplier.business_number && <Descriptions.Item label="Business #">{viewingSupplier.business_number}</Descriptions.Item>}
                        {viewingSupplier.account_number && <Descriptions.Item label="Account #">{viewingSupplier.account_number}</Descriptions.Item>}
                        {viewingSupplier.expense_category && <Descriptions.Item label="Expense Cat."><Tag>{viewingSupplier.expense_category}</Tag></Descriptions.Item>}
                        {viewingSupplier.opening_balance ? (
                          <Descriptions.Item label="Opening Balance">
                            {cSym}{Number(viewingSupplier.opening_balance).toFixed(2)}
                            {viewingSupplier.as_of ? <span style={{ color: 'rgba(0,0,0,0.45)' }}> as of {moment(viewingSupplier.as_of).format('MM/DD/YYYY')}</span> : null}
                          </Descriptions.Item>
                        ) : null}
                      </Descriptions>
                      {(viewingSupplier.notes && viewingSupplier.notes !== 'null') && (
                        <>
                          <Divider style={{ margin: '12px 0' }} />
                          <div style={{ color: 'rgba(0,0,0,0.45)', marginBottom: 6 }}>Notes</div>
                          <div>{viewingSupplier.notes}</div>
                        </>
                      )}
                    </TabPane>
                    <TabPane tab={<span><FileTextOutlined /> Bills</span>} key="2">
                      {allBills.length > 0 ? (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <Text type="secondary">{pendingBills.length} open / {allBills.length} total bills</Text>
                            <Space size={6}>
                              <Button size="small" icon={<FileAddOutlined />} onClick={() => history.push(`/main/vendors/bills/enter?vendor=${viewingSupplier.id}`)}>Enter Bill</Button>
                              <Button size="small" icon={<SearchOutlined />} onClick={() => history.push('/main/vendors/bills/tracker')}>Get Bills</Button>
                            </Space>
                          </div>
                          <Table size="small" dataSource={allBills} rowKey={(r) => r.id} pagination={false} scroll={{ x: 520 }}
                            columns={[
                              { title: '#', dataIndex: 'id', width: 50 },
                              { title: 'Ref #', dataIndex: 'ref_no', width: 100, ellipsis: true, render: v => v || '—' },
                              { title: 'Date', dataIndex: 'payment_date', width: 95, render: v => v ? moment(v).format('MM/DD/YYYY') : '—' },
                              { title: 'Due', dataIndex: 'due_date', width: 95, render: (v, r) => { const d = v || r.payment_date; return d ? moment(d).format('MM/DD/YYYY') : '—'; } },
                              { title: 'Amount', dataIndex: 'amount', width: 90, align: 'right', render: v => `${cSym} ${Number(v || 0).toFixed(2)}` },
                              { title: 'Pending', key: 'pending', width: 90, align: 'right',
                                render: (_, r) => { const p = (Number(r.amount) || 0) - (Number(r.paid_amount) || 0); return p > 0 ? <Text strong style={{ color: '#fa541c' }}>{cSym} {p.toFixed(2)}</Text> : <Text type="secondary">—</Text>; } },
                              { title: 'Status', dataIndex: 'approval_status', width: 90,
                                render: v => { const s = (v || '').toLowerCase(); return <Tag color={s === 'paid' ? 'green' : s === 'overdue' ? 'red' : s === 'pending' ? 'orange' : 'default'}>{v}</Tag>; } },
                            ]} />
                        </>
                      ) : <Empty description="No bills for this supplier" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
                    </TabPane>
                  </Tabs>
                </div>
              );
            })()}
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default SupplierVendorList;
