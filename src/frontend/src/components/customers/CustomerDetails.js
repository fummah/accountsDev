import React, { useState, useEffect } from 'react';
import { Card, Descriptions, Table, Tabs, Button, Space, Tag, Statistic, Row, Col, message, Form, Modal, Spin, Empty, List, Avatar, Typography, Divider, InputNumber, Select, DatePicker } from 'antd';
import { ArrowLeftOutlined, EditOutlined, FileTextOutlined, DollarOutlined, PlusOutlined, LeftOutlined, RightOutlined, FileDoneOutlined, MailOutlined, PhoneOutlined, ClockCircleOutlined, CheckCircleOutlined, SolutionOutlined, SnippetsOutlined, HistoryOutlined, ProfileOutlined, FunnelPlotOutlined, RollbackOutlined, FileProtectOutlined } from '@ant-design/icons';
import { useParams, useHistory, Link } from 'react-router-dom';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';
import { getCustomerName } from '../../utils/contactIdentity';
import { formatAddressLines } from '../../utils/address';
import { formatPhone } from '../../utils/phone';
import CustomerPaymentHistory from './payments/CustomerPaymentHistory';
import RefundInvoiceModal from './payments/RefundInvoiceModal';
import AccountSelect from '../shared/AccountSelect';
import CustomerContactFields from './shared/CustomerContactFields';
import { resolveTaxRateFields, taxRateFormValue, describeTaxRate } from '../../utils/taxRate';
import { MODAL_BODY_SCROLL_STYLE, MODAL_WIDTH } from '../shared/FormSection';
import { normalizeStatus } from '../StatusBadge';

const { TabPane } = Tabs;
const { Title, Text } = Typography;
// Automatic invoice statuses + quote workflow statuses (legacy labels kept as
// a colour fallback for any pre-migration row still on disk).
const statusColors = { Open: 'blue', 'Partially Paid': 'orange', Paid: 'success', Draft: 'default', Void: 'volcano', Cancelled: 'default', Pending: 'gold', Accepted: 'success', Declined: 'error', Converted: 'purple', Overdue: 'error' };

