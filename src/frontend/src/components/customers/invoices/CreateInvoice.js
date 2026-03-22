import React, { useState, useEffect } from 'react';
import { Card, Form, Input, InputNumber, Select, DatePicker, Button, Table, Space, message, Divider, Row, Col, Spin, Modal } from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined, SaveOutlined, FilePdfOutlined, PrinterOutlined, EyeOutlined } from '@ant-design/icons';
import { handleDocumentPDF } from '../shared/generateDocumentPDF';
import { useHistory, useParams, useLocation } from 'react-router-dom';
import moment from 'moment';

const CreateInvoice = () => {
  const { id } = useParams();
  const history = useHistory();
  const location = useLocation();
  const isEdit = Boolean(id);

  const [form] = Form.useForm();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [vatRates, setVatRates] = useState([]);
  const [lines, setLines] = useState([{ key: Date.now(), description: '', quantity: 1, rate: 0, amount: 0 }]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState({});
  const [custModalOpen, setCustModalOpen] = useState(false);
  const [prodModalOpen, setProdModalOpen] = useState(false);
  const [vatModalOpen, setVatModalOpen] = useState(false);
  const [custForm] = Form.useForm();
  const [prodForm] = Form.useForm();
  const [vatForm] = Form.useForm();

  useEffect(() => {
    setLoading(true);
    loadDeps().then(() => {
      if (isEdit) return loadInvoice();
    }).finally(() => setLoading(false));
  }, [id]);

  const handleAddCustomer = async () => {
    try {
      const vals = await custForm.validateFields();
      const display = `${vals.first_name || ''} ${vals.last_name || ''}`.trim() || vals.email || 'New Customer';
      await window.electronAPI.insertCustomer?.(
        '', vals.first_name || '', '', vals.last_name || '', '', vals.email || '', display,
        vals.company || '', vals.phone || '', '', '', '', '', '', '', '', '', '', '', '', '', '', null, 0, '', '', '', ''
      );
      message.success('Customer added');
      setCustModalOpen(false);
      custForm.resetFields();
      const c = await window.electronAPI.getAllCustomers?.();
      const custArr = Array.isArray(c) ? c : (c?.all || []);
      setCustomers(custArr);
      const newCust = custArr.find(cu => cu.email === vals.email || (cu.first_name === vals.first_name && cu.last_name === vals.last_name));
      if (newCust) form.setFieldsValue({ customer: newCust.id });
    } catch (e) { if (!e?.errorFields) message.error('Failed to add customer'); }
  };

  const handleAddProduct = async () => {
    try {
      const vals = await prodForm.validateFields();
      await window.electronAPI.insertProduct?.(
        'Product', vals.name || '', vals.sku || '', '', vals.description || '',
        Number(vals.price) || 0, '', 0, 0, 0, null
      );
      message.success('Product added');
      setProdModalOpen(false);
      prodForm.resetFields();
      const p = await window.electronAPI.getAllProducts?.();
      const prodArr = Array.isArray(p) ? p : (p?.all || []);
      setProducts(prodArr);
    } catch (e) { if (!e?.errorFields) message.error('Failed to add product'); }
  };

  const handleAddVat = async () => {
    try {
      const vals = await vatForm.validateFields();
      await window.electronAPI.insertVat?.(vals.vat_name || '', Number(vals.vat_percentage) || 0, null);
      message.success('VAT rate added');
      setVatModalOpen(false);
      vatForm.resetFields();
      const v = await window.electronAPI.getAllVat?.();
      setVatRates(Array.isArray(v) ? v : []);
    } catch (e) { if (!e?.errorFields) message.error('Failed to add VAT rate'); }
  };

  const loadDeps = async () => {
    try {
      const [c, p, v] = await Promise.all([
        window.electronAPI.getAllCustomers?.(),
        window.electronAPI.getAllProducts?.(),
        window.electronAPI.getAllVat?.(),
      ]);
      const custArr = Array.isArray(c) ? c : (c?.all || []);
      setCustomers(custArr);
      const prodArr = Array.isArray(p) ? p : (p?.all || []);
      setProducts(prodArr);
      setVatRates(Array.isArray(v) ? v : []);

      // Pre-select customer from query string
      const params = new URLSearchParams(location.search);
      const custId = params.get('customer');
      if (custId && !isEdit) {
        form.setFieldsValue({ customer: Number(custId) });
      }
    } catch (err) { console.error('loadDeps error:', err); }
    // Load company info separately so it never blocks the form
    try {
      const comp = await window.electronAPI.getCompany?.();
      if (comp) setCompany(comp);
    } catch {}
  };

  const loadInvoice = async () => {
    setLoading(true);
    try {
      const inv = await window.electronAPI.getSingleInvoice?.(id);
      if (inv) {
        const custVal = inv.customer_id || inv.customer;
        form.setFieldsValue({
          customer: custVal != null ? Number(custVal) : undefined,
          customer_email: inv.customer_email,
          billing_address: inv.billing_address,
          terms: inv.terms,
          start_date: inv.start_date ? moment(inv.start_date) : null,
          last_date: inv.last_date ? moment(inv.last_date) : null,
          number: inv.number,
          message: inv.message,
          statement_message: inv.statement_message,
          status: inv.status || 'Draft',
          vat: inv.vat != null ? Number(inv.vat) : 0,
        });
        if (Array.isArray(inv.lines) && inv.lines.length > 0) {
          setLines(inv.lines.map((l, i) => ({
            key: Date.now() + i,
            description: l.description || '',
            quantity: l.quantity || 1,
            rate: l.rate || 0,
            amount: (l.quantity || 1) * (l.rate || 0),
            product_id: l.product_id ? Number(l.product_id) : (l.product ? Number(l.product) : null),
          })));
        }
      }
    } catch { message.error('Failed to load invoice'); }
    setLoading(false);
  };

  const addLine = () => {
    setLines(prev => [...prev, { key: Date.now(), description: '', quantity: 1, rate: 0, amount: 0 }]);
  };

  const removeLine = (key) => {
    setLines(prev => prev.filter(l => l.key !== key));
  };

  const updateLine = (key, field, value) => {
    setLines(prev => prev.map(l => {
      if (l.key !== key) return l;
      const updated = { ...l, [field]: value };
      updated.amount = (Number(updated.quantity) || 0) * (Number(updated.rate) || 0);
      return updated;
    }));
  };

  const selectProduct = (key, productId) => {
    const prod = products.find(p => p.id === productId);
    if (prod) {
      updateLine(key, 'description', prod.name || prod.description);
      setLines(prev => prev.map(l => {
        if (l.key !== key) return l;
        const rate = Number(prod.selling_price || prod.price || 0);
        return { ...l, description: prod.name || prod.description, rate, amount: (l.quantity || 1) * rate, product_id: productId };
      }));
    }
  };

  const subtotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const vatPercent = Form.useWatch('vat', form) || 0;
  const vatAmount = subtotal * (Number(vatPercent) || 0) / 100;
  const grandTotal = subtotal + vatAmount;

  const handleSave = async (status) => {
    try {
      const vals = await form.validateFields();
      setSaving(true);
      const customer = vals.customer;
      const customer_email = vals.customer_email || '';
      const billing_address = vals.billing_address || '';
      const terms = vals.terms || '';
      const start_date = vals.start_date ? vals.start_date.format('YYYY-MM-DD') : moment().format('YYYY-MM-DD');
      const last_date = vals.last_date ? vals.last_date.format('YYYY-MM-DD') : '';
      const msg = vals.message || '';
      const statement_message = vals.statement_message || '';
      const number = vals.number || '';
      const vat = Number(vals.vat) || 0;
      const invoiceLines = lines.filter(l => l.description).map(l => ({
        description: l.description,
        quantity: Number(l.quantity) || 1,
        rate: Number(l.rate) || 0,
        amount: Number(l.amount) || 0,
        product_id: l.product_id || null,
      }));

      if (isEdit) {
        const res = await window.electronAPI.updateInvoice?.({
          id: Number(id), customer, customer_email, billing_address, terms,
          start_date, last_date, message: msg, statement_message, number,
          vat, status: status || vals.status || 'Draft', invoiceLines,
        });
        if (res?.error) { message.error(res.error); setSaving(false); return; }
        message.success('Invoice updated');
      } else {
        const res = await window.electronAPI.insertInvoice?.(
          customer, customer_email, false, billing_address, terms,
          start_date, last_date, msg, statement_message, number,
          null, vat, status || 'Draft', invoiceLines
        );
        if (res?.error) { message.error(typeof res.error === 'string' ? res.error : 'Insert failed'); setSaving(false); return; }
        if (res?.success === false) { message.error('Failed to create invoice'); setSaving(false); return; }
        message.success('Invoice created');
      }
      history.push('/main/customers/invoices/list');
    } catch (e) {
      if (e?.errorFields) return; // form validation
      message.error('Save failed');
    }
    setSaving(false);
  };

  const doPDF = (action) => {
    const vals = form.getFieldsValue();
    const cust = customers.find(c => c.id === (vals.customer));
    handleDocumentPDF(action, {
      docType: 'Invoice',
      header: {
        number: vals.number || '',
        status: vals.status || 'Draft',
        date: vals.start_date ? vals.start_date.format('DD/MM/YYYY') : '',
        dueDate: vals.last_date ? vals.last_date.format('DD/MM/YYYY') : '',
        terms: vals.terms || '',
        customerName: cust ? (cust.display_name || cust.name || `${cust.first_name || ''} ${cust.last_name || ''}`.trim()) : '',
        email: vals.customer_email || '',
        billingAddress: vals.billing_address || '',
      },
      lines,
      subtotal,
      vatPercent: Number(vatPercent) || 0,
      vatAmount,
      grandTotal,
      message: vals.message || '',
      statementMemo: vals.statement_message || '',
      company: {
        name: company.company_name || company.name || '',
        email: company.email || '',
        phone: company.phone || '',
        address: company.address || '',
        logo: company.logo || null,
      },
    });
  };

  const lineColumns = [
    { title: 'Product', key: 'product', width: 180,
      render: (_, r) => (
        <Select placeholder="Select product" size="small" allowClear style={{ width: '100%' }}
          value={r.product_id != null ? Number(r.product_id) : undefined}
          onChange={v => selectProduct(r.key, v)}
          dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setProdModalOpen(true)} size="small" style={{ width: '100%', textAlign: 'left' }}>Add New Product</Button></>)}>
          {products.map(p => <Select.Option key={p.id} value={Number(p.id)}>{p.name || p.description}</Select.Option>)}
        </Select>
      )},
    { title: 'Description', key: 'desc',
      render: (_, r) => <Input size="small" value={r.description} onChange={e => updateLine(r.key, 'description', e.target.value)} /> },
    { title: 'Qty', key: 'qty', width: 80,
      render: (_, r) => <InputNumber size="small" min={1} value={r.quantity} onChange={v => updateLine(r.key, 'quantity', v)} style={{ width: '100%' }} /> },
    { title: 'Rate', key: 'rate', width: 110,
      render: (_, r) => <InputNumber size="small" min={0} step={0.01} value={r.rate} onChange={v => updateLine(r.key, 'rate', v)} style={{ width: '100%' }} prefix="R" /> },
    { title: 'Amount', key: 'amount', width: 110,
      render: (_, r) => <span style={{ fontWeight: 500 }}>R {Number(r.amount || 0).toFixed(2)}</span> },
    { title: '', key: 'actions', width: 50,
      render: (_, r) => lines.length > 1 ? <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeLine(r.key)} /> : null },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => history.push('/main/customers/invoices/list')}>Back</Button>
          <h2 style={{ margin: 0 }}>{isEdit ? `Edit Invoice #${id}` : 'Create Invoice'}</h2>
        </Space>
        {isEdit && (
          <Space wrap>
            <Button icon={<EyeOutlined />} onClick={() => doPDF('preview')}>Preview</Button>
            <Button icon={<FilePdfOutlined />} onClick={() => doPDF('download')}>Download PDF</Button>
            <Button icon={<PrinterOutlined />} onClick={() => doPDF('print')}>Print</Button>
          </Space>
        )}
      </div>

      <Card loading={loading}>
        <Form form={form} layout="vertical">
          <Row gutter={16} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={8}>
              <Form.Item name="customer" label="Customer" rules={[{ required: true, message: 'Select customer' }]}>
                <Select showSearch placeholder="Select customer"
                  filterOption={(input, opt) => (opt?.children || '').toString().toLowerCase().includes(input.toLowerCase())}
                  dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setCustModalOpen(true)} style={{ width: '100%', textAlign: 'left' }}>Add New Customer</Button></>)}>
                  {customers.map(c => <Select.Option key={c.id} value={c.id}>{c.display_name || c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim()}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="number" label="Invoice Number"><Input placeholder="Auto-generated if blank" /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="terms" label="Payment Terms">
                <Select placeholder="Select terms" allowClear>
                  <Select.Option value="Net 15">Net 15</Select.Option>
                  <Select.Option value="Net 30">Net 30</Select.Option>
                  <Select.Option value="Net 45">Net 45</Select.Option>
                  <Select.Option value="Net 60">Net 60</Select.Option>
                  <Select.Option value="Due on Receipt">Due on Receipt</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={8}>
              <Form.Item name="start_date" label="Invoice Date" initialValue={moment()}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="last_date" label="Due Date">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="customer_email" label="Email"><Input /></Form.Item>
            </Col>
          </Row>
          <Row gutter={16} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={8}>
              <Form.Item name="billing_address" label="Billing Address"><Input.TextArea rows={2} /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="vat" label="VAT/Tax Rate (%)" initialValue={0}>
                <Select allowClear placeholder="Select VAT rate"
                  dropdownRender={(menu) => (<>{menu}<Divider style={{ margin: '4px 0' }} /><Button type="link" icon={<PlusOutlined />} onClick={() => setVatModalOpen(true)} style={{ width: '100%', textAlign: 'left' }}>Add New VAT Rate</Button></>)}>
                  <Select.Option value={0}>No Tax (0%)</Select.Option>
                  {vatRates.map(v => <Select.Option key={v.id} value={v.vat_percentage}>{v.vat_name} ({v.vat_percentage}%)</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="Status" initialValue="Draft">
                <Select>
                  <Select.Option value="Draft">Draft</Select.Option>
                  <Select.Option value="Sent">Sent</Select.Option>
                  <Select.Option value="Pending">Pending</Select.Option>
                  <Select.Option value="Unpaid">Unpaid</Select.Option>
                  <Select.Option value="Paid">Paid</Select.Option>
                  <Select.Option value="Partially Paid">Partially Paid</Select.Option>
                  <Select.Option value="Overdue">Overdue</Select.Option>
                  <Select.Option value="Cancelled">Cancelled</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>

        <Divider>Line Items</Divider>
        <Table dataSource={lines} columns={lineColumns} rowKey="key" size="small" pagination={false}
          footer={() => (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Button type="dashed" icon={<PlusOutlined />} onClick={addLine}>Add Line</Button>
              <div style={{ textAlign: 'right' }}>
                <div>Subtotal: R {subtotal.toFixed(2)}</div>
                {vatPercent > 0 && <div>VAT ({vatPercent}%): R {vatAmount.toFixed(2)}</div>}
                <div style={{ fontSize: 16, fontWeight: 600 }}>Total: R {grandTotal.toFixed(2)}</div>
              </div>
            </div>
          )}
        />

        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Col span={12}><Form.Item name="message" label="Message on Invoice"><Input.TextArea rows={2} /></Form.Item></Col>
            <Col span={12}><Form.Item name="statement_message" label="Statement Memo"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
        </Form>

        <Divider />
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <Space wrap>
            <Button size="large" onClick={() => handleSave('Draft')} loading={saving}>Save as Draft</Button>
            <Button size="large" type="primary" icon={<SaveOutlined />} onClick={() => handleSave('Sent')} loading={saving}>
              {isEdit ? 'Update & Send' : 'Save & Send'}
            </Button>
          </Space>
        </div>
      </Card>

      <Modal title="Add New Customer" visible={custModalOpen} onOk={handleAddCustomer} onCancel={() => setCustModalOpen(false)} okText="Add" destroyOnClose>
        <Form form={custForm} layout="vertical" preserve={false}>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="first_name" label="First Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="last_name" label="Last Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="company" label="Company"><Input /></Form.Item>
          <Form.Item name="email" label="Email"><Input type="email" /></Form.Item>
          <Form.Item name="phone" label="Phone"><Input /></Form.Item>
        </Form>
      </Modal>

      <Modal title="Add New Product" visible={prodModalOpen} onOk={handleAddProduct} onCancel={() => setProdModalOpen(false)} okText="Add" destroyOnClose>
        <Form form={prodForm} layout="vertical" preserve={false}>
          <Form.Item name="name" label="Product Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="sku" label="SKU"><Input /></Form.Item>
          <Form.Item name="description" label="Description"><Input /></Form.Item>
          <Form.Item name="price" label="Selling Price" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} step={0.01} prefix="R" /></Form.Item>
        </Form>
      </Modal>

      <Modal title="Add New VAT Rate" visible={vatModalOpen} onOk={handleAddVat} onCancel={() => setVatModalOpen(false)} okText="Add" destroyOnClose>
        <Form form={vatForm} layout="vertical" preserve={false}>
          <Form.Item name="vat_name" label="VAT Name" rules={[{ required: true }]}><Input placeholder="e.g. Standard Rate" /></Form.Item>
          <Form.Item name="vat_percentage" label="Percentage (%)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} max={100} step={0.5} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CreateInvoice;
