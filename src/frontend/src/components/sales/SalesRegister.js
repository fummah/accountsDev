import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Input, Card, Select, DatePicker, message, Row, Col, Tooltip, Avatar, Typography, Modal, Tag, Alert, Spin } from 'antd';
import { ReloadOutlined, SearchOutlined, FileTextOutlined, RiseOutlined, BankOutlined, GiftOutlined, PrinterOutlined, DownloadOutlined, CalendarOutlined, ScheduleOutlined } from '@ant-design/icons';
import { useHistory } from 'react-router-dom';
import moment from 'moment';
import { useCurrency } from '../../utils/currency';

const { Title, Text } = Typography;

const fmtNum = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TYPE_META = {
  'Quote':       { color: '#1890ff', bg: '#e6f7ff' },
  'Invoice':     { color: '#722ed1', bg: '#f9f0ff' },
  'Payment':     { color: '#52c41a', bg: '#f6ffed' },
  'Credit Note': { color: '#fa8c16', bg: '#fff7e6' },
  'Recurring':   { color: '#13c2c2', bg: '#e6fffb' },
};

const StatusPill = ({ status, type }) => {
  const s = status || 'Draft';
  const t = type || '';
  const low = String(s).toLowerCase();
  let color = '#8c8c8c', bg = '#fafafa';
  if (low === 'paid' || low === 'accepted' || low === 'posted' || low === 'applied' || low === 'active') { color = '#52c41a'; bg = '#f6ffed'; }
  else if (low === 'converted' || low === 'invoiced') { color = '#722ed1'; bg = '#f9f0ff'; }
  else if (low === 'open' || low === 'sent' || low === 'partial' || low === 'partially paid' || low === 'pending deposit' || low === 'overdue') { color = '#1890ff'; bg = '#e6f7ff'; }
  else if (low === 'declined' || low === 'cancelled' || low === 'canceled' || low === 'void' || low === 'voided' || low === 'expired' || low === 'overdue') { color = '#f5222d'; bg = '#fff1f0'; }
  else if (low === 'draft' || low === 'paused' || low === 'inactive') { color = '#8c8c8c'; bg = '#fafafa'; }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, background: bg, color, fontWeight: 500, fontSize: 12, lineHeight: 1.4 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {s}
    </span>
  );
};

const TypePill = ({ type }) => {
  const cfg = TYPE_META[type] || TYPE_META.Quote;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6, background: cfg.bg, color: cfg.color, fontWeight: 600, fontSize: 12, lineHeight: 1.4 }}>
      {type}
    </span>
  );
};

// Map register source_type -> drill-down route
const SOURCE_ROUTES = {
  invoice:      id => `/main/customers/invoices/edit/${id}`,
  quote:        id => `/main/customers/quotes/edit/${id}`,
  payment:      () => '/main/customers/payment-history',
  credit_note:  () => '/main/customers/credit-notes',
  recurring:    () => '/main/customers/recurring',
  journal:      () => '/main/accountant/journal-entries',
};

