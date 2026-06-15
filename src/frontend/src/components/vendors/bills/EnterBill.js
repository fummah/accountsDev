import React, { useEffect, useState } from 'react';
import {
  Card, Form, Input, Button, DatePicker, Select, message, Divider, Modal,
  Row, Col, InputNumber, Table, Typography, Space, Tag, Tooltip
} from 'antd';
import {
  ArrowLeftOutlined, PlusOutlined, MinusCircleOutlined, SaveOutlined,
  FileTextOutlined, DollarOutlined
} from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';

const { Option } = Select;
const { Text } = Typography;

const TERMS_OPTIONS = [
  { value: 0, label: 'Due on receipt' },
  { value: 15, label: 'Net 15' },
  { value: 30, label: 'Net 30' },
  { value: 45, label: 'Net 45' },
  { value: 60, label: 'Net 60' },
  { value: 90, label: 'Net 90' },
];

const EnterBill = ({ history, location, match }) => {
  const { symbol: cSym } = useCurrency();
  const [vendors, setVendors] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierForm] = Form.useForm();
  const [lines, setLines] = useState([{ key: Date.now(), category: '', description: '', amount: 0 }]);
  const editId = match?.params?.id;
  const isEdit = !!editId;

  useEffect(() => {
    loadVendors();
    loadAccounts();
    if (editId) loadBill(editId);
  }, [editId]);

  const loadBill = async (id) => {
    try {
      const data = await window.electronAPI.getSingleExpense?.(id);
      if (data) {
        form.setFieldsValue({
          vendorId: data.payee,
          billNumber: data.ref_no,
          billDate: data.payment_date ? moment(data.payment_date) : moment(),
          dueDate: data.due_date ? moment(data.due_date) : null,
          terms: data.terms || 30,
          memo: data.memo || '',
        });
        if (data.lines && data.lines.length > 0) {
          setLines(data.lines.map((l, i) => ({ key: i, category: l.category || '', description: l.description || '', amount: Number(l.amount) || 0 })));
        }
      }
    } catch (e) {
      console.error('Failed to load bill for editing:', e);
      message.error('Failed to load bill details');
    }
  };

  const loadVendors = async () => {
    try {
      const data = await window.electronAPI.getAllSuppliers();
      setVendors(Array.isArray(data) ? data : (data?.all || data?.data || []));
    } catch (err) {
      console.error('Failed to load vendors', err);
    }
  };

  const loadAccounts = async () => {
    try {
      const data = await window.electronAPI.getChartOfAccounts?.();
      setAccounts(Array.isArray(data) ? data.filter(a => a.status === 'Active') : []);
    } catch {}
  };

  const handleAddSupplier = async () => {
    try {
      const vals = await supplierForm.validateFields();
      const display = `${vals.first_name || ''} ${vals.last_name || ''}`.trim() || vals.company || 'New Supplier';
      await window.electronAPI.insertSupplier?.(
        '', vals.first_name || '', '', vals.last_name || '', '', vals.email || '', display,
        vals.company || '', vals.phone || '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 0, '', null, ''
      );
      message.success('Supplier added');
      setSupplierModalOpen(false);
      supplierForm.resetFields();
      loadVendors();
    } catch (e) { if (!e?.errorFields) message.error('Failed to add supplier'); }
  };

  const handleTermsChange = (val) => {
    const billDate = form.getFieldValue('billDate') || moment();
    form.setFieldsValue({ dueDate: moment(billDate).add(val, 'days') });
  };

  const addLine = () => setLines([...lines, { key: Date.now(), category: '', description: '', amount: 0 }]);
  const removeLine = (key) => { if (lines.length > 1) setLines(lines.filter(l => l.key !== key)); };
  const updateLine = (key, field, value) => setLines(lines.map(l => l.key === key ? { ...l, [field]: value } : l));

  const totalAmount = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  const handleSubmit = async (values) => {
    if (totalAmount <= 0) return message.warning('Bill must have at least one line with an amount');
    try {
      setLoading(true);
      const payee = values.vendorId;
      const payment_account = 'Accounts Payable';
      const payment_date = values.billDate ? values.billDate.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD');
      const due_date = values.dueDate ? values.dueDate.format('YYYY-MM-DD') : null;
      const payment_method = 'bill';
      const ref_no = values.billNumber || '';
      const category = 'bill';
      const entered_by = 'system';
      const approval_status = 'Unpaid';
      const memo = values.memo || '';
      const terms = values.terms || 30;
      const expenseLines = lines.filter(l => Number(l.amount) > 0).map(l => ({
        category: l.category || 'General',
        description: l.description || '',
        amount: Number(l.amount) || 0,
      }));

      let res;
      if (isEdit) {
        res = await window.electronAPI.updateExpense({ id: Number(editId), payee, payment_account, ref_no, category, payment_method, entered_by, payment_date, approval_status, memo, due_date, terms, lines: expenseLines });
      } else {
        res = await window.electronAPI.insertExpense(payee, payment_account, payment_date, payment_method, ref_no, category, entered_by, approval_status, expenseLines);
      }
      if (res && res.success) {
        message.success(isEdit ? 'Bill updated' : 'Bill saved — recorded as Accounts Payable');
        if (!isEdit) {
          form.resetFields();
          setLines([{ key: Date.now(), category: '', description: '', amount: 0 }]);
        }
        if (history && history.push) history.push('/main/vendors/bills/tracker');
      } else {
        message.error(res?.error || 'Failed to save bill');
      }
    } catch (err) {
      console.error('Create bill error', err);
      message.error('Failed to save bill');
    } finally {
      setLoading(false);
    }
  };

  const expenseAccounts = accounts.filter(a => ['Expense', 'Cost of Goods Sold', 'Other Expense'].includes(a.accountType || a.type));

  return (
    <Card
      title={<span><FileTextOutlined style={{ marginRight: 8 }} />{isEdit ? 'Edit Bill' : 'Enter Bill'}</span>}
      extra={<Button icon={<ArrowLeftOutlined />} onClick={() => (history?.goBack ? history.goBack() : null)}>Back</Button>}
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ billDate: moment(), terms: 30 }}>
        {/* Header Fields */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="vendorId" label="Vendor" rules={[{ required: true, message: 'Select a vendor' }]}>
              <Select showSearch optionFilterProp="children" placeholder="Select vendor"
                dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setSupplierModalOpen(true)} style={{ width: '100%', textAlign: 'left' }}>Add New Vendor</Button></>)}>
                {vendors.map(v => (
                  <Option key={v.id} value={v.id}>{v.display_name || `${v.first_name} ${v.last_name}`}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="billNumber" label="Bill # / Ref">
              <Input placeholder="INV-001" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="terms" label="Terms">
              <Select onChange={handleTermsChange}>
                {TERMS_OPTIONS.map(t => <Option key={t.value} value={t.value}>{t.label}</Option>)}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="billDate" label="Bill Date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="dueDate" label="Due Date">
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="memo" label="Memo">
              <Input placeholder="Internal memo..." />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" style={{ fontSize: 13, margin: '8px 0 16px' }}>
          <DollarOutlined style={{ marginRight: 6 }} />Expense Lines
        </Divider>

        {/* Line Items */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6, padding: '0 4px' }}>
            <Text strong style={{ flex: 2, fontSize: 11 }}>Expense Account</Text>
            <Text strong style={{ flex: 3, fontSize: 11 }}>Description</Text>
            <Text strong style={{ flex: 1, fontSize: 11 }}>Amount ({cSym})</Text>
            <div style={{ width: 32 }} />
          </div>
          {lines.map((line) => (
            <div key={line.key} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <Select
                style={{ flex: 2 }}
                value={line.category || undefined}
                onChange={(v) => updateLine(line.key, 'category', v)}
                placeholder="Select account"
                showSearch
                optionFilterProp="children"
                allowClear
              >
                {expenseAccounts.map(a => (
                  <Option key={a.id} value={a.accountName || a.name}>{a.accountCode ? `${a.accountCode} - ` : ''}{a.accountName || a.name}</Option>
                ))}
              </Select>
              <Input
                style={{ flex: 3 }}
                value={line.description}
                onChange={(e) => updateLine(line.key, 'description', e.target.value)}
                placeholder="Description"
              />
              <InputNumber
                style={{ flex: 1 }}
                min={0}
                step={0.01}
                value={line.amount}
                onChange={(v) => updateLine(line.key, 'amount', v || 0)}
                formatter={v => v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                parser={v => v.replace(/,/g, '')}
              />
              <Tooltip title="Remove">
                <Button size="small" danger icon={<MinusCircleOutlined />} onClick={() => removeLine(line.key)} disabled={lines.length <= 1} />
              </Tooltip>
            </div>
          ))}
          <Button type="dashed" onClick={addLine} block icon={<PlusOutlined />} style={{ borderRadius: 6 }}>
            Add Line
          </Button>
        </div>

        {/* Total */}
        <div style={{ textAlign: 'right', marginBottom: 16, padding: '12px 16px', background: '#f6f8fa', borderRadius: 8 }}>
          <Text style={{ fontSize: 13, marginRight: 16 }}>Total:</Text>
          <Text strong style={{ fontSize: 18 }}>{cSym} {totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          <div style={{ marginTop: 4 }}>
            <Tag color="orange">Unpaid — creates Accounts Payable</Tag>
          </div>
        </div>

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />} size="large">
              {isEdit ? 'Update Bill' : 'Save Bill'}
            </Button>
            <Button onClick={() => { form.resetFields(); setLines([{ key: Date.now(), category: '', description: '', amount: 0 }]); }}>
              Clear
            </Button>
          </Space>
        </Form.Item>
      </Form>

      {/* Add Supplier Modal */}
      <Modal title="Add New Vendor" visible={supplierModalOpen} onOk={handleAddSupplier} onCancel={() => setSupplierModalOpen(false)} okText="Add" destroyOnClose>
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

export default EnterBill;
