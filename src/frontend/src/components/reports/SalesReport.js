import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Table, Row, Col, Statistic, DatePicker, Select, Button, Tag, Typography, Space, message, Tabs } from 'antd';
import { DollarOutlined, ShoppingOutlined, UserOutlined, FileTextOutlined, ReloadOutlined, DownloadOutlined, FilterOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';
import { history } from '../../appRedux/store';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Text, Title } = Typography;
const { TabPane } = Tabs;
const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusColors = { Paid: 'green', Pending: 'orange', Unpaid: 'orange', Sent: 'blue', Overdue: 'red', Draft: 'default', Cancelled: 'default', 'Partially Paid': 'gold' };

const SalesReport = () => {
  const { symbol: cSym } = useCurrency();
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

  useEffect(() => {
    loadCustomers();
    loadSummary();
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
    { title: 'Invoice #', dataIndex: 'number', key: 'number', width: 110, render: v => v || '-' },
    { title: 'Date', dataIndex: 'start_date', key: 'date', width: 110, sorter: (a, b) => (a.start_date || '').localeCompare(b.start_date || ''), render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
    { title: 'Customer', dataIndex: 'customer_name', key: 'customer', ellipsis: true },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 130, align: 'right', sorter: (a, b) => Number(a.amount || 0) - Number(b.amount || 0), render: v => <Text strong>{cSym} {fmt(v)}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 120, render: s => <Tag color={statusColors[s] || 'default'}>{s}</Tag> },
    { title: 'Due Date', dataIndex: 'last_date', key: 'due', width: 110, render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
  ];

  const customerColumns = [
    { title: 'Customer', dataIndex: 'customer', key: 'customer' },
    { title: 'Invoices', dataIndex: 'count', key: 'count', width: 90, align: 'center' },
    { title: 'Total Sales', dataIndex: 'total', key: 'total', width: 140, align: 'right', sorter: (a, b) => a.total - b.total, render: v => <Text strong>{cSym} {fmt(v)}</Text> },
    { title: 'Paid', dataIndex: 'paid', key: 'paid', width: 130, align: 'right', render: v => <Text style={{ color: '#52c41a' }}>{cSym} {fmt(v)}</Text> },
    { title: 'Unpaid', dataIndex: 'unpaid', key: 'unpaid', width: 130, align: 'right', render: v => v > 0 ? <Text style={{ color: '#f5222d' }}>{cSym} {fmt(v)}</Text> : <Text>{cSym} 0.00</Text> },
  ];

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
      render: (v, r) => <a onClick={() => history.push(`/main/customers/invoices/edit/${r.invoice_id}`)} style={{ cursor: 'pointer', fontWeight: 500 }}>{v || `#${r.invoice_id}`}</a> },
    { title: 'Date', dataIndex: 'invoiceDate', key: 'invoiceDate', width: 100, render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
    { title: 'Customer', dataIndex: 'customerName', key: 'customerName', ellipsis: true },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 60, align: 'center' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right', render: v => <Text strong>{cSym} {fmt(v)}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100, render: s => <Tag color={statusColors[s] || 'default'}>{s}</Tag> },
  ];

  const accountColumns = [
    { title: 'Income Account', dataIndex: 'account', key: 'account' },
    { title: 'Lines', dataIndex: 'count', key: 'count', width: 80, align: 'center' },
    { title: 'Total', dataIndex: 'total', key: 'total', width: 140, align: 'right', sorter: (a, b) => a.total - b.total, render: v => <Text strong>{cSym} {fmt(v)}</Text> },
  ];

  const handleFilterChange = async () => {
    setDetailPage(1);
    setProductDataLoaded(false);
    setProductSummary([]);
    setProductDetail([]);
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
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}><ShoppingOutlined style={{ marginRight: 8 }} />Sales Report</Title>
          <Text type="secondary">{invoiceCount} invoices &middot; {dateRange[0]?.format('MMM D, YYYY')} – {dateRange[1]?.format('MMM D, YYYY')}</Text>
        </div>
        <Space wrap>
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
            <Option value="Paid">Paid</Option>
            <Option value="Pending">Pending</Option>
            <Option value="Sent">Sent</Option>
            <Option value="Unpaid">Unpaid</Option>
            <Option value="Overdue">Overdue</Option>
            <Option value="Partially Paid">Partially Paid</Option>
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
              pagination={{ pageSize: 25, showSizeChanger: true }}
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
              pagination={{ pageSize: 25, showSizeChanger: true }}
              expandable={{
                expandedRowKeys: expandedRows,
                onExpandedRowChange: (keys) => setExpandedRows(keys),
                expandedRowRender: (record) => {
                  const lines = getProductDrillDown(record.product);
                  if (!lines.length) return <Text type="secondary">No line detail available</Text>;
                  return <Table columns={drillDownColumns} dataSource={lines} rowKey={r => `${r.invoice_id}-${r.productId || 0}`} size="small" pagination={false}
                    onRow={(r) => ({ style: { cursor: 'pointer' }, onClick: () => history.push(`/main/customers/invoices/edit/${r.invoice_id}`) })}
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
              pagination={{ pageSize: 25, showSizeChanger: true }}
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
    </div>
  );
};

export default SalesReport;
