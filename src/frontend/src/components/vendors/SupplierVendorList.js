import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import { Card, Table, Button, Form, Input, Select, Space, message, Tag, Tooltip, Row, Col, Drawer, Popconfirm, Avatar, Typography } from 'antd';
import { PlusOutlined, EditOutlined, EyeOutlined, StopOutlined, CheckCircleOutlined, DeleteOutlined, DollarOutlined, ClockCircleOutlined, FileTextOutlined, FileAddOutlined, ShopOutlined, TeamOutlined, UsergroupAddOutlined, PhoneOutlined, EnvironmentOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';
import { formatPhone, phoneInputHandler } from '../../utils/phone';
import COUNTRIES from '../../utils/countries';
import FormSection, { FORM_ITEM_STYLE } from '../shared/FormSection';
import ContactIdentityNote from '../shared/ContactIdentityNote';
import VendorDetailsContent from './VendorDetailsContent';
import TaxSettingsSection from '../shared/TaxSettingsSection';
import ListToolbar from '../shared/ListToolbar';
import { toCsv, downloadCsv, csvDate } from '../../utils/csv';
import { deriveDisplayName, identityRule } from '../../utils/contactIdentity';
import { resolveTaxRateFields, taxRateFormValue } from '../../utils/taxRate';

const { Option } = Select;
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

  const openDetail = (record) => {
    // The SHARED VendorDetailsContent loads everything by vendorId, so the
    // drawer only needs the stable id. No duplicated vendor/bill fetching.
    setViewingSupplier(record);
    setDetailDrawerOpen(true);
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
      const headers = ['Vendor Number', 'Display Name', 'Company', 'Email', 'Phone', 'City', 'Status', 'Created Date'];
      const rows = filtered.map(r => ([
        r.id != null ? r.id : '',
        r.display_name || `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.company_name || '',
        r.company_name || '', r.email || '', r.phone_number || '', r.city || '',
        r.status || 'Active', csvDate(r.date_entered),
      ]));
      downloadCsv(`Suppliers_${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, rows));
    } catch (e) {
      console.error('[suppliers] export failed:', e);
      message.error('Export failed');
    }
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
        <ListToolbar
          searchPlaceholder="Search by name, company, email, phone..."
          searchValue={search}
          onSearchChange={setSearch}
          onSearch={v => setSearch(v)}
          statusValue={statusFilter}
          onStatusChange={setStatusFilter}
          onExport={exportCSV}
          onRefresh={loadSuppliers}
          refreshLoading={loading}
          primaryAction={
            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}
              style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(114,46,209,0.35)', fontWeight: 600 }}>Add Supplier / Vendor</Button>
          }
        />
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

      {/* Detail Drawer — SHARED VendorDetailsContent (identical to PO -> View Vendor) */}
      <Drawer
        title={viewingSupplier ? `Vendor: ${viewingSupplier.display_name || `${viewingSupplier.first_name || ''} ${viewingSupplier.last_name || ''}`.trim() || 'Supplier'}` : 'Vendor'}
        closable
        width={Math.min(Math.max(1000, Math.round((typeof window !== 'undefined' ? window.innerWidth : 1400) * 0.9)), 1600)}
        visible={detailDrawerOpen}
        onClose={() => setDetailDrawerOpen(false)}
        destroyOnClose
        className="gx-profile-drawer"
      >
        {viewingSupplier && (
          <VendorDetailsContent
            vendorId={viewingSupplier.id}
            mode="drawer"
            onNavigate={(path) => { setDetailDrawerOpen(false); history.push(path); }}
          />
        )}
      </Drawer>
    </div>
  );
};

export default SupplierVendorList;
