import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Table, Button, Space, Tabs, message, Input, Modal, Form, Tooltip, Avatar, Typography, Popconfirm } from 'antd';
import { DollarOutlined, FileDoneOutlined, ClockCircleOutlined, PlusOutlined, SearchOutlined, ReloadOutlined, TeamOutlined, FileTextOutlined, EditOutlined, DeleteOutlined, StopOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { Link, useHistory } from 'react-router-dom';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';
import { getCustomerName } from '../../utils/contactIdentity';
import { formatPhone } from '../../utils/phone';
import CustomerContactFields from './shared/CustomerContactFields';
import { resolveTaxRateFields, describeTaxRate } from '../../utils/taxRate';
import { MODAL_BODY_SCROLL_STYLE, MODAL_WIDTH } from '../shared/FormSection';
import ListToolbar from '../shared/ListToolbar';
import { toCsv, downloadCsv, csvDate } from '../../utils/csv';
import { normalizeStatus } from '../StatusBadge';

const { TabPane } = Tabs;
const { Title, Text } = Typography;

const statusDot = {
  Open: { color: '#1890ff', bg: '#e6f7ff' },
  'Partially Paid': { color: '#fa8c16', bg: '#fff7e6' },
  Paid: { color: '#52c41a', bg: '#f6ffed' },
  Void: { color: '#d4380d', bg: '#fff2e8' },
  Draft: { color: '#8c8c8c', bg: '#fafafa' },
  Cancelled: { color: '#8c8c8c', bg: '#fafafa' },
  Pending: { color: '#faad14', bg: '#fffbe6' },
  Accepted: { color: '#52c41a', bg: '#f6ffed' },
  Converted: { color: '#722ed1', bg: '#f9f0ff' },
  Declined: { color: '#f5222d', bg: '#fff1f0' },
  Active: { color: '#52c41a', bg: '#f6ffed' },
  Inactive: { color: '#8c8c8c', bg: '#fafafa' },
};

const StatusPill = ({ status, label }) => {
  const s = label || normalizeStatus(status) || 'Open';
  const cfg = statusDot[s] || statusDot.Open;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, background: cfg.bg, color: cfg.color, fontWeight: 500, fontSize: 12, lineHeight: 1.4 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
      {s}
    </span>
  );
};

const PAGE_SIZE = 25;

