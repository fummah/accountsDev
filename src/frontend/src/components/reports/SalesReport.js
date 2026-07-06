import React, { useState, useEffect, useMemo } from 'react';
import { Card, Table, Row, Col, Statistic, DatePicker, Select, Button, Tag, Typography, Space, Divider, message, Tabs } from 'antd';
import { DollarOutlined, ShoppingOutlined, UserOutlined, FileTextOutlined, ReloadOutlined, DownloadOutlined, FilterOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Text, Title } = Typography;
const { TabPane } = Tabs;
const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusColors = { Paid: 'green', Pending: 'orange', Unpaid: 'orange', Sent: 'blue', Overdue: 'red', Draft: 'default', Cancelled: 'default', 'Partially Paid': 'gold' };

const SalesReport = () => {
  const { symbol: cSym } = useCurrency();
  const [invoices, setInvoices] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState([moment().startOf('year'), moment()]);
  const [customerFilter, setCustomerFilter] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');
  const [productSummary, setProductSummary] = useState([]);
  const [productDetail, setProductDetail] = useState([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const from = dateRange?.[0]?.format('YYYY-MM-DD');
      const to = dateRange?.[1]?.format('YYYY-MM-DD');
      const [invRes, prodRes, custRes, salesRes] = await Promise.all([
        window.electronAPI.getAllInvoices?.().catch(() => ({ all: [] })),
        window.electronAPI.getAllProducts?.().catch(() => []),
        window.electronAPI.getAllCustomers?.().catch(() => ({ all: [] })),
        window.electronAPI.getSalesByProduct?.({ from, to }).catch(() => ({ summary: [], detail: [] })),
      ]);
      const invArr = Array.isArray(invRes) ? invRes : (invRes?.all || []);
      setInvoices(invArr);
      setProducts(Array.isArray(prodRes) ? prodRes : (prodRes?.all || []));
      const custArr = Array.isArray(custRes) ? custRes : (custRes?.all || []);
      setCustomers(custArr);
      if (salesRes?.success !== false) {
        setProductSummary(salesRes?.summary || []);
        setProductDetail(salesRes?.detail || []);
      }
    } catch (e) {
      message.error('Failed to load sales data');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let list = invoices.filter(inv => inv.status !== 'Draft' && inv.status !== 'Cancelled');
    if (dateRange && dateRange[0] && dateRange[1]) {
      const from = dateRange[0].format('YYYY-MM-DD');
      const to = dateRange[1].format('YYYY-MM-DD');
      list = list.filter(inv => {
        const d = inv.start_date || inv.date || inv.invoiceDate;
        return d && d >= from && d <= to;
      });
    }
    if (customerFilter) {
      list = list.filter(inv => String(inv.customer_id) === String(customerFilter));
    }
    if (statusFilter) {
      list = list.filter(inv => inv.status === statusFilter);
    }
    return list;
  }, [invoices, dateRange, customerFilter, statusFilter]);

  // KPI stats
  const totalSales = filtered.reduce((s, inv) => s + Number(inv.amount || 0), 0);
  const totalPaid = filtered.filter(i => i.status === 'Paid').reduce((s, inv) => s + Number(inv.amount || 0), 0);
  const totalUnpaid = filtered.filter(i => i.status !== 'Paid').reduce((s, inv) => s + Number(inv.amount || 0), 0);
  const invoiceCount = filtered.length;

  // Sales by Customer
  const salesByCustomer = useMemo(() => {
    const map = {};
    for (const inv of filtered) {
      const name = inv.customer_name || 'Unknown';
      if (!map[name]) map[name] = { customer: name, count: 0, total: 0, paid: 0, unpaid: 0 };
      map[name].count++;
      map[name].total += Number(inv.amount || 0);
      if (inv.status === 'Paid') map[name].paid += Number(inv.amount || 0);
      else map[name].unpaid += Number(inv.amount || 0);
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered]);

  // Sales by Product — use backend data, fallback to client-side
  const salesByProduct = useMemo(() => {
    if (productSummary.length > 0) {
      return productSummary.map(r => ({
        product: r.productName || 'Unitemized',
        productId: r.productId,
        sku: r.sku || '',
        quantity: Number(r.totalQty || 0),
        total: Number(r.totalSales || 0),
        invoiceCount: Number(r.invoiceCount || 0),
      }));
    }
    // Fallback: client-side from invoice data
    const map = {};
    for (const inv of filtered) {
      const lines = inv.lines || [];
      if (lines.length > 0) {
        for (const line of lines) {
          const prodName = line.product_name || line.description || 'Other';
          if (!map[prodName]) map[prodName] = { product: prodName, quantity: 0, total: 0, invoiceCount: 0 };
          map[prodName].quantity += Number(line.quantity || 1);
          map[prodName].total += Number(line.amount || 0);
          map[prodName].invoiceCount++;
        }
      } else {
        const key = 'Unitemized';
        if (!map[key]) map[key] = { product: key, quantity: 0, total: 0, invoiceCount: 0 };
        map[key].total += Number(inv.amount || 0);
        map[key].invoiceCount++;
      }
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered, productSummary]);

  // Product drill-down: lines grouped by product name
  const getProductDrillDown = (productName) => {
    return productDetail.filter(d => (d.productName || 'Unitemized') === productName);
  };

  // Sales by Income Account
  const salesByIncomeAccount = useMemo(() => {
    const map = {};
    for (const inv of filtered) {
      const lines = inv.lines || [];
      if (lines.length > 0) {
        for (const line of lines) {
          const acct = line.income_account || 'Sales Revenue';
          if (!map[acct]) map[acct] = { account: acct, total: 0, count: 0 };
          map[acct].total += Number(line.amount || 0);
          map[acct].count++;
        }
      } else {
        const acct = 'Sales Revenue';
        if (!map[acct]) map[acct] = { account: acct, total: 0, count: 0 };
        map[acct].total += Number(inv.amount || 0);
        map[acct].count++;
      }
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered]);

  // Detail columns
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

  const productColumns = [
    { title: 'Product / Service', dataIndex: 'product', key: 'product', render: (v) => <Text strong>{v}</Text> },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 100, render: v => v || '-' },
    { title: 'Qty Sold', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'center' },
    { title: 'Total Sales', dataIndex: 'total', key: 'total', width: 140, align: 'right', sorter: (a, b) => a.total - b.total, render: v => <Text strong>{cSym} {fmt(v)}</Text> },
    { title: 'Invoices', dataIndex: 'invoiceCount', key: 'invoiceCount', width: 90, align: 'center' },
  ];

  const drillDownColumns = [
    { title: 'Invoice #', dataIndex: 'invoiceNumber', key: 'invoiceNumber', width: 100, render: v => v || '-' },
    { title: 'Date', dataIndex: 'invoiceDate', key: 'invoiceDate', width: 100, render: v => v ? moment(v).format('MM/DD/YYYY') : '-' },
    { title: 'Customer', dataIndex: 'customerName', key: 'customerName', ellipsis: true },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 60, align: 'center' },
    { title: 'Rate', dataIndex: 'rate', key: 'rate', width: 100, align: 'right', render: v => v != null ? `${cSym} ${fmt(v)}` : '-' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right', render: v => <Text strong>{cSym} {fmt(v)}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100, render: s => <Tag color={statusColors[s] || 'default'}>{s}</Tag> },
  ];

  const accountColumns = [
    { title: 'Income Account', dataIndex: 'account', key: 'account' },
    { title: 'Lines', dataIndex: 'count', key: 'count', width: 80, align: 'center' },
    { title: 'Total', dataIndex: 'total', key: 'total', width: 140, align: 'right', sorter: (a, b) => a.total - b.total, render: v => <Text strong>{cSym} {fmt(v)}</Text> },
  ];

  const exportCSV = () => {
    try {
      const headers = ['Invoice #', 'Date', 'Customer', 'Amount', 'Status', 'Due Date'];
      const rows = filtered.map(inv => [
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
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>Refresh</Button>
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
          <RangePicker value={dateRange} onChange={v => setDateRange(v || [moment().startOf('year'), moment()])} format="MM/DD/YYYY" />
          <Select placeholder="All Customers" allowClear style={{ width: 200 }} showSearch optionFilterProp="children"
            value={customerFilter} onChange={v => setCustomerFilter(v)}>
            {customers.map(c => (
              <Option key={c.id} value={c.id}>{c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()}</Option>
            ))}
          </Select>
          <Select placeholder="All Statuses" allowClear style={{ width: 150 }}
            value={statusFilter} onChange={v => setStatusFilter(v)}>
            <Option value="Paid">Paid</Option>
            <Option value="Pending">Pending</Option>
            <Option value="Sent">Sent</Option>
            <Option value="Unpaid">Unpaid</Option>
            <Option value="Overdue">Overdue</Option>
            <Option value="Partially Paid">Partially Paid</Option>
          </Select>
          <Button size="small" onClick={() => { setDateRange([moment().startOf('year'), moment()]); setCustomerFilter(null); setStatusFilter(null); }}>Reset</Button>
        </Space>
      </Card>

      {/* Tabbed Reports */}
      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane tab={<span><FileTextOutlined /> Invoice Detail</span>} key="summary">
            <Table columns={detailColumns} dataSource={filtered} rowKey={(r, i) => r.id || i} size="small" loading={loading}
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} invoices` }}
              summary={() => filtered.length > 0 ? (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={3}><Text strong>Grand Total</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right"><Text strong style={{ color: '#1890ff', fontSize: 14 }}>{cSym} {fmt(totalSales)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={4} colSpan={2} />
                </Table.Summary.Row>
              ) : null}
            />
          </TabPane>

          <TabPane tab={<span><UserOutlined /> By Customer</span>} key="customer">
            <Table columns={customerColumns} dataSource={salesByCustomer} rowKey="customer" size="small"
              pagination={false}
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
              pagination={false}
              expandable={{
                expandedRowRender: (record) => {
                  const lines = getProductDrillDown(record.product);
                  if (!lines.length) return <Text type="secondary">No line detail available</Text>;
                  return <Table columns={drillDownColumns} dataSource={lines} rowKey="lineId" size="small" pagination={false} />;
                },
                rowExpandable: () => productDetail.length > 0,
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
              pagination={false}
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
