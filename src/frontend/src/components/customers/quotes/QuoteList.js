import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Input, Card, Space, Select, DatePicker, message, Popconfirm, Row, Col, Tooltip, Avatar, Typography } from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined, EyeOutlined, SwapOutlined, FileTextOutlined, SearchOutlined, CheckCircleOutlined, ClockCircleOutlined, RiseOutlined, TeamOutlined, CalendarOutlined, PrinterOutlined, DownloadOutlined } from '@ant-design/icons';
import { Link, useHistory } from 'react-router-dom';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';
import { getCustomerName } from '../../../utils/contactIdentity';

const { Title, Text } = Typography;

// Quote status is workflow controlled: Pending → Accepted / Declined / Converted.
// Legacy values (Open/Sent/Draft/Expired/Invoiced) are normalised for display.
const normalizeQuoteStatus = (status) => {
  const raw = String(status == null ? '' : status).trim();
  if (!raw) return 'Pending';
  switch (raw.toLowerCase()) {
    case 'accepted': return 'Accepted';
    case 'declined':
    case 'rejected': return 'Declined';
    case 'converted':
    case 'invoiced': return 'Converted';
    case 'pending':
    case 'open':
    case 'active':
    case 'sent':
    case 'draft':
    case 'expired': return 'Pending';
    default: return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
};

const isConvertible = (status) => {
  const s = normalizeQuoteStatus(status);
  return s === 'Pending' || s === 'Accepted';
};

const statusColors = { Pending: 'gold', Accepted: 'green', Declined: 'red', Converted: 'purple' };

const statusDot = {
  Pending: { color: '#faad14', bg: '#fffbe6' },
  Accepted: { color: '#52c41a', bg: '#f6ffed' },
  Declined: { color: '#f5222d', bg: '#fff1f0' },
  Converted: { color: '#722ed1', bg: '#f9f0ff' },
};

const StatusPill = ({ status }) => {
  const s = normalizeQuoteStatus(status);
  const cfg = statusDot[s] || statusDot.Pending;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, background: cfg.bg, color: cfg.color, fontWeight: 500, fontSize: 12, lineHeight: 1.4 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
      {s}
    </span>
  );
};

