import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Input, Card, Space, Select, DatePicker, message, Popconfirm, Row, Col, Tooltip, Avatar, Typography, Tag } from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined, EyeOutlined, SearchOutlined, CalendarOutlined, ShoppingCartOutlined, CheckCircleOutlined, HourglassOutlined, TeamOutlined, FileTextOutlined, PrinterOutlined, DownloadOutlined } from '@ant-design/icons';
import { Link, useHistory, useLocation } from 'react-router-dom';
import moment from 'moment';
import { useCurrency } from '../../../utils/currency';
import { normalizeStatus } from '../../StatusBadge';

const { Title, Text } = Typography;

// Invoice status is automatic (Open / Partially Paid / Paid). Draft / Void /
// Cancelled are document lifecycle states. Unpaid / Sent / Pending / Overdue are
// legacy payment labels that no longer exist as stored values.
const statusColors = { Open: 'blue', 'Partially Paid': 'orange', Paid: 'green', Draft: 'default', Void: 'volcano', Cancelled: 'default' };

const statusDot = {
  Open: { color: '#1890ff', bg: '#e6f7ff' },
  'Partially Paid': { color: '#fa8c16', bg: '#fff7e6' },
  Paid: { color: '#52c41a', bg: '#f6ffed' },
  Void: { color: '#d4380d', bg: '#fff2e8' },
  Draft: { color: '#8c8c8c', bg: '#fafafa' },
  Cancelled: { color: '#8c8c8c', bg: '#fafafa' },
};

// Invoices that still represent money owed to the business.
const isOutstanding = (s) => ['Open', 'Partially Paid'].includes(normalizeStatus(s));

const StatusPill = ({ status }) => {
  const s = normalizeStatus(status) || 'Open';
  const cfg = statusDot[s] || statusDot.Open;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, background: cfg.bg, color: cfg.color, fontWeight: 500, fontSize: 12, lineHeight: 1.4 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
      {s}
    </span>
  );
};