const SalesRegister = () => {
  const { symbol: cSym } = useCurrency();
  const history = useHistory();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateRange, setDateRange] = useState(null);
  const [summary, setSummary] = useState({ quotesAmount: 0, invoicesAmount: 0, paymentsAmount: 0, creditNotesAmount: 0, count: 0 });
  const [pagination, setPagination] = useState({ current: 1, pageSize: 25, total: 0 });

  // Quick-view modal state
  const [sourceRecord, setSourceRecord] = useState(null);
  const [sourceDetail, setSourceDetail] = useState(null);
  const [sourceLoading, setSourceLoading] = useState(false);

  const getDateParams = () => {
    const df = dateRange && dateRange[0] ? dateRange[0].format('YYYY-MM-DD') : '';
    const dt = dateRange && dateRange[1] ? dateRange[1].format('YYYY-MM-DD') : '';
    return { df, dt };
  };

  const load = useCallback(async (page, pageSize, searchTerm, type, df, dt) => {
    setLoading(true);
    try {
      const res = await window.electronAPI.getSalesRegister?.({
        page: page || 1,
        pageSize: pageSize || 25,
        search: searchTerm || '',
        type: type || '',
        dateFrom: df || '',
        dateTo: dt || '',
      });
      if (res && Array.isArray(res.data)) {
        setRows(res.data);
        setPagination(p => ({ ...p, current: page || 1, total: res.total || res.data.length }));
        if (res.summary) setSummary(res.summary);
      } else {
        setRows([]);
        setPagination(p => ({ ...p, total: 0 }));
      }
    } catch {
      message.error('Failed to load sales register');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const { df, dt } = getDateParams();
    load(1, pagination.pageSize, search, typeFilter, df, dt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTableChange = (pag) => {
    const { df, dt } = getDateParams();
    setPagination(p => ({ ...p, current: pag.current, pageSize: pag.pageSize }));
    load(pag.current, pag.pageSize, search, typeFilter, df, dt);
  };
  const handleSearch = () => {
    const { df, dt } = getDateParams();
    load(1, pagination.pageSize, search, typeFilter, df, dt);
  };
  const handleTypeChange = (v) => {
    setTypeFilter(v || '');
    const { df, dt } = getDateParams();
    load(1, pagination.pageSize, search, v || '', df, dt);
  };
  const handleDateRangeChange = (dates) => {
    setDateRange(dates);
    const dft = dates && dates[0] ? dates[0].format('YYYY-MM-DD') : '';
    const dtt = dates && dates[1] ? dates[1].format('YYYY-MM-DD') : '';
    load(1, pagination.pageSize, search, typeFilter, dft, dtt);
  };
  const handleRefresh = () => {
    const { df, dt } = getDateParams();
    load(pagination.current, pagination.pageSize, search, typeFilter, df, dt);
  };

  // Open the quick-view modal for a transaction
  const openSource = async (r) => {
    if (!r || !r.source_type) return;
    setSourceRecord(r);
    setSourceDetail(null);
    setSourceLoading(true);
    try {
      const detail = await window.electronAPI.journalSourceDetail?.(r.source_type, r.source_id);
      setSourceDetail(detail && !detail.error ? detail : null);
    } catch {
      setSourceDetail(null);
    }
    setSourceLoading(false);
  };

  // Navigate to the original document
  const navigateTo = (r) => {
    const routeFn = SOURCE_ROUTES[r.source_type];
    if (routeFn) history.push(routeFn(r.source_id, r));
    else history.push('/main/customers/payment-history');
  };

  const openOriginal = (r) => {
    setSourceRecord(null);
    setSourceDetail(null);
    navigateTo(r);
  };

  const handlePrint = () => {
    if (!rows.length) { message.warning('No data to print'); return; }
    const rowsHtml = rows.map(r => `<tr>
      <td>${r.date || '-'}</td>
      <td>${(r.type || '').replace(/</g, '&lt;')}</td>
      <td>${(r.number || '-').replace(/</g, '&lt;')}</td>
      <td>${(r.customer || '-').replace(/</g, '&lt;')}</td>
      <td>${(r.memo || '-').replace(/</g, '&lt;')}</td>
      <td style="text-align:right">${cSym} ${Number(r.amount || 0).toFixed(2)}</td>
      <td>${(r.status || '-').replace(/</g, '&lt;')}</td>
    </tr>`).join('');
    const totalAmt = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const html = `<!doctype html><html><head><title>Sales Register</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;padding:24px}
      h2{color:#333;margin-bottom:4px}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{border:1px solid #ddd;padding:8px;text-align:left}
      th{background:#f5f5f5;text-align:left}
      tfoot td{font-weight:bold;border-top:2px solid #333}
    </style></head><body>
      <h2>Sales Register</h2>
      <p>Printed: ${moment().format('MM/DD/YYYY hh:mm A')} · ${rows.length} transactions</p>
      <table><thead><tr><th>Date</th><th>Type</th><th>No.</th><th>Customer</th><th>Memo</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot><tr><td colspan="5">Total</td><td style="text-align:right">${cSym} ${totalAmt.toFixed(2)}</td><td></td></tr></tfoot></table>
      <script>window.print();window.close();</script>
    </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  };

  const handleDownload = () => {
    if (!rows.length) { message.warning('No data to export'); return; }
    const header = ['Date', 'Type', 'No.', 'Customer', 'Memo', 'Amount', 'Status'];
    const data = rows.map(r => [
      r.date || '', r.type || '', (r.number || '').replace(/"/g, '""'),
      (r.customer || '').replace(/"/g, '""'), (r.memo || '').replace(/"/g, '""'),
      Number(r.amount || 0).toFixed(2), r.status || '',
    ]);
    const totalAmt = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const lines = [header.join(','), ...data.map(r => r.map((c, i) => (i === 3 || i === 4) ? `"${c}"` : c).join(',')), `,,,,,${totalAmt.toFixed(2)},`];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-register-${moment().format('YYYYMMDD')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const columns = [
    {
      title: 'Date', dataIndex: 'date', key: 'date', width: 110,
      sorter: (a, b) => String(a.date || '').localeCompare(String(b.date || '')),
      render: d => <span style={{ color: '#595959' }}>{d ? moment(d).format('MM/DD/YYYY') : '-'}</span>,
    },
    {
      title: 'Type', dataIndex: 'type', key: 'type', width: 125,
      render: t => <TypePill type={t} />,
    },
    {
      title: 'No.', dataIndex: 'number', key: 'number', width: 120,
      render: (t, r) => (
        <a
          style={{ fontWeight: 600, color: '#1890ff', cursor: 'pointer' }}
          onClick={(e) => { e.stopPropagation(); openSource(r); }}
          title="Quick view"
        >
          {t || `#${r.rid}`}
        </a>
      ),
    },
    {
      title: 'Customer', dataIndex: 'customer', key: 'customer',
      sorter: (a, b) => (a.customer || '').localeCompare(b.customer || ''),
      render: (t, r) => (
        <SpaceAvatar customer={t} />
      ),
    },
    {
      title: 'Memo', dataIndex: 'memo', key: 'memo', width: 200, ellipsis: true,
      render: t => <span style={{ color: '#8c8c8c' }}>{t || '-'}</span>,
    },
    {
      title: 'Amount', dataIndex: 'amount', key: 'amount', width: 130, align: 'right',
      sorter: (a, b) => (Number(a.amount) || 0) - (Number(b.amount) || 0),
      render: v => <span style={{ fontWeight: 600 }}>{cSym} {Number(v || 0).toFixed(2)}</span>,
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 135,
      render: (s, r) => <StatusPill status={s} type={r.type} />,
    },
  ];

  const SpaceAvatar = ({ customer }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Avatar size={26} style={{ background: '#e6f7ff', color: '#1890ff', fontWeight: 600, fontSize: 12, flexShrink: 0 }}>
        {(customer || '?').charAt(0).toUpperCase()}
      </Avatar>
      <span style={{ fontWeight: 500 }}>{customer || '-'}</span>
    </div>
  );

  const statStyle = { borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', border: '1px solid #f0f0f0' };
  const fmtC = (v) => `${cSym} ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const stats = [
    { label: 'Quotes', value: fmtC(summary.quotesAmount), icon: <FileTextOutlined />, grad: 'linear-gradient(135deg,#1890ff,#69c0ff)', color: '#1890ff' },
    { label: 'Invoices', value: fmtC(summary.invoicesAmount), icon: <RiseOutlined />, grad: 'linear-gradient(135deg,#722ed1,#b37feb)', color: '#722ed1' },
    { label: 'Payments Received', value: fmtC(summary.paymentsAmount), icon: <BankOutlined />, grad: 'linear-gradient(135deg,#52c41a,#95de64)', color: '#52c41a' },
    { label: 'Credit Notes', value: fmtC(summary.creditNotesAmount), icon: <GiftOutlined />, grad: 'linear-gradient(135deg,#fa8c16,#ffc53d)', color: '#fa8c16' },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Sales Register</Title>
          <Text type="secondary">Chronological audit trail of all sales documents — quotes, invoices, payments, credit notes and recurring</Text>
        </div>
      </div>

      {/* Stat cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {stats.map(s => (
          <Col xs={24} sm={12} lg={6} key={s.label}>
            <Card size="small" style={statStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: s.grad, color: '#fff', fontSize: 20, flexShrink: 0 }}>
                  {s.icon}
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{s.label}</Text>
                  <Text strong style={{ fontSize: 18 }}>{s.value}</Text>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Table card */}
      <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: 16, borderBottom: '1px solid #f0f0f0' }}>
          <Input
            placeholder="Search by no., customer, memo..."
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            allowClear
            style={{ width: 240, borderRadius: 8 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onPressEnter={handleSearch}
            onClear={() => { setSearch(''); const { df, dt } = getDateParams(); load(1, pagination.pageSize, '', typeFilter, df, dt); }}
          />
          <Select
            allowClear
            placeholder="Filter by type"
            style={{ width: 150, borderRadius: 8 }}
            value={typeFilter || undefined}
            onChange={handleTypeChange}
          >
            {Object.keys(TYPE_META).map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
          </Select>
          <DatePicker.RangePicker
            value={dateRange}
            onChange={handleDateRangeChange}
            placeholder={['From', 'To']}
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
            <ScheduleOutlined /> {pagination.total} transaction{pagination.total === 1 ? '' : 's'}
          </span>
        </div>
        <Table
          dataSource={rows}
          columns={columns}
          rowKey={(r) => `${r.source_type}-${r.source_id}`}
          loading={loading}
          size="middle"
          onRow={(record) => ({ onClick: () => openSource(record), style: { cursor: 'pointer' } })}
          pagination={{ ...pagination, showSizeChanger: true, pageSizeOptions: ['25', '50', '100'], showTotal: t => `${t} transactions`, style: { margin: 16 } }}
          onChange={handleTableChange}
          rowClassName={() => 'sr-row'}
        />
      </Card>

      {/* ═══ QUICK VIEW MODAL ═════════════════════════════════════════════ */}
      <Modal
        title={sourceRecord ? (
          <span>
            <Tag color={(TYPE_META[sourceRecord.type] || {}).color || 'blue'} style={{ borderRadius: 4 }}>{sourceDetail?.label || sourceRecord.type || 'Transaction'}</Tag>
            <span style={{ fontWeight: 600 }}>{sourceDetail?.number ? `${sourceDetail.number} ` : ''}</span>
            <Text type="secondary" style={{ fontSize: 13 }}>quick view</Text>
          </span>
        ) : 'Quick View'}
        visible={!!sourceRecord}
        onCancel={() => { setSourceRecord(null); setSourceDetail(null); }}
        footer={[
          <Button key="close" onClick={() => { setSourceRecord(null); setSourceDetail(null); }} style={{ borderRadius: 6 }}>Close</Button>,
          sourceRecord && SOURCE_ROUTES[sourceRecord.source_type]
            ? <Button key="open" type="primary" icon={<FileTextOutlined />} style={{ borderRadius: 6 }} onClick={() => openOriginal(sourceRecord)}>Open Original</Button>
            : null,
        ]}
        width={820}
        bodyStyle={{ maxHeight: '70vh', overflowY: 'auto' }}
        destroyOnClose
      >
        {sourceLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin tip="Loading transaction..." /></div>
        ) : sourceDetail ? (
          <div>
            <Row gutter={[16, 8]} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Text type="secondary" style={{ fontSize: 11 }}>{sourceDetail.partyLabel || 'Party'}</Text>
                {sourceDetail.partyType && sourceDetail.partyId ? (
                  <div style={{ fontWeight: 600 }}>
                    <a style={{ cursor: 'pointer', color: '#1890ff' }}
                      onClick={() => history.push(sourceDetail.partyType === 'customer'
                        ? `/main/customers/details/${sourceDetail.partyId}`
                        : `/main/vendors/details/${sourceDetail.partyId}`)}
                      title={`Open ${sourceDetail.partyLabel || 'party'} profile`}>
                      {sourceDetail.party || '—'}
                    </a>
                  </div>
                ) : <div style={{ fontWeight: 600 }}>{sourceDetail.party || '—'}</div>}
              </Col>
              <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Date</Text><div style={{ fontWeight: 600 }}>{sourceDetail.date ? moment(sourceDetail.date).format('MM/DD/YYYY') : '—'}</div></Col>
              <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Status</Text><div><StatusPill status={sourceDetail.status} type={sourceRecord?.type} /></div></Col>
              <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Total</Text><div style={{ fontWeight: 700, color: Number(sourceDetail.total || 0) < 0 ? '#f5222d' : '#1890ff', fontSize: 15 }}>{cSym} {fmtNum(sourceDetail.total)}</div></Col>
            </Row>
            {sourceDetail.memo ? (
              <Alert type="info" showIcon style={{ marginBottom: 12, borderRadius: 8 }}
                message={<span><Text strong>Memo / Notes: </Text>{sourceDetail.memo}</span>} />
            ) : null}
            <Table
              columns={[
                { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
                { title: 'Account', dataIndex: 'account', key: 'account', width: 180, ellipsis: true, render: v => v ? <Text>{v}</Text> : <Text type="secondary">-</Text> },
                { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 60, align: 'right', render: v => (v != null && v !== '' && Number(v) !== 1) ? Number(v) : <Text type="secondary">1</Text> },
                { title: 'Rate', dataIndex: 'rate', key: 'rate', width: 110, align: 'right', render: v => `${cSym} ${fmtNum(v)}` },
                { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'right', render: v => <Text strong>{cSym} {fmtNum(v)}</Text> },
              ]}
              dataSource={(sourceDetail.lines || []).map((l, i) => ({ ...l, key: i }))}
              size="small" pagination={false} bordered
              summary={() => (
                <Table.Summary.Row style={{ background: '#fafafa' }}>
                  <Table.Summary.Cell colSpan={4}><Text strong>Total</Text></Table.Summary.Cell>
                  <Table.Summary.Cell align="right"><Text strong style={{ color: Number(sourceDetail.total || 0) < 0 ? '#f5222d' : '#1890ff' }}>{cSym} {fmtNum(sourceDetail.total)}</Text></Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </div>
        ) : (
          <Alert type="warning" showIcon message="Could not load the transaction details." />
        )}
      </Modal>

      <style>{`
        .sr-row:hover > td { background: #f0f7ff !important; }
        .ant-table-tbody > tr > td { border-color: #f5f5f5 !important; }
      `}</style>
    </div>
  );
};

export default SalesRegister;