const QuoteList = () => {
  const { symbol: cSym } = useCurrency();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateRange, setDateRange] = useState(null);
  const [expiryRange, setExpiryRange] = useState(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 25, total: 0 });
  const history = useHistory();

  const getDateParams = () => {
    const df = dateRange && dateRange[0] ? dateRange[0].format('YYYY-MM-DD') : '';
    const dt = dateRange && dateRange[1] ? dateRange[1].format('YYYY-MM-DD') : '';
    const ef = expiryRange && expiryRange[0] ? expiryRange[0].format('YYYY-MM-DD') : '';
    const et = expiryRange && expiryRange[1] ? expiryRange[1].format('YYYY-MM-DD') : '';
    return { df, dt, ef, et };
  };

  const load = useCallback(async (page, pageSize, searchTerm, status, df, dt, ef, et) => {
    setLoading(true);
    try {
      const res = await window.electronAPI.getQuotesPaginated?.(page || 1, pageSize || 25, searchTerm || '', status || '', df || '', dt || '', ef || '', et || '');
      if (res && Array.isArray(res.data)) {
        setQuotes(res.data);
        setPagination(p => ({ ...p, current: page || 1, total: res.total || res.data.length }));
      } else if (Array.isArray(res)) {
        setQuotes(res);
        setPagination(p => ({ ...p, total: res.length }));
      } else {
        const all = await window.electronAPI.getAllQuotes?.();
        const arr = Array.isArray(all) ? all : [];
        setQuotes(arr);
        setPagination(p => ({ ...p, total: arr.length }));
      }
    } catch {
      message.error('Failed to load quotes');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const { df, dt, ef, et } = getDateParams();
    load(1, pagination.pageSize, search, statusFilter, df, dt, ef, et);
  }, []);

  const handleTableChange = (pag) => {
    const { df, dt, ef, et } = getDateParams();
    setPagination(p => ({ ...p, current: pag.current, pageSize: pag.pageSize }));
    load(pag.current, pag.pageSize, search, statusFilter, df, dt, ef, et);
  };
  const handleSearch = () => {
    const { df, dt, ef, et } = getDateParams();
    load(1, pagination.pageSize, search, statusFilter, df, dt, ef, et);
  };
  const handleStatusChange = (v) => {
    setStatusFilter(v || '');
    const { df, dt, ef, et } = getDateParams();
    load(1, pagination.pageSize, search, v || '', df, dt, ef, et);
  };
  const handleDateRangeChange = (dates) => {
    setDateRange(dates);
    const dft = dates && dates[0] ? dates[0].format('YYYY-MM-DD') : '';
    const dtt = dates && dates[1] ? dates[1].format('YYYY-MM-DD') : '';
    const { ef, et } = getDateParams();
    load(1, pagination.pageSize, search, statusFilter, dft, dtt, ef, et);
  };
  const handleExpiryRangeChange = (dates) => {
    setExpiryRange(dates);
    const eft = dates && dates[0] ? dates[0].format('YYYY-MM-DD') : '';
    const ett = dates && dates[1] ? dates[1].format('YYYY-MM-DD') : '';
    const { df, dt } = getDateParams();
    load(1, pagination.pageSize, search, statusFilter, df, dt, eft, ett);
  };
  const handleRefresh = () => {
    const { df, dt, ef, et } = getDateParams();
    load(pagination.current, pagination.pageSize, search, statusFilter, df, dt, ef, et);
  };

  const handleDelete = async (id) => {
    try {
      await window.electronAPI.deleteRecord?.(id, 'quotes');
      message.success('Quote deleted');
      const { df, dt, ef, et } = getDateParams();
      load(pagination.current, pagination.pageSize, search, statusFilter, df, dt, ef, et);
    } catch { message.error('Delete failed'); }
  };

  const handleConvert = async (id) => {
    try {
      const res = await window.electronAPI.convertQuoteToInvoice?.(id);
      if (res?.alreadyConverted) {
        message.warning(typeof res.error === 'string' ? res.error : 'This quote has already been converted.');
        const { df, dt, ef, et } = getDateParams();
        load(pagination.current, pagination.pageSize, search, statusFilter, df, dt, ef, et);
        return;
      }
      if (res?.error || res?.success === false) {
        message.error(typeof res?.error === 'string' ? res.error : 'Conversion failed');
        return;
      }
      message.success(`Quote converted to invoice${res?.invoiceNumber ? ` ${res.invoiceNumber}` : ''}`);
      const { df, dt, ef, et } = getDateParams();
      load(pagination.current, pagination.pageSize, search, statusFilter, df, dt, ef, et);
    } catch { message.error('Conversion failed'); }
  };

  const handlePrint = () => {
    if (!quotes.length) { message.warning('No data to print'); return; }
    const rowsHtml = quotes.map(q => `<tr>
      <td>${q.number || `QT-${q.id}`}</td>
      <td>${(getCustomerName(q) || q.customer_name || '-').replace(/</g, '&lt;')}</td>
      <td>${q.start_date ? moment(q.start_date).format('MM/DD/YYYY') : '-'}</td>
      <td>${q.last_date ? moment(q.last_date).format('MM/DD/YYYY') : '-'}</td>
      <td style="text-align:right">${cSym} ${Number(q.amount || 0).toFixed(2)}</td>
      <td>${q.status || 'Pending'}</td>
    </tr>`).join('');
    const html = `<!doctype html><html><head><title>Quotes / Estimates</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;padding:24px}
      h2{color:#333;margin-bottom:4px}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{border:1px solid #ddd;padding:8px;text-align:left}
      th{background:#f5f5f5;text-align:left}
      tfoot td{font-weight:bold;border-top:2px solid #333}
    </style></head><body>
      <h2>Quotes / Estimates</h2>
      <p>Printed: ${moment().format('MM/DD/YYYY hh:mm A')} · ${quotes.length} quote${quotes.length === 1 ? '' : 's'}</p>
      <table><thead><tr><th>Quote #</th><th>Customer</th><th>Date</th><th>Expiry</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot><tr><td colspan="4">Total</td><td style="text-align:right">${cSym} ${Number(totalAmount || 0).toFixed(2)}</td><td></td></tr></tfoot></table>
      <script>window.print();window.close();</script>
    </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  };

  const handleDownload = () => {
    if (!quotes.length) { message.warning('No data to export'); return; }
    const header = ['Quote #', 'Customer', 'Date', 'Expiry', 'Amount', 'Status'];
    const rows = quotes.map(q => [
      q.number || `QT-${q.id}`,
      (getCustomerName(q) || q.customer_name || '-').replace(/"/g, '""'),
      q.start_date || '',
      q.last_date || '',
      Number(q.amount || 0).toFixed(2),
      normalizeQuoteStatus(q.status),
    ]);
    const lines = [header.join(','), ...rows.map(r => r.map((c, i) => i === 1 ? `"${c}"` : c).join(',')), `Total,,,,${Number(totalAmount || 0).toFixed(2)},`];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quotes-${moment().format('YYYYMMDD')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const totalAmount = quotes.reduce((s, q) => s + (Number(q.amount) || 0), 0);
  const pendingCount = quotes.filter(q => normalizeQuoteStatus(q.status) === 'Pending').length;
  const acceptedCount = quotes.filter(q => normalizeQuoteStatus(q.status) === 'Accepted').length;

  const columns = [
    {
      title: 'Quote #', dataIndex: 'number', key: 'number', width: 110,
      sorter: (a, b) => String(a.number || '').localeCompare(String(b.number || '')),
      render: (t, r) => (
        <Link to={`/main/customers/quotes/edit/${r.id}`} style={{ fontWeight: 600, color: '#1890ff' }}>
          {t || `QT-${r.id}`}
        </Link>
      ),
    },
    {
      title: 'Customer', dataIndex: 'customer_name', key: 'customer',
      sorter: (a, b) => (getCustomerName(a) || a.customer_name || '').localeCompare(getCustomerName(b) || b.customer_name || ''),
      render: (t, r) => {
        const name = getCustomerName(r) || t || '-';
        return (
        <Space size={8}>
          <Avatar size={26} style={{ background: '#e6f7ff', color: '#1890ff', fontWeight: 600, fontSize: 12, flexShrink: 0 }}>
            {name.charAt(0).toUpperCase()}
          </Avatar>
          <span style={{ fontWeight: 500 }}>{name}</span>
        </Space>
        );
      },
    },
    {
      title: 'Date', dataIndex: 'start_date', key: 'date', width: 105,
      render: d => <span style={{ color: '#595959' }}>{d ? moment(d).format('MM/DD/YYYY') : '-'}</span>,
    },
    {
      title: 'Expiry', dataIndex: 'last_date', key: 'expiry', width: 105,
      render: (d, r) => {
        const expired = normalizeQuoteStatus(r.status) === 'Pending' && d && moment(d).isBefore(moment());
        return <span style={{ color: expired ? '#f5222d' : '#595959', fontWeight: expired ? 500 : undefined }}>{d ? moment(d).format('MM/DD/YYYY') : '-'}</span>;
      },
    },
    {
      title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right',
      sorter: (a, b) => (Number(a.amount) || 0) - (Number(b.amount) || 0),
      render: v => <span style={{ fontWeight: 600 }}>{cSym} {Number(v || 0).toFixed(2)}</span>,
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 120,
      filters: Object.keys(statusColors).map(s => ({ text: s, value: s })),
      onFilter: (v, r) => normalizeQuoteStatus(r.status) === v,
      render: s => <StatusPill status={s} />,
    },
    {
      title: 'Actions', key: 'actions', width: 150, align: 'center',
      render: (_, r) => {
        const linkedInvoiceId = r.linked_invoice || r.linkedInvoiceId || r.convertedInvoiceId || null;
        return (
        <Space size={4}>
          <Tooltip title="View / Edit">
            <Button type="text" size="small" icon={<EyeOutlined />} style={{ color: '#595959' }} onClick={() => history.push(`/main/customers/quotes/edit/${r.id}`)} />
          </Tooltip>
          {isConvertible(r.status) && (
            <Popconfirm title="Convert to invoice?" onConfirm={() => handleConvert(r.id)}>
              <Tooltip title="Convert to Invoice">
                <Button type="text" size="small" icon={<SwapOutlined />} style={{ color: '#722ed1' }} />
              </Tooltip>
            </Popconfirm>
          )}
          {normalizeQuoteStatus(r.status) === 'Converted' && linkedInvoiceId && (
            <Tooltip title={`View Invoice ${r.linked_invoice_number || ''}`.trim()}>
              <Button type="text" size="small" icon={<FileTextOutlined />} style={{ color: '#722ed1' }} onClick={() => history.push(`/main/customers/invoices/edit/${linkedInvoiceId}`)} />
            </Tooltip>
          )}
          <Popconfirm title="Delete this quote?" onConfirm={() => handleDelete(r.id)}>
            <Tooltip title="Delete">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
        );
      },
    },
  ];

  const statStyle = { borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', border: '1px solid #f0f0f0' };

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Quotes / Estimates</Title>
          <Text type="secondary">Create, track and convert quotes into invoices</Text>
        </div>
        <Button type="primary" size="large" icon={<PlusOutlined />} style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(24,144,255,0.35)' }} onClick={() => history.push('/main/customers/quotes/new')}>
          New Quote
        </Button>
      </div>

      {/* Stat cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={statStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#1890ff,#69c0ff)', color: '#fff', fontSize: 20, flexShrink: 0 }}>
                <RiseOutlined />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Total Quoted</Text>
                <Text strong style={{ fontSize: 18 }}>{cSym} {Number(totalAmount || 0).toFixed(2)}</Text>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={statStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#722ed1,#b37feb)', color: '#fff', fontSize: 20, flexShrink: 0 }}>
                <FileTextOutlined />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Total Quotes</Text>
                <Text strong style={{ fontSize: 18 }}>{quotes.length}</Text>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={statStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#fa8c16,#ffc53d)', color: '#fff', fontSize: 20, flexShrink: 0 }}>
                <ClockCircleOutlined />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Pending</Text>
                <Text strong style={{ fontSize: 18, color: '#faad14' }}>{pendingCount}</Text>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={statStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#52c41a,#95de64)', color: '#fff', fontSize: 20, flexShrink: 0 }}>
                <CheckCircleOutlined />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Accepted</Text>
                <Text strong style={{ fontSize: 18, color: '#52c41a' }}>{acceptedCount}</Text>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Table card */}
      <Card
        bodyStyle={{ padding: 0 }}
        style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}
      >
        {/* Toolbar - search, status, dates, refresh on the left */}
        <div className="al-list-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: 16, borderBottom: '1px solid #f0f0f0' }}>
          <Input
            placeholder="Search by customer or number..."
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            allowClear
            style={{ width: 220, borderRadius: 8 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onPressEnter={handleSearch}
            onClear={() => { setSearch(''); const { df, dt, ef, et } = getDateParams(); load(1, pagination.pageSize, '', statusFilter, df, dt, ef, et); }}
          />
          <Select
            allowClear
            placeholder="Filter by status"
            style={{ width: 140, borderRadius: 8 }}
            value={statusFilter || undefined}
            onChange={handleStatusChange}
          >
            {Object.keys(statusColors).map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}
          </Select>
          <DatePicker.RangePicker
            value={dateRange}
            onChange={handleDateRangeChange}
            placeholder={['Quote from', 'Quote to']}
            suffixIcon={<CalendarOutlined style={{ color: '#bfbfbf' }} />}
            style={{ width: 220, borderRadius: 8 }}
            allowClear
          />
          <DatePicker.RangePicker
            value={expiryRange}
            onChange={handleExpiryRangeChange}
            placeholder={['Expiry from', 'Expiry to']}
            suffixIcon={<CalendarOutlined style={{ color: '#bfbfbf' }} />}
            style={{ width: 220, borderRadius: 8 }}
            allowClear
          />
          <Tooltip title="Refresh">
            <Button icon={<ReloadOutlined />} style={{ borderRadius: 8 }} onClick={handleRefresh} />
          </Tooltip>
          <Tooltip title="Print">
            <Button icon={<PrinterOutlined />} style={{ borderRadius: 8 }} onClick={handlePrint} />
          </Tooltip>
          <Tooltip title="Download CSV">
            <Button icon={<DownloadOutlined />} style={{ borderRadius: 8 }} onClick={handleDownload} />
          </Tooltip>
          <span style={{ marginLeft: 'auto', color: '#8c8c8c', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <TeamOutlined /> {pagination.total} quote{pagination.total === 1 ? '' : 's'}
          </span>
        </div>
        <Table
          dataSource={quotes}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="middle"
          pagination={{ ...pagination, showSizeChanger: true, pageSizeOptions: ['25', '50', '100'], showTotal: t => `${t} quotes`, style: { margin: 16 } }}
          onChange={handleTableChange}
          rowClassName={() => 'quote-row'}
        />
      </Card>
      <style>{`
        .quote-row:hover > td { background: #f0f7ff !important; }
        .ant-table-tbody > tr > td { border-color: #f5f5f5 !important; }
      `}</style>
    </div>
  );
};

export default QuoteList;
