import React, { useEffect, useMemo, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, DatePicker, Select, message, Space, Divider, Row, Col, InputNumber } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import moment from 'moment';

const { Option } = Select;

const ExpenseTracking = () => {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [filters, setFilters] = useState({ dateRange: [], q: '' });
  const [form] = Form.useForm();
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierForm] = Form.useForm();

  const loadExpenses = async () => {
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
  };

  const loadSuppliers = async () => {
    try {
      const data = await window.electronAPI.getAllSuppliers();
      setSuppliers(Array.isArray(data) ? data : data?.all || data?.data || []);
    } catch (e) { setSuppliers([]); }
  };

  const loadAccounts = async () => {
    try {
      const data = await window.electronAPI.getChartOfAccounts();
      setAccounts(Array.isArray(data) ? data : data?.data || []);
    } catch (e) { setAccounts([]); }
  };

  useEffect(() => {
    loadExpenses();
    loadSuppliers();
    loadAccounts();
  }, []);

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

  const columns = [
    { title: 'Date', dataIndex: 'payment_date', key: 'payment_date', render: (d) => d ? moment(d).format('YYYY-MM-DD') : '-' },
    { title: 'Payee', dataIndex: 'payee_name', key: 'payee_name' },
    { title: 'Category', dataIndex: 'category', key: 'category' },
    { title: 'Method', dataIndex: 'payment_method', key: 'payment_method' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (v) => `R ${Number(v || 0).toFixed(2)}` },
    { title: 'Status', dataIndex: 'approval_status', key: 'approval_status' },
    { title: 'Ref #', dataIndex: 'ref_no', key: 'ref_no' },
    {
      title: 'Action',
      key: 'action',
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => markPaid(r)} disabled={(r.approval_status || '').toLowerCase() === 'paid'}>Mark Paid</Button>
        </Space>
      )
    }
  ];

  const showModal = () => setIsModalVisible(true);
  const hideModal = () => { setIsModalVisible(false); form.resetFields(); };

  const handleAddExpense = async (values) => {
    try {
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
        hideModal();
        loadExpenses();
      } else {
        throw new Error(res?.error || 'Failed to create expense');
      }
    } catch (e) {
      message.error(e.message || 'Failed to add expense');
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
      message.success('Supplier added');
      setSupplierModalOpen(false);
      supplierForm.resetFields();
      loadSuppliers();
    } catch (e) { if (!e?.errorFields) message.error('Failed to add supplier'); }
  };

  return (
    <Card title="Expense Tracking" extra={<Button onClick={exportCSV}>Export CSV</Button>}>
      <Space style={{ marginBottom: 16 }} wrap>
        <DatePicker.RangePicker onChange={(range) => setFilters(f => ({ ...f, dateRange: range || [] }))} />
        <Input.Search allowClear placeholder="Search description, category, payee" onSearch={(val) => setFilters(f => ({ ...f, q: val }))} style={{ width: 280 }} />
        <Button type="primary" onClick={showModal}>Add Expense</Button>
      </Space>
      <Table columns={columns} dataSource={filtered} loading={loading} rowKey={(r) => r.id || r.key} pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} expenses` }} />

      <Modal title="Add Expense" visible={isModalVisible} onCancel={hideModal} onOk={() => form.submit()} okText="Save">
        <Form form={form} layout="vertical" onFinish={handleAddExpense}>
          <Form.Item name="supplierId" label="Supplier" rules={[{ required: true, message: 'Select supplier' }]}>
            <Select showSearch optionFilterProp="children" placeholder="Select supplier"
              dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setSupplierModalOpen(true)} style={{ width: '100%', textAlign: 'left' }}>Add New Supplier</Button></>)}>
              {suppliers.map(s => (
                <Option key={s.id} value={s.id}>{s.display_name || `${s.first_name || ''} ${s.last_name || ''}`}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="accountId" label="Payment Account">
            <Select showSearch optionFilterProp="children" placeholder="Select payment account (optional)">
              {accounts.map(a => (
                <Option key={a.id} value={a.id}>{a.accountName}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="payment_date" label="Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="payment_method" label="Payment Method" initialValue="cash">
            <Select>
              <Option value="cash">Cash</Option>
              <Option value="check">Check</Option>
              <Option value="card">Card</Option>
              <Option value="eft">EFT</Option>
            </Select>
          </Form.Item>
          <Form.Item name="ref_no" label="Reference">
            <Input />
          </Form.Item>
          <Form.Item name="line_category" label="Line Category" initialValue="Expense">
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Please enter amount' }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Add New Supplier" visible={supplierModalOpen} onOk={handleAddSupplier} onCancel={() => setSupplierModalOpen(false)} okText="Add" destroyOnClose>
        <Form form={supplierForm} layout="vertical" preserve={false}>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="first_name" label="First Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="last_name" label="Last Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="company" label="Company"><Input /></Form.Item>
          <Form.Item name="email" label="Email"><Input type="email" /></Form.Item>
          <Form.Item name="phone" label="Phone"><Input /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default ExpenseTracking;