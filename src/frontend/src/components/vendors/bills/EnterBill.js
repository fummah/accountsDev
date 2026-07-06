import React, { useEffect, useState } from 'react';
import {
  Card, Form, Input, Button, DatePicker, Select, message, Divider, Modal,
  Row, Col, InputNumber, Typography, Space, Tag, Tooltip, Spin, Collapse, Upload, Statistic
} from 'antd';
import {
  ArrowLeftOutlined, PlusOutlined, MinusCircleOutlined, SaveOutlined,
  FileTextOutlined, DollarOutlined, SwapOutlined, CheckCircleOutlined,
  PaperClipOutlined, UploadOutlined, BankOutlined, ShopOutlined, ReloadOutlined, DownloadOutlined
} from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';

const { Option } = Select;
const { Text } = Typography;
const { Panel } = Collapse;

const TERMS_OPTIONS = [
  { value: 0, label: 'Due on receipt' },
  { value: 15, label: 'Net 15' },
  { value: 30, label: 'Net 30' },
  { value: 45, label: 'Net 45' },
  { value: 60, label: 'Net 60' },
  { value: 90, label: 'Net 90' },
];

const ACCOUNT_TYPES_ALLOWED = [
  'Expense', 'Cost of Goods Sold', 'Other Expense',
  'Asset', 'Inventory', 'Bank', 'Cash', 'Liability',
  'Credit Card', 'Long Term Liability', 'Other Current Liability',
  'Income', 'Other Income', 'Equity'
];