const CustomerCenter = () => {
  const { symbol: cSym } = useCurrency();
  const history = useHistory();
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('customers');

  // Server-side pagination per tab
  const [custSearch, setCustSearch] = useState('');
  const [custStatus, setCustStatus] = useState('');
  const [custPage, setCustPage] = useState(1);
  const [custTotal, setCustTotal] = useState(0);
  const [custSize, setCustSize] = useState(PAGE_SIZE);

  const [invSearch, setInvSearch] = useState('');
  const [invPage, setInvPage] = useState(1);
  const [invTotal, setInvTotal] = useState(0);
  const [invSize, setInvSize] = useState(PAGE_SIZE);

  const [quoteSearch, setQuoteSearch] = useState('');
  const [quotePage, setQuotePage] = useState(1);
  const [quoteTotal, setQuoteTotal] = useState(0);
  const [quoteSize, setQuoteSize] = useState(PAGE_SIZE);

  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [custForm] = Form.useForm();
  const [vatRates, setVatRates] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [stats, setStats] = useState({
    totalCustomers: 0,
    totalReceivables: 0,
    overdueAmount: 0,
    quotesOpen: 0
  });

  const loadCustomersPage = useCallback(async (page = custPage, size = custSize, search = custSearch, status = custStatus) => {
    try {
      const res = await window.electronAPI.getCustomersPaginated?.(page, size, search, status);
      if (res && res.data) {
        setCustomers(res.data);
        setCustTotal(res.total || 0);
        setCustPage(page);
        setCustSize(size);
      } else {
        const c = await window.electronAPI.getAllCustomers?.();
        const arr = Array.isArray(c) ? c : (c?.all || []);
        const filtered = status ? arr.filter(x => (x.status || 'Active') === status) : arr;
        const searched = search ? filtered.filter(x => {
          const hay = `${x.display_name} ${x.first_name} ${x.last_name} ${x.company_name} ${x.email}`.toLowerCase();
          return hay.includes(search.toLowerCase());
        }) : filtered;
        setCustomers(searched);
        setCustTotal(searched.length);
      }
    } catch { }
  }, [custPage, custSize, custSearch, custStatus]);

  // Export every customer matching the current search + status (not just the
  // visible page). Shares the backend filter with the list.
  const handleExportCustomers = async () => {
    setExporting(true);
    try {
      const res = await window.electronAPI.getCustomersForExport?.(custSearch || '', custStatus || '');
      if (res && res.error) throw new Error(res.error);
      const rows = Array.isArray(res) ? res : (res?.data || []);
      if (!rows.length) { message.info('No customers match the current filters.'); return; }
      const headers = [
        'Customer Number', 'Display Name', 'First Name', 'Last Name', 'Company',
        'Email', 'Phone', 'Mobile', 'Website',
        'Street Address', 'Address Line 2', 'City', 'State', 'Postal Code', 'Country',
        'Tax Status', 'Default Tax Rate', 'Status', 'Outstanding Balance', 'Created Date', 'Notes',
      ];
      const csv = toCsv(headers, rows.map(c => ([
        c.id != null ? c.id : '',
        c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.company_name || '',
        c.first_name || '', c.last_name || '', c.company_name || '',
        c.email || '', c.phone_number || '', c.mobile_number || '', c.website || '',
        c.address1 || '', c.address2 || '', c.city || '', c.state || '', c.postal_code || '', c.country || '',
        (c.taxable === 0 || c.taxable === false || String(c.taxable) === '0') ? 'Non-Taxable' : 'Taxable',
        describeTaxRate(c, vatRates),
        c.status || 'Active',
        Number(c.balance || 0).toFixed(2),
        csvDate(c.date_entered),
        c.notes || '',
      ])));
      downloadCsv(`Customers${custStatus ? '_' + custStatus : ''}_${new Date().toISOString().slice(0, 10)}.csv`, csv);
      message.success(`Customer export completed (${rows.length} customers).`);
    } catch (e) {
      console.error('[customers] export failed:', e);
      message.error('Customer export could not be completed. Please try again.');
    } finally { setExporting(false); }
  };

  const loadInvoicesPage = useCallback(async (page = invPage, size = invSize, search = invSearch) => {
    try {
      const res = await window.electronAPI.getInvoicesPaginated?.(page, size, search, '');
      if (res && Array.isArray(res.data)) {
        setInvoices(res.data);
        setInvTotal(res.total || res.data.length);
        setInvPage(page);
        setInvSize(size);
      }
    } catch { }
  }, [invPage, invSize, invSearch]);

  const loadQuotesPage = useCallback(async (page = quotePage, size = quoteSize, search = quoteSearch) => {
    try {
      const res = await window.electronAPI.getQuotesPaginated?.(page, size, search, '');
      if (res && Array.isArray(res.data)) {
        setQuotes(res.data);
        setQuoteTotal(res.total || res.data.length);
        setQuotePage(page);
        setQuoteSize(size);
      }
    } catch { }
  }, [quotePage, quoteSize, quoteSearch]);

  useEffect(() => { loadCustomersPage(); }, [loadCustomersPage]);
  useEffect(() => { loadInvoicesPage(); }, [loadInvoicesPage]);
  useEffect(() => { loadQuotesPage(); }, [loadQuotesPage]);

  // Loads stats once (aggregate KPIs). Tables use server-side pagination separately.
  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      const [customersRaw, invoicesRaw, quotesRaw] = await Promise.all([
        window.electronAPI.getAllCustomers?.(),
        window.electronAPI.getAllInvoices?.(),
        window.electronAPI.getAllQuotes?.()
      ]);
      const customersArr = Array.isArray(customersRaw) ? customersRaw : (customersRaw?.all || []);
      const invoicesArr = Array.isArray(invoicesRaw) ? invoicesRaw : (invoicesRaw?.all || []);
      const quotesArr = Array.isArray(quotesRaw) ? quotesRaw : quotesRaw || [];

      const outstanding = (inv) => ['Open', 'Partially Paid'].includes(normalizeStatus(inv.status));
      const totalReceivables = invoicesArr.reduce((sum, inv) =>
        sum + (outstanding(inv) ? Number(inv.balance != null ? inv.balance : inv.amount || 0) : 0), 0);
      const overdueAmount = invoicesArr.reduce((sum, inv) =>
        sum + (outstanding(inv) && inv.last_date && moment(inv.last_date).isBefore(moment(), 'day') ? Number(inv.balance != null ? inv.balance : inv.amount || 0) : 0), 0);
      const openQuotes = quotesArr.filter(q => ['Pending', 'Accepted'].includes(normalizeStatus(q.status))).length;

      setStats({
        totalCustomers: customersArr.length,
        totalReceivables,
        overdueAmount,
        quotesOpen: openQuotes
      });
    } catch (error) {
      message.error('Failed to load customer data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    window.electronAPI.getAllVat?.().then(v => setVatRates(Array.isArray(v) ? v : [])).catch(() => {});
  }, []);

  const onCreateCustomer = async (values) => {
    try {
      const display = values.display_name || `${values.first_name || ''} ${values.last_name || ''}`.trim() || values.company_name || '';
      const tax = resolveTaxRateFields(values, vatRates);
      const res = await window.electronAPI.insertCustomer(
        '', values.first_name || '', '', values.last_name || '', '', values.email || '',
        display, values.company_name || '', values.phone_number || '', values.mobile_number || '',
        '', '', '', values.address1 || '', values.address2 || '', values.city || '', values.state || '',
        values.postal_code || '', values.country || '', '', '', '', 'system', 0, null, 'Email', 'en', values.notes || '',
        values.taxable != null ? values.taxable : true,
        tax.default_tax_rate,
        tax.default_tax_rate_id
      );
      if (res && res.success) {
        message.success('Customer added');
        setShowAddCustomer(false);
        custForm.resetFields();
        await loadStats();
        await loadCustomersPage(1, custSize, custSearch, custStatus);
      } else {
        message.error(res?.error || 'Failed to add customer');
      }
    } catch (err) {
      console.error('Error adding customer:', err);
      message.error(err?.message || 'Error adding customer');
    }
  };

  const custName = (record) => record.display_name || record.name || `${record.first_name || ''} ${record.last_name || ''}`.trim() || '—';

  const toggleStatus = async (record) => {
    const newStatus = (record.status || 'Active') === 'Active' ? 'Inactive' : 'Active';
    const res = await window.electronAPI.customerToggleStatus?.(record.id, newStatus);
    if (res && (!res.success)) {
      message.error(res.error || 'Failed to update status');
      return;
    }
    message.success(`Customer ${newStatus === 'Active' ? 'activated' : 'deactivated'}`);
    await loadCustomersPage(custPage, custSize, custSearch, custStatus);
    await loadStats();
  };

  const handleDelete = async (record) => {
    const res = await window.electronAPI.deleteRecord?.(record.id, 'customers');
    if (res && res.success === false) {
      message.error(res.error || 'Delete failed');
      return;
    }
    message.success('Customer deleted');
    await loadCustomersPage(custPage, custSize, custSearch, custStatus);
    await loadStats();
  };

  const customerColumns = [
    {
      title: 'Name', key: 'name',
      sorter: (a, b) => custName(a).localeCompare(custName(b)),
      render: (_, record) => (
        <Space size={8}>
          <Avatar size={26} style={{ background: '#e6f7ff', color: '#1890ff', fontWeight: 600, fontSize: 12, flexShrink: 0 }}>
            {custName(record).charAt(0).toUpperCase()}
          </Avatar>
          <Link to={`/main/customers/details/${record.id}`} style={{ fontWeight: 500, color: '#1890ff' }}>{custName(record)}</Link>
        </Space>
      ),
    },
    { title: 'Email', dataIndex: 'email', key: 'email', render: v => v || '-' },
    { title: 'Phone', dataIndex: 'phone_number', key: 'phone', render: v => formatPhone(v) || '-' },
    {
      title: 'Due Balance', key: 'balance', align: 'right',
      render: (_, record) => {
        const bal = Number(record.balance != null ? record.balance : 0);
        return <span style={{ fontWeight: 600, color: bal > 0 ? '#fa8c16' : '#52c41a' }}>{cSym} {bal.toFixed(2)}</span>;
      },
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 120,
      render: (v) => {
        const s = v || 'Active';
        return <StatusPill status={s} />;
      },
    },
    {
      title: 'Actions', key: 'actions', width: 210, align: 'center',
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} style={{ color: '#1890ff' }} onClick={() => history.push(`/main/customers/details/${record.id}`)} /></Tooltip>
          <Tooltip title="New Invoice"><Button type="text" size="small" icon={<FileTextOutlined />} style={{ color: '#1890ff' }} onClick={() => history.push(`/main/customers/invoices/new?customer=${record.id}`)} /></Tooltip>
          <Tooltip title="New Quote"><Button type="text" size="small" icon={<FileDoneOutlined />} style={{ color: '#722ed1' }} onClick={() => history.push(`/main/customers/quotes/new?customer=${record.id}`)} /></Tooltip>
          <Tooltip title={(record.status || 'Active') === 'Active' ? 'Deactivate' : 'Activate'}>
            <Button type="text" size="small" icon={(record.status || 'Active') === 'Active' ? <StopOutlined /> : <CheckCircleOutlined />} onClick={() => toggleStatus(record)} />
          </Tooltip>
          <Popconfirm title="Delete this customer?" onConfirm={() => handleDelete(record)} okText="Yes" cancelText="No">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const invoiceColumns = [
    {
      title: 'Invoice #', dataIndex: 'number', key: 'number',
      render: (text, record) => <Link to={`/main/customers/invoices/edit/${record.id}`} style={{ fontWeight: 600, color: '#1890ff' }}>{text || `INV-${record.id}`}</Link>,
    },
    { title: 'Customer', dataIndex: 'customer_name', key: 'customer', render: (t, r) => getCustomerName(r) || t || '-' },
    { title: 'Date', dataIndex: 'start_date', key: 'date', render: (d) => d ? moment(d).format('MM/DD/YYYY') : '-' },
    { title: 'Due Date', dataIndex: 'last_date', key: 'dueDate', render: (d) => d ? moment(d).format('MM/DD/YYYY') : '-' },
    {
      title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right',
      render: (v) => <span style={{ fontWeight: 600 }}>{cSym} {Number(v || 0).toFixed(2)}</span>,
    },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 120, render: (s) => <StatusPill status={s} /> },
  ];

  const quoteColumns = [
    {
      title: 'Quote #', dataIndex: 'number', key: 'number',
      render: (text, record) => <Link to={`/main/customers/quotes/edit/${record.id}`} style={{ fontWeight: 600, color: '#1890ff' }}>{text || `QT-${record.id}`}</Link>,
    },
    { title: 'Customer', dataIndex: 'customer_name', key: 'customer', render: (t, r) => getCustomerName(r) || t || '-' },
    { title: 'Date', dataIndex: 'start_date', key: 'date', render: (d) => d ? moment(d).format('MM/DD/YYYY') : '-' },
    { title: 'Expiry', dataIndex: 'last_date', key: 'expiry', render: (d) => d ? moment(d).format('MM/DD/YYYY') : '-' },
    {
      title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right',
      render: (v) => <span style={{ fontWeight: 600 }}>{cSym} {Number(v || 0).toFixed(2)}</span>,
    },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 120, render: (s) => <StatusPill status={s} /> },
  ];

  const statStyle = { borderRadius: 14, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', border: '1px solid #f0f0f0' };
  const statTile = (grad, Icon) => ({ width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: grad, color: '#fff', fontSize: 22, flexShrink: 0, children: <Icon /> });

  const toolbar = (placeholder, value, onValue, onSearch, onClear, onRefresh, extra) => (
    <div className="al-list-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: 16, borderBottom: '1px solid #f0f0f0' }}>
      <Input
        placeholder={placeholder}
        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
        allowClear
        style={{ width: 260, borderRadius: 8 }}
        value={value}
        onChange={e => onValue(e.target.value)}
        onPressEnter={onSearch}
        onClear={onClear}
      />
      {extra}
      <Tooltip title="Refresh" style={{ marginLeft: 'auto' }}>
        <Button icon={<ReloadOutlined />} style={{ borderRadius: 8 }} onClick={onRefresh} />
      </Tooltip>
    </div>
  );

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Customer Center</Title>
          <Text type="secondary">Manage customers, invoices, quotes and receivables in one place</Text>
        </div>
        <Button type="primary" size="large" icon={<PlusOutlined />} style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(24,144,255,0.35)' }} onClick={() => setShowAddCustomer(true)}>
          Add Customer
        </Button>
      </div>

      {/* Stat cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={statStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div {...statTile('linear-gradient(135deg,#1890ff,#69c0ff)', TeamOutlined)} />
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Total Customers</Text>
                <Text strong style={{ fontSize: 18 }}>{stats.totalCustomers}</Text>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={statStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div {...statTile('linear-gradient(135deg,#722ed1,#b37feb)', DollarOutlined)} />
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Total Receivables</Text>
                <Text strong style={{ fontSize: 18 }}>{cSym} {Number(stats.totalReceivables || 0).toFixed(2)}</Text>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={statStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div {...statTile('linear-gradient(135deg,#f5222d,#ff7875)', ClockCircleOutlined)} />
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Overdue Amount</Text>
                <Text strong style={{ fontSize: 18, color: stats.overdueAmount > 0 ? '#f5222d' : '#52c41a' }}>{cSym} {Number(stats.overdueAmount || 0).toFixed(2)}</Text>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={statStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div {...statTile('linear-gradient(135deg,#fa8c16,#ffc53d)', FileDoneOutlined)} />
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Open Quotes</Text>
                <Text strong style={{ fontSize: 18, color: '#fa8c16' }}>{stats.quotesOpen}</Text>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Tabs card */}
      <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} style={{ padding: '0 16px' }}>
          <TabPane tab={`Customers (${custTotal})`} key="customers">
            <ListToolbar
              searchPlaceholder="Search customers by name, email or company..."
              searchValue={custSearch}
              onSearchChange={setCustSearch}
              onSearch={() => loadCustomersPage(1, custSize, custSearch, custStatus)}
              statusValue={custStatus || 'all'}
              onStatusChange={(v) => { const s = v === 'all' ? '' : v; setCustStatus(s); loadCustomersPage(1, custSize, custSearch, s); }}
              onExport={handleExportCustomers}
              exportLoading={exporting}
              onRefresh={() => loadCustomersPage(custPage, custSize, custSearch, custStatus)}
            />
            <Table columns={customerColumns} dataSource={customers} rowKey="id" loading={loading} size="middle"
              pagination={{ current: custPage, pageSize: custSize, total: custTotal, showSizeChanger: true, pageSizeOptions: ['25', '50', '100'], showTotal: t => `${t} customers`, style: { margin: 16 },
                onChange: (p, s) => loadCustomersPage(p, s, custSearch, custStatus) }} />
          </TabPane>
          <TabPane tab={`Invoices (${invTotal})`} key="invoices">
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 16, borderBottom: '1px solid #f0f0f0' }}>
              <Button type="primary" icon={<PlusOutlined />} style={{ borderRadius: 8 }} onClick={() => history.push('/main/customers/invoices/new')}>Create Invoice</Button>
            </div>
            {toolbar(
              'Search invoices by number or customer...',
              invSearch,
              setInvSearch,
              () => loadInvoicesPage(1, invSize, invSearch),
              () => { setInvSearch(''); loadInvoicesPage(1, invSize, ''); },
              () => loadInvoicesPage(invPage, invSize, invSearch)
            )}
            <Table columns={invoiceColumns} dataSource={invoices} rowKey="id" loading={loading} size="middle"
              pagination={{ current: invPage, pageSize: invSize, total: invTotal, showSizeChanger: true, pageSizeOptions: ['25', '50', '100'], showTotal: t => `${t} invoices`, style: { margin: 16 },
                onChange: (p, s) => loadInvoicesPage(p, s, invSearch) }} />
          </TabPane>
          <TabPane tab={`Quotes (${quoteTotal})`} key="quotes">
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 16, borderBottom: '1px solid #f0f0f0' }}>
              <Button type="primary" icon={<PlusOutlined />} style={{ borderRadius: 8 }} onClick={() => history.push('/main/customers/quotes/new')}>Create Quote</Button>
            </div>
            {toolbar(
              'Search quotes by number or customer...',
              quoteSearch,
              setQuoteSearch,
              () => loadQuotesPage(1, quoteSize, quoteSearch),
              () => { setQuoteSearch(''); loadQuotesPage(1, quoteSize, ''); },
              () => loadQuotesPage(quotePage, quoteSize, quoteSearch)
            )}
            <Table columns={quoteColumns} dataSource={quotes} rowKey="id" loading={loading} size="middle"
              pagination={{ current: quotePage, pageSize: quoteSize, total: quoteTotal, showSizeChanger: true, pageSizeOptions: ['25', '50', '100'], showTotal: t => `${t} quotes`, style: { margin: 16 },
                onChange: (p, s) => loadQuotesPage(p, s, quoteSearch) }} />
          </TabPane>
        </Tabs>
      </Card>

      <Modal title="Add Customer" visible={showAddCustomer} width={MODAL_WIDTH}
        bodyStyle={MODAL_BODY_SCROLL_STYLE}
        onCancel={() => { setShowAddCustomer(false); custForm.resetFields(); }}
        onOk={() => custForm.submit()} okText="Create Customer" destroyOnClose>
        <Form form={custForm} layout="vertical" onFinish={onCreateCustomer} preserve={false}>
          <CustomerContactFields
            form={custForm}
            vatRates={vatRates}
            address1Placeholder="123 Main St"
            address2Placeholder="Suite 100"
          />
        </Form>
      </Modal>
    </div>
  );
};

export default CustomerCenter;
