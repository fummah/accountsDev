import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Input, Card, Space, Tag, Select, message, Popconfirm, Row, Col, Statistic } from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined, EyeOutlined, SwapOutlined } from '@ant-design/icons';
import { Link, useHistory } from 'react-router-dom';
import moment from 'moment';

const statusColors = { Open: 'blue', Accepted: 'green', Declined: 'red', Expired: 'default', Converted: 'purple', Draft: 'default' };

const QuoteList = () => {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 25, total: 0 });
  const history = useHistory();

  const load = useCallback(async (page, pageSize, searchTerm, status) => {
    setLoading(true);
    try {
      const res = await window.electronAPI.getQuotesPaginated?.(page || 1, pageSize || 25, searchTerm || '', status || '');
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

  useEffect(() => { load(1, pagination.pageSize, search, statusFilter); }, []);

  const handleTableChange = (pag) => load(pag.current, pag.pageSize, search, statusFilter);
  const handleSearch = () => load(1, pagination.pageSize, search, statusFilter);
  const handleStatusChange = (v) => { setStatusFilter(v || ''); load(1, pagination.pageSize, search, v || ''); };

  const handleDelete = async (id) => {
    try {
      await window.electronAPI.deleteRecord?.(id, 'quotes');
      message.success('Quote deleted');
      load(pagination.current, pagination.pageSize, search, statusFilter);
    } catch { message.error('Delete failed'); }
  };

  const handleConvert = async (id) => {
    try {
      await window.electronAPI.convertToInvoice?.(id);
      message.success('Quote converted to invoice');
      load(pagination.current, pagination.pageSize, search, statusFilter);
    } catch { message.error('Conversion failed'); }
  };

  const totalAmount = quotes.reduce((s, q) => s + (Number(q.amount) || 0), 0);
  const openCount = quotes.filter(q => q.status === 'Open').length;
  const acceptedCount = quotes.filter(q => q.status === 'Accepted').length;

  const columns = [
    { title: 'Quote #', dataIndex: 'number', key: 'number', width: 100,
      sorter: (a, b) => String(a.number || '').localeCompare(String(b.number || '')),
      render: (t, r) => <Link to={`/main/customers/quotes/edit/${r.id}`} style={{ fontWeight: 500 }}>{t || `QT-${r.id}`}</Link> },
    { title: 'Customer', dataIndex: 'customer_name', key: 'customer',
      sorter: (a, b) => (a.customer_name || '').localeCompare(b.customer_name || ''),
      render: (t, r) => t || r.customer || '-' },
    { title: 'Date', dataIndex: 'start_date', key: 'date', width: 100,
      render: d => d ? moment(d).format('DD/MM/YYYY') : '-' },
    { title: 'Expiry', dataIndex: 'last_date', key: 'expiry', width: 100,
      render: (d, r) => {
        const expired = r.status === 'Open' && d && moment(d).isBefore(moment());
        return <span style={{ color: expired ? '#f5222d' : undefined }}>{d ? moment(d).format('DD/MM/YYYY') : '-'}</span>;
      }},
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 110,
      sorter: (a, b) => (Number(a.amount) || 0) - (Number(b.amount) || 0),
      render: v => <span style={{ fontWeight: 500 }}>R {Number(v || 0).toFixed(2)}</span> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      filters: Object.keys(statusColors).map(s => ({ text: s, value: s })),
      onFilter: (v, r) => r.status === v,
      render: s => <Tag color={statusColors[s] || 'default'}>{s || 'Draft'}</Tag> },
    { title: 'Actions', key: 'actions', width: 170,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => history.push(`/main/customers/quotes/edit/${r.id}`)} />
          {(r.status === 'Open' || r.status === 'Accepted') &&
            <Popconfirm title="Convert to invoice?" onConfirm={() => handleConvert(r.id)}>
              <Button size="small" type="primary" ghost icon={<SwapOutlined />} title="Convert to Invoice" />
            </Popconfirm>}
          <Popconfirm title="Delete this quote?" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )},
  ];

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}><Card size="small"><Statistic title="Total Quoted" value={totalAmount.toFixed(2)} prefix="R" /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="Open" value={openCount} valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="Accepted" value={acceptedCount} valueStyle={{ color: '#52c41a' }} /></Card></Col>
      </Row>

      <Card
        title={<span style={{ fontSize: 18, fontWeight: 600 }}>Quotes / Estimates</span>}
        extra={
          <Space>
            <Input.Search placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              onSearch={handleSearch} style={{ width: 200 }} allowClear />
            <Select placeholder="Status" allowClear style={{ width: 120 }} value={statusFilter || undefined} onChange={handleStatusChange}>
              {Object.keys(statusColors).map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}
            </Select>
            <Button icon={<ReloadOutlined />} onClick={() => load(1, pagination.pageSize, search, statusFilter)} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => history.push('/main/customers/quotes/new')}>
              New Quote
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={quotes}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ ...pagination, showSizeChanger: true, pageSizeOptions: ['25', '50', '100'], showTotal: t => `${t} quotes` }}
          onChange={handleTableChange}
        />
      </Card>
    </div>
  );
};

export default QuoteList;
