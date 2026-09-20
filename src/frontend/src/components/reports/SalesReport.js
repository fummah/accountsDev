import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Card, Table, Row, Col, Statistic, DatePicker, Select, Button, Tag, Typography, Space, message, Tabs, Modal, Descriptions, Divider, Empty, Spin } from 'antd';
import { DollarOutlined, ShoppingOutlined, UserOutlined, FileTextOutlined, ReloadOutlined, DownloadOutlined, FilterOutlined, PrinterOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';
import { history } from '../../appRedux/store';
import { handleDocumentPDF } from '../customers/shared/generateDocumentPDF';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Text, Title } = Typography;
const { TabPane } = Tabs;
const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusColors = { Open: 'blue', 'Partially Paid': 'gold', Paid: 'green', Draft: 'default', Void: 'volcano', Cancelled: 'default' };

const SalesReport = () => {
  const { symbol: cSym } = useCurrency();
  const componentRef = useRef();
  const handlePrint = useReactToPrint({
    content: () => componentRef.current,
    documentTitle: 'Sales_Report',
  });
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState([moment().startOf('year'), moment()]);
  const [customerFilter, setCustomerFilter] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');

  // Summary data (server-side aggregated)
  const [summary, setSummary] = useState(null);

  // Product summary (server-side)
  const [productSummary, setProductSummary] = useState([]);
  const [productDetail, setProductDetail] = useState([]);

  // Customers for filter dropdown
  const [customers, setCustomers] = useState([]);

  // Paginated invoice detail tab
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(25);
  const [detailData, setDetailData] = useState([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);

  // By Product tab expanded rows
  const [expandedRows, setExpandedRows] = useState([]);

  const [productDataLoaded, setProductDataLoaded] = useState(false);

  // Customer drill-down data
  const [customerDrilldownData, setCustomerDrilldownData] = useState({});
  const [customerDrilldownLoading, setCustomerDrilldownLoading] = useState({});

  // Invoice detail modal
  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);
  const [invoiceModalData, setInvoiceModalData] = useState(null);
  const [invoiceModalLoading, setInvoiceModalLoading] = useState(false);

  // Income account drill-down data
  const [accountDrilldownData, setAccountDrilldownData] = useState({});
  const [accountDrilldownLoading, setAccountDrilldownLoading] = useState({});

  // Company info for invoice PDFs printed/downloaded from this report
  const [companyInfo, setCompanyInfo] = useState(null);

  useEffect(() => {
    loadCustomers();
    loadSummary();
    window.electronAPI.getCompany?.().then(c => { if (c) setCompanyInfo(c); }).catch(() => {});
  }, []);

  const loadCustomers = async () => {
    try {
      const res = await window.electronAPI.getAllCustomers?.().catch(() => ({ all: [] }));
      setCustomers(Array.isArray(res) ? res : (res?.all || []));
    } catch {}
  };

  const getFilters = useCallback(() => ({
    from: dateRange?.[0]?.format('YYYY-MM-DD'),
    to: dateRange?.[1]?.format('YYYY-MM-DD'),
    customerId: customerFilter,
    status: statusFilter,
  }), [dateRange, customerFilter, statusFilter]);

  const loadSummary = async () => {
    setLoading(true);
    const filters = getFilters();
    try {
      const res = await window.electronAPI.getSalesSummary?.(filters).catch(() => ({ success: false }));
      if (res?.success !== false) setSummary(res);
    } catch {
      message.error('Failed to load sales data');
    } finally {
      setLoading(false);
    }
  };

  const loadProductData = async () => {
    const filters = getFilters();
    try {
      const res = await window.electronAPI.getSalesByProduct?.(filters).catch(() => ({ summary: [], detail: [] }));
      if (res?.success !== false) {
        setProductSummary(res?.summary || []);
        setProductDetail(res?.detail || []);
      }
      setProductDataLoaded(true);
    } catch {
      message.error('Failed to load product data');
      setProductDataLoaded(true);
    }
  };

  // Lazy-load product data when By Product tab becomes active
  useEffect(() => {
    if (activeTab === 'product' && !productDataLoaded) {
      loadProductData();
    }
  }, [activeTab, productDataLoaded]);

  const loadDetail = async (page, pageSize, filters) => {
    setDetailLoading(true);
    const f = filters || getFilters();
    try {
      const res = await window.electronAPI.getInvoicesPaginated?.(
        page, pageSize, '', f.status || '', '', '',
        f.from || '', f.to || '', f.customerId || ''
      ).catch(() => ({ data: [], total: 0 }));
      setDetailData(res?.data || []);
      setDetailTotal(res?.total || 0);
    } catch {
      setDetailData([]);
      setDetailTotal(0);
    } finally {
      setDetailLoading(false);
    }
  };

  const loadCustomerDrilldown = async (customerId, customerName) => {
    if (customerDrilldownData[customerId]) return;
    setCustomerDrilldownLoading(prev => ({ ...prev, [customerId]: true }));
    const f = getFilters();
    try {
      const res = await window.electronAPI.getInvoicesPaginated?.(
        1, 100, '', f.status || '', '', '',
        f.from || '', f.to || '', customerId
      ).catch(() => ({ data: [] }));
      setCustomerDrilldownData(prev => ({ ...prev, [customerId]: res?.data || [] }));
    } catch {
      setCustomerDrilldownData(prev => ({ ...prev, [customerId]: [] }));
    } finally {
      setCustomerDrilldownLoading(prev => ({ ...prev, [customerId]: false }));
    }
  };

  const loadAccountDrilldown = async (account) => {
    if (accountDrilldownData[account]) return;
    setAccountDrilldownLoading(prev => ({ ...prev, [account]: true }));
    const f = getFilters();
    const dateFrom = f.from || '0000-01-01';
    const dateTo = f.to || '9999-12-31';
    try {
      const res = await window.electronAPI.getSalesByAccountDetail?.({ dateFrom, dateTo, account }).catch(() => []);
      setAccountDrilldownData(prev => ({ ...prev, [account]: Array.isArray(res) ? res : [] }));
    } catch {
      setAccountDrilldownData(prev => ({ ...prev, [account]: [] }));
    } finally {
      setAccountDrilldownLoading(prev => ({ ...prev, [account]: false }));
    }
  };

  const openInvoiceModal = async (invoiceId) => {
    setInvoiceModalLoading(true);
    setInvoiceModalVisible(true);
    try {
      const res = await window.electronAPI.getSingleInvoice?.(invoiceId);
      setInvoiceModalData(res || null);
    } catch {
      setInvoiceModalData(null);
    } finally {
      setInvoiceModalLoading(false);
    }
  };

  // Reload detail on page/pageSize change only
  useEffect(() => {
    loadDetail(detailPage, detailPageSize);
  }, [detailPage, detailPageSize]);

  // KPI stats from server summary
  const totalSales = Number(summary?.totalSales || 0);
  const totalPaid = Number(summary?.totalPaid || 0);
  const totalUnpaid = Number(summary?.totalUnpaid || 0);
  const invoiceCount = Number(summary?.invoiceCount || 0);

  // Sales by Customer from server
  const salesByCustomer = useMemo(() => {
    return (summary?.byCustomer || []).map(c => ({
      customer: c.customer || 'Unknown',
      customer_id: c.customer_id,
      count: Number(c.count || 0),
      total: Number(c.total || 0),
      paid: Number(c.paid || 0),
      unpaid: Number(c.unpaid || 0),
    })).sort((a, b) => b.total - a.total);
  }, [summary]);

  // Sales by Product — all totals computed from detail so they match drill-down exactly
  const salesByProduct = useMemo(() => {
    return (productSummary || []).map(r => {
      const name = r.productName || 'Unitemized';
      const detailRows = (productDetail || []).filter(d => (d.productName || 'Unitemized') === name);
      if (detailRows.length > 0) {
        return {
          product: name,
          productId: r.productId,
          sku: r.sku || '',
          quantity: detailRows.reduce((s, d) => s + Number(d.quantity || 0), 0),
          total: detailRows.reduce((s, d) => s + Number(d.amount || 0), 0),
          invoiceCount: new Set(detailRows.map(d => d.invoice_id)).size,
        };
      }
      return {
        product: name,
        productId: r.productId,
        sku: r.sku || '',
        quantity: Number(r.totalQty || 0),
        total: Number(r.totalSales || 0),
        invoiceCount: Number(r.invoiceCount || 0),
      };
    });
  }, [productSummary, productDetail]);

  // Product drill-down
  const getProductDrillDown = useCallback((productName) => {
    return (productDetail || []).filter(d => (d.productName || 'Unitemized') === productName);
  }, [productDetail]);

  // Sales by Income Account from server
  const salesByIncomeAccount = useMemo(() => {
    return (summary?.byIncomeAccount || []).map(a => ({
      account: a.account || 'Sales Revenue',
      count: Number(a.count || 0),
      total: Number(a.total || 0),
    }));
  }, [summary]);

  // Detail columns for Invoice Detail tab
  const detailColumns = [
    { title: 'Invoice #', dataIndex: 'number', key: 'number', width: 110,
      render: (v, r) => <a onClick={() => openInvoiceModal(r.id)} style={{ fontWeight: 500 }}>{v || `#${r.id}`}</a> },
    { title: 'Date', dataIndex: 'start_date', key: 'date', width: 110, sorter: (a, b) => (a.start_date || '').localeCompare(b.start_date || ''), render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
    { title: 'Customer', dataIndex: 'customer_name', key: 'customer', ellipsis: true },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 130, align: 'right', sorter: (a, b) => Number(a.amount || 0) - Number(b.amount || 0),
      render: (v, r) => <a onClick={() => openInvoiceModal(r.id)} style={{ cursor: 'pointer', fontWeight: 600, color: '#1890ff' }}>{cSym} {fmt(v)}</a> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 120, render: s => <Tag color={statusColors[s] || 'default'}>{s}</Tag> },
    { title: 'Due Date', dataIndex: 'last_date', key: 'due', width: 110, render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
  ];

  const customerColumns = [
    { title: 'Customer', dataIndex: 'customer', key: 'customer',
      render: (v, r) => <a onClick={() => { loadCustomerDrilldown(r.customer_id, r.customer); setExpandedCustomerRows(prev => prev.includes(r.customer_id) ? prev.filter(c => c !== r.customer_id) : [...prev, r.customer_id]); }} style={{ cursor: 'pointer', fontWeight: 500 }}>{v}</a> },
    { title: 'Invoices', dataIndex: 'count', key: 'count', width: 90, align: 'center',
      render: (v, r) => <a onClick={() => { loadCustomerDrilldown(r.customer_id, r.customer); setExpandedCustomerRows(prev => prev.includes(r.customer_id) ? prev.filter(c => c !== r.customer_id) : [...prev, r.customer_id]); }} style={{ cursor: 'pointer' }}>{v}</a> },
    { title: 'Total Sales', dataIndex: 'total', key: 'total', width: 140, align: 'right', sorter: (a, b) => a.total - b.total,
      render: (v, r) => <a onClick={() => { loadCustomerDrilldown(r.customer_id, r.customer); setExpandedCustomerRows(prev => prev.includes(r.customer_id) ? prev.filter(c => c !== r.customer_id) : [...prev, r.customer_id]); }} style={{ cursor: 'pointer', fontWeight: 600, color: '#1890ff' }}>{cSym} {fmt(v)}</a> },
    { title: 'Paid', dataIndex: 'paid', key: 'paid', width: 130, align: 'right', render: v => <Text style={{ color: '#52c41a' }}>{cSym} {fmt(v)}</Text> },
    { title: 'Unpaid', dataIndex: 'unpaid', key: 'unpaid', width: 130, align: 'right', render: v => v > 0 ? <Text style={{ color: '#f5222d' }}>{cSym} {fmt(v)}</Text> : <Text>{cSym} 0.00</Text> },
  ];
  const [expandedCustomerRows, setExpandedCustomerRows] = useState([]);

  const toggleExpand = (product) => {
    setExpandedRows(prev =>
      prev.includes(product) ? prev.filter(p => p !== product) : [...prev, product]
    );
  };

  const productColumns = [
    { title: 'Product / Service', dataIndex: 'product', key: 'product',
      render: (v) => <a onClick={() => toggleExpand(v)} style={{ cursor: 'pointer', fontWeight: 500 }}>{v}</a> },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 100, render: v => v || '-' },
    { title: 'Qty Sold', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'center' },
    { title: 'Total Sales', dataIndex: 'total', key: 'total', width: 140, align: 'right', sorter: (a, b) => a.total - b.total,
      render: (v, r) => <a onClick={() => toggleExpand(r.product)} style={{ cursor: 'pointer', fontWeight: 600, color: '#1890ff' }}>{cSym} {fmt(v)}</a> },
    { title: 'Invoices', dataIndex: 'invoiceCount', key: 'invoiceCount', width: 90, align: 'center',
      render: (v, r) => <a onClick={() => toggleExpand(r.product)} style={{ cursor: 'pointer' }}>{v}</a> },
  ];

  const drillDownColumns = [
    { title: 'Invoice #', dataIndex: 'invoiceNumber', key: 'invoiceNumber', width: 100,
      render: (v, r) => <a onClick={() => openInvoiceModal(r.invoice_id)} style={{ cursor: 'pointer', fontWeight: 500 }}>{v || `#${r.invoice_id}`}</a> },
    { title: 'Date', dataIndex: 'invoiceDate', key: 'invoiceDate', width: 100, render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
    { title: 'Customer', dataIndex: 'customerName', key: 'customerName', ellipsis: true },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 60, align: 'center' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right', render: v => <Text strong>{cSym} {fmt(v)}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100, render: s => <Tag color={statusColors[s] || 'default'}>{s}</Tag> },
  ];

  const customerDrilldownColumns = [
    { title: 'Invoice #', dataIndex: 'number', key: 'number', width: 100,
      render: (v, r) => <a onClick={() => openInvoiceModal(r.id)} style={{ fontWeight: 500 }}>{v || `#${r.id}`}</a> },
    { title: 'Date', dataIndex: 'start_date', key: 'date', width: 100, render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right', render: v => <Text strong>{cSym} {fmt(v)}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100, render: s => <Tag color={statusColors[s] || 'default'}>{s}</Tag> },
  ];

  const accountDrilldownColumns = [
    { title: 'Invoice #', dataIndex: 'invoiceNumber', key: 'invoiceNumber', width: 100,
      render: (v, r) => <a onClick={() => openInvoiceModal(r.invoice_id)} style={{ fontWeight: 500 }}>{v || `#${r.invoice_id}`}</a> },
    { title: 'Date', dataIndex: 'invoiceDate', key: 'invoiceDate', width: 100, render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
    { title: 'Customer', dataIndex: 'customerName', key: 'customerName', ellipsis: true },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right', render: v => <Text strong>{cSym} {fmt(v)}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100, render: s => <Tag color={statusColors[s] || 'default'}>{s}</Tag> },
  ];

  const accountColumns = [
    { title: 'Income Account', dataIndex: 'account', key: 'account',
      render: (v, r) => <a onClick={() => { loadAccountDrilldown(v); setExpandedAccountRows(prev => prev.includes(v) ? prev.filter(a => a !== v) : [...prev, v]); }} style={{ cursor: 'pointer', fontWeight: 500 }}>{v}</a> },
    { title: 'Lines', dataIndex: 'count', key: 'count', width: 80, align: 'center',
      render: (v, r) => <a onClick={() => { loadAccountDrilldown(r.account); setExpandedAccountRows(prev => prev.includes(r.account) ? prev.filter(a => a !== r.account) : [...prev, r.account]); }} style={{ cursor: 'pointer' }}>{v}</a> },
    { title: 'Total', dataIndex: 'total', key: 'total', width: 140, align: 'right', sorter: (a, b) => a.total - b.total,
      render: (v, r) => <a onClick={() => { loadAccountDrilldown(r.account); setExpandedAccountRows(prev => prev.includes(r.account) ? prev.filter(a => a !== r.account) : [...prev, r.account]); }} style={{ cursor: 'pointer', fontWeight: 600, color: '#1890ff' }}>{cSym} {fmt(v)}</a> },
  ];
  const [expandedAccountRows, setExpandedAccountRows] = useState([]);

  const handleFilterChange = async () => {
    setDetailPage(1);
    setProductDataLoaded(false);
    setProductSummary([]);
    setProductDetail([]);
    setCustomerDrilldownData({});
    setAccountDrilldownData({});
    setExpandedCustomerRows([]);
    setExpandedAccountRows([]);
    const filters = getFilters();
    setLoading(true);
    try {
      const res = await window.electronAPI.getSalesSummary?.(filters).catch(() => ({ success: false }));
      if (res?.success !== false) setSummary(res);
    } catch {
      message.error('Failed to load sales data');
    } finally {
      setLoading(false);
    }
    loadDetail(1, detailPageSize, filters);
  };

  const exportCSV = () => {
    try {
      const headers = ['Invoice #', 'Date', 'Customer', 'Amount', 'Status', 'Due Date'];
      const rows = detailData.map(inv => [
        `"${inv.number || ''}"`,
        `"${inv.start_date || ''}"`,
        `"${(inv.customer_name || '').replace(/"/g, '""')}"`,
        inv.amount || 0,
        `"${inv.status || ''}"`,
        `"${inv.last_date || ''}"`,
      ].join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `sales_report_${moment().format('YYYY-MM-DD')}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch { message.error('Export failed'); }
  };

  return (
    <div ref={componentRef} style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}><ShoppingOutlined style={{ marginRight: 8 }} />Sales Report</Title>
          <Text type="secondary">{invoiceCount} invoices &middot; {dateRange[0]?.format('MMM D, YYYY')} – {dateRange[1]?.format('MMM D, YYYY')}</Text>
        </div>
        <Space wrap>
          <Button icon={<PrinterOutlined />} onClick={handlePrint}>Print</Button>
          <Button icon={<DownloadOutlined />} onClick={exportCSV}>Export CSV</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { setProductDataLoaded(false); setProductSummary([]); setProductDetail([]); loadSummary(); loadDetail(detailPage, detailPageSize); }} loading={loading}>Refresh</Button>
        </Space>
      </div>

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #1890ff' }}>
            <Statistic title="Total Sales" value={totalSales} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #52c41a' }}>
            <Statistic title="Collected" value={totalPaid} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #fa8c16' }}>
            <Statistic title="Outstanding" value={totalUnpaid} precision={2} prefix={cSym} valueStyle={{ fontSize: 18, color: '#fa8c16' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: '3px solid #722ed1' }}>
            <Statistic title="Invoices" value={invoiceCount} valueStyle={{ fontSize: 18, color: '#722ed1' }} />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <FilterOutlined />
          <RangePicker value={dateRange} onChange={v => { setDateRange(v || [moment().startOf('year'), moment()]); }} format="MM/DD/YYYY" />
          <Select placeholder="All Customers" allowClear style={{ width: 200 }} showSearch optionFilterProp="children"
            value={customerFilter} onChange={v => { setCustomerFilter(v); }}>
            {customers.map(c => (
              <Option key={c.id} value={c.id}>{c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()}</Option>
            ))}
          </Select>
          <Select placeholder="All Statuses" allowClear style={{ width: 150 }}
            value={statusFilter} onChange={v => { setStatusFilter(v); }}>
            <Option value="Open">Open</Option>
            <Option value="Partially Paid">Partially Paid</Option>
            <Option value="Paid">Paid</Option>
            <Option value="Draft">Draft</Option>
            <Option value="Void">Void</Option>
            <Option value="Cancelled">Cancelled</Option>
          </Select>
          <Button size="small" onClick={() => { setDateRange([moment().startOf('year'), moment()]); setCustomerFilter(null); setStatusFilter(null); }}>Reset</Button>
          <Button type="primary" size="small" onClick={handleFilterChange}>Apply</Button>
        </Space>
      </Card>

      {/* Tabbed Reports */}
      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab} destroyInactiveTabPane>
          <TabPane tab={<span><FileTextOutlined /> Invoice Detail</span>} key="summary">
            <Table columns={detailColumns} dataSource={detailData} rowKey={(r, i) => r.id || i} size="small" loading={detailLoading}
              pagination={{ current: detailPage, pageSize: detailPageSize, total: detailTotal, showSizeChanger: true, showTotal: t => `${t} invoices`,
                onChange: (p, ps) => { setDetailPage(p); setDetailPageSize(ps); }
              }}
              summary={() => detailData.length > 0 ? (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={3}><Text strong>Page Total</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right"><Text strong style={{ color: '#1890ff', fontSize: 14 }}>{cSym} {fmt(detailData.reduce((s, r) => s + Number(r.amount || 0), 0))}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={4} colSpan={2} />
                </Table.Summary.Row>
              ) : null}
            />
          </TabPane>

          <TabPane tab={<span><UserOutlined /> By Customer</span>} key="customer">
            <Table columns={customerColumns} dataSource={salesByCustomer} rowKey={r => r.customer_id || r.customer} size="small"
              pagination={{ defaultPageSize: 25, showSizeChanger: true }}
              expandable={{
                expandedRowKeys: expandedCustomerRows,
                onExpandedRowChange: (keys) => setExpandedCustomerRows(keys),
                expandedRowRender: (record) => {
                  const rows = customerDrilldownData[record.customer_id] || [];
                  if (customerDrilldownLoading[record.customer_id]) return <Text type="secondary">Loading...</Text>;
                  if (!rows.length) return <Text type="secondary">No invoices found</Text>;
                  return <Table columns={customerDrilldownColumns} dataSource={rows} rowKey={r => r.id} size="small" pagination={false} />;
                },
                rowExpandable: (record) => true,
              }}
              summary={() => salesByCustomer.length > 0 ? (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}><Text strong>Total</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="center"><Text strong>{invoiceCount}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right"><Text strong>{cSym} {fmt(totalSales)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right"><Text strong style={{ color: '#52c41a' }}>{cSym} {fmt(totalPaid)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right"><Text strong style={{ color: '#f5222d' }}>{cSym} {fmt(totalUnpaid)}</Text></Table.Summary.Cell>
                </Table.Summary.Row>
              ) : null}
            />
          </TabPane>

          <TabPane tab={<span><ShoppingOutlined /> By Product</span>} key="product">
            <Table columns={productColumns} dataSource={salesByProduct} rowKey="product" size="small"
              pagination={{ defaultPageSize: 25, showSizeChanger: true }}
              expandable={{
                expandedRowKeys: expandedRows,
                onExpandedRowChange: (keys) => setExpandedRows(keys),
                expandedRowRender: (record) => {
                  const lines = getProductDrillDown(record.product);
                  if (!lines.length) return <Text type="secondary">No line detail available</Text>;
                  return <Table columns={drillDownColumns} dataSource={lines} rowKey={r => `${r.invoice_id}-${r.productId || 0}`} size="small" pagination={false}
                    onRow={(r) => ({ style: { cursor: 'pointer' }, onClick: () => openInvoiceModal(r.invoice_id) })}
                  />;
                },
                rowExpandable: (record) => getProductDrillDown(record.product).length > 0,
              }}
              summary={() => salesByProduct.length > 0 ? (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}><Text strong>Total</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={1} />
                  <Table.Summary.Cell index={2} align="center"><Text strong>{salesByProduct.reduce((s, p) => s + p.quantity, 0)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right"><Text strong>{cSym} {fmt(salesByProduct.reduce((s, p) => s + p.total, 0))}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={4} />
                </Table.Summary.Row>
              ) : null}
            />
          </TabPane>

          <TabPane tab={<span><DollarOutlined /> By Income Account</span>} key="account">
            <Table columns={accountColumns} dataSource={salesByIncomeAccount} rowKey="account" size="small"
              pagination={{ defaultPageSize: 25, showSizeChanger: true }}
              expandable={{
                expandedRowKeys: expandedAccountRows,
                onExpandedRowChange: (keys) => setExpandedAccountRows(keys),
                expandedRowRender: (record) => {
                  const rows = accountDrilldownData[record.account] || [];
                  if (accountDrilldownLoading[record.account]) return <Text type="secondary">Loading...</Text>;
                  if (!rows.length) return <Text type="secondary">No transactions found</Text>;
                  return <Table columns={accountDrilldownColumns} dataSource={rows} rowKey={r => `${r.invoice_id}-${r.lineId || 0}`} size="small" pagination={false} />;
                },
                rowExpandable: (record) => true,
              }}
              summary={() => salesByIncomeAccount.length > 0 ? (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}><Text strong>Total</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="center"><Text strong>{salesByIncomeAccount.reduce((s, a) => s + a.count, 0)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right"><Text strong>{cSym} {fmt(salesByIncomeAccount.reduce((s, a) => s + a.total, 0))}</Text></Table.Summary.Cell>
                </Table.Summary.Row>
              ) : null}
            />
          </TabPane>
        </Tabs>
      </Card>

      {/* Invoice Detail Modal */}
      <Modal
        title={null}
        width={960}
        onCancel={() => { setInvoiceModalVisible(false); setInvoiceModalData(null); }}
        visible={invoiceModalVisible}
        footer={
          invoiceModalData ? [
            <Button key="print" icon={<PrinterOutlined />} onClick={() => {
              const subtotal = (invoiceModalData.lines || []).reduce((s, l) => s + Number(l.amount || 0), 0);
              const vatPct = Number(invoiceModalData.vat || 0);
              const vatAmt = vatPct > 0 ? subtotal * vatPct / 100 : 0;
              const grandTotal = subtotal + vatAmt;
              handleDocumentPDF('print', {
                docType: 'Invoice',
                header: {
                  number: invoiceModalData.number || '',
                  status: invoiceModalData.status || '',
                  date: invoiceModalData.start_date || '',
                  dueDate: invoiceModalData.last_date || '',
                  terms: invoiceModalData.terms || '',
                  customerName: invoiceModalData.first_name ? `${invoiceModalData.first_name || ''} ${invoiceModalData.last_name || ''}`.trim() : '',
                  email: invoiceModalData.customer_email || '',
                  billingAddress: invoiceModalData.billing_address || '',
                },
                lines: (invoiceModalData.lines || []).map(l => ({ description: l.description || '', quantity: Number(l.quantity || 0), rate: Number(l.rate || 0), amount: Number(l.amount || 0) })),
                subtotal, vatPercent: vatPct, vatAmount: vatAmt, grandTotal,
                message: invoiceModalData.message || '',
                statementMemo: invoiceModalData.statement_message || '',
                company: companyInfo, currencySymbol: cSym,
              });
            }}>Print</Button>,
            <Button key="download" icon={<DownloadOutlined />} onClick={() => {
              const subtotal = (invoiceModalData.lines || []).reduce((s, l) => s + Number(l.amount || 0), 0);
              const vatPct = Number(invoiceModalData.vat || 0);
              const vatAmt = vatPct > 0 ? subtotal * vatPct / 100 : 0;
              const grandTotal = subtotal + vatAmt;
              handleDocumentPDF('download', {
                docType: 'Invoice',
                header: {
                  number: invoiceModalData.number || '',
                  status: invoiceModalData.status || '',
                  date: invoiceModalData.start_date || '',
                  dueDate: invoiceModalData.last_date || '',
                  terms: invoiceModalData.terms || '',
                  customerName: invoiceModalData.first_name ? `${invoiceModalData.first_name || ''} ${invoiceModalData.last_name || ''}`.trim() : '',
                  email: invoiceModalData.customer_email || '',
                  billingAddress: invoiceModalData.billing_address || '',
                },
                lines: (invoiceModalData.lines || []).map(l => ({ description: l.description || '', quantity: Number(l.quantity || 0), rate: Number(l.rate || 0), amount: Number(l.amount || 0) })),
                subtotal, vatPercent: vatPct, vatAmount: vatAmt, grandTotal,
                message: invoiceModalData.message || '',
                statementMemo: invoiceModalData.statement_message || '',
                company: companyInfo, currencySymbol: cSym,
              });
            }}>Download PDF</Button>,
            <Button key="edit" type="primary" icon={<FileTextOutlined />} onClick={() => {
              setInvoiceModalVisible(false);
              setInvoiceModalData(null);
              history.push(`/main/customers/invoices/edit/${invoiceModalData.invoice_id}`);
            }}>View / Edit Invoice</Button>,
            <Button key="close" onClick={() => { setInvoiceModalVisible(false); setInvoiceModalData(null); }}>Close</Button>,
          ] : null
        }
      >
        {invoiceModalLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : invoiceModalData ? (
          <div style={{ fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', sans-serif", color: '#333' }}>
            {/* Status badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <Title level={4} style={{ margin: 0, color: '#1a1a1a' }}>{invoiceModalData.number || `Invoice #${invoiceModalData.invoice_id}`}</Title>
                <Text type="secondary">{invoiceModalData.start_date ? moment(invoiceModalData.start_date).format('MMM D, YYYY') : ''}</Text>
              </div>
              <Tag color={statusColors[invoiceModalData.status] || 'default'} style={{ fontSize: 13, padding: '4px 12px', borderRadius: 4 }}>{invoiceModalData.status}</Tag>
            </div>

            {/* Billing info */}
            <div style={{ display: 'flex', gap: 40, marginBottom: 24, padding: 16, background: '#f8f9fa', borderRadius: 8 }}>
              <div style={{ flex: 1 }}>
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Bill To</Text>
                <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.6 }}>
                  {invoiceModalData.first_name || invoiceModalData.last_name ? (
                    <div style={{ fontWeight: 600 }}>{`${invoiceModalData.first_name || ''} ${invoiceModalData.last_name || ''}`.trim()}</div>
                  ) : null}
                  {invoiceModalData.customer_email ? <div>{invoiceModalData.customer_email}</div> : null}
                  {invoiceModalData.phone_number || invoiceModalData.mobile_number ? <div>{invoiceModalData.phone_number || invoiceModalData.mobile_number}</div> : null}
                  {invoiceModalData.billing_address ? <div style={{ whiteSpace: 'pre-wrap' }}>{invoiceModalData.billing_address}</div> : null}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Details</Text>
                <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.8 }}>
                  {invoiceModalData.last_date ? <div><Text type="secondary">Due: </Text><Text strong>{moment(invoiceModalData.last_date).format('MMM D, YYYY')}</Text></div> : null}
                  {invoiceModalData.terms ? <div><Text type="secondary">Terms: </Text><Text strong>{invoiceModalData.terms}</Text></div> : null}
                  {invoiceModalData.entered_by ? <div><Text type="secondary">Prepared by: </Text><Text strong>{invoiceModalData.entered_by}</Text></div> : null}
                  {invoiceModalData.sent_date ? <div><Text type="secondary">Sent: </Text><Text strong>{moment(invoiceModalData.sent_date).format('MMM D, YYYY')}</Text>{invoiceModalData.sent_method ? <Text> via {invoiceModalData.sent_method}</Text> : null}</div> : null}
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <Table
              columns={[
                { title: '#', key: 'idx', width: 40, render: (_, __, i) => <Text type="secondary">{i + 1}</Text> },
                { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true,
                  render: (v, r) => <div><div style={{ fontWeight: 500 }}>{v || r.product_id || 'Item'}</div>{v && r.product_id ? <Text type="secondary" style={{ fontSize: 12 }}>{r.product_id}</Text> : null}</div> },
                { title: 'Qty', dataIndex: 'quantity', key: 'qty', width: 60, align: 'center', render: v => Number(v || 0) },
                { title: 'Rate', dataIndex: 'rate', key: 'rate', width: 100, align: 'right', render: v => `${cSym} ${fmt(v)}` },
                { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 110, align: 'right', render: v => <Text strong>{cSym} {fmt(v)}</Text> },
              ]}
              dataSource={invoiceModalData.lines || []}
              rowKey={(r, i) => r.id || i}
              size="small"
              pagination={false}
              bordered
              summary={() => {
                const lines = invoiceModalData.lines || [];
                if (!lines.length) return null;
                const subtotal = lines.reduce((s, l) => s + Number(l.amount || 0), 0);
                const vatPct = Number(invoiceModalData.vat || 0);
                const vatAmt = vatPct > 0 ? subtotal * vatPct / 100 : 0;
                const grandTotal = subtotal + vatAmt;
                return (
                  <>
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={3}><Text style={{ fontWeight: 500 }}>Subtotal</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={3} />
                      <Table.Summary.Cell index={4} align="right"><Text style={{ fontWeight: 500 }}>{cSym} {fmt(subtotal)}</Text></Table.Summary.Cell>
                    </Table.Summary.Row>
                    {vatPct > 0 ? (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={3}><Text style={{ fontWeight: 500 }}>Tax ({vatPct}%)</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={3} />
                        <Table.Summary.Cell index={4} align="right"><Text style={{ fontWeight: 500 }}>{cSym} {fmt(vatAmt)}</Text></Table.Summary.Cell>
                      </Table.Summary.Row>
                    ) : null}
                    <Table.Summary.Row style={{ background: '#f0f5ff' }}>
                      <Table.Summary.Cell index={0} colSpan={3}><Text strong style={{ fontSize: 16 }}>Total</Text></Table.Summary.Cell>
                      <Table.Summary.Cell index={3} />
                      <Table.Summary.Cell index={4} align="right"><Text strong style={{ fontSize: 16, color: '#1890ff' }}>{cSym} {fmt(grandTotal)}</Text></Table.Summary.Cell>
                    </Table.Summary.Row>
                  </>
                );
              }}
            />

            {/* Notes */}
            {invoiceModalData.message || invoiceModalData.statement_message ? (
              <div style={{ marginTop: 20, padding: 16, background: '#f8f9fa', borderRadius: 8 }}>
                {invoiceModalData.message ? (
                  <div style={{ marginBottom: invoiceModalData.statement_message ? 12 : 0 }}>
                    <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Notes</Text>
                    <div style={{ marginTop: 4, fontSize: 13, whiteSpace: 'pre-wrap' }}>{invoiceModalData.message}</div>
                  </div>
                ) : null}
                {invoiceModalData.statement_message ? (
                  <div>
                    <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Statement</Text>
                    <div style={{ marginTop: 4, fontSize: 13, whiteSpace: 'pre-wrap' }}>{invoiceModalData.statement_message}</div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <Empty description="Invoice not found" />
        )}
      </Modal>
    </div>
  );
};

export default SalesReport;