const InvoiceList = () => {
  const { symbol: cSym } = useCurrency();
  const location = useLocation();
  const history = useHistory();
  const qs = new URLSearchParams(location.search);
  const qStatus = qs.get('status') || '';
  const qFrom = qs.get('from') || '';
  const qTo = qs.get('to') || '';
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(qStatus);
  const [dueDateRange, setDueDateRange] = useState(null);
  const [startDateRange, setStartDateRange] = useState(qFrom && qTo ? [moment(qFrom), moment(qTo)] : null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 25, total: 0 });

  const load = useCallback(async (page, pageSize, searchTerm, status, dueFrom, dueTo, startFrom, startTo) => {
    setLoading(true);
    try {
      const res = await window.electronAPI.getInvoicesPaginated?.(page || 1, pageSize || 25, searchTerm || '', status || '', dueFrom || '', dueTo || '', startFrom || '', startTo || '');
      if (res && Array.isArray(res.data)) {
        setInvoices(res.data);
        setPagination(p => ({ ...p, current: page || 1, total: res.total || res.data.length }));
      } else if (Array.isArray(res)) {
        setInvoices(res);
        setPagination(p => ({ ...p, total: res.length }));
      } else {
        const all = await window.electronAPI.getAllInvoices?.();
        const arr = Array.isArray(all) ? all : [];
        setInvoices(arr);
        setPagination(p => ({ ...p, total: arr.length }));
      }
    } catch {
      message.error('Failed to load invoices');
    }
    setLoading(false);
  }, []);

  const getDueParams = () => {
    if (dueDateRange && dueDateRange[0] && dueDateRange[1]) {
      return [dueDateRange[0].format('YYYY-MM-DD'), dueDateRange[1].format('YYYY-MM-DD')];
    }
    return ['', ''];
  };

  const getStartParams = () => {
    if (startDateRange && startDateRange[0] && startDateRange[1]) {
      return [startDateRange[0].format('YYYY-MM-DD'), startDateRange[1].format('YYYY-MM-DD')];
    }
    return ['', ''];
  };

  useEffect(() => {
    setStatusFilter(qStatus);
    setSearch('');
    setDueDateRange(null);
    setStartDateRange(qFrom && qTo ? [moment(qFrom), moment(qTo)] : null);
    load(1, pagination.pageSize, '', qStatus, '', '', qFrom, qTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const handleTableChange = (pag) => {
    const [df, dt] = getDueParams();
    const [sf, st] = getStartParams();
    setPagination(p => ({ ...p, current: pag.current, pageSize: pag.pageSize }));
    load(pag.current, pag.pageSize, search, statusFilter, df, dt, sf, st);
  };
  const handleSearch = () => {
    const [df, dt] = getDueParams();
    const [sf, st] = getStartParams();
    load(1, pagination.pageSize, search, statusFilter, df, dt, sf, st);
  };
  const handleStatusChange = (v) => {
    setStatusFilter(v || '');
    const [df, dt] = getDueParams();
    const [sf, st] = getStartParams();
    load(1, pagination.pageSize, search, v || '', df, dt, sf, st);
  };
  const handleDueDateChange = (dates) => {
    setDueDateRange(dates);
    const [df, dt] = dates ? [dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')] : ['', ''];
    const [sf, st] = getStartParams();
    load(1, pagination.pageSize, search, statusFilter, df, dt, sf, st);
  };
  const handleRefresh = () => {
    const [df, dt] = getDueParams();
    const [sf, st] = getStartParams();
    load(pagination.current, pagination.pageSize, search, statusFilter, df, dt, sf, st);
  };

  const handlePrint = () => {
    if (!invoices.length) { message.warning('No data to print'); return; }
    const rowsHtml = invoices.map(i => `<tr>
      <td>${i.number || `INV-${i.id}`}</td>
      <td>${(i.customer_name || i.customer || '-').replace(/</g, '&lt;')}</td>
      <td>${i.start_date ? moment(i.start_date).format('MM/DD/YYYY') : '-'}</td>
      <td>${i.last_date ? moment(i.last_date).format('MM/DD/YYYY') : '-'}</td>
      <td style="text-align:right">${cSym} ${Number(i.amount || 0).toFixed(2)}</td>
      <td>${i.status || 'Open'}</td>
    </tr>`).join('');
    const html = `<!doctype html><html><head><title>Invoices</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;padding:24px}
      h2{color:#333;margin-bottom:4px}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{border:1px solid #ddd;padding:8px;text-align:left}
      th{background:#f5f5f5;text-align:left}
      tfoot td{font-weight:bold;border-top:2px solid #333}
    </style></head><body>
      <h2>Invoices</h2>
      <p>Printed: ${moment().format('MM/DD/YYYY hh:mm A')} · ${invoices.length} invoice${invoices.length === 1 ? '' : 's'}</p>
      <table><thead><tr><th>Invoice #</th><th>Customer</th><th>Date</th><th>Due Date</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot><tr><td colspan="4">Total</td><td style="text-align:right">${cSym} ${Number(totalAmount || 0).toFixed(2)}</td><td></td></tr></tfoot></table>
      <script>window.print();window.close();</script>
    </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  };

  const handleDownload = () => {
    if (!invoices.length) { message.warning('No data to export'); return; }
    const header = ['Invoice #', 'Customer', 'Date', 'Due Date', 'Amount', 'Status'];
    const rows = invoices.map(i => [
      i.number || `INV-${i.id}`,
      (i.customer_name || i.customer || '-').replace(/"/g, '""'),
      i.start_date || '',
      i.last_date || '',
      Number(i.amount || 0).toFixed(2),
      i.status || 'Open',
    ]);
    const lines = [header.join(','), ...rows.map(r => r.map((c, idx) => idx === 1 ? `"${c}"` : c).join(',')), `Total,,,,${Number(totalAmount || 0).toFixed(2)},`];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices-${moment().format('YYYYMMDD')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id) => {
    try {
      await window.electronAPI.deleteRecord?.(id, 'invoices');
      message.success('Invoice deleted');
      const [df, dt] = getDueParams();
      const [sf, st] = getStartParams();
      load(pagination.current, pagination.pageSize, search, statusFilter, df, dt, sf, st);
    } catch { message.error('Delete failed'); }
  };

  const totalAmount = invoices.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const unpaidAmount = invoices.filter(i => isOutstanding(i.status)).reduce((s, i) => s + (Number(i.balance != null ? i.balance : i.amount) || 0), 0);
  const paidAmount = invoices.filter(i => normalizeStatus(i.status) === 'Paid').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const paidCount = invoices.filter(i => normalizeStatus(i.status) === 'Paid').length;
  const overdueCount = invoices.filter(i => isOutstanding(i.status) && i.last_date && moment(i.last_date).isBefore(moment(), 'day')).length;

  const columns = [
    {
      title: 'Invoice #', dataIndex: 'number', key: 'number', width: 110,
      sorter: (a, b) => String(a.number || '').localeCompare(String(b.number || '')),
      render: (t, r) => (
        <Link to={`/main/customers/invoices/edit/${r.id}`} style={{ fontWeight: 600, color: '#1890ff' }}>
          {t || `INV-${r.id}`}
        </Link>
      ),
    },
    {
      title: 'Customer', dataIndex: 'customer_name', key: 'customer',
      sorter: (a, b) => (a.customer_name || '').localeCompare(b.customer_name || ''),
      render: (t, r) => (
        <Space size={8}>
          <Avatar size={26} style={{ background: '#e6f7ff', color: '#1890ff', fontWeight: 600, fontSize: 12, flexShrink: 0 }}>
            {(t || r.customer || '?').charAt(0).toUpperCase()}
          </Avatar>
          <span style={{ fontWeight: 500 }}>{t || r.customer || '-'}</span>
        </Space>
      ),
    },
    {
      title: 'Date', dataIndex: 'start_date', key: 'date', width: 105,
      sorter: (a, b) => (a.start_date || '').localeCompare(b.start_date || ''),
      render: d => <span style={{ color: '#595959' }}>{d ? moment(d).format('MM/DD/YYYY') : '-'}</span>,
    },
    {
      title: 'Due Date', dataIndex: 'last_date', key: 'due', width: 105,
      render: (d, r) => {
        // Overdue = still owes money (Open / Partially Paid) and the due date has passed.
        const isOverdue = isOutstanding(r.status) && d && moment(d).isBefore(moment(), 'day');
        return <span style={{ color: isOverdue ? '#f5222d' : '#595959', fontWeight: isOverdue ? 600 : undefined }}>
          {d ? moment(d).format('MM/DD/YYYY') : '-'}
        </span>;
      },
    },
    {
      title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right',
      sorter: (a, b) => (Number(a.amount) || 0) - (Number(b.amount) || 0),
      render: v => <span style={{ fontWeight: 600 }}>{cSym} {Number(v || 0).toFixed(2)}</span>,
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 125,
      filters: Object.keys(statusColors).map(s => ({ text: s, value: s })),
      onFilter: (v, r) => r.status === v,
      render: s => <StatusPill status={s} />,
    },
    {
      title: 'Actions', key: 'actions', width: 110, align: 'center',
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="View / Edit">
            <Button type="text" size="small" icon={<EyeOutlined />} style={{ color: '#595959' }} onClick={() => history.push(`/main/customers/invoices/edit/${r.id}`)} />
          </Tooltip>
          <Popconfirm title="Delete this invoice?" onConfirm={() => handleDelete(r.id)}>
            <Tooltip title="Delete">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const statStyle = { borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', border: '1px solid #f0f0f0' };

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Invoices</Title>
          <Text type="secondary">Create, send and track customer invoices</Text>
        </div>
        <Button type="primary" size="large" icon={<PlusOutlined />} style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(24,144,255,0.35)' }} onClick={() => history.push('/main/customers/invoices/new')}>
          New Invoice
        </Button>
      </div>

      {/* Stat cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={statStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#1890ff,#69c0ff)', color: '#fff', fontSize: 20, flexShrink: 0 }}>
                <ShoppingCartOutlined />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Total Invoiced</Text>
                <Text strong style={{ fontSize: 18 }}>{cSym} {Number(totalAmount || 0).toFixed(2)}</Text>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={statStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#fa8c16,#ffc53d)', color: '#fff', fontSize: 20, flexShrink: 0 }}>
                <HourglassOutlined />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Unpaid</Text>
                <Text strong style={{ fontSize: 18, color: unpaidAmount > 0 ? '#fa8c16' : '#52c41a' }}>{cSym} {Number(unpaidAmount || 0).toFixed(2)}</Text>
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
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Paid</Text>
                <Text strong style={{ fontSize: 18, color: '#52c41a' }}>{cSym} {Number(paidAmount || 0).toFixed(2)}</Text>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={statStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#f5222d,#ff7875)', color: '#fff', fontSize: 20, flexShrink: 0 }}>
                <FileTextOutlined />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Overdue</Text>
                <Text strong style={{ fontSize: 18, color: '#f5222d' }}>{overdueCount}</Text>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Table card */}
      {qFrom && qTo && (
        <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Tag color="green" icon={<CheckCircleOutlined />}>
            Paid this month — {moment(qFrom).format('MMM YYYY')}
          </Tag>
          <Button size="small" type="link" onClick={() => history.push('/main/customers/invoices/list')}>Clear filter</Button>
        </div>
      )}
      <Card
        bodyStyle={{ padding: 0 }}
        style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}
      >
        {/* Toolbar - search, status, due date, refresh on the left */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: 16, borderBottom: '1px solid #f0f0f0' }}>
          <Input
            placeholder="Search by customer or number..."
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            allowClear
            style={{ width: 240, borderRadius: 8 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onPressEnter={handleSearch}
            onClear={() => { setSearch(''); const [df, dt] = getDueParams(); const [sf, st] = getStartParams(); load(1, pagination.pageSize, '', statusFilter, df, dt, sf, st); }}
          />
          <Select
            allowClear
            placeholder="Filter by status"
            style={{ width: 150, borderRadius: 8 }}
            value={statusFilter || undefined}
            onChange={handleStatusChange}
          >
            {Object.keys(statusColors).map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}
          </Select>
          <DatePicker.RangePicker
            value={dueDateRange}
            onChange={handleDueDateChange}
            placeholder={['Due from', 'Due to']}
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
            <TeamOutlined /> {pagination.total} invoice{pagination.total === 1 ? '' : 's'} · {paidCount} paid
          </span>
        </div>
        <Table
          dataSource={invoices}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="middle"
          pagination={{ ...pagination, showSizeChanger: true, pageSizeOptions: ['25', '50', '100'], showTotal: t => `${t} invoices`, style: { margin: 16 } }}
          onChange={handleTableChange}
          rowClassName={() => 'invoice-row'}
        />
      </Card>
      <style>{`
        .invoice-row:hover > td { background: #f0f7ff !important; }
        .ant-table-tbody > tr > td { border-color: #f5f5f5 !important; }
      `}</style>
    </div>
  );
};

export default InvoiceList;
