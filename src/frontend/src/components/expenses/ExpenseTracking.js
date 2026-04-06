import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, DatePicker, Select, message, Space, Divider, Row, Col, InputNumber, Tag, Drawer, Statistic } from 'antd';
import { PlusOutlined, DownloadOutlined, ReloadOutlined, SearchOutlined, EditOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { Option } = Select;

const ExpenseTracking = () => {
  const { symbol: cSym } = useCurrency();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ dateRange: [], q: '' });
  const [form] = Form.useForm();
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [supplierForm] = Form.useForm();
  const [catForm] = Form.useForm();
  const [editingExpense, setEditingExpense] = useState(null);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [viewExpense, setViewExpense] = useState(null);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getAllExpenses();
      const list = Array.isArray(data) ? data : (data && data.all) ? data.all : data?.data || [];
      setExpenses(list);
    } catch (err) {
      message.error('Failed to load expenses');
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSuppliers = useCallback(async () => {
    try {
      const data = await window.electronAPI.getAllSuppliers();
      setSuppliers(Array.isArray(data) ? data : data?.all || data?.data || []);
    } catch (e) { setSuppliers([]); }
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const data = await window.electronAPI.getChartOfAccounts();
      setAccounts(Array.isArray(data) ? data : data?.data || []);
    } catch (e) { setAccounts([]); }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const data = await window.electronAPI.expenseCategoriesActive?.();
      setCategories(Array.isArray(data) ? data : []);
    } catch (_) { setCategories([]); }
  }, []);

  useEffect(() => {
    loadExpenses();
    loadSuppliers();
    loadAccounts();
    loadCategories();
  }, [loadExpenses, loadSuppliers, loadAccounts, loadCategories]);

  const filtered = useMemo(() => {
    let list = expenses || [];
    const [start, end] = filters.dateRange;
    if (start && end) {
      list = list.filter(e => {
        const d = e.payment_date ? moment(e.payment_date) : null;
        return d && d.isBetween(start.startOf('day'), end.endOf('day'), null, '[]');
      });
    }
    const q = (filters.q || '').toLowerCase();
    if (q) {
      list = list.filter(e => (e.description || '').toLowerCase().includes(q) || (e.category || '').toLowerCase().includes(q) || (e.payee_name || '').toLowerCase().includes(q));
    }
    return list;
  }, [expenses, filters]);

  const totalAmount = useMemo(() => filtered.reduce((s, e) => s + Number(e.amount || 0), 0), [filtered]);
  const paidCount = useMemo(() => filtered.filter(e => (e.approval_status || '').toLowerCase() === 'paid').length, [filtered]);

  const columns = [
    { title: 'Date', dataIndex: 'payment_date', key: 'payment_date', sorter: (a, b) => (a.payment_date || '').localeCompare(b.payment_date || ''), render: (d) => d ? moment(d).format('DD/MM/YYYY') : '-' },
    { title: 'Supplier / Vendor', dataIndex: 'payee_name', key: 'payee_name', sorter: (a, b) => (a.payee_name || '').localeCompare(b.payee_name || '') },
    { title: 'Category', dataIndex: 'category', key: 'category', render: v => <Tag>{v || '-'}</Tag> },
    { title: 'Method', dataIndex: 'payment_method', key: 'payment_method' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', sorter: (a, b) => Number(a.amount || 0) - Number(b.amount || 0), render: (v) => <strong>{cSym} {Number(v || 0).toFixed(2)}</strong> },
    { title: 'Status', dataIndex: 'approval_status', key: 'approval_status',
      render: v => <Tag color={v === 'Paid' ? 'green' : v === 'Approved' ? 'blue' : 'orange'}>{v || 'Pending'}</Tag> },
    { title: 'Ref #', dataIndex: 'ref_no', key: 'ref_no' },
    {
      title: 'Actions', key: 'actions', width: 220,
      render: (_, r) => (
        <Space size="small">
          <Button size="small" icon={<EyeOutlined />} onClick={() => { setViewExpense(r); setViewModalVisible(true); }}>View</Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditExpense(r)}>Edit</Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteExpense(r)}>Delete</Button>
          <Button size="small" type="text" style={{ color: '#cf1322', fontWeight: 600 }} onClick={() => markPaid(r)} disabled={(r.approval_status || '').toLowerCase() === 'paid'}>Mark Paid</Button>
        </Space>
      )
    }
  ];

  const showDrawer = () => { setEditingExpense(null); form.resetFields(); form.setFieldsValue({ payment_date: moment(), payment_method: 'cash' }); setDrawerOpen(true); };
  const hideDrawer = () => { setDrawerOpen(false); setEditingExpense(null); form.resetFields(); };

  const openEditExpense = (record) => {
    setEditingExpense(record);
    form.setFieldsValue({
      supplierId: record.payee || record.payee_name,
      payment_date: record.payment_date ? moment(record.payment_date) : null,
      payment_method: record.payment_method || 'cash',
      accountId: record.payment_account,
      ref_no: record.ref_no,
      line_category: record.category || 'Expense',
      amount: Number(record.amount || 0),
      description: record.description,
    });
    setDrawerOpen(true);
  };

  const handleDeleteExpense = async (record) => {
    try {
      const res = await window.electronAPI.deleteExpense?.(record.id);
      if (res?.success) { message.success('Expense deleted'); loadExpenses(); }
      else { message.error(res?.error || 'Failed to delete expense'); }
    } catch (e) { message.error(e.message || 'Failed to delete expense'); }
  };

  const handleAddExpense = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const payee = values.supplierId;
      const payment_account = values.accountId ? String(values.accountId) : 'Accounts Payable';
      const payment_date = values.payment_date ? values.payment_date.format('YYYY-MM-DD') : null;
      const payment_method = values.payment_method || 'cash';
      const ref_no = values.ref_no || '';
      const category = 'supplier';
      const entered_by = 'system';
      const approval_status = 'Pending';
      const expenseLines = [{ category: values.line_category || 'Expense', description: values.description || '', amount: Number(values.amount) || 0 }];
      const res = await window.electronAPI.insertExpense(payee, payment_account, payment_date, payment_method, ref_no, category, entered_by, approval_status, expenseLines);
      if (res && res.success) {
        message.success('Expense created');
        hideDrawer();
        loadExpenses();
      } else {
        throw new Error(res?.error || 'Failed to create expense');
      }
    } catch (e) {
      if (!e?.errorFields) message.error(e.message || 'Failed to add expense');
    } finally {
      setLoading(false);
    }
  };

  const markPaid = async (row) => {
    try {
      const res = await window.electronAPI.markExpensePaid(row.id);
      if (res && res.success) {
        message.success('Marked as paid');
        loadExpenses();
      } else {
        throw new Error(res?.error || 'Failed to mark as paid');
      }
    } catch (e) {
      message.error(e.message || 'Failed to mark as paid');
    }
  };

  const exportCSV = () => {
    try {
      const headers = ['id','payment_date','payee_name','category','payment_method','amount','approval_status','ref_no'];
      const rows = filtered.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g,'""')}"`).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `expenses_${new Date().toISOString().slice(0,10)}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e) { message.error('Failed to export CSV'); }
  };

  const handleAddSupplier = async () => {
    try {
      const vals = await supplierForm.validateFields();
      const display = `${vals.first_name || ''} ${vals.last_name || ''}`.trim() || vals.company || 'New Supplier';
      await window.electronAPI.insertSupplier?.(
        '', vals.first_name || '', '', vals.last_name || '', '', vals.email || '', display,
        vals.company || '', vals.phone || '', '', '', '', '', '', '', '', '', '', '', '', '', '', 0, '', null, ''
      );
      message.success('Supplier/Vendor added');
      setSupplierModalOpen(false);
      supplierForm.resetFields();
      loadSuppliers();
    } catch (e) { if (!e?.errorFields) message.error('Failed to add supplier'); }
  };

  const handleAddCategory = async () => {
    try {
      const vals = await catForm.validateFields();
      const res = await window.electronAPI.expenseCategoryInsert?.(vals.name, vals.description, vals.color);
      if (res?.success) {
        message.success('Category added');
        setCatModalOpen(false);
        catForm.resetFields();
        loadCategories();
      } else {
        message.error(res?.error || 'Failed to add category');
      }
    } catch (e) { if (!e?.errorFields) message.error('Failed to add category'); }
  };

  return (
    <div style={{ padding: 24 }}>
      <Card title={<span style={{ fontSize: 18, fontWeight: 600 }}>Expenses & Bills</span>}
        extra={<Space><Button icon={<DownloadOutlined />} onClick={exportCSV}>Export CSV</Button><Button icon={<ReloadOutlined />} onClick={loadExpenses}>Refresh</Button></Space>}>

        <Row gutter={16} style={{ marginBottom: 16, flexDirection: 'row', flexWrap: 'wrap' }}>
          <Col span={6}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Total Expenses" value={filtered.length} /></Card></Col>
          <Col span={6}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Total Amount" value={totalAmount} prefix={cSym} precision={2} /></Card></Col>
          <Col span={6}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Paid" value={paidCount} valueStyle={{ color: '#3f8600' }} /></Card></Col>
          <Col span={6}><Card size="small" style={{ textAlign: 'center' }}><Statistic title="Pending" value={filtered.length - paidCount} valueStyle={{ color: '#cf1322' }} /></Card></Col>
        </Row>

        <Space style={{ marginBottom: 16 }} wrap>
          <DatePicker.RangePicker onChange={(range) => setFilters(f => ({ ...f, dateRange: range || [] }))} format="DD/MM/YYYY" />
          <Input.Search allowClear placeholder="Search description, category, payee" prefix={<SearchOutlined />}
            onSearch={(val) => setFilters(f => ({ ...f, q: val }))} style={{ width: 280 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={showDrawer}>Add Expense</Button>
        </Space>
        <Table columns={columns} dataSource={filtered} loading={loading} rowKey={(r) => r.id || r.key}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} expenses` }} size="middle" />
      </Card>

      {/* Add Expense Drawer */}
      <Drawer title={editingExpense ? 'Edit Expense' : 'Add Expense'} width={560} visible={drawerOpen} onClose={hideDrawer} destroyOnClose
        footer={<div style={{ textAlign: 'right' }}><Button onClick={hideDrawer} style={{ marginRight: 8 }}>Cancel</Button><Button type="primary" onClick={handleAddExpense}>{editingExpense ? 'Update' : 'Save Expense'}</Button></div>}>
        <Form form={form} layout="vertical">
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={24}>
              <Form.Item name="supplierId" label="Supplier / Vendor" rules={[{ required: true, message: 'Select supplier/vendor' }]}>
                <Select showSearch optionFilterProp="children" placeholder="Select supplier/vendor"
                  dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setSupplierModalOpen(true)} style={{ width: '100%', textAlign: 'left' }}>Add New Supplier / Vendor</Button></>)}>
                  {suppliers.map(s => (
                    <Option key={s.id} value={s.id}>{s.display_name || `${s.first_name || ''} ${s.last_name || ''}`.trim()}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}>
              <Form.Item name="payment_date" label="Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="payment_method" label="Payment Method" initialValue="cash">
                <Select>
                  <Option value="cash">Cash</Option>
                  <Option value="check">Check</Option>
                  <Option value="card">Card</Option>
                  <Option value="eft">EFT</Option>
                  <Option value="bank_transfer">Bank Transfer</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}>
              <Form.Item name="accountId" label="Payment Account">
                <Select showSearch optionFilterProp="children" placeholder="Account (optional)" allowClear>
                  {accounts.map(a => (
                    <Option key={a.id} value={a.id}>{a.accountName}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="ref_no" label="Reference #">
                <Input placeholder="INV-001, PO-123, etc." />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}>
              <Form.Item name="line_category" label="Category" initialValue="Expense">
                <Select showSearch optionFilterProp="children" placeholder="Select category"
                  dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setCatModalOpen(true)} style={{ width: '100%', textAlign: 'left' }}>Add New Category</Button></>)}>
                  {categories.map(c => (
                    <Option key={c.id} value={c.name}>
                      <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: c.color || '#1890ff', marginRight: 6, verticalAlign: 'middle' }} />
                      {c.name}
                    </Option>
                  ))}
                  {categories.length === 0 && <Option value="Expense">Expense</Option>}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="amount" label="Amount (R)" rules={[{ required: true, message: 'Enter amount' }]}>
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="Describe the expense..." />
          </Form.Item>
        </Form>
      </Drawer>

      {/* Add Supplier/Vendor Modal */}
      <Modal title="Add New Supplier / Vendor" visible={supplierModalOpen} onOk={handleAddSupplier} onCancel={() => setSupplierModalOpen(false)} okText="Add" destroyOnClose zIndex={1100}>
        <Form form={supplierForm} layout="vertical" preserve={false}>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}><Form.Item name="first_name" label="First Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="last_name" label="Last Name"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="company" label="Company"><Input /></Form.Item>
          <Row gutter={12} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}><Form.Item name="email" label="Email"><Input type="email" /></Form.Item></Col>
            <Col span={12}><Form.Item name="phone" label="Phone"><Input /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>

      {/* Add Category Modal */}
      <Modal title="Add Expense Category" visible={catModalOpen} onOk={handleAddCategory} onCancel={() => setCatModalOpen(false)} okText="Add" destroyOnClose zIndex={1100}>
        <Form form={catForm} layout="vertical" preserve={false}>
          <Form.Item name="name" label="Category Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. Office Supplies" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input placeholder="Optional" />
          </Form.Item>
          <Form.Item name="color" label="Color" initialValue="#1890ff">
            <Select>
              {['#1890ff','#52c41a','#fa8c16','#f5222d','#722ed1','#eb2f96','#13c2c2','#faad14'].map(c =>
                <Option key={c} value={c}><span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: c, marginRight: 8, verticalAlign: 'middle' }} />{c}</Option>
              )}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* View Expense Modal */}
      <Modal title="Expense Details" visible={viewModalVisible} onCancel={() => setViewModalVisible(false)} footer={<Button onClick={() => setViewModalVisible(false)}>Close</Button>} width={500}>
        {viewExpense && (
          <Row gutter={[12, 12]}>
            <Col span={12}><strong>Date:</strong><br />{viewExpense.payment_date ? moment(viewExpense.payment_date).format('DD/MM/YYYY') : '-'}</Col>
            <Col span={12}><strong>Supplier/Vendor:</strong><br />{viewExpense.payee_name || '-'}</Col>
            <Col span={12}><strong>Category:</strong><br /><Tag>{viewExpense.category || '-'}</Tag></Col>
            <Col span={12}><strong>Payment Method:</strong><br />{viewExpense.payment_method || '-'}</Col>
            <Col span={12}><strong>Amount:</strong><br /><span style={{ fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{cSym} {Number(viewExpense.amount || 0).toFixed(2)}</span></Col>
            <Col span={12}><strong>Status:</strong><br /><Tag color={viewExpense.approval_status === 'Paid' ? 'green' : 'orange'}>{viewExpense.approval_status || 'Pending'}</Tag></Col>
            <Col span={12}><strong>Ref #:</strong><br />{viewExpense.ref_no || '-'}</Col>
            <Col span={12}><strong>Account:</strong><br />{viewExpense.payment_account || '-'}</Col>
            <Col span={24}><strong>Description:</strong><br />{viewExpense.description || '-'}</Col>
          </Row>
        )}
      </Modal>
    </div>
  );
};

export default ExpenseTracking;