const EnterBill = ({ history, location, match }) => {
  const { symbol: cSym } = useCurrency();
  const [vendors, setVendors] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierForm] = Form.useForm();
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountForm] = Form.useForm();
  const [lines, setLines] = useState([{ key: Date.now(), category: '', description: '', amount: 0 }]);
  const editId = match?.params?.id;
  const isEdit = !!editId;

  // Payment & credit state
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payForm] = Form.useForm();
  const [bankAccounts, setBankAccounts] = useState([]);
  const [availableCredits, setAvailableCredits] = useState([]);
  const [selectedCredit, setSelectedCredit] = useState(null);
  const [payAmount, setPayAmount] = useState(0);
  const [billData, setBillData] = useState(null);
  const [paying, setPaying] = useState(false);
  const [fileList, setFileList] = useState([]);

  useEffect(() => {
    loadVendors();
    loadAccounts();
    loadProducts();
    loadBankAccounts();
    if (editId) loadBill(editId);
  }, [editId]);

  const accountTypeLabel = (type) => {
    const map = {
      'Expense': 'Expense',
      'Cost of Goods Sold': 'COGS',
      'Other Expense': 'Other',
      'Asset': 'Asset',
      'Inventory': 'Inventory',
      'Bank': 'Bank',
      'Cash': 'Cash',
      'Liability': 'Liability',
      'Credit Card': 'Credit Card',
      'Long Term Liability': 'LT Liab',
      'Other Current Liability': 'Cur Liab',
      'Income': 'Income',
      'Other Income': 'Oth Inc',
      'Equity': 'Equity',
    };
    return map[type] || type;
  };

  const typeColor = (type) => {
    const map = {
      'Expense': '#faad14',
      'Cost of Goods Sold': '#eb2f96',
      'Other Expense': '#d48806',
      'Asset': '#1890ff',
      'Inventory': '#52c41a',
      'Bank': '#722ed1',
      'Cash': '#13c2c2',
      'Liability': '#f5222d',
      'Credit Card': '#cf1322',
      'Long Term Liability': '#ad4e00',
      'Other Current Liability': '#d46b08',
      'Income': '#52c41a',
      'Other Income': '#389e0d',
      'Equity': '#1890ff',
    };
    return map[type] || '#999';
  };

  const loadBill = async (id) => {
    try {
      const data = await window.electronAPI.getSingleExpense?.(id);
      if (data) {
        setBillData(data);
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

  const loadProducts = async () => {
    try {
      const data = await window.electronAPI.getAllProducts?.();
      setProducts(Array.isArray(data) ? data : (data?.all || []));
    } catch {}
  };

  const loadBankAccounts = async () => {
    try {
      const accs = await window.electronAPI.getChartOfAccounts?.();
      const list = Array.isArray(accs) ? accs : [];
      setBankAccounts(list.filter(a => ['Bank', 'Cash', 'bank', 'cash'].includes(a.accountType || a.type || '')));
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

  const selectLineProduct = (key, productId) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;
    const price = Number(prod.selling_price || prod.price || 0);
    setLines(lines.map(l => {
      if (l.key !== key) return l;
      const category = (prod.type || '').toLowerCase() === 'inventory' ? 'Inventory' : 'Cost of Goods Sold';
      return { ...l, description: prod.name || prod.description || '', amount: price, category };
    }));
  };

  const totalAmount = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const paidAmount = Number(billData?.paid_amount) || 0;
  const remaining = totalAmount - paidAmount;

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

  const handleAddAccount = async () => {
    try {
      const vals = await accountForm.validateFields();
      const payload = {
        name: vals.name,
        type: vals.type || 'Expense',
        number: vals.code || '',
        description: vals.description || '',
        status: 'Active',
        entered_by: 'system',
      };
      const res = await window.electronAPI.insertChartAccount(payload);
      if (res?.success) {
        message.success('Account created');
        setAccountModalOpen(false);
        accountForm.resetFields();
        loadAccounts();
      } else {
        message.error(res?.error || 'Failed to create account');
      }
    } catch (e) { if (!e?.errorFields) message.error('Failed to create account'); }
  };

  // ── Payment & Credit ──────────────────────────────────────────────
  const openPayModal = async () => {
    const vendorId = form.getFieldValue('vendorId');
    setPayAmount(remaining > 0 ? remaining : totalAmount);
    setSelectedCredit(null);
    payForm.setFieldsValue({
      paymentDate: moment(),
      bankAccount: bankAccounts[0]?.accountName || bankAccounts[0]?.name || undefined,
      amount: remaining > 0 ? remaining : totalAmount,
    });
    if (vendorId) {
      try {
        const credits = await window.electronAPI.vendorCreditsAvailable(vendorId);
        setAvailableCredits(Array.isArray(credits) ? credits : []);
      } catch { setAvailableCredits([]); }
    }
    setPayModalOpen(true);
  };

  const handlePayBill = async (values) => {
    if (!editId) return;
    try {
      setPaying(true);
      let creditAmt = 0;
      if (selectedCredit) {
        creditAmt = Math.min(selectedCredit.remaining_amount, payAmount);
        const creditRes = await window.electronAPI.vendorCreditsApply(selectedCredit.id, Number(editId), creditAmt);
        if (!creditRes?.success) message.warning(creditRes?.error || 'Failed to apply credit');
      }
      const cashAmount = payAmount - creditAmt;
      if (cashAmount > 0.005) {
        const res = await window.electronAPI.billPay({
          expenseId: Number(editId),
          amount: cashAmount,
          paymentDate: values.paymentDate ? values.paymentDate.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD'),
          bankAccount: values.bankAccount,
        });
        if (!res?.success) {
          message.error(res?.error || 'Failed to pay bill');
          return;
        }
      }
      message.success('Payment recorded');
      setPayModalOpen(false);
      payForm.resetFields();
      setSelectedCredit(null);
      await loadBill(editId);
    } catch (err) {
      message.error('Failed to process payment');
    } finally { setPaying(false); }
  };

  const allAccounts = accounts.filter(a => ACCOUNT_TYPES_ALLOWED.includes(a.accountType || a.type));
  const isPaid = billData && (billData.approval_status || '').toLowerCase() === 'paid';

  const vendorName = vendors.find(v => v.id === form.getFieldValue('vendorId'))?.display_name || '';

  return (
    <div style={{ padding: 24 }}>
      <Card title={<span style={{ fontSize: 18, fontWeight: 600 }}><FileTextOutlined style={{ marginRight: 8 }} />{isEdit ? 'Edit Bill' : 'Enter Bill'}</span>}
        extra={<Space><Button icon={<DownloadOutlined />} onClick={() => {}}>Export</Button><Button icon={<ReloadOutlined />} onClick={loadVendors}>Refresh</Button></Space>}>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}><Card size="small" style={{ textAlign: 'center', borderTop: '3px solid #1890ff' }}><Statistic title="Total Lines" value={lines.length} valueStyle={{ color: '#1890ff', fontSize: 18 }} /></Card></Col>
          <Col xs={12} sm={6}><Card size="small" style={{ textAlign: 'center', borderTop: '3px solid #52c41a' }}><Statistic title="Total Amount" value={totalAmount} prefix={cSym} precision={2} valueStyle={{ color: '#52c41a', fontSize: 18 }} /></Card></Col>
          <Col xs={12} sm={6}><Card size="small" style={{ textAlign: 'center', borderTop: '3px solid #722ed1' }}><Statistic title="Vendor" value={vendorName || '—'} valueStyle={{ fontSize: 14 }} /></Card></Col>
          <Col xs={12} sm={6}><Card size="small" style={{ textAlign: 'center', borderTop: '3px solid #fa8c16' }}><Statistic title="Status" value={isPaid ? 'Paid' : isEdit ? 'Unpaid' : 'New'} valueStyle={{ color: isPaid ? '#52c41a' : '#fa8c16', fontSize: 16 }} /></Card></Col>
        </Row>

      <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ billDate: moment(), terms: 30 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 140px', minWidth: 120 }}>
            <Form.Item name="billDate" label="Bill Date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="MM/DD/YYYY" />
            </Form.Item>
          </div>
          <div style={{ flex: '1 1 140px', minWidth: 120 }}>
            <Form.Item name="dueDate" label="Due Date">
              <DatePicker style={{ width: '100%' }} format="MM/DD/YYYY" />
            </Form.Item>
          </div>
          <div style={{ flex: '1 1 100px', minWidth: 90 }}>
            <Form.Item name="billNumber" label="Bill #">
              <Input placeholder="INV-001" />
            </Form.Item>
          </div>
          <div style={{ flex: '1 1 120px', minWidth: 100 }}>
            <Form.Item name="terms" label="Terms">
              <Select onChange={handleTermsChange}>
                {TERMS_OPTIONS.map(t => <Option key={t.value} value={t.value}>{t.label}</Option>)}
              </Select>
            </Form.Item>
          </div>
          <div style={{ flex: '2 1 200px', minWidth: 160 }}>
            <Form.Item name="vendorId" label="Vendor" rules={[{ required: true, message: 'Select a vendor' }]}>
              <Select showSearch optionFilterProp="children" placeholder="Vendor"
                dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setSupplierModalOpen(true)} style={{ width: '100%', textAlign: 'left' }}>New Vendor</Button></>)}>
                {vendors.map(v => (
                  <Option key={v.id} value={v.id}>{v.display_name || `${v.first_name} ${v.last_name}`}</Option>
                ))}
              </Select>
            </Form.Item>
          </div>
          <div style={{ flex: '2 1 200px', minWidth: 160 }}>
            <Form.Item name="memo" label="Memo">
              <Input placeholder="Internal memo..." />
            </Form.Item>
          </div>
        </div>

        {/* File Attachment */}
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}><PaperClipOutlined style={{ marginRight: 4 }} />Attachment (Vendor Invoice File)</Text>
          <Upload
            fileList={fileList}
            onChange={({ fileList: fl }) => setFileList(fl)}
            beforeUpload={() => false}
            maxCount={1}
          >
            <Button icon={<UploadOutlined />}>Select File</Button>
          </Upload>
        </div>

        <Divider orientation="left" style={{ fontSize: 13, margin: '8px 0 16px' }}>
          <DollarOutlined style={{ marginRight: 6 }} />Line Items
        </Divider>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6, padding: '0 4px' }}>
            <Text strong style={{ flex: 1, fontSize: 11 }}>Account</Text>
            <Text strong style={{ flex: 2, fontSize: 11 }}>Description</Text>
            <Text strong style={{ flex: 1, fontSize: 11 }}>Amount ({cSym})</Text>
            <div style={{ width: 32 }} />
          </div>
          {lines.map((line) => (
            <div key={line.key} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <Select
                style={{ flex: 1 }}
                value={line.category || undefined}
                onChange={(v) => updateLine(line.key, 'category', v)}
                placeholder="Select account"
                showSearch optionFilterProp="children" allowClear
                dropdownRender={menu => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" size="small" icon={<PlusOutlined />} onClick={() => setAccountModalOpen(true)} style={{ width: '100%', textAlign: 'left' }}>Add New Account</Button></>)}
              >
                {allAccounts.map(a => {
                  const type = a.accountType || a.type;
                  return (
                    <Option key={a.id} value={a.accountName || a.name}>
                      <Space size={4}>
                        <Tag color={typeColor(type)} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>{accountTypeLabel(type)}</Tag>
                        {a.accountCode ? `${a.accountCode} - ` : ''}{a.accountName || a.name}
                      </Space>
                    </Option>
                  );
                })}
              </Select>
              <Input
                style={{ flex: 2 }}
                value={line.description}
                onChange={(e) => updateLine(line.key, 'description', e.target.value)}
                placeholder="Description"
              />
              <InputNumber
                style={{ flex: 1 }}
                min={0} step={0.01}
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

        {/* Total & Payment Status */}
        <div style={{ textAlign: 'right', marginBottom: 16, padding: '12px 16px', background: '#f6f8fa', borderRadius: 8 }}>
          {isEdit && paidAmount > 0 && (
            <div style={{ marginBottom: 8 }}>
              <Tag color="green" style={{ fontSize: 11 }}><CheckCircleOutlined /> Paid: {cSym} {paidAmount.toFixed(2)}</Tag>
              {remaining > 0.005 && <Tag color="orange" style={{ fontSize: 11 }}>Remaining: {cSym} {remaining.toFixed(2)}</Tag>}
            </div>
          )}
          <Text style={{ fontSize: 13, marginRight: 16 }}>Total:</Text>
          <Text strong style={{ fontSize: 18 }}>{cSym} {totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          <div style={{ marginTop: 4 }}>
            {isPaid ? (
              <Tag color="green">PAID</Tag>
            ) : (
              <Tag color="orange">Unpaid — creates Accounts Payable</Tag>
            )}
          </div>
        </div>

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />} size="large" disabled={isPaid}>
              {isEdit ? 'Update Bill' : 'Save Bill'}
            </Button>
            {isEdit && !isPaid && (
              <Button icon={<DollarOutlined />} size="large" onClick={openPayModal}>
                Record Payment
              </Button>
            )}
            <Button onClick={() => { form.resetFields(); setLines([{ key: Date.now(), category: '', description: '', amount: 0 }]); }}>
              Clear
            </Button>
          </Space>
        </Form.Item>
      </Form>

      {/* Available Credits (when editing) */}
      {isEdit && availableCredits.length > 0 && (
        <Collapse style={{ marginTop: 8 }} ghost>
          <Panel header={<span style={{ fontSize: 12 }}><SwapOutlined /> Vendor Credits Available ({availableCredits.length})</span>} key="credits">
            {availableCredits.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                <span>{c.reference || `Credit #${c.id}`}</span>
                <Text strong>{cSym} {Number(c.remaining_amount).toFixed(2)}</Text>
              </div>
            ))}
          </Panel>
        </Collapse>
      )}

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

      <Modal title="New Account" visible={accountModalOpen} onOk={handleAddAccount} onCancel={() => setAccountModalOpen(false)} okText="Create" destroyOnClose>
        <Form form={accountForm} layout="vertical" preserve={false}>
          <Form.Item name="name" label="Account Name" rules={[{ required: true, message: 'Enter account name' }]}>
            <Input placeholder="e.g. Office Supplies" />
          </Form.Item>
          <Form.Item name="type" label="Type" initialValue="Expense" rules={[{ required: true }]}>
            <Select>
              <Option value="Expense">Expense</Option>
              <Option value="Cost of Goods Sold">Cost of Goods Sold</Option>
              <Option value="Other Expense">Other Expense</Option>
              <Option value="Asset">Asset</Option>
              <Option value="Inventory">Inventory</Option>
              <Option value="Bank">Bank</Option>
              <Option value="Cash">Cash</Option>
              <Option value="Liability">Liability</Option>
              <Option value="Income">Income</Option>
              <Option value="Other Income">Other Income</Option>
              <Option value="Equity">Equity</Option>
            </Select>
          </Form.Item>
          <Form.Item name="code" label="Account Code">
            <Input placeholder="e.g. 6010" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional description" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Pay Bill Modal (inline) */}
      <Modal
        title="Record Payment"
        visible={payModalOpen}
        onOk={() => payForm.submit()}
        onCancel={() => { setPayModalOpen(false); payForm.resetFields(); setSelectedCredit(null); }}
        confirmLoading={paying}
        okText="Record Payment"
        destroyOnClose
        width={520}
      >
        <Form form={payForm} layout="vertical" onFinish={handlePayBill} preserve={false}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="paymentDate" label="Payment Date" rules={[{ required: true }]} initialValue={moment()}>
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Bill Total">
                <Text strong style={{ fontSize: 16 }}>{cSym} {totalAmount.toFixed(2)}</Text>
                {paidAmount > 0 && (
                  <div><Text type="secondary" style={{ fontSize: 12 }}>Already paid: {cSym} {paidAmount.toFixed(2)}</Text></div>
                )}
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Payment Amount" required>
            <InputNumber
              style={{ width: '100%' }} min={0.01} step={0.01} prefix={cSym}
              value={payAmount}
              onChange={v => setPayAmount(Number(v) || 0)}
              formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={v => v.replace(/,/g, '')}
            />
          </Form.Item>

          <Form.Item name="bankAccount" label="Pay From (Bank Account)" rules={[{ required: true, message: 'Select a bank account' }]}>
            <Select placeholder="Select bank account" showSearch optionFilterProp="children">
              {bankAccounts.map(a => (
                <Option key={a.id} value={a.accountName || a.name}>{a.accountName || a.name}</Option>
              ))}
            </Select>
          </Form.Item>

          {availableCredits.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <Text strong style={{ fontSize: 13 }}>Available Vendor Credits</Text>
              {availableCredits.map(c => (
                <div key={c.id}
                  onClick={() => setSelectedCredit(selectedCredit?.id === c.id ? null : c)}
                  style={{
                    padding: '6px 10px', marginTop: 6, borderRadius: 6, cursor: 'pointer',
                    border: selectedCredit?.id === c.id ? '2px solid #1890ff' : '1px solid #d9d9d9',
                    background: selectedCredit?.id === c.id ? '#e6f7ff' : '#fff',
                    display: 'flex', justifyContent: 'space-between'
                  }}>
                  <span>{c.reference || `Credit #${c.id}`}</span>
                  <Text strong>{cSym} {Number(c.remaining_amount).toFixed(2)}</Text>
                </div>
              ))}
              {selectedCredit && (
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                  Credit of {cSym} {Math.min(selectedCredit.remaining_amount, payAmount).toFixed(2)} will be applied
                </Text>
              )}
            </div>
          )}

          <div style={{ padding: '8px 12px', background: '#f6f8fa', borderRadius: 6, fontSize: 12, color: '#555' }}>
            <strong>Accounting:</strong>
            {(() => {
              const creditAmt = selectedCredit ? Math.min(selectedCredit.remaining_amount, payAmount) : 0;
              const cashAmt = payAmount - creditAmt;
              return (
                <>
                  {creditAmt > 0 && <div>Vendor Credit — reduces AP: {cSym} {creditAmt.toFixed(2)}</div>}
                  <div>DR Accounts Payable {cSym} {cashAmt.toFixed(2)} &nbsp;/&nbsp; CR Bank Account {cSym} {cashAmt.toFixed(2)}</div>
                </>
              );
            })()}
          </div>
        </Form>
      </Modal>
      </Card>
    </div>
  );
};

export default EnterBill;
