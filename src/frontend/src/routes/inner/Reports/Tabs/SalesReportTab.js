import React, { useEffect, useState, useMemo } from 'react';
import { Card, Table, Row, Col, Statistic, DatePicker, Space, Tag, Typography, Button, message, Select, Divider } from 'antd';
import { DownloadOutlined, DollarOutlined, ShopOutlined, TeamOutlined, FileTextOutlined, CheckCircleOutlined, ClockCircleOutlined, StopOutlined } from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '../../../../utils/currency';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const SalesReportTab = () => {
  const { symbol: cSym } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [products, setProducts] = useState([]);
  const [dateRange, setDateRange] = useState([moment().startOf('year'), moment().endOf('year')]);

  useEffect(() => { loadData(); }, [dateRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invRes, prodRes] = await Promise.all([
        window.electronAPI.getInvoiceReport?.().catch(() => []),
        window.electronAPI.getAllProducts?.().catch(() => []),
      ]);
      const invList = Array.isArray(invRes) ? invRes : (invRes?.data || []);
      const prodList = Array.isArray(prodRes) ? prodRes : (prodRes?.all || []);
      setInvoices(invList.filter(i => {
        if (!i.date) return true;
        const d = moment(i.date);
        return d.isBetween(dateRange[0].startOf('day'), dateRange[1].endOf('day'), null, '[]');
      }));
      setProducts(prodList);
    } catch (err) {
      console.error('Failed to load sales data', err);
      message.error('Failed to load sales data');
    } finally { setLoading(false); }
  };

  // Sales by Product
  const salesByProduct = useMemo(() => {
    const map = {};
    invoices.forEach(inv => {
      if (inv.lines && Array.isArray(inv.lines)) {
        inv.lines.forEach(line => {
          const name = line.product_name || line.description || 'Unknown';
          if (!map[name]) map[name] = { qty: 0, total: 0 };
          map[name].qty += Number(line.quantity || 1);
          map[name].total += Number(line.amount || 0);
        });
      }
    });
    return Object.entries(map).map(([name, data]) => ({ name, ...data }));
  }, [invoices]);

  // Sales by Customer
  const salesByCustomer = useMemo(() => {
    const map = {};
    invoices.forEach(inv => {
      const name = inv.display_name || inv.customer_name || inv.customer || 'Unknown';
      if (!map[name]) map[name] = 0;
      map[name] += Number(inv.total || inv.amount || 0);
    });
    return Object.entries(map).map(([customer, total]) => ({ customer, total }));
  }, [invoices]);

  // Sales by Income Account
  const salesByIncomeAccount = useMemo(() => {
    const map = {};
    invoices.forEach(inv => {
      if (inv.lines && Array.isArray(inv.lines)) {
        inv.lines.forEach(line => {
          const acct = line.income_account || line.account || 'Sales Revenue';
          if (!map[acct]) map[acct] = 0;
          map[acct] += Number(line.amount || 0);
        });
      }
    });
    return Object.entries(map).map(([account, total]) => ({ account, total }));
  }, [invoices]);

  // Payment status breakdown
  const statusBreakdown = useMemo(() => {
    const paid = invoices.filter(i => (i.status || '').toLowerCase() === 'paid');
    const unpaid = invoices.filter(i => (i.status || '').toLowerCase() === 'pending' || (i.status || '').toLowerCase() === 'draft');
    const partial = invoices.filter(i => (i.status || '').toLowerCase() === 'partial' || (i.status || '').toLowerCase() === 'partially paid');
    const overdue = invoices.filter(i => {
      const due = i.due_date ? moment(i.due_date) : null;
      return due && due.isBefore(moment()) && (i.status || '').toLowerCase() !== 'paid';
    });
    return {
      paid: paid.reduce((s, i) => s + Number(i.total || i.amount || 0), 0),
      unpaid: unpaid.reduce((s, i) => s + Number(i.total || i.amount || 0), 0),
      partial: partial.reduce((s, i) => s + Number(i.total || i.amount || 0), 0),
      overdue: overdue.reduce((s, i) => s + Number(i.total || i.amount || 0), 0),
      total: invoices.reduce((s, i) => s + Number(i.total || i.amount || 0), 0),
    };
  }, [invoices]);

  const prodColumns = [
    { title: 'Product/Service', dataIndex: 'name', key: 'name' },
    { title: 'Qty Sold', dataIndex: 'qty', key: 'qty', align: 'right' },
    { title: 'Total Sales', dataIndex: 'total', key: 'total', align: 'right', render: v => `${cSym} ${Number(v).toFixed(2)}` },
  ];

  const custColumns = [
    { title: 'Customer', dataIndex: 'customer', key: 'customer' },
    { title: 'Total Sales', dataIndex: 'total', key: 'total', align: 'right', render: v => <Text strong>{cSym} {Number(v).toFixed(2)}</Text> },
  ];

  const incomeColumns = [
    { title: 'Income Account', dataIndex: 'account', key: 'account' },
    { title: 'Total', dataIndex: 'total', key: 'total', align: 'right', render: v => <Text strong style={{ color: '#52c41a' }}>{cSym} {Number(v).toFixed(2)}</Text> },
  ];

  const invoiceColumns = [
    { title: 'Invoice #', dataIndex: 'number', key: 'number', render: v => <Text strong>{v || '-'}</Text> },
    { title: 'Date', dataIndex: 'date', key: 'date', render: d => d ? moment(d).format('MM/DD/YYYY') : '-' },
    { title: 'Customer', dataIndex: 'display_name', key: 'customer_name' },
    { title: 'Total', dataIndex: 'total', key: 'total', align: 'right', render: v => `${cSym} ${Number(v||0).toFixed(2)}` },
    { title: 'Status', dataIndex: 'status', key: 'status', render: s => {
      const st = (s || '').toLowerCase();
      const color = st === 'paid' ? 'green' : st === 'partial' ? 'orange' : st === 'overdue' ? 'red' : 'default';
      return <Tag color={color}>{s || 'Pending'}</Tag>;
    }},
  ];

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Title level={4} style={{ margin: 0 }}><FileTextOutlined style={{ marginRight: 8 }} />Sales Report</Title>
        <Space wrap>
          <RangePicker value={dateRange} onChange={v => v && setDateRange(v)} />
          <Button icon={<DownloadOutlined />} onClick={() => {
            const csv = [['Invoice #', 'Date', 'Customer', 'Total', 'Status'].join(','),
              ...invoices.map(i => [i.number, i.date, i.display_name, i.total, i.status].map(v => `"${v||''}"`).join(','))
            ].join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = `sales_report_${moment().format('YYYY-MM-DD')}.csv`;
            a.click(); URL.revokeObjectURL(blob);
          }}>Export CSV</Button>
        </Space>
      </div>

      {/* KPI Summary */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Total Sales" value={statusBreakdown.total} precision={2} prefix={cSym} valueStyle={{ color: '#1890ff' }} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Paid" value={statusBreakdown.paid} precision={2} prefix={cSym} valueStyle={{ color: '#52c41a' }} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Unpaid" value={statusBreakdown.unpaid} precision={2} prefix={cSym} valueStyle={{ color: '#faad14' }} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Overdue" value={statusBreakdown.overdue} precision={2} prefix={cSym} valueStyle={{ color: '#f5222d' }} /></Card>
        </Col>
      </Row>

      {/* Sales by Product */}
      <Card title="Sales by Product/Service" size="small" style={{ marginBottom: 12 }}>
        <Table columns={prodColumns} dataSource={salesByProduct} rowKey="name" size="small" pagination={{ pageSize: 10 }} />
      </Card>

      {/* Sales by Customer */}
      <Card title="Sales by Customer" size="small" style={{ marginBottom: 12 }}>
        <Table columns={custColumns} dataSource={salesByCustomer} rowKey="customer" size="small" pagination={{ pageSize: 10 }} />
      </Card>

      {/* Sales by Income Account */}
      <Card title="Sales by Income Account (reconciles to General Ledger)" size="small" style={{ marginBottom: 12, borderLeft: '3px solid #52c41a' }}>
        <Table columns={incomeColumns} dataSource={salesByIncomeAccount} rowKey="account" size="small" pagination={false}
          summary={() => salesByIncomeAccount.length > 0 ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}><Text strong>Total</Text></Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right"><Text strong style={{ color: '#52c41a' }}>{cSym} {salesByIncomeAccount.reduce((s, r) => s + r.total, 0).toFixed(2)}</Text></Table.Summary.Cell>
            </Table.Summary.Row>
          ) : null}
        />
      </Card>

      {/* Invoice Detail */}
      <Card title="Invoice Detail" size="small" style={{ marginBottom: 12 }}>
        <Table columns={invoiceColumns} dataSource={invoices} rowKey={r => r.invoice_id || r.id || Math.random()}
          size="small" pagination={{ pageSize: 15 }} loading={loading}
          expandable={{
            expandedRowRender: inv => (
              <div style={{ padding: 8 }}>
                <Text strong>Line Items:</Text>
                {inv.lines && Array.isArray(inv.lines) ? inv.lines.map((l, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 12 }}>
                    <span>{l.description || l.product_name || 'Item'}{l.quantity ? ` (x${l.quantity})` : ''}</span>
                    <span>{cSym} {Number(l.amount || 0).toFixed(2)} → <Tag color="green" style={{ fontSize: 10 }}>{l.income_account || l.account || 'Sales Revenue'}</Tag></span>
                  </div>
                )) : <Text type="secondary">No line items</Text>}
              </div>
            ),
          }}
        />
      </Card>

      {/* Payment Status */}
      <Card title="Payment Status Summary" size="small">
        <Row gutter={[12, 12]}>
          <Col xs={12} sm={6}><Tag icon={<CheckCircleOutlined />} color="green">Paid: {cSym}{statusBreakdown.paid.toFixed(2)}</Tag></Col>
          <Col xs={12} sm={6}><Tag icon={<ClockCircleOutlined />} color="orange">Unpaid: {cSym}{statusBreakdown.unpaid.toFixed(2)}</Tag></Col>
          <Col xs={12} sm={6}><Tag icon={<ClockCircleOutlined />} color="blue">Partial: {cSym}{statusBreakdown.partial.toFixed(2)}</Tag></Col>
          <Col xs={12} sm={6}><Tag icon={<StopOutlined />} color="red">Overdue: {cSym}{statusBreakdown.overdue.toFixed(2)}</Tag></Col>
        </Row>
      </Card>
    </div>
  );
};

export default SalesReportTab;