const CustomerDetails = () => {
  const { symbol: cSym } = useCurrency();
  const { id } = useParams();
  const history = useHistory();
  const [customer, setCustomer] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [creditNotes, setCreditNotes] = useState([]);
  const [issueCreditOpen, setIssueCreditOpen] = useState(false);
  const [issueCreditInvoice, setIssueCreditInvoice] = useState(null);
  const [cnDetail, setCnDetail] = useState(null);
  const [cnDetailOpen, setCnDetailOpen] = useState(false);
  const [cnApply, setCnApply] = useState(null);
  const [cnApplyInvoice, setCnApplyInvoice] = useState(null);
  const [cnRefund, setCnRefund] = useState(null);
  const [cnRefundAmount, setCnRefundAmount] = useState(0);
  const [cnRefundBank, setCnRefundBank] = useState(null);
  const [cnRefundMethod, setCnRefundMethod] = useState('Bank Transfer');
  const [cnRefundDate, setCnRefundDate] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [cnBusy, setCnBusy] = useState(false);
  const [leads, setLeads] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [vatRates, setVatRates] = useState([]);
  const [form] = Form.useForm();

  useEffect(() => {
    window.electronAPI.getAllVat?.().then(v => setVatRates(Array.isArray(v) ? v : [])).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [c, allCust, allInvRaw, allQRaw, leadsRaw] = await Promise.all([
        window.electronAPI.getSingleCustomer?.(id),
        window.electronAPI.getAllCustomers?.(),
        window.electronAPI.getAllInvoices?.(),
        window.electronAPI.getAllQuotes?.(),
        window.electronAPI.crmListLeadsByCustomer?.(id),
      ]);
      if (c) setCustomer(c);
      const custArr = Array.isArray(allCust) ? allCust : (allCust?.all || []);
      setAllCustomers(custArr);
      const invArr = Array.isArray(allInvRaw) ? allInvRaw : (allInvRaw?.all || []);
      setInvoices(invArr.filter(inv => String(inv.customer) === String(id) || String(inv.customer_id) === String(id)));
      const qArr = Array.isArray(allQRaw) ? allQRaw : allQRaw || [];
      setQuotes(qArr.filter(q => String(q.customer) === String(id) || String(q.customer_id) === String(id)));
      setLeads(Array.isArray(leadsRaw) ? leadsRaw : []);
      try {
        const rfs = await window.electronAPI.customerRefundsByCustomer?.(id);
        setRefunds(Array.isArray(rfs) ? rfs.filter(r => String(r.status || '').toLowerCase() !== 'reversed') : []);
      } catch { setRefunds([]); }
      try {
        const cns = await window.electronAPI.creditNotesByCustomer?.(id);
        setCreditNotes(Array.isArray(cns) ? cns : []);
      } catch { setCreditNotes([]); }
      try {
        const accs = await window.electronAPI.getChartOfAccounts?.();
        setAccounts(Array.isArray(accs) ? accs : (accs?.data || []));
      } catch { setAccounts([]); }
    } catch {
      message.error('Failed to load customer');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  // Navigation between customers
  const currentIdx = allCustomers.findIndex(c => String(c.id) === String(id));
  const prevCustomer = currentIdx > 0 ? allCustomers[currentIdx - 1] : null;
  const nextCustomer = currentIdx >= 0 && currentIdx < allCustomers.length - 1 ? allCustomers[currentIdx + 1] : null;

  const openEdit = () => {
    if (!customer) return;
    form.setFieldsValue({
      first_name: customer.first_name || '',
      last_name: customer.last_name || '',
      display_name: customer.display_name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
      company_name: customer.company || customer.company_name,
      email: customer.email,
      phone_number: customer.phone_number || customer.mobile_number,
      mobile_number: customer.mobile_number || '',
      address1: customer.address1 || customer.billing_address || '',
      address2: customer.address2 || '',
      city: customer.city || '',
      state: customer.state || '',
      postal_code: customer.postal_code || '',
      country: customer.country || '',
      notes: customer.notes,
      taxable: customer.taxable != null ? !!Number(customer.taxable) : true,
      default_tax_rate_id: taxRateFormValue(customer, vatRates),
    });
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    try {
      const vals = await form.validateFields();
      const tax = resolveTaxRateFields(vals, vatRates);
      await window.electronAPI.updateCustomer?.({ id: Number(id), first_name: vals.first_name, last_name: vals.last_name, display_name: vals.display_name || `${vals.first_name || ''} ${vals.last_name || ''}`.trim() || vals.company_name || '', company_name: vals.company_name, email: vals.email, phone_number: vals.phone_number, mobile_number: vals.mobile_number, address1: vals.address1, address2: vals.address2, city: vals.city, state: vals.state, postal_code: vals.postal_code, country: vals.country, notes: vals.notes, taxable: vals.taxable, default_tax_rate: tax.default_tax_rate, default_tax_rate_id: tax.default_tax_rate_id });
      message.success('Customer updated');
      setEditOpen(false);
      load();
    } catch {}
  };

  const custName = customer?.display_name || customer?.name || `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim() || 'Customer';

  // ── Customer credit / refund actions (managed in Customer Details) ────────
  const openCreditNote = async (cn) => {
    try {
      const full = await window.electronAPI.creditNoteGet?.(cn.id);
      setCnDetail(full && !full.error ? full : cn);
    } catch { setCnDetail(cn); }
    setCnDetailOpen(true);
  };
  const openIssueCredit = (invoice) => { setIssueCreditInvoice(invoice || null); setIssueCreditOpen(true); };
  const applyCreditNote = async () => {
    if (!cnApply || !cnApplyInvoice) { message.warning('Select an invoice'); return; }
    setCnBusy(true);
    try {
      const res = await window.electronAPI.creditNoteApply?.(cnApply.id, cnApplyInvoice);
      if (res?.success) { message.success('Credit applied to invoice'); setCnApply(null); setCnApplyInvoice(null); setCnDetailOpen(false); load(); }
      else message.error(res?.error || 'Failed to apply credit');
    } finally { setCnBusy(false); }
  };
  const openRefundCredit = (cn) => {
    setCnRefund(cn);
    setCnRefundAmount(Math.max(0, Number(cn.total || 0)));
    setCnRefundBank(null); setCnRefundMethod('Bank Transfer'); setCnRefundDate(moment());
  };
  const doRefundCredit = async () => {
    if (!cnRefund || !(Number(cnRefundAmount) > 0) || !cnRefundBank) { message.warning('Enter an amount and select a bank account'); return; }
    setCnBusy(true);
    try {
      const res = await window.electronAPI.customerRefundCreate?.({
        creditNoteId: cnRefund.id, customerId: id, amount: Number(cnRefundAmount),
        bankAccountId: cnRefundBank, method: cnRefundMethod,
        date: cnRefundDate ? cnRefundDate.format('YYYY-MM-DD') : undefined, reason: 'Credit refund',
      });
      if (res?.success) { message.success('Refund created'); setCnRefund(null); setCnDetailOpen(false); load(); }
      else message.error(res?.error || 'Refund failed');
    } finally { setCnBusy(false); }
  };
  const receivableInvoices = invoices.filter(i => ['Open', 'Partially Paid'].includes(normalizeStatus(i.status)));
  const totalReceivables = receivableInvoices.reduce((s, i) => s + (Number(i.balance != null ? i.balance : i.amount) || 0), 0);
  const totalPaid = invoices.reduce((s, i) => s + (Number(i.totalPaid != null ? i.totalPaid : (normalizeStatus(i.status) === 'Paid' ? i.amount : 0)) || 0), 0);
  const overdue = receivableInvoices.filter(i => i.last_date && moment(i.last_date).isBefore(moment(), 'day'));
  const openInvoiceCount = receivableInvoices.length;
  const recentInvoices = [...invoices].sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, 5);
  const recentQuotes = [...quotes].sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, 5);

  const invoiceColumns = [
    { title: '#', dataIndex: 'number', key: 'number', width: 110,
      render: (t, r) => <Link to={`/main/customers/invoices/edit/${r.id}`}>{t || `#${r.id}`}</Link> },
    { title: 'Date', dataIndex: 'start_date', key: 'date', width: 100,
      render: d => d ? moment(d).format('MM/DD/YYYY') : '-' },
    { title: 'Due', dataIndex: 'last_date', key: 'due', width: 100,
      render: d => d ? moment(d).format('MM/DD/YYYY') : '-' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120,
      render: v => <span style={{ fontWeight: 500 }}>{cSym} {Number(v || 0).toFixed(2)}</span> },
    { title: 'Paid', dataIndex: 'totalPaid', key: 'paid', width: 120,
      render: v => {
        const n = Number(v || 0);
        return n > 0
          ? <span style={{ color: '#52c41a', fontWeight: 500 }}>{cSym} {n.toFixed(2)}</span>
          : <span style={{ color: '#bfbfbf' }}>{cSym} 0.00</span>;
      } },
    { title: 'Balance', dataIndex: 'balance', key: 'balance', width: 120,
      render: v => {
        const n = Number(v || 0);
        return n > 0
          ? <span style={{ color: '#fa541c', fontWeight: 500 }}>{cSym} {n.toFixed(2)}</span>
          : <span style={{ color: '#52c41a' }}>{cSym} 0.00</span>;
      } },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 120,
      render: s => <Tag color={statusColors[s] || 'default'}>{s}</Tag> },
    { title: 'Actions', key: 'actions', width: 140,
      render: (_, r) => <Button size="small" icon={<RollbackOutlined />} onClick={() => openIssueCredit(r)}>Issue Credit</Button> },
  ];

  const quoteColumns = [
    { title: '#', dataIndex: 'number', key: 'number', width: 110,
      render: (t, r) => <Link to={`/main/customers/quotes/edit/${r.id}`}>{t || `#${r.id}`}</Link> },
    { title: 'Customer', dataIndex: 'customer_name', key: 'customer', ellipsis: true,
      render: (t, r) => getCustomerName(r) || t || '-' },
    { title: 'Date', dataIndex: 'start_date', key: 'date', width: 100,
      render: d => d ? moment(d).format('MM/DD/YYYY') : '-' },
    { title: 'Expiry', dataIndex: 'last_date', key: 'expiry', width: 100,
      render: d => d ? moment(d).format('MM/DD/YYYY') : '-' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120,
      render: v => <span style={{ fontWeight: 500 }}>{cSym} {Number(v || 0).toFixed(2)}</span> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      render: s => <Tag color={statusColors[s] || 'default'}>{s}</Tag> },
  ];

  if (!customer && !loading) return <div style={{ padding: 24 }}>Customer not found. <Button onClick={() => history.goBack()}>Go Back</Button></div>;

  const initials = custName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const custEmail = customer?.email && customer.email !== 'null' ? customer.email : '';
  const custPhone = customer?.phone_number && customer.phone_number !== 'null' ? formatPhone(customer.phone_number) : (customer?.mobile_number && customer.mobile_number !== 'null' ? formatPhone(customer.mobile_number) : '');

  return (
    <Spin spinning={loading}>
    <div style={{ padding: 24 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={() => history.push('/main/customers/center')}>Back</Button>
          {prevCustomer && <Button icon={<LeftOutlined />} onClick={() => history.push(`/main/customers/details/${prevCustomer.id}`)}>Prev</Button>}
          {nextCustomer && <Button onClick={() => history.push(`/main/customers/details/${nextCustomer.id}`)}>Next <RightOutlined /></Button>}
        </Space>
        <Space wrap>
          <Button type="primary" icon={<EditOutlined />} onClick={openEdit} style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(24,144,255,0.35)', fontWeight: 600 }}>Edit Customer</Button>
          <Button icon={<FileTextOutlined />} onClick={() => history.push(`/main/customers/invoices/new?customer=${id}`)}>New Invoice</Button>
          <Button icon={<FileDoneOutlined />} onClick={() => history.push(`/main/customers/quotes/new?customer=${id}`)}>New Quote</Button>
        </Space>
      </div>

      {/* Profile header */}
      <Card style={{ marginBottom: 20, borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }} bodyStyle={{ padding: 24 }}>
        <Row gutter={16} align="middle" style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Col flex="auto">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <Avatar size={64} style={{ background: 'linear-gradient(135deg,#1890ff,#69c0ff)', fontSize: 24, fontWeight: 700, flexShrink: 0 }}>{initials || 'C'}</Avatar>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Title level={3} style={{ margin: 0 }}>{custName}</Title>
                  <Tag color="processing" style={{ borderRadius: 20, paddingInline: 12, marginInlineEnd: 0 }}>Customer</Tag>
                </div>
                <Space wrap size={[8, 4]} style={{ marginTop: 6 }}>
                  {custEmail && <a href={`mailto:${custEmail}`} style={{ color: 'rgba(0,0,0,0.65)' }}><MailOutlined style={{ marginRight: 4 }} />{custEmail}</a>}
                  {custPhone && custEmail && <span style={{ color: '#d9d9d9' }}>•</span>}
                  {custPhone && <a href={`tel:${custPhone}`} style={{ color: 'rgba(0,0,0,0.65)' }}><PhoneOutlined style={{ marginRight: 4 }} />{custPhone}</a>}
                </Space>
              </div>
            </div>
          </Col>
          <Col xs={24} sm={8}>
            <Row gutter={[8, 8]}>
              <Col span={24} style={{ textAlign: 'right' }}>
                <Statistic title="Total Receivables" value={totalReceivables.toFixed(2)} prefix={cSym} valueStyle={{ fontSize: 22, color: '#1890ff' }} />
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      {/* Stat tiles */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 12, border: '1px solid #f0f0f0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg,#1890ff,#69c0ff)', color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><DollarOutlined /></div>
              <div><Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Receivables</Text><Text strong style={{ fontSize: 18 }}>{cSym}{totalReceivables.toFixed(2)}</Text></div>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 12, border: '1px solid #f0f0f0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg,#52c41a,#95de64)', color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckCircleOutlined /></div>
              <div><Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Paid</Text><Text strong style={{ fontSize: 18, color: '#3f8600' }}>{cSym}{totalPaid.toFixed(2)}</Text></div>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 12, border: '1px solid #f0f0f0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg,#fa8c16,#ffc53d)', color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ClockCircleOutlined /></div>
              <div><Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Overdue</Text><Text strong style={{ fontSize: 18, color: overdue.length > 0 ? '#f5222d' : '#52c41a' }}>{overdue.length}</Text></div>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 12, border: '1px solid #f0f0f0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg,#722ed1,#b37feb)', color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SolutionOutlined /></div>
              <div><Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Open Invoices</Text><Text strong style={{ fontSize: 18 }}>{openInvoiceCount}</Text></div>
            </div>
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 14, border: '1px solid #f0f0f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }} bodyStyle={{ padding: '16px 24px 24px' }}>
      <div style={{ marginBottom: 8 }}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} type="card" tabBarStyle={{ marginBottom: 20 }}>
          <TabPane tab={<span><ProfileOutlined /> Customer Details</span>} key="details" />
          <TabPane tab={<span><FileTextOutlined /> Invoices ({invoices.length})</span>} key="invoices" />
          <TabPane tab={<span><FileDoneOutlined /> Quotes ({quotes.length})</span>} key="quotes" />
          <TabPane tab={<span><FunnelPlotOutlined /> Leads{leads.length ? ` (${leads.length})` : ''}</span>} key="leads" />
          <TabPane tab={<span><ProfileOutlined /> Transaction List</span>} key="transactions" />
          <TabPane tab={<span><HistoryOutlined /> Payments</span>} key="payments" />
          <TabPane tab={<span><SnippetsOutlined /> Statements</span>} key="statements" />
        </Tabs>

        {activeTab === 'details' && (
          <>
            <Card loading={loading} style={{ marginBottom: 16 }}>
              <Descriptions column={{ xs: 1, sm: 2, md: 2 }} bordered size="small">
                <Descriptions.Item label="Display Name">{custName}</Descriptions.Item>
                <Descriptions.Item label="Company">{(customer?.company_name && customer.company_name !== 'null') ? customer.company_name : '-'}</Descriptions.Item>
                <Descriptions.Item label="First Name">{(customer?.first_name && customer.first_name !== 'null') ? customer.first_name : '-'}</Descriptions.Item>
                <Descriptions.Item label="Last Name">{(customer?.last_name && customer.last_name !== 'null') ? customer.last_name : '-'}</Descriptions.Item>
                <Descriptions.Item label="Date Entered">{(customer?.date_entered && customer.date_entered !== 'null') ? moment(customer.date_entered).format('MM/DD/YYYY') : '-'}</Descriptions.Item>
                <Descriptions.Item label="Tax Status">{(customer?.taxable == null || Number(customer.taxable)) ? 'Taxable' : 'Tax-Exempt'}</Descriptions.Item>
                <Descriptions.Item label="Default Tax Rate">{describeTaxRate(customer || {}, vatRates)}</Descriptions.Item>
                <Descriptions.Item label="Email">{(customer?.email && customer.email !== 'null') ? customer.email : '-'}</Descriptions.Item>
                <Descriptions.Item label="Phone">{(customer?.phone_number && customer.phone_number !== 'null') ? formatPhone(customer.phone_number) : ((customer?.mobile_number && customer.mobile_number !== 'null') ? formatPhone(customer.mobile_number) : '-')}</Descriptions.Item>
                <Descriptions.Item label="Balance">{cSym} {Number(customer?.opening_balance || 0).toFixed(2)}</Descriptions.Item>
                <Descriptions.Item label="Payment Terms">{(customer?.terms && customer.terms !== 'null') ? customer.terms : ((customer?.payment_method && customer.payment_method !== 'null') ? customer.payment_method : '-')}</Descriptions.Item>
                <Descriptions.Item label="Billing Address" span={2}>
                  {(() => {
                    const lines = formatAddressLines(customer || {});
                    return lines.length ? lines.map((l, i) => <div key={i}>{l}</div>) : '-';
                  })()}
                </Descriptions.Item>
                <Descriptions.Item label="Notes" span={2}>{(customer?.notes && customer.notes !== 'null') ? customer.notes : '-'}</Descriptions.Item>
              </Descriptions>
            </Card>
            <Row gutter={16}>
              <Col span={12}>
                <Card title={<><FileTextOutlined /> Recent Invoices</>} size="small"
                  extra={<Button type="link" size="small" onClick={function() { setActiveTab('invoices'); }}>View All</Button>}>
                  {recentInvoices.length === 0 ? <Empty description="No invoices" image={Empty.PRESENTED_IMAGE_SIMPLE} /> :
                    <List size="small" dataSource={recentInvoices} renderItem={function(inv) { return (
                      <List.Item extra={<Tag color={statusColors[inv.status] || 'default'}>{inv.status}</Tag>}>
                        <List.Item.Meta
                          title={<Link to={'/main/customers/invoices/edit/' + inv.id}>{inv.number || '#' + inv.id}</Link>}
                          description={`${cSym} ${Number(inv.amount || 0).toFixed(2)} — ${inv.start_date ? moment(inv.start_date).format('MM/DD/YYYY') : ''}`} />
                      </List.Item>
                    ); }} />}
                </Card>
              </Col>
              <Col span={12}>
                <Card title={<><FileDoneOutlined /> Recent Quotes</>} size="small"
                  extra={<Button type="link" size="small" onClick={function() { setActiveTab('quotes'); }}>View All</Button>}>
                  {recentQuotes.length === 0 ? <Empty description="No quotes" image={Empty.PRESENTED_IMAGE_SIMPLE} /> :
                    <List size="small" dataSource={recentQuotes} renderItem={function(q) { return (
                      <List.Item extra={<Tag color={statusColors[q.status] || 'default'}>{q.status}</Tag>}>
                        <List.Item.Meta
                          title={<Link to={'/main/customers/quotes/edit/' + q.id}>{q.number || '#' + q.id}</Link>}
                          description={`${cSym} ${Number(q.amount || 0).toFixed(2)} — ${q.start_date ? moment(q.start_date).format('MM/DD/YYYY') : ''}`} />
                      </List.Item>
                    ); }} />}
                </Card>
              </Col>
            </Row>
          </>
        )}

        {activeTab === 'invoices' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <Space>
                <Button type="primary" icon={<PlusOutlined />} onClick={function() { history.push('/main/customers/invoices/new?customer=' + id); }}>New Invoice</Button>
                <Button icon={<RollbackOutlined />} onClick={() => openIssueCredit(null)}>Issue Credit</Button>
              </Space>
            </div>
            <Table dataSource={invoices} columns={invoiceColumns} rowKey="id" size="small"
              pagination={{ defaultPageSize: 15, showTotal: function(t) { return t + ' invoices'; } }} />
          </>
        )}

        {activeTab === 'quotes' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={function() { history.push('/main/customers/quotes/new?customer=' + id); }}>New Quote</Button>
            </div>
            <Table dataSource={quotes} columns={quoteColumns} rowKey="id" size="small"
              pagination={{ defaultPageSize: 15, showTotal: function(t) { return t + ' quotes'; } }} />
          </>
        )}

        {activeTab === 'transactions' && (
          <Table dataSource={[].concat(
            invoices.map(function(i) { return Object.assign({}, i, { docType: 'Invoice' }); }),
            quotes.map(function(q) { return Object.assign({}, q, { docType: 'Quote' }); }),
            refunds.map(function(r) { return Object.assign({}, r, { docType: 'Refund', number: r.refund_number, start_date: r.date, amount: -Math.abs(Number(r.amount || 0)), status: r.status }); }),
            creditNotes.map(function(cn) { return Object.assign({}, cn, { docType: 'Credit Note', number: cn.credit_note_number, start_date: cn.date, amount: -Math.abs(Number(cn.total || 0)), status: cn.status }); })
          ).sort(function(a, b) { return (b.id || 0) - (a.id || 0); })}
            columns={[
              { title: 'Type', dataIndex: 'docType', key: 'type', width: 110, render: function(t) { return <Tag color={t === 'Invoice' ? 'blue' : t === 'Refund' ? 'red' : t === 'Credit Note' ? 'orange' : 'purple'}>{t}</Tag>; } },
              { title: '#', dataIndex: 'number', key: 'number', width: 120,
                render: function(t, r) {
                  if (r.docType === 'Refund') return t || 'REF';
                  if (r.docType === 'Credit Note') return <a onClick={function() { openCreditNote(r); }}>{t || 'CN'}</a>;
                  return <Link to={'/main/customers/' + (r.docType === 'Invoice' ? 'invoices' : 'quotes') + '/edit/' + r.id}>{t || '#' + r.id}</Link>;
                } },
              { title: 'Date', dataIndex: 'start_date', key: 'date', width: 100, render: function(d) { return d ? moment(d).format('MM/DD/YYYY') : '-'; } },
              { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120,
                render: function(v) { return <span style={{ fontWeight: 500 }}>{cSym} {Number(v || 0).toFixed(2)}</span>; } },
              { title: 'Status', dataIndex: 'status', key: 'status', width: 110,
                render: function(s) { return <Tag color={statusColors[s] || 'default'}>{s}</Tag>; } },
            ]}
            rowKey={function(r) { return r.docType + '-' + r.id; }} size="small"
            pagination={{ defaultPageSize: 20, showTotal: function(t) { return t + ' transactions'; } }} />
        )}

        {activeTab === 'payments' && (
          <CustomerPaymentHistory customerId={id} mode="customer" embedded onChange={load} />
        )}

        {activeTab === 'leads' && (
          <>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Leads linked to this customer. Leads are managed in CRM → Leads.
              </Text>
              <Button type="primary" size="small" icon={<PlusOutlined />}
                onClick={function() { history.push('/main/customers/leads'); }}>Go to Leads</Button>
            </div>
            <Table dataSource={leads} rowKey="id" size="small" pagination={false}
              locale={{ emptyText: <Empty description="No leads linked to this customer" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              columns={[
                { title: 'Lead', dataIndex: 'name', key: 'name',
                  render: function(v) { return <strong>{v}</strong>; } },
                { title: 'Stage', dataIndex: 'pipeline_stage', key: 'stage',
                  render: function(s) {
                    const colors = { new:'default', contacted:'blue', qualified:'purple', proposal:'orange', negotiation:'magenta', won:'success', lost:'error' };
                    return <Tag color={colors[s] || 'default'}>{s || '—'}</Tag>;
                  } },
                { title: 'Priority', dataIndex: 'priority', key: 'priority',
                  render: function(p) { return p ? <Tag>{p}</Tag> : '—'; } },
                { title: 'Deal Value', dataIndex: 'value', key: 'value',
                  render: function(v) { return <span style={{ color:'#1890ff' }}>{cSym} {Number(v || 0).toFixed(2)}</span>; } },
                { title: 'Source', dataIndex: 'source', key: 'source', render: function(v) { return v || '—'; } },
                { title: 'Expected Close', dataIndex: 'expected_close_date', key: 'close',
                  render: function(d) { return d ? moment(d).format('MM/DD/YYYY') : '—'; } },
                { title: 'Assigned To', dataIndex: 'assigned_to', key: 'assigned', render: function(v) { return v || '—'; } },
              ]} />
          </>
        )}

        {activeTab === 'statements' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <Button type="primary" onClick={function() { history.push('/main/customers/statements/new'); }}>Generate Statement</Button>
            </div>
            <Table dataSource={invoices}
              columns={[
                { title: 'Date', dataIndex: 'start_date', key: 'date', render: function(d) { return d ? moment(d).format('MM/DD/YYYY') : '-'; } },
                { title: 'Description', key: 'desc', render: function(_, r) { return 'Invoice ' + (r.number || '#' + r.id); } },
                { title: 'Amount', dataIndex: 'amount', key: 'amount', render: function(v) { return <span>{cSym} {Number(v || 0).toFixed(2)}</span>; } },
                { title: 'Status', dataIndex: 'status', key: 'status', render: function(s) { return <Tag color={statusColors[s] || 'default'}>{s}</Tag>; } },
                { title: 'Paid', key: 'paid', render: function(_, r) {
                    const p = Number(r.totalPaid || 0);
                    return p > 0 ? <span style={{ color: '#52c41a' }}>{cSym} {p.toFixed(2)}</span> : <span style={{ color: '#bfbfbf' }}>{cSym} 0.00</span>;
                  } },
                { title: 'Balance', key: 'balance', render: function(_, r) {
                    const b = Number(r.balance != null ? r.balance : r.amount || 0);
                    return b > 0 ? <span style={{ color: '#f5222d' }}>{cSym} {b.toFixed(2)}</span> : <span style={{ color: '#52c41a' }}>{cSym} 0.00</span>;
                  } },
              ]}
              rowKey="id" size="small" pagination={false}
              summary={function() { return (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={2}><strong>Total Outstanding</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={2}><strong>{cSym} {totalReceivables.toFixed(2)}</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={3} colSpan={3} />
                </Table.Summary.Row>
              ); }} />
          </>
        )}
      </div>
      </Card>

      <Modal title="Edit Customer" visible={editOpen} onOk={handleUpdate} onCancel={() => setEditOpen(false)} okText="Save" width={MODAL_WIDTH} bodyStyle={MODAL_BODY_SCROLL_STYLE}>
        <Form form={form} layout="vertical">
          <CustomerContactFields form={form}
            vatRates={vatRates}
            address1Placeholder="123 Main St" address2Placeholder="Apt/Suite"
            countryPlaceholder="Select a country" />
        </Form>
      </Modal>

      {/* Issue Credit (customer-scoped; invoice optional) — reuses the Credit Memo engine */}
      <RefundInvoiceModal
        customerId={id}
        customerName={custName}
        initialInvoiceId={issueCreditInvoice?.id}
        visible={issueCreditOpen}
        onClose={() => { setIssueCreditOpen(false); setIssueCreditInvoice(null); }}
        onSuccess={load}
      />

      {/* Credit Note detail (reuses the existing credit-note API) */}
      <Modal
        title={cnDetail ? `Credit Note ${cnDetail.credit_note_number || ''}` : 'Credit Note'}
        visible={cnDetailOpen}
        onCancel={() => { setCnDetailOpen(false); setCnDetail(null); }}
        footer={cnDetail ? [
          (cnDetail.status === 'Draft' || cnDetail.status === 'Issued') && <Button key="apply" icon={<CheckCircleOutlined />} onClick={() => { setCnApply(cnDetail); setCnApplyInvoice(null); }}>Apply Credit</Button>,
          <Button key="refund" icon={<RollbackOutlined />} onClick={() => openRefundCredit(cnDetail)}>Refund</Button>,
          <Button key="close" onClick={() => { setCnDetailOpen(false); setCnDetail(null); }}>Close</Button>,
        ].filter(Boolean) : null}
        width={640}
      >
        {cnDetail && (
          <>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Credit #">{cnDetail.credit_note_number}</Descriptions.Item>
              <Descriptions.Item label="Date">{cnDetail.date ? moment(cnDetail.date).format('MM/DD/YYYY') : '-'}</Descriptions.Item>
              <Descriptions.Item label="Reason">{cnDetail.reason || '-'}</Descriptions.Item>
              <Descriptions.Item label="Status"><Tag>{cnDetail.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="Total">{cSym} {Number(cnDetail.total || 0).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="Notes">{cnDetail.notes || '-'}</Descriptions.Item>
            </Descriptions>
            {Array.isArray(cnDetail.lines) && cnDetail.lines.length > 0 && (
              <Table size="small" style={{ marginTop: 12 }} rowKey={(r, i) => i} pagination={false}
                dataSource={cnDetail.lines}
                columns={[
                  { title: 'Description', dataIndex: 'description' },
                  { title: 'Qty', dataIndex: 'quantity', align: 'right', width: 70 },
                  { title: 'Price', dataIndex: 'unit_price', align: 'right', width: 100, render: v => `${cSym} ${Number(v || 0).toFixed(2)}` },
                  { title: 'Amount', dataIndex: 'amount', align: 'right', width: 100, render: v => `${cSym} ${Number(v || 0).toFixed(2)}` },
                ]} />
            )}
          </>
        )}
      </Modal>

      {/* Apply Credit (only this customer's invoices) */}
      <Modal title="Apply Credit to Invoice" visible={!!cnApply} onOk={applyCreditNote} confirmLoading={cnBusy}
        onCancel={() => { setCnApply(null); setCnApplyInvoice(null); }} okText="Apply">
        <Text type="secondary">Only this customer's invoices are listed.</Text>
        <Select style={{ width: '100%', marginTop: 8 }} placeholder="Select invoice" value={cnApplyInvoice} onChange={setCnApplyInvoice} showSearch optionFilterProp="children">
          {invoices.map(inv => <Select.Option key={inv.id} value={inv.id}>{`${inv.number || `INV-${inv.id}`} · ${inv.status || ''} · ${cSym} ${Number(inv.amount || 0).toFixed(2)}`}</Select.Option>)}
        </Select>
      </Modal>

      {/* Refund Customer Credit (creates a linked Refund; the credit note remains) */}
      <Modal title="Refund Customer Credit" visible={!!cnRefund} onOk={doRefundCredit} confirmLoading={cnBusy}
        onCancel={() => setCnRefund(null)} okText="Refund" width={480}>
        {cnRefund && (
          <>
            <Text>Credit {cnRefund.credit_note_number} · {cSym} {Number(cnRefund.total || 0).toFixed(2)} available</Text>
            <div style={{ marginTop: 12 }}>
              <div style={{ marginBottom: 4 }}>Refund Amount</div>
              <InputNumber style={{ width: '100%' }} min={0} max={Number(cnRefund.total || 0)} precision={2} prefix={cSym} value={cnRefundAmount} onChange={v => setCnRefundAmount(v || 0)} />
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ marginBottom: 4 }}>Bank / Cash Account</div>
              <AccountSelect accounts={accounts} allowedTypes={['Bank', 'Cash']} value={cnRefundBank} onChange={setCnRefundBank} placeholder="Select bank / cash account" />
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ marginBottom: 4 }}>Method</div>
              <Select style={{ width: '100%' }} value={cnRefundMethod} onChange={setCnRefundMethod} options={['Bank Transfer', 'Cash', 'Check', 'EFT/ACH', 'Other'].map(m => ({ value: m, label: m }))} />
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ marginBottom: 4 }}>Date</div>
              <DatePicker style={{ width: '100%' }} value={cnRefundDate} onChange={setCnRefundDate} />
            </div>
          </>
        )}
      </Modal>
    </div>
    </Spin>
  );
};

export default CustomerDetails